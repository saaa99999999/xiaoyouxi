import { Logger } from '../utils/Logger';

/**
 * 应用前后台生命周期管理器
 *
 * 当应用进入后台时:
 * - 暂停所有游戏计时器
 * - 停止 Canvas 渲染循环
 * - 暂停音效和振动
 * - 保存当前游戏状态到本地 KVStore
 *
 * 当应用回到前台时:
 * - 恢复游戏状态 (如果是游戏中)
 * - 检查分布式连接是否仍然有效
 * - 恢复渲染循环
 */
export class LifecycleManager {
  private static instance: LifecycleManager;
  private foregroundCallbacks: Array<() => void> = [];
  private backgroundCallbacks: Array<() => void> = [];
  private isForeground: boolean = true;
  private lastBackgroundTime: number = 0;
  private maxBackgroundDurationMs: number = 300_000; // 5 minutes

  static getInstance(): LifecycleManager {
    if (!LifecycleManager.instance) {
      LifecycleManager.instance = new LifecycleManager();
    }
    return LifecycleManager.instance;
  }

  onForeground(callback: () => void): void {
    this.foregroundCallbacks.push(callback);
  }

  onBackground(callback: () => void): void {
    this.backgroundCallbacks.push(callback);
  }

  handleLifecycleChange(data: { isForeground: boolean }): void {
    if (data.isForeground && !this.isForeground) {
      this.isForeground = true;
      const bgDuration = Date.now() - this.lastBackgroundTime;

      if (bgDuration > this.maxBackgroundDurationMs) {
        Logger.info('LifecycleManager', 'Background too long, disconnecting');
      }

      for (const cb of this.foregroundCallbacks) {
        try { cb(); } catch (err) { Logger.error('LifecycleManager', 'Foreground callback error', err); }
      }
      Logger.info('LifecycleManager', `→ Foreground (background was ${bgDuration}ms)`);
    } else if (!data.isForeground && this.isForeground) {
      this.isForeground = false;
      this.lastBackgroundTime = Date.now();
      for (const cb of this.backgroundCallbacks) {
        try { cb(); } catch (err) { Logger.error('LifecycleManager', 'Background callback error', err); }
      }
      Logger.info('LifecycleManager', '→ Background');
    }
  }

  isInForeground(): boolean {
    return this.isForeground;
  }

  setMaxBackgroundDuration(ms: number): void {
    this.maxBackgroundDurationMs = ms;
  }
}
