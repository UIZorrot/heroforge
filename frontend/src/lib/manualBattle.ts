import type { BattleBoardState, BattleBoardUnit, BattleBoardSkill, BattleEvent, BattleActionOption, BattleResult } from './battleTypes';
import type { BattleSessionAction, BattleSessionSnapshot } from '../types';
import { toNumber } from './gameLogic';

// Local testing only. Live actions are resolved and validated by the server.
type LocalSession = BattleSessionSnapshot & { turnOrder: string[]; turnIndex: number };
const alive = (unit: BattleBoardUnit | null): unit is BattleBoardUnit => Boolean(unit && unit.hp > 0 && unit.alive);
const units = (board: BattleBoardState) => [...board.bottom, ...board.top].filter(alive);
const sum = (team: Array<BattleBoardUnit | null>, key: 'hp' | 'mp' | 'maxHp' | 'maxMp') => team.reduce((total, unit) => total + Math.max(0, unit?.[key] ?? 0), 0);
const stunned = (unit: BattleBoardUnit) => unit.buffs.some(buff => buff.name === 'stun' && buff.duration > 0);
export const isPassiveSkill = (skill?: BattleBoardSkill) => ['true', '1'].includes(String(skill?.IS_PASSIVE ?? '').toLowerCase());
const fields = ['BUFF_HP', 'BUFF_MP', 'BUFF_DMG', 'BUFF_CC', 'BUFF_DEF', 'BUFF_EV', 'BUFF_AC'] as const;
const names = new Set(['stun', 'frozen', 'poison', 'wound', 'burn', 'curse', 'heal', 'pray']);

function stat(unit: BattleBoardUnit, key: string, fallback = 0) {
  let value = toNumber(unit.state?.[key], fallback);
  for (const buff of unit.buffs) {
    if (buff.effects) {
      const field = ({ ATK: 'BUFF_DMG', DEF: 'BUFF_DEF', CC: 'BUFF_CC', EV: 'BUFF_EV', AC: 'BUFF_AC' } as Record<string, string>)[key];
      if (names.has(buff.name) && field && !(field === 'BUFF_DMG' && ['poison', 'wound', 'burn'].includes(buff.name))) {
        value += (['pray', 'heal'].includes(buff.name) ? 1 : -1) * (buff.effects[field] ?? 0);
      }
      if (buff.name === 'frozen' && key === 'SPEED') value -= 5 * (buff.effects.BUFF_EV ?? 0);
    } else {
      if (buff.name === 'pray' && ['ATK', 'DEF', 'SPEED'].includes(key)) value += buff.value;
      if (buff.name === 'curse' && ['ATK', 'DEF'].includes(key)) value -= buff.value;
      if (buff.name === 'frozen' && key === 'SPEED') value -= 5 * buff.value;
      if (buff.name === 'frozen' && key === 'AC') value -= buff.value;
      if (buff.name === 'frozen' && key === 'EV' && buff.value > 0) value = 0;
    }
  }
  return Math.min(key === 'DEF' || key === 'PI' ? 80 : ['CC', 'EV', 'AC', 'CA'].includes(key) ? 100 : Infinity,
    Math.max(['ATK', 'SPEED'].includes(key) ? 1 : 0, value));
}

export function manualTargets(board: BattleBoardState, actor: BattleBoardUnit, skill?: BattleBoardSkill): string[] {
  const mode = String(skill?.TARGET ?? 'enemy').toLowerCase();
  if (mode === 'self') return [actor.tag];
  const range = String(skill?.RANGE ?? skill?.TARGET ?? 'enemy').toLowerCase();
  const pool = units(board).filter(unit => mode === 'ally' ? unit.side === actor.side : unit.side !== actor.side);
  const inRange = pool.filter(unit => range === 'melee' ? unit.slot === actor.slot : range === 'ranged' ? Math.abs(unit.slot - actor.slot) <= 1 : true);
  return (mode === 'ally' && !inRange.length ? pool : inRange)
    .sort((a, b) => Math.abs(a.slot - actor.slot) - Math.abs(b.slot - actor.slot) || a.hp - b.hp).map(unit => unit.tag);
}

export function manualOptions(board: BattleBoardState, actor: BattleBoardUnit): BattleActionOption[] {
  const options: BattleActionOption[] = [undefined, 's1', 's2'].flatMap(slot => {
    const skill = slot ? actor.skills?.[slot] : undefined;
    if (slot && (!skill || isPassiveSkill(skill))) return [];
    const cost = Math.max(0, toNumber(skill?.MP_COST));
    const targets = manualTargets(board, actor, skill);
    return [{ kind: slot ? 'skill' : 'attack', skillSlot: slot as 's1' | 's2' | undefined, name: skill?.name ?? 'Attack', cost, targets,
      disabled: cost > actor.mp ? 'Not enough MP' : !targets.length ? 'No legal targets' : null }];
  });
  options.push({ kind: 'wait', name: 'Wait', cost: 0, targets: [actor.tag], disabled: null });
  return options;
}

function emit(session: LocalSession, actor: BattleBoardUnit, target: BattleBoardUnit, actionType: BattleEvent['actionType'],
  skill?: BattleBoardSkill, damage = 0, heal = 0, cost = 0, crit = false, miss = false, stun = false, group?: Pick<BattleEvent, 'actionId' | 'targetIndex' | 'targetCount'>) {
  const board = session.board!;
  const log = `[Round ${session.round}] ${actor.name} ${actionType === 'stunned' ? 'is stunned' : `uses ${skill?.name ?? 'Attack'} on ${target.name} · ${damage} damage${heal ? ` · +${heal} HP` : ''}`}`;
  session.events!.push({ ...group, round: session.round, attacker: actor.tag, defender: target.tag, attackerSlot: actor.slot, defenderSlot: target.slot,
    actionType, vfxPresentation: skill?.VFX_PRESENTATION ?? 'auto', skillName: skill?.name, attackType: String(skill?.TYPE ?? actor.state?.TYPE ?? 'weapon'),
    typeCatalog: String(skill?.type_catalog ?? actor.state?.type_catalog ?? 'instant'), typeEffect: String(skill?.type_effect ?? actor.state?.type_effect ?? 'strike'),
    buffName: skill?.BUFF_NAME || null, buffTypeEffect: String(skill?.buff_type_effect ?? ''), skillRole: String(skill?.ROLE ?? 'attack'), rangeMode: String(skill?.RANGE ?? 'enemy'),
    damage, heal, isCrit: crit, isMiss: miss, isStunned: stun, hpA: sum(board.bottom, 'hp'), hpB: sum(board.top, 'hp'), mpA: sum(board.bottom, 'mp'), mpB: sum(board.top, 'mp'),
    maxHpA: sum(board.bottom, 'maxHp'), maxHpB: sum(board.top, 'maxHp'), maxMpA: sum(board.bottom, 'maxMp'), maxMpB: sum(board.top, 'maxMp'),
    buffsA: structuredClone(board.bottom.flatMap(unit => unit?.buffs ?? [])), buffsB: structuredClone(board.top.flatMap(unit => unit?.buffs ?? [])), mpCostApplied: cost, log, timestamp: session.events!.length + 1 });
  session.logs!.push(log);
  session.boardHistory!.push(structuredClone(board));
}

function hit(session: LocalSession, actor: BattleBoardUnit, target: BattleBoardUnit, skill?: BattleBoardSkill, cost = 0, group?: Pick<BattleEvent, 'actionId' | 'targetIndex' | 'targetCount'>) {
  const support = skill && ['self', 'ally'].includes(String(skill.TARGET).toLowerCase()) && toNumber(skill.DMG) <= 0;
  let damage = 0, heal = 0, crit = false;
  if (!support) {
    if (Math.random() > Math.max(.2, Math.min(1.5, 1 + (stat(actor, 'AC') - stat(target, 'EV')) / 100))) {
      emit(session, actor, target, skill ? 'skill' : 'attack', skill, 0, 0, cost, false, true, false, group); return;
    }
    crit = Math.random() < stat(actor, 'CC') / 100;
    damage = Math.max(1, Math.floor((stat(actor, 'ATK', 20) + toNumber(skill?.DMG)) * (crit ? 1 + stat(actor, 'CA') / 100 : 1)
      * (1 - Math.min(.8, Math.max(0, (stat(target, 'DEF') - stat(actor, 'PI') * .5) / 100)))));
    target.hp = Math.max(0, target.hp - damage); target.alive = target.hp > 0;
  }
  let appliedStun = false;
  if (skill && target.alive) {
    const name = String(skill.BUFF_NAME ?? '').toLowerCase();
    const duration = Math.max(0, toNumber(skill.BUFF_TIME));
    const effects = Object.fromEntries(fields.map(field => [field, Math.max(0, toNumber(skill[field]))]));
    if (name === 'stun' || ['true', '1'].includes(String(skill.IS_STUN).toLowerCase())) {
      target.buffs.push({ name: 'stun', duration: Math.max(1, duration), value: 0 }); appliedStun = true;
    }
    if (names.has(name) && name !== 'stun' && duration > 0 && Object.values(effects).some(Boolean)) {
      target.buffs.push({ name, duration, value: Object.values(effects).find(Boolean) ?? 0, effects });
    } else if (!name && support) {
      heal = Math.min(target.maxHp - target.hp, effects.BUFF_HP); target.hp += heal;
      target.mp = Math.min(target.maxMp, target.mp + effects.BUFF_MP);
      const modifiers = Object.fromEntries(Object.entries(effects).filter(([key]) => !['BUFF_HP', 'BUFF_MP'].includes(key)));
      if (Object.values(modifiers).some(Boolean)) target.buffs.push({ name: 'pray', duration: Math.max(1, duration), value: Object.values(modifiers).find(Boolean) ?? 0, effects: modifiers });
    }
  }
  emit(session, actor, target, skill ? 'skill' : 'attack', skill, damage, heal, cost, crit, false, appliedStun, group);
}

function tickRound(session: LocalSession) {
  for (const unit of units(session.board!)) {
    for (const buff of unit.buffs) {
      if (unit.hp <= 0) break;
      const negative = ['curse', 'frozen', 'poison', 'wound', 'burn'].includes(buff.name);
      const dot = ['poison', 'wound', 'burn'].includes(buff.name) ? buff.effects ? buff.effects.BUFF_HP || buff.effects.BUFF_DMG || 0 : buff.value
        : negative ? buff.effects?.BUFF_HP ?? 0 : 0;
      const regen = ['heal', 'pray'].includes(buff.name) ? buff.effects?.BUFF_HP ?? (buff.name === 'heal' ? buff.value : 0) : 0;
      if (buff.effects?.BUFF_MP) unit.mp = Math.max(0, Math.min(unit.maxMp, unit.mp + (negative ? -1 : 1) * buff.effects.BUFF_MP));
      if (dot > 0) {
        unit.hp = Math.max(0, unit.hp - dot); unit.alive = unit.hp > 0;
        emit(session, unit, unit, 'dot_damage', { name: buff.name, BUFF_NAME: buff.name }, dot);
      }
      if (regen > 0 && unit.alive) {
        const heal = Math.min(unit.maxHp - unit.hp, regen); unit.hp += heal;
        emit(session, unit, unit, 'heal', { name: buff.name, BUFF_NAME: buff.name, type_catalog: 'instant', type_effect: 'heal' }, 0, heal);
      }
    }
    unit.buffs = unit.buffs.map(buff => ({ ...buff, duration: buff.duration - (buff.name === 'stun' ? 0 : 1) })).filter(buff => buff.duration > 0);
  }
}

function refresh(session: LocalSession): LocalSession {
  const board = session.board!;
  while (session.turnIndex < session.turnOrder.length && !units(board).some(unit => unit.tag === session.turnOrder[session.turnIndex])) session.turnIndex++;
  if (session.turnIndex >= session.turnOrder.length && board.bottom.some(alive) && board.top.some(alive)) {
    session.round++; board.round = session.round;
    if (session.round <= 30) tickRound(session);
    session.turnOrder = units(board).sort((a, b) => stat(b, 'SPEED') - stat(a, 'SPEED') || a.tag.localeCompare(b.tag)).map(unit => unit.tag);
    session.turnIndex = 0;
  }
  if (!board.bottom.some(alive) || !board.top.some(alive) || session.round > 30) {
    const hpA = sum(board.bottom, 'hp'), hpB = sum(board.top, 'hp');
    session.status = 'resolved'; session.activeActorTag = null; session.actionOptions = [];
    session.result = { winner: hpA === hpB ? 'Tie' : hpA > hpB ? 'A' : 'B', winnerLabel: hpA === hpB ? 'Tie' : hpA > hpB ? board.bottomLabel : board.topLabel,
      events: session.events ?? [], logs: session.logs ?? [], board: structuredClone(board), boardHistory: session.boardHistory, finalHpA: hpA, finalHpB: hpB, aliveA: board.bottom.filter(alive).length, aliveB: board.top.filter(alive).length };
    return session;
  }
  const actor = units(board).find(unit => unit.tag === session.turnOrder[session.turnIndex])!;
  session.activeActorTag = actor.tag;
  session.expectedActionSource = actor.side === 'B' || stunned(actor) ? 'program' : 'manual';
  session.actionOptions = session.expectedActionSource === 'manual' ? manualOptions(board, actor) : [];
  return session;
}

export function startLocalManualBattle(board: BattleBoardState): BattleSessionSnapshot {
  const copy = structuredClone(board);
  const session: LocalSession = { sessionId: 'local-manual-battle', battleMode: 'arena_2x3', controlMode: 'manual', labelA: copy.bottomLabel, labelB: copy.topLabel, viewerSide: 'A',
    status: 'awaiting_action', round: 1, waitSeconds: 0, board: copy, events: [], logs: [], boardHistory: [structuredClone(copy)], turnOrder: [], turnIndex: 0 };
  for (const actor of units(copy)) for (const skill of Object.values(actor.skills ?? {})) if (isPassiveSkill(skill) && actor.alive) {
    const tags = manualTargets(copy, actor, skill).slice(0, Math.max(1, toNumber(skill?.TARGET_NUM, 1)));
    const actionId = `local:${session.events!.length}`;
    tags.forEach((tag, targetIndex) => {
      const target = units(copy).find(unit => unit.tag === tag);
      if (target) hit(session, actor, target, skill, 0, { actionId, targetIndex, targetCount: tags.length });
    });
  }
  session.turnOrder = units(copy).sort((a, b) => stat(b, 'SPEED') - stat(a, 'SPEED') || a.tag.localeCompare(b.tag)).map(unit => unit.tag);
  return refresh(session);
}

export function advanceLocalManualBattle(previous: BattleSessionSnapshot, action?: BattleSessionAction): BattleSessionSnapshot {
  if (previous.status !== 'awaiting_action') throw new Error('Battle has already ended.');
  const session = structuredClone(previous) as LocalSession;
  const board = session.board!;
  const actor = units(board).find(unit => unit.tag === session.activeActorTag)!;
  if (action && (actor.side !== 'A' || action.actorTag !== actor.tag || action.expectedEventCount !== session.events?.length)) throw new Error('The turn has changed. Please select your action again.');
  if (!action && session.expectedActionSource !== 'program') throw new Error('Waiting for your action.');
  const options = manualOptions(board, actor);
  const chosen = action ? options.find(option => option.kind === action.kind && (option.kind !== 'skill' || option.skillSlot === action.skillSlot))
    : options.find(option => option.kind === 'skill' && !option.disabled) ?? options[0];
  if (stunned(actor)) {
    emit(session, actor, actor, 'stunned');
    actor.buffs = actor.buffs.map(buff => ({ ...buff, duration: buff.duration - (buff.name === 'stun' ? 1 : 0) })).filter(buff => buff.duration > 0);
  } else {
    if (!chosen || chosen.disabled || (action && chosen.kind !== 'wait' && !chosen.targets.includes(action.targetTag ?? ''))) throw new Error(chosen?.disabled ?? 'Choose a legal target.');
    if (chosen.kind === 'wait') {
      const hpRestore = Math.min(actor.maxHp - actor.hp, Math.ceil(actor.maxHp * .1));
      actor.hp += hpRestore; actor.mp = Math.min(actor.maxMp, actor.mp + Math.ceil(actor.maxMp * .1));
      emit(session, actor, actor, 'heal', { name: 'Wait', ROLE: 'support', RANGE: 'self', type_catalog: 'instant', type_effect: 'heal' }, 0, hpRestore);
    } else {
      const skill = chosen.skillSlot ? actor.skills?.[chosen.skillSlot] : undefined;
      const primary = action?.targetTag ?? chosen.targets[0];
      const tags = [primary, ...chosen.targets.filter(tag => tag !== primary)].slice(0, Math.max(1, toNumber(skill?.TARGET_NUM, 1)));
      actor.mp -= chosen.cost;
      const actionId = `local:${session.events!.length}`;
      tags.forEach((tag, index) => { const target = units(board).find(unit => unit.tag === tag); if (target) hit(session, actor, target, skill, index === 0 ? chosen.cost : 0, { actionId, targetIndex: index, targetCount: tags.length }); });
    }
  }
  session.turnIndex++;
  return refresh(session);
}

export function simulateLocalAutoBattle(board: BattleBoardState): BattleResult {
  let session = startLocalManualBattle(board);
  for (let step = 0; step < 360 && session.status !== 'resolved'; step++) {
    const option = session.actionOptions?.find(item => item.kind === 'skill' && !item.disabled) ?? session.actionOptions?.find(item => item.kind === 'attack' && !item.disabled);
    session = session.expectedActionSource === 'program' ? advanceLocalManualBattle(session) : advanceLocalManualBattle(session, option ? {
      actorTag: session.activeActorTag!, kind: option.kind, skillSlot: option.skillSlot, targetTag: option.targets[0], expectedEventCount: session.events!.length,
    } : { actorTag: session.activeActorTag!, kind: 'wait', expectedEventCount: session.events!.length });
  }
  if (!session.result) throw new Error('Local simulation did not finish within its turn limit.');
  return session.result;
}
