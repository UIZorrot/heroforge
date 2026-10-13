import { describe, expect, it } from 'vitest';
import { pveBattleResult, type PveRun } from './pveTypes';
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
  it('preserves uploaded portraits at their actual slot and does not mutate saved snapshots', () => {
    const run = fixture();
    const original = JSON.stringify(run);
    const result = pveBattleResult(run)!;
    expect(result.board!.bottom[5]?.image).toBe(run.party[0].image);
    expect(result.boardHistory![0].bottom[5]?.image).toBe(run.party[0].image);
    expect(result.board!.top[0]?.image).toBe('/art/void-labyrinth/sentinel-v2.webp');
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
