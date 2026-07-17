import { describe, expect, it } from 'vitest';
import { battleActionVfxDefinitions, resolveBattleActionVfx } from './battleActionVfxCatalog';
import { namedActionVfxAssetsFor } from './battleNamedActionVfxAssets';
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
  it('covers the basic attack and every real starter skill with an independent texture', () => {
    expect(battleActionVfxDefinitions).toHaveLength(17);
    expect(new Set(battleActionVfxDefinitions.map((definition) => definition.assetId))).toHaveLength(17);
    for (const definition of battleActionVfxDefinitions) {
      expect(namedActionVfxAssetsFor(definition).map((asset) => asset.id)).toContain(definition.assetId);
    }
  });

  it('resolves every generated contract without mutating its gameplay fields', () => {
    for (const definition of battleActionVfxDefinitions) {
      expect(resolveBattleActionVfx(event({
        actionType: definition.actionType,
        skillName: definition.skillName ?? undefined,
        typeCatalog: definition.typeCatalog,
        typeEffect: definition.typeEffect,
      }))?.id).toBe(definition.id);
    }
  });

  it('rejects similarly named events when their catalog contract is wrong', () => {
    expect(resolveBattleActionVfx(event({ skillName: 'Witchflame Cut', typeCatalog: 'proj', typeEffect: 'fire' }))).toBeNull();
    expect(resolveBattleActionVfx(event({ skillName: 'Arcane Comet', typeCatalog: 'instant', typeEffect: 'magic' }))).toBeNull();
  });
});
