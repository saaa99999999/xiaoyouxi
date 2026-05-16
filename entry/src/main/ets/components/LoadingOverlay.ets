/**
 * 加载覆盖层组件
 *
 * 显示加载动画 + 可选提示文字，用于:
 * - 设备连接中
 * - 游戏数据加载中
 * - 词典加载中
 * - 同步数据等待中
 *
 * 使用方式:
 *   LoadingOverlay({ visible: this.isLoading, message: '连接中...' })
 */
@Component
export struct LoadingOverlay {
  @Prop visible: boolean = true;
  @Prop message: string = '加载中...';
  @Prop showCancel: boolean = false;
  onCancel?: () => void;

  build() {
    if (this.visible) {
      Stack() {
        Column() {
          LoadingProgress()
            .width(56).height(56)
            .color('#007DFF')
            .margin({ bottom: 16 });

          Text(this.message)
            .fontSize(14).fontColor('#424242')
            .margin({ bottom: 4 });

          Text('请保持两台设备靠近')
            .fontSize(11).fontColor('#9E9E9E');

          if (this.showCancel) {
            Button('取消')
              .fontSize(13).backgroundColor('#F5F5F5').fontColor('#424242')
              .margin({ top: 16 })
              .onClick(() => {
                if (this.onCancel) this.onCancel();
              });
          }
        }
        .padding(32)
        .borderRadius(16).backgroundColor(Color.White)
        .shadow({ radius: 12, color: '#20000000' });
      }
      .width('100%').height('100%')
      .backgroundColor('#80000000')
      .alignContent(Alignment.Center);
    }
  }
}
