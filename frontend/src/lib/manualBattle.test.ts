import { describe, it, expect } from 'vitest';
import { startLocalManualBattle, advanceLocalManualBattle, manualOptions } from './manualBattle';
import { createVfxTestBoard } from './vfxTestHarness';
import { acceptBattleSessionSnapshot } from './battlePreparation';

function start() {
  const board = createVfxTestBoard('instant', 'strike');
  for (const unit of [...board.bottom, ...board.top]) if (unit) {
    unit.state = { ...unit.state, SPEED: unit.side === 'A' ? 100 : 50, ATK: 100 };
    unit.skills = {};
  }
  return startLocalManualBattle(board);
}

describe('manual training', () => {
  it('waits for the human and rejects invalid or duplicate actions without mutating the board', () => {
    const initial = start();
    expect(() => advanceLocalManualBattle(initial)).toThrow('Waiting for your action');
    const action = { actorTag: initial.activeActorTag!, kind: 'attack' as const, targetTag: 'B1', expectedEventCount: 0 };
    expect(() => advanceLocalManualBattle(initial, { ...action, targetTag: 'A1' })).toThrow('legal target');
    const next = advanceLocalManualBattle(initial, action);
    expect(initial.events).toHaveLength(0);
    expect(next.events).toHaveLength(1);
    expect(next.board!.top[0]!.hp).toBeLessThan(initial.board!.top[0]!.hp);
    expect(() => advanceLocalManualBattle(next, action)).toThrow('turn has changed');
    expect(acceptBattleSessionSnapshot(next, initial)).toBe(next);
  });
  it('offers self-healing and disables unaffordable abilities', () => {
    const initial = start();
    const actor = initial.board!.bottom.find(unit => unit?.tag === initial.activeActorTag)!;
    actor.skills = { s1: { name: 'Mend', TARGET: 'self', BUFF_HP: 20, MP_COST: 10 }, s2: { name: 'Storm', MP_COST: actor.mp + 1 } };
    const options = manualOptions(initial.board!, actor);
    expect(options[1].targets).toEqual([actor.tag]);
    expect(options[2].disabled).toBe('Not enough MP');
    actor.hp -= 50;
    const next = advanceLocalManualBattle(initial, { actorTag: actor.tag, kind: 'skill', skillSlot: 's1', targetTag: actor.tag, expectedEventCount: 0 });
    expect(next.events![0].heal).toBe(20);
    expect(next.events![0].damage).toBe(0);
    expect(next.events![0].mpCostApplied).toBe(10);
  });
  it('offers Wait to every unit and restores ten percent of max HP and MP', () => {
    const initial = start();
    const actor = initial.board!.bottom.find(unit => unit?.tag === initial.activeActorTag)!;
    actor.hp = Math.max(0, actor.maxHp - 100);
    actor.mp = Math.max(0, actor.maxMp - 50);
    const hpBefore = actor.hp;
    const mpBefore = actor.mp;
    const wait = manualOptions(initial.board!, actor).find(option => option.kind === 'wait');
    expect(wait).toMatchObject({ name: 'Wait', cost: 0, targets: [actor.tag] });
    const next = advanceLocalManualBattle(initial, { actorTag: actor.tag, kind: 'wait', targetTag: actor.tag, expectedEventCount: 0 });
    expect(next.board!.bottom.find(unit => unit?.tag === actor.tag)!.hp).toBe(Math.min(actor.maxHp, hpBefore + Math.ceil(actor.maxHp * 0.1)));
    expect(next.board!.bottom.find(unit => unit?.tag === actor.tag)!.mp).toBe(Math.min(actor.maxMp, mpBefore + Math.ceil(actor.maxMp * 0.1)));
    expect(next.events![0]).toMatchObject({ actionType: 'heal', skillName: 'Wait' });
  });
  it('plays through to a result while alternating human choices and AI actions', () => {
    let room = start();
    for (let step = 0; step < 200 && room.status !== 'resolved'; step++) {
      room = room.expectedActionSource === 'program' ? advanceLocalManualBattle(room) : advanceLocalManualBattle(room, {
        actorTag: room.activeActorTag!, kind: 'attack', targetTag: room.actionOptions![0].targets[0], expectedEventCount: room.events!.length,
      });
    }
    expect(room.status).toBe('resolved');
    expect(room.result?.events.length).toBeGreaterThan(0);
  });
});
