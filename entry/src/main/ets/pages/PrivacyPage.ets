import router from '@ohos.router';

@Entry
@Component
struct PrivacyPage {
  build() {
    Column() {
      Row() {
        Button('← 返回')
          .fontSize(14).backgroundColor(Color.Transparent).fontColor('#007DFF')
          .onClick(() => { router.back(); });
        Blank();
        Text('隐私政策').fontSize(18).fontWeight(FontWeight.Bold);
        Blank();
        Row().width(60);
      }
      .width('100%').padding(16);

      Scroll() {
        Column() {
          Text('默契挑战 (SyncTap) 隐私政策')
            .fontSize(20).fontWeight(FontWeight.Bold).margin({ bottom: 16 });

          Text(this.privacyContent)
            .fontSize(13).fontColor('#424242').lineHeight(22);
        }
        .padding(16);
      }
      .layoutWeight(1);
    }
    .width('100%').height('100%').backgroundColor(Color.White);
  }

  private privacyContent: string =
    '更新日期: 2026年5月16日\n\n' +
    '1. 信息收集说明\n' +
    '本应用（默契挑战/SyncTap）仅在两台设备之间传输游戏数据（节拍、笔触坐标、卡牌状态、词语信息）。\n' +
    '- 不会收集、存储或上传您的个人信息至任何服务器\n' +
    '- 不收集位置信息\n' +
    '- 不使用相机或麦克风\n' +
    '- 设备型号和系统版本仅用于兼容性适配\n\n' +
    '2. 权限使用说明\n' +
    '- 分布式数据同步权限 (DISTRIBUTED_DATASYNC): 用于发现附近登录同一华为账号的设备，建立游戏连接。需您明确授权。\n' +
    '- 振动权限 (VIBRATE): 用于游戏中的触觉反馈，增强操作手感。无需额外授权。\n' +
    '- 所有数据传输通过鸿蒙分布式软总线加密通道完成。\n\n' +
    '3. 数据存储与安全\n' +
    '游戏历史和统计数据仅存储在本设备本地，使用鸿蒙系统沙盒加密存储。\n' +
    '卸载应用将清除所有本地数据。\n\n' +
    '4. 数据共享\n' +
    '本应用不会与任何第三方共享您的数据。\n' +
    '游戏同步数据仅在同一用户的配对设备之间传输。\n\n' +
    '5. 第三方服务\n' +
    '本应用不使用任何第三方分析、广告或追踪服务。\n\n' +
    '6. 儿童隐私\n' +
    '本应用适合4岁以上用户，不收集儿童个人信息。无需注册账号即可使用。\n\n' +
    '7. 用户权利\n' +
    '您可以随时通过卸载本应用清除所有本地数据。本应用无需账号注册。\n\n' +
    '8. 隐私政策更新\n' +
    '如隐私政策发生变更，将在本页面更新并标注新的更新日期。\n\n' +
    '9. 联系我们\n' +
    '如有隐私相关问题，请联系: synctap.game@example.com';
}
