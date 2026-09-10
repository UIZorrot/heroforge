import { describe, expect, it } from 'vitest';
import { acceptBattleSessionSnapshot, applyPreparationPositions, formationPositions, movePreparationCard } from './battlePreparation';
import { createVfxTestBoard } from './vfxTestHarness';
import type { BattleSessionSnapshot } from '../types';

describe('battle preparation', () => {
  it('swaps allied cards while preserving identity, art, stats and the opposing formation', () => {
    const board = createVfxTestBoard('instant', 'strike', true);
    const moved = movePreparationCard(board, 'A', 'A1', 5);
    expect(moved.bottom[5]?.tag).toBe('A1');
    expect(moved.bottom[0]?.tag).toBe('A6');
    expect(moved.bottom[5]?.image).toBe(board.bottom[0]?.image);
    expect(moved.top).toBe(board.top);
    expect(board.bottom[0]?.tag).toBe('A1');
    expect(applyPreparationPositions(board, 'A', formationPositions(moved, 'A'))).toEqual(moved);
  });
  it('supports empty back-row slots and rejects moves belonging to the opponent', () => {
    const board = createVfxTestBoard('instant', 'strike');
    expect(movePreparationCard(board, 'A', 'B1', 2)).toBe(board);
    expect(movePreparationCard(board, 'A', 'A1', 6)).toBe(board);
    const moved = movePreparationCard(board, 'B', 'B1', 4);
    expect(moved.top[4]?.tag).toBe('B1');
    expect(moved.top[0]).toBeNull();
    expect(moved.bottom).toBe(board.bottom);
  });
  it('does not let stale polling unlock a confirmed formation or restart a resolved match', () => {
    const initial: BattleSessionSnapshot = { sessionId: 'room', battleMode: 'arena_2x3', controlMode: 'program', status: 'preparing', labelA: 'A', labelB: 'B', round: 1, waitSeconds: 1, readiness: { A: false, B: false } };
    const ready = { ...initial, readiness: { A: true, B: false } };
    expect(acceptBattleSessionSnapshot(ready, initial)).toBe(ready);
    const resolved = { ...ready, status: 'resolved' as const, readiness: { A: true, B: true } };
    expect(acceptBattleSessionSnapshot(resolved, ready)).toBe(resolved);
    expect(acceptBattleSessionSnapshot(ready, resolved)).toBe(resolved);
  });
});
