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

export type BattleVfxAssetRole = 'projectile-beam' | 'projectile-sequence' | 'impact-burst' | 'instant-glyph' | 'buff-border' | 'slash-streak' | 'ring' | 'spark' | 'smoke';

export type BattleVfxTextureAsset = {
  id: string;
  role: BattleVfxAssetRole;
  src: string;
};

const projectileSheetModules = import.meta.glob<string>(
  '../assets/battle/vfx-parts/projectile-beam-*.png',
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
  const width = Math.floor(textureWidth / projectileBeamSequence.columns);
  const height = Math.floor(textureHeight / projectileBeamSequence.rows);
  const column = frame % projectileBeamSequence.columns;
  const row = Math.floor(frame / projectileBeamSequence.columns);
  return {
    x: column * width,
    y: row * height,
    width,
    height,
  };
}

export function blackBackedVfxAlphaForLuminance(luminance: number) {
  const value = clamp(Number.isFinite(luminance) ? luminance : 0, 0, 255);
  if (value <= 8) return 0;
  if (value >= 180) return 1;
  const t = (value - 8) / 172;
  return Math.pow(t, 0.62);
}

export const battleVfxTextureAssets = [
  { id: 'projectileBeam', role: 'projectile-beam', src: projectileBeamUrl },
  ...projectileVfxAssetFiles.map(([id, fileName]) => ({
    id,
    role: 'projectile-sequence' as const,
    src: projectileSheetUrl(fileName),
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
  { id: 'buffBorderFire', role: 'buff-border', src: instantGlyphFireUrl },
  { id: 'buffBorderBlood', role: 'buff-border', src: instantGlyphBloodUrl },
  { id: 'buffBorderFrost', role: 'buff-border', src: instantGlyphFrostUrl },
  { id: 'buffBorderVoid', role: 'buff-border', src: instantGlyphVoidUrl },
  { id: 'buffBorderCurse', role: 'buff-border', src: instantGlyphCurseUrl },
  { id: 'buffBorderHoly', role: 'buff-border', src: instantGlyphHolyUrl },
  { id: 'buffBorderNature', role: 'buff-border', src: instantGlyphNatureUrl },
  { id: 'buffBorderWater', role: 'buff-border', src: instantGlyphWaterUrl },
  { id: 'buffBorderStorm', role: 'buff-border', src: instantGlyphStormUrl },
  { id: 'buffBorderMagic', role: 'buff-border', src: instantGlyphMagicUrl },
  { id: 'buffBorderSteel', role: 'buff-border', src: instantGlyphSteelUrl },
  { id: 'buffBorderGold', role: 'buff-border', src: instantGlyphGoldUrl },
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
