import { describe, it, expect } from 'vitest';
import { DeviceRole, SessionHandshake } from '../main/ets/common/types/GameTypes';

describe('Session Handshake Protocol', () => {
  const hostPlayer = {
    deviceId: 'host-1',
    deviceName: 'Host Phone',
    role: DeviceRole.HOST,
    isReady: true
  };

  const guestPlayer = {
    deviceId: 'guest-1',
    deviceName: 'Guest Tablet',
    role: DeviceRole.GUEST,
    isReady: true
  };

  function buildHandshake(type: 'host_ready' | 'guest_join' | 'guest_ack', sessionId: string): SessionHandshake {
    const player = type === 'guest_join' ? guestPlayer : hostPlayer;
    return {
      type,
      sessionId,
      from: player.role,
      player,
      timestamp: 1000
    };
  }

  function shouldAcceptHandshake(mode: 'host' | 'guest', roomCode: string, handshake: SessionHandshake): boolean {
    const myRole = mode === 'host' ? DeviceRole.HOST : DeviceRole.GUEST;
    if (handshake.sessionId !== roomCode) return false;
    if (handshake.from === myRole) return false;
    if (mode === 'host') return handshake.type === 'guest_join';
    return handshake.type === 'host_ready' || handshake.type === 'guest_ack';
  }

  it('host accepts guest_join for the same room', () => {
    const handshake = buildHandshake('guest_join', 'A3K9');
    expect(shouldAcceptHandshake('host', 'A3K9', handshake)).toBe(true);
  });

  it('host rejects self or non-guest handshakes', () => {
    expect(shouldAcceptHandshake('host', 'A3K9', buildHandshake('host_ready', 'A3K9'))).toBe(false);
    expect(shouldAcceptHandshake('host', 'A3K9', buildHandshake('guest_ack', 'A3K9'))).toBe(false);
  });

  it('guest accepts host_ready and guest_ack for the same room', () => {
    expect(shouldAcceptHandshake('guest', 'A3K9', buildHandshake('host_ready', 'A3K9'))).toBe(true);
    expect(shouldAcceptHandshake('guest', 'A3K9', buildHandshake('guest_ack', 'A3K9'))).toBe(true);
  });

  it('guest rejects its own join packet', () => {
    expect(shouldAcceptHandshake('guest', 'A3K9', buildHandshake('guest_join', 'A3K9'))).toBe(false);
  });

  it('rejects packets from other rooms', () => {
    expect(shouldAcceptHandshake('host', 'A3K9', buildHandshake('guest_join', 'B7Q2'))).toBe(false);
    expect(shouldAcceptHandshake('guest', 'A3K9', buildHandshake('host_ready', 'B7Q2'))).toBe(false);
  });
});
