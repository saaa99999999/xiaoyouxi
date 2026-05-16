import { RhythmEngine } from './RhythmEngine';
import { GameType, DeviceRole, GamePhase, SyncPacket, GameResult } from '../../common/types/GameTypes';
import { SyncManager } from '../../common/manager/SyncManager';
import { SessionManager } from '../../common/manager/SessionManager';
import { SoundManager } from '../../common/manager/SoundManager';
import { HapticManager } from '../../common/manager/HapticManager';
import { JUDGE_WINDOWS, RHYTHM_DIFFICULTIES } from '../../constants/GameConstants';
import { ScreenUtils } from '../../common/utils/ScreenUtils';

/**
 * 节奏共鸣游戏
 *
 * 架构: 游戏进行中所有动态内容（分数/combo/判定/音符）全部在 Canvas 上绘制，
 * 不触发任何 @State 更新，实现零 ArkUI 重渲染，彻底消除卡顿。
 *
 * @State 只在阶段切换时更新 (COUNTDOWN/PLAYING/FINISHED)。
 */

@Component
export struct RhythmGame {
  @Link gamePhase: GamePhase;
  @Prop @Watch('onRestart') restartKey: number = 0;
  // 仅用于阶段切换显示倒计时
  @State countdownNum: number = 3;
  @State selectedDifficulty: number = 1;
  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);
  private engine: RhythmEngine = new RhythmEngine();
  private animFrameId: number = 0;
  private syncMgr = SyncManager.getInstance();
  private trackColors: string[] = ['#007DFF', '#FF6B35', '#00C853', '#9C27B0'];
  private isRendering: boolean = false;
  private countdownTimerId: number = 0;
  private screen = ScreenUtils.getInstance();
  private difficultyLabels: string[] = ['简单', '普通', '困难'];
  private difficultyColors: string[] = ['#4CAF50', '#FF9800', '#F44336'];
  // 判定飘字: 非 @State，由 Canvas 绘制
  private judgeText: string = '';
  private judgeColor: string = '';
  private judgeShowUntil: number = 0;
  onGameFinished?: (result: GameResult) => void;

  aboutToAppear(): void {
    const myRole = SessionManager.getInstance().getMyRole() || DeviceRole.HOST;
    this.engine.setSyncCallback((packet: SyncPacket) => {
      this.syncMgr.push('rhythm', packet);
    });
    this.engine.setStateChangeCallback((state) => {
      // 只处理阶段切换，不更新分数/combo (@State 变更会导致 ArkUI 重渲染 → 卡顿)
      if (state.phase === GamePhase.COUNTDOWN) {
        const remaining = Math.ceil((state.startTime - Date.now()) / 1000);
        this.countdownNum = Math.max(0, Math.min(3, remaining));
        this.gamePhase = GamePhase.COUNTDOWN;
        // 启动倒计时递减定时器
        if (this.countdownTimerId === 0) {
          this.countdownTimerId = setInterval(() => {
            const rem = Math.ceil((this.engine.getState().startTime - Date.now()) / 1000);
            const num = Math.max(0, Math.min(3, rem));
            if (num !== this.countdownNum) {
              this.countdownNum = num;
            }
            if (num <= 0) {
              clearInterval(this.countdownTimerId);
              this.countdownTimerId = 0;
            }
          }, 500);
        }
      }
      if (state.phase === GamePhase.PLAYING) {
        this.gamePhase = GamePhase.PLAYING;
      }
      if (state.phase === GamePhase.FINISHED && this.gamePhase !== GamePhase.FINISHED) {
        this.gamePhase = GamePhase.FINISHED;
        this.isRendering = false;
        if (this.onGameFinished) this.onGameFinished(this.engine.getResult());
      }
    });

    this.engine.init({
      gameType: GameType.RHYTHM_SYNC,
      myRole: myRole,
      difficulty: this.selectedDifficulty,
      roundCount: 3
    });

    this.syncMgr.onDataChangePrefix('rhythm', (_key: string, value: Object) => {
      this.engine.handleSync(value as SyncPacket);
    });
    // 不自动开始 — 等待用户选择难度后点击开始
  }

  aboutToDisappear(): void {
    this.isRendering = false;
    if (this.animFrameId) {
      clearTimeout(this.animFrameId);
      this.animFrameId = 0;
    }
    if (this.countdownTimerId) {
      clearInterval(this.countdownTimerId);
      this.countdownTimerId = 0;
    }
    this.engine.cleanup();
    this.syncMgr.offDataChangePrefix('rhythm');
  }

  onRestart(): void {
    this.isRendering = false;
    if (this.animFrameId) {
      clearTimeout(this.animFrameId);
      this.animFrameId = 0;
    }
    if (this.countdownTimerId) {
      clearInterval(this.countdownTimerId);
      this.countdownTimerId = 0;
    }
    const myRole = SessionManager.getInstance().getMyRole() || DeviceRole.HOST;
    this.engine.init({
      gameType: GameType.RHYTHM_SYNC,
      myRole: myRole,
      difficulty: this.selectedDifficulty,
      roundCount: 3
    });
    this.countdownNum = 3;
    this.judgeText = '';
    this.judgeShowUntil = 0;
    this.engine.handleInput({ type: 'START_GAME', data: {} });
    this.startRenderLoop();
  }

  build() {
    Stack() {
      Column() {
        // Canvas 占满剩余空间，内部绘制分数/combo/判定/音符
        Canvas(this.context)
          .width('100%').layoutWeight(1)
          .onReady(() => {
            this.startRenderLoop();
          })
          .onTouch((event: TouchEvent) => {
            if (this.gamePhase !== GamePhase.PLAYING) return;
            if (event.type !== TouchType.Down) return;
            const x = event.touches[0].x;
            const w = this.context.width || 360;
            const trackIndex = Math.min(3, Math.max(0, Math.floor(x / (w / 4))));
            this.onTrackTap(trackIndex);
          });

        // 底部轨道按钮
        Row() {
          ForEach([0, 1, 2, 3], (track: number) => {
            Column() {
              Row().width(4).height(14).borderRadius(2)
                .backgroundColor(Color.White)
                .margin({ bottom: 4 });
            }
            .height(80)
            .backgroundColor(this.trackColors[track])
            .borderRadius(16)
            .justifyContent(FlexAlign.Center)
            .layoutWeight(1).margin({ left: 4, right: 4 })
            .onClick(() => { this.onTrackTap(track); });
          }, (track: number) => track.toString());
        }
        .width('100%').padding({ left: 8, right: 8, top: 6, bottom: 10 })
        .backgroundColor('#0D0D2B');
      }
      .width('100%').height('100%').backgroundColor('#0D0D2B')

      // 倒计时覆盖 — 仅在 COUNTDOWN 阶段显示
      if (this.gamePhase === GamePhase.COUNTDOWN) {
        Column() {
          Text(this.countdownNum > 0 ? `${this.countdownNum}` : 'GO!')
            .fontSize(72)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.countdownNum > 0 ? Color.White : '#00E676')
            .textAlign(TextAlign.Center);
        }
        .width('100%').height('100%')
        .backgroundColor('#0D0D2BDD')
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center);
      }

      // 难度选择覆盖 — 仅在 WAITING 阶段显示
      if (this.gamePhase === GamePhase.WAITING) {
        Column() {
          Text('节奏共鸣')
            .fontSize(this.screen.scaleFont(28)).fontWeight(FontWeight.Bold)
            .fontColor(Color.White).margin({ bottom: 8 });
          if (SessionManager.getInstance().getMyRole() === DeviceRole.GUEST) {
            Text('等待主机开始游戏...')
              .fontSize(this.screen.scaleFont(16)).fontColor('#90CAF9')
              .margin({ top: 24 });
            LoadingProgress().width(48).height(48).color('#90CAF9').margin({ top: 16 });
          } else {
            Text('选择难度')
              .fontSize(this.screen.scaleFont(14)).fontColor('#90CAF9').margin({ bottom: 16 });
            Row() {
              ForEach([1, 2, 3], (diff: number, index: number) => {
                Column() {
                  Text(this.difficultyLabels[index])
                    .fontSize(this.screen.scaleFont(16)).fontWeight(FontWeight.Bold)
                    .fontColor(this.selectedDifficulty === diff ? Color.White : '#BDBDBD');
                  Text(`${RHYTHM_DIFFICULTIES[diff as 1|2|3].bpm} BPM`)
                    .fontSize(this.screen.scaleFont(10)).fontColor('#90CAF9')
                    .margin({ top: 4 });
                }
                .width(90).padding({ top: 14, bottom: 14 })
                .backgroundColor(this.selectedDifficulty === diff ? this.difficultyColors[index] : '#1A1A4D')
                .borderRadius(12)
                .alignItems(HorizontalAlign.Center)
                .margin({ left: 6, right: 6 })
                .onClick(() => {
                  this.selectedDifficulty = diff;
                  SoundManager.getInstance().play('button_click');
                });
              }, (diff: number) => diff.toString());
            }
            .margin({ bottom: 24 });
            Button('开始游戏')
              .fontSize(this.screen.scaleFont(18)).fontWeight(FontWeight.Bold)
              .backgroundColor('#FF6B35').fontColor(Color.White)
              .width(180).height(52).borderRadius(26)
              .onClick(() => {
                SoundManager.getInstance().play('button_click');
                this.engine.handleInput({ type: 'START_GAME', data: {} });
              });
          }
        }
        .width('100%').height('100%')
        .backgroundColor('#0D0D2BEE')
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center);
      }
    }
    .width('100%').height('100%')
  }

  private onTrackTap(trackIndex: number): void {
    const now = Date.now();
    const state = this.engine.getState();
    const myTaps = state.myRole === DeviceRole.HOST ? state.hostTaps : state.guestTaps;
    const pendingBeats = state.beats.filter(b => {
      if (b.trackIndex !== trackIndex) return false;
      const alreadyTapped = myTaps.some(t => t.beatIndex === b.index && t.trackIndex === b.trackIndex);
      return !alreadyTapped;
    });
    if (pendingBeats.length > 0) {
      const elapsed = now - state.startTime;
      const nearest = pendingBeats.reduce((a, b) =>
        Math.abs(a.time - elapsed) < Math.abs(b.time - elapsed) ? a : b
      );
      this.engine.handleInput({ type: 'TAP', data: { beatIndex: nearest.index, trackIndex: trackIndex } });
      const expectedTime = state.startTime + nearest.time;
      const deviation = Math.abs(now - expectedTime);
      this.showJudgeFeedback(deviation);
    }
  }

  private showJudgeFeedback(deviation: number): void {
    if (deviation <= JUDGE_WINDOWS.PERFECT) {
      this.judgeText = 'Perfect!'; this.judgeColor = '#FFD700';
      SoundManager.getInstance().play('tap_perfect');
      HapticManager.getInstance().play('tap_perfect');
    } else if (deviation <= JUDGE_WINDOWS.GREAT) {
      this.judgeText = 'Great!'; this.judgeColor = '#4CAF50';
      SoundManager.getInstance().play('tap_great');
      HapticManager.getInstance().play('tap_great');
    } else if (deviation <= JUDGE_WINDOWS.GOOD) {
      this.judgeText = 'Good'; this.judgeColor = '#42A5F5';
      SoundManager.getInstance().play('tap_good');
      HapticManager.getInstance().play('tap_good');
    } else {
      this.judgeText = 'Miss'; this.judgeColor = '#FF5252';
      SoundManager.getInstance().play('tap_miss');
      HapticManager.getInstance().play('tap_miss');
    }
    this.judgeShowUntil = Date.now() + 600;
  }

  private startRenderLoop(): void {
    if (this.isRendering) return;
    this.isRendering = true;
    const render = () => {
      if (!this.isRendering) return;
      this.drawFrame(this.context);
      if (this.gamePhase === GamePhase.FINISHED) {
        this.isRendering = false;
        return;
      }
      this.animFrameId = setTimeout(render, 16);
    };
    this.animFrameId = setTimeout(render, 16);
  }

  private drawFrame(ctx: CanvasRenderingContext2D): void {
    const w = ctx.width;
    const h = ctx.height;
    if (w <= 0 || h <= 0) return;

    const sf = this.screen.getScaleFactor();
    const state = this.engine.getState();
    const now = Date.now();
    const elapsed = now - state.startTime;
    const myRole = state.myRole;
    const myScore = myRole === DeviceRole.HOST ? state.hostScore : state.guestScore;
    const partnerScore = myRole === DeviceRole.HOST ? state.guestScore : state.hostScore;
    const myTaps = myRole === DeviceRole.HOST ? state.hostTaps : state.guestTaps;
    const combo = this.engine.getCombo();
    const comboCount = combo.getComboCount();
    const isPlaying = this.gamePhase === GamePhase.PLAYING;

    ctx.clearRect(0, 0, w, h);

    // === 背景 ===
    ctx.fillStyle = '#0E0E30';
    ctx.fillRect(0, 0, w, h);

    // === 顶部状态栏 ===
    const headerH = 80 * sf;
    // 背景渐变
    const grad = ctx.createLinearGradient(0, 0, 0, headerH);
    grad.addColorStop(0, '#0D0D2B');
    grad.addColorStop(1, '#121240');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, headerH);

    // 底部分隔线
    ctx.strokeStyle = '#2A2A6D';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(w, headerH);
    ctx.stroke();

    // 第一行: 分数（大号） + Combo
    const row1Y = 36 * sf;

    // 我的分数 (左侧)
    ctx.fillStyle = '#42A5F5';
    ctx.font = `bold ${Math.round(36 * sf)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`${myScore}`, 24 * sf, row1Y);
    ctx.font = `${Math.round(12 * sf)}px sans-serif`;
    ctx.fillStyle = '#90CAF9';
    ctx.fillText('我', 24 * sf, row1Y + 18 * sf);

    // 对方分数 (右侧)
    ctx.fillStyle = '#FF8A65';
    ctx.font = `bold ${Math.round(36 * sf)}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`${partnerScore}`, w - 24 * sf, row1Y);
    ctx.font = `${Math.round(12 * sf)}px sans-serif`;
    ctx.fillStyle = '#FFAB91';
    ctx.fillText('对方', w - 24 * sf, row1Y + 18 * sf);

    // Combo (居中)
    if (comboCount >= 2) {
      ctx.fillStyle = '#FFD54F';
      ctx.font = `bold ${Math.round(24 * sf)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${comboCount}x`, w / 2, row1Y - 4 * sf);
      ctx.font = `${Math.round(10 * sf)}px sans-serif`;
      ctx.fillStyle = '#FFE082';
      ctx.fillText('COMBO', w / 2, row1Y + 12 * sf);
    } else {
      // 回合显示 (无 combo 时居中显示)
      ctx.fillStyle = '#90CAF9';
      ctx.font = `${Math.round(12 * sf)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`回合 ${state.currentRound}/${state.totalRounds}`, w / 2, row1Y + 4 * sf);
    }

    // 第二行: 进度条 (基于整首歌总时长，而非最后一个音符)
    const barY = 62 * sf;
    const barH = 6 * sf;
    const barPad = 24 * sf;
    const barW = w - barPad * 2;
    // 进度条背景
    ctx.fillStyle = '#FFFFFF15';
    ctx.fillRect(barPad, barY, barW, barH);
    // 进度条前景 — 基于当前回合的歌曲总时长
    if (state.beats.length > 0) {
      const totalDuration = this.engine.getTotalDuration();
      const progress = Math.min(1, Math.max(0, elapsed / totalDuration));
      const progGrad = ctx.createLinearGradient(barPad, 0, barPad + barW, 0);
      progGrad.addColorStop(0, '#FF6B35');
      progGrad.addColorStop(1, '#FFD54F');
      ctx.fillStyle = progGrad;
      ctx.fillRect(barPad, barY, barW * progress, barH);
    }

    // === 游戏区域 ===
    const gameTop = headerH;
    const judgeY = h * 0.78;
    const trackW = w / 4;

    // 轨道分割线
    ctx.strokeStyle = '#1A1A4D';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      ctx.moveTo(trackW * i, gameTop);
      ctx.lineTo(trackW * i, h);
    }
    ctx.stroke();

    // 判定线
    ctx.strokeStyle = '#FF525280';
    ctx.lineWidth = 4 * sf;
    ctx.beginPath();
    ctx.moveTo(0, judgeY);
    ctx.lineTo(w, judgeY);
    ctx.stroke();

    // 音符
    if (isPlaying) {
      const tappedSet = new Set<string>();
      for (const t of myTaps) {
        tappedSet.add(`${t.beatIndex}_${t.trackIndex}`);
      }

      for (const beat of state.beats) {
        const timeUntilJudge = beat.time - elapsed;
        if (timeUntilJudge > 3000 || timeUntilJudge < -800) continue;

        const progress = 1 - (timeUntilJudge / 3000);
        const y = gameTop + progress * (judgeY - gameTop);
        const x = trackW * beat.trackIndex + trackW / 2;

        const isTapped = tappedSet.has(`${beat.index}_${beat.trackIndex}`);
        const color = this.trackColors[beat.trackIndex] || '#007DFF';

        if (isTapped) {
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 12 * sf, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = `${color}20`;
          ctx.beginPath();
          ctx.arc(x, y, 28 * sf, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 16 * sf, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 底部遮罩
    ctx.fillStyle = '#0D0D2B90';
    ctx.fillRect(0, judgeY + 4 * sf, w, h - judgeY);

    // === 回合结束提示: 所有音符已过但还在等待判定 ===
    if (isPlaying && state.beats.length > 0) {
      const totalDuration = this.engine.getTotalDuration();
      if (elapsed > totalDuration + 500) {
        ctx.fillStyle = '#FFFFFF80';
        ctx.font = `${Math.round(16 * sf)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('判定中...', w / 2, judgeY - 20 * sf);
      }
    }

    // === 判定飘字 ===
    if (now < this.judgeShowUntil && this.judgeText) {
      ctx.font = `bold ${Math.round(60 * sf)}px sans-serif`;
      ctx.textAlign = 'center';
      const textW = ctx.measureText(this.judgeText).width || 120 * sf;
      // 半透明圆角背景
      const bgX = w / 2 - textW / 2 - 28 * sf;
      const bgY = judgeY - 120 * sf;
      const bgW = textW + 56 * sf;
      const bgH = 80 * sf;
      ctx.fillStyle = '#000000CC';
      ctx.beginPath();
      ctx.moveTo(bgX + 16 * sf, bgY);
      ctx.lineTo(bgX + bgW - 16 * sf, bgY);
      ctx.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + 16 * sf);
      ctx.lineTo(bgX + bgW, bgY + bgH - 16 * sf);
      ctx.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - 16 * sf, bgY + bgH);
      ctx.lineTo(bgX + 16 * sf, bgY + bgH);
      ctx.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + bgH - 16 * sf);
      ctx.lineTo(bgX, bgY + 16 * sf);
      ctx.quadraticCurveTo(bgX, bgY, bgX + 16 * sf, bgY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = this.judgeColor;
      ctx.fillText(this.judgeText, w / 2, judgeY - 60 * sf);
    }

    // === 同步指示: 双方都点击的音符显示同步光效 ===
    if (isPlaying) {
      const hostTaps = state.hostTaps;
      const guestTaps = state.guestTaps;
      for (const beat of state.beats) {
        const hostTap = hostTaps.find(t => t.beatIndex === beat.index && t.trackIndex === beat.trackIndex);
        const guestTap = guestTaps.find(t => t.beatIndex === beat.index && t.trackIndex === beat.trackIndex);
        if (hostTap && guestTap) {
          const syncDev = Math.abs(hostTap.tapTime - guestTap.tapTime);
          if (syncDev <= 100) { // 近乎完美同步
            const timeSinceSecond = now - Math.max(hostTap.tapTime, guestTap.tapTime);
            if (timeSinceSecond < 1000) {
              const alpha = 1 - timeSinceSecond / 1000;
              const x = trackW * beat.trackIndex + trackW / 2;
              ctx.globalAlpha = alpha;
              ctx.strokeStyle = '#FFD700';
              ctx.lineWidth = 3 * sf;
              ctx.beginPath();
              ctx.arc(x, judgeY, 30 * sf, 0, Math.PI * 2);
              ctx.stroke();
              // 内圈
              ctx.fillStyle = '#FFD70040';
              ctx.beginPath();
              ctx.arc(x, judgeY, 20 * sf, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1;
            }
          }
        }
      }
    }
  }
}
