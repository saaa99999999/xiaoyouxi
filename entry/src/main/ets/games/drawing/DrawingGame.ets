import { DrawingEngine, BRUSH_PRESETS } from './DrawingEngine';
import { GameType, DeviceRole, GamePhase, SyncPacket, GameResult } from '../../common/types/GameTypes';
import { SyncManager } from '../../common/manager/SyncManager';
import { SessionManager } from '../../common/manager/SessionManager';
import { SoundManager } from '../../common/manager/SoundManager';
import { HapticManager } from '../../common/manager/HapticManager';
import { Logger } from '../../common/utils/Logger';
import { ScreenUtils } from '../../common/utils/ScreenUtils';
import fs from '@ohos.file.fs';
import util from '@ohos.util';

/**
 * 合体绘画 — 性能优化版
 *
 * 优化点:
 * - 触摸移动时增量绘制 (仅画新线段，不全部重绘)
 * - 网格线合并为单路径 (减少 draw call)
 * - 平滑点缓存写回 (避免每帧重新 Catmull-Rom 插值)
 * - 远程笔触到达时自动刷新画布
 * - 抬笔后全量重绘 (应用平滑 + 清理增量绘制痕迹)
 * - 平板适配 (ScreenUtils 缩放)
 */
@Component
export struct DrawingGame {
  @Link gamePhase: GamePhase;
  @Prop @Watch('onRestart') restartKey: number = 0;
  @State theme: string = '';
  @State selectedColor: string = '#212121';
  @State selectedTool: string = 'pen';
  @State brushWidth: number = 3;
  @State elapsedSec: number = 0;
  @State hostFinished: boolean = false;
  @State guestFinished: boolean = false;
  @State myStrokeCount: number = 0;
  @State partnerStrokeCount: number = 0;
  @State iFinished: boolean = false;
  @State myScore: number = 0;
  @State partnerScore: number = 0;
  private engine: DrawingEngine = new DrawingEngine();
  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);
  private isDrawing: boolean = false;
  private elapsedTimerId: number = 0;
  private syncMgr = SyncManager.getInstance();
  private tools = ['pen', 'pencil', 'marker', 'brush', 'eraser'];
  private colors = ['#212121', '#F44336', '#2196F3', '#4CAF50', '#FFD600', '#FF6B35', '#9C27B0', '#795548', '#FFFFFF', '#607D8B'];
  private screen = ScreenUtils.getInstance();
  onGameFinished?: (result: GameResult) => void;

  // ---- 性能优化字段 ----
  private lastRenderX: number = -1;
  private lastRenderY: number = -1;
  private pendingRenderTimer: number = 0;

  aboutToAppear(): void {
    const myRole = SessionManager.getInstance().getMyRole() || DeviceRole.HOST;
    this.engine.setSyncCallback((packet: SyncPacket) => {
      this.syncMgr.push('drawing', packet);
    });
    this.engine.setStateChangeCallback((state) => {
      this.hostFinished = state.hostFinished;
      this.guestFinished = state.guestFinished;
      const myRole = SessionManager.getInstance().getMyRole() || DeviceRole.HOST;
      this.iFinished = myRole === DeviceRole.HOST ? state.hostFinished : state.guestFinished;
      this.myStrokeCount = state.strokes.filter(s => s.device === myRole).length;
      this.partnerStrokeCount = state.strokes.filter(s => s.device !== myRole).length;
      if (myRole === DeviceRole.HOST) {
        this.myScore = state.hostScore;
        this.partnerScore = state.guestScore;
      } else {
        this.myScore = state.guestScore;
        this.partnerScore = state.hostScore;
      }
      if (state.phase === GamePhase.FINISHED && this.gamePhase !== GamePhase.FINISHED) {
        this.gamePhase = GamePhase.FINISHED;
        if (this.elapsedTimerId) {
          clearInterval(this.elapsedTimerId);
          this.elapsedTimerId = 0;
        }
        if (this.onGameFinished) this.onGameFinished(this.engine.getResult());
      }
      // 远程笔触或状态变更时，调度画布刷新
      if (!this.isDrawing) {
        this.scheduleRender();
      }
    });
    this.engine.init({ gameType: GameType.JOINT_DRAWING, myRole: myRole });
    this.theme = this.engine.getTheme();

    this.syncMgr.onDataChangePrefix('drawing', (_key: string, value: Object) => {
      this.engine.handleSync(value as SyncPacket);
    });

    this.elapsedTimerId = setInterval(() => { this.elapsedSec++; }, 1000);
  }

  aboutToDisappear(): void {
    if (this.elapsedTimerId) {
      clearInterval(this.elapsedTimerId);
      this.elapsedTimerId = 0;
    }
    if (this.pendingRenderTimer) {
      clearTimeout(this.pendingRenderTimer);
      this.pendingRenderTimer = 0;
    }
    this.engine.cleanup();
    this.syncMgr.offDataChangePrefix('drawing');
  }

  onRestart(): void {
    if (this.elapsedTimerId) {
      clearInterval(this.elapsedTimerId);
      this.elapsedTimerId = 0;
    }
    if (this.pendingRenderTimer) {
      clearTimeout(this.pendingRenderTimer);
      this.pendingRenderTimer = 0;
    }
    this.isDrawing = false;
    this.selectedColor = '#212121';
    this.selectedTool = 'pen';
    this.brushWidth = 3;
    this.lastRenderX = -1;
    this.lastRenderY = -1;
    const myRole = SessionManager.getInstance().getMyRole() || DeviceRole.HOST;
    this.engine.init({ gameType: GameType.JOINT_DRAWING, myRole: myRole });
    this.theme = this.engine.getTheme();
    this.elapsedSec = 0;
    this.hostFinished = false;
    this.guestFinished = false;
    this.myStrokeCount = 0;
    this.partnerStrokeCount = 0;
    this.myScore = 0;
    this.partnerScore = 0;
    this.iFinished = false;
    this.elapsedTimerId = setInterval(() => { this.elapsedSec++; }, 1000);
    this.renderCanvas();
  }

  /** 节流刷新: 远程笔触到达时，最多 30fps 刷新画布 */
  private scheduleRender(): void {
    if (this.pendingRenderTimer) return;
    this.pendingRenderTimer = setTimeout(() => {
      this.pendingRenderTimer = 0;
      this.renderCanvas();
    }, 33);
  }

  build() {
    Column() {
      // 顶部工具栏
      Row() {
        Column() {
          Text(`🎨 ${this.theme}`).fontSize(this.screen.scaleFont(16)).fontWeight(FontWeight.Bold)
            .fontColor('#1A1A1A').maxLines(1);
          Text(`${this.myStrokeCount}笔 / 对方${this.partnerStrokeCount}笔`)
            .fontSize(this.screen.scaleFont(12)).fontColor('#999999').margin({ top: 2 });
        }
        Blank();
        // 分数
        Row() {
          Column() {
            Text(`${this.myScore}`).fontSize(this.screen.scaleFont(18)).fontWeight(FontWeight.Bold).fontColor('#007DFF');
            Text('我').fontSize(this.screen.scaleFont(10)).fontColor('#999999');
          }
          Text(':').fontSize(this.screen.scaleFont(14)).fontColor('#CCCCCC').margin({ left: 6, right: 6 });
          Column() {
            Text(`${this.partnerScore}`).fontSize(this.screen.scaleFont(18)).fontWeight(FontWeight.Bold).fontColor('#FF9900');
            Text('对方').fontSize(this.screen.scaleFont(10)).fontColor('#999999');
          }
        }
        .margin({ right: 8 });
        Column() {
          Text(`${Math.floor(this.elapsedSec / 60)}:${(this.elapsedSec % 60).toString().padStart(2, '0')}`)
            .fontSize(this.screen.scaleFont(20)).fontWeight(FontWeight.Bold)
            .fontColor(this.elapsedSec > 180 ? '#FF5252' : '#1A1A1A');
          if (this.hostFinished || this.guestFinished) {
            Text(this.iFinished ? '✓ 你已完成' : '⏳ 对方已完成')
              .fontSize(this.screen.scaleFont(11)).fontColor(this.iFinished ? '#64BB5C' : '#FF9900');
          }
        }
      }
      .width('100%').padding({ left: 16, right: 16, top: 12, bottom: 10 })
      .backgroundColor(Color.White);

      // Canvas 画布
      Canvas(this.context)
        .width('100%').layoutWeight(1)
        .backgroundColor(Color.White)
        .border({ width: 1, color: '#E0E0E0' })
        .onReady(() => { this.renderCanvas(); })
        .onTouch((event: TouchEvent) => {
          const x = event.touches[0].x;
          const y = event.touches[0].y;
          const cw = this.context.width || 1;
          const ch = this.context.height || 1;
          if (event.type === TouchType.Down) {
            this.isDrawing = true;
            this.engine.handleInput({
              type: 'STROKE_BEGIN',
              data: { x: x / cw, y: y / ch, tool: this.selectedTool, color: this.selectedColor, width: this.brushWidth }
            });
            this.renderCanvas(); // 全量重绘，确保画布干净
            this.lastRenderX = x;
            this.lastRenderY = y;
          } else if (event.type === TouchType.Move && this.isDrawing) {
            this.engine.handleInput({
              type: 'STROKE_MOVE',
              data: { x: x / cw, y: y / ch, pressure: 0.5 }
            });
            // 增量绘制: 只画新线段，不清除画布
            this.drawIncrementalSegment(x, y);
            this.lastRenderX = x;
            this.lastRenderY = y;
          } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
            this.isDrawing = false;
            this.engine.handleInput({ type: 'STROKE_END', data: {} });
            this.lastRenderX = -1;
            this.lastRenderY = -1;
            this.renderCanvas(); // 全量重绘，应用平滑
          }
        });

      // 色板
      Row() {
        ForEach(this.colors, (color: string, index: number) => {
          Stack() {
            Circle({ width: 28, height: 28 }).fill(color);
            if (this.selectedColor === color) {
              Circle({ width: 34, height: 34 })
                .fill(Color.Transparent)
                .stroke('#007DFF').strokeWidth(3);
            }
          }
          .margin({ left: 3, right: 3 })
          .onClick(() => {
            this.selectedColor = color;
            SoundManager.getInstance().play('button_click');
          });
        }, (color: string) => color);
      }
      .width('100%').padding(6).justifyContent(FlexAlign.Center);

      // 笔刷工具栏
      Row() {
        ForEach(this.tools, (tool: string) => {
          Button(this.getToolLabel(tool))
            .fontSize(this.screen.scaleFont(11))
            .backgroundColor(this.selectedTool === tool ? '#007DFF' : '#F5F5F5')
            .fontColor(this.selectedTool === tool ? Color.White : '#424242')
            .height(30).borderRadius(15)
            .margin({ left: 2, right: 2 })
            .onClick(() => {
              this.selectedTool = tool;
              SoundManager.getInstance().play('button_click');
            });
        }, (tool: string) => tool);

        // 笔刷大小预览
        Stack() {
          Circle({ width: Math.max(8, this.brushWidth * 2), height: Math.max(8, this.brushWidth * 2) })
            .fill('#212121');
        }
        .width(24).height(24).margin({ left: 4 });

        Slider({ value: this.brushWidth, min: 1, max: 12, step: 1 })
          .width(70).margin({ left: 4 })
          .onChange((value: number) => { this.brushWidth = value; });
      }
      .width('100%').padding(6).justifyContent(FlexAlign.Center);

      // 操作按钮行
      Row() {
        Button('撤销').fontSize(this.screen.scaleFont(13)).backgroundColor('#F5F5F5')
          .onClick(() => {
            this.engine.handleInput({ type: 'UNDO', data: {} });
            SoundManager.getInstance().play('button_click');
            this.renderCanvas();
          });
        Button('清空').fontSize(this.screen.scaleFont(13)).backgroundColor('#FF525220')
          .margin({ left: 8 })
          .onClick(() => {
            this.engine.handleInput({ type: 'CLEAR', data: {} });
            SoundManager.getInstance().play('button_click');
            this.renderCanvas();
          });
        Button('保存')
          .fontSize(this.screen.scaleFont(13)).backgroundColor('#4CAF5020').fontColor('#4CAF50')
          .margin({ left: 8 })
          .onClick(() => {
            this.saveCanvasImage();
            SoundManager.getInstance().play('button_click');
          });
        Button('完成绘画')
          .fontSize(this.screen.scaleFont(14)).backgroundColor('#007DFF').fontColor(Color.White)
          .margin({ left: 8 }).layoutWeight(1)
          .onClick(() => {
            this.engine.handleInput({ type: 'FINISH', data: {} });
            this.iFinished = true;
            SoundManager.getInstance().play('game_win');
            HapticManager.getInstance().play('game_win');
          });
      }
      .width('100%').padding({ left: 16, right: 16, bottom: 12, top: 4 });
    }
    .width('100%').height('100%').backgroundColor('#FAFAFA');
  }

  /**
   * 增量绘制: 在触摸移动时只画从上一点到当前点的新线段。
   * 不清除画布、不重绘网格、不重绘已有笔触 — 大幅降低每帧开销。
   */
  private drawIncrementalSegment(x: number, y: number): void {
    if (this.lastRenderX < 0) {
      // 没有上一点，退化为全量重绘
      this.renderCanvas();
      return;
    }
    const ctx = this.context;
    const preset = BRUSH_PRESETS[this.selectedTool] || BRUSH_PRESETS.pen;

    if (preset.tool === 'eraser') {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = this.brushWidth * 2; // 橡皮擦更宽
    } else {
      const alpha = Math.round(preset.opacity * 255);
      const opacityHex = alpha.toString(16).padStart(2, '0').toUpperCase();
      ctx.strokeStyle = this.selectedColor + opacityHex;
      ctx.lineWidth = this.brushWidth;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(this.lastRenderX, this.lastRenderY);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  /**
   * 全量重绘: 清除画布 → 网格 → 分割线 → 所有笔触
   * 仅在落笔/抬笔/撤销/清空/远程笔触时调用
   */
  private renderCanvas(): void {
    const ctx = this.context;
    const w = ctx.width, h = ctx.height;
    if (!w || !h) return;

    // 背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);

    // 网格 — 合并为单路径 (一次 stroke 调用)
    ctx.strokeStyle = '#F5F5F5';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x < w; x += 30) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += 30) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // 分割线
    ctx.strokeStyle = '#BDBDBD';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // 侧标签
    ctx.font = `${this.screen.scaleFont(11)}px sans-serif`;
    ctx.fillStyle = '#BDBDBD';
    ctx.fillText('我的画板', 8, 16);
    ctx.fillText('对方画板', w / 2 + 8, 16);

    // 渲染笔触 — 优先使用缓存平滑曲线，未缓存的计算后写回
    const strokes = this.engine.getStrokes();
    const myRole = SessionManager.getInstance().getMyRole() || DeviceRole.HOST;
    for (const s of strokes) {
      if (s.points.length < 2) continue;
      const isRemote = s.device !== myRole;
      let smoothed = this.engine.getSmoothedPoints(s.id);
      if (!smoothed) {
        smoothed = DrawingEngine.smoothStroke(s.points);
        this.engine.cacheSmoothedPoints(s.id, smoothed);
      }

      if (s.tool === 'eraser') {
        ctx.strokeStyle = '#FFFFFF';
      } else {
        const opacityHex = isRemote ? 'B0' : 'FF';
        ctx.strokeStyle = s.color + opacityHex;
      }
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(smoothed[0].x * w, smoothed[0].y * h);
      for (let i = 1; i < smoothed.length; i++) {
        ctx.lineTo(smoothed[i].x * w, smoothed[i].y * h);
      }
      ctx.stroke();
    }
  }

  private getToolLabel(tool: string): string {
    if (tool === 'pen') return '钢笔';
    if (tool === 'pencil') return '铅笔';
    if (tool === 'marker') return '马克笔';
    if (tool === 'brush') return '毛笔';
    if (tool === 'eraser') return '橡皮';
    return tool;
  }

  private saveCanvasImage(): void {
    try {
      const imageData = this.context.toDataURL('image/png');
      // 提取 base64 数据
      const base64 = imageData.replace(/^data:image\/png;base64,/, '');
      const context = getContext(this);
      const filePath = `${context.filesDir}/drawing_${Date.now()}.png`;
      // 使用 util.Base64Helper 解码
      const helper = new util.Base64Helper();
      const uint8Arr = helper.decodeSync(base64);
      const file = fs.openSync(filePath, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY);
      fs.writeSync(file.fd, uint8Arr.buffer);
      fs.closeSync(file);
      AlertDialog.show({ message: `画作已保存`, alignment: DialogAlignment.Center });
      Logger.info('DrawingGame', `Saved canvas to ${filePath}`);
    } catch (err) {
      Logger.error('DrawingGame', 'saveCanvasImage failed', err);
      AlertDialog.show({ message: '保存失败', alignment: DialogAlignment.Center });
    }
  }
}
