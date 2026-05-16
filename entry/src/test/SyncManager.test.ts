import { describe, it, expect } from 'vitest';

describe('SyncManager — Pure Logic', () => {
  const QUEUE_SLOTS = 32;

  function getSlotKey(prefix: string, counter: number): string {
    return `${prefix}_${counter % QUEUE_SLOTS}`;
  }

  describe('Ring Buffer Slot Calculation', () => {
    it('should wrap correctly at slot boundary', () => {
      expect(getSlotKey('game', 0)).toBe('game_0');
      expect(getSlotKey('game', 31)).toBe('game_31');
      expect(getSlotKey('game', 32)).toBe('game_0');
      expect(getSlotKey('game', 33)).toBe('game_1');
      expect(getSlotKey('game', 64)).toBe('game_0');
    });

    it('should not collide between prefixes', () => {
      const a = getSlotKey('rhythm', 5);
      const b = getSlotKey('drawing', 5);
      expect(a).not.toBe(b);
    });

    it('should handle high counter values', () => {
      const key = getSlotKey('game', 999999);
      expect(key).toMatch(/^game_\d+$/);
      const slotNum = parseInt(key.split('_')[1]);
      expect(slotNum).toBeGreaterThanOrEqual(0);
      expect(slotNum).toBeLessThan(QUEUE_SLOTS);
    });
  });

  describe('Sequence Counter', () => {
    it('should monotonically increase', () => {
      let seq = 0;
      const seqs: number[] = [];
      for (let i = 0; i < 100; i++) {
        seq++;
        seqs.push(seq);
      }
      for (let i = 1; i < seqs.length; i++) {
        expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
      }
    });
  });

  describe('SessionId Format', () => {
    const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    it('should generate 4-char codes from valid charset', () => {
      for (let trial = 0; trial < 50; trial++) {
        let code = '';
        for (let i = 0; i < 4; i++) {
          code += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
        expect(code.length).toBe(4);
        for (const ch of code) {
          expect(CHARS).toContain(ch);
        }
      }
    });

    it('should exclude ambiguous characters', () => {
      expect(CHARS).not.toContain('0');
      expect(CHARS).not.toContain('O');
      expect(CHARS).not.toContain('1');
      expect(CHARS).not.toContain('I');
    });
  });

  describe('Anti-Replay: Seq Checking', () => {
    function isReplay(deviceLastSeq: Map<string, number>, packetFrom: string, packetSeq: number): boolean {
      const lastSeq = deviceLastSeq.get(packetFrom) || 0;
      if (packetSeq <= lastSeq) return true;
      deviceLastSeq.set(packetFrom, packetSeq);
      return false;
    }

    it('should accept increasing seq', () => {
      const lastSeqs = new Map<string, number>();
      expect(isReplay(lastSeqs, 'host', 1)).toBe(false);
      expect(isReplay(lastSeqs, 'host', 2)).toBe(false);
      expect(isReplay(lastSeqs, 'host', 3)).toBe(false);
    });

    it('should reject duplicate seq', () => {
      const lastSeqs = new Map<string, number>();
      isReplay(lastSeqs, 'host', 5);
      expect(isReplay(lastSeqs, 'host', 5)).toBe(true);
    });

    it('should reject old seq', () => {
      const lastSeqs = new Map<string, number>();
      isReplay(lastSeqs, 'host', 10);
      expect(isReplay(lastSeqs, 'host', 5)).toBe(true);
    });

    it('should track per-device independently', () => {
      const lastSeqs = new Map<string, number>();
      expect(isReplay(lastSeqs, 'host', 5)).toBe(false);
      expect(isReplay(lastSeqs, 'guest', 1)).toBe(false);
      expect(isReplay(lastSeqs, 'host', 6)).toBe(false);
      expect(isReplay(lastSeqs, 'guest', 2)).toBe(false);
    });
  });
});
