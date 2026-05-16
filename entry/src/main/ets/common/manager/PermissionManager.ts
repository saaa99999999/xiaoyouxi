import abilityAccessCtrl, { Permissions } from '@ohos.abilityAccessCtrl';
import common from '@ohos.app.ability.common';
import { Logger } from '../utils/Logger';

/**
 * 权限管理器
 *
 * OpenHarmony NEXT 的分布式功能需要动态申请 user_granted 级别权限。
 *
 * 重要: requestPermissionsFromUser 必须使用 UIAbilityContext（不是组件 Context），
 * 否则系统授权对话框不会弹出。应通过 AppContext.getInstance().get() 获取。
 */
export class PermissionManager {
  private static instance: PermissionManager;

  static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  async requestDistributedPermission(context: common.Context): Promise<boolean> {
    const atManager = abilityAccessCtrl.createAtManager();
    const permission: Permissions = 'ohos.permission.DISTRIBUTED_DATASYNC';

    try {
      // 先检查是否已授权
      const grantStatus: abilityAccessCtrl.GrantStatus = atManager.verifyAccessTokenSync(
        context.applicationInfo.accessTokenId,
        permission
      );

      if (grantStatus === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED) {
        Logger.info('PermissionManager', 'Permission already granted');
        return true;
      }

      // 弹出系统授权对话框
      Logger.info('PermissionManager', 'Requesting DISTRIBUTED_DATASYNC permission...');
      const result = await atManager.requestPermissionsFromUser(context, [permission]);
      const granted: boolean = result.authResults[0] === 0;
      Logger.info('PermissionManager', `Request result: granted=${granted}, authResults=${JSON.stringify(result.authResults)}`);
      return granted;
    } catch (err) {
      Logger.error('PermissionManager', 'Permission request failed', err);
      return false;
    }
  }

  checkPermission(context: common.Context, permission: Permissions): boolean {
    try {
      const atManager = abilityAccessCtrl.createAtManager();
      const grantStatus: abilityAccessCtrl.GrantStatus = atManager.verifyAccessTokenSync(
        context.applicationInfo.accessTokenId,
        permission
      );
      return grantStatus === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED;
    } catch (err) {
      Logger.error('PermissionManager', 'checkPermission failed', err);
      return false;
    }
  }
}
