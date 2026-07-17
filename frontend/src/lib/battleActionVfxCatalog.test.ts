import { describe, expect, it } from 'vitest';
import { resolveBattleActionVfx } from './battleActionVfxCatalog';
import type { BattleEvent } from './battleTypes';

function event(overrides: Partial<BattleEvent>): BattleEvent {
  return {
    round: 1, attacker: 'A1', defender: 'B1', actionType: 'skill', damage: 100, heal: 0,
    isCrit: false, isMiss: false, isStunned: false, hpA: 1000, hpB: 900, mpA: 100, mpB: 100,
    maxHpA: 1000, maxHpB: 1000, maxMpA: 100, maxMpB: 100, buffsA: [], buffsB: [],
    mpCostApplied: 0, log: '', timestamp: 1, ...overrides,
  };
}

describe('battle action VFX contracts', () => {
  it('routes basic attacks to the bespoke treatment', () => {
    expect(resolveBattleActionVfx(event({ actionType: 'attack', typeCatalog: 'instant', typeEffect: 'slash' }))?.id).toBe('basic-attack');
    expect(resolveBattleActionVfx(event({ actionType: 'attack', typeCatalog: 'proj', typeEffect: 'gun' }))).toBeNull();
  });

  it('requires Witchflame Cut to remain instant fire', () => {
    expect(resolveBattleActionVfx(event({ skillName: 'Witchflame Cut', typeCatalog: 'instant', typeEffect: 'fire' }))?.id).toBe('witchflame-cut');
    expect(resolveBattleActionVfx(event({ skillName: 'Witchflame Cut', typeCatalog: 'proj', typeEffect: 'fire' }))).toBeNull();
  });

  it('requires Arcane Comet to remain projectile magic', () => {
    expect(resolveBattleActionVfx(event({ skillName: 'Arcane Comet', type_catalog: 'proj', type_effect: 'magic' }))?.id).toBe('arcane-comet');
    expect(resolveBattleActionVfx(event({ skillName: 'Arcane Comet', typeCatalog: 'instant', typeEffect: 'magic' }))).toBeNull();
  });
});
