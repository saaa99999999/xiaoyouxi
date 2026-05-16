import { describe, it, expect, beforeEach } from 'vitest';
import { WordChainEngine } from '../main/ets/games/wordchain/WordChainEngine';
import { GameType, DeviceRole } from '../main/ets/common/types/GameTypes';

describe('WordChainEngine', () => {
  let engine: WordChainEngine;

  beforeEach(() => {
    engine = new WordChainEngine();
    engine.init({ gameType: GameType.WORD_CHAIN, myRole: DeviceRole.HOST });
    engine.loadDictionary([
      '天空', '空气', '气球', '球场', '长大', '大地', '地方', '方向',
      '人生', '生命', '中国', '国家', '家人', '人们', '文化', '学习',
      '学生', '高兴', '快乐', '美好', '音乐', '思考', '团结', '合作',
      '太阳', '光明', '明天', '春天', '夏天', '秋天', '冬天', '温暖'
    ]);
  });

  it('should build dictionary index', () => {
    const words = engine.findValidWords('天', '天空大地方'.split(''));
    expect(words.length).toBeGreaterThan(0);
    expect(words).toContain('天空');
  });

  it('should reject words not in dictionary', () => {
    const error = engine.validateWord('火星', ['火', '星']);
    expect(error).toBe('not_in_dict');
  });

  it('should reject words with wrong first character', () => {
    (engine as any).state.lastChar = '天';
    const error = engine.validateWord('大地', ['大', '地']);
    expect(error).toBe('wrong_first_char');
  });

  it('should reject words with insufficient chars', () => {
    const error = engine.validateWord('天空', ['天']);
    expect(error).toBe('chars_not_in_pool');
  });

  it('should validate correct word', () => {
    const error = engine.validateWord('天空', ['天', '空']);
    expect(error).toBeNull();
  });

  it('should find valid words from character pool', () => {
    const words = engine.findValidWords('天', ['天', '空', '大', '地']);
    expect(words).toContain('天空');
  });

  it('canFormWord should check char availability', () => {
    expect(engine.canFormWord('天空', ['天', '空'])).toBe(true);
    expect(engine.canFormWord('天空', ['天', '天'])).toBe(false);
  });

  it('should deduplicate dictionary entries', () => {
    const engine2 = new WordChainEngine();
    engine2.init({ gameType: GameType.WORD_CHAIN, myRole: DeviceRole.HOST });
    engine2.loadDictionary(['天空', '天空', '天空', '大地', '大地']);
    const words = engine2.findValidWords('天', ['天', '空']);
    expect(words.length).toBe(1); // deduplicated
  });

  it('should start in WAITING phase', () => {
    const state = engine.getState();
    expect(state.phase).toBe('waiting');
    expect(state.hostScore).toBe(0);
    expect(state.guestScore).toBe(0);
  });

  it('should start game with char distribution for HOST', () => {
    engine.startGame();
    const state = engine.getState();
    expect(state.hostChars.length).toBeGreaterThan(0);
    expect(state.guestChars.length).toBeGreaterThan(0);
    expect(state.phase).toBe('playing');
  });

  it('should handle GAME_START sync for GUEST', () => {
    const guestEngine = new WordChainEngine();
    guestEngine.init({ gameType: GameType.WORD_CHAIN, myRole: DeviceRole.GUEST });
    guestEngine.loadDictionary(['天空', '大地']);

    guestEngine.handleSync({
      type: 'GAME_START',
      from: DeviceRole.HOST,
      payload: { hostChars: ['天', '空'], guestChars: ['大', '地'] },
      seq: 1,
      timestamp: Date.now()
    });

    const state = guestEngine.getState();
    expect(state.phase).toBe('playing');
    expect(state.guestChars).toEqual(['大', '地']);
  });

  it('should not be game over initially', () => {
    expect(engine.isGameOver()).toBe(false);
  });

  it('should provide valid result', () => {
    const result = engine.getResult();
    expect(result.gameType).toBe(GameType.WORD_CHAIN);
    expect(result.hostScore).toBeGreaterThanOrEqual(0);
  });

  it('should cleanup without error', () => {
    engine.startGame();
    expect(() => engine.cleanup()).not.toThrow();
  });

  it('should reject words that are too short', () => {
    const error = engine.validateWord('天', ['天']);
    expect(error).toBe('invalid_length');
  });

  it('should reject words that are too long', () => {
    const error = engine.validateWord('天空大地天空', ['天', '空', '大', '地', '天']);
    expect(error).toBe('invalid_length');
  });

  it('should filter self-sync packets', () => {
    // handleSync should ignore packets from own device
    const stateBefore = engine.getState();
    engine.handleSync({
      type: 'WORD_ACCEPTED',
      from: DeviceRole.HOST, // same as myRole
      payload: {
        word: '天空', player: DeviceRole.HOST, usedChars: ['天', '空'],
        hostScore: 100, guestScore: 0, lastChar: '空'
      },
      seq: 1,
      timestamp: Date.now()
    });
    const stateAfter = engine.getState();
    // Score should not change since self-sync was filtered
    expect(stateAfter.hostScore).toBe(stateBefore.hostScore);
  });
});
