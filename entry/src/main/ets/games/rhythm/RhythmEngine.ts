import { BaseGameEngine } from '../../common/base/BaseGameEngine';
import { GameConfig, GameInput, GameResult, SyncPacket, GamePhase, GameType, DeviceRole, ErrorCode } from '../../common/types/GameTypes';
import { RHYTHM_DIFFICULTIES, JUDGE_WINDOWS, SYNC_WINDOWS, SCORES } from '../../constants/GameConstants';

// ---------- 类型 ----------

interface Beat {
  index: number;
  trackIndex: number;
  time: number;
  noteType: 'normal' | 'long' | 'slide';
}

interface TapResult {
  beatIndex: number;
  trackIndex: number;
  tapTime: number;
  device: DeviceRole;
}

interface JudgeResult {
  beatIndex: number;
  hostDeviation: number | null;
  guestDeviation: number | null;
  syncDeviation: number | null;
  hostJudge: string;
  guestJudge: string;
  syncJudge: string;
  score: number;
}

interface RhythmState {
  gameType: GameType;
  phase: GamePhase;
  round: number;
  hostScore: number;
  guestScore: number;
  myRole: DeviceRole;
  beats: Beat[];
  bpm: number;
  startTime: number;
  hostTaps: TapResult[];
  guestTaps: TapResult[];
  roundResults: JudgeResult[];
  currentRound: number;
  totalRounds: number;
}

// ---------- 连击追踪器 ----------

interface RhythmComboState {
  combo: number;
  maxCombo: number;
  comboMultiplier: number;
  isComboActive: boolean;
}

export class RhythmComboTracker {
  private state: RhythmComboState = {
    combo: 0, maxCombo: 0, comboMultiplier: 1.0, isComboActive: true
  };

  onJudge(grade: string): number {
    if (grade === 'Perfect') {
      this.state.combo++;
      this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo);
      this.state.isComboActive = true;
    } else if (grade === 'Great') {
      this.state.combo++;
      this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo);
      this.state.isComboActive = true;
    } else if (grade === 'Good') {
      // 维持连击但不增加计数
    } else if (grade === 'Miss') {
      this.state.combo = 0;
      this.state.isComboActive = false;
    }

    this.state.comboMultiplier = this.calcMultiplier(this.state.combo);
    return this.state.comboMultiplier;
  }

  private calcMultiplier(combo: number): number {
    if (combo >= 10) return 5.0;
    if (combo >= 5) return 3.0;
    if (combo >= 3) return 2.0;
    if (combo >= 2) return 1.5;
    return 1.0;
  }

  getComboCount(): number { return this.state.combo; }
  getMaxCombo(): number { return this.state.maxCombo; }
  getMultiplier(): number { return this.state.comboMultiplier; }

  getEffectiveScore(baseScore: number): number {
    return Math.round(baseScore * this.state.comboMultiplier);
  }

  reset(): void {
    this.state = { combo: 0, maxCombo: 0, comboMultiplier: 1.0, isComboActive: true };
  }
}

// ---------- 引擎实现 ----------

export class RhythmEngine extends BaseGameEngine<RhythmState> {
  private difficulty: number = 1;
  private combo: RhythmComboTracker = new RhythmComboTracker();
  private autoJudgeTimerId: number = 0;
  private countdownTimerId: number = 0;
  private readonly COUNTDOWN_MS = 3000;
  private readonly INTER_ROUND_MS = 1500; // 回合间间隔

  constructor() {
    super({
      gameType: GameType.RHYTHM_SYNC,
      phase: GamePhase.WAITING,
      round: 0,
      hostScore: 0,
      guestScore: 0,
      myRole: DeviceRole.HOST,
      beats: [],
      bpm: 90,
      startTime: 0,
      hostTaps: [],
      guestTaps: [],
      roundResults: [],
      currentRound: 0,
      totalRounds: 5
    });
  }

  init(config: GameConfig): void {
    this.difficulty = config.difficulty || 1;
    this.combo.reset();
    this.clearReplayCache();
    this.clearAllTimers();
    this.updateState({
      myRole: config.myRole,
      totalRounds: config.roundCount || 5,
      currentRound: 0,
      hostScore: 0,
      guestScore: 0,
      roundResults: [],
      beats: [],
      hostTaps: [],
      guestTaps: [],
      phase: GamePhase.WAITING
    });
  }

  handleInput(input: GameInput): void {
    switch (input.type) {
      case 'TAP':
        this.onTap(
          input.data['beatIndex'] as number,
          input.data['trackIndex'] as number
        );
        break;
      case 'SELECT_DIFFICULTY':
        this.difficulty = input.data['difficulty'] as number;
        break;
      case 'START_GAME':
        this.startGame();
        break;
    }
  }

  handleSync(packet: SyncPacket): void {
    if (this.isReplay(packet)) return;
    if (packet.from === this.state.myRole) return;

    switch (packet.type) {
      case 'GAME_START':
        this.onRemoteGameStart(packet.payload);
        break;
      case 'TAP':
        this.onRemoteTap(packet);
        break;
      case 'ROUND_RESULT':
        this.onRoundResult(packet.payload);
        break;
      case 'NEW_ROUND':
        this.onNewRound(packet.payload);
        break;
      case 'GAME_OVER':
        this.onGameOver();
        break;
    }
  }

  getScore(): { host: number; guest: number } {
    return { host: this.state.hostScore, guest: this.state.guestScore };
  }

  isGameOver(): boolean {
    return this.state.phase === GamePhase.FINISHED;
  }

  getResult(): GameResult {
    const { hostScore, guestScore } = this.state;
    let winner: DeviceRole | 'draw' = 'draw';
    if (hostScore > guestScore) winner = DeviceRole.HOST;
    else if (guestScore > hostScore) winner = DeviceRole.GUEST;

    const totalBeats = this.state.roundResults.length;
    const syncPerfects = this.state.roundResults.filter(r => r.syncJudge === 'Perfect').length;

    return {
      gameType: GameType.RHYTHM_SYNC,
      hostScore,
      guestScore,
      winner,
      syncRate: totalBeats > 0 ? (syncPerfects / totalBeats) * 100 : 0,
      details: {
        totalRounds: this.state.totalRounds,
        difficulty: this.difficulty,
        roundResults: this.state.roundResults
      }
    };
  }

  cleanup(): void {
    this.clearAllTimers();
  }

  // ============ 游戏逻辑 ============

  private generateRound(): void {
    const cfg = RHYTHM_DIFFICULTIES[this.difficulty as 1 | 2 | 3];
    const beatDuration = 60000 / cfg.bpm;
    const totalBeats = cfg.beatsPerBar * cfg.totalBars;
    const beats: Beat[] = [];

    // 回合递增难度: 后续回合音符密度渐增, 创造高潮感
    const roundFactor = Math.min(this.state.currentRound, this.state.totalRounds - 1)
      / Math.max(1, this.state.totalRounds - 1); // 0.0 → 1.0
    const effectiveDensity = cfg.noteDensity + roundFactor * 0.15; // 最多加 15% 密度

    let timeOffset = 0;
    for (let i = 0; i < totalBeats; i++) {
      if (Math.random() < effectiveDensity) {
        const trackCount = Math.random() < 0.8 ? 1 : 2;
        const usedTracks: number[] = [];
        for (let t = 0; t < trackCount; t++) {
          let track: number;
          do {
            track = Math.floor(Math.random() * 4);
          } while (usedTracks.includes(track));
          usedTracks.push(track);
          beats.push({
            index: i,
            trackIndex: track,
            time: timeOffset,
            noteType: 'normal'
          });
        }
      }
      timeOffset += beatDuration;
    }

    if (beats.length === 0) {
      beats.push({
        index: 0,
        trackIndex: 0,
        time: beatDuration,
        noteType: 'normal'
      });
    }

    const nextRound = this.state.currentRound + 1;
    // 不在 generateRound 中设置 startTime，由 startGame 统一设置，避免双重 updateState
    this.updateState({
      beats,
      bpm: cfg.bpm,
      currentRound: nextRound,
      hostTaps: [],
      guestTaps: []
    });
  }

  private startGame(): void {
    // 防止重复启动 + 只有 HOST 可以启动游戏（GUEST 等待 HOST 的 GAME_START 同步）
    if (this.state.phase !== GamePhase.WAITING) return;
    if (this.state.myRole !== DeviceRole.HOST) return;
    this.clearAllTimers();

    // 只有 HOST 生成节拍，保证双方一致
    if (this.state.myRole === DeviceRole.HOST) {
      this.generateRound();
    }
    const startTime = Date.now() + this.COUNTDOWN_MS;
    this.updateState({ phase: GamePhase.COUNTDOWN, startTime });

    this.sendSync('GAME_START', {
      beats: this.state.beats,
      bpm: this.state.bpm,
      startTime: startTime,
      difficulty: this.difficulty,
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds
    });

    // 3秒倒计时后进入 PLAYING
    this.countdownTimerId = setTimeout(() => {
      this.countdownTimerId = 0;
      if (this.state.phase === GamePhase.FINISHED) return;
      this.updateState({ phase: GamePhase.PLAYING });
      this.scheduleAutoJudge();
    }, this.COUNTDOWN_MS);
  }

  /**
   * 安排当前回合的自动判定
   * 只由 HOST 执行判定和回合推进，避免双设备重复判定
   */
  private scheduleAutoJudge(): void {
    const cfg = RHYTHM_DIFFICULTIES[this.difficulty as 1 | 2 | 3];
    const musicDuration = (60000 / cfg.bpm) * cfg.beatsPerBar * cfg.totalBars + 1000;

    this.autoJudgeTimerId = setTimeout(() => {
      this.autoJudgeTimerId = 0;
      if (this.state.phase !== GamePhase.PLAYING) return;

      // HOST 为主判定方: 计算同步奖励并发送结果
      if (this.state.myRole === DeviceRole.HOST) {
        this.judgeRound();
      }

      if (this.state.currentRound >= this.state.totalRounds) {
        this.updateState({ phase: GamePhase.FINISHED });
        this.sendSync('GAME_OVER', {});
      } else {
        // HOST 生成下一回合并同步给 GUEST
        if (this.state.myRole === DeviceRole.HOST) {
          this.generateRound();
          const newStartTime = Date.now() + this.INTER_ROUND_MS;
          this.updateState({ startTime: newStartTime, phase: GamePhase.COUNTDOWN });
          this.sendSync('NEW_ROUND', {
            beats: this.state.beats,
            bpm: this.state.bpm,
            startTime: newStartTime,
            round: this.state.currentRound
          });
          // 等间隔后开始下一回合
          this.countdownTimerId = setTimeout(() => {
            this.countdownTimerId = 0;
            if (this.state.phase === GamePhase.FINISHED) return;
            this.updateState({ phase: GamePhase.PLAYING });
            this.scheduleAutoJudge();
          }, this.INTER_ROUND_MS);
        }
        // GUEST 由 onNewRound 驱动下一回合
      }
    }, musicDuration);
  }

  private onTap(beatIndex: number, trackIndex: number): void {
    if (this.state.phase !== GamePhase.PLAYING) return;

    // 防止重复点击同一音符
    const myTaps = this.state.myRole === DeviceRole.HOST
      ? this.state.hostTaps : this.state.guestTaps;
    const alreadyTapped = myTaps.some(t => t.beatIndex === beatIndex && t.trackIndex === trackIndex);
    if (alreadyTapped) return;

    const tapTime = Date.now();
    const tap: TapResult = {
      beatIndex,
      trackIndex,
      tapTime,
      device: this.state.myRole
    };

    // 计算即时得分
    const beat = this.state.beats.find(b => b.index === beatIndex && b.trackIndex === trackIndex);
    let tapScore = 0;
    if (beat) {
      const deviation = Math.abs(tapTime - (this.state.startTime + beat.time));
      if (deviation <= JUDGE_WINDOWS.PERFECT) tapScore = SCORES.PERFECT;
      else if (deviation <= JUDGE_WINDOWS.GREAT) tapScore = SCORES.GREAT;
      else if (deviation <= JUDGE_WINDOWS.GOOD) tapScore = SCORES.GOOD;
    }

    // 合并 taps + score 为单次 updateState
    if (this.state.myRole === DeviceRole.HOST) {
      this.updateState({
        hostTaps: this.state.hostTaps.concat([tap]),
        hostScore: this.state.hostScore + tapScore
      });
    } else {
      this.updateState({
        guestTaps: this.state.guestTaps.concat([tap]),
        guestScore: this.state.guestScore + tapScore
      });
      // GUEST 实时更新 combo，提供即时视觉反馈
      // HOST 的权威 combo 会在 onRoundResult 中覆盖
      if (beat) {
        const deviation = Math.abs(tapTime - (this.state.startTime + beat.time));
        const myJudge = this.judgeDeviation(deviation);
        this.combo.onJudge(myJudge);
      }
    }

    this.sendSync('TAP', {
      beatIndex,
      trackIndex,
      tapTime,
      device: this.state.myRole
    });
  }

  private onRemoteGameStart(data: Record<string, number | string | boolean | Object | undefined>): void {
    this.clearAllTimers();
    // 同步难度设置 (BUG-13 fix)
    if (data['difficulty'] !== undefined) {
      this.difficulty = data['difficulty'] as number;
    }

    this.updateState({
      beats: data['beats'] as Beat[],
      bpm: data['bpm'] as number,
      startTime: data['startTime'] as number,
      currentRound: data['round'] as number,
      totalRounds: data['totalRounds'] as number,
      hostTaps: [],
      guestTaps: [],
      phase: GamePhase.COUNTDOWN
    });

    // 客机也启动倒计时
    const delay = Math.max(0, (data['startTime'] as number) - Date.now());
    this.countdownTimerId = setTimeout(() => {
      this.countdownTimerId = 0;
      if (this.state.phase === GamePhase.FINISHED) return;
      this.updateState({ phase: GamePhase.PLAYING });
      // GUEST 不运行 scheduleAutoJudge，等待 HOST 的 ROUND_RESULT / NEW_ROUND / GAME_OVER
    }, delay);
  }

  private onRemoteTap(packet: SyncPacket): void {
    const data = packet.payload;
    const tapTime = data['tapTime'] as number;
    const tap: TapResult = {
      beatIndex: data['beatIndex'] as number,
      trackIndex: data['trackIndex'] as number,
      tapTime,
      device: data['device'] as DeviceRole
    };

    // 计算即时得分（与本地 onTap 逻辑一致）
    const beat = this.state.beats.find(b => b.index === tap.beatIndex && b.trackIndex === tap.trackIndex);
    let tapScore = 0;
    if (beat) {
      const deviation = Math.abs(tapTime - (this.state.startTime + beat.time));
      if (deviation <= JUDGE_WINDOWS.PERFECT) tapScore = SCORES.PERFECT;
      else if (deviation <= JUDGE_WINDOWS.GREAT) tapScore = SCORES.GREAT;
      else if (deviation <= JUDGE_WINDOWS.GOOD) tapScore = SCORES.GOOD;
    }

    if (tap.device === DeviceRole.HOST) {
      this.updateState({
        hostTaps: this.state.hostTaps.concat([tap]),
        hostScore: this.state.hostScore + tapScore
      });
    } else {
      this.updateState({
        guestTaps: this.state.guestTaps.concat([tap]),
        guestScore: this.state.guestScore + tapScore
      });
    }
  }

  judgeRound(): void {
    const results: JudgeResult[] = [];
    let syncBonusHost = 0;
    let syncBonusGuest = 0;

    for (const beat of this.state.beats) {
      const hostTap = this.state.hostTaps.find(
        t => t.beatIndex === beat.index && t.trackIndex === beat.trackIndex
      );
      const guestTap = this.state.guestTaps.find(
        t => t.beatIndex === beat.index && t.trackIndex === beat.trackIndex
      );

      const hostDeviation = hostTap ? Math.abs(hostTap.tapTime - (this.state.startTime + beat.time)) : null;
      const guestDeviation = guestTap ? Math.abs(guestTap.tapTime - (this.state.startTime + beat.time)) : null;
      const syncDeviation = (hostTap && guestTap)
        ? Math.abs(hostTap.tapTime - guestTap.tapTime) : null;

      const hostJudge = this.judgeDeviation(hostDeviation);
      const guestJudge = this.judgeDeviation(guestDeviation);

      // 同步奖励: 双方都按时则额外加分（个体分已在 onTap 中计入）
      // 使用半分基础值作为同步奖励，避免双重满额计分
      let syncJudge = 'Miss';
      let syncScore = 0;
      if (syncDeviation !== null) {
        if (syncDeviation <= SYNC_WINDOWS.PERFECT) { syncJudge = 'Perfect'; syncScore = Math.round(SCORES.PERFECT / 2); }
        else if (syncDeviation <= SYNC_WINDOWS.GREAT) { syncJudge = 'Great'; syncScore = Math.round(SCORES.GREAT / 2); }
        else if (syncDeviation <= SYNC_WINDOWS.GOOD) { syncJudge = 'Good'; syncScore = Math.round(SCORES.GOOD / 2); }
      }

      // 连击追踪: 用个体判定，不用同步判定
      const myJudge = this.state.myRole === DeviceRole.HOST ? hostJudge : guestJudge;
      this.combo.onJudge(myJudge);
      syncScore = this.combo.getEffectiveScore(syncScore);

      // 同步奖励各加一半
      const halfSync = Math.round(syncScore / 2);
      syncBonusHost += halfSync;
      syncBonusGuest += halfSync;

      results.push({
        beatIndex: beat.index,
        hostDeviation, guestDeviation, syncDeviation,
        hostJudge, guestJudge, syncJudge,
        score: syncScore
      });
    }

    // Miss penalty: 未被点击的音符扣分
    let missPenaltyHost = 0;
    let missPenaltyGuest = 0;
    for (const beat of this.state.beats) {
      const hostTapped = this.state.hostTaps.some(t => t.beatIndex === beat.index && t.trackIndex === beat.trackIndex);
      const guestTapped = this.state.guestTaps.some(t => t.beatIndex === beat.index && t.trackIndex === beat.trackIndex);
      if (!hostTapped) missPenaltyHost += 5;
      if (!guestTapped) missPenaltyGuest += 5;
    }
    syncBonusHost -= missPenaltyHost;
    syncBonusGuest -= missPenaltyGuest;

    // 只加同步奖励（个体分已在 onTap 中即时计入）
    const newResults = this.state.roundResults.concat(results);
    this.updateState({
      hostScore: this.state.hostScore + syncBonusHost,
      guestScore: this.state.guestScore + syncBonusGuest,
      roundResults: newResults
    });

    this.sendSync('ROUND_RESULT', {
      results,
      hostTotal: this.state.hostScore,
      guestTotal: this.state.guestScore
    });
  }

  private onRoundResult(data: Record<string, number | string | boolean | Object | undefined>): void {
    // GUEST 接收 HOST 的权威分数，直接覆盖
    const results = data['results'] as JudgeResult[];
    // 更新 GUEST 的 combo tracker（HOST 已在 judgeRound 中更新过自己的）
    // 重置 combo 再从权威结果重建，避免与实时更新双计
    if (this.state.myRole === DeviceRole.GUEST) {
      this.combo.reset();
      for (const r of results) {
        const myJudge = r.guestJudge;
        this.combo.onJudge(myJudge);
      }
    }
    this.updateState({
      hostScore: data['hostTotal'] as number,
      guestScore: data['guestTotal'] as number,
      roundResults: this.state.roundResults.concat(results)
    });
  }

  private judgeDeviation(deviation: number | null): string {
    if (deviation === null) return 'Miss';
    if (deviation <= JUDGE_WINDOWS.PERFECT) return 'Perfect';
    if (deviation <= JUDGE_WINDOWS.GREAT) return 'Great';
    if (deviation <= JUDGE_WINDOWS.GOOD) return 'Good';
    return 'Miss';
  }

  private onGameOver(): void {
    this.clearAllTimers();
    this.updateState({ phase: GamePhase.FINISHED });
  }

  /**
   * GUEST 收到 HOST 的新回合通知
   * 同步新回合的节拍和 startTime
   */
  private onNewRound(data: Record<string, number | string | boolean | Object | undefined>): void {
    // 防止过期或乱序的 NEW_ROUND 消息破坏当前状态
    const incomingRound = data['round'] as number;
    if (this.state.phase === GamePhase.FINISHED) return;
    if (incomingRound <= this.state.currentRound) return;

    this.clearAllTimers();
    this.updateState({
      beats: data['beats'] as Beat[],
      bpm: data['bpm'] as number,
      startTime: data['startTime'] as number,
      currentRound: data['round'] as number,
      hostTaps: [],
      guestTaps: [],
      phase: GamePhase.COUNTDOWN
    });
    // 等待间隔后进入 PLAYING，但不运行 scheduleAutoJudge（由 HOST 驱动判定和回合推进）
    const delay = Math.max(0, (data['startTime'] as number) - Date.now());
    this.countdownTimerId = setTimeout(() => {
      this.countdownTimerId = 0;
      if (this.state.phase === GamePhase.FINISHED) return;
      this.updateState({ phase: GamePhase.PLAYING });
      // GUEST 等待 HOST 的 ROUND_RESULT / NEW_ROUND / GAME_OVER
    }, delay);
  }

  getCombo(): RhythmComboTracker {
    return this.combo;
  }

  /** 获取当前回合歌曲总时长 (ms) */
  getTotalDuration(): number {
    const cfg = RHYTHM_DIFFICULTIES[this.difficulty as 1 | 2 | 3];
    return (60000 / cfg.bpm) * cfg.beatsPerBar * cfg.totalBars;
  }

  private clearAllTimers(): void {
    if (this.autoJudgeTimerId) {
      clearTimeout(this.autoJudgeTimerId);
      this.autoJudgeTimerId = 0;
    }
    if (this.countdownTimerId) {
      clearTimeout(this.countdownTimerId);
      this.countdownTimerId = 0;
    }
  }
}
