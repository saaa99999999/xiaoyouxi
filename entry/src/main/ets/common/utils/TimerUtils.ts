/**
 * 精准计时工具
 * 封装 setTimeout/setInterval，提供 pause/resume 能力
 */
export class GameTimer {
  private timerId: number | null = null;
  private startTime: number = 0;
  private remaining: number = 0;
  private durationMs: number = 0;
  private onTickCallback: ((remainingSec: number) => void) | null = null;
  private onCompleteCallback: (() => void) | null = null;
  private isPaused: boolean = false;

  /**
   * 启动倒计时
   * @param durationMs 时长 (毫秒)
   * @param onTick 每秒回调 (剩余秒数)
   * @param onComplete 倒计时结束回调
   */
  start(
    durationMs: number,
    onTick: (remainingSec: number) => void,
    onComplete: () => void
  ): void {
    this.remaining = durationMs;
    this.durationMs = durationMs;
    this.onTickCallback = onTick;
    this.onCompleteCallback = onComplete;
    this.startTime = Date.now();
    this.isPaused = false;

    this.timerId = setTimeout(() => this.tick(), 100);
  }

  /** 暂停计时 */
  pause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    this.remaining = Math.max(0, this.durationMs - (Date.now() - this.startTime));
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /** 恢复计时 */
  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.startTime = Date.now() - (this.durationMs - this.remaining);
    this.timerId = setTimeout(() => this.tick(), 100);
  }

  /** tick 循环 (内部) */
  private tick(): void {
    if (this.isPaused) return;
    const elapsed = Date.now() - this.startTime;
    this.remaining = Math.max(0, this.durationMs - elapsed);
    const remainingSec = Math.ceil(this.remaining / 1000);
    if (this.onTickCallback) {
      this.onTickCallback(remainingSec);
    }
    if (this.remaining <= 0) {
      if (this.onCompleteCallback) this.onCompleteCallback();
      return;
    }
    this.timerId = setTimeout(() => this.tick(), 100);
  }

  /** 停止并清理 */
  stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.onTickCallback = null;
    this.onCompleteCallback = null;
  }

  /** 获取剩余毫秒数 */
  getRemaining(): number {
    return this.remaining;
  }
}

/**
 * 延迟执行 (Promise 封装)
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
