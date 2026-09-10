import { describe, expect, it } from 'vitest';
import {
  canonicalBattleBuffNames,
  canonicalBattleInstantTypeEffects,
  canonicalBattleProjectileTypeEffects,
} from './battleVfxCatalog';
import { createVfxTestBoard, createVfxTestEvent, createVfxTestResult, vfxTestOptions } from './vfxTestHarness';

describe('vfxTestHarness', () => {
  it('lists every canonical battle vfx option', () => {
    expect(vfxTestOptions.projectile.map((option) => option.value)).toEqual(canonicalBattleProjectileTypeEffects);
    expect(vfxTestOptions.instant.map((option) => option.value)).toEqual(canonicalBattleInstantTypeEffects);
    expect(vfxTestOptions.buff.map((option) => option.value)).toEqual(canonicalBattleBuffNames);
  });

  it('creates a projectile event that uses the projectile visual contract', () => {
    const event = createVfxTestEvent('projectile', 'frost', 7, { crit: true });

    expect(event.actionType).toBe('skill');
    expect(event.attacker).toBe('A1');
    expect(event.defender).toBe('B1');
    expect(event.typeCatalog).toBe('proj');
    expect(event.typeEffect).toBe('frost');
    expect(event.rangeMode).toBe('ranged');
    expect(event.isCrit).toBe(true);
    expect(event.vfxAngleOffsetDeg).toBeUndefined();
    expect(event.timestamp).toBe(7);
  });

  it('creates an instant event that uses the instant visual contract', () => {
    const event = createVfxTestEvent('instant', 'claw', 3);

    expect(event.actionType).toBe('skill');
    expect(event.attacker).toBe('A1');
    expect(event.defender).toBe('B1');
    expect(event.typeCatalog).toBe('instant');
    expect(event.typeEffect).toBe('claw');
    expect(event.rangeMode).toBe('melee');
    expect(event.damage).toBeGreaterThan(0);
  });

  it('creates a buff event that targets the caster card border', () => {
    const event = createVfxTestEvent('buff', 'burn', 11);
    const board = createVfxTestBoard('buff', 'burn');

    expect(event.actionType).toBe('skill');
    expect(event.attacker).toBe('A1');
    expect(event.defender).toBe('A1');
    expect(event.skillRole).toBe('buff');
    expect(event.buffName).toBe('burn');
    expect(event.buffTypeEffect).toBe('burn');
    expect(board.bottom[0]?.buffs).toEqual([{ name: 'burn', duration: 3, value: 2 }]);
  });

  it('builds a full formation with unique slots and keeps the attacking pair stable', () => {
    const board = createVfxTestBoard('projectile', 'fire', true);
    for (const team of [board.bottom, board.top]) {
      expect(team).toHaveLength(6);
      expect(new Set(team.map(unit => unit?.slot)).size).toBe(6);
      expect(team.every(unit => Boolean(unit?.image))).toBe(true);
    }
    expect(board.bottom[0]?.tag).toBe('A1');
    expect(board.top[0]?.tag).toBe('B1');
    const result = createVfxTestResult(board, createVfxTestEvent('projectile', 'fire', 1, { crit: true }));
    expect(result.board?.top[0]?.hp).toBe(1278);
    expect(result.board?.top[1]?.hp).toBe(1800);
  });

  it('wraps the board and event in a replayable battle result', () => {
    const board = createVfxTestBoard('projectile', 'fire');
    const event = createVfxTestEvent('projectile', 'fire', 2);
    const result = createVfxTestResult(board, event);

    expect(result.events).toEqual([event]);
    expect(result.logs).toEqual([event.log]);
    expect(result.boardHistory).toHaveLength(2);
    expect(result.boardHistory?.[0]).toEqual(board);
    expect(result.board?.top[0]?.hp).toBe(event.hpB);
    expect(board.top[0]?.hp).toBe(1800);
  });
});
