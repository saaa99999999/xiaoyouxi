import router from '@ohos.router';

@Entry
@Component
struct SplashPage {
  @State opacityValue: number = 0;
  @State scaleValue: number = 0.8;
  @State subtitleOpacity: number = 0;
  private subtitleTimerId: number = 0;
  private navigateTimerId: number = 0;

  aboutToAppear(): void {
    // Logo 淡入动画
    animateTo({ duration: 600, curve: Curve.EaseOut }, () => {
      this.opacityValue = 1;
      this.scaleValue = 1;
    });

    // 副标题延迟淡入
    this.subtitleTimerId = setTimeout(() => {
      this.subtitleTimerId = 0;
      animateTo({ duration: 400, curve: Curve.EaseOut }, () => {
        this.subtitleOpacity = 1;
      });
    }, 400);

    // 1.8秒后跳转主页
    this.navigateTimerId = setTimeout(() => {
      this.navigateTimerId = 0;
      router.replaceUrl({ url: 'pages/MainPage' });
    }, 1800);
  }

  aboutToDisappear(): void {
    if (this.subtitleTimerId) { clearTimeout(this.subtitleTimerId); this.subtitleTimerId = 0; }
    if (this.navigateTimerId) { clearTimeout(this.navigateTimerId); this.navigateTimerId = 0; }
  }

  build() {
    Column() {
      Column() {
        // Logo — 使用 app_icon
        Image($r('app.media.app_icon'))
          .width(96).height(96)
          .objectFit(ImageFit.Contain)
          .margin({ bottom: 12 });

        Text('默契挑战')
          .fontSize(32).fontWeight(FontWeight.Bold)
          .fontColor('#212121').margin({ top: 8 });

        Text('SyncTap')
          .fontSize(16).fontColor('#007DFF')
          .letterSpacing(4).margin({ top: 4 });

        Column() {
          Text('双设备协作小游戏合集')
            .fontSize(13).fontColor('#9E9E9E')
            .margin({ top: 8 });

          // 装饰线
          Row()
            .width(40).height(3).borderRadius(2)
            .backgroundColor('#007DFF')
            .margin({ top: 16 })
            .opacity(0.3);
        }
        .opacity(this.subtitleOpacity);
      }
      .opacity(this.opacityValue).scale({ x: this.scaleValue, y: this.scaleValue });

      Text('v1.0.0')
        .fontSize(11).fontColor('#BDBDBD')
        .position({ x: '50%', y: '90%' })
        .translate({ x: '-50%' });
    }
    .width('100%').height('100%')
    .justifyContent(FlexAlign.Center)
    .backgroundColor('#F5F5F5');
  }
}
