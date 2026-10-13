import { placeVfxTeamUnits, vfxFormationCounts } from './vfxTestHarness';
import { createVfxScenarioBoard, createVfxTestAction } from './vfxTestHarness';
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

describe('multi-target VFX scenarios', () => {
  it('resolves six enemies, one MP cost, correct totals and individual snapshots', () => {
    const board = createVfxScenarioBoard('projectile', 'fire', 'pve');
    const events = createVfxTestAction(board, 'projectile', 'fire', 3, 6);
    const result = createVfxTestResult(board, events);
    expect(board.bottom.filter(Boolean)).toHaveLength(4);
    expect(events.map(event => event.defender)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
    expect(new Set(events.map(event => event.actionId)).size).toBe(1);
    expect(events.reduce((sum, event) => sum + event.mpCostApplied, 0)).toBe(20);
    expect(result.boardHistory).toHaveLength(7);
    expect(result.finalHpB).toBe(6 * (1800 - 360));
    expect(result.finalHpA).toBe(4 * 2200);
    expect(result.board?.bottom[0]?.mp).toBe(100);
    expect(result.board?.bottom[1]?.mp).toBe(120);
  });
  it('caps group healing at four living allies and restores each separately', () => {
    const board = createVfxScenarioBoard('buff', 'heal', 'pve');
    const events = createVfxTestAction(board, 'buff', 'heal', 1, 6, { amount: 900 });
    expect(events).toHaveLength(4);
    expect(events.every(event => event.defender.startsWith('A') && event.heal === 700 && event.damage === 0)).toBe(true);
    const result = createVfxTestResult(board, events);
    expect(result.finalHpA).toBe(8800);
    expect(result.finalHpB).toBe(10800);
  });
  it('targets enemy status effects after dragging the primary to another slot', () => {
    const board = createVfxScenarioBoard('buff', 'burn', 'pve');
    [board.top[0], board.top[5]] = [board.top[5], board.top[0]];
    board.top.forEach((unit, slot) => { if (unit) unit.slot = slot; });
    const events = createVfxTestAction(board, 'buff', 'burn', 4, 3);
    expect(events[0].defender).toBe('B1');
    expect(events[0].defenderSlot).toBe(5);
    const result = createVfxTestResult(board, events);
    expect(result.board?.top.filter(unit => unit?.buffs.some(buff => buff.name === 'burn'))).toHaveLength(3);
    expect(result.board?.bottom.every(unit => !unit || unit.buffs.length === 0)).toBe(true);
  });
});

describe('custom VFX card formations', () => {
  it('supports independent card counts and every target count including four and five', () => {
    const board = createVfxScenarioBoard('projectile', 'fire', 'custom', { allies: 2, enemies: 5 });
    expect(board.bottom.filter(Boolean)).toHaveLength(2);
    expect(board.top.filter(Boolean)).toHaveLength(5);
    for (const count of [2, 4, 5]) {
      const events = createVfxTestAction(board, 'projectile', 'fire', 1, count);
      expect(events).toHaveLength(count);
      expect(events.reduce((sum, event) => sum + event.mpCostApplied, 0)).toBe(20);
      const result = createVfxTestResult(board, events);
      expect(result.finalHpB).toBe(5 * 1800 - count * 360);
    }
  });
  it('adds cards into free slots while preserving dragged caster and target slots', () => {
    const board = createVfxScenarioBoard('projectile', 'fire', 'custom', { allies: 2, enemies: 6 });
    const allies = placeVfxTeamUnits(board.bottom, new Map([['A1', 1]]));
    const enemies = placeVfxTeamUnits(board.top, new Map([['B1', 5]]));
    expect(allies[1]?.tag).toBe('A1');
    expect(allies[0]?.tag).toBe('A2');
    expect(enemies[5]?.tag).toBe('B1');
    expect(new Set(enemies.map(unit => unit?.tag)).size).toBe(6);
    const events = createVfxTestAction({ ...board, bottom: allies, top: enemies }, 'projectile', 'fire', 1, 5);
    expect(events[0].defender).toBe('B1');
    expect(events[0].defenderSlot).toBe(5);
    expect(events[0].attackerSlot).toBe(1);
  });
  it('removes cards without moving the remaining dragged card', () => {
    const board = createVfxScenarioBoard('projectile', 'fire', 'custom', { allies: 1, enemies: 1 });
    const placed = placeVfxTeamUnits(board.top, new Map([['B1', 4], ['B2', 0]]));
    expect(placed[4]?.tag).toBe('B1');
    expect(placed.filter(Boolean)).toHaveLength(1);
  });
  it('limits group healing to the available custom allies and keeps enemies intact', () => {
    const board = createVfxScenarioBoard('buff', 'heal', 'custom', { allies: 3, enemies: 5 });
    const events = createVfxTestAction(board, 'buff', 'heal', 1, 6);
    expect(events).toHaveLength(3);
    const result = createVfxTestResult(board, events);
    expect(result.finalHpA).toBe(3 * 1860);
    expect(result.finalHpB).toBe(5 * 1800);
  });
  it('bounds custom counts to the six real slots while preserving presets', () => {
    expect(vfxFormationCounts('custom', { allies: 0, enemies: 20 })).toEqual({ allies: 1, enemies: 6 });
    expect(vfxFormationCounts('pve')).toEqual({ allies: 4, enemies: 6 });
  });
});
