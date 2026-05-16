import common from '@ohos.app.ability.common';
import distributedKVStore from '@ohos.data.distributedKVStore';
import { GameResult, GameType } from '../types/GameTypes';
import { Logger } from '../utils/Logger';

interface StatsRecord {
  played: number;
  won: number;
  totalSyncRate: number;
  bestSyncRate: number;
}

/**
 * 持久化存储管理器
 *
 * 使用分布式 KVStore 存储:
 * - 游戏历史记录 (最近50局)
 * - 用户偏好设置
 * - 游戏统计数据
 */
export class StorageManager {
  private static instance: StorageManager;
  private kvManager: distributedKVStore.KVManager | null = null;
  private kvStore: distributedKVStore.SingleKVStore | null = null;
  private storeId: string = 'synctap_store';
  private static readonly SCHEMA_VERSION = 1;

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  async init(context: common.Context): Promise<void> {
    try {
      const kvConfig: distributedKVStore.KVManagerConfig = {
        bundleName: context.applicationInfo.name,
        context: context
      };
      this.kvManager = distributedKVStore.createKVManager(kvConfig);
      const options: distributedKVStore.Options = {
        createIfMissing: true,
        encrypt: false,
        backup: false,
        autoSync: true,
        kvStoreType: distributedKVStore.KVStoreType.SINGLE_VERSION,
        securityLevel: distributedKVStore.SecurityLevel.S1
      };
      this.kvStore = await this.kvManager.getKVStore(this.storeId, options) as distributedKVStore.SingleKVStore;
      await this.checkMigration();
      Logger.info('StorageManager', 'Initialized');
    } catch (err) {
      Logger.error('StorageManager', 'Init failed', err);
    }
  }

  private async checkMigration(): Promise<void> {
    if (!this.kvStore) return;
    try {
      const versionValue = await this.kvStore.get('schema_version');
      const versionStr = typeof versionValue === 'string' ? versionValue : '';
      const currentVersion = versionStr ? parseInt(versionStr) : 0;
      if (currentVersion < StorageManager.SCHEMA_VERSION) {
        Logger.info('StorageManager', `Migrating schema from v${currentVersion} to v${StorageManager.SCHEMA_VERSION}`);
        await this.kvStore.put('schema_version', String(StorageManager.SCHEMA_VERSION));
      }
    } catch (_e) {
      // 首次安装时 key 不存在，写入当前版本
      await this.kvStore.put('schema_version', String(StorageManager.SCHEMA_VERSION));
    }
  }

  // 写入队列，防止并发 read-modify-write 丢失数据
  private saveQueue: Promise<void> = Promise.resolve();

  async saveGameResult(result: GameResult): Promise<void> {
    this.saveQueue = this.saveQueue.then(async () => {
      if (!this.kvStore) return;
      const history = await this.getGameHistory();
      history.unshift(result);
      const trimmed = history.slice(0, 50);
      await this.kvStore.put('game_history', JSON.stringify(trimmed));
    }).catch((err) => {
      Logger.error('StorageManager', 'saveQueue item failed', err);
    });
    return this.saveQueue;
  }

  async getGameHistory(): Promise<GameResult[]> {
    if (!this.kvStore) return [];
    try {
      const value = await this.kvStore.get('game_history');
      const json = typeof value === 'string' ? value : '';
      return json ? JSON.parse(json) as GameResult[] : [];
    } catch (_e) {
      return [];
    }
  }

  async savePreference(key: string, value: string | number | boolean): Promise<void> {
    if (!this.kvStore) return;
    await this.kvStore.put(`pref_${key}`, String(value));
  }

  async getPreference(key: string): Promise<string | null> {
    if (!this.kvStore) return null;
    try {
      const value = await this.kvStore.get(`pref_${key}`);
      return typeof value === 'string' ? value : null;
    } catch (_e) {
      return null;
    }
  }

  async updateStats(gameType: GameType, isWin: boolean, syncRate?: number): Promise<void> {
    if (!this.kvStore) return;
    try {
      const value = await this.kvStore.get('stats');
      const json = typeof value === 'string' ? value : '{}';
      const stats: Record<string, StatsRecord> = JSON.parse(json) as Record<string, StatsRecord>;
      const key = gameType as string;
      if (!stats[key]) {
        stats[key] = { played: 0, won: 0, totalSyncRate: 0, bestSyncRate: 0 };
      }
      stats[key].played++;
      if (isWin) stats[key].won++;
      if (syncRate !== undefined) {
        stats[key].totalSyncRate += syncRate;
        stats[key].bestSyncRate = Math.max(stats[key].bestSyncRate, syncRate);
      }
      await this.kvStore.put('stats', JSON.stringify(stats));
    } catch (_e) {
      // ignore
    }
  }
}
