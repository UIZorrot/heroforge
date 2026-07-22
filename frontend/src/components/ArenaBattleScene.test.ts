import { describe, expect, it } from 'vitest';
import { battleUnitMotionKey } from './ArenaBattleScene';
import { createVfxTestBoard, createVfxTestEvent } from '../lib/vfxTestHarness';

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
});
