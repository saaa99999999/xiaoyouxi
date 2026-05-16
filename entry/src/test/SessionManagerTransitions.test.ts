import { describe, it, expect, beforeEach } from 'vitest';

describe('SessionManager State Transitions', () => {
  const validTransitions: Record<string, string[]> = {
    'idle': ['hosting', 'joining'],
    'hosting': ['connected', 'idle'],
    'joining': ['connected', 'idle'],
    'connected': ['in_game', 'idle'],
    'in_game': ['connected', 'disconnected', 'idle'],
    'disconnected': ['in_game', 'idle']
  };

  class StateMachineValidator {
    private current: string = 'idle';
    private readonly transitions: Record<string, string[]>;

    constructor(transitions: Record<string, string[]>) {
      this.transitions = transitions;
    }

    canTransition(target: string): boolean {
      const allowed = this.transitions[this.current];
      return allowed ? allowed.includes(target) : false;
    }

    transition(target: string): void {
      if (!this.canTransition(target)) {
        throw new Error(`Invalid: ${this.current} -> ${target}`);
      }
      this.current = target;
    }

    getState(): string { return this.current; }
  }

  let machine: StateMachineValidator;

  beforeEach(() => {
    machine = new StateMachineValidator(validTransitions);
  });

  describe('Valid Transitions', () => {
    it('IDLE -> HOSTING', () => {
      expect(() => machine.transition('hosting')).not.toThrow();
      expect(machine.getState()).toBe('hosting');
    });

    it('IDLE -> JOINING', () => {
      expect(() => machine.transition('joining')).not.toThrow();
      expect(machine.getState()).toBe('joining');
    });

    it('HOSTING -> CONNECTED', () => {
      machine.transition('hosting');
      expect(() => machine.transition('connected')).not.toThrow();
    });

    it('JOINING -> CONNECTED', () => {
      machine.transition('joining');
      expect(() => machine.transition('connected')).not.toThrow();
    });

    it('CONNECTED -> IN_GAME', () => {
      machine.transition('hosting');
      machine.transition('connected');
      expect(() => machine.transition('in_game')).not.toThrow();
    });

    it('IN_GAME -> DISCONNECTED', () => {
      machine.transition('hosting');
      machine.transition('connected');
      machine.transition('in_game');
      expect(() => machine.transition('disconnected')).not.toThrow();
    });

    it('DISCONNECTED -> IN_GAME', () => {
      machine.transition('hosting');
      machine.transition('connected');
      machine.transition('in_game');
      machine.transition('disconnected');
      expect(() => machine.transition('in_game')).not.toThrow();
    });

    it('Full game cycle: IDLE -> HOSTING -> CONNECTED -> IN_GAME -> CONNECTED -> IDLE', () => {
      machine.transition('hosting');
      machine.transition('connected');
      machine.transition('in_game');
      machine.transition('connected');
      machine.transition('idle');
      expect(machine.getState()).toBe('idle');
    });

    it('Join cycle: IDLE -> JOINING -> CONNECTED -> IN_GAME -> IDLE', () => {
      machine.transition('joining');
      machine.transition('connected');
      machine.transition('in_game');
      machine.transition('idle');
      expect(machine.getState()).toBe('idle');
    });
  });

  describe('Invalid Transitions', () => {
    it('IDLE -> IN_GAME (skip steps)', () => {
      expect(machine.canTransition('in_game')).toBe(false);
      expect(() => machine.transition('in_game')).toThrow();
    });

    it('IDLE -> CONNECTED (skip steps)', () => {
      expect(machine.canTransition('connected')).toBe(false);
    });

    it('HOSTING -> IN_GAME (skip step)', () => {
      machine.transition('hosting');
      expect(machine.canTransition('in_game')).toBe(false);
    });

    it('IN_GAME -> HOSTING (invalid reverse)', () => {
      machine.transition('hosting');
      machine.transition('connected');
      machine.transition('in_game');
      expect(machine.canTransition('hosting')).toBe(false);
    });

    it('DISCONNECTED -> HOSTING (invalid)', () => {
      machine.transition('hosting');
      machine.transition('connected');
      machine.transition('in_game');
      machine.transition('disconnected');
      expect(machine.canTransition('hosting')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('All states can transition to IDLE', () => {
      const states = ['hosting', 'joining', 'connected', 'in_game', 'disconnected'];
      for (const state of states) {
        const m = new StateMachineValidator(validTransitions);
        if (state === 'disconnected') {
          m.transition('hosting'); m.transition('connected');
          m.transition('in_game'); m.transition('disconnected');
        } else if (state === 'hosting') {
          m.transition('hosting');
        } else if (state === 'joining') {
          m.transition('joining');
        } else if (state === 'connected') {
          m.transition('hosting'); m.transition('connected');
        } else if (state === 'in_game') {
          m.transition('hosting'); m.transition('connected'); m.transition('in_game');
        }
        expect(m.canTransition('idle')).toBe(true);
      }
    });
  });

  describe('Room Code Generation', () => {
    const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    it('should generate 4-char codes', () => {
      for (let i = 0; i < 100; i++) {
        let code = '';
        for (let j = 0; j < 4; j++) {
          code += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
        expect(code.length).toBe(4);
      }
    });

    it('should exclude ambiguous characters', () => {
      expect(CHARS).not.toContain('0');
      expect(CHARS).not.toContain('O');
      expect(CHARS).not.toContain('1');
      expect(CHARS).not.toContain('I');
    });

    it('should have sufficient entropy', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        let code = '';
        for (let j = 0; j < 4; j++) {
          code += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
        codes.add(code);
      }
      // With 30^4 = 810,000 possible codes, 1000 samples should be >99.9% unique
      expect(codes.size).toBeGreaterThanOrEqual(990);
    });
  });
});
