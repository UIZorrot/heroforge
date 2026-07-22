import { describe, expect, it } from 'vitest';
import {
  BATTLE_DEBRIS_RECIPES,
  battleDebrisLingerRecipe,
  battleDebrisRecipeForEvent,
  battleDebrisRecipeForFamily,
} from './battleVfxDebris';
import { canonicalBattleInstantTypeEffects, canonicalBattleProjectileTypeEffects, resolveBattleVfxDescriptor } from './battleVfxCatalog';

describe('battle debris recipes', () => {
  it('covers every family used by projectile and instant effects', () => {
    const families = new Set([
      ...canonicalBattleProjectileTypeEffects.map((effect) => resolveBattleVfxDescriptor({ typeCatalog: 'proj', typeEffect: effect }).family),
      ...canonicalBattleInstantTypeEffects.map((effect) => resolveBattleVfxDescriptor({ typeCatalog: 'instant', typeEffect: effect }).family),
    ]);
    for (const family of families) {
      expect(BATTLE_DEBRIS_RECIPES[family], `missing debris recipe for family ${family}`).toBeDefined();
    }
  });

  it('keeps recipe values sane for particle playback', () => {
    for (const [family, recipe] of Object.entries(BATTLE_DEBRIS_RECIPES)) {
      expect(recipe.count, family).toBeGreaterThanOrEqual(4);
      expect(recipe.count, family).toBeLessThanOrEqual(20);
      expect(recipe.speed[0], family).toBeGreaterThanOrEqual(0);
      expect(recipe.speed[1], family).toBeGreaterThan(recipe.speed[0]);
      expect(recipe.lifeMs[1], family).toBeGreaterThan(recipe.lifeMs[0]);
      expect(recipe.scale[1], family).toBeGreaterThan(recipe.scale[0]);
      expect(recipe.alpha, family).toBeGreaterThan(0.3);
      expect(recipe.alpha, family).toBeLessThanOrEqual(1);
    }
  });

  it('resolves recipes from battle events and falls back to neutral dots', () => {
    expect(battleDebrisRecipeForEvent({ typeCatalog: 'proj', typeEffect: 'fire' }).motion).toBe('rise');
    expect(battleDebrisRecipeForEvent({ typeCatalog: 'instant', typeEffect: 'claw' }).motion).toBe('fall');
    expect(battleDebrisRecipeForEvent({ typeCatalog: 'instant', typeEffect: 'frost' }).pool).toBe('dots');
    expect(battleDebrisRecipeForEvent({}).pool).toBe('dots');
    expect(battleDebrisRecipeForFamily('neutral').pool).toBe('dots');
  });

  it('builds a softer lingering tail from the base recipe', () => {
    const base = battleDebrisRecipeForFamily('fire');
    const linger = battleDebrisLingerRecipe(base);
    expect(linger.count).toBeLessThan(base.count);
    expect(linger.speed[1]).toBeLessThan(base.speed[1]);
    expect(linger.lifeMs[0]).toBeGreaterThan(base.lifeMs[0]);
    expect(linger.alpha).toBeLessThan(base.alpha);
  });
});
