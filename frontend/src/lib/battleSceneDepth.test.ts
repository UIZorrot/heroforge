import { describe, expect, it } from 'vitest';
import { battleCameraTarget, battleFlightSample } from './battleSceneDepth';

describe('battle scene depth', () => {
  it('pins elevated flights to both card anchors in either direction', () => {
    for (const [start, end] of [[{ x: 100, y: 80 }, { x: 700, y: 500 }], [{ x: 700, y: 500 }, { x: 100, y: 80 }]]) {
      expect(battleFlightSample(start, end, 0).point).toEqual(start);
      const hit = battleFlightSample(start, end, 1);
      expect(hit.point.x).toBeCloseTo(end.x);
      expect(hit.point.y).toBeCloseTo(end.y);
      const middle = battleFlightSample(start, end, .5);
      expect(middle.height).toBeGreaterThan(0);
      expect(middle.height).toBeLessThanOrEqual(18);
      expect(middle.point.y).toBeLessThan(middle.ground.y);
    }
  });
  it('aims sprites along the elevated trajectory and keeps straight projectiles low', () => {
    const start = { x: 0, y: 100 }, end = { x: 400, y: 100 };
    expect(battleFlightSample(start, end, .1).angle).toBeLessThan(0);
    expect(battleFlightSample(start, end, .9).angle).toBeGreaterThan(0);
    expect(battleFlightSample(start, end, .5, 0, 0, 1, .28).height).toBeLessThan(20);
    expect(Number.isFinite(battleFlightSample(start, start, .5).angle)).toBe(true);
  });
  it('keeps close-card shots shallow even with a strongly curved profile', () => {
    for (const distance of [20, 60, 120, 400, 1200]) {
      for (const t of [.1, .25, .5, .75, .9]) {
        const point = battleFlightSample({ x: 0, y: 0 }, { x: distance, y: 0 }, t, -.08, 8, 2);
        expect(point.height).toBeLessThanOrEqual(Math.min(18, distance * .045));
        expect(Math.abs(point.point.y)).toBeLessThan(distance * .1);
      }
    }
  });
  it('limits the inspection camera to a small, legible tilt', () => {
    expect(battleCameraTarget(0, 0)).toEqual({ x: 0, y: 0 });
    expect(battleCameraTarget(5, -5)).toEqual({ x: 2.4, y: -1.6 });
  });
});
