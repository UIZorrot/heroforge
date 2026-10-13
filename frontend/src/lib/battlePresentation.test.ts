import { battleActionSettleDelay } from './battlePresentation';
import { battleActionBeat, nextBattleActionIndex } from './battlePresentation';
import { createVfxScenarioBoard, createVfxTestAction } from './vfxTestHarness';
import { describe, expect, it } from 'vitest';
import { cubicBezier } from 'framer-motion';
import { BATTLE_PRESENTATION, battleActorKeyframes, battleNextBeatDelay, battleStrikeVector, nextBattlePlaybackIndex } from './battlePresentation';
import { createFastProjectilePlan, createProjectileVfxProfile } from './battleVfxParticlePlan';
import { canonicalBattleProjectileTypeEffects } from './battleVfxCatalog';

describe('battle presentation cadence', () => {
  it('leaves enough time for a cast, projectile, impact and recovery before advancing', () => {
    for (const effect of canonicalBattleProjectileTypeEffects) {
      for (const distance of [80, 400, 1200]) {
        const flight = createFastProjectilePlan(distance, createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect: effect }));
        const sequenceEnd = BATTLE_PRESENTATION.anticipationMs + flight.impactDelayMs + BATTLE_PRESENTATION.reactionDuration * 1000;
        expect(sequenceEnd).toBeLessThan(BATTLE_PRESENTATION.beatMs);
      }
    }
    expect(BATTLE_PRESENTATION.actorDuration * 1000).toBeLessThan(BATTLE_PRESENTATION.beatMs);
  });

  it('releases the effect after the wind-up and on the forward strike, not at turn start', () => {
    const windupEnd = BATTLE_PRESENTATION.actorTimes[1] * BATTLE_PRESENTATION.actorDuration * 1000;
    const strike = BATTLE_PRESENTATION.actorTimes[2] * BATTLE_PRESENTATION.actorDuration * 1000;
    expect(windupEnd).toBeGreaterThanOrEqual(90);
    expect(BATTLE_PRESENTATION.anticipationMs).toBeCloseTo(strike, 5);
    expect(BATTLE_PRESENTATION.postLandingPauseMs).toBe(750);
    expect(BATTLE_PRESENTATION.beatMs - BATTLE_PRESENTATION.actorDuration * 1000).toBe(750);
  });

  it('plays buffered live events in order even when several arrive between beats', () => {
    let index = -1;
    const played: number[] = [];
    for (const count of [1, 4, 7, 7, 7, 7, 7]) {
      index = nextBattlePlaybackIndex(index, count);
      played.push(index);
    }
    expect(played).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(nextBattlePlaybackIndex(index, 7)).toBe(6);
    expect(nextBattlePlaybackIndex(-1, 0)).toBe(-1);
  });
});


describe('small lift, accelerating strike and continuous return', () => {
  it('keeps the lift subtle and returns to rest in one leg without an airborne hold', () => {
    const frames = battleActorKeyframes({ x: 210, y: 90 });
    expect(frames.x[1]).toBe(0);
    expect(frames.z[1]).toBeGreaterThan(0);
    expect(Math.max(...frames.z)).toBeLessThanOrEqual(10);
    expect(frames.scale[1]).toBeLessThan(1.02);
    expect(frames.x[2]).toBe(210);
    expect(frames.y[2]).toBeGreaterThan(0);
    expect(frames.x[3]).toBe(0);
    expect(frames.z[3]).toBe(0);
    expect(frames.y[3]).toBe(0);
    expect(frames.x.at(-1)).toBe(0);
    expect(frames.y.at(-1)).toBe(0);
    expect(frames.z.at(-1)).toBe(0);
    const returnMs = (BATTLE_PRESENTATION.actorTimes[3] - BATTLE_PRESENTATION.actorTimes[2]) * BATTLE_PRESENTATION.actionMs;
    const [lift, strike, recover] = BATTLE_PRESENTATION.actorEase.map(curve => cubicBezier(...curve));
    expect(lift(.5)).toBeGreaterThan(.75);
    expect(strike(.5)).toBeLessThan(.3);
    // Most of the return happens promptly; the remaining time eases into rest.
    expect(recover(100 / returnMs)).toBeGreaterThan(.85);
    expect(BATTLE_PRESENTATION.actionMs).toBeLessThanOrEqual(500);
  });

  it('aims melee collisions toward the actual opposing slot, including reverse and diagonal attacks', () => {
    const source = { x: 0, y: 0, width: 100, height: 150 };
    const target = { x: 400, y: 300, width: 100, height: 150 };
    const forward = battleStrikeVector(source, target, false);
    const backward = battleStrikeVector(target, source, false);
    expect(forward.x).toBeGreaterThan(250);
    expect(forward.y).toBeGreaterThan(0);
    expect(forward.x / forward.y).toBeCloseTo(4 / 3);
    expect(backward.x).toBeCloseTo(-forward.x);
    expect(backward.y).toBeCloseTo(-forward.y);
    const ranged = battleStrikeVector(source, target, true);
    expect(Math.hypot(ranged.x, ranged.y)).toBeLessThanOrEqual(64);
    expect(battleStrikeVector(source, source, false)).toEqual({ x: 0, y: 0, directionX: 0, directionY: 0 });
  });

  it('keeps the entire post-landing pause even if a new live event arrives during recovery', () => {
    const startedAt = 1000;
    const landedAt = startedAt + BATTLE_PRESENTATION.actionMs;
    expect(battleNextBeatDelay(startedAt, landedAt)).toBe(750);
    expect(battleNextBeatDelay(startedAt, landedAt + 300)).toBe(450);
    expect(battleNextBeatDelay(startedAt, landedAt + 749)).toBe(1);
    expect(battleNextBeatDelay(startedAt, landedAt + 750)).toBe(0);
    expect(battleNextBeatDelay(startedAt, landedAt + 1500)).toBe(0);
  });
});

describe('grouped skill playback', () => {
  const board = createVfxScenarioBoard('projectile', 'fire', 'pve');
  const cast = createVfxTestAction(board, 'projectile', 'fire', 1, 6);
  it('plays all six target results as one beat, including indexes inside the cast', () => {
    const next = createVfxTestAction(board, 'projectile', 'fire', 2, 1);
    const events = [...cast, ...next];
    expect(battleActionBeat(events, 3)).toMatchObject({ start: 0, end: 5, complete: true, events: cast });
    expect(nextBattleActionIndex(events, 0)).toBe(6);
    expect(battleActionBeat(events, 6).events).toEqual(next);
  });
  it('buffers an incomplete live cast and never advances past it', () => {
    expect(battleActionBeat(cast.slice(0, 2), 0).complete).toBe(false);
    expect(nextBattleActionIndex(cast.slice(0, 2), 0)).toBe(0);
  });
  it('keeps legacy events separate even when actor, skill and round match', () => {
    const legacy = cast.map(event => ({ ...event, actionId: undefined }));
    expect(battleActionBeat(legacy, 0).end).toBe(0);
    expect(nextBattleActionIndex(legacy, 0)).toBe(1);
  });
});

it('waits for the last impact and preserves the existing delay through live polling', () => {
  const start = 1000, lastImpact = 1700;
  expect(battleActionSettleDelay(start, lastImpact, 1700)).toBe(750);
  expect(battleActionSettleDelay(start, lastImpact, 1900)).toBe(550);
  expect(battleActionSettleDelay(start, lastImpact, 2450)).toBe(0);
});
