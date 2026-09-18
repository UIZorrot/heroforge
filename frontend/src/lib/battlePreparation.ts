import type { BattleSessionSnapshot } from '../types';
import type { BattleBoardState } from './battleTypes';

export function formationPositions(board: BattleBoardState, side: 'A' | 'B') {
  return Object.fromEntries((side === 'A' ? board.bottom : board.top).filter(unit => unit !== null).map(unit => [unit.tag, unit.slot]));
}

export function movePreparationCard(board: BattleBoardState, side: 'A' | 'B', tag: string, slot: number): BattleBoardState {
  const key = side === 'A' ? 'bottom' : 'top';
  const units = board[key];
  const card = units.find(unit => unit?.tag === tag);
  if (!card || !Number.isInteger(slot) || slot < 0 || slot >= 6 || slot === card.slot) return board;
  const next = units.filter(unit => unit !== null).map(unit => unit.tag === tag ? { ...unit, slot } : unit.slot === slot ? { ...unit, slot: card.slot } : unit);
  return { ...board, [key]: Array.from({ length: 6 }, (_, index) => next.find(unit => unit.slot === index) ?? null) };
}

export function applyPreparationPositions(board: BattleBoardState, side: 'A' | 'B', positions: Record<string, number>): BattleBoardState {
  const key = side === 'A' ? 'bottom' : 'top';
  const units = board[key].filter(unit => unit !== null).map(unit => ({ ...unit, slot: positions[unit.tag] ?? unit.slot }));
  return { ...board, [key]: Array.from({ length: 6 }, (_, slot) => units.find(unit => unit.slot === slot) ?? null) };
}

// An in-flight poll must not undo a confirmation or completed battle.
export function acceptBattleSessionSnapshot(current: BattleSessionSnapshot | null, incoming: BattleSessionSnapshot) {
  if (!current || current.sessionId !== incoming.sessionId) return incoming;
  if ((incoming.events?.length ?? 0) < (current.events?.length ?? 0)) return current;
  if (current.status === 'resolved' && incoming.status !== 'resolved') return current;
  if (current.readiness && (['A', 'B'] as const).some(side => current.readiness?.[side] && !incoming.readiness?.[side])) return current;
  return incoming;
}
