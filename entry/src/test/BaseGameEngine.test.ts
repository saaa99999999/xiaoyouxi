import { describe, it, expect, beforeEach } from 'vitest';
import { BaseGameEngine } from '../main/ets/common/base/BaseGameEngine';
import {
  BaseGameState, GameConfig, GameInput, GameResult,
  SyncPacket, GamePhase, GameType, DeviceRole, ErrorCode
} from '../main/ets/common/types/GameTypes';

// 具体测试实现
class TestEngine extends BaseGameEngine<BaseGameState> {
  initCalled: boolean = false;
  lastInput: GameInput | null = null;
  lastSync: SyncPacket | null = null;
  cleanupCalled: boolean = false;

  constructor() {
    super({
      gameType: GameType.RHYTHM_SYNC,
      phase: GamePhase.WAITING,
      round: 0,
      hostScore: 0,
      guestScore: 0,
      myRole: DeviceRole.HOST
    });
  }

  init(config: GameConfig): void { this.initCalled = true; }
  handleInput(input: GameInput): void { this.lastInput = input; }
  handleSync(packet: SyncPacket): void { this.lastSync = packet; }
  getScore(): { host: number; guest: number } { return { host: 10, guest: 5 }; }
  isGameOver(): boolean { return false; }
  getResult(): GameResult {
    return { gameType: GameType.RHYTHM_SYNC, hostScore: 10, guestScore: 5, winner: DeviceRole.HOST, details: {} };
  }
  cleanup(): void { this.cleanupCalled = true; }
}

describe('BaseGameEngine', () => {
  let engine: TestEngine;

  beforeEach(() => {
    engine = new TestEngine();
  });

  it('should call init on subclass', () => {
    engine.init({ gameType: GameType.RHYTHM_SYNC, myRole: DeviceRole.HOST });
    expect(engine.initCalled).toBe(true);
  });

  it('should call handleInput on subclass', () => {
    const input: GameInput = { type: 'TEST', data: {} };
    engine.handleInput(input);
    expect(engine.lastInput).toBe(input);
  });

  it('should call handleSync on subclass', () => {
    const packet: SyncPacket = {
      type: 'TEST', from: DeviceRole.GUEST,
      payload: {}, seq: 1, timestamp: Date.now()
    };
    engine.handleSync(packet);
    expect(engine.lastSync).toBe(packet);
  });

  it('should invoke state change callback on updateState', () => {
    let callbackState: BaseGameState | null = null;
    engine.setStateChangeCallback((state) => { callbackState = state; });

    (engine as any).updateState({ round: 5 });
    expect(callbackState).not.toBeNull();
    expect(callbackState!.round).toBe(5);
  });

  it('should invoke sync callback on sendSync', () => {
    let sentPacket: SyncPacket | null = null;
    engine.setSyncCallback((packet) => { sentPacket = packet; });

    (engine as any).sendSync('TEST_TYPE', { key: 'value' });
    expect(sentPacket).not.toBeNull();
    expect(sentPacket!.type).toBe('TEST_TYPE');
    expect(sentPacket!.from).toBe(DeviceRole.HOST);
    expect((sentPacket!.payload as Record<string, Object>)['key']).toBe('value');
  });

  it('should invoke error callback on reportError', () => {
    let reportedError: any = null;
    engine.setErrorCallback((error) => { reportedError = error; });

    (engine as any).reportError(ErrorCode.GAME_LOGIC_ERROR, 'test error', true);
    expect(reportedError).not.toBeNull();
    expect(reportedError.code).toBe(ErrorCode.GAME_LOGIC_ERROR);
    expect(reportedError.recoverable).toBe(true);
  });

  it('should preserve existing state on partial update', () => {
    const initialState = engine.getState();
    (engine as any).updateState({ round: 3 });
    const newState = engine.getState();
    expect(newState.round).toBe(3);
    expect(newState.hostScore).toBe(initialState.hostScore);
  });

  it('should cleanup correctly', () => {
    engine.cleanup();
    expect(engine.cleanupCalled).toBe(true);
  });

  it('should not throw on missing callbacks', () => {
    expect(() => {
      (engine as any).updateState({ round: 1 });
      (engine as any).sendSync('TEST', {});
      (engine as any).reportError(ErrorCode.GAME_LOGIC_ERROR, 'msg', true);
    }).not.toThrow();
  });

  it('should monotonically increase outgoing seq in sendSync', () => {
    const packets: SyncPacket[] = [];
    engine.setSyncCallback((p) => { packets.push(p); });

    (engine as any).sendSync('A', {});
    (engine as any).sendSync('B', {});
    (engine as any).sendSync('C', {});

    expect(packets.length).toBe(3);
    expect(packets[0].seq).toBe(1);
    expect(packets[1].seq).toBe(2);
    expect(packets[2].seq).toBe(3);
  });

  describe('Anti-Replay', () => {
    it('should accept increasing seq', () => {
      const p1: SyncPacket = { type: 'T', from: DeviceRole.GUEST, payload: {}, seq: 1, timestamp: 1 };
      const p2: SyncPacket = { type: 'T', from: DeviceRole.GUEST, payload: {}, seq: 2, timestamp: 2 };
      expect((engine as any).isReplay(p1)).toBe(false);
      expect((engine as any).isReplay(p2)).toBe(false);
    });

    it('should reject duplicate seq', () => {
      const p1: SyncPacket = { type: 'T', from: DeviceRole.GUEST, payload: {}, seq: 5, timestamp: 1 };
      (engine as any).isReplay(p1);
      const p2: SyncPacket = { type: 'T', from: DeviceRole.GUEST, payload: {}, seq: 5, timestamp: 2 };
      expect((engine as any).isReplay(p2)).toBe(true);
    });

    it('should reject old seq', () => {
      const p1: SyncPacket = { type: 'T', from: DeviceRole.GUEST, payload: {}, seq: 10, timestamp: 1 };
      (engine as any).isReplay(p1);
      const p2: SyncPacket = { type: 'T', from: DeviceRole.GUEST, payload: {}, seq: 5, timestamp: 2 };
      expect((engine as any).isReplay(p2)).toBe(true);
    });

    it('should track per-device independently', () => {
      const hostP: SyncPacket = { type: 'T', from: DeviceRole.HOST, payload: {}, seq: 5, timestamp: 1 };
      const guestP: SyncPacket = { type: 'T', from: DeviceRole.GUEST, payload: {}, seq: 1, timestamp: 2 };
      expect((engine as any).isReplay(hostP)).toBe(false);
      expect((engine as any).isReplay(guestP)).toBe(false);
    });
  });
});
