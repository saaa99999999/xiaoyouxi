import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryEngine } from '../main/ets/games/memory/MemoryEngine';
import { GameType, DeviceRole } from '../main/ets/common/types/GameTypes';

describe('MemoryEngine', () => {
  let engine: MemoryEngine;

  beforeEach(() => {
    engine = new MemoryEngine();
    engine.init({
      gameType: GameType.MEMORY_MATCH,
      myRole: DeviceRole.HOST
    });
  });

  it('should generate 16 cards (8 pairs) on HOST init', () => {
    const state = engine.getState();
    expect(state.cards.length).toBe(16);
    const pairIds = new Set(state.cards.map(c => c.pairId));
    expect(pairIds.size).toBe(8);
  });

  it('should distribute cards evenly between host and guest', () => {
    const state = engine.getState();
    const hostCards = state.cards.filter(c => c.owner === DeviceRole.HOST);
    const guestCards = state.cards.filter(c => c.owner === DeviceRole.GUEST);
    expect(hostCards.length).toBe(8);
    expect(guestCards.length).toBe(8);
  });

  it('should start with HOST turn', () => {
    const state = engine.getState();
    expect(state.currentTurn).toBe(DeviceRole.HOST);
  });

  it('should start with 0 scores', () => {
    const scores = engine.getScore();
    expect(scores.host).toBe(0);
    expect(scores.guest).toBe(0);
  });

  it('should not be game over initially', () => {
    expect(engine.isGameOver()).toBe(false);
  });

  it('should allow HOST to pick their own card', () => {
    const state = engine.getState();
    const myCard = state.cards.find(c => c.owner === DeviceRole.HOST && c.state === 'hidden');
    expect(myCard).toBeDefined();
    engine.handleInput({ type: 'PICK_CARD', data: { cardId: myCard!.id } });
    const updatedCard = engine.getState().cards.find(c => c.id === myCard!.id);
    expect(updatedCard!.state).toBe('revealed');
  });

  it('should not allow picking opponent card', () => {
    const state = engine.getState();
    const opponentCard = state.cards.find(c => c.owner === DeviceRole.GUEST && c.state === 'hidden');
    expect(opponentCard).toBeDefined();
    engine.handleInput({ type: 'PICK_CARD', data: { cardId: opponentCard!.id } });
    const updatedCard = engine.getState().cards.find(c => c.id === opponentCard!.id);
    expect(updatedCard!.state).toBe('hidden'); // unchanged
  });

  it('should not allow picking already matched card', () => {
    const state = engine.getState();
    const hostCard = state.cards.find(c => c.owner === DeviceRole.HOST && c.state === 'hidden')!;
    // Manually set it to matched
    state.cards = state.cards.map(c =>
      c.id === hostCard.id ? { ...c, state: 'matched' as any } : c
    );
    engine.handleInput({ type: 'PICK_CARD', data: { cardId: hostCard.id } });
  });

  it('should handle card assignment sync for GUEST', () => {
    const guestEngine = new MemoryEngine();
    guestEngine.init({ gameType: GameType.MEMORY_MATCH, myRole: DeviceRole.GUEST });

    const hostCards = [{ id: 0, emoji: '🍎', pairId: 0 }, { id: 1, emoji: '🍎', pairId: 0 }];
    const guestCards = [{ id: 2, emoji: '🍊', pairId: 1 }, { id: 3, emoji: '🍊', pairId: 1 }];

    guestEngine.handleSync({
      type: 'CARD_ASSIGNMENT',
      from: DeviceRole.HOST,
      payload: { hostCards, guestCards, startingPlayer: DeviceRole.HOST },
      seq: 1,
      timestamp: Date.now()
    });

    const state = guestEngine.getState();
    expect(state.cards.length).toBe(4);
    // GUEST can see their own cards' emojis
    const myCard = state.cards.find(c => c.owner === DeviceRole.GUEST);
    expect(myCard!.emoji).not.toBe('?');
    // GUEST cannot see HOST cards
    const hostCard = state.cards.find(c => c.owner === DeviceRole.HOST);
    expect(hostCard!.emoji).toBe('?');
  });

  it('should provide valid result when game over', () => {
    const result = engine.getResult();
    expect(result.gameType).toBe(GameType.MEMORY_MATCH);
    expect(result.hostScore).toBeGreaterThanOrEqual(0);
    expect(result.guestScore).toBeGreaterThanOrEqual(0);
  });

  it('should cleanup without error', () => {
    expect(() => engine.cleanup()).not.toThrow();
  });
});
