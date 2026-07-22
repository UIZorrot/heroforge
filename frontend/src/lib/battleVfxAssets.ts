import projectileBeamUrl from '../assets/battle/vfx-parts/projectile-beam.png';
import impactBurstUrl from '../assets/battle/vfx-parts/impact-burst.png';
import impactBurstFireUrl from '../assets/battle/vfx-parts/impact-burst-fire.png';
import impactBurstBloodUrl from '../assets/battle/vfx-parts/impact-burst-blood.png';
import impactBurstFrostUrl from '../assets/battle/vfx-parts/impact-burst-frost.png';
import impactBurstVoidUrl from '../assets/battle/vfx-parts/impact-burst-void.png';
import impactBurstCurseUrl from '../assets/battle/vfx-parts/impact-burst-curse.png';
import impactBurstHolyUrl from '../assets/battle/vfx-parts/impact-burst-holy.png';
import impactBurstNatureUrl from '../assets/battle/vfx-parts/impact-burst-nature.png';
import impactBurstWaterUrl from '../assets/battle/vfx-parts/impact-burst-water.png';
import impactBurstStormUrl from '../assets/battle/vfx-parts/impact-burst-storm.png';
import impactBurstMagicUrl from '../assets/battle/vfx-parts/impact-burst-magic.png';
import impactBurstSteelUrl from '../assets/battle/vfx-parts/impact-burst-steel.png';
import impactBurstGoldUrl from '../assets/battle/vfx-parts/impact-burst-gold.png';
import instantGlyphFireUrl from '../assets/battle/vfx-parts/instant-glyph-fire.png';
import instantGlyphBloodUrl from '../assets/battle/vfx-parts/instant-glyph-blood.png';
import instantGlyphFrostUrl from '../assets/battle/vfx-parts/instant-glyph-frost.png';
import instantGlyphVoidUrl from '../assets/battle/vfx-parts/instant-glyph-void.png';
import instantGlyphCurseUrl from '../assets/battle/vfx-parts/instant-glyph-curse.png';
import instantGlyphHolyUrl from '../assets/battle/vfx-parts/instant-glyph-holy.png';
import instantGlyphNatureUrl from '../assets/battle/vfx-parts/instant-glyph-nature.png';
import instantGlyphWaterUrl from '../assets/battle/vfx-parts/instant-glyph-water.png';
import instantGlyphStormUrl from '../assets/battle/vfx-parts/instant-glyph-storm.png';
import instantGlyphMagicUrl from '../assets/battle/vfx-parts/instant-glyph-magic.png';
import instantGlyphSteelUrl from '../assets/battle/vfx-parts/instant-glyph-steel.png';
import instantGlyphGoldUrl from '../assets/battle/vfx-parts/instant-glyph-gold.png';
import slashStreakUrl from '../assets/battle/vfx-parts/slash-streak.png';
import ringUrl from '../assets/battle/vfx-parts/ring.png';
import spark01Url from '../assets/battle/vfx-parts/spark-01.png';
import spark02Url from '../assets/battle/vfx-parts/spark-02.png';
import spark03Url from '../assets/battle/vfx-parts/spark-03.png';
import spark04Url from '../assets/battle/vfx-parts/spark-04.png';
import spark05Url from '../assets/battle/vfx-parts/spark-05.png';
import smoke01Url from '../assets/battle/vfx-parts/smoke-01.png';
import smoke02Url from '../assets/battle/vfx-parts/smoke-02.png';
import smoke03Url from '../assets/battle/vfx-parts/smoke-03.png';
import smoke04Url from '../assets/battle/vfx-parts/smoke-04.png';

export type BattleVfxAssetRole = 'projectile-beam' | 'projectile-sequence' | 'instant-hit-sequence' | 'impact-burst' | 'instant-glyph' | 'slash-streak' | 'ring' | 'spark' | 'smoke';

export type BattleVfxTextureAsset = {
  id: string;
  role: BattleVfxAssetRole;
  src: string;
};

const projectileSheetModules = import.meta.glob<string>(
  '../assets/battle/vfx-parts/projectile-beam-*.png',
  { eager: true, import: 'default', query: '?url' }
);

const instantHitSheetModules = import.meta.glob<string>(
  '../assets/battle/vfx-parts/vfx_instant_hit_pack_16f/*.png',
  { eager: true, import: 'default', query: '?url' }
);

export const projectileVfxAssetFiles = [
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
] as const;

function projectileSheetUrl(fileName: string) {
  const path = `../assets/battle/vfx-parts/${fileName}`;
  return projectileSheetModules[path] ?? projectileBeamUrl;
}

export type InstantHitSequenceKey =
  | 'bulletHit'
  | 'claw'
  | 'dark'
  | 'explode'
  | 'fire'
  | 'frost'
  | 'light'
  | 'magic'
  | 'nature'
  | 'pierce'
  | 'poison'
  | 'smash'
  | 'strike'
  | 'thunder'
  | 'water';

export const instantHitSequenceAssetFiles = {
  bulletHit: 'instant-bullet-hit.png',
  claw: 'claw.png',
  dark: 'dark-instantVoid.png',
  explode: 'explode-instantFire.png',
  fire: 'fire-instantFire.png',
  frost: 'frost-instantFrost.png',
  light: 'light-instantHoly.png',
  magic: 'magic-instantMagic.png',
  nature: 'nature-instantNature.png',
  pierce: 'pierce.png',
  poison: 'poison-instantNature.png',
  smash: 'smash.png',
  strike: 'strike.png',
  thunder: 'thunder-instantStorm.png',
  water: 'water-instantWater.png',
} as const satisfies Record<InstantHitSequenceKey, string>;

export const instantHitSequence = {
  columns: 4,
  rows: 4,
  frameCount: 16,
  frameDurationMs: 18,
  durationMs: 288,
  blendMode: 'screen',
} as const;

function instantHitSheetUrl(fileName: string) {
  const path = `../assets/battle/vfx-parts/vfx_instant_hit_pack_16f/${fileName}`;
  return instantHitSheetModules[path]
    ?? instantHitSheetModules['../assets/battle/vfx-parts/vfx_instant_hit_pack_16f/strike.png']
    ?? projectileBeamUrl;
}

export function instantHitSequenceAssetId(key: InstantHitSequenceKey) {
  return `instantHit${key[0].toUpperCase()}${key.slice(1)}`;
}

export function instantHitSequenceFrameIndex(progress: number) {
  const t = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  return Math.min(instantHitSequence.frameCount - 1, Math.floor(t * instantHitSequence.frameCount));
}

export function instantHitSequenceFrameRect(textureWidth: number, textureHeight: number, frameIndex: number) {
  const frame = clamp(Math.floor(frameIndex), 0, instantHitSequence.frameCount - 1);
  const column = frame % instantHitSequence.columns;
  const row = Math.floor(frame / instantHitSequence.columns);
  const x = Math.round(column * textureWidth / instantHitSequence.columns);
  const y = Math.round(row * textureHeight / instantHitSequence.rows);
  const right = Math.round((column + 1) * textureWidth / instantHitSequence.columns);
  const bottom = Math.round((row + 1) * textureHeight / instantHitSequence.rows);
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

export const projectileBeamSequence = {
  assetId: 'projectileBeam',
  columns: 4,
  rows: 4,
  frameCount: 16,
  blendMode: 'add',
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function projectileBeamSequenceFrameIndex(progress: number) {
  const t = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  return Math.min(projectileBeamSequence.frameCount - 1, Math.floor(t * projectileBeamSequence.frameCount));
}

export function projectileBeamSequenceFrameRect(textureWidth: number, textureHeight: number, frameIndex: number) {
  const frame = clamp(Math.floor(frameIndex), 0, projectileBeamSequence.frameCount - 1);
  const column = frame % projectileBeamSequence.columns;
  const row = Math.floor(frame / projectileBeamSequence.columns);
  const x = Math.round(column * textureWidth / projectileBeamSequence.columns);
  const y = Math.round(row * textureHeight / projectileBeamSequence.rows);
  const right = Math.round((column + 1) * textureWidth / projectileBeamSequence.columns);
  const bottom = Math.round((row + 1) * textureHeight / projectileBeamSequence.rows);
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

export function projectileFrameTipAnchorFromRgba(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
) {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const top = Math.floor(safeHeight * 0.2);
  const bottom = Math.max(top + 1, Math.ceil(safeHeight * 0.8));

  for (let x = safeWidth - 1; x >= 0; x -= 1) {
    let brightSamples = 0;
    for (let y = top; y < bottom; y += 2) {
      const pixel = (y * safeWidth + x) * 4;
      const luminance = Math.max(rgba[pixel] ?? 0, rgba[pixel + 1] ?? 0, rgba[pixel + 2] ?? 0);
      const alpha = rgba[pixel + 3] ?? 0;
      if (luminance >= 150 && alpha >= 170) brightSamples += 1;
      if (brightSamples >= 2) return clamp((x + 1) / safeWidth, 0.68, 0.98);
    }
  }

  return 0.9;
}

export function instantHitFrameAnchorFromRgba(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
) {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  let weightedX = 0;
  let weightedY = 0;
  let totalWeight = 0;

  for (let y = 0; y < safeHeight; y += 2) {
    for (let x = 0; x < safeWidth; x += 2) {
      const pixel = (y * safeWidth + x) * 4;
      const luminance = Math.max(rgba[pixel] ?? 0, rgba[pixel + 1] ?? 0, rgba[pixel + 2] ?? 0);
      const alpha = rgba[pixel + 3] ?? 0;
      if (luminance < 36 || alpha < 48) continue;
      const weight = Math.pow(luminance / 255, 2) * (alpha / 255);
      weightedX += (x + 0.5) * weight;
      weightedY += (y + 0.5) * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight <= 0) return { x: 0.5, y: 0.5 };
  return {
    x: clamp(weightedX / totalWeight / safeWidth, 0.35, 0.65),
    y: clamp(weightedY / totalWeight / safeHeight, 0.35, 0.65),
  };
}

export function projectileFrameCenterAnchorYFromRgba(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
) {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  let weightedY = 0;
  let totalWeight = 0;

  for (let y = 0; y < safeHeight; y += 2) {
    for (let x = 0; x < safeWidth; x += 2) {
      const pixel = (y * safeWidth + x) * 4;
      const luminance = Math.max(rgba[pixel] ?? 0, rgba[pixel + 1] ?? 0, rgba[pixel + 2] ?? 0);
      const alpha = rgba[pixel + 3] ?? 0;
      if (luminance < 36 || alpha < 48) continue;
      const weight = Math.pow(luminance / 255, 2) * (alpha / 255);
      weightedY += (y + 0.5) * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight <= 0) return 0.5;
  return clamp(weightedY / totalWeight / safeHeight, 0.3, 0.7);
}

export function blackBackedVfxAlphaForLuminance(luminance: number) {
  const value = clamp(Number.isFinite(luminance) ? luminance : 0, 0, 255);
  if (value <= 8) return 0;
  if (value >= 180) return 1;
  const t = (value - 8) / 172;
  return Math.pow(t, 0.62);
}

/**
 * Instant-hit sheets only need their true-black backing removed; the visible
 * content keeps full opacity so the photorealistic mid-dark body survives.
 */
export function instantHitVfxAlphaForLuminance(luminance: number) {
  const value = clamp(Number.isFinite(luminance) ? luminance : 0, 0, 255);
  if (value <= 10) return 0;
  if (value >= 44) return 1;
  const t = (value - 10) / 34;
  return t * t * (3 - 2 * t);
}

export const battleVfxTextureAssets = [
  { id: 'projectileBeam', role: 'projectile-beam', src: projectileBeamUrl },
  ...projectileVfxAssetFiles.map(([id, fileName]) => ({
    id,
    role: 'projectile-sequence' as const,
    src: projectileSheetUrl(fileName),
  })),
  ...(Object.entries(instantHitSequenceAssetFiles) as [InstantHitSequenceKey, string][]).map(([key, fileName]) => ({
    id: instantHitSequenceAssetId(key),
    role: 'instant-hit-sequence' as const,
    src: instantHitSheetUrl(fileName),
  })),
  { id: 'impactBurst', role: 'impact-burst', src: impactBurstUrl },
  { id: 'impactFire', role: 'impact-burst', src: impactBurstFireUrl },
  { id: 'impactBlood', role: 'impact-burst', src: impactBurstBloodUrl },
  { id: 'impactFrost', role: 'impact-burst', src: impactBurstFrostUrl },
  { id: 'impactVoid', role: 'impact-burst', src: impactBurstVoidUrl },
  { id: 'impactCurse', role: 'impact-burst', src: impactBurstCurseUrl },
  { id: 'impactHoly', role: 'impact-burst', src: impactBurstHolyUrl },
  { id: 'impactNature', role: 'impact-burst', src: impactBurstNatureUrl },
  { id: 'impactWater', role: 'impact-burst', src: impactBurstWaterUrl },
  { id: 'impactStorm', role: 'impact-burst', src: impactBurstStormUrl },
  { id: 'impactMagic', role: 'impact-burst', src: impactBurstMagicUrl },
  { id: 'impactSteel', role: 'impact-burst', src: impactBurstSteelUrl },
  { id: 'impactGold', role: 'impact-burst', src: impactBurstGoldUrl },
  { id: 'instantFire', role: 'instant-glyph', src: instantGlyphFireUrl },
  { id: 'instantBlood', role: 'instant-glyph', src: instantGlyphBloodUrl },
  { id: 'instantFrost', role: 'instant-glyph', src: instantGlyphFrostUrl },
  { id: 'instantVoid', role: 'instant-glyph', src: instantGlyphVoidUrl },
  { id: 'instantCurse', role: 'instant-glyph', src: instantGlyphCurseUrl },
  { id: 'instantHoly', role: 'instant-glyph', src: instantGlyphHolyUrl },
  { id: 'instantNature', role: 'instant-glyph', src: instantGlyphNatureUrl },
  { id: 'instantWater', role: 'instant-glyph', src: instantGlyphWaterUrl },
  { id: 'instantStorm', role: 'instant-glyph', src: instantGlyphStormUrl },
  { id: 'instantMagic', role: 'instant-glyph', src: instantGlyphMagicUrl },
  { id: 'instantSteel', role: 'instant-glyph', src: instantGlyphSteelUrl },
  { id: 'instantGold', role: 'instant-glyph', src: instantGlyphGoldUrl },
  { id: 'slashStreak', role: 'slash-streak', src: slashStreakUrl },
  { id: 'ring', role: 'ring', src: ringUrl },
  { id: 'sparkA', role: 'spark', src: spark01Url },
  { id: 'sparkB', role: 'spark', src: spark02Url },
  { id: 'sparkC', role: 'spark', src: spark03Url },
  { id: 'sparkD', role: 'spark', src: spark04Url },
  { id: 'sparkE', role: 'spark', src: spark05Url },
  { id: 'smokeA', role: 'smoke', src: smoke01Url },
  { id: 'smokeB', role: 'smoke', src: smoke02Url },
  { id: 'smokeC', role: 'smoke', src: smoke03Url },
  { id: 'smokeD', role: 'smoke', src: smoke04Url },
] as const satisfies readonly BattleVfxTextureAsset[];
