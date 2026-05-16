/**
 * 退出确认弹窗 - 游戏中拦截返回键，防止误触退出
 *
 * 使用方式:
 *   this.exitDialogCtrl = new CustomDialogController({
 *     builder: ExitConfirmDialog({
 *       onConfirm: () => { this.leaveGame(); },
 *       onCancel: () => { }
 *     }),
 *     autoCancel: true
 *   });
 */
@CustomDialog
export struct ExitConfirmDialog {
  controller: CustomDialogController;
  onConfirm?: () => void;
  onCancel?: () => void;

  build() {
    Column() {
      Text('确认退出游戏?')
        .fontSize(18).fontWeight(FontWeight.Bold)
        .margin({ top: 24, bottom: 8 });

      Text('当前游戏进度将不会保存')
        .fontSize(13).fontColor('#757575')
        .margin({ bottom: 24 });

      Row() {
        Button('继续游戏')
          .fontSize(14).backgroundColor('#F5F5F5').fontColor('#424242')
          .layoutWeight(1)
          .onClick(() => {
            this.controller.close();
            if (this.onCancel) this.onCancel();
          });

        Button('确认退出')
          .fontSize(14).backgroundColor('#FF5252').fontColor(Color.White)
          .layoutWeight(1).margin({ left: 12 })
          .onClick(() => {
            this.controller.close();
            if (this.onConfirm) this.onConfirm();
          });
      }
      .width('100%').padding({ left: 16, right: 16, bottom: 24 });

      Text('按返回键可继续游戏')
        .fontSize(11).fontColor('#BDBDBD')
        .margin({ bottom: 8 });
    }
    .width('80%').borderRadius(16).backgroundColor(Color.White);
  }
}
