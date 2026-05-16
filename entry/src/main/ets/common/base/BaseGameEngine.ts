import {
  BaseGameState, GameConfig, GameInput, GameResult,
  SyncPacket, GameError, ErrorCode, GameType, DeviceRole
} from '../types/GameTypes';
import { Logger } from '../utils/Logger';

/**
 * 所有游戏引擎的抽象基类
 * 纯 TypeScript 逻辑，不依赖 HarmonyOS API
 * 可在 Node.js 环境进行单元测试
 */
export abstract class BaseGameEngine<TState extends BaseGameState> {
  protected state: TState;

  // 回调函数 — 由 GamePage 注入
  private stateChangeCallback?: (state: TState) => void;
  private syncSendCallback?: (packet: SyncPacket) => void;
  private errorCallback?: (error: GameError) => void;

  constructor(initialState: TState) {
    this.state = initialState;
  }

  // ============ 子类必须实现的抽象方法 ============

  /** 初始化游戏，设置配置 */
  abstract init(config: GameConfig): void;

  /** 处理本地玩家输入 */
  abstract handleInput(input: GameInput): void;

  /** 处理来自对方的同步数据 */
  abstract handleSync(packet: SyncPacket): void;

  /** 获取当前双方分数 */
  abstract getScore(): { host: number; guest: number };

  /** 判断游戏是否结束 */
  abstract isGameOver(): boolean;

  /** 获取游戏结果 */
  abstract getResult(): GameResult;

  /** 释放资源 (子类重写以清理计时器等) */
  abstract cleanup(): void;

  // ============ 公共方法 ============

  /** 注入状态变更回调 (由 UI 层调用) */
  setStateChangeCallback(cb: (state: TState) => void): void {
    this.stateChangeCallback = cb;
  }

  /** 注入同步发送回调 (由 SyncManager 层调用) */
  setSyncCallback(cb: (packet: SyncPacket) => void): void {
    this.syncSendCallback = cb;
  }

  /** 注入错误回调 */
  setErrorCallback(cb: (error: GameError) => void): void {
    this.errorCallback = cb;
  }

  /** 获取当前游戏状态 (只读) */
  getState(): TState {
    return this.state;
  }

  // ============ 受保护方法 (子类使用) ============

  /** 更新本地状态并通知 UI — 创建新对象保证引用变化以触发 ArkUI 响应式更新 */
  protected updateState(partial: Partial<TState>): void {
    const keys = Object.keys(partial) as string[];
    const newState: Record<string, Object> = {};
    // 复制现有状态
    const existingKeys = Object.keys(this.state as unknown as Record<string, Object>);
    for (const key of existingKeys) {
      newState[key] = (this.state as unknown as Record<string, Object>)[key];
    }
    // 应用部分更新
    for (const key of keys) {
      newState[key] = partial[key] as Object;
    }
    this.state = newState as unknown as TState;
    if (this.stateChangeCallback) {
      this.stateChangeCallback(this.state);
    }
  }

  /** 发送同步数据到对方设备 */
  private outgoingSeq: number = 0;

  protected sendSync(type: string, payload: Record<string, number | string | boolean | Object | undefined>): void {
    if (this.syncSendCallback) {
      const now = Date.now();
      this.syncSendCallback({
        type,
        from: this.state.myRole,
        payload,
        seq: ++this.outgoingSeq,
        timestamp: now
      });
    }
  }

  /** 报告错误 */
  protected reportError(code: ErrorCode, message: string, recoverable: boolean = true): void {
    if (this.errorCallback) {
      this.errorCallback({ code, message, recoverable });
    }
  }

  // ============ 防重放攻击 (Anti-Replay) ============

  /** 每个设备的最后接收序列号 (deviceId → lastSeq) */
  private receivedSeqs: Record<string, number> = {};

  /** 检查是否是重放包 (seq <= 已接收的最大 seq) */
  protected isReplay(packet: SyncPacket): boolean {
    const lastSeq: number = this.receivedSeqs[packet.from] ?? -1;
    if (packet.seq <= lastSeq) {
      Logger.warn('BaseGameEngine', `Replay detected: from=${packet.from}, seq=${packet.seq}, lastSeq=${lastSeq}`);
      return true;
    }
    this.receivedSeqs[packet.from] = packet.seq;
    return false;
  }

  /** 清除防重放缓存 (游戏重启时调用) */
  protected clearReplayCache(): void {
    this.receivedSeqs = {};
  }
}
