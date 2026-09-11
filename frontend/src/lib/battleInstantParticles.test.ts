import { describe, expect, it } from 'vitest';
import { canonicalBattleInstantTypeEffects } from './battleVfxCatalog';
import { INSTANT_PARTICLES, instantParticleSample } from './battleInstantParticles';
import { BATTLE_PRESENTATION } from './battlePresentation';

describe('procedural instant effects', () => {
  it('covers every instant effect and settles before the next unit can act', () => {
    for (const effect of canonicalBattleInstantTypeEffects) {
      const recipe = INSTANT_PARTICLES[effect];
      expect(recipe.count).toBeLessThanOrEqual(80);
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
