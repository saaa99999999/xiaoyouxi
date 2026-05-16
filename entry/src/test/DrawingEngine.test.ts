import { describe, it, expect, beforeEach } from 'vitest';
import { DrawingEngine } from '../main/ets/games/drawing/DrawingEngine';
import { GameType, DeviceRole } from '../main/ets/common/types/GameTypes';

describe('DrawingEngine', () => {
  let engine: DrawingEngine;

  beforeEach(() => {
    engine = new DrawingEngine();
    engine.init({ gameType: GameType.JOINT_DRAWING, myRole: DeviceRole.HOST });
  });

  it('should start with empty strokes', () => {
    expect(engine.getStrokes().length).toBe(0);
  });

  it('should have a theme assigned', () => {
    expect(engine.getTheme()).toBeTruthy();
    expect(engine.getTheme().length).toBeGreaterThan(0);
  });

  it('should add strokes on STROKE_BEGIN + STROKE_END', () => {
    engine.handleInput({ type: 'STROKE_BEGIN', data: { x: 0.1, y: 0.1, tool: 'pen', color: '#000', width: 3 } });
    engine.handleInput({ type: 'STROKE_MOVE', data: { x: 0.2, y: 0.2, pressure: 0.5 } });
    engine.handleInput({ type: 'STROKE_MOVE', data: { x: 0.3, y: 0.3, pressure: 0.7 } });
    engine.handleInput({ type: 'STROKE_END', data: {} });
    expect(engine.getStrokes().length).toBe(1);
  });

  it('should enforce per-device stroke limit', () => {
    const maxPerDevice = 250; // DRAWING_MAX_STROKES / 2
    for (let i = 0; i < maxPerDevice + 10; i++) {
      engine.handleInput({ type: 'STROKE_BEGIN', data: { x: 0, y: 0, tool: 'pen', color: '#000', width: 1 } });
      engine.handleInput({ type: 'STROKE_END', data: {} });
    }
    expect(engine.getStrokes().length).toBeLessThanOrEqual(maxPerDevice);
  });

  it('should handle undo', () => {
    engine.handleInput({ type: 'STROKE_BEGIN', data: { x: 0, y: 0, tool: 'pen', color: '#000', width: 1 } });
    engine.handleInput({ type: 'STROKE_END', data: {} });
    expect(engine.getStrokes().length).toBe(1);
    engine.handleInput({ type: 'UNDO', data: {} });
    expect(engine.getStrokes().length).toBe(0);
  });

  it('should not finish until both players complete', () => {
    engine.handleInput({ type: 'FINISH', data: {} });
    expect(engine.isGameOver()).toBe(false);
  });

  it('should handle DRAWING_START sync for GUEST', () => {
    const guestEngine = new DrawingEngine();
    guestEngine.init({ gameType: GameType.JOINT_DRAWING, myRole: DeviceRole.GUEST });
    guestEngine.handleSync({
      type: 'DRAWING_START',
      from: DeviceRole.HOST,
      payload: { theme: '猫' },
      seq: 1,
      timestamp: Date.now()
    });
    expect(guestEngine.getTheme()).toBe('猫');
  });

  it('should apply remote strokes', () => {
    engine.handleSync({
      type: 'STROKE_DELTA',
      from: DeviceRole.GUEST,
      payload: {
        strokeId: 'test-stroke-1',
        newPoints: [{ x: 0.5, y: 0.5, pressure: 0.5 }],
        device: DeviceRole.GUEST,
        color: '#FF0000',
        width: 3,
        tool: 'pen',
        isComplete: false
      },
      seq: 1,
      timestamp: Date.now()
    });
    expect(engine.getStrokes().length).toBe(1);
  });

  it('should not revive undone remote strokes', () => {
    // Add a stroke then undo it
    engine.handleSync({
      type: 'STROKE_DELTA',
      from: DeviceRole.GUEST,
      payload: {
        strokeId: 'ghost-stroke',
        newPoints: [{ x: 0.5, y: 0.5, pressure: 0.5 }],
        device: DeviceRole.GUEST,
        color: '#FF0000',
        width: 3,
        tool: 'pen',
        isComplete: false
      },
      seq: 1,
      timestamp: Date.now()
    });
    expect(engine.getStrokes().length).toBe(1);

    // Undo it
    engine.handleSync({
      type: 'UNDO',
      from: DeviceRole.GUEST,
      payload: { device: DeviceRole.GUEST, strokeId: 'ghost-stroke' },
      seq: 2,
      timestamp: Date.now()
    });
    expect(engine.getStrokes().length).toBe(0);

    // Try to revive it via delayed STROKE_DELTA
    engine.handleSync({
      type: 'STROKE_DELTA',
      from: DeviceRole.GUEST,
      payload: {
        strokeId: 'ghost-stroke',
        newPoints: [{ x: 0.6, y: 0.6, pressure: 0.5 }],
        device: DeviceRole.GUEST,
        color: '#FF0000',
        width: 3,
        tool: 'pen',
        isComplete: false
      },
      seq: 3,
      timestamp: Date.now()
    });
    expect(engine.getStrokes().length).toBe(0); // still 0, undone stroke not revived
  });

  it('Catmull-Rom smoothing should handle <3 points', () => {
    const result = DrawingEngine.smoothStroke([
      { x: 0, y: 0, pressure: 0.5 },
      { x: 0.5, y: 0.5, pressure: 0.5 }
    ]);
    expect(result.length).toBe(2);
  });

  it('Catmull-Rom smoothing should produce more points than input for 3+ points', () => {
    const result = DrawingEngine.smoothStroke([
      { x: 0, y: 0, pressure: 0.5 },
      { x: 0.3, y: 0.3, pressure: 0.5 },
      { x: 0.5, y: 0.5, pressure: 0.5 },
      { x: 0.8, y: 0.8, pressure: 0.5 }
    ]);
    expect(result.length).toBeGreaterThan(3);
  });

  it('should cleanup without error', () => {
    engine.handleInput({ type: 'STROKE_BEGIN', data: { x: 0, y: 0, tool: 'pen', color: '#000', width: 1 } });
    engine.handleInput({ type: 'STROKE_END', data: {} });
    expect(() => engine.cleanup()).not.toThrow();
    expect(engine.getStrokes().length).toBe(0);
  });
});
