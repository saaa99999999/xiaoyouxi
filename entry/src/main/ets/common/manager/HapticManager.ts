import vibrator from '@ohos.vibrator';
import { Logger } from '../utils/Logger';

/**
 * 触觉反馈管理器
 *
 * 封装 @ohos.vibrator，提供游戏中的触觉反馈:
 * - 轻触: 短震 10ms，用于按钮点击
 * - 判定反馈: Perfect 双震 / Great 单震 / Miss 长震
 * - 配对成功: 递增震动模式
 * - 倒计时: 每秒轻触
 */
export class HapticManager {
  private static instance: HapticManager;
  private enabled: boolean = true;
  private intensity: number = 1.0;
  private multiBurstIntervalId: number = 0;

  static readonly PATTERNS: Record<string, { type: 'preset' | 'duration', effectId?: string, duration?: number, count?: number }> = {
    tap_light:      { type: 'duration', duration: 10 },
    tap_medium:     { type: 'duration', duration: 20 },
    tap_heavy:      { type: 'duration', duration: 40 },
    tap_perfect:    { type: 'duration', duration: 15, count: 2 },
    tap_great:      { type: 'duration', duration: 25 },
    tap_good:       { type: 'duration', duration: 15 },
    tap_miss:       { type: 'duration', duration: 60 },
    card_flip:      { type: 'duration', duration: 12 },
    card_match:     { type: 'duration', duration: 20, count: 3 },
    card_mismatch:  { type: 'duration', duration: 50 },
    countdown_tick: { type: 'duration', duration: 8 },
    countdown_go:   { type: 'duration', duration: 80 },
    game_win:       { type: 'duration', duration: 100 },
    game_lose:      { type: 'duration', duration: 50 },
    button_click:   { type: 'duration', duration: 8 },
    device_connect: { type: 'duration', duration: 40 },
    slider_change:  { type: 'duration', duration: 5 }
  };

  static getInstance(): HapticManager {
    if (!HapticManager.instance) {
      HapticManager.instance = new HapticManager();
    }
    return HapticManager.instance;
  }

  init(): void {
    this.enabled = true;
    Logger.info('HapticManager', 'Initialized');
  }

  play(patternName: string): void {
    if (!this.enabled) return;
    const pattern = HapticManager.PATTERNS[patternName];
    if (!pattern) {
      Logger.warn('HapticManager', `Unknown pattern: ${patternName}`);
      return;
    }

    try {
      if (pattern.count && pattern.count > 1) {
        this.playMultiBurst(pattern.duration!, pattern.count);
      } else {
        vibrator.startVibration(
          { type: 'time', duration: Math.round((pattern.duration || 10) * this.intensity) },
          { usage: 'alarm' }
        );
      }
    } catch (err) {
      Logger.debug('HapticManager', `Play failed for ${patternName}`);
    }
  }

  private playMultiBurst(durationMs: number, count: number): void {
    let burstCount = 0;
    if (this.multiBurstIntervalId) {
      clearInterval(this.multiBurstIntervalId);
    }
    // 立即触发第一次震动，确保即时反馈
    try {
      vibrator.startVibration(
        { type: 'time', duration: Math.round(durationMs * this.intensity) },
        { usage: 'alarm' }
      );
      burstCount++;
    } catch (_e) { /* ignore */ }

    if (burstCount >= count) return;

    this.multiBurstIntervalId = setInterval(() => {
      try {
        vibrator.startVibration(
          { type: 'time', duration: Math.round(durationMs * this.intensity) },
          { usage: 'alarm' }
        );
        burstCount++;
        if (burstCount >= count) {
          clearInterval(this.multiBurstIntervalId);
          this.multiBurstIntervalId = 0;
        }
      } catch (_e) {
        clearInterval(this.multiBurstIntervalId);
        this.multiBurstIntervalId = 0;
      }
    }, durationMs + 50);
  }

  vibrate(durationMs: number): void {
    if (!this.enabled) return;
    try {
      vibrator.startVibration(
        { type: 'time', duration: durationMs },
        { usage: 'alarm' }
      );
    } catch (_e) {
      // ignore
    }
  }

  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  isEnabled(): boolean { return this.enabled; }

  setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(1, intensity));
  }

  stop(): void {
    if (this.multiBurstIntervalId) {
      clearInterval(this.multiBurstIntervalId);
      this.multiBurstIntervalId = 0;
    }
    try {
      vibrator.stopVibration();
    } catch (_e) {
      // ignore
    }
  }
}
