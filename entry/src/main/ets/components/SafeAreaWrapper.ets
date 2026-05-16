import window from '@ohos.window';
import { Logger } from '../common/utils/Logger';

/**
 * 安全区域包装器 — 适配刘海屏/挖孔屏/圆角屏
 *
 * 使用 @ohos.window.getWindowAvoidArea 获取系统避让区域，
 * 自动为子组件添加合适的 padding。
 *
 * 使用方式:
 *   SafeAreaWrapper() {
 *     // 子组件内容
 *   }
 */
@Component
export struct SafeAreaWrapper {
  @State topPadding: number = 0;
  @State bottomPadding: number = 0;
  @State leftPadding: number = 0;
  @State rightPadding: number = 0;
  @BuilderParam childContent: () => void;

  aboutToAppear(): void {
    this.calculateSafeArea();
  }

  async calculateSafeArea(): Promise<void> {
    try {
      const win = await window.getLastWindow(getContext(this));
      // TYPE_SYSTEM = 0: 系统避让区域 (状态栏、导航栏)
      const systemArea = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
      // TYPE_CUTOUT = 1: 挖孔屏避让区域
      const cutoutArea = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_CUTOUT);

      // 取两者最大值确保安全
      this.topPadding = Math.max(systemArea.topRect.height, cutoutArea.topRect.height);
      this.bottomPadding = Math.max(systemArea.bottomRect.height, cutoutArea.bottomRect.height);
      this.leftPadding = Math.max(systemArea.leftRect.width, cutoutArea.leftRect.width);
      this.rightPadding = Math.max(systemArea.rightRect.width, cutoutArea.rightRect.width);
    } catch (err) {
      Logger.warn('SafeAreaWrapper', 'Failed to get avoid area', err);
      // 降级: 使用预设安全值
      this.topPadding = 44;
      this.bottomPadding = 34;
    }
  }

  build() {
    Column() {
      this.childContent();
    }
    .width('100%')
    .height('100%')
    .padding({
      top: this.topPadding,
      bottom: this.bottomPadding,
      left: this.leftPadding,
      right: this.rightPadding
    });
  }
}
