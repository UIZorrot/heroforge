import type { BattleBoardState, BattleBoardUnit, BattleBoardSkill, BattleEvent } from './battleTypes';
import type { BattleSessionAction, BattleSessionSnapshot } from '../types';
import type { BattleActionOption } from './battleTypes';
import { toNumber } from './gameLogic';

// Local testing mode only. Production actions are validated and resolved by the server.
type LocalSession = BattleSessionSnapshot & { turnOrder: string[]; turnIndex: number };
const alive = (unit: BattleBoardUnit | null): unit is BattleBoardUnit => Boolean(unit && unit.hp > 0 && unit.alive);
const units = (board: BattleBoardState) => [...board.bottom, ...board.top].filter(alive);
const sum = (team: Array<BattleBoardUnit | null>, key: 'hp' | 'mp' | 'maxHp' | 'maxMp') => team.reduce((total, unit) => total + Math.max(0, unit?.[key] ?? 0), 0);
const stunned = (unit: BattleBoardUnit) => unit.buffs.some(buff => buff.name === 'stun' && buff.duration > 0);

export function manualTargets(board: BattleBoardState, actor: BattleBoardUnit, skill?: BattleBoardSkill): string[] {
  const mode = String(skill?.TARGET ?? 'enemy').toLowerCase();
  if (mode === 'self') return [actor.tag];
  const range = String(skill?.RANGE ?? 'enemy').toLowerCase();
  const pool = units(board).filter(unit => unit.tag !== actor.tag && (mode === 'ally' ? unit.side === actor.side : unit.side !== actor.side));
  const inRange = pool.filter(unit => range === 'melee' ? unit.slot === actor.slot : range === 'ranged' ? Math.abs(unit.slot - actor.slot) <= 1 : true);
  return (mode === 'ally' && !inRange.length ? pool : inRange).map(unit => unit.tag);
}

export function manualOptions(board: BattleBoardState, actor: BattleBoardUnit): BattleActionOption[] {
  return [undefined, 's1', 's2'].flatMap(slot => {
    const skill = slot ? actor.skills?.[slot] : undefined;
    if (slot && !skill) return [];
    const cost = Math.max(0, toNumber(skill?.MP_COST));
    const targets = manualTargets(board, actor, skill);
    return [{ kind: slot ? 'skill' : 'attack', skillSlot: slot as 's1' | 's2' | undefined, name: skill?.name ?? 'Attack', cost, targets, disabled: cost > actor.mp ? 'Not enough MP' : !targets.length ? 'No legal targets' : null }];
  });
}

function refresh(session: LocalSession): LocalSession {
  const board = session.board!;
  const living = units(board);
  while (session.turnIndex < session.turnOrder.length && !living.some(unit => unit.tag === session.turnOrder[session.turnIndex])) session.turnIndex++;
  if (session.turnIndex >= session.turnOrder.length) {
    session.round++;
    board.round = session.round;
    session.turnOrder = living.sort((a, b) => toNumber(b.state?.SPEED) - toNumber(a.state?.SPEED) || a.tag.localeCompare(b.tag)).map(unit => unit.tag);
    session.turnIndex = 0;
  }
  if (!board.bottom.some(alive) || !board.top.some(alive) || session.round > 30) {
    const hpA = sum(board.bottom, 'hp'), hpB = sum(board.top, 'hp');
    session.status = 'resolved'; session.activeActorTag = null; session.actionOptions = [];
    session.result = { winner: hpA === hpB ? 'Tie' : hpA > hpB ? 'A' : 'B', winnerLabel: hpA === hpB ? 'Tie' : hpA > hpB ? board.bottomLabel : board.topLabel, events: session.events ?? [], logs: session.logs ?? [], board: structuredClone(board), boardHistory: session.boardHistory, finalHpA: hpA, finalHpB: hpB, aliveA: board.bottom.filter(alive).length, aliveB: board.top.filter(alive).length };
    return session;
  }
  const actor = living.find(unit => unit.tag === session.turnOrder[session.turnIndex])!;
  session.activeActorTag = actor.tag;
  session.expectedActionSource = actor.side === 'B' || stunned(actor) ? 'program' : 'manual';
  session.actionOptions = session.expectedActionSource === 'manual' ? manualOptions(board, actor) : [];
  return session;
}

export function startLocalManualBattle(board: BattleBoardState): BattleSessionSnapshot {
  const copy = structuredClone(board);
  const turnOrder = units(copy).sort((a, b) => toNumber(b.state?.SPEED) - toNumber(a.state?.SPEED) || a.tag.localeCompare(b.tag)).map(unit => unit.tag);
  return refresh({ sessionId: 'local-manual-battle', battleMode: 'arena_2x3', controlMode: 'manual', labelA: copy.bottomLabel, labelB: copy.topLabel, viewerSide: 'A', status: 'awaiting_action', round: 1, waitSeconds: 0, board: copy, events: [], logs: [], boardHistory: [structuredClone(copy)], turnOrder, turnIndex: 0 });
}

export function advanceLocalManualBattle(previous: BattleSessionSnapshot, action?: BattleSessionAction): BattleSessionSnapshot {
  if (previous.status !== 'awaiting_action') throw new Error('Battle has already ended.');
  const session = structuredClone(previous) as LocalSession;
  const board = session.board!;
  const actor = units(board).find(unit => unit.tag === session.activeActorTag)!;
  if (action && (actor.side !== 'A' || action.actorTag !== actor.tag || action.expectedEventCount !== session.events?.length)) throw new Error('The turn has changed. Please select your action again.');
  if (!action && session.expectedActionSource !== 'program') throw new Error('Waiting for your action.');
  const options = manualOptions(board, actor);
  const chosen = action ? options.find(option => option.kind === action.kind && (option.kind === 'attack' || option.skillSlot === action.skillSlot)) : options.find(option => option.kind === 'skill' && !option.disabled) ?? options[0];
  const skip = stunned(actor);
  if (!skip && (!chosen || chosen.disabled || (action && !chosen.targets.includes(action.targetTag ?? '')))) throw new Error(chosen?.disabled ?? 'Choose a legal target.');
  const target = skip ? actor : units(board).find(unit => unit.tag === (action?.targetTag ?? chosen!.targets[0]))!;
  const skill = !skip && chosen?.skillSlot ? actor.skills?.[chosen.skillSlot] : undefined;
  const cost = skip ? 0 : chosen?.cost ?? 0;
  const support = skill && ['self', 'ally'].includes(String(skill.TARGET).toLowerCase()) && toNumber(skill.DMG) <= 0;
  const damage = skip || support ? 0 : Math.max(1, Math.floor((toNumber(actor.state?.ATK, 20) + toNumber(skill?.DMG)) * (1 - Math.min(.95, Math.max(0, toNumber(target.state?.DEF) - toNumber(actor.state?.PI) * .5) / 100))));
  const heal = skip ? 0 : Math.min(target.maxHp - target.hp, Math.max(0, toNumber(skill?.BUFF_HP)));
  actor.mp -= cost; target.hp = Math.max(0, target.hp - damage + heal); target.alive = target.hp > 0;
  const buffName = String(skill?.BUFF_NAME ?? '').toLowerCase();
  actor.buffs = actor.buffs.map(buff => ({ ...buff, duration: buff.duration - 1 })).filter(buff => buff.duration > 0);
  if (!skip && buffName && toNumber(skill?.BUFF_TIME) > 0) target.buffs.push({ name: buffName, duration: toNumber(skill?.BUFF_TIME), value: toNumber(skill?.BUFF_DMG) || toNumber(skill?.BUFF_DEF) || 0 });
  const log = `[Round ${session.round}] ${actor.name} ${skip ? 'is stunned' : `uses ${skill?.name ?? 'Attack'} on ${target.name}${heal ? ` · +${heal} HP` : ` · ${damage} damage`}`}`;
  const event: BattleEvent = { round: session.round, attacker: actor.tag, defender: target.tag, attackerSlot: actor.slot, defenderSlot: target.slot, actionType: skip ? 'stunned' : skill ? 'skill' : 'attack', skillName: skill?.name, attackType: String(skill?.TYPE ?? actor.state?.TYPE ?? 'weapon'), typeCatalog: String(skill?.type_catalog ?? actor.state?.type_catalog ?? 'instant'), typeEffect: String(skill?.type_effect ?? actor.state?.type_effect ?? 'strike'), buffName: buffName || null, buffTypeEffect: String(skill?.buff_type_effect ?? ''), skillRole: String(skill?.ROLE ?? 'attack'), rangeMode: String(skill?.RANGE ?? 'enemy'), damage, heal, isCrit: false, isMiss: false, isStunned: skip, hpA: sum(board.bottom, 'hp'), hpB: sum(board.top, 'hp'), mpA: sum(board.bottom, 'mp'), mpB: sum(board.top, 'mp'), maxHpA: sum(board.bottom, 'maxHp'), maxHpB: sum(board.top, 'maxHp'), maxMpA: sum(board.bottom, 'maxMp'), maxMpB: sum(board.top, 'maxMp'), buffsA: [], buffsB: [], mpCostApplied: cost, log, timestamp: (session.events?.length ?? 0) + 1 };
  session.events!.push(event); session.logs!.push(log); session.boardHistory!.push(structuredClone(board));
  session.turnIndex++;
  return refresh(session);
}
