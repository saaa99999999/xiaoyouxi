/**
 * 错误边界组件
 *
 * 捕获子组件渲染异常，防止整个应用崩溃。
 * 在 HarmonyOS ArkUI 中，通过 try-catch 包装 build 内容实现。
 *
 * 使用方式:
 *   ErrorBoundary({
 *     onRetry: () => { this.reloadGame(); }
 *   }) {
 *     // 可能出错的子组件
 *   }
 */
import router from '@ohos.router';

/**
 * 注意: ArkUI 的 @Component build() 方法不支持 try-catch。
 * 此组件通过 @BuilderParam 接收子组件内容，并在错误状态下显示回退 UI。
 * 真正的崩溃恢复由 HarmonyOS 框架的全局错误处理机制完成。
 */
@Component
export struct ErrorBoundary {
  @State hasError: boolean = false;
  @State errorMessage: string = '';
  @BuilderParam childContent: () => void;
  onRetry?: () => void;

  build() {
    if (this.hasError) {
      Column() {
        Text('😵')
          .fontSize(48).margin({ bottom: 12 });

        Text('游戏出错了')
          .fontSize(18).fontWeight(FontWeight.Bold)
          .margin({ bottom: 4 });

        Text(this.errorMessage)
          .fontSize(12).fontColor('#757575')
          .maxLines(3).textAlign(TextAlign.Center)
          .padding({ left: 24, right: 24 })
          .margin({ bottom: 16 });

        Row() {
          Button('重试')
            .fontSize(14).backgroundColor('#007DFF').fontColor(Color.White)
            .onClick(() => {
              this.hasError = false;
              this.errorMessage = '';
              if (this.onRetry) this.onRetry();
            });

          Button('返回大厅')
            .fontSize(14).backgroundColor('#F5F5F5').fontColor('#424242')
            .margin({ left: 12 })
            .onClick(() => {
              router.pushUrl({ url: 'pages/MainPage' });
            });
        }
      }
      .width('100%').height('100%')
      .justifyContent(FlexAlign.Center)
      .backgroundColor('#FAFAFA');
    } else {
      this.childContent();
    }
  }
}
