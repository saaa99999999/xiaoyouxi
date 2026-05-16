import { Logger } from '../utils/Logger';

/**
 * 本地同步管理器（模拟器/单设备对战用）
 *
 * 替代 distributedDataObject，通过进程内事件总线实现
 * 同一设备上 HOST 和 GUEST 的数据同步。
 *
 * 用法: 两台模拟器各自创建 LocalSyncManager 实例，
 * 通过 setSessionId(sessionId) 加入同一会话，
 * 相同 sessionId 的实例自动互相同步。
 */
export class LocalSyncManager {
  private static instances: Record<string, LocalSyncManager[]> = {};
  private sessionId: string = '';
  private data: Record<string, Object> = {};
  private dataChangeListeners: Record<string, Array<(key: string, value: Object) => void>> = {};
  private statusChangeListeners: Array<(status: string) => void> = [];
  private isActive: boolean = false;

  /**
   * 加入会话 — 相同 sessionId 的实例自动同步
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    if (!LocalSyncManager.instances[sessionId]) {
      LocalSyncManager.instances[sessionId] = [];
    }
    LocalSyncManager.instances[sessionId].push(this);
    this.isActive = true;

    // 通知其他实例: 我上线了
    this.notifyPeers('status', 'online');
    // 通知自己: 对方可能已在线
    for (const cb of this.statusChangeListeners) {
      // 如果对方已存在，立即通知自己 online
      if (LocalSyncManager.instances[sessionId].length > 1) {
        cb('online');
      }
    }

    Logger.info('LocalSyncManager', `Joined session: ${sessionId}, peers=${LocalSyncManager.instances[sessionId].length - 1}`);
  }

  /**
   * 写入数据并通知同会话的其他实例
   */
  set(key: string, value: Object): void {
    this.data[key] = value;
    this.notifyPeers('change', key);
  }

  /**
   * 读取数据
   */
  get<T extends Object>(key: string): T | null {
    return (this.data[key] as T) || null;
  }

  /**
   * 注册数据变更监听
   */
  onDataChange(key: string, callback: (key: string, value: Object) => void): void {
    if (!this.dataChangeListeners[key]) {
      this.dataChangeListeners[key] = [];
    }
    this.dataChangeListeners[key].push(callback);
  }

  /**
   * 移除数据变更监听
   */
  offDataChange(key: string): void {
    delete this.dataChangeListeners[key];
  }

  /**
   * 注册状态变更监听
   */
  onStatusChange(callback: (status: string) => void): void {
    this.statusChangeListeners.push(callback);
  }

  /**
   * 移除状态变更监听
   */
  offStatusChange(): void {
    this.statusChangeListeners = [];
  }

  /**
   * 销毁会话
   */
  destroySession(): void {
    if (this.sessionId && LocalSyncManager.instances[this.sessionId]) {
      const arr = LocalSyncManager.instances[this.sessionId];
      const idx = arr.indexOf(this);
      if (idx >= 0) {
        arr.splice(idx, 1);
      }
      // 通知其他实例: 我下线了
      if (arr.length > 0) {
        for (const peer of arr) {
          for (const cb of peer.statusChangeListeners) {
            cb('offline');
          }
        }
      } else {
        delete LocalSyncManager.instances[this.sessionId];
      }
    }
    this.data = {};
    this.dataChangeListeners = {};
    this.statusChangeListeners = [];
    this.sessionId = '';
    this.isActive = false;
    Logger.info('LocalSyncManager', 'Session destroyed');
  }

  isSessionActive(): boolean {
    return this.isActive;
  }

  // ============ 内部方法 ============

  /**
   * 通知同会话的其他实例
   */
  private notifyPeers(eventType: string, key: string): void {
    if (!this.sessionId) return;
    const peers = LocalSyncManager.instances[this.sessionId];
    if (!peers) return;

    for (const peer of peers) {
      if (peer === this) continue; // 不通知自己

      if (eventType === 'change') {
        // 将本实例的数据同步到对端
        const value = this.data[key];
        peer.data[key] = value;

        // 触发对端的 change 监听
        const listeners = peer.dataChangeListeners[key];
        if (listeners) {
          for (const cb of listeners) {
            cb(key, value);
          }
        }
      }
    }
  }
}
