import UIAbility from '@ohos.app.ability.UIAbility';
import Want from '@ohos.app.ability.Want';
import AbilityConstant from '@ohos.app.ability.AbilityConstant';
import window from '@ohos.window';
import { DeviceManager } from '../common/manager/DeviceManager';
import { SyncManager } from '../common/manager/SyncManager';
import { SoundManager } from '../common/manager/SoundManager';
import { ThemeManager } from '../common/manager/ThemeManager';
import { StorageManager } from '../common/manager/StorageManager';
import { AchievementManager } from '../common/manager/AchievementManager';
import { LifecycleManager } from '../common/manager/LifecycleManager';
import { AppContext } from '../common/manager/AppContext';
import { Logger } from '../common/utils/Logger';
import { ScreenUtils } from '../common/utils/ScreenUtils';

export default class EntryAbility extends UIAbility {

  async onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): Promise<void> {
    // Release 构建时关闭 DEBUG/INFO 日志 (debug=false 在 app.json5)
    // 开发调试时可在 onCreate 开头临时注释此行
    Logger.setReleaseMode(true);

    // 保存 UIAbilityContext 供全局使用（权限请求等需要此 context）
    AppContext.getInstance().init(this.context);

    // Initialize screen adaptation (must be first — other UI depends on scale factors)
    await ScreenUtils.getInstance().init();

    // Initialize core managers (global singletons)
    await DeviceManager.getInstance().init(this.context);
    SyncManager.getInstance().init(this.context);
    const colorMode = AppStorage.get<number>('systemColorMode') || 0;
    AppStorage.setOrCreate('systemColorMode', colorMode);
    ThemeManager.getInstance().init(this.context);

    // Async initialization (SDK-dependent)
    await SoundManager.getInstance().init(this.context);
    SoundManager.getInstance().preload([
      'tap_perfect', 'tap_great', 'tap_good', 'tap_miss',
      'card_flip', 'card_match', 'card_mismatch',
      'countdown_tick', 'countdown_go',
      'game_win', 'game_lose',
      'device_connect', 'device_disconnect',
      'button_click'
    ]);
    await StorageManager.getInstance().init(this.context);
    AchievementManager.getInstance().init();

    // Initialize lifecycle manager
    const lifecycle = LifecycleManager.getInstance();
    lifecycle.onForeground(() => {
      Logger.info('Lifecycle', 'App went foreground');
    });
    lifecycle.onBackground(() => {
      // Pause any active game timers via SessionManager
      Logger.info('Lifecycle', 'App went background');
    });

    // 注意: 权限请求不能在 onCreate 中执行——此时窗口尚未创建，
    // requestPermissionsFromUser 需要前台窗口才能弹出系统授权对话框。
    // 权限请求移到 onWindowStageCreate 中执行。
  }

  onDestroy(): void {
    Logger.info('EntryAbility', 'onDestroy');
    DeviceManager.getInstance().destroy();
    SyncManager.getInstance().destroySession();
    SoundManager.getInstance().destroy();
  }

  onForeground(): void {
    LifecycleManager.getInstance().handleLifecycleChange({ isForeground: true });
  }

  onBackground(): void {
    LifecycleManager.getInstance().handleLifecycleChange({ isForeground: false });
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/SplashPage', (err) => {
      if (err.code) {
        Logger.error('EntryAbility', `Failed to load content: ${JSON.stringify(err)}`);
        return;
      }
      Logger.info('EntryAbility', 'Content loaded');
    });
  }
}
