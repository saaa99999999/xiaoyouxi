import common from '@ohos.app.ability.common';
import { LightTheme, DarkTheme, AppTheme } from '../../constants/UIConstants';
import { Logger } from '../utils/Logger';

/**
 * 主题管理器
 *
 * 管理亮色/暗色主题切换，跟随系统设置或用户手动选择。
 */
export class ThemeManager {
  private static instance: ThemeManager;
  private currentTheme: AppTheme = LightTheme;
  private isDark: boolean = false;
  private listeners: Array<(theme: AppTheme) => void> = [];

  static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  init(context?: common.Context): void {
    try {
      let colorMode = 0;
      // OpenHarmony: common.Context.config does not exist; use AppStorage set by EntryAbility
      colorMode = AppStorage.get<number>('systemColorMode') || 0;
      this.isDark = colorMode === 1;
      this.currentTheme = this.isDark ? DarkTheme : LightTheme;
    } catch (_e) {
      this.isDark = false;
      this.currentTheme = LightTheme;
    }
    Logger.info('ThemeManager', `Initialized: ${this.isDark ? 'dark' : 'light'}`);
  }

  getTheme(): AppTheme {
    return this.currentTheme;
  }

  isDarkMode(): boolean {
    return this.isDark;
  }

  toggle(): void {
    this.isDark = !this.isDark;
    this.currentTheme = this.isDark ? DarkTheme : LightTheme;
    AppStorage.setOrCreate('currentTheme', this.currentTheme);
    for (const cb of this.listeners) {
      cb(this.currentTheme);
    }
    Logger.info('ThemeManager', `Switched to ${this.isDark ? 'dark' : 'light'}`);
  }

  setDarkMode(dark: boolean): void {
    if (this.isDark === dark) return;
    this.toggle();
  }

  onChange(callback: (theme: AppTheme) => void): void {
    this.listeners.push(callback);
  }
}
