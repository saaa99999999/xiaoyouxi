import common from '@ohos.app.ability.common';
import media from '@ohos.multimedia.media';
import audio from '@ohos.multimedia.audio';
import { Logger } from '../utils/Logger';

/**
 * 游戏音效管理器
 *
 * 使用 SoundPool 实现低延迟短音效播放。
 * SoundPool 专为急促简短的音效设计（如按钮点击、游戏判定），
 * 比 AVPlayer 延迟更低，支持并发播放。
 */
export class SoundManager {
  private static instance: SoundManager;
  private enabled: boolean = true;
  private sfxVolume: number = 0.7;
  private bgmVolume: number = 0.3;
  private appContext: common.Context | null = null;
  private soundPool: media.SoundPool | null = null;
  private soundIds: Map<string, number> = new Map();
  private loadedIds: Set<number> = new Set();
  private static readonly MAX_STREAMS = 8;

  static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  async init(context: common.Context): Promise<void> {
    this.appContext = context;
    try {
      const audioRendererInfo: audio.AudioRendererInfo = {
        usage: audio.StreamUsage.STREAM_USAGE_MUSIC,
        rendererFlags: 0
      };
      this.soundPool = await media.createSoundPool(SoundManager.MAX_STREAMS, audioRendererInfo);

      this.soundPool.on('loadComplete', (soundId: number) => {
        this.loadedIds.add(soundId);
        Logger.debug('SoundManager', `Sound loaded: ${soundId}`);
      });

      Logger.info('SoundManager', 'Initialized with SoundPool');
    } catch (err) {
      Logger.error('SoundManager', `SoundPool creation failed: ${JSON.stringify(err)}`);
    }
  }

  async preload(soundNames: string[]): Promise<void> {
    if (!this.appContext || !this.soundPool) return;
    for (const name of soundNames) {
      if (this.soundIds.has(name)) continue;
      await this.loadSound(name);
    }
  }

  private async loadSound(soundName: string): Promise<void> {
    if (!this.appContext || !this.soundPool) return;
    const extensions = ['.wav', '.ogg'];
    // Try flat rawfile path first (actual file location)
    for (const ext of extensions) {
      try {
        const rawFd = await this.appContext.resourceManager.getRawFd(`${soundName}${ext}`);
        const soundId = await this.soundPool.load(rawFd.fd, rawFd.offset, rawFd.length);
        this.soundIds.set(soundName, soundId);
        Logger.debug('SoundManager', `Loaded: ${soundName} → id=${soundId}`);
        try {
          await this.appContext.resourceManager.closeRawFd(`${soundName}${ext}`);
        } catch (_e) { /* ignore close error */ }
        return;
      } catch (_e) {
        // try next extension
      }
    }
    // Fallback: try sounds/ subdirectory
    for (const ext of extensions) {
      try {
        const rawFd = await this.appContext.resourceManager.getRawFd(`sounds/${soundName}${ext}`);
        const soundId = await this.soundPool.load(rawFd.fd, rawFd.offset, rawFd.length);
        this.soundIds.set(soundName, soundId);
        Logger.debug('SoundManager', `Loaded (sounds/): ${soundName} → id=${soundId}`);
        try {
          await this.appContext.resourceManager.closeRawFd(`sounds/${soundName}${ext}`);
        } catch (_e) { /* ignore close error */ }
        return;
      } catch (_e) {
        // try next extension
      }
    }
    Logger.warn('SoundManager', `File not found: ${soundName}`);
  }

  async play(soundName: string): Promise<void> {
    if (!this.enabled || !this.soundPool) return;

    // 如果还没加载，先尝试加载
    let soundId = this.soundIds.get(soundName);
    if (soundId === undefined) {
      await this.loadSound(soundName);
      soundId = this.soundIds.get(soundName);
    }
    if (soundId === undefined) return;

    // 未加载完成则跳过，避免阻塞主线程
    // (音效应已预加载，此处为兜底)
    if (!this.loadedIds.has(soundId)) {
      Logger.warn('SoundManager', `Sound not ready: ${soundName}`);
      return;
    }

    try {
      await this.soundPool.play(soundId, {
        loop: 0,
        leftVolume: this.sfxVolume,
        rightVolume: this.sfxVolume,
        priority: 0
      });
    } catch (err) {
      Logger.warn('SoundManager', `Play failed for ${soundName}: ${JSON.stringify(err)}`);
    }
  }

  async playPreloaded(soundName: string): Promise<void> {
    await this.play(soundName);
  }

  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  isEnabled(): boolean { return this.enabled; }
  setSfxVolume(vol: number): void { this.sfxVolume = Math.max(0, Math.min(1, vol)); }
  setBgmVolume(vol: number): void { this.bgmVolume = Math.max(0, Math.min(1, vol)); }
  getSfxVolume(): number { return this.sfxVolume; }
  getBgmVolume(): number { return this.bgmVolume; }

  destroy(): void {
    if (this.soundPool) {
      try {
        this.soundPool.off('loadComplete');
        // Unload all sounds
        for (const soundId of this.loadedIds) {
          try { this.soundPool.unload(soundId); } catch (_e) { /* ignore */ }
        }
        this.soundPool.release();
      } catch (_e) { /* ignore */ }
      this.soundPool = null;
    }
    this.soundIds.clear();
    this.loadedIds.clear();
    this.appContext = null;
  }
}
