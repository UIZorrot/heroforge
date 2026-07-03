import { describe, expect, it } from 'vitest';
import {
  battleVfxTextureAssets,
  blackBackedVfxAlphaForLuminance,
  projectileBeamSequence,
  projectileBeamSequenceFrameIndex,
  projectileBeamSequenceFrameRect,
} from './battleVfxAssets';

describe('battle VFX texture assets', () => {
  it('uses standalone texture files for the particle system instead of atlas frame names', () => {
    const roles = battleVfxTextureAssets.map((asset) => asset.role);

    expect(roles).toEqual(expect.arrayContaining([
      'projectile-beam',
      'impact-burst',
      'instant-glyph',
      'buff-border',
      'slash-streak',
      'ring',
      'spark',
      'smoke',
    ]));
    expect(battleVfxTextureAssets.length).toBeGreaterThanOrEqual(10);
    expect(battleVfxTextureAssets.every((asset) => asset.src.endsWith('.png'))).toBe(true);
    expect(battleVfxTextureAssets.every((asset) => !asset.src.includes('vfx-combat-atlas'))).toBe(true);
  });

  it('provides independent projectile beam textures for major effect families', () => {
    const projectileBeamIds = battleVfxTextureAssets
      .filter((asset) => asset.role === 'projectile-beam')
      .map((asset) => asset.id);

    expect(projectileBeamIds).toEqual(expect.arrayContaining([
      'beamFire',
      'beamFrost',
      'beamVoid',
      'beamCurse',
      'beamHoly',
      'beamNature',
      'beamWater',
      'beamStorm',
      'beamMagic',
      'beamSteel',
    ]));
    expect(new Set(projectileBeamIds).size).toBe(projectileBeamIds.length);
  });

  it('provides family-specific 4x4 projectile spritesheet sequences', () => {
    const projectileSequenceIds = battleVfxTextureAssets
      .filter((asset) => asset.role === 'projectile-sequence')
      .map((asset) => asset.id);

    expect(projectileSequenceIds).toEqual(expect.arrayContaining([
      'projectileFire',
      'projectileFrost',
      'projectileLight',
      'projectileBlood',
    ]));
    expect(new Set(projectileSequenceIds).size).toBe(projectileSequenceIds.length);
  });

  it('describes projectile-beam.png as a 4x4 black-backed spritesheet sequence', () => {
    expect(projectileBeamSequence).toEqual({
      assetId: 'projectileBeam',
      columns: 4,
      rows: 4,
      frameCount: 16,
      blendMode: 'add',
    });

    expect(projectileBeamSequenceFrameRect(1252, 1252, 0)).toEqual({ x: 0, y: 0, width: 313, height: 313 });
    expect(projectileBeamSequenceFrameRect(1252, 1252, 5)).toEqual({ x: 313, y: 313, width: 313, height: 313 });
    expect(projectileBeamSequenceFrameRect(1252, 1252, 15)).toEqual({ x: 939, y: 939, width: 313, height: 313 });
  });

  it('maps projectile flight progress to spritesheet frames', () => {
    expect(projectileBeamSequenceFrameIndex(-1)).toBe(0);
    expect(projectileBeamSequenceFrameIndex(0)).toBe(0);
    expect(projectileBeamSequenceFrameIndex(0.5)).toBe(8);
    expect(projectileBeamSequenceFrameIndex(0.999)).toBe(15);
    expect(projectileBeamSequenceFrameIndex(1)).toBe(15);
    expect(projectileBeamSequenceFrameIndex(2)).toBe(15);
  });

  it('converts black-backed VFX luminance to soft alpha without damaging bright filaments', () => {
    expect(blackBackedVfxAlphaForLuminance(0)).toBe(0);
    expect(blackBackedVfxAlphaForLuminance(6)).toBe(0);
    expect(blackBackedVfxAlphaForLuminance(18)).toBeGreaterThan(0);
    expect(blackBackedVfxAlphaForLuminance(18)).toBeLessThan(0.2);
    expect(blackBackedVfxAlphaForLuminance(96)).toBeGreaterThan(0.55);
    expect(blackBackedVfxAlphaForLuminance(220)).toBe(1);
  });

  it('provides independent impact burst textures for major effect families', () => {
    const impactIds = battleVfxTextureAssets
      .filter((asset) => asset.role === 'impact-burst')
      .map((asset) => asset.id);

    expect(impactIds).toEqual(expect.arrayContaining([
      'impactFire',
      'impactFrost',
      'impactVoid',
      'impactCurse',
      'impactHoly',
      'impactNature',
      'impactWater',
      'impactStorm',
      'impactMagic',
      'impactSteel',
      'impactGold',
    ]));
    expect(new Set(impactIds).size).toBe(impactIds.length);
  });

  it('provides independent instant effect textures for major effect families', () => {
    const instantIds = battleVfxTextureAssets
      .filter((asset) => asset.role === 'instant-glyph')
      .map((asset) => asset.id);

    expect(instantIds).toEqual(expect.arrayContaining([
      'instantFire',
      'instantFrost',
      'instantVoid',
      'instantCurse',
      'instantHoly',
      'instantNature',
      'instantWater',
      'instantStorm',
      'instantMagic',
      'instantSteel',
      'instantGold',
    ]));
    expect(new Set(instantIds).size).toBe(instantIds.length);
  });

  it('provides border-focused resources for persistent buff VFX', () => {
    const buffBorderIds = battleVfxTextureAssets
      .filter((asset) => asset.role === 'buff-border')
      .map((asset) => asset.id);

    expect(buffBorderIds).toEqual(expect.arrayContaining([
      'buffBorderFire',
      'buffBorderFrost',
      'buffBorderVoid',
      'buffBorderHoly',
      'buffBorderNature',
      'buffBorderWater',
      'buffBorderStorm',
      'buffBorderMagic',
      'buffBorderSteel',
    ]));
    expect(new Set(buffBorderIds).size).toBe(buffBorderIds.length);
  });
});
