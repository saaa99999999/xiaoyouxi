import display from '@ohos.display';

/**
 * 屏幕适配工具 — 响应式设计
 *
 * 设计原则:
 * - 手机: 基准 360vp, 一切按原始尺寸
 * - 折叠屏/平板: 布局用响应式 (多列/侧栏), 尺寸微调
 * - 字体: 最大放大约 20%, 不是粗暴放大
 * - 间距/尺寸: 用 flex/百分比布局, 不是 scale()
 * - 触控目标: 保证最小 44vp
 *
 * 用法:
 *   const screen = ScreenUtils.getInstance();
 *   if (screen.isWideScreen()) { ...两列布局 }
 *   Text('hello').fontSize(screen.scaleFont(16))
 *   .width(screen.responsive(160, 280))
 */
export class ScreenUtils {
  private static instance: ScreenUtils;
  private screenWidth: number = 360;
  private screenHeight: number = 780;
  private deviceType: 'phone' | 'tablet' | 'foldable' | 'desktop' = 'phone';
  private fontScaleFactor: number = 1.0;
  private initialized: boolean = false;

  private constructor() {}

  static getInstance(): ScreenUtils {
    if (!ScreenUtils.instance) {
      ScreenUtils.instance = new ScreenUtils();
    }
    return ScreenUtils.instance;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const dis = display.getDefaultDisplaySync();
      this.screenWidth = px2vp(dis.width);
      this.screenHeight = px2vp(dis.height);

      const shortSide = Math.min(this.screenWidth, this.screenHeight);
      const longSide = Math.max(this.screenWidth, this.screenHeight);

      if (shortSide >= 840) {
        // 大平板 / 桌面
        this.deviceType = 'desktop';
        this.fontScaleFactor = 1.15;
      } else if (shortSide >= 600) {
        this.deviceType = 'tablet';
        this.fontScaleFactor = 1.12;
      } else if (shortSide >= 520 || (longSide >= 800 && shortSide >= 400)) {
        this.deviceType = 'foldable';
        this.fontScaleFactor = 1.08;
      } else {
        this.deviceType = 'phone';
        this.fontScaleFactor = 1.0;
      }
      this.initialized = true;
    } catch (err) {
      this.deviceType = 'phone';
      this.fontScaleFactor = 1.0;
      this.initialized = true;
    }
  }

  /** 字体缩放 — 温和, 最多放大 15% */
  scaleFont(baseFontSize: number): number {
    return Math.round(baseFontSize * this.fontScaleFactor);
  }

  /**
   * 响应式尺寸: 手机用 phoneVal, 宽屏用 wideVal
   * 例: screen.responsive(8, 16) → 手机8, 平板16
   */
  responsive(phoneVal: number, wideVal: number): number {
    return this.isWideScreen() ? wideVal : phoneVal;
  }

  /** 是否宽屏 (需要用多列/侧栏布局) */
  isWideScreen(): boolean {
    return this.screenWidth >= 520;
  }

  /** 是否平板或更大 */
  isTablet(): boolean {
    return this.deviceType === 'tablet' || this.deviceType === 'desktop';
  }

  /** 是否折叠屏 */
  isFoldable(): boolean {
    return this.deviceType === 'foldable';
  }

  /** 获取设备类型 */
  getDeviceType(): 'phone' | 'tablet' | 'foldable' | 'desktop' {
    return this.deviceType;
  }

  /** 获取屏幕宽度 vp */
  getScreenWidth(): number {
    return this.screenWidth;
  }

  /** 获取屏幕高度 vp */
  getScreenHeight(): number {
    return this.screenHeight;
  }

  /** 缩放因子 (仅 Canvas 渲染用, UI 不用) */
  getScaleFactor(): number {
    // 向后兼容: Canvas 绘制仍需比例因子, 但用温和值
    if (this.deviceType === 'desktop') return 1.2;
    if (this.deviceType === 'tablet') return 1.15;
    if (this.deviceType === 'foldable') return 1.08;
    return 1.0;
  }

  /**
   * @deprecated 使用 responsive() 或百分比布局代替
   * 保留向后兼容, 但不推荐新代码使用
   */
  scale(basePx: number): number {
    return Math.round(basePx * this.getScaleFactor());
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
