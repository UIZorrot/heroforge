import { projectilePathSample } from './battleVfxParticlePlan';

type Point = { x: number; y: number };

// Project height above the table into screen space. Endpoints stay pinned to
// the actual card anchors; sprite, trail and floor light share one trajectory.
export function battleFlightSample(start: Point, end: Point, progress: number, arcBend = 0, wobble = 0, waves = 1, liftScale = 1) {
  const t = Math.max(0, Math.min(1, progress));
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const altitude = Math.min(18, distance * .045) * liftScale;
  const bend = Math.max(-.012, Math.min(.012, arcBend));
  const ripple = wobble * Math.min(1, distance / 280) * .45;
  const sample = (value: number) => {
    const path = projectilePathSample(start, end, value, bend, ripple, waves);
    const height = Math.sin(Math.PI * value) * altitude;
    return { ...path, ground: path.point, height, point: { x: path.point.x, y: path.point.y - height } };
  };
  const path = sample(t);
  const before = sample(Math.max(0, t - .001)).point;
  const after = sample(Math.min(1, t + .001)).point;
  return { ...path, angle: Math.atan2(after.y - before.y, after.x - before.x) };
}

export function battleCameraTarget(x: number, y: number) {
  return { x: Math.max(-1, Math.min(1, x)) * 2.4, y: Math.max(-1, Math.min(1, y)) * 1.6 };
}
