import { createVfxScenarioBoard, createVfxTestAction } from '../lib/vfxTestHarness';
import { describe, expect, it } from 'vitest';
import { battleOutcomeForBottom, battlePlaybackHistoryIndex, battleUnitMotionKey } from './ArenaBattleScene';
import { createVfxTestBoard, createVfxTestEvent, createVfxTestResult } from '../lib/vfxTestHarness';

describe('ArenaBattleScene card motion', () => {
  it('changes active card motion keys between VFX replays of the same attack', () => {
    const board = createVfxTestBoard('projectile', 'fire');
    const attacker = board.bottom[0];
    const target = board.top[0];
    const first = createVfxTestEvent('projectile', 'fire', 1);
    const replay = createVfxTestEvent('projectile', 'fire', 2);

    expect(battleUnitMotionKey(attacker, first)).not.toBe(battleUnitMotionKey(attacker, replay));
    expect(battleUnitMotionKey(target, first)).not.toBe(battleUnitMotionKey(target, replay));
  });

  it('keeps inactive card motion keys stable across unrelated VFX replays', () => {
    const board = createVfxTestBoard('projectile', 'fire');
    const inactive = board.bottom[1];
    const first = createVfxTestEvent('projectile', 'fire', 1);
    const replay = createVfxTestEvent('projectile', 'fire', 2);

    expect(battleUnitMotionKey(inactive, first)).toBe(battleUnitMotionKey(inactive, replay));
  });

  it('keeps a frozen buff target stationary across VFX replays', () => {
    const board = createVfxTestBoard('buff', 'frozen');
    const frozenCaster = board.bottom[0];
    const first = createVfxTestEvent('buff', 'frozen', 1);
    const replay = createVfxTestEvent('buff', 'frozen', 2);

    expect(battleUnitMotionKey(frozenCaster, first)).toBe(`${frozenCaster?.tag}-motion-idle`);
    expect(battleUnitMotionKey(frozenCaster, replay)).toBe(`${frozenCaster?.tag}-motion-idle`);
  });

  it('advances event playback past the initial board snapshot', () => {
    expect(battlePlaybackHistoryIndex(6, 5, 0)).toBe(1);
    expect(battlePlaybackHistoryIndex(6, 5, 4)).toBe(5);
    expect(battlePlaybackHistoryIndex(5, 5, 4)).toBe(4);
    expect(battlePlaybackHistoryIndex(0, 5, 0)).toBe(-1);
  });

  it('resolves victory and defeat from the bottom-side perspective', () => {
    const board = createVfxTestBoard('instant', 'strike');
    const event = createVfxTestEvent('instant', 'strike', 1);
    const result = createVfxTestResult(board, event);

    expect(battleOutcomeForBottom({ ...result, winner: 'A', winnerLabel: board.bottomLabel }, board)).toBe('victory');
    expect(battleOutcomeForBottom({ ...result, winner: 'B', winnerLabel: board.topLabel }, board)).toBe('defeat');
    expect(battleOutcomeForBottom({ ...result, winner: 'Tie', winnerLabel: 'Tie' }, board)).toBe('draw');
  });
});

it('restarts the casting pose for consecutive group heals while single status cards stay idle', () => {
  const board = createVfxScenarioBoard('buff', 'heal', 'pve');
  const first = createVfxTestAction(board, 'buff', 'heal', 1, 6)[0];
  const next = createVfxTestAction(board, 'buff', 'heal', 2, 6)[0];
  expect(battleUnitMotionKey(board.bottom[0], first)).not.toBe(battleUnitMotionKey(board.bottom[0], next));
});
