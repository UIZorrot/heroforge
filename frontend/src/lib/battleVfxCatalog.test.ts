import { describe, expect, it } from 'vitest';
import {
  canonicalBattleAttackTypes,
  canonicalBattleBuffNames,
  canonicalBattleBuffTypeEffects,
  canonicalBattleInstantTypeEffects,
  canonicalBattleProjectileTypeEffects,
  normalizeBattleProjectileTypeEffect,
  resolveBattleVfxDescriptor,
  resolveBattleVfxFamily,
} from './battleVfxCatalog';

describe('battle VFX catalog', () => {
  it('covers every documented attack effect type', () => {
    expect(canonicalBattleAttackTypes).toEqual([
      'flesh',
      'magic',
      'thunder',
      'weapon',
      'gun',
      'fire',
      'poison',
      'frost',
      'dark',
      'light',
      'nature',
      'water',
    ]);

    const resolved = canonicalBattleAttackTypes.map((attackType) => resolveBattleVfxDescriptor({ actionType: 'skill', attackType, damage: 120 }));

    expect(resolved.map((descriptor) => descriptor.family)).toEqual([
      'flesh',
      'magic',
      'thunder',
      'weapon',
      'gun',
      'fire',
      'poison',
      'frost',
      'dark',
      'light',
      'nature',
      'water',
    ]);
    expect(resolved.every((descriptor) => descriptor.mode === 'projectile')).toBe(true);
  });

  it('defines separate projectile, instant, and buff visual effect catalogs', () => {
    expect(canonicalBattleProjectileTypeEffects).toEqual([
      'blood',
      'fire',
      'frost',
      'holy',
      'magic',
      'nature',
      'arrow',
      'lighting',
      'void',
      'water',
      'bullet',
      'rock',
    ]);
    expect(canonicalBattleInstantTypeEffects).toEqual([
      'magic',
      'thunder',
      'strike',
      'explode',
      'fire',
      'poison',
      'frost',
      'dark',
      'light',
      'nature',
      'water',
      'claw',
      'pierce',
      'blunt',
      'bullet_hit',
    ]);
    expect(canonicalBattleBuffTypeEffects).toEqual([
      'stun',
      'frozen',
      'poison',
      'wound',
      'burn',
      'curse',
      'heal',
      'pray',
    ]);
  });

  it('uses explicit visual catalog fields before legacy TYPE inference', () => {
    expect(resolveBattleVfxDescriptor({
      actionType: 'skill',
      attackType: 'fire',
      typeCatalog: 'instant',
      typeEffect: 'claw',
      damage: 120,
      rangeMode: 'melee',
    })).toMatchObject({
      mode: 'instant',
      typeCatalog: 'instant',
      typeEffect: 'claw',
      family: 'flesh',
      tone: 'wound',
    });

    expect(resolveBattleVfxDescriptor({
      actionType: 'attack',
      attackType: 'weapon',
      typeCatalog: 'proj',
      typeEffect: 'arrow',
      damage: 80,
    })).toMatchObject({
      mode: 'projectile',
      typeCatalog: 'proj',
      typeEffect: 'arrow',
      family: 'weapon',
      tone: 'steel',
    });

    expect(resolveBattleVfxDescriptor({
      actionType: 'skill',
      attackType: 'nature',
      typeCatalog: 'proj',
      typeEffect: 'holy',
      damage: 120,
    })).toMatchObject({
      mode: 'projectile',
      family: 'light',
      tone: 'light',
    });
  });

  it('normalizes legacy projectile metadata into the canonical asset tokens', () => {
    expect(normalizeBattleProjectileTypeEffect('flesh')).toBe('blood');
    expect(normalizeBattleProjectileTypeEffect('light')).toBe('holy');
    expect(normalizeBattleProjectileTypeEffect('gun')).toBe('bullet');
    expect(normalizeBattleProjectileTypeEffect('gunsmoke ranger')).toBe('bullet');
    expect(normalizeBattleProjectileTypeEffect('thunder')).toBe('lighting');
    expect(normalizeBattleProjectileTypeEffect('dark')).toBe('void');
    expect(normalizeBattleProjectileTypeEffect('poison')).toBe('nature');
    expect(normalizeBattleProjectileTypeEffect('earth')).toBe('rock');
  });

  it('uses canonical buff names for support and status visuals independently from hit shape', () => {
    expect(resolveBattleVfxDescriptor({
      actionType: 'skill',
      skillRole: 'buff',
      typeCatalog: 'instant',
      typeEffect: 'strike',
      buffName: 'pray',
      damage: 0,
    })).toMatchObject({
      mode: 'buff',
      typeCatalog: 'instant',
      typeEffect: 'strike',
      family: 'pray',
      tone: 'heal',
    });

    expect(resolveBattleVfxDescriptor({
      actionType: 'dot_damage',
      typeCatalog: 'instant',
      typeEffect: 'strike',
      buffName: 'wound',
      damage: 60,
    })).toMatchObject({
      mode: 'instant',
      family: 'wound',
      tone: 'wound',
    });
  });

  it('covers the canonical gameplay buff names only', () => {
    expect(canonicalBattleBuffNames).toEqual([
      'stun',
      'frozen',
      'poison',
      'wound',
      'burn',
      'curse',
      'heal',
      'pray',
    ]);

    const modes = Object.fromEntries(
      canonicalBattleBuffNames.map((buffName) => [
        buffName,
        resolveBattleVfxDescriptor({ actionType: 'skill', skillRole: 'buff', buffName, damage: 0 }).mode,
      ])
    );

    expect(modes).toMatchObject({
      stun: 'buff',
      frozen: 'buff',
      poison: 'buff',
      wound: 'buff',
      burn: 'buff',
      curse: 'buff',
      heal: 'buff',
      pray: 'buff',
    });
  });

  it('keeps the same effect family usable across projectile, instant, and buff modes', () => {
    expect(resolveBattleVfxDescriptor({ actionType: 'skill', attackType: 'frost', damage: 100, rangeMode: 'ranged' })).toMatchObject({
      family: 'frost',
      mode: 'projectile',
      tone: 'frost',
    });
    expect(resolveBattleVfxDescriptor({ actionType: 'dot_damage', buffName: 'frozen', damage: 50 })).toMatchObject({
      family: 'frost',
      mode: 'instant',
      tone: 'frost',
    });
    expect(resolveBattleVfxDescriptor({ actionType: 'skill', skillRole: 'buff', buffName: 'frozen', damage: 0 })).toMatchObject({
      family: 'frost',
      mode: 'buff',
      tone: 'frost',
    });
  });

  it('distinguishes support, damage-over-time, stun, and basic melee events', () => {
    expect(resolveBattleVfxDescriptor({ actionType: 'heal', buffName: 'heal', heal: 90 })).toMatchObject({ mode: 'buff', family: 'heal', tone: 'heal' });
    expect(resolveBattleVfxDescriptor({ actionType: 'dot_damage', buffName: 'wound', damage: 70 })).toMatchObject({ mode: 'instant', family: 'wound', tone: 'wound' });
    expect(resolveBattleVfxDescriptor({ actionType: 'stunned', buffName: 'stun' })).toMatchObject({ mode: 'instant', family: 'stun', tone: 'stun' });
    expect(resolveBattleVfxDescriptor({ actionType: 'attack', attackType: 'weapon', damage: 80 })).toMatchObject({ mode: 'instant', family: 'weapon', tone: 'steel' });
  });

  it('normalizes common aliases and typo variants from old prompts', () => {
    expect(resolveBattleVfxFamily('forst')).toBe('frost');
    expect(resolveBattleVfxFamily('flash')).toBe('flesh');
    expect(resolveBattleVfxFamily('ice prison')).toBe('frost');
    expect(resolveBattleVfxFamily('lightning bolt')).toBe('thunder');
    expect(resolveBattleVfxFamily('corruption')).toBe('corrupt');
    expect(resolveBattleVfxFamily('vulnerable')).toBe('curse');
  });

  it('treats flesh as blood magic instead of steel weaponry', () => {
    expect(resolveBattleVfxDescriptor({
      actionType: 'skill',
      typeCatalog: 'proj',
      typeEffect: 'flesh',
      damage: 120,
    })).toMatchObject({
      family: 'flesh',
      tone: 'wound',
      mode: 'projectile',
    });
  });
});
