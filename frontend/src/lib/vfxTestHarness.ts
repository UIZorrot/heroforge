import { normalizeVfxPresentation, type BattleVfxPresentation } from './battleVfxPresentation';
import {
  canonicalBattleBuffNames,
  canonicalBattleInstantTypeEffects,
  canonicalBattleProjectileTypeEffects,
  type BattleVfxBuffName,
  type BattleVfxInstantTypeEffect,
  type BattleVfxProjectileTypeEffect,
} from './battleVfxCatalog';
import type { BattleBoardState, BattleBoardUnit, BattleEvent, BattleResult, BuffState } from './battleTypes';

export type VfxTestCategory = 'projectile' | 'instant' | 'buff';
export type VfxTestEffect = BattleVfxProjectileTypeEffect | BattleVfxInstantTypeEffect | BattleVfxBuffName;

export type VfxTestOption = {
  value: string;
  label: string;
};

export type VfxTestEventOptions = {
  crit?: boolean;
  amount?: number;
  presentation?: BattleVfxPresentation;
};

export const vfxTestCategories: Array<{ value: VfxTestCategory; label: string }> = [
  { value: 'projectile', label: 'Projectile' },
  { value: 'instant', label: 'Instant' },
  { value: 'buff', label: 'Buff' },
];

function labelForEffect(effect: string) {
  return effect.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function optionsFromCatalog<T extends readonly string[]>(catalog: T): VfxTestOption[] {
  return catalog.map((value) => ({ value, label: labelForEffect(value) }));
}

export const vfxTestOptions: Record<VfxTestCategory, VfxTestOption[]> = {
  projectile: optionsFromCatalog(canonicalBattleProjectileTypeEffects),
  instant: optionsFromCatalog(canonicalBattleInstantTypeEffects),
  buff: optionsFromCatalog(canonicalBattleBuffNames),
};

function emptySlots(unit: BattleBoardUnit): Array<BattleBoardUnit | null> {
  return [unit, null, null, null, null, null];
}

function unit({
  tag,
  side,
  name,
  typeEffect,
  buffs = [],
}: {
  tag: string;
  side: 'A' | 'B';
  name: string;
  typeEffect: string;
  buffs?: BuffState[];
}): BattleBoardUnit {
  return {
    tag,
    side,
    slot: 0,
    name,
    image: side === 'A' ? '/test/奥术法师.png' : '/test/铁甲骑士.png',
    alive: true,
    hp: side === 'A' ? 2200 : 1800,
    maxHp: side === 'A' ? 2200 : 1800,
    mp: side === 'A' ? 120 : 90,
    maxMp: side === 'A' ? 120 : 90,
    buffs,
    state: {
      TYPE: typeEffect,
      ATK: side === 'A' ? 520 : 430,
      DEF: side === 'A' ? 80 : 65,
      SPEED: side === 'A' ? 118 : 96,
      type_catalog: 'proj',
      type_effect: typeEffect,
    },
  };
}

function fillFormation(leader: BattleBoardUnit): BattleBoardUnit[] {
  const portraits = ['奥术法师', '圣洁牧师', '枪火游侠', '自然射手', '虚空术士', '野蛮氏族'];
  return Array.from({ length: 6 }, (_, slot) => slot === 0 ? leader : {
    ...leader, tag: `${leader.side}${slot + 1}`, slot, name: `${leader.side === 'A' ? 'Ally' : 'Rival'} ${slot + 1}`,
    image: `/test/${portraits[(slot + (leader.side === 'A' ? 0 : 2)) % portraits.length]}.png`, buffs: [],
  });
}

export function createVfxTestBoard(category: VfxTestCategory, effect: string, fullFormation = false): BattleBoardState {
  const buff = category === 'buff' ? [{ name: effect, duration: 3, value: 2 }] : [];
  const caster = unit({ tag: 'A1', side: 'A', name: 'VFX CASTER', typeEffect: effect, buffs: buff });
  if (category === 'buff' && effect === 'heal') caster.hp = 1500;
  const target = unit({ tag: 'B1', side: 'B', name: 'TARGET CARD', typeEffect: 'flesh' });

  return {
    round: 1,
    riverLabel: 'VFX',
    bottomLabel: 'Tester',
    topLabel: 'Target',
    bottom: fullFormation ? fillFormation(caster) : emptySlots(caster),
    top: fullFormation ? fillFormation(target) : emptySlots(target),
  };
}

function eventBase(sequence: number, amount: number): Omit<BattleEvent, 'actionType' | 'skillName' | 'attackType' | 'typeCatalog' | 'typeEffect' | 'buffTypeEffect' | 'skillRole' | 'rangeMode' | 'buffName' | 'defender'> {
  return {
    round: 1,
    attacker: 'A1',
    attackerSlot: 0,
    defenderSlot: 0,
    damage: amount,
    heal: 0,
    isCrit: false,
    isMiss: false,
    isStunned: false,
    hpA: 2200,
    hpB: Math.max(1, 1800 - amount),
    mpA: 100,
    mpB: 90,
    maxHpA: 2200,
    maxHpB: 1800,
    maxMpA: 120,
    maxMpB: 90,
    buffsA: [],
    buffsB: [],
    mpCostApplied: 20,
    log: '',
    timestamp: sequence,
  };
}

export function createVfxTestEvent(
  category: VfxTestCategory,
  effect: string,
  sequence: number,
  options: VfxTestEventOptions = {}
): BattleEvent {
  const amount = Math.max(0, Math.floor(options.amount ?? 360));
  const base = { ...eventBase(sequence, amount), vfxPresentation: normalizeVfxPresentation(options.presentation) };

  if (category === 'buff') {
    const heal = effect === 'heal' ? amount : 0;
    return {
      ...base,
      defender: 'A1',
      actionType: heal > 0 ? 'heal' : 'skill',
      skillName: `Test ${labelForEffect(effect)}`,
      attackType: null,
      buffName: effect,
      buffTypeEffect: effect,
      typeCatalog: 'instant',
      typeEffect: effect,
      skillRole: 'buff',
      rangeMode: 'self',
      damage: 0,
      heal,
      hpA: heal > 0 ? Math.min(2200, 1500 + heal) : 2200,
      hpB: 1800,
      buffsA: [{ name: effect, duration: 3, value: 2 }],
      log: `A1 applies ${effect}.`,
    };
  }

  if (category === 'instant') {
    return {
      ...base,
      defender: 'B1',
      actionType: 'skill',
      skillName: `Test ${labelForEffect(effect)}`,
      attackType: effect,
      buffName: null,
      typeCatalog: 'instant',
      typeEffect: effect,
      buffTypeEffect: null,
      skillRole: 'damage',
      rangeMode: 'melee',
      isCrit: Boolean(options.crit),
      damage: options.crit ? Math.floor(amount * 1.45) : amount,
      hpB: Math.max(1, 1800 - (options.crit ? Math.floor(amount * 1.45) : amount)),
      log: `A1 triggers instant ${effect} on B1.`,
    };
  }

  return {
    ...base,
    defender: 'B1',
    actionType: 'skill',
    skillName: `Test ${labelForEffect(effect)}`,
    attackType: effect,
    buffName: null,
    typeCatalog: 'proj',
    typeEffect: effect,
    buffTypeEffect: null,
    skillRole: 'damage',
    rangeMode: 'ranged',
    isCrit: Boolean(options.crit),
    damage: options.crit ? Math.floor(amount * 1.45) : amount,
    hpB: Math.max(1, 1800 - (options.crit ? Math.floor(amount * 1.45) : amount)),
    log: `A1 fires projectile ${effect} at B1.`,
  };
}


export type VfxTestFormation = 'duel' | 'full' | 'pve' | 'custom';
export type VfxTestTeamCounts = { allies: number; enemies: number };
export function vfxTestCount(value: number) {
  return Number.isFinite(value) ? Math.max(1, Math.min(6, Math.floor(value))) : 1;
}
export function vfxFormationCounts(formation: VfxTestFormation, custom: VfxTestTeamCounts = { allies: 1, enemies: 1 }): VfxTestTeamCounts {
  if (formation === 'full') return { allies: 6, enemies: 6 };
  if (formation === 'pve') return { allies: 4, enemies: 6 };
  if (formation === 'duel') return { allies: 1, enemies: 1 };
  return { allies: vfxTestCount(custom.allies), enemies: vfxTestCount(custom.enemies) };
}
export function createVfxScenarioBoard(category: VfxTestCategory, effect: string, formation: VfxTestFormation, custom?: VfxTestTeamCounts) {
  const counts = vfxFormationCounts(formation, custom);
  const board = createVfxTestBoard(category, effect, true);
  board.bottom = board.bottom.map((unit, index) => !unit || index >= counts.allies ? null : { ...unit, buffs: [] });
  board.top = board.top.map((unit, index) => !unit || index >= counts.enemies ? null : { ...unit, buffs: [] });
  return board;
}
/** Reserve dragged slots first so adding a card cannot replace an existing one. */
export function placeVfxTeamUnits(units: Array<BattleBoardUnit | null>, slotOverrides?: Map<string, number>) {
  const next = Array<BattleBoardUnit | null>(6).fill(null);
  const cards = units.filter((unit): unit is BattleBoardUnit => Boolean(unit));
  const ordered = [...cards.filter(unit => slotOverrides?.has(unit.tag)), ...cards.filter(unit => !slotOverrides?.has(unit.tag))];
  for (const unit of ordered) {
    const preferred = slotOverrides?.get(unit.tag) ?? unit.slot;
    const slot = Number.isInteger(preferred) && preferred >= 0 && preferred < 6 && !next[preferred] ? preferred : next.findIndex(value => !value);
    if (slot >= 0) next[slot] = { ...unit, slot };
  }
  return next;
}
function totals(team: Array<BattleBoardUnit | null>, key: 'hp' | 'mp' | 'maxHp' | 'maxMp') {
  return team.reduce((sum, unit) => sum + (unit?.[key] ?? 0), 0);
}
function applyTestHit(board: BattleBoardState, event: BattleEvent) {
  const all = [...board.bottom, ...board.top];
  const actor = all.find(unit => unit?.tag === event.attacker);
  const target = all.find(unit => unit?.tag === event.defender);
  if (actor) actor.mp = Math.max(0, actor.mp - event.mpCostApplied);
  if (target) {
    target.hp = Math.max(0, Math.min(target.maxHp, target.hp - event.damage + event.heal));
    target.alive = target.hp > 0;
    if (event.buffName && target.alive) target.buffs = [{ name: event.buffName, duration: 3, value: 2 }];
  }
}
/** Synthetic results follow real per-target event/history shape, including totals. */
export function createVfxTestAction(board: BattleBoardState, category: VfxTestCategory, effect: string, sequence: number,
  count: number, options: VfxTestEventOptions = {}): BattleEvent[] {
  const support = category === 'buff' && ['heal', 'pray'].includes(effect);
  const candidates = (support ? board.bottom : board.top).filter((unit): unit is BattleBoardUnit => Boolean(unit?.alive));
  // Keep the dragged leader as the primary target; the remaining units follow slots.
  candidates.sort((a, b) => Number(b.tag === (support ? 'A1' : 'B1')) - Number(a.tag === (support ? 'A1' : 'B1')) || a.slot - b.slot);
  const targets = candidates.slice(0, vfxTestCount(count));
  const progress = structuredClone(board);
  const caster = board.bottom.find(unit => unit?.tag === 'A1');
  return targets.map((target, index) => {
    const event = { ...createVfxTestEvent(category, effect, sequence, options), actionId: `vfx:${sequence}`,
      targetIndex: index, targetCount: targets.length, defender: target.tag, attackerSlot: caster?.slot ?? 0,
      defenderSlot: target.slot, rangeMode: support ? 'ally' : category === 'instant' ? 'melee' : 'enemy',
      mpCostApplied: index === 0 ? 20 : 0, timestamp: sequence * 10 + index,
      log: `A1 uses ${effect} on ${target.tag}.` };
    if (event.heal) event.heal = Math.min(target.maxHp - target.hp, event.heal);
    if (event.damage) event.damage = Math.min(target.hp, event.damage);
    applyTestHit(progress, event);
    return { ...event, hpA: totals(progress.bottom, 'hp'), hpB: totals(progress.top, 'hp'),
      mpA: totals(progress.bottom, 'mp'), mpB: totals(progress.top, 'mp'),
      maxHpA: totals(progress.bottom, 'maxHp'), maxHpB: totals(progress.top, 'maxHp'),
      maxMpA: totals(progress.bottom, 'maxMp'), maxMpB: totals(progress.top, 'maxMp'),
      buffsA: progress.bottom.flatMap(unit => structuredClone(unit?.buffs ?? [])),
      buffsB: progress.top.flatMap(unit => structuredClone(unit?.buffs ?? [])) };
  });
}
export function createVfxTestResult(board: BattleBoardState, input: BattleEvent | BattleEvent[]): BattleResult {
  const events = Array.isArray(input) ? input : [input];
  const finalBoard = structuredClone(board), history = [structuredClone(board)];
  for (const event of events) { applyTestHit(finalBoard, event); history.push(structuredClone(finalBoard)); }
  return { winner: 'A', winnerLabel: 'Tester', logs: events.map(event => event.log), events,
    board: finalBoard, boardHistory: history, finalHpA: totals(finalBoard.bottom, 'hp'), finalHpB: totals(finalBoard.top, 'hp'),
    maxHpA: totals(finalBoard.bottom, 'maxHp'), maxHpB: totals(finalBoard.top, 'maxHp'),
    maxMpA: totals(finalBoard.bottom, 'maxMp'), maxMpB: totals(finalBoard.top, 'maxMp'),
    aliveA: finalBoard.bottom.filter(unit => unit?.alive).length, aliveB: finalBoard.top.filter(unit => unit?.alive).length,
    summary: events.map(event => event.log).join(' ') };
}
