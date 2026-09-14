import { describe, expect, it } from 'vitest';
import { canonicalBattleInstantTypeEffects } from './battleVfxCatalog';
import { INSTANT_PARTICLES, instantParticleSample, isPhysicalInstantSequence, instantPresentationSize, instantParticlePresentationSample } from './battleInstantParticles';
import { instantHitSequenceKeyForEvent } from './battleVfxParticlePlan';
import { BATTLE_PRESENTATION } from './battlePresentation';

describe('procedural instant effects', () => {
  it('preserves only the selected physical sheets and routes claw and blunt to particles', () => {
    const authored = canonicalBattleInstantTypeEffects.filter(typeEffect =>
      isPhysicalInstantSequence(instantHitSequenceKeyForEvent({ typeCatalog: 'instant', typeEffect })),
    );
    expect(authored).toEqual(['strike', 'pierce', 'bullet_hit']);
    expect(isPhysicalInstantSequence(instantHitSequenceKeyForEvent({ type_catalog: 'instant', type_effect: 'blunt' }))).toBe(false);
    expect(isPhysicalInstantSequence(instantHitSequenceKeyForEvent({ typeCatalog: 'instant', typeEffect: 'claw' }))).toBe(false);
    expect(isPhysicalInstantSequence(instantHitSequenceKeyForEvent({ type_catalog: 'instant', type_effect: 'fire' }))).toBe(false);
  });

  it('keeps large hits proportional to the card and inside the projected plane', () => {
    for (const width of [80, 120, 144, 220]) {
      const size = instantPresentationSize(width);
      expect(size.sheetWidth / width).toBeCloseTo(2.8);
      expect(size.sheetWidth * 1.12).toBeLessThan(width * 4);
      expect(size.travelScale / width).toBeCloseTo(2.1 / 120);
    }
    // A visible hold prevents the stronger particles disappearing immediately.
    expect(instantParticleSample('fire', 0, 180).alpha).toBeGreaterThan(.65);
  });

  it('widens the motion without enlarging individual grains or strokes', () => {
    for (const effect of canonicalBattleInstantTypeEffects) {
      for (let index = 0; index < INSTANT_PARTICLES[effect].count; index++) {
        const small = instantParticlePresentationSample(effect, index, 200, 80);
        const large = instantParticlePresentationSample(effect, index, 200, 220);
        expect(large.size).toBe(small.size);
        expect(large.size).toBeLessThanOrEqual(1.3);
        expect(large.x).toBeCloseTo(small.x * 220 / 80);
        expect(large.y).toBeCloseTo(small.y * 220 / 80);
      }
    }
  });

  it('covers every instant effect and settles before the next unit can act', () => {
    for (const effect of canonicalBattleInstantTypeEffects) {
      const recipe = INSTANT_PARTICLES[effect];
      expect(recipe.count).toBeLessThanOrEqual(96);
      expect(recipe.life + 110 + BATTLE_PRESENTATION.anticipationMs).toBeLessThan(BATTLE_PRESENTATION.beatMs);
      let visible = 0;
      for (let i = 0; i < recipe.count; i++) {
        for (const elapsed of [0, 80, 160, 320, 640, 800]) {
          const p = instantParticleSample(effect, i, elapsed, true);
          expect([p.x, p.y, p.alpha, p.size].every(Number.isFinite)).toBe(true);
          expect(p.alpha).toBeGreaterThanOrEqual(0);
          expect(p.alpha).toBeLessThanOrEqual(1);
          expect(Math.hypot(p.x, p.y)).toBeLessThan(160);
          if (p.alpha > 0) visible++;
        }
        expect(instantParticleSample(effect, i, 800).alpha).toBe(0);
      }
      expect(visible).toBeGreaterThan(recipe.count);
    }
  });

  it('gives slashes, flames, implosions and splashes distinct, reproducible movement', () => {
    const effects = ['claw', 'fire', 'dark', 'water'] as const;
    const trajectories = effects.map(effect => [100, 200, 300].map(time => instantParticleSample(effect, 7, time)));
    expect(new Set(trajectories.map(path => JSON.stringify(path))).size).toBe(effects.length);
    expect(instantParticleSample('claw', 7, 200)).toEqual(instantParticleSample('claw', 7, 200));
  });
});
