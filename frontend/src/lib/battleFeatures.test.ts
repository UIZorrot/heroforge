import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleBoardSkill, BattleBoardState, BattleBoardUnit } from './battleTypes';
import { advanceLocalManualBattle, manualOptions, simulateLocalAutoBattle, startLocalManualBattle } from './manualBattle';
import { normalizeCharacterData } from './gameLogic';

function unit(tag: string, side: 'A' | 'B', slot: number, speed: number): BattleBoardUnit {
  return { tag, side, slot, name: tag, alive: true, hp: 1000, maxHp: 1000, mp: 100, maxMp: 100, buffs: [], skills: {},
    state: { SPEED: speed, ATK: 100, DEF: 0, CC: 0, CA: 0, PI: 0, EV: 0, AC: 0, TYPE: 'magic' } };
}
function board(skill?: BattleBoardSkill): BattleBoardState {
  const caster = unit('A1', 'A', 0, 100);
  if (skill) caster.skills = { s1: skill };
  return { round: 1, riverLabel: '', bottomLabel: 'Alpha', topLabel: 'Beta', bottom: [caster],
    top: [unit('B1', 'B', 0, 50), unit('B2', 'B', 1, 40)] };
}
const volley: BattleBoardSkill = { name: 'Volley', TARGET: 'Enemy', TARGET_NUM: '2', RANGE: 'enemy', DMG: 40, MP_COST: 10 };

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(.5));
afterEach(() => vi.restoreAllMocks());

describe('battle feature contract', () => {
  it('resolves every area target in primary-first order for one MP payment', () => {
    const initial = startLocalManualBattle(board(volley));
    const result = advanceLocalManualBattle(initial, { actorTag: 'A1', kind: 'skill', skillSlot: 's1', targetTag: 'B2', expectedEventCount: 0 });
    expect(result.events!.map(event => event.defender)).toEqual(['B2', 'B1']);
    expect(result.board!.top.map(unit => unit!.hp)).toEqual([860, 860]);
    expect(result.board!.bottom[0]!.mp).toBe(90);
    expect(result.events!.map(event => event.mpCostApplied)).toEqual([10, 0]);
    expect(result.boardHistory).toHaveLength(result.events!.length + 1);
    expect(result.boardHistory![1].top.map(unit => unit!.hp)).toEqual([1000, 860]);
    expect(initial.events).toHaveLength(0);
  });
  it('keeps area attacks inside their legal range', () => {
    const initial = startLocalManualBattle(board({ ...volley, RANGE: 'melee', TARGET_NUM: '6' }));
    const result = advanceLocalManualBattle(initial, { actorTag: 'A1', kind: 'skill', skillSlot: 's1', targetTag: 'B1', expectedEventCount: 0 });
    expect(result.events).toHaveLength(1);
    expect(result.board!.top[1]!.hp).toBe(1000);
  });
  it('includes the caster in ally healing without causing friendly-fire damage', () => {
    const setup = board({ name: 'Mend', TARGET: 'Ally', RANGE: 'ally', TARGET_NUM: '2', BUFF_HP: 25, MP_COST: 10 });
    setup.bottom.push(unit('A2', 'A', 1, 90));
    setup.bottom.forEach(unit => { unit!.hp = 900; });
    const initial = startLocalManualBattle(setup);
    const result = advanceLocalManualBattle(initial, { actorTag: 'A1', kind: 'skill', skillSlot: 's1', targetTag: 'A2', expectedEventCount: 0 });
    expect(result.board!.bottom.map(unit => unit!.hp)).toEqual([925, 925]);
    expect(result.events!.map(event => event.damage)).toEqual([0, 0]);
    expect(result.events!.map(event => event.heal)).toEqual([25, 25]);
  });
  it('automatically applies an opening passive and removes it from cast options', () => {
    const initial = startLocalManualBattle(board({ name: 'Oath', IS_PASSIVE: true, TARGET: 'Self', RANGE: 'self',
      DMG: 0, BUFF_NAME: 'pray', BUFF_TIME: 3, BUFF_DMG: 12, BUFF_DEF: 8, MP_COST: 99 }));
    const actor = initial.board!.bottom[0]!;
    expect(initial.events).toHaveLength(1);
    expect(actor.mp).toBe(100);
    expect(actor.buffs[0].effects).toMatchObject({ BUFF_DMG: 12, BUFF_DEF: 8 });
    expect(manualOptions(initial.board!, actor).some(option => option.skillSlot === 's1')).toBe(false);
    expect(() => advanceLocalManualBattle(initial, { actorTag: 'A1', kind: 'skill', skillSlot: 's1', targetTag: 'A1', expectedEventCount: 1 })).toThrow('legal target');
    const result = advanceLocalManualBattle(initial, { actorTag: 'A1', kind: 'attack', targetTag: 'B1', expectedEventCount: 1 });
    expect(result.events![1].damage).toBe(112);
    expect(result.events!.filter(event => event.skillName === 'Oath')).toHaveLength(1);
  });
  it('ticks damage over time at the next round rather than healing an enemy', () => {
    const initial = startLocalManualBattle(board({ ...volley, TARGET_NUM: '1', BUFF_NAME: 'poison', BUFF_TIME: 2, BUFF_HP: 25 }));
    let next = advanceLocalManualBattle(initial, { actorTag: 'A1', kind: 'skill', skillSlot: 's1', targetTag: 'B1', expectedEventCount: 0 });
    expect(next.board!.top[0]!.hp).toBe(860);
    while (next.round === 1) next = advanceLocalManualBattle(next);
    expect(next.board!.top[0]!.hp).toBe(835);
    expect(next.events!.some(event => event.actionType === 'dot_damage' && event.damage === 25)).toBe(true);
  });
  it('applies the same area mechanics in automatic training', () => {
    const result = simulateLocalAutoBattle(board(volley));
    expect(result.events.slice(0, 2).map(event => event.defender)).toEqual(['B1', 'B2']);
    expect(result.events.slice(0, 2).map(event => event.mpCostApplied)).toEqual([10, 0]);
    expect(result.boardHistory).toHaveLength(result.events.length + 1);
  });
  it('keeps additional stat effects on a healing status', () => {
    const setup = board();
    setup.bottom[0]!.buffs = [{ name: 'heal', duration: 2, value: 20, effects: { BUFF_HP: 20, BUFF_DMG: 12 } }];
    const initial = startLocalManualBattle(setup);
    const result = advanceLocalManualBattle(initial, { actorTag: 'A1', kind: 'attack', targetTag: 'B1', expectedEventCount: 0 });
    expect(result.events![0].damage).toBe(112);
  });
  it('preserves the exact forged hero ID and template for repeated names', () => {
    expect(normalizeCharacterData({ name: 'Same name', hero_id: 'new-hero', generation_id: 'generation', template: 'cleric' }))
      .toMatchObject({ hero_id: 'new-hero', generation_id: 'generation', template: 'cleric' });
  });
});

it('local PvE preview groups six enemies into the same primary-first cast', () => {
  const initialBoard = board({ ...volley, TARGET_NUM: '6' });
  initialBoard.top = Array.from({ length: 6 }, (_, slot) => unit(`B${slot + 1}`, 'B', slot, 30));
  initialBoard.bottom = [initialBoard.bottom[0], unit('A2', 'A', 1, 90), unit('A3', 'A', 2, 80), unit('A4', 'A', 3, 70), null, null];
  const initial = startLocalManualBattle(initialBoard);
  const result = advanceLocalManualBattle(initial, { actorTag: 'A1', kind: 'skill', skillSlot: 's1', targetTag: 'B6', expectedEventCount: 0 });
  expect(result.events!.map(event => event.defender)).toEqual(['B6', 'B1', 'B2', 'B3', 'B4', 'B5']);
  expect(new Set(result.events!.map(event => event.actionId)).size).toBe(1);
  expect(result.events!.map(event => event.targetIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(result.events!.every(event => event.targetCount === 6)).toBe(true);
  expect(result.board!.top[5]!.hp).toBe(860);
});

it('preserves an authored delivery choice through card normalization and local combat', () => {
  const hero = normalizeCharacterData({ name: 'Caster', state: {}, skill: { s1: { ...volley, VFX_PRESENTATION: 'direct' } } });
  expect(hero.skill.s1.VFX_PRESENTATION).toBe('direct');
  const initial = startLocalManualBattle(board(hero.skill.s1));
  const result = advanceLocalManualBattle(initial, { actorTag: 'A1', kind: 'skill', skillSlot: 's1', targetTag: 'B2', expectedEventCount: 0 });
  expect(result.events!.every(event => event.vfxPresentation === 'direct')).toBe(true);
  expect(result.board!.top.map(unit => unit!.hp)).toEqual([860, 860]);
});
