import common from '@ohos.app.ability.common';
import abilityAccessCtrl, { Permissions } from '@ohos.abilityAccessCtrl';
import Want from '@ohos.app.ability.Want';
import { Logger } from '../utils/Logger';

/**
 * 全局应用上下文持有者
 *
 * 保存 EntryAbility 的 context，供全局使用。
 * 提供需要 UIAbilityContext 的能力（如 startAbility、requestPermissionsFromUser）。
 */
export class AppContext {
  private static instance: AppContext;
  private context: common.Context | null = null;

  static getInstance(): AppContext {
    if (!AppContext.instance) {
      AppContext.instance = new AppContext();
    }
    return AppContext.instance;
  }

  init(context: common.Context): void {
    this.context = context;
    Logger.info('AppContext', 'Context stored');
  }

  get(): common.Context | null {
    return this.context;
  }

  /** 启动另一个 Ability（如系统设置页面） */
  startAbility(want: Want): void {
    if (!this.context) {
      throw new Error('AppContext not initialized');
    }
    const abilityCtx = this.context as unknown as { startAbility(want: Want): void };
    abilityCtx.startAbility(want);
  }

  /**
   * 请求动态权限（如 DISTRIBUTED_DATASYNC）
   * 点击对话框"授权"按钮时调用此方法，弹出系统授权对话框
   * @returns true=已授权, false=拒绝或失败
   */
  async requestPermission(permission: Permissions): Promise<boolean> {
    if (!this.context) {
      Logger.error('AppContext', 'requestPermission: context not initialized');
      return false;
    }
    try {
      const atManager = abilityAccessCtrl.createAtManager();

      // 先检查是否已授权
      const grantStatus = atManager.verifyAccessTokenSync(
        this.context.applicationInfo.accessTokenId,
        permission
      );
      if (grantStatus === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED) {
        Logger.info('AppContext', 'Permission already granted');
        return true;
      }

      // 弹出系统授权对话框
      Logger.info('AppContext', `Requesting permission: ${permission}`);
      const result = await atManager.requestPermissionsFromUser(this.context, [permission]);
      const granted = result.authResults[0] === 0;
      Logger.info('AppContext', `Permission result: granted=${granted}, authResults=${JSON.stringify(result.authResults)}`);
      return granted;
    } catch (err) {
      Logger.error('AppContext', 'requestPermission failed', err);
      return false;
    }
  }
}
