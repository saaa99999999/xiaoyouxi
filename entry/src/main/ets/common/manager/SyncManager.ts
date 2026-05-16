import common from '@ohos.app.ability.common';
import distributedDataObject from '@ohos.data.distributedDataObject';
import { LocalSyncManager } from './LocalSyncManager';
import { Logger } from '../utils/Logger';

/**
 * 分布式数据同步管理器
 *
 * 封装 @ohos.data.distributedDataObject，提供:
 * - 游戏会话的创建和销毁
 * - 键值对的读写 (自动序列化/反序列化)
 * - 数据变更监听
 * - 连接状态监听
 * - 环形缓冲区队列 (32槽位，防覆盖)
 */
export class SyncManager {
  private static instance: SyncManager;
  private dataObject: distributedDataObject.DataObject | null = null;
  private localDataObject: LocalSyncManager | null = null;
  private isLocalMode: boolean = false;
  private sessionId: string = '';
  private isActive: boolean = false;
  private seqCounter: number = 0;
  private appContext: common.Context | null = null;
  private dataChangeListeners: Record<string, Array<(key: string, value: Object) => void>> = {};
  private statusChangeListeners: Array<(status: string) => void> = [];

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  init(context: common.Context): void {
    this.appContext = context;
    Logger.info('SyncManager', 'Initialized with context');
  }

  /**
   * 创建本地会话（模拟器/单设备对战）
   * 使用 LocalSyncManager 替代分布式数据对象
   */
  createLocalSession(sessionId: string): void {
    if (this.isActive) {
      this.destroySession();
    }
    this.isLocalMode = true;
    this.localDataObject = new LocalSyncManager();
    this.localDataObject.setSessionId(sessionId);
    this.sessionId = sessionId;
    this.seqCounter = 0;

    // 注册变更和状态监听，转发到 SyncManager 的监听器
    this.localDataObject.onStatusChange((status: string) => {
      Logger.info('SyncManager', `[Local] Status: ${status}`);
      for (const cb of this.statusChangeListeners) {
        cb(status);
      }
    });

    this.isActive = true;
    Logger.info('SyncManager', `Local session created: ${sessionId}`);
  }

  createSession(sessionId: string, initialState: Record<string, number | string | boolean | Object | undefined>): void {
    // Bug fix: 先销毁旧会话，防止泄漏
    if (this.isActive) {
      this.destroySession();
    }

    this.sessionId = sessionId;
    this.seqCounter = 0;

    try {
      if (!this.appContext) {
        throw new Error('[SyncManager] Not initialized: call init(context) first');
      }
      // OpenHarmony API: create(context, data) — 2 arguments, sessionId is passed via setSessionId
      this.dataObject = distributedDataObject.create(
        this.appContext,
        initialState
      );

      this.dataObject.setSessionId(sessionId);

      this.dataObject.on('change', (sessionId: string, fields: string[]) => {
        Logger.info('SyncManager', `Data changed: fields=${fields.join(',')}`);
        for (const field of fields) {
          const value = (this.dataObject as unknown as Record<string, Object>)[field];
          const listeners = this.dataChangeListeners[field];
          if (listeners) {
            for (const cb of listeners) {
              cb(field, value);
            }
          }
        }
      });

      this.dataObject.on('status', (sessionId: string, networkId: string, status: string) => {
        Logger.info('SyncManager', `Status: ${status}, networkId: ${networkId}`);
        for (const cb of this.statusChangeListeners) {
          cb(status);
        }
      });

      this.isActive = true;
      Logger.info('SyncManager', `Session created: ${sessionId}`);
    } catch (err) {
      Logger.error('SyncManager', 'Failed to create session', err);
      this.isActive = false;
      throw err;
    }
  }

  set(key: string, value: Object): void {
    if (this.isLocalMode && this.localDataObject) {
      this.localDataObject.set(key, value);
      // 本地模式下，通知同 key 的监听器（包括通过 onDataChange 注册的）
      const listeners = this.dataChangeListeners[key];
      if (listeners) {
        for (const cb of listeners) {
          cb(key, value);
        }
      }
      return;
    }
    if (!this.dataObject || !this.isActive) {
      Logger.error('SyncManager', 'Cannot set: session not active');
      return;
    }
    try {
      (this.dataObject as unknown as Record<string, Object>)[key] = value;
    } catch (err) {
      Logger.error('SyncManager', 'Set failed', err);
    }
  }

  private static readonly QUEUE_SLOTS = 32;
  private queueCounters: Record<string, number> = {};

  push(keyPrefix: string, value: Object): void {
    if (this.isLocalMode && this.localDataObject) {
      const counter = (this.queueCounters[keyPrefix] || 0) + 1;
      this.queueCounters[keyPrefix] = counter;
      const slotKey = `${keyPrefix}_${counter % SyncManager.QUEUE_SLOTS}`;
      const source = value as Record<string, Object>;
      const merged: Record<string, number | string | boolean | Object | undefined> = {};
      const srcKeys = Object.keys(source);
      for (const k of srcKeys) {
        merged[k] = source[k];
      }
      merged['_slotSeq'] = counter;
      this.localDataObject.set(slotKey, merged as Object);
      // 通知对端 + 自身的监听器
      const listeners = this.dataChangeListeners[slotKey];
      if (listeners) {
        for (const cb of listeners) {
          cb(slotKey, merged as Object);
        }
      }
      return;
    }
    if (!this.dataObject || !this.isActive) return;
    const counter = (this.queueCounters[keyPrefix] || 0) + 1;
    this.queueCounters[keyPrefix] = counter;
    const slotKey = `${keyPrefix}_${counter % SyncManager.QUEUE_SLOTS}`;
    try {
      const source = value as Record<string, Object>;
      const merged: Record<string, number | string | boolean | Object | undefined> = {};
      const srcKeys = Object.keys(source);
      for (const k of srcKeys) {
        merged[k] = source[k];
      }
      merged['_slotSeq'] = counter;
      (this.dataObject as unknown as Record<string, Object>)[slotKey] = merged as Object;
    } catch (err) {
      Logger.error('SyncManager', 'Push failed', err);
    }
  }

  getLatest<T extends Object>(keyPrefix: string): T | null {
    // 本地模式支持
    if (this.isLocalMode && this.localDataObject) {
      try {
        let bestSlot: T | null = null;
        let bestSeq = 0;
        for (let i = 0; i < SyncManager.QUEUE_SLOTS; i++) {
          const slotKey = `${keyPrefix}_${i}`;
          const slot = this.localDataObject.get<Record<string, Object>>(slotKey);
          if (slot && typeof slot === 'object') {
            const seq = (slot as Record<string, number>)['_slotSeq'] as number;
            if (seq !== undefined && seq > bestSeq) {
              bestSeq = seq;
              bestSlot = slot as unknown as T;
            }
          }
        }
        if (bestSeq > 0) {
          this.queueCounters[keyPrefix] = bestSeq;
        }
        return bestSlot;
      } catch (_e) {
        return null;
      }
    }
    if (!this.dataObject || !this.isActive) return null;
    try {
      // Bug fix: 扫描所有槽位找到最高 _slotSeq，兼容远程推送
      let bestSlot: T | null = null;
      let bestSeq = 0;
      for (let i = 0; i < SyncManager.QUEUE_SLOTS; i++) {
        const slotKey = `${keyPrefix}_${i}`;
        const slot = (this.dataObject as unknown as Record<string, Object>)[slotKey];
        if (slot && typeof slot === 'object') {
          const seq = (slot as Record<string, number | string | boolean | Object | undefined>)['_slotSeq'] as number;
          if (seq !== undefined && seq > bestSeq) {
            bestSeq = seq;
            bestSlot = slot as T;
          }
        }
      }
      // 更新本地计数器
      if (bestSeq > 0) {
        this.queueCounters[keyPrefix] = bestSeq;
      }
      return bestSlot;
    } catch (_e) {
      return null;
    }
  }

  onDataChangePrefix(keyPrefix: string, callback: (key: string, value: Object) => void): void {
    for (let i = 0; i < SyncManager.QUEUE_SLOTS; i++) {
      this.onDataChange(`${keyPrefix}_${i}`, callback);
    }
  }

  offDataChangePrefix(keyPrefix: string): void {
    for (let i = 0; i < SyncManager.QUEUE_SLOTS; i++) {
      this.offDataChange(`${keyPrefix}_${i}`);
    }
  }

  get<T extends Object>(key: string): T | null {
    if (this.isLocalMode && this.localDataObject) {
      return this.localDataObject.get<T>(key);
    }
    if (!this.dataObject || !this.isActive) return null;
    try {
      return (this.dataObject as unknown as Record<string, Object>)[key] as T;
    } catch (err) {
      Logger.error('SyncManager', 'Get failed', err);
      return null;
    }
  }

  onDataChange(key: string, callback: (key: string, value: Object) => void): void {
    if (!this.dataChangeListeners[key]) {
      this.dataChangeListeners[key] = [];
    }
    this.dataChangeListeners[key].push(callback);
  }

  offDataChange(key: string): void {
    delete this.dataChangeListeners[key];
  }

  emitLocalChangeForTest(key: string, value: Object): void {
    const listeners = this.dataChangeListeners[key];
    if (listeners) {
      for (const cb of listeners) {
        cb(key, value);
      }
    }
  }

  onStatusChange(callback: (status: string) => void): void {
    this.statusChangeListeners.push(callback);
    if (this.isLocalMode && this.localDataObject) {
      this.localDataObject.onStatusChange(callback);
    }
  }

  offStatusChange(): void {
    this.statusChangeListeners = [];
    if (this.isLocalMode && this.localDataObject) {
      this.localDataObject.offStatusChange();
    }
  }

  notifyStatusForTest(status: string): void {
    for (const cb of this.statusChangeListeners) {
      cb(status);
    }
  }

  getNextSeq(): number {
    return ++this.seqCounter;
  }

  destroySession(): void {
    if (this.isLocalMode && this.localDataObject) {
      this.localDataObject.destroySession();
      this.localDataObject = null;
      this.isLocalMode = false;
    } else if (this.dataObject) {
      try {
        this.dataObject.off('change');
        this.dataObject.off('status');
      } catch (_e) {
        // off 可能抛异常（如未注册），忽略
      }
      this.dataObject.setSessionId('');
    }
    this.dataObject = null;
    this.sessionId = '';
    this.seqCounter = 0;
    this.queueCounters = {};
    this.isActive = false;
    this.dataChangeListeners = {};
    this.statusChangeListeners = [];
    Logger.info('SyncManager', 'Session destroyed');
  }

  isSessionActive(): boolean {
    return this.isActive;
  }

  getSessionId(): string {
    return this.sessionId;
  }
}
