import { describe, it, expect, beforeEach } from 'vitest';
import { RhythmEngine, RhythmComboTracker } from '../main/ets/games/rhythm/RhythmEngine';
import { GameType, DeviceRole } from '../main/ets/common/types/GameTypes';

describe('RhythmEngine', () => {
  let engine: RhythmEngine;

  beforeEach(() => {
    engine = new RhythmEngine();
    engine.init({
      gameType: GameType.RHYTHM_SYNC,
      myRole: DeviceRole.HOST,
      difficulty: 1,
      roundCount: 1
    });
  });

  it('should start in WAITING phase', () => {
    const state = engine.getState();
    expect(state.phase).toBe('waiting');
    expect(state.hostScore).toBe(0);
    expect(state.guestScore).toBe(0);
  });

  it('should have correct initial scores', () => {
    const scores = engine.getScore();
    expect(scores.host).toBe(0);
    expect(scores.guest).toBe(0);
  });

  it('should not be game over initially', () => {
    expect(engine.isGameOver()).toBe(false);
  });

  it('should generate beats on START_GAME', () => {
    engine.handleInput({ type: 'START_GAME', data: {} });
    const state = engine.getState();
    expect(state.beats.length).toBeGreaterThan(0);
  });

  it('should ignore TAP when not in PLAYING phase', () => {
    engine.handleInput({ type: 'TAP', data: { beatIndex: 0, trackIndex: 0 } });
    const state = engine.getState();
    expect(state.hostTaps.length).toBe(0);
  });

  it('should handle SELECT_DIFFICULTY input', () => {
    engine.handleInput({ type: 'SELECT_DIFFICULTY', data: { difficulty: 3 } });
    // Verify engine is in valid state after difficulty change
    expect(engine.getState().phase).toBeDefined();
  });

  it('should have valid result after game over', () => {
    engine.handleInput({ type: 'START_GAME', data: {} });
    // Force finish
    (engine as any).updateState({ phase: 'finished' });
    expect(engine.isGameOver()).toBe(true);
    const result = engine.getResult();
    expect(result.gameType).toBe(GameType.RHYTHM_SYNC);
    expect(result.hostScore).toBeGreaterThanOrEqual(0);
    expect(result.guestScore).toBeGreaterThanOrEqual(0);
  });

  it('should handle remote TAP sync', () => {
    const packet = {
      type: 'TAP',
      from: DeviceRole.GUEST,
      payload: {
        beatIndex: 1,
        trackIndex: 2,
        tapTime: Date.now(),
        device: DeviceRole.GUEST
      },
      seq: 1,
      timestamp: Date.now()
    };
    engine.handleSync(packet);
    const state = engine.getState();
    expect(state.guestTaps.length).toBe(1);
  });

  it('should call cleanup without error', () => {
    expect(() => engine.cleanup()).not.toThrow();
  });
});

describe('RhythmComboTracker', () => {
  let tracker: RhythmComboTracker;

  beforeEach(() => {
    tracker = new RhythmComboTracker();
  });

  it('should start with multiplier 1.0', () => {
    expect(tracker.getMultiplier()).toBe(1.0);
    expect(tracker.getComboCount()).toBe(0);
  });

  it('should increase combo on Perfect', () => {
    tracker.onJudge('Perfect');
    tracker.onJudge('Perfect');
    expect(tracker.getComboCount()).toBe(2);
    expect(tracker.getMultiplier()).toBe(1.5);
  });

  it('should reach 3x multiplier at 5 combo', () => {
    for (let i = 0; i < 5; i++) tracker.onJudge('Perfect');
    expect(tracker.getComboCount()).toBe(5);
    expect(tracker.getMultiplier()).toBe(3.0);
  });

  it('should reach 5x multiplier at 10 combo', () => {
    for (let i = 0; i < 10; i++) tracker.onJudge('Perfect');
    expect(tracker.getMultiplier()).toBe(5.0);
  });

  it('should maintain combo on Great/Good', () => {
    tracker.onJudge('Perfect');
    tracker.onJudge('Perfect');
    tracker.onJudge('Great');
    tracker.onJudge('Good');
    expect(tracker.getComboCount()).toBe(2);
  });

  it('should reset combo on Miss', () => {
    tracker.onJudge('Perfect');
    tracker.onJudge('Perfect');
    tracker.onJudge('Miss');
    expect(tracker.getComboCount()).toBe(0);
    expect(tracker.getMultiplier()).toBe(1.0);
  });

  it('should apply effective score correctly', () => {
    tracker.onJudge('Perfect');
    tracker.onJudge('Perfect');
    tracker.onJudge('Perfect'); // 3 combo = 2.0x
    expect(tracker.getEffectiveScore(100)).toBe(200);
  });

  it('should reset correctly', () => {
    for (let i = 0; i < 5; i++) tracker.onJudge('Perfect');
    tracker.reset();
    expect(tracker.getComboCount()).toBe(0);
    expect(tracker.getMultiplier()).toBe(1.0);
  });
});
