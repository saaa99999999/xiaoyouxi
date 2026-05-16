/**
 * 购买确认弹窗 - 展示商品信息，确认后发起 IAP 购买
 *
 * 使用方式:
 *   this.purchaseDialogCtrl = new CustomDialogController({
 *     builder: PurchaseConfirmDialog({
 *       productId: 'unlock_drawing',
 *       productName: '解锁合体绘画',
 *       price: '¥6.00',
 *       onConfirm: () => { iapMgr.purchase('unlock_drawing'); },
 *       onCancel: () => { }
 *     })
 *   });
 */
@CustomDialog
export struct PurchaseConfirmDialog {
  controller: CustomDialogController;
  @Prop productId: string = '';
  @Prop productName: string = '';
  @Prop price: string = '¥0.00';
  @Prop description: string = '';
  @State isPurchasing: boolean = false;
  onConfirm?: () => void;
  onCancel?: () => void;

  build() {
    Column() {
      // 商品图标
      Text('🎮')
        .fontSize(48).margin({ top: 24, bottom: 8 });

      // 商品名
      Text(this.productName)
        .fontSize(18).fontWeight(FontWeight.Bold)
        .margin({ bottom: 4 });

      // 价格
      Text(this.price)
        .fontSize(28).fontWeight(FontWeight.Bold)
        .fontColor('#FF6B35')
        .margin({ bottom: 8 });

      // 描述
      if (this.description) {
        Text(this.description)
          .fontSize(12).fontColor('#757575')
          .textAlign(TextAlign.Center)
          .padding({ left: 16, right: 16 })
          .margin({ bottom: 12 });
      }

      // IAP 法律声明
      Text('购买将通过华为应用内支付完成\n购买后永久有效，可跨设备恢复')
        .fontSize(10).fontColor('#9E9E9E')
        .textAlign(TextAlign.Center)
        .margin({ bottom: 20 });

      // 按钮
      Row() {
        Button('取消')
          .fontSize(14).backgroundColor('#F5F5F5').fontColor('#424242')
          .layoutWeight(1)
          .onClick(() => {
            this.controller.close();
            if (this.onCancel) this.onCancel();
          });

        Button(this.isPurchasing ? '处理中...' : '确认购买')
          .fontSize(14)
          .backgroundColor(this.isPurchasing ? '#BDBDBD' : '#007DFF')
          .fontColor(Color.White)
          .layoutWeight(1).margin({ left: 12 })
          .enabled(!this.isPurchasing)
          .onClick(() => {
            if (this.isPurchasing) return;
            this.isPurchasing = true;
            this.controller.close();
            if (this.onConfirm) this.onConfirm();
          });
      }
      .width('100%').padding({ left: 16, right: 16, bottom: 24 });
    }
    .width('80%').borderRadius(16).backgroundColor(Color.White);
  }
}
