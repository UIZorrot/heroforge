// Shared by Battle and VFX: a small lift, accelerating strike, then one smooth return.
// The next unit waits a full 750 ms AFTER the acting card has landed.
const actionMs = 460;
const postLandingPauseMs = 750;
export const BATTLE_PRESENTATION = {
  beatMs: actionMs + postLandingPauseMs,
  actionMs,
  postLandingPauseMs,
  anticipationMs: 220,
  actorDuration: actionMs / 1000,
  reactionDuration: 0.16,
  actorTimes: [0, 100 / actionMs, 220 / actionMs, 1],
  // Each leg has its own velocity: gentle lift, accelerating contact, fast return
  // that decelerates into the resting pose without a separate hovering/landing beat.
  actorEase: [
    [0.22, 1, 0.36, 1],
    [0.55, 0, 0.9, 0.45],
    [0.16, 1, 0.3, 1],
  ] as [number, number, number, number][],
  reactionTimes: [0, 0.12, 0.32, 0.55, 0.78, 1],
} as const;

export function nextBattlePlaybackIndex(current: number, eventCount: number) {
  return eventCount > 0 ? Math.min(current + 1, eventCount - 1) : -1;
}

export function battleNextBeatDelay(startedAt: number, now: number) {
  return Math.max(0, BATTLE_PRESENTATION.beatMs - (now - startedAt));
}

type CardRect = { x: number; y: number; width: number; height: number };
export function battleStrikeVector(source: CardRect, target: CardRect, ranged: boolean) {
  const dx = target.x + target.width / 2 - source.x - source.width / 2;
  const dy = target.y + target.height / 2 - source.y - source.height / 2;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return { x: 0, y: 0, directionX: 0, directionY: 0 };
  const directionX = dx / distance, directionY = dy / distance;
  const clearance = Math.min(
    Math.abs(directionX) > .001 ? (source.width + target.width) / 2 / Math.abs(directionX) : Infinity,
    Math.abs(directionY) > .001 ? (source.height + target.height) / 2 / Math.abs(directionY) : Infinity,
  );
  const reach = ranged ? Math.min(64, distance * .22) : Math.max(0, distance - clearance * .88);
  return { x: directionX * reach, y: directionY * reach, directionX, directionY };
}

export function battleActorKeyframes(vector: { x: number; y: number }) {
  return {
    x: [0, 0, vector.x, 0],
    y: [0, -2, vector.y - 2, 0],
    z: [0, 8, 8, 0],
    scale: [1, 1.012, 1.012, 1],
  };
}
