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

export function createVfxTestBoard(category: VfxTestCategory, effect: string): BattleBoardState {
  const buff = category === 'buff' ? [{ name: effect, duration: 3, value: 2 }] : [];
  const caster = unit({ tag: 'A1', side: 'A', name: 'VFX CASTER', typeEffect: effect, buffs: buff });
  const target = unit({ tag: 'B1', side: 'B', name: 'TARGET CARD', typeEffect: 'flesh' });

  return {
    round: 1,
    riverLabel: 'VFX',
    bottomLabel: 'Tester',
    topLabel: 'Target',
    bottom: emptySlots(caster),
    top: emptySlots(target),
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
  const base = eventBase(sequence, amount);

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
      hpA: 2200 + heal,
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

export function createVfxTestResult(board: BattleBoardState, event: BattleEvent): BattleResult {
  return {
    winner: 'A',
    winnerLabel: 'Tester',
    logs: [event.log],
    events: [event],
    board,
    boardHistory: [board],
    finalHpA: event.hpA,
    finalHpB: event.hpB,
    maxHpA: event.maxHpA,
    maxHpB: event.maxHpB,
    maxMpA: event.maxMpA,
    maxMpB: event.maxMpB,
    aliveA: 1,
    aliveB: 1,
    summary: event.log,
  };
}
