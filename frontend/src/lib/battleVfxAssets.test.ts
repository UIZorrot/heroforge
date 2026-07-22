import { describe, expect, it } from 'vitest';
import {
  battleVfxTextureAssets,
  blackBackedVfxAlphaForLuminance,
  projectileBeamSequence,
  projectileBeamSequenceFrameIndex,
  projectileBeamSequenceFrameRect,
  projectileFrameCenterAnchorYFromRgba,
  projectileFrameTipAnchorFromRgba,
  projectileVfxAssetFiles,
  instantHitSequence,
  instantHitSequenceAssetFiles,
  instantHitSequenceFrameIndex,
  instantHitSequenceFrameRect,
} from './battleVfxAssets';

describe('battle VFX texture assets', () => {
  it('uses standalone texture files for the particle system instead of atlas frame names', () => {
    const roles = battleVfxTextureAssets.map((asset) => asset.role);

    expect(roles).toEqual(expect.arrayContaining([
      'projectile-beam',
      'instant-hit-sequence',
      'impact-burst',
      'instant-glyph',
      'slash-streak',
      'ring',
      'spark',
      'smoke',
    ]));
    expect(battleVfxTextureAssets.length).toBeGreaterThanOrEqual(10);
    expect(battleVfxTextureAssets.every((asset) => asset.src.endsWith('.png'))).toBe(true);
    expect(battleVfxTextureAssets.every((asset) => !asset.src.includes('vfx-combat-atlas'))).toBe(true);
  });

  it('registers the 4x4 instant hit sequence pack and maps every supported effect', () => {
    expect(instantHitSequence).toEqual({
      columns: 4,
      rows: 4,
      frameCount: 16,
      frameDurationMs: 18,
      durationMs: 288,
      blendMode: 'screen',
    });
    expect(Object.keys(instantHitSequenceAssetFiles)).toHaveLength(15);
    expect(Object.values(instantHitSequenceAssetFiles)).toEqual(expect.arrayContaining([
      'instant-bullet-hit.png',
      'pierce.png',
      'strike.png',
      'smash.png',
      'fire-instantFire.png',
      'thunder-instantStorm.png',
    ]));
    const instantSequenceAssets = battleVfxTextureAssets.filter((asset) => asset.role === 'instant-hit-sequence');
    const projectileFallback = battleVfxTextureAssets.find((asset) => asset.id === 'projectileBeam');
    expect(instantSequenceAssets).toHaveLength(15);
    expect(instantSequenceAssets.every((asset) => asset.src.endsWith('.png'))).toBe(true);
    expect(instantSequenceAssets.every((asset) => asset.src !== projectileFallback?.src)).toBe(true);
    expect(new Set(instantSequenceAssets.map((asset) => asset.src)).size).toBe(15);
  });

  it('maps instant hit progress to 4x4 frames with non-uniform edge-safe rectangles', () => {
    expect(instantHitSequenceFrameIndex(-1)).toBe(0);
    expect(instantHitSequenceFrameIndex(0.5)).toBe(8);
    expect(instantHitSequenceFrameIndex(0.999)).toBe(15);
    expect(instantHitSequenceFrameIndex(1)).toBe(15);
    expect(instantHitSequenceFrameRect(1254, 1254, 0)).toEqual({ x: 0, y: 0, width: 314, height: 314 });
    expect(instantHitSequenceFrameRect(1254, 1254, 5)).toEqual({ x: 314, y: 314, width: 313, height: 313 });
    expect(instantHitSequenceFrameRect(1254, 1254, 15)).toEqual({ x: 941, y: 941, width: 313, height: 313 });
  });

  it('registers the exact canonical projectile spritesheet filenames', () => {
    const projectileSequenceIds = battleVfxTextureAssets
      .filter((asset) => asset.role === 'projectile-sequence')
      .map((asset) => asset.id);

    expect(projectileVfxAssetFiles).toEqual([
      ['projectileBlood', 'projectile-beam-blood.png'],
      ['projectileFire', 'projectile-beam-fire.png'],
      ['projectileFrost', 'projectile-beam-frost.png'],
      ['projectileHoly', 'projectile-beam-holy.png'],
      ['projectileMagic', 'projectile-beam-magic.png'],
      ['projectileNature', 'projectile-beam-nature.png'],
      ['projectileArrow', 'projectile-beam-arrow.png'],
      ['projectileLighting', 'projectile-beam-lighting.png'],
      ['projectileVoid', 'projectile-beam-void.png'],
      ['projectileWater', 'projectile-beam-water.png'],
      ['projectileBullet', 'projectile-beam-bullet.png'],
      ['projectileRock', 'projectile-beam-rock.png'],
    ]);
    expect(projectileSequenceIds).toEqual([
      'projectileBlood',
      'projectileFire',
      'projectileFrost',
      'projectileHoly',
      'projectileMagic',
      'projectileNature',
      'projectileArrow',
      'projectileLighting',
      'projectileVoid',
      'projectileWater',
      'projectileBullet',
      'projectileRock',
    ]);
    expect(new Set(projectileSequenceIds).size).toBe(projectileSequenceIds.length);

    const fallbackAsset = battleVfxTextureAssets.find((asset) => asset.id === 'projectileBeam');
    const projectileAssets = battleVfxTextureAssets.filter((asset) => asset.role === 'projectile-sequence');
    expect(fallbackAsset).toBeDefined();
    expect(projectileAssets).toHaveLength(projectileVfxAssetFiles.length);
    expect(projectileAssets.every((asset) => asset.src !== fallbackAsset?.src)).toBe(true);
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

    expect(projectileBeamSequenceFrameRect(1254, 1254, 0)).toEqual({ x: 0, y: 0, width: 314, height: 314 });
    expect(projectileBeamSequenceFrameRect(1254, 1254, 5)).toEqual({ x: 314, y: 314, width: 313, height: 313 });
    expect(projectileBeamSequenceFrameRect(1254, 1254, 15)).toEqual({ x: 941, y: 941, width: 313, height: 313 });
  });

  it('anchors every sequence frame to its own bright projectile tip', () => {
    const pixels = new Uint8ClampedArray(10 * 6 * 4);
    for (const y of [2, 4]) {
      const pixel = (y * 10 + 8) * 4;
      pixels[pixel] = 240;
      pixels[pixel + 1] = 220;
      pixels[pixel + 2] = 180;
      pixels[pixel + 3] = 255;
    }

    expect(projectileFrameTipAnchorFromRgba(pixels, 10, 6)).toBeCloseTo(0.9, 6);
    expect(projectileFrameTipAnchorFromRgba(new Uint8ClampedArray(10 * 6 * 4), 10, 6)).toBe(0.9);
  });

  it('anchors every sequence frame to its own bright vertical center', () => {
    const pixels = new Uint8ClampedArray(10 * 10 * 4);
    for (let y = 6; y <= 8; y += 1) {
      for (let x = 2; x <= 8; x += 1) {
        const pixel = (y * 10 + x) * 4;
        pixels[pixel] = 220;
        pixels[pixel + 1] = 160;
        pixels[pixel + 2] = 80;
        pixels[pixel + 3] = 255;
      }
    }

    expect(projectileFrameCenterAnchorYFromRgba(pixels, 10, 10)).toBeGreaterThan(0.6);
    expect(projectileFrameCenterAnchorYFromRgba(new Uint8ClampedArray(10 * 10 * 4), 10, 10)).toBe(0.5);
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
});
