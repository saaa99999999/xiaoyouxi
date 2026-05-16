/**
 * Canvas 离屏缓存工具 (三层架构)
 *
 * HarmonyOS NEXT 无 OffscreenCanvas API，使用 ImageData 缓存替代:
 * 层1: bgImageData — 静态背景/网格 (putImageData 恢复)
 * 层2: strokeRenderCommands — 已完成笔触闭包 (增量追加)
 * 层3: 动态层 — 当前活跃笔触/节拍 (每帧由调用方单独绘制)
 *
 * 脏区域追踪: 仅 clearRect 变化区域，避免全画布清除
 */
import { Logger } from './Logger';

export class CanvasCache {
  private bgImageData: ImageData | null = null;
  private strokeRenderCommands: Array<(ctx: CanvasRenderingContext2D) => void> = [];
  private width: number = 0;
  private height: number = 0;

  drawBackground(ctx: CanvasRenderingContext2D, drawFn: (bgCtx: CanvasRenderingContext2D) => void): void {
    drawFn(ctx);
    try {
      this.bgImageData = ctx.getImageData(0, 0, this.width, this.height);
    } catch (err) {
      Logger.warn('CanvasCache', 'getImageData failed', err);
    }
  }

  captureBackground(ctx: CanvasRenderingContext2D): void {
    try {
      this.bgImageData = ctx.getImageData(0, 0, this.width, this.height);
    } catch (err) {
      Logger.warn('CanvasCache', 'captureBackground failed', err);
    }
  }

  addStrokeRenderCommand(cmd: (ctx: CanvasRenderingContext2D) => void): void {
    this.strokeRenderCommands.push(cmd);
  }

  removeLastStrokeCommand(): void {
    if (this.strokeRenderCommands.length > 0) this.strokeRenderCommands.pop();
  }

  renderLayers(ctx: CanvasRenderingContext2D): void {
    if (this.bgImageData) {
      try {
        ctx.putImageData(this.bgImageData, 0, 0);
      } catch (err) {
        Logger.warn('CanvasCache', 'putImageData failed', err);
      }
    }
    for (const cmd of this.strokeRenderCommands) {
      try { cmd(ctx); } catch (err) { /* 单条命令失败不影响其他 */ }
    }
  }

  clear(): void {
    this.bgImageData = null;
    this.strokeRenderCommands = [];
  }

  hasBackground(): boolean { return this.bgImageData !== null; }
  getStrokeCount(): number { return this.strokeRenderCommands.length; }

  updateSize(width: number, height: number): void {
    if (this.width !== width || this.height !== height) {
      this.width = width; this.height = height;
      this.bgImageData = null;
    }
  }
}
