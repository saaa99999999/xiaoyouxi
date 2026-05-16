import { BaseGameEngine } from '../../common/base/BaseGameEngine';
import { GameConfig, GameInput, GameResult, SyncPacket, GamePhase, GameType, DeviceRole } from '../../common/types/GameTypes';
import { pickRandom } from '../../common/utils/RandomUtils';
import { GameTimer } from '../../common/utils/TimerUtils';
import { Logger } from '../../common/utils/Logger';
import {
  WORD_CHAIN_CHARS_PER_DEVICE,
  WORD_CHAIN_MIN_WORD_LENGTH,
  WORD_CHAIN_MAX_WORD_LENGTH,
  WORD_CHAIN_TURN_TIMEOUT_MS,
  SCORES
} from '../../constants/GameConstants';

// ---------- 类型 ----------

interface WordChainState {
  gameType: GameType;
  phase: GamePhase;
  round: number;
  hostScore: number;
  guestScore: number;
  myRole: DeviceRole;
  hostChars: string[];
  guestChars: string[];
  wordHistory: string[];
  currentTurn: DeviceRole;
  lastChar: string;
  remainingTimeMs: number;
  skipCount: number;
}

type Dictionary = Record<string, string[]>;

const MAX_SKIPS = 6; // 连续跳过上限，防止游戏永不结束

// ---------- 引擎实现 ----------

export class WordChainEngine extends BaseGameEngine<WordChainState> {
  private dictionary: Dictionary = {};
  private turnTimer: GameTimer = new GameTimer();
  private allChars: string[] = [];

  constructor() {
    super({
      gameType: GameType.WORD_CHAIN,
      phase: GamePhase.WAITING,
      round: 0,
      hostScore: 0,
      guestScore: 0,
      myRole: DeviceRole.HOST,
      hostChars: [],
      guestChars: [],
      wordHistory: [],
      currentTurn: DeviceRole.HOST,
      lastChar: '',
      remainingTimeMs: WORD_CHAIN_TURN_TIMEOUT_MS,
      skipCount: 0
    });
  }

  init(config: GameConfig): void {
    this.clearReplayCache();
    this.turnTimer.stop();
    this.updateState({
      myRole: config.myRole,
      hostScore: 0,
      guestScore: 0,
      wordHistory: [],
      lastChar: '',
      currentTurn: DeviceRole.HOST,
      hostChars: [],
      guestChars: [],
      phase: GamePhase.WAITING,
      skipCount: 0
    });
  }

  /** 加载词典 (由 GamePage 在 init 之前调用) */
  loadDictionary(words: string[]): void {
    this.dictionary = this.buildIndex(words);
    const charSet: string[] = [];
    for (const w of words) {
      for (let i = 0; i < w.length; i++) {
        const ch = w.charAt(i);
        if (!charSet.includes(ch)) {
          charSet.push(ch);
        }
      }
    }
    this.allChars = charSet;
  }

  /** 开始新游戏 (仅 HOST 调用) */
  startGame(): void {
    if (this.state.myRole !== DeviceRole.HOST) return;
    if (this.allChars.length === 0) {
      Logger.warn('WordChain', 'No characters available, cannot start game');
      return;
    }

    const selected = pickRandom(this.allChars, WORD_CHAIN_CHARS_PER_DEVICE * 2);
    const hostChars = selected.slice(0, WORD_CHAIN_CHARS_PER_DEVICE);
    const guestChars = selected.slice(WORD_CHAIN_CHARS_PER_DEVICE);

    this.updateState({
      hostChars, guestChars,
      phase: GamePhase.PLAYING,
      currentTurn: DeviceRole.HOST,
      skipCount: 0
    });

    this.sendSync('GAME_START', { hostChars, guestChars });
    this.startTurnTimer();
  }

  handleInput(input: GameInput): void {
    if (this.state.phase !== GamePhase.PLAYING) return;
    if (this.state.currentTurn !== this.state.myRole) return;

    switch (input.type) {
      case 'SUBMIT_WORD':
        this.submitWord(
          input.data['word'] as string,
          input.data['usedChars'] as string[]
        );
        break;
      case 'SKIP_TURN':
        this.skipTurn();
        break;
    }
  }

  handleSync(packet: SyncPacket): void {
    if (this.isReplay(packet)) return;
    if (packet.from === this.state.myRole) return;

    const data = packet.payload;
    switch (packet.type) {
      case 'GAME_START':
        this.updateState({
          hostChars: data['hostChars'] as string[],
          guestChars: data['guestChars'] as string[],
          phase: GamePhase.PLAYING,
          currentTurn: DeviceRole.HOST,
          skipCount: 0
        });
        // 只有当前回合的设备启动定时器
        if (this.state.myRole === this.state.currentTurn) {
          this.startTurnTimer();
        }
        break;
      case 'WORD_ACCEPTED':
        this.onWordAccepted(data);
        break;
      case 'WORD_REJECTED':
        Logger.warn('WordChain', `Word rejected: ${data['reason']}`);
        break;
      case 'TURN_SKIPPED':
        this.onTurnSkipped();
        break;
      case 'REFILL_CHARS':
        this.onRefillChars(data);
        break;
      case 'GAME_OVER':
        this.turnTimer.stop();
        this.updateState({ phase: GamePhase.FINISHED });
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
    const longest = this.state.wordHistory.reduce(
      (a, b) => a.length >= b.length ? a : b, ''
    );
    return {
      gameType: GameType.WORD_CHAIN,
      hostScore: this.state.hostScore,
      guestScore: this.state.guestScore,
      winner: this.state.hostScore > this.state.guestScore ? DeviceRole.HOST
        : this.state.guestScore > this.state.hostScore ? DeviceRole.GUEST : 'draw',
      details: {
        wordCount: this.state.wordHistory.length,
        wordHistory: this.state.wordHistory,
        longestWord: longest
      }
    };
  }

  cleanup(): void {
    this.turnTimer.stop();
  }

  // ============ 词典操作 ============

  private buildIndex(words: string[]): Dictionary {
    const index: Dictionary = {};
    const seen: string[] = [];
    for (const word of words) {
      if (seen.includes(word)) continue;
      seen.push(word);
      if (word.length < WORD_CHAIN_MIN_WORD_LENGTH || word.length > WORD_CHAIN_MAX_WORD_LENGTH) continue;
      const firstChar = word[0];
      if (!index[firstChar]) {
        index[firstChar] = [];
      }
      index[firstChar].push(word);
    }
    return index;
  }

  findValidWords(firstChar: string, charPool: string[]): string[] {
    const candidates = this.dictionary[firstChar] || [];
    return candidates.filter(word => this.canFormWord(word, charPool));
  }

  canFormWord(word: string, charPool: string[]): boolean {
    const pool = charPool.slice();
    for (const char of word) {
      const idx = pool.indexOf(char);
      if (idx === -1) return false;
      pool.splice(idx, 1);
    }
    return true;
  }

  validateWord(word: string, charPool: string[]): string | null {
    if (word.length < WORD_CHAIN_MIN_WORD_LENGTH || word.length > WORD_CHAIN_MAX_WORD_LENGTH) {
      return 'invalid_length';
    }
    if (this.state.lastChar && word[0] !== this.state.lastChar) {
      return 'wrong_first_char';
    }
    if (!this.canFormWord(word, charPool)) {
      return 'chars_not_in_pool';
    }
    const firstCharWords = this.dictionary[word[0]] || [];
    if (!firstCharWords.includes(word)) {
      return 'not_in_dict';
    }
    // 检查重复词
    if (this.state.wordHistory.includes(word)) {
      return 'already_used';
    }
    return null;
  }

  // ============ 游戏逻辑 ============

  private submitWord(word: string, usedChars: string[]): void {
    const myChars = this.state.myRole === DeviceRole.HOST
      ? this.state.hostChars : this.state.guestChars;
    const error = this.validateWord(word, myChars);
    if (error) {
      this.sendSync('WORD_REJECTED', {
        player: this.state.myRole,
        reason: error
      });
      return;
    }

    // 验证 usedChars 和 word 的一致性
    const wordChars = word.split('');
    const usedSorted = usedChars.slice().sort();
    const wordSorted = wordChars.slice().sort();
    let charsMatch = usedSorted.length === wordSorted.length;
    if (charsMatch) {
      for (let i = 0; i < usedSorted.length; i++) {
        if (usedSorted[i] !== wordSorted[i]) {
          charsMatch = false;
          break;
        }
      }
    }
    // 如果 usedChars 不匹配 word，用 word 自身的字符来消耗
    const charsToConsume = charsMatch ? usedChars : wordChars;

    const pool = myChars.slice();
    for (const ch of charsToConsume) {
      const idx = pool.indexOf(ch);
      if (idx !== -1) pool.splice(idx, 1);
    }

    // BUG-7 fix: 合并所有 updateState 为最少调用
    const newHistory = this.state.wordHistory.concat([word]);
    const lastChar = word[word.length - 1];
    const nextTurn = this.state.currentTurn === DeviceRole.HOST ? DeviceRole.GUEST : DeviceRole.HOST;
    // 长度奖励: 2字=1分, 3字=2分, 4字=4分, 5字+=6分
    const wordScore = word.length <= 2 ? 1 : word.length === 3 ? 2 : word.length === 4 ? 4 : 6;

    if (this.state.myRole === DeviceRole.HOST) {
      this.updateState({
        hostChars: pool,
        hostScore: this.state.hostScore + wordScore,
        lastChar,
        wordHistory: newHistory,
        skipCount: 0,
        currentTurn: nextTurn
      });
    } else {
      this.updateState({
        guestChars: pool,
        guestScore: this.state.guestScore + wordScore,
        lastChar,
        wordHistory: newHistory,
        skipCount: 0,
        currentTurn: nextTurn
      });
    }

    this.sendSync('WORD_ACCEPTED', {
      word,
      player: this.state.myRole,
      usedChars: charsToConsume,
      hostScore: this.state.hostScore,
      guestScore: this.state.guestScore,
      lastChar
    });

    this.refillChars();
    this.turnTimer.stop();
    // W2 fix: 提交后也检查游戏结束
    this.checkGameEnd();
  }

  private skipTurn(): void {
    // BUG-3 fix: 只在自己回合才能跳过，防止远程定时器误触发
    if (this.state.currentTurn !== this.state.myRole) return;

    const newSkipCount = this.state.skipCount + 1;
    const nextTurn = this.state.currentTurn === DeviceRole.HOST
      ? DeviceRole.GUEST : DeviceRole.HOST;
    this.updateState({ skipCount: newSkipCount, currentTurn: nextTurn });
    this.sendSync('TURN_SKIPPED', {
      player: this.state.myRole,
      reason: 'manual_skip'
    });
    this.turnTimer.stop();
    // 只在轮到自己时启动定时器
    if (this.state.myRole === nextTurn) {
      this.startTurnTimer();
    }

    if (newSkipCount >= MAX_SKIPS) {
      this.turnTimer.stop();
      this.updateState({ phase: GamePhase.FINISHED });
      this.sendSync('GAME_OVER', {});
    }
  }

  private switchTurn(): void {
    const nextTurn = this.state.currentTurn === DeviceRole.HOST
      ? DeviceRole.GUEST : DeviceRole.HOST;
    this.updateState({ currentTurn: nextTurn });
  }

  private startTurnTimer(): void {
    this.turnTimer.start(
      WORD_CHAIN_TURN_TIMEOUT_MS,
      (remaining) => {
        this.updateState({ remainingTimeMs: remaining * 1000 });
      },
      () => {
        this.skipTurn();
      }
    );
  }

  private refillChars(): void {
    // 只有 HOST 管理字符补充，GUEST 通过 REFILL_CHARS 同步获取
    if (this.state.myRole !== DeviceRole.HOST) return;

    const hostChars = this.state.hostChars;
    const guestChars = this.state.guestChars;

    // 补充 HOST 字符
    if (hostChars.length < WORD_CHAIN_CHARS_PER_DEVICE) {
      const needed = WORD_CHAIN_CHARS_PER_DEVICE - hostChars.length;
      const available = this.allChars.filter(
        c => !hostChars.includes(c) && !guestChars.includes(c)
      );
      const refill = pickRandom(available, needed);
      if (refill.length > 0) {
        this.updateState({ hostChars: hostChars.concat(refill) });
        this.sendSync('REFILL_CHARS', { newChars: refill, forPlayer: DeviceRole.HOST });
      }
    }

    // 补充 GUEST 字符
    if (guestChars.length < WORD_CHAIN_CHARS_PER_DEVICE) {
      const needed = WORD_CHAIN_CHARS_PER_DEVICE - guestChars.length;
      const usedByHost = this.state.hostChars;
      const available = this.allChars.filter(
        c => !usedByHost.includes(c) && !guestChars.includes(c)
      );
      const refill = pickRandom(available, needed);
      if (refill.length > 0) {
        this.updateState({ guestChars: guestChars.concat(refill) });
        this.sendSync('REFILL_CHARS', { newChars: refill, forPlayer: DeviceRole.GUEST });
      }
    }
  }

  private onWordAccepted(data: Record<string, number | string | boolean | Object | undefined>): void {
    const word = data['word'] as string;
    const usedChars = data['usedChars'] as string[];

    // 从对方字符池中消耗已用字符
    const player = data['player'] as DeviceRole;
    let hostChars = this.state.hostChars;
    let guestChars = this.state.guestChars;
    if (player === DeviceRole.HOST) {
      const pool = this.state.hostChars.slice();
      for (const ch of usedChars) {
        const idx = pool.indexOf(ch);
        if (idx !== -1) pool.splice(idx, 1);
      }
      hostChars = pool;
    } else {
      const pool = this.state.guestChars.slice();
      for (const ch of usedChars) {
        const idx = pool.indexOf(ch);
        if (idx !== -1) pool.splice(idx, 1);
      }
      guestChars = pool;
    }

    // 合并为单次 updateState
    const wordHistory = this.state.wordHistory.includes(word) ? this.state.wordHistory : this.state.wordHistory.concat([word]);
    const nextTurn = this.state.currentTurn === DeviceRole.HOST ? DeviceRole.GUEST : DeviceRole.HOST;
    this.updateState({
      hostChars,
      guestChars,
      wordHistory,
      hostScore: data['hostScore'] as number,
      guestScore: data['guestScore'] as number,
      lastChar: data['lastChar'] as string,
      currentTurn: nextTurn,
      skipCount: 0
    });

    // W1 fix: 回合切换后，如果轮到我则启动定时器
    this.turnTimer.stop();
    if (this.state.myRole === nextTurn) {
      this.startTurnTimer();
    }

    // HOST 在收到对方组词后也执行字符补充（此时 refillChars 已是 HOST-only）
    if (this.state.myRole === DeviceRole.HOST) {
      this.refillChars();
    }

    this.checkGameEnd();
  }

  private checkGameEnd(): void {
    // 只有 HOST 有权判定游戏结束，避免双方重复发送 GAME_OVER
    if (this.state.myRole !== DeviceRole.HOST) return;

    const newSkipCount = this.state.skipCount;
    // 跳过次数上限
    if (newSkipCount >= MAX_SKIPS) {
      this.turnTimer.stop();
      this.updateState({ phase: GamePhase.FINISHED });
      this.sendSync('GAME_OVER', { reason: 'max_skips_reached' });
      return;
    }

    const hostCanPlay = this.findValidWords(this.state.lastChar, this.state.hostChars).length > 0;
    const guestCanPlay = this.findValidWords(this.state.lastChar, this.state.guestChars).length > 0;
    if (!hostCanPlay && !guestCanPlay) {
      this.turnTimer.stop();
      this.updateState({ phase: GamePhase.FINISHED });
      this.sendSync('GAME_OVER', { reason: 'no_words_available' });
    }
  }

  private onTurnSkipped(): void {
    const newSkipCount = this.state.skipCount + 1;
    const nextTurn = this.state.currentTurn === DeviceRole.HOST ? DeviceRole.GUEST : DeviceRole.HOST;
    this.updateState({
      currentTurn: nextTurn,
      skipCount: newSkipCount
    });
    this.turnTimer.stop();
    // 只有轮到我时启动定时器
    if (this.state.myRole === nextTurn) {
      this.startTurnTimer();
    }

    // 只有 HOST 判定游戏结束
    if (newSkipCount >= MAX_SKIPS && this.state.myRole === DeviceRole.HOST) {
      this.turnTimer.stop();
      this.updateState({ phase: GamePhase.FINISHED });
      this.sendSync('GAME_OVER', { reason: 'max_skips_reached' });
    }
  }

  private onRefillChars(data: Record<string, number | string | boolean | Object | undefined>): void {
    const newChars = data['newChars'] as string[];
    const forPlayer = data['forPlayer'] as DeviceRole;
    if (forPlayer === DeviceRole.HOST) {
      this.updateState({ hostChars: this.state.hostChars.concat(newChars) });
    } else {
      this.updateState({ guestChars: this.state.guestChars.concat(newChars) });
    }
  }
}
