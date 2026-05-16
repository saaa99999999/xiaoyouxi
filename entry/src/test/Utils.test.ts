import { describe, it, expect } from 'vitest';
import { shuffle, randomInt, pickRandom, generateUUID } from '../main/ets/common/utils/RandomUtils';
import { GameTimer, delay } from '../main/ets/common/utils/TimerUtils';

describe('RandomUtils', () => {
  describe('shuffle', () => {
    it('should return array of same length', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = shuffle(arr);
      expect(result.length).toBe(5);
    });

    it('should contain all original elements', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = shuffle(arr);
      expect(result.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('should not mutate original array', () => {
      const arr = [1, 2, 3];
      const original = [...arr];
      shuffle(arr);
      expect(arr).toEqual(original);
    });

    it('should handle empty array', () => {
      expect(shuffle([])).toEqual([]);
    });

    it('should handle single element', () => {
      expect(shuffle([42])).toEqual([42]);
    });
  });

  describe('randomInt', () => {
    it('should return value within range [min, max)', () => {
      for (let i = 0; i < 100; i++) {
        const val = randomInt(0, 10);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(10);
      }
    });

    it('should return min when range is 1', () => {
      expect(randomInt(5, 6)).toBe(5);
    });
  });

  describe('pickRandom', () => {
    it('should return exactly n elements', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = pickRandom(arr, 3);
      expect(result.length).toBe(3);
    });

    it('should return all elements when n >= array length', () => {
      const arr = [1, 2, 3];
      const result = pickRandom(arr, 10);
      expect(result.length).toBe(3);
    });

    it('should return unique elements', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = pickRandom(arr, 3);
      const unique = new Set(result);
      expect(unique.size).toBe(3);
    });

    it('should handle empty array', () => {
      expect(pickRandom([], 3)).toEqual([]);
    });
  });

  describe('generateUUID', () => {
    it('should generate valid UUID format', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('should generate unique values', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100);
    });
  });
});

describe('GameTimer', () => {
  it('should count down and complete', async () => {
    let completed = false;
    const timer = new GameTimer();
    timer.start(200, () => {}, () => { completed = true; });
    await delay(350);
    expect(completed).toBe(true);
    timer.stop();
  });

  it('should pause and resume correctly', async () => {
    let tickCount = 0;
    const timer = new GameTimer();
    timer.start(500, () => { tickCount++; }, () => {});

    await delay(150);
    timer.pause();
    const countAfterPause = tickCount;

    await delay(150);
    expect(tickCount).toBe(countAfterPause);

    timer.resume();
    await delay(400);
    expect(tickCount).toBeGreaterThan(countAfterPause);
    timer.stop();
  });

  it('should stop without calling complete', async () => {
    let completed = false;
    const timer = new GameTimer();
    timer.start(300, () => {}, () => { completed = true; });
    timer.stop();
    await delay(400);
    expect(completed).toBe(false);
  });

  it('should report remaining time correctly', () => {
    const timer = new GameTimer();
    timer.start(5000, () => {}, () => {});
    const remaining = timer.getRemaining();
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(5000);
    timer.stop();
  });

  it('should handle double pause gracefully', () => {
    const timer = new GameTimer();
    timer.start(1000, () => {}, () => {});
    timer.pause();
    timer.pause();
    timer.resume();
    timer.stop();
  });

  it('should handle restart after stop', async () => {
    let firstComplete = false;
    let secondComplete = false;
    const timer = new GameTimer();

    timer.start(100, () => {}, () => { firstComplete = true; });
    await delay(200);
    expect(firstComplete).toBe(true);

    timer.start(100, () => {}, () => { secondComplete = true; });
    await delay(200);
    expect(secondComplete).toBe(true);
    timer.stop();
  });
});
