import { BaseGameEngine } from '../../common/base/BaseGameEngine';
import { GameConfig, GameInput, GameResult, SyncPacket, GamePhase, GameType, DeviceRole } from '../../common/types/GameTypes';
import { shuffle } from '../../common/utils/RandomUtils';
import { MEMORY_TOTAL_CARDS, MEMORY_CARDS_PER_DEVICE, SCORES } from '../../constants/GameConstants';

// ---------- 类型 ----------

enum CardState { HIDDEN = 'hidden', REVEALED = 'revealed', MATCHED = 'matched' }

export interface Card {
  id: number;
  emoji: string;
  pairId: number;
  state: CardState;
  owner: DeviceRole;
}

interface MemoryState {
  gameType: GameType;
  phase: GamePhase;
  round: number;
  hostScore: number;
  guestScore: number;
  myRole: DeviceRole;
  cards: Card[];
  currentTurn: DeviceRole;
  firstPick: number | null;
  firstPickOwner: DeviceRole | null;
  isChecking: boolean;
  matchStreak: number; // 连续配对成功次数
  lastMatchTime: number; // 上次配对成功的时间戳
}

const EMOJIS = ['🍎', '🍊', '🍋', '🍇', '🍓', '🌸', '⭐', '🦊', '🐱', '🎈', '🐶', '🌈'];

// 难度 → 配对数
const DIFFICULTY_PAIRS: Record<number, number> = {
  1: 6,   // 简单: 6对 = 12张
  2: 8,   // 普通: 8对 = 16张
  3: 12   // 困难: 12对 = 24张
};

// ---------- 引擎实现 ----------

export class MemoryEngine extends BaseGameEngine<MemoryState> {
  private mismatchTimerId: number = 0;
  private readonly MISMATCH_DELAY_MS = 1500;
  private generatedCardsCache: Card[] | null = null;
  private pairCount: number = 8;
  private peekTimerId: number = 0;
  private readonly PEEK_DURATION_MS = 2000;

  constructor() {
    super({
      gameType: GameType.MEMORY_MATCH,
      phase: GamePhase.WAITING,
      round: 0,
      hostScore: 0,
      guestScore: 0,
      myRole: DeviceRole.HOST,
      cards: [],
      currentTurn: DeviceRole.HOST,
      firstPick: null,
      firstPickOwner: null,
      isChecking: false,
      matchStreak: 0,
      lastMatchTime: 0
    });
  }

  init(config: GameConfig): void {
    this.clearReplayCache();
    this.clearMismatchTimer();
    this.generatedCardsCache = null;
    this.pairCount = DIFFICULTY_PAIRS[config.difficulty || 2] || 8;
    this.updateState({
      myRole: config.myRole,
      hostScore: 0,
      guestScore: 0,
      cards: [],
      firstPick: null,
      firstPickOwner: null,
      isChecking: false,
      currentTurn: DeviceRole.HOST,
      matchStreak: 0,
      lastMatchTime: 0
    });

    if (config.myRole === DeviceRole.HOST) {
      this.setupCards();
    } else {
      // GUEST 请求 HOST 发牌（防止时序问题: HOST 先发 CARD_ASSIGNMENT 但 GUEST 还没注册监听）
      this.sendSync('REQUEST_CARDS', {});
    }
  }

  handleInput(input: GameInput): void {
    if (this.state.phase !== GamePhase.PLAYING || this.state.isChecking) return;

    switch (input.type) {
      case 'PICK_CARD':
        this.pickCard(input.data['cardId'] as number);
        break;
    }
  }

  handleSync(packet: SyncPacket): void {
    if (this.isReplay(packet)) return;
    // 防止自同步循环
    if (packet.from === this.state.myRole) return;

    const data = packet.payload;
    switch (packet.type) {
      case 'REQUEST_CARDS':
        // GUEST 请求发牌，HOST 重新发送 CARD_ASSIGNMENT
        if (this.state.myRole === DeviceRole.HOST) {
          this.setupCards();
        }
        break;
      case 'PEEK_END':
        // HOST 的 peek 计时结束，GUEST 也隐藏所有牌并开始
        if (this.state.myRole === DeviceRole.GUEST) {
          const hiddenCards = this.state.cards.map(c => ({
            id: c.id, emoji: c.emoji, pairId: c.pairId,
            state: CardState.HIDDEN, owner: c.owner
          }));
          this.updateState({ cards: hiddenCards, phase: GamePhase.PLAYING });
        }
        break;
      case 'CARD_ASSIGNMENT':
        this.onCardAssignment(data);
        break;
      case 'FLIP_CARD':
        this.onFlipCard(data);
        break;
      case 'MATCH_RESULT':
        this.onMatchResult(data);
        break;
      case 'TURN_CHANGE':
        this.updateState({
          currentTurn: data['nextPlayer'] as DeviceRole,
          firstPick: null,
          firstPickOwner: null,
          isChecking: false
        });
        break;
      case 'GAME_OVER':
        this.clearMismatchTimer();
        this.updateState({ phase: GamePhase.FINISHED });
        break;
      case 'REQUEST_GAME_OVER':
        // GUEST 请求结束，HOST 确认后广播 GAME_OVER
        if (this.state.myRole === DeviceRole.HOST && this.isGameOver()) {
          this.clearMismatchTimer();
          this.updateState({ phase: GamePhase.FINISHED });
          this.sendSync('GAME_OVER', {});
        }
        break;
    }
  }

  getScore(): { host: number; guest: number } {
    return { host: this.state.hostScore, guest: this.state.guestScore };
  }

  isGameOver(): boolean {
    return this.state.cards.length > 0 && this.state.cards.every(c => c.state === CardState.MATCHED);
  }

  getResult(): GameResult {
    const { hostScore, guestScore } = this.state;
    const matchedCount = this.state.cards.filter(c => c.state === CardState.MATCHED).length;
    return {
      gameType: GameType.MEMORY_MATCH,
      hostScore, guestScore,
      winner: hostScore > guestScore ? DeviceRole.HOST
        : guestScore > hostScore ? DeviceRole.GUEST : 'draw',
      details: {
        totalPairs: this.pairCount,
        matchedPairs: matchedCount / 2
      }
    };
  }

  cleanup(): void {
    this.clearMismatchTimer();
  }

  // ============ 游戏逻辑 ============

  private setupCards(): void {
    // 如果已有缓存的卡牌（从 init 时生成），不重新生成
    const cards = this.generatedCardsCache || this.generateCards();
    this.generatedCardsCache = cards;
    const hostCards = cards.slice(0, this.pairCount);
    const guestCards = cards.slice(this.pairCount);

    this.sendSync('CARD_ASSIGNMENT', {
      hostCards: hostCards.map(c => ({ id: c.id, emoji: c.emoji, pairId: c.pairId })),
      guestCards: guestCards.map(c => ({ id: c.id, emoji: c.emoji, pairId: c.pairId })),
      startingPlayer: DeviceRole.HOST,
      peek: true
    });

    // 先展示所有牌面 2 秒，让玩家记忆
    const peekCards = cards.map(c => ({
      id: c.id, emoji: c.emoji, pairId: c.pairId,
      state: CardState.REVEALED, owner: c.owner
    }));
    this.updateState({
      cards: peekCards,
      currentTurn: DeviceRole.HOST,
      phase: GamePhase.COUNTDOWN
    });
    if (this.peekTimerId) clearTimeout(this.peekTimerId);
    this.peekTimerId = setTimeout(() => {
      this.peekTimerId = 0;
      const hiddenCards = this.state.cards.map(c => ({
        id: c.id, emoji: c.emoji, pairId: c.pairId,
        state: CardState.HIDDEN, owner: c.owner
      }));
      this.updateState({ cards: hiddenCards, phase: GamePhase.PLAYING });
      this.sendSync('PEEK_END', {});
    }, this.PEEK_DURATION_MS);
  }

  private generateCards(): Card[] {
    const cards: Card[] = [];
    const emojis = EMOJIS.slice(0, this.pairCount);
    for (let i = 0; i < emojis.length; i++) {
      cards.push({
        id: i * 2,
        emoji: emojis[i],
        pairId: i,
        state: CardState.HIDDEN,
        owner: DeviceRole.HOST
      });
      cards.push({
        id: i * 2 + 1,
        emoji: emojis[i],
        pairId: i,
        state: CardState.HIDDEN,
        owner: DeviceRole.GUEST
      });
    }
    const shuffled = shuffle(cards);
    const cardsPerDevice = this.pairCount;
    for (let idx = 0; idx < shuffled.length; idx++) {
      shuffled[idx].owner = idx < cardsPerDevice ? DeviceRole.HOST : DeviceRole.GUEST;
    }
    return shuffled;
  }

  private pickCard(cardId: number): void {
    if (this.state.currentTurn !== this.state.myRole) return;

    const card = this.state.cards.find(c => c.id === cardId);
    if (!card) return;
    if (card.state === CardState.MATCHED || card.state === CardState.REVEALED) return;
    // FIX: 允许翻开任何牌（包括对方的），这是协作配对游戏的核心
    // 协作模式: 玩家可以翻开对方区域的牌来配对

    // 翻牌
    const cards = this.state.cards.map(c =>
      c.id === cardId ? {
        id: c.id, emoji: c.emoji, pairId: c.pairId,
        state: CardState.REVEALED, owner: c.owner
      } : c
    );
    this.sendSync('FLIP_CARD', { cardId, emoji: card.emoji, reveal: true });
    this.updateState({ cards });

    if (this.state.firstPick === null) {
      this.updateState({ firstPick: cardId, firstPickOwner: card.owner });
    } else {
      // 保存 firstPick 值到局部变量，防止定时器回调中读到 null
      const firstPickId = this.state.firstPick;
      this.updateState({ isChecking: true });
      const firstCard = cards.find(c => c.id === firstPickId);
      if (!firstCard) return;

      if (firstCard.pairId === card.pairId) {
        // 配对成功 — 计算奖励分数
        const now = Date.now();
        const streak = this.state.matchStreak + 1;
        const isCrossDevice = card.owner !== firstCard.owner;
        const speedBonus = this.state.lastMatchTime > 0
          ? Math.max(0, 15 - Math.floor((now - this.state.lastMatchTime) / 1000)) // 越快越多分
          : 0;
        const streakBonus = Math.min(streak - 1, 5) * 3; // 连击: 每次多3分, 最多15分
        const crossDeviceBonus = isCrossDevice ? 8 : 0; // 跨设备配对奖励
        const totalScore = SCORES.MEMORY_MATCH_SUCCESS + streakBonus + speedBonus + crossDeviceBonus;

        const matchedCards = cards.map(c => {
          if (c.id === firstPickId || c.id === cardId) {
            return {
              id: c.id, emoji: c.emoji, pairId: c.pairId,
              state: CardState.MATCHED, owner: c.owner
            };
          }
          return c;
        });
        const scoreKey = this.state.currentTurn === DeviceRole.HOST ? 'hostScore' : 'guestScore';
        const newScore = (this.state.currentTurn === DeviceRole.HOST
          ? this.state.hostScore : this.state.guestScore) + totalScore;

        this.updateState({
          cards: matchedCards,
          [scoreKey]: newScore,
          firstPick: null,
          firstPickOwner: null,
          isChecking: false,
          matchStreak: streak,
          lastMatchTime: now
        });

        this.sendSync('MATCH_RESULT', {
          firstCardId: firstPickId,
          secondCardId: cardId,
          success: true,
          hostScore: scoreKey === 'hostScore' ? newScore : this.state.hostScore,
          guestScore: scoreKey === 'guestScore' ? newScore : this.state.guestScore,
          matchStreak: streak,
          lastMatchTime: now
        });

        if (this.isGameOver()) {
          if (this.state.myRole === DeviceRole.HOST) {
            this.updateState({ phase: GamePhase.FINISHED });
            this.sendSync('GAME_OVER', {});
          } else {
            // GUEST 通知 HOST 游戏结束，由 HOST 广播 GAME_OVER
            this.sendSync('REQUEST_GAME_OVER', {});
          }
        }
      } else {
        // 配对失败 — 使用局部变量避免定时器中读取过时状态
        this.sendSync('MATCH_RESULT', {
          firstCardId: firstPickId,
          secondCardId: cardId,
          success: false,
          matchStreak: 0
        });

        const mismatchCardId = cardId;
        this.mismatchTimerId = setTimeout(() => {
          this.mismatchTimerId = 0;
          // 使用局部变量而非 this.state.firstPick（可能已被其他操作改变）
          const currentCards = this.state.cards.map(c => {
            if (c.state === CardState.MATCHED) return c;
            if (c.id === firstPickId || c.id === mismatchCardId) {
              return {
                id: c.id, emoji: c.emoji, pairId: c.pairId,
                state: CardState.HIDDEN, owner: c.owner
              };
            }
            return c;
          });

          this.sendSync('FLIP_CARD', { cardId: firstPickId, reveal: false });
          this.sendSync('FLIP_CARD', { cardId: mismatchCardId, reveal: false });

          const nextPlayer = this.state.currentTurn === DeviceRole.HOST
            ? DeviceRole.GUEST : DeviceRole.HOST;
          this.sendSync('TURN_CHANGE', { nextPlayer });

          this.updateState({
            cards: currentCards,
            currentTurn: nextPlayer,
            firstPick: null,
            firstPickOwner: null,
            isChecking: false,
            matchStreak: 0 // 不匹配重置连击
          });
        }, this.MISMATCH_DELAY_MS);
      }
    }
  }

  private onCardAssignment(data: Record<string, number | string | boolean | Object | undefined>): void {
    const hostCardsRaw = data['hostCards'] as Array<Record<string, number | string | boolean | Object | undefined>>;
    const guestCardsRaw = data['guestCards'] as Array<Record<string, number | string | boolean | Object | undefined>>;

    const cards: Card[] = [];
    // 客机能看到自己区域的牌emoji，对方区域的牌显示'?'
    // 但协作游戏中，翻开后都会显示真实emoji
    const addCards = (arr: Array<Record<string, number | string | boolean | Object | undefined>>, owner: DeviceRole) => {
      for (const c of arr) {
        cards.push({
          id: c['id'] as number,
          emoji: c['emoji'] as string, // 协作模式: 双方都能看到emoji
          pairId: c['pairId'] as number,
          state: CardState.HIDDEN,
          owner
        });
      }
    };

    addCards(hostCardsRaw, DeviceRole.HOST);
    addCards(guestCardsRaw, DeviceRole.GUEST);

    // 如果 HOST 发了 peek，先展示所有牌面
    const isPeek = data['peek'] as boolean;
    if (isPeek) {
      const peekCards = cards.map(c => ({
        id: c.id, emoji: c.emoji, pairId: c.pairId,
        state: CardState.REVEALED, owner: c.owner
      }));
      this.updateState({
        cards: peekCards,
        currentTurn: data['startingPlayer'] as DeviceRole,
        phase: GamePhase.COUNTDOWN
      });
    } else {
      this.updateState({
        cards,
        currentTurn: data['startingPlayer'] as DeviceRole,
        phase: GamePhase.PLAYING
      });
    }
  }

  private onFlipCard(data: Record<string, number | string | boolean | Object | undefined>): void {
    const cardId = data['cardId'] as number;
    const emoji = data['emoji'] as string;
    const reveal = data['reveal'] as boolean;
    const cards = this.state.cards.map(c => {
      if (c.id !== cardId) return c;
      if (c.state === CardState.MATCHED) return c;
      const newState = reveal ? CardState.REVEALED : CardState.HIDDEN;
      const newEmoji = (reveal && emoji) ? emoji : c.emoji;
      return {
        id: c.id, emoji: newEmoji, pairId: c.pairId,
        state: newState, owner: c.owner
      };
    });
    this.updateState({ cards });
  }

  private onMatchResult(data: Record<string, number | string | boolean | Object | undefined>): void {
    const success = data['success'] as boolean;
    const firstCardId = data['firstCardId'] as number;
    const secondCardId = data['secondCardId'] as number;

    if (success) {
      // 配对成功: 更新卡牌状态为 MATCHED
      const cards = this.state.cards.map(c => {
        if (c.id === firstCardId || c.id === secondCardId) {
          return {
            id: c.id, emoji: c.emoji, pairId: c.pairId,
            state: CardState.MATCHED, owner: c.owner
          };
        }
        return c;
      });
      this.updateState({
        cards,
        hostScore: data['hostScore'] as number,
        guestScore: data['guestScore'] as number,
        matchStreak: data['matchStreak'] as number,
        lastMatchTime: data['lastMatchTime'] as number,
        firstPick: null,
        firstPickOwner: null,
        isChecking: false
      });

      // GUEST 不主动设 FINISHED — 等待 HOST 的 GAME_OVER 同步包
      // 避免 GUEST 在 HOST 还未判定时就结束游戏
      // (HOST 已在 pickCard 中处理 isGameOver → GAME_OVER 逻辑)
    } else {
      // 配对失败: 只标记 isChecking，不创建本地计时器。
      // HOST 权威端会通过 FLIP_CARD 和 TURN_CHANGE 同步翻回和换手。
      this.updateState({
        isChecking: true,
        matchStreak: data['matchStreak'] !== undefined ? data['matchStreak'] as number : 0,
        firstPick: null,
        firstPickOwner: null
      });
    }
  }

  getCardsForDevice(device: DeviceRole): Card[] {
    return this.state.cards.filter(c => c.owner === device);
  }

  private clearMismatchTimer(): void {
    if (this.mismatchTimerId) {
      clearTimeout(this.mismatchTimerId);
      this.mismatchTimerId = 0;
    }
    if (this.peekTimerId) {
      clearTimeout(this.peekTimerId);
      this.peekTimerId = 0;
    }
  }
}
