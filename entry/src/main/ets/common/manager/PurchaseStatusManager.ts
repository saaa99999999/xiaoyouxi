// ============================================================
// 购买状态管理器 — 追踪 IAP 购买流程状态，防重复购买
// ============================================================

export enum PurchaseState {
  IDLE = 'idle',
  PURCHASING = 'purchasing',
  VERIFYING = 'verifying',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface PurchaseRecord {
  productId: string;
  state: PurchaseState;
  startedAt: number;
  completedAt?: number;
  errorMsg?: string;
}

export class PurchaseStatusManager {
  private static instance: PurchaseStatusManager | null = null;
  private currentState: PurchaseState = PurchaseState.IDLE;
  private currentProductId: string = '';
  private history: PurchaseRecord[] = [];
  private stateListeners: Array<(state: PurchaseState, productId: string) => void> = [];

  static getInstance(): PurchaseStatusManager {
    if (!PurchaseStatusManager.instance) {
      PurchaseStatusManager.instance = new PurchaseStatusManager();
    }
    return PurchaseStatusManager.instance;
  }

  setState(state: PurchaseState, productId?: string): void {
    const prev: PurchaseState = this.currentState;
    this.currentState = state;
    if (productId) this.currentProductId = productId;

    if (state === PurchaseState.PURCHASING) {
      this.history.push({ productId: productId || '', state, startedAt: Date.now() });
    } else if (prev === PurchaseState.PURCHASING) {
      const record = this.history[this.history.length - 1];
      if (record) {
        record.state = state;
        record.completedAt = Date.now();
      }
    }

    if (this.history.length > 20) {
      this.history = this.history.slice(-20);
    }

    for (const cb of this.stateListeners) {
      try { cb(state, this.currentProductId); } catch (_e) { /* ignore */ }
    }
  }

  getState(): PurchaseState { return this.currentState; }
  getCurrentProductId(): string { return this.currentProductId; }

  isProcessing(): boolean {
    return this.currentState === PurchaseState.PURCHASING ||
           this.currentState === PurchaseState.VERIFYING;
  }

  getHistory(): PurchaseRecord[] {
    const result: PurchaseRecord[] = [];
    for (const h of this.history) {
      result.push(h);
    }
    return result;
  }

  onStateChange(cb: (state: PurchaseState, productId: string) => void): void {
    if (!this.stateListeners.includes(cb)) this.stateListeners.push(cb);
  }

  offStateChange(cb: (state: PurchaseState, productId: string) => void): void {
    const idx = this.stateListeners.indexOf(cb);
    if (idx >= 0) this.stateListeners.splice(idx, 1);
  }

  reset(): void {
    this.currentState = PurchaseState.IDLE;
    this.currentProductId = '';
  }
}
