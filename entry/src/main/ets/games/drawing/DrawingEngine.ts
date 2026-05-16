import { BaseGameEngine } from '../../common/base/BaseGameEngine';
import { GameConfig, GameInput, GameResult, SyncPacket, GamePhase, GameType, DeviceRole } from '../../common/types/GameTypes';
import { generateUUID } from '../../common/utils/RandomUtils';
import { DRAWING_MAX_STROKES } from '../../constants/GameConstants';

// ---------- 类型 ----------

interface Point {
  x: number;
  y: number;
  pressure: number;
}

interface StrokeData {
  id: string;
  device: DeviceRole;
  points: Point[];
  color: string;
  width: number;
  opacity: number;
  tool: 'pen' | 'eraser';
  toolName: string; // 原始工具名: pen/pencil/marker/brush/eraser
  isComplete: boolean;
  createdAt: number;
}

interface DrawingState {
  gameType: GameType;
  phase: GamePhase;
  round: number;
  hostScore: number;
  guestScore: number;
  myRole: DeviceRole;
  theme: string;
  strokes: StrokeData[];
  hostFinished: boolean;
  guestFinished: boolean;
  combinedImagePath: string;
}

// ---------- 预设画笔 ----------

export const BRUSH_PRESETS: Record<string, { width: number; opacity: number; tool: 'pen' | 'eraser'; label: string }> = {
  pen:    { width: 3,  opacity: 1.0, tool: 'pen',    label: '钢笔' },
  pencil: { width: 2,  opacity: 0.8, tool: 'pen',    label: '铅笔' },
  marker: { width: 8,  opacity: 0.6, tool: 'pen',    label: '马克笔' },
  brush:  { width: 5,  opacity: 0.9, tool: 'pen',    label: '毛笔' },
  eraser: { width: 20, opacity: 1.0, tool: 'eraser', label: '橡皮擦' }
};

const DRAWING_THEMES = ['猫', '太阳', '房子', '大树', '笑脸', '火箭', '蛋糕', '花朵', '汽车', '机器人',
  '蝴蝶', '月亮', '鱼', '山', '云朵', '星星', '雪人', '气球', '雨伞', '苹果'];

// ---------- 引擎实现 ----------

export class DrawingEngine extends BaseGameEngine<DrawingState> {
  private currentStroke: StrokeData | null = null;
  private undoneStrokeIds: string[] = [];
  private smoothedCache: Record<string, Point[]> = {};
  private lastSyncTime: number = 0;
  private lastSyncPointIndex: number = 0; // 上次同步时的点索引
  private readonly SYNC_THROTTLE_MS = 32; // ~30fps sync rate
  private finishTimerId: number = 0;

  constructor() {
    super({
      gameType: GameType.JOINT_DRAWING,
      phase: GamePhase.WAITING,
      round: 0,
      hostScore: 0,
      guestScore: 0,
      myRole: DeviceRole.HOST,
      theme: '',
      strokes: [],
      hostFinished: false,
      guestFinished: false,
      combinedImagePath: ''
    });
  }

  init(config: GameConfig): void {
    const theme = config.theme || this.randomTheme();
    this.clearReplayCache();
    this.undoneStrokeIds = [];
    this.smoothedCache = {};
    this.currentStroke = null;
    this.lastSyncTime = 0;
    this.lastSyncPointIndex = 0;
    if (this.finishTimerId) {
      clearTimeout(this.finishTimerId);
      this.finishTimerId = 0;
    }
    // HOST 直接开始; GUEST 等待 HOST 的 DRAWING_START 同步主题后再开始
    const initialPhase = config.myRole === DeviceRole.HOST ? GamePhase.PLAYING : GamePhase.COUNTDOWN;
    this.updateState({
      phase: initialPhase,
      theme,
      myRole: config.myRole,
      strokes: [],
      hostFinished: false,
      guestFinished: false,
      hostScore: 0,
      guestScore: 0
    });
    if (config.myRole === DeviceRole.HOST) {
      this.sendSync('DRAWING_START', { theme });
    }
  }

  handleInput(input: GameInput): void {
    // D2 fix: 非 PLAYING 阶段只允许 STROKE/UNDO/CLEAR（绘画操作）
    if (input.type === 'FINISH' && this.state.phase !== GamePhase.PLAYING) return;
    switch (input.type) {
      case 'STROKE_BEGIN':
        this.beginStroke(
          input.data['x'] as number,
          input.data['y'] as number,
          input.data['tool'] as string,
          input.data['color'] as string,
          input.data['width'] as number
        );
        break;
      case 'STROKE_MOVE':
        this.addPoint(
          input.data['x'] as number,
          input.data['y'] as number,
          (input.data['pressure'] as number) || 0.5
        );
        break;
      case 'STROKE_END':
        this.endStroke();
        break;
      case 'UNDO':
        this.undo();
        break;
      case 'CLEAR':
        this.clearCanvas();
        break;
      case 'FINISH':
        this.finishDrawing();
        break;
    }
  }

  handleSync(packet: SyncPacket): void {
    if (this.isReplay(packet)) return;
    // 防止自同步循环
    if (packet.from === this.state.myRole) return;

    const data = packet.payload;
    switch (packet.type) {
      case 'DRAWING_START':
        this.updateState({ theme: data['theme'] as string, phase: GamePhase.PLAYING });
        break;
      case 'STROKE_DELTA':
        this.applyRemoteStroke(data);
        break;
      case 'UNDO':
        this.removeLastStroke(data['device'] as DeviceRole);
        break;
      case 'CLEAR_REQUEST':
        // 远程清空画布
        this.smoothedCache = {};
        this.updateState({ strokes: [] });
        break;
      case 'PLAYER_FINISHED':
        if (packet.from === DeviceRole.HOST) {
          this.updateState({ hostFinished: true });
        } else {
          this.updateState({ guestFinished: true });
        }
        if (this.state.hostFinished && this.state.guestFinished) {
          this.updateState({ phase: GamePhase.RESULT });
          this.finishTimerId = setTimeout(() => {
            this.finishTimerId = 0;
            this.updateState({ phase: GamePhase.FINISHED });
          }, 3000);
        }
        break;
      case 'CONFIRM_FINISH':
        // D1 fix: 清除待定的 finishTimer 避免冗余状态更新
        if (this.finishTimerId) {
          clearTimeout(this.finishTimerId);
          this.finishTimerId = 0;
        }
        this.updateState({ phase: GamePhase.FINISHED });
        break;
    }
  }

  getScore(): { host: number; guest: number } {
    // 实时计算分数: 基于笔触数量 + 笔触质量 + 协作度
    return {
      host: this.calcScore(DeviceRole.HOST),
      guest: this.calcScore(DeviceRole.GUEST)
    };
  }

  /** 计算单个玩家的绘画分数 */
  private calcScore(role: DeviceRole): number {
    return this.calcScoreFromStrokes(this.state.strokes, role);
  }

  /** 从笔触列表计算分数 (用于实时更新) */
  private calcScoreFromStrokes(strokes: StrokeData[], role: DeviceRole): number {
    const myStrokes = strokes.filter(s => s.device === role);
    if (myStrokes.length === 0) return 0;

    let score = 0;
    for (const s of myStrokes) {
      const pointScore = Math.min(s.points.length, 50);
      const lengthBonus = s.isComplete ? 5 : 0;
      const toolBonus = (s.toolName === 'marker' || s.toolName === 'brush') ? 5 : 0;
      score += pointScore + lengthBonus + toolBonus;
    }

    const isFinished = role === DeviceRole.HOST ? this.state.hostFinished : this.state.guestFinished;
    if (isFinished) score += 20;

    return Math.min(score, 300);
  }

  isGameOver(): boolean {
    return this.state.phase === GamePhase.FINISHED;
  }

  getResult(): GameResult {
    const scores = this.getScore();
    let winner: DeviceRole | 'draw' = 'draw';
    if (scores.host > scores.guest) winner = DeviceRole.HOST;
    else if (scores.guest > scores.host) winner = DeviceRole.GUEST;

    return {
      gameType: GameType.JOINT_DRAWING,
      hostScore: scores.host,
      guestScore: scores.guest,
      winner: winner,
      details: {
        theme: this.state.theme,
        strokeCount: this.state.strokes.length,
        combinedImagePath: this.state.combinedImagePath
      }
    };
  }

  cleanup(): void {
    if (this.finishTimerId) {
      clearTimeout(this.finishTimerId);
      this.finishTimerId = 0;
    }
    // 结束进行中的笔触，防止引用失效
    if (this.currentStroke) {
      this.currentStroke.isComplete = true;
      this.currentStroke = null;
    }
    this.updateState({ strokes: [] });
    this.undoneStrokeIds = [];
    this.smoothedCache = {};
  }

  // ============ 绘画操作 ============

  private beginStroke(x: number, y: number, tool: string, color: string, width: number): void {
    // 如果正在画，先结束上一笔
    if (this.currentStroke) {
      this.endStroke();
    }

    const myRole = this.state.myRole;
    const myStrokeCount = this.state.strokes.filter(s => s.device === myRole).length;
    if (myStrokeCount >= DRAWING_MAX_STROKES / 2) return;

    const preset = BRUSH_PRESETS[tool] || BRUSH_PRESETS.pen;
    this.currentStroke = {
      id: generateUUID(),
      device: myRole,
      points: [{ x, y, pressure: 0.5 }],
      color,
      width,
      opacity: preset.opacity,
      tool: preset.tool,
      toolName: tool,
      isComplete: false,
      createdAt: Date.now()
    };
    this.lastSyncPointIndex = 1; // 已有初始点，下次同步从索引1开始
  }

  private addPoint(x: number, y: number, pressure: number): void {
    if (!this.currentStroke) return;
    this.currentStroke.points.push({ x, y, pressure });

    // 节流同步: 限制同步频率
    const now = Date.now();
    if (now - this.lastSyncTime < this.SYNC_THROTTLE_MS) return;
    this.lastSyncTime = now;

    // 只发送自上次同步后新增的点，避免远程端点重复
    const newPoints = this.currentStroke.points.slice(this.lastSyncPointIndex);
    this.lastSyncPointIndex = this.currentStroke.points.length;

    this.sendSync('STROKE_DELTA', {
      strokeId: this.currentStroke.id,
      newPoints: newPoints,
      device: this.state.myRole,
      color: this.currentStroke.color,
      width: this.currentStroke.width,
      opacity: this.currentStroke.opacity,
      tool: this.currentStroke.tool,
      toolName: this.currentStroke.toolName,
      isComplete: false
    });
  }

  private endStroke(): void {
    if (!this.currentStroke) return;
    this.currentStroke.isComplete = true;
    if (this.currentStroke.points.length >= 2) {
      const smoothed = DrawingEngine.smoothStroke(this.currentStroke.points);
      this.smoothedCache[this.currentStroke.id] = smoothed;
    }
    const currentStroke = this.currentStroke;
    const strokeCopy: StrokeData = {
      id: currentStroke.id,
      device: currentStroke.device,
      points: currentStroke.points.slice(),
      color: currentStroke.color,
      width: currentStroke.width,
      opacity: currentStroke.opacity,
      tool: currentStroke.tool,
      toolName: currentStroke.toolName,
      isComplete: currentStroke.isComplete,
      createdAt: currentStroke.createdAt
    };
    const strokes = this.state.strokes.concat([strokeCopy]);
    // 更新实时分数
    const hostScore = this.calcScoreFromStrokes(strokes, DeviceRole.HOST);
    const guestScore = this.calcScoreFromStrokes(strokes, DeviceRole.GUEST);
    this.updateState({ strokes, hostScore, guestScore });
    this.currentStroke = null;

    // 发送最终完整笔触
    this.sendSync('STROKE_DELTA', {
      strokeId: strokeCopy.id,
      newPoints: strokeCopy.points,
      device: strokeCopy.device,
      color: strokeCopy.color,
      width: strokeCopy.width,
      opacity: strokeCopy.opacity,
      tool: strokeCopy.tool,
      toolName: strokeCopy.toolName,
      isComplete: true
    });
  }

  private undo(): void {
    // 只撤销自己的最后一笔
    const myRole = this.state.myRole;
    const strokes = this.state.strokes.slice();
    let removed: StrokeData | null = null;
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (strokes[i].device === myRole) {
        removed = strokes.splice(i, 1)[0] as StrokeData;
        break;
      }
    }
    if (!removed) return;
    this.undoneStrokeIds.push(removed.id);
    delete this.smoothedCache[removed.id];
    const hostScore = this.calcScoreFromStrokes(strokes, DeviceRole.HOST);
    const guestScore = this.calcScoreFromStrokes(strokes, DeviceRole.GUEST);
    this.updateState({ strokes, hostScore, guestScore });
    this.sendSync('UNDO', { device: myRole, strokeId: removed.id });
  }

  private clearCanvas(): void {
    this.smoothedCache = {};
    this.currentStroke = null;
    this.updateState({ strokes: [], hostScore: 0, guestScore: 0 });
    this.sendSync('CLEAR_REQUEST', {});
  }

  private finishDrawing(): void {
    // 先完成正在进行的笔触
    if (this.currentStroke) {
      this.endStroke();
    }

    if (this.state.myRole === DeviceRole.HOST) {
      this.updateState({ hostFinished: true });
    } else {
      this.updateState({ guestFinished: true });
    }
    this.sendSync('PLAYER_FINISHED', {});
  }

  private applyRemoteStroke(data: Record<string, number | string | boolean | Object | undefined>): void {
    const strokeId = data['strokeId'] as string;
    if (this.undoneStrokeIds.includes(strokeId)) return;

    const newPoints = data['newPoints'] as Point[];
    const device = data['device'] as DeviceRole;
    const isComplete = data['isComplete'] as boolean;
    const remoteOpacity = data['opacity'] as number;

    const strokes = this.state.strokes.slice();
    const existingIdx = strokes.findIndex(s => s.id === strokeId);
    if (existingIdx === -1) {
      strokes.push({
        id: strokeId,
        device,
        points: newPoints.slice(),
        color: data['color'] as string,
        width: data['width'] as number,
        opacity: remoteOpacity || 0.7,
        tool: data['tool'] as 'pen' | 'eraser',
        toolName: (data['toolName'] as string) || (data['tool'] as string) || 'pen',
        isComplete,
        createdAt: Date.now()
      });
    } else {
      const existing = strokes[existingIdx];
      strokes[existingIdx] = {
        id: existing.id,
        device: existing.device,
        points: existing.points.concat(newPoints),
        color: existing.color,
        width: existing.width,
        opacity: existing.opacity,
        tool: existing.tool,
        toolName: existing.toolName,
        isComplete: isComplete,
        createdAt: existing.createdAt
      };
    }
    // BUG-6 fix: 合并 strokes + scores 为单次 updateState
    const hostScore = this.calcScoreFromStrokes(strokes, DeviceRole.HOST);
    const guestScore = this.calcScoreFromStrokes(strokes, DeviceRole.GUEST);
    this.updateState({ strokes, hostScore, guestScore });
    // 远程笔触完成时立即缓存平滑点，避免渲染时每帧重算
    if (isComplete) {
      const completed = strokes[strokes.length - 1];
      if (completed && completed.points.length >= 2) {
        this.smoothedCache[completed.id] = DrawingEngine.smoothStroke(completed.points);
      }
    }
  }

  private removeLastStroke(device: DeviceRole): void {
    const strokes = this.state.strokes.slice();
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (strokes[i].device === device) {
        this.undoneStrokeIds.push(strokes[i].id);
        delete this.smoothedCache[strokes[i].id];
        strokes.splice(i, 1);
        break;
      }
    }
    const hostScore = this.calcScoreFromStrokes(strokes, DeviceRole.HOST);
    const guestScore = this.calcScoreFromStrokes(strokes, DeviceRole.GUEST);
    this.updateState({ strokes, hostScore, guestScore });
  }

  // ============ 公共查询方法 ============

  getStrokes(): StrokeData[] {
    return this.state.strokes;
  }

  getTheme(): string {
    return this.state.theme;
  }

  getSmoothedPoints(strokeId: string): Point[] | null {
    return this.smoothedCache[strokeId] || null;
  }

  /** 缓存已平滑的点 (供 UI 写回) */
  cacheSmoothedPoints(strokeId: string, points: Point[]): void {
    this.smoothedCache[strokeId] = points;
  }

  /** 获取当前进行中的笔触信息 (用于增量渲染) */
  getCurrentStrokeInfo(): { points: Point[]; color: string; width: number; opacity: number; tool: string } | null {
    if (!this.currentStroke) return null;
    return {
      points: this.currentStroke.points.slice(),
      color: this.currentStroke.color,
      width: this.currentStroke.width,
      opacity: this.currentStroke.opacity,
      tool: this.currentStroke.tool
    };
  }

  private randomTheme(): string {
    return DRAWING_THEMES[Math.floor(Math.random() * DRAWING_THEMES.length)];
  }

  // ============ 静态工具 ============

  /** Catmull-Rom 样条插值平滑 */
  static smoothStroke(rawPoints: Point[]): Point[] {
    if (rawPoints.length < 3) return rawPoints;
    const smoothed: Point[] = [];
    const step = 0.1;

    for (let i = 0; i < rawPoints.length - 1; i++) {
      const p0 = rawPoints[Math.max(0, i - 1)];
      const p1 = rawPoints[i];
      const p2 = rawPoints[Math.min(rawPoints.length - 1, i + 1)];
      const p3 = rawPoints[Math.min(rawPoints.length - 1, i + 2)];

      for (let t = 0; t < 1; t += step) {
        const tt = t * t;
        const ttt = tt * t;
        const x = 0.5 * (
          2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt
        );
        const y = 0.5 * (
          2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt
        );
        smoothed.push({ x, y, pressure: p1.pressure || 0.5 });
      }
    }
    return smoothed;
  }
}
