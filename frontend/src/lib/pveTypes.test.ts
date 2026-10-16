import { describe, expect, it } from 'vitest';
import { pveBattleResult, pveBpEligibility, type PveRun } from './pveTypes';
import { createForgedMockHero, createMockHeroes, rebalanceMockStarters } from './mockContent';
import { calculateActualBP } from './gameLogic';
import { isBattleSupportEvent } from './battleVfxCatalog';
import type { BattleBoardState, BattleBoardUnit } from './battleTypes';

function fixture() {
  const unit: BattleBoardUnit = { tag: 'A1', slot: 5, side: 'A', name: 'Uploaded hero', alive: true,
    hp: 60, maxHp: 100, mp: 12, maxMp: 30, buffs: [] };
  const board: BattleBoardState = { round: 2, riverLabel: 'Round 2', topLabel: 'Void', bottomLabel: 'Party',
    bottom: [null, null, null, null, null, unit], top: [{ ...unit, tag: 'B1', side: 'B', slot: 0 }] };
  return { party: [{ id: 'hero', slot: 5, image: 'data:image/png;base64,user-art' }], battleSession: {
    board, boardHistory: [board], npcRoles: { B1: 'sentinel' }, result: null, events: [], logs: [],
  } } as unknown as PveRun;
}

describe('campaign presentation', () => {
  it('creates mock forged cards from a real 1000 point stat budget rather than inflated fixed samples', () => {
    for (let variant = 0; variant < 4; variant++) {
      const card = createForgedMockHero('data:image/png;base64,test', variant);
      expect(card.character.BP).toBe('1000');
      expect(calculateActualBP(card.character.state)).toBe(1000);
      expect(card.character.description).toContain('simulated');
      expect(card.image).toBe('data:image/png;base64,test');
      expect(card.character.skill.s1).toBeDefined();
    }
  });
  it('accepts one to four heroes at any team BP of at least 1000', () => {
    for (const bp of [1000, 1051, 4800, 5640, 17460, 50000]) {
      expect(pveBpEligibility(bp, 1).eligible).toBe(true);
      expect(pveBpEligibility(bp, 4).eligible).toBe(true);
    }
    for (const bp of [999, 0, -1000, NaN, Infinity, 1000.5]) expect(pveBpEligibility(bp, 1).eligible).toBe(false);
    expect(pveBpEligibility(1000, 0).eligible).toBe(false);
    expect(pveBpEligibility(1000, 5).eligible).toBe(false);
  });
  it('rebalances persisted mock starters and preserves forged cards and collection metadata', () => {
    const heroes = createMockHeroes();
    expect(heroes).toHaveLength(8);
    for (const hero of heroes) {
      expect(hero.character.BP).toBe('1000');
      expect(calculateActualBP(hero.character.state)).toBe(1000);
    }
    const forged = { ...structuredClone(heroes[0]), id: 'my-forged-card' };
    heroes[0].character.BP = '4300';
    heroes[0].character.state.ATK = '10000';
    heroes[0].equippedRelicId = 'my-relic';
    const repaired = rebalanceMockStarters([...heroes, forged]);
    expect(repaired[0].character.BP).toBe('1000');
    expect(calculateActualBP(repaired[0].character.state)).toBe(1000);
    expect(repaired[0].equippedRelicId).toBe('my-relic');
    expect(repaired.at(-1)).toBe(forged);
  });
  it('preserves uploaded portraits at their actual slot and does not mutate saved snapshots', () => {
    const run = fixture();
    const original = JSON.stringify(run);
    const result = pveBattleResult(run)!;
    expect(result.board!.bottom[5]?.image).toBe(run.party[0].image);
    expect(result.boardHistory![0].bottom[5]?.image).toBe(run.party[0].image);
    const enemyPortrait = new URL(result.board!.top[0]!.image!, 'https://hf.txzy.net');
    expect(enemyPortrait.pathname).toBe('/art/void-labyrinth/sentinel-v2.webp');
    expect(enemyPortrait.searchParams.has('v')).toBe(true);
    expect(JSON.stringify(run)).toBe(original);
  });
  it('shows live team totals and retains the exact server event feed and costs', () => {
    const run = fixture();
    const result = pveBattleResult(run)!;
    expect(result.winner).toBe('Pending');
    expect(result.finalHpA).toBe(60);
    expect(result.maxHpA).toBe(100);
    expect(result.maxMpB).toBe(30);
    expect(result.events).toBe(run.battleSession!.events);
  });
  it('refreshes NPC names without translating player creations or changing server events', () => {
    const run = fixture();
    run.battleSession!.board!.bottom[5]!.name = '玩家原创名字';
    const original = JSON.stringify(run);
    const result = pveBattleResult(run, [{ id: 'sentinel', name: 'Basalt Maw', role: '', lore: '', tactic: '' }])!;
    expect(result.board!.top[0]!.name).toBe('Basalt Maw');
    expect(result.boardHistory![0].top[0]!.name).toBe('Basalt Maw');
    expect(result.board!.bottom[5]!.name).toBe('玩家原创名字');
    expect(result.events).toBe(run.battleSession!.events);
    expect(JSON.stringify(run)).toBe(original);
  });
  it('uses non-offensive presentation for ritual preparation and mechanism events', () => {
    expect(isBattleSupportEvent({ actionType: 'ritual' })).toBe(true);
    expect(isBattleSupportEvent({ actionType: 'mechanism' })).toBe(true);
    expect(isBattleSupportEvent({ actionType: 'attack', damage: 10 })).toBe(false);
  });
});
