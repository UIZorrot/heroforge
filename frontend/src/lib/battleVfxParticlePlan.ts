import {
  normalizeBattleProjectileTypeEffect,
  resolveBattleVfxDescriptor,
  resolveBattleVfxFamily,
  type BattleVfxFamily,
  type BattleVfxProjectileTypeEffect,
} from './battleVfxCatalog';
import type { InstantHitSequenceKey } from './battleVfxAssets';

export type VfxPoint = { x: number; y: number };
export type RectLike = { left: number; top: number; width: number; height: number };
export type HostRectLike = { left: number; top: number; width?: number; height?: number };
export type RenderSizeLike = { width: number; height: number };

export const PROJECTILE_BODY_LENGTH_SCALE = 1.14;

export type FastProjectilePlan = {
  launchDelayMs: number;
  flightDurationMs: number;
  trailFraction: number;
  trailFadeMs: number;
  impactDelayMs: number;
  particleCount: number;
  emitterParticleCount: number;
  bodyFootprintFraction: number;
};

export type ImpactVfxPlan = {
  style: NonNullable<ProjectileVfxProfile['impactStyle']>;
  radius: number;
  textureKey: ProjectileVfxImpactTextureKey;
  textureAnchor: VfxPoint;
  ringAnchor: VfxPoint;
  showFlashTexture: boolean;
  flashScale: number;
  particleCount: number;
};

export type ProjectileTrailSegment = {
  startT: number;
  endT: number;
  strength: number;
};

export type ProjectileVfxTextureKey = 'sparkA' | 'sparkB' | 'sparkC' | 'sparkD' | 'sparkE';
export type ProjectileVfxSequenceTextureKey =
  | 'projectileBeam'
  | 'projectileBlood'
  | 'projectileFire'
  | 'projectileFrost'
  | 'projectileHoly'
  | 'projectileMagic'
  | 'projectileNature'
  | 'projectileArrow'
  | 'projectileLighting'
  | 'projectileVoid'
  | 'projectileWater'
  | 'projectileBullet'
  | 'projectileRock';
export type ProjectileVfxImpactTextureKey = 'impactFire' | 'impactBlood' | 'impactFrost' | 'impactVoid' | 'impactCurse' | 'impactHoly' | 'impactSteel' | 'impactGold' | 'impactNature' | 'impactWater' | 'impactStorm' | 'impactMagic';
export type ProjectileVfxInstantTextureKey = 'instantFire' | 'instantBlood' | 'instantFrost' | 'instantVoid' | 'instantCurse' | 'instantHoly' | 'instantSteel' | 'instantGold' | 'instantNature' | 'instantWater' | 'instantStorm' | 'instantMagic';

export type ProjectileVfxProfile = {
  id: 'fire' | 'blood' | 'frost' | 'void' | 'curse' | 'holy' | 'steel' | 'bullet' | 'gold' | 'nature' | 'water' | 'storm' | 'magic';
  textureMix: ProjectileVfxTextureKey[];
  speedScale: number;
  trailFraction: number;
  trailFadeMs: number;
  particleDensity: number;
  particleScale: number;
  scatter: number;
  arcBend: number;
  beamTrailFraction: number;
  vectorTrailAlpha: number;
  vectorHeadAlpha: number;
  beamThicknessScale: number;
  tailSmokeWidth: number;
  tailSmokeScale: number;
  emitterRate: number;
  emitterJitter: number;
  coreWidth: number;
  bloomWidth: number;
  headShape: 'beam';
  beamSequenceKey: ProjectileVfxSequenceTextureKey;
  beamSequenceScale?: number;
  beamSequenceFrameRange?: [number, number];
  impactStyle?: 'burst' | 'collapse' | 'shatter' | 'pierce' | 'shock' | 'splash' | 'crush';
  launchDelayScale?: number;
  pathWobble?: number;
  pathWaves?: number;
  depthScale?: number;
  wakeAlpha?: number;
  impactTextureKey: ProjectileVfxImpactTextureKey;
  impactAnchor: VfxPoint;
  impactRingAnchor: VfxPoint;
  impactDirectionalCut?: boolean;
  impactFlashTexture?: boolean;
  instantTextureKey: ProjectileVfxInstantTextureKey;
  instantAnchor: VfxPoint;
  instantScale: number;
  instantClarityScale: number;
  instantParticleCount: number;
  buffGlyphScale: number;
  impactFlashScale: number;
  headGlowRadius: number;
  filamentCount: number;
  slashScaleX: number;
  slashScaleY: number;
  impactScale: number;
  shardCount: number;
};

const INSTANT_HIT_SEQUENCE_BY_TOKEN: Record<string, InstantHitSequenceKey> = {
  bullet: 'bulletHit',
  bullet_hit: 'bulletHit',
  gun: 'bulletHit',
  shot: 'bulletHit',
  claw: 'claw',
  flesh: 'claw',
  blood: 'claw',
  dark: 'dark',
  void: 'dark',
  shadow: 'dark',
  curse: 'dark',
  explode: 'explode',
  fire: 'fire',
  flame: 'fire',
  frost: 'frost',
  frozen: 'frost',
  ice: 'frost',
  holy: 'light',
  light: 'light',
  radiant: 'light',
  magic: 'magic',
  arcane: 'magic',
  nature: 'nature',
  poison: 'poison',
  venom: 'poison',
  smash: 'smash',
  blunt: 'smash',
  rock: 'smash',
  stone: 'smash',
  strike: 'strike',
  pierce: 'pierce',
  arrow: 'strike',
  weapon: 'strike',
  steel: 'strike',
  thunder: 'thunder',
  lightning: 'thunder',
  lighting: 'thunder',
  storm: 'thunder',
  shock: 'thunder',
  water: 'water',
  tide: 'water',
  wave: 'water',
};

function instantHitToken(value?: string | null) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

type ProjectileProfileEvent = {
  actionType?: string | null;
  attackType?: string | null;
  typeCatalog?: string | null;
  typeEffect?: string | null;
  buffTypeEffect?: string | null;
  type_catalog?: string | null;
  type_effect?: string | null;
  buff_type_effect?: string | null;
  skillRole?: string | null;
  skillName?: string | null;
  buffName?: string | null;
  rangeMode?: string | null;
  damage?: number | null;
  heal?: number | null;
  isStunned?: boolean | null;
  isCrit?: boolean | null;
};

export type BuffBorderVfxPlan = {
  placement: 'card-border';
  profile: ProjectileVfxProfile;
  particleTextureMix: ProjectileVfxTextureKey[];
  edgeParticleCount: number;
  borderGlowWidth: number;
  pulseDurationMs: number;
};

const IMPACT_BURST_ANCHOR: VfxPoint = { x: 0.5, y: 0.5 };
const IMPACT_RING_ANCHOR: VfxPoint = { x: 0.5, y: 0.5 };
const INSTANT_GLYPH_ANCHOR: VfxPoint = { x: 0.5, y: 0.5 };

const PROJECTILE_PROFILES: Record<ProjectileVfxProfile['id'], ProjectileVfxProfile> = {
  fire: {
    id: 'fire',
    textureMix: ['sparkB', 'sparkA', 'sparkD', 'sparkC'],
    speedScale: 0.94,
    trailFraction: 0.17,
    trailFadeMs: 142,
    particleDensity: 1.26,
    particleScale: 1.18,
    scatter: 1.18,
    arcBend: 0,
    beamTrailFraction: 0.92,
    vectorTrailAlpha: 0,
    vectorHeadAlpha: 0,
    beamThicknessScale: 0.52,
    tailSmokeWidth: 8,
    tailSmokeScale: 0.11,
    emitterRate: 5,
    emitterJitter: 0.8,
    coreWidth: 9,
    bloomWidth: 27,
    headShape: 'beam',
    beamSequenceKey: 'projectileFire',
    beamSequenceScale: 0.44,
    beamSequenceFrameRange: [4, 11],
    impactTextureKey: 'impactFire',
    impactAnchor: IMPACT_BURST_ANCHOR,
    impactRingAnchor: IMPACT_RING_ANCHOR,
    instantTextureKey: 'instantFire',
    instantAnchor: INSTANT_GLYPH_ANCHOR,
    instantScale: 0.78,
    instantClarityScale: 1.16,
    instantParticleCount: 30,
    buffGlyphScale: 0.84,
    impactFlashScale: 0.84,
    headGlowRadius: 24,
    filamentCount: 7,
    slashScaleX: 1.08,
    slashScaleY: 1.02,
    impactScale: 1.12,
    shardCount: 40,
  },
  blood: {
    id: 'blood',
    textureMix: ['sparkD', 'sparkB', 'sparkA', 'sparkE'],
    speedScale: 0.99,
    trailFraction: 0.13,
    trailFadeMs: 134,
    particleDensity: 1.34,
    particleScale: 1.15,
    scatter: 1.48,
    arcBend: 0,
    beamTrailFraction: 0.78,
    vectorTrailAlpha: 0,
    vectorHeadAlpha: 0,
    beamThicknessScale: 0.57,
    tailSmokeWidth: 8,
    tailSmokeScale: 0.12,
    emitterRate: 6,
    emitterJitter: 0.95,
    coreWidth: 9,
    bloomWidth: 24,
    headShape: 'beam',
    beamSequenceKey: 'projectileBlood',
    beamSequenceScale: 0.43,
    beamSequenceFrameRange: [4, 11],
    impactTextureKey: 'impactBlood',
    impactAnchor: IMPACT_BURST_ANCHOR,
    impactRingAnchor: IMPACT_RING_ANCHOR,
    instantTextureKey: 'instantBlood',
    instantAnchor: INSTANT_GLYPH_ANCHOR,
    instantScale: 0.82,
    instantClarityScale: 1.2,
    instantParticleCount: 38,
    buffGlyphScale: 0.88,
    impactFlashScale: 0.9,
    headGlowRadius: 23,
    filamentCount: 8,
    slashScaleX: 1.12,
    slashScaleY: 1.18,
    impactScale: 1.14,
    shardCount: 44,
  },
  frost: {
    id: 'frost',
    textureMix: ['sparkC', 'sparkA', 'sparkE'],
    speedScale: 0.98,
    trailFraction: 0.14,
    trailFadeMs: 128,
    particleDensity: 1.05,
    particleScale: 0.96,
    scatter: 0.72,
    arcBend: 0,
    beamTrailFraction: 0.86,
    vectorTrailAlpha: 0,
    vectorHeadAlpha: 0,
    beamThicknessScale: 0.46,
    tailSmokeWidth: 7,
    tailSmokeScale: 0.1,
    emitterRate: 4,
    emitterJitter: 0.55,
    coreWidth: 7,
    bloomWidth: 21,
    headShape: 'beam',
    beamSequenceKey: 'projectileFrost',
    beamSequenceScale: 0.42,
    beamSequenceFrameRange: [4, 11],
    impactTextureKey: 'impactFrost',
    impactAnchor: IMPACT_BURST_ANCHOR,
    impactRingAnchor: IMPACT_RING_ANCHOR,
    instantTextureKey: 'instantFrost',
    instantAnchor: INSTANT_GLYPH_ANCHOR,
    instantScale: 0.7,
    instantClarityScale: 1.18,
    instantParticleCount: 32,
    buffGlyphScale: 0.8,
    impactFlashScale: 0.8,
    headGlowRadius: 18,
    filamentCount: 5,
    slashScaleX: 0.92,
    slashScaleY: 0.82,
    impactScale: 0.9,
    shardCount: 46,
  },
  void: {
    id: 'void',
    textureMix: ['sparkA', 'sparkC', 'sparkE', 'sparkB'],
    speedScale: 1.02,
    trailFraction: 0.16,
    trailFadeMs: 160,
    particleDensity: 1.18,
    particleScale: 1.04,
    scatter: 1.42,
    arcBend: 0,
    beamTrailFraction: 0.9,
    vectorTrailAlpha: 0,
    vectorHeadAlpha: 0,
    beamThicknessScale: 0.5,
    tailSmokeWidth: 9,
    tailSmokeScale: 0.11,
    emitterRate: 5,
    emitterJitter: 0.9,
    coreWidth: 8,
    bloomWidth: 30,
    headShape: 'beam',
    beamSequenceKey: 'projectileVoid',
    beamSequenceScale: 0.4,
    beamSequenceFrameRange: [4, 11],
    impactTextureKey: 'impactVoid',
    impactAnchor: IMPACT_BURST_ANCHOR,
    impactRingAnchor: IMPACT_RING_ANCHOR,
    instantTextureKey: 'instantVoid',
    instantAnchor: INSTANT_GLYPH_ANCHOR,
    instantScale: 0.8,
    instantClarityScale: 1.18,
    instantParticleCount: 34,
    buffGlyphScale: 0.86,
    impactFlashScale: 0.88,
    headGlowRadius: 22,
    filamentCount: 6,
    slashScaleX: 1.0,
    slashScaleY: 1.18,
    impactScale: 1.04,
    shardCount: 36,
  },
  curse: {
    id: 'curse',
    textureMix: ['sparkC', 'sparkB', 'sparkD', 'sparkA'],
    speedScale: 1.04,
    trailFraction: 0.15,
    trailFadeMs: 156,
    particleDensity: 1.08,
    particleScale: 0.92,
    scatter: 1.36,
    arcBend: 0,
    beamTrailFraction: 0.86,
    vectorTrailAlpha: 0,
    vectorHeadAlpha: 0,
    beamThicknessScale: 0.49,
    tailSmokeWidth: 8,
    tailSmokeScale: 0.1,
    emitterRate: 4,
    emitterJitter: 0.75,
    coreWidth: 7,
    bloomWidth: 26,
    headShape: 'beam',
    beamSequenceKey: 'projectileBeam',
    beamSequenceScale: 0.4,
    beamSequenceFrameRange: [4, 11],
    impactTextureKey: 'impactCurse',
    impactAnchor: IMPACT_BURST_ANCHOR,
    impactRingAnchor: IMPACT_RING_ANCHOR,
    instantTextureKey: 'instantCurse',
    instantAnchor: INSTANT_GLYPH_ANCHOR,
    instantScale: 0.76,
    instantClarityScale: 1.16,
    instantParticleCount: 32,
    buffGlyphScale: 0.82,
    impactFlashScale: 0.84,
    headGlowRadius: 20,
    filamentCount: 5,
    slashScaleX: 0.95,
    slashScaleY: 1.08,
    impactScale: 0.96,
    shardCount: 34,
  },
  nature: {
    id: 'nature',
    textureMix: ['sparkA', 'sparkC', 'sparkD', 'sparkB'],
    speedScale: 0.97,
    trailFraction: 0.145,
    trailFadeMs: 138,
    particleDensity: 1.08,
    particleScale: 0.9,
    scatter: 0.92,
    arcBend: 0,
    beamTrailFraction: 0.84,
    vectorTrailAlpha: 0,
    vectorHeadAlpha: 0,
    beamThicknessScale: 0.44,
    tailSmokeWidth: 7,
    tailSmokeScale: 0.1,
    emitterRate: 4,
    emitterJitter: 0.65,
    coreWidth: 6,
    bloomWidth: 22,
    headShape: 'beam',
    beamSequenceKey: 'projectileNature',
    beamSequenceScale: 0.42,
    beamSequenceFrameRange: [4, 11],
    impactTextureKey: 'impactNature',
    impactAnchor: IMPACT_BURST_ANCHOR,
    impactRingAnchor: IMPACT_RING_ANCHOR,
    instantTextureKey: 'instantNature',
    instantAnchor: INSTANT_GLYPH_ANCHOR,
    instantScale: 0.7,
    instantClarityScale: 1.14,
    instantParticleCount: 30,
    buffGlyphScale: 0.8,
    impactFlashScale: 0.8,
    headGlowRadius: 17,
    filamentCount: 5,
    slashScaleX: 0.9,
    slashScaleY: 0.76,
    impactScale: 0.92,
    shardCount: 32,
  },
  water: {
    id: 'water',
    textureMix: ['sparkC', 'sparkA', 'sparkE', 'sparkB'],
    speedScale: 1,
    trailFraction: 0.17,
    trailFadeMs: 150,
    particleDensity: 0.95,
    particleScale: 1.02,
    scatter: 1.06,
    arcBend: 0,
    beamTrailFraction: 0.88,
    vectorTrailAlpha: 0,
    vectorHeadAlpha: 0,
    beamThicknessScale: 0.46,
    tailSmokeWidth: 7,
    tailSmokeScale: 0.1,
    emitterRate: 4,
    emitterJitter: 0.7,
    coreWidth: 6,
    bloomWidth: 25,
    headShape: 'beam',
    beamSequenceKey: 'projectileWater',
    beamSequenceScale: 0.42,
    beamSequenceFrameRange: [4, 11],
    impactTextureKey: 'impactWater',
    impactAnchor: IMPACT_BURST_ANCHOR,
    impactRingAnchor: IMPACT_RING_ANCHOR,
    instantTextureKey: 'instantWater',
    instantAnchor: INSTANT_GLYPH_ANCHOR,
    instantScale: 0.72,
    instantClarityScale: 1.14,
    instantParticleCount: 30,
    buffGlyphScale: 0.8,
    impactFlashScale: 0.82,
    headGlowRadius: 18,
    filamentCount: 5,
    slashScaleX: 1.04,
    slashScaleY: 0.72,
    impactScale: 0.95,
    shardCount: 30,
  },
  storm: {
    id: 'storm',
    textureMix: ['sparkB', 'sparkC', 'sparkE', 'sparkA'],
    speedScale: 0.86,
    trailFraction: 0.09,
    trailFadeMs: 104,
    particleDensity: 0.88,
    particleScale: 0.86,
    scatter: 1.52,
    arcBend: 0,
    beamTrailFraction: 0.82,
    vectorTrailAlpha: 0,
    vectorHeadAlpha: 0,
    beamThicknessScale: 0.4,
    tailSmokeWidth: 6,
    tailSmokeScale: 0.09,
    emitterRate: 6,
    emitterJitter: 0.8,
    coreWidth: 5,
    bloomWidth: 18,
    headShape: 'beam',
    beamSequenceKey: 'projectileLighting',
    beamSequenceScale: 0.38,
    beamSequenceFrameRange: [4, 11],
    impactTextureKey: 'impactStorm',
    impactAnchor: IMPACT_BURST_ANCHOR,
    impactRingAnchor: IMPACT_RING_ANCHOR,
    instantTextureKey: 'instantStorm',
    instantAnchor: INSTANT_GLYPH_ANCHOR,
    instantScale: 0.68,
    instantClarityScale: 1.2,
    instantParticleCount: 34,
    buffGlyphScale: 0.78,
    impactFlashScale: 0.78,
    headGlowRadius: 15,
    filamentCount: 4,
    slashScaleX: 0.7,
    slashScaleY: 1.24,
    impactScale: 0.86,
    shardCount: 28,
  },
  magic: {
    id: 'magic',
    textureMix: ['sparkA', 'sparkC', 'sparkD', 'sparkE'],
    speedScale: 1.01,
    trailFraction: 0.155,
    trailFadeMs: 154,
    particleDensity: 1.14,
    particleScale: 1.06,
    scatter: 1.2,
    arcBend: 0,
    beamTrailFraction: 0.9,
    vectorTrailAlpha: 0,
    vectorHeadAlpha: 0,
    beamThicknessScale: 0.5,
    tailSmokeWidth: 8,
    tailSmokeScale: 0.11,
    emitterRate: 5,
    emitterJitter: 0.85,
    coreWidth: 7,
    bloomWidth: 28,
    headShape: 'beam',
    beamSequenceKey: 'projectileMagic',
    beamSequenceScale: 0.42,
    beamSequenceFrameRange: [4, 11],
    impactTextureKey: 'impactMagic',
    impactAnchor: IMPACT_BURST_ANCHOR,
    impactRingAnchor: IMPACT_RING_ANCHOR,
    instantTextureKey: 'instantMagic',
    instantAnchor: INSTANT_GLYPH_ANCHOR,
    instantScale: 0.78,
    instantClarityScale: 1.18,
    instantParticleCount: 34,
    buffGlyphScale: 0.86,
    impactFlashScale: 0.88,
    headGlowRadius: 21,
    filamentCount: 6,
    slashScaleX: 0.98,
    slashScaleY: 1.06,
    impactScale: 1.02,
    shardCount: 34,
  },
  holy: {
    id: 'holy',
    textureMix: ['sparkA', 'sparkB', 'sparkD'],
    speedScale: 0.96,
    trailFraction: 0.13,
    trailFadeMs: 136,
    particleDensity: 0.98,
    particleScale: 1.08,
    scatter: 0.86,
    arcBend: 0,
    beamTrailFraction: 0.86,
    vectorTrailAlpha: 0,
    vectorHeadAlpha: 0,
    beamThicknessScale: 0.46,
    tailSmokeWidth: 7,
    tailSmokeScale: 0.1,
    emitterRate: 4,
    emitterJitter: 0.62,
    coreWidth: 8,
    bloomWidth: 24,
    headShape: 'beam',
    beamSequenceKey: 'projectileHoly',
    beamSequenceScale: 0.42,
    beamSequenceFrameRange: [4, 11],
    impactTextureKey: 'impactHoly',
    impactAnchor: IMPACT_BURST_ANCHOR,
    impactRingAnchor: IMPACT_RING_ANCHOR,
    impactDirectionalCut: false,
    impactFlashTexture: false,
    instantTextureKey: 'instantHoly',
    instantAnchor: INSTANT_GLYPH_ANCHOR,
    instantScale: 0.76,
    instantClarityScale: 1.14,
    instantParticleCount: 28,
    buffGlyphScale: 0.82,
    impactFlashScale: 0.82,
    headGlowRadius: 20,
    filamentCount: 6,
    slashScaleX: 0.98,
    slashScaleY: 0.9,
    impactScale: 1.0,
    shardCount: 30,
  },
  steel: {
    id: 'steel',
    textureMix: ['sparkB', 'sparkA', 'sparkE'],
    speedScale: 0.9,
    trailFraction: 0.1,
    trailFadeMs: 104,
    particleDensity: 0.68,
    particleScale: 0.78,
    scatter: 0.58,
    arcBend: 0,
    beamTrailFraction: 0.82,
    vectorTrailAlpha: 0,
    vectorHeadAlpha: 0,
    beamThicknessScale: 0.36,
    tailSmokeWidth: 5,
    tailSmokeScale: 0.08,
    emitterRate: 3,
    emitterJitter: 0.42,
    coreWidth: 4,
    bloomWidth: 13,
    headShape: 'beam',
    beamSequenceKey: 'projectileArrow',
    beamSequenceScale: 0.36,
    beamSequenceFrameRange: [4, 11],
    impactTextureKey: 'impactSteel',
    impactAnchor: IMPACT_BURST_ANCHOR,
    impactRingAnchor: IMPACT_RING_ANCHOR,
    instantTextureKey: 'instantSteel',
    instantAnchor: INSTANT_GLYPH_ANCHOR,
    instantScale: 0.64,
    instantClarityScale: 1.12,
    instantParticleCount: 24,
    buffGlyphScale: 0.72,
    impactFlashScale: 0.72,
    headGlowRadius: 12,
    filamentCount: 3,
    slashScaleX: 0.72,
    slashScaleY: 0.54,
    impactScale: 0.78,
    shardCount: 24,
  },
  bullet: {
    id: 'bullet',
    textureMix: ['sparkB', 'sparkE', 'sparkA'],
    speedScale: 0.78,
    trailFraction: 0.075,
    trailFadeMs: 86,
    particleDensity: 0.54,
    particleScale: 0.62,
    scatter: 0.28,
    arcBend: 0,
    beamTrailFraction: 0.7,
    vectorTrailAlpha: 0,
    vectorHeadAlpha: 0,
    beamThicknessScale: 0.28,
    tailSmokeWidth: 3,
    tailSmokeScale: 0.055,
    emitterRate: 3,
    emitterJitter: 0.2,
    coreWidth: 2.8,
    bloomWidth: 10,
    headShape: 'beam',
    beamSequenceKey: 'projectileBullet',
    beamSequenceScale: 0.3,
    beamSequenceFrameRange: [4, 11],
    impactTextureKey: 'impactSteel',
    impactAnchor: IMPACT_BURST_ANCHOR,
    impactRingAnchor: IMPACT_RING_ANCHOR,
    instantTextureKey: 'instantSteel',
    instantAnchor: INSTANT_GLYPH_ANCHOR,
    instantScale: 0.58,
    instantClarityScale: 1.14,
    instantParticleCount: 20,
    buffGlyphScale: 0.68,
    impactFlashScale: 0.66,
    headGlowRadius: 9,
    filamentCount: 2,
    slashScaleX: 0.52,
    slashScaleY: 0.36,
    impactScale: 0.68,
    shardCount: 18,
  },
  gold: {
    id: 'gold',
    textureMix: ['sparkA', 'sparkB', 'sparkC', 'sparkD', 'sparkE'],
    speedScale: 0.96,
    trailFraction: 0.15,
    trailFadeMs: 144,
    particleDensity: 1,
    particleScale: 1,
    scatter: 0.95,
    arcBend: 0,
    beamTrailFraction: 0.88,
    vectorTrailAlpha: 0,
    vectorHeadAlpha: 0,
    beamThicknessScale: 0.48,
    tailSmokeWidth: 8,
    tailSmokeScale: 0.1,
    emitterRate: 4,
    emitterJitter: 0.68,
    coreWidth: 7,
    bloomWidth: 23,
    headShape: 'beam',
    beamSequenceKey: 'projectileBeam',
    beamSequenceScale: 0.42,
    beamSequenceFrameRange: [4, 11],
    impactTextureKey: 'impactGold',
    impactAnchor: IMPACT_BURST_ANCHOR,
    impactRingAnchor: IMPACT_RING_ANCHOR,
    instantTextureKey: 'instantGold',
    instantAnchor: INSTANT_GLYPH_ANCHOR,
    instantScale: 0.72,
    instantClarityScale: 1.16,
    instantParticleCount: 30,
    buffGlyphScale: 0.8,
    impactFlashScale: 0.82,
    headGlowRadius: 19,
    filamentCount: 5,
    slashScaleX: 0.95,
    slashScaleY: 0.88,
    impactScale: 0.98,
    shardCount: 32,
  },
};

const PROJECTILE_PROFILE_BY_TYPE: Record<BattleVfxProjectileTypeEffect, ProjectileVfxProfile> = {
  blood: { ...PROJECTILE_PROFILES.blood, arcBend: 0.012, pathWobble: 3.5, pathWaves: 1.25, depthScale: 0.08, wakeAlpha: 0.62, impactStyle: 'collapse', launchDelayScale: 1.06 },
  fire: { ...PROJECTILE_PROFILES.fire, arcBend: -0.018, pathWobble: 2.8, pathWaves: 1.45, depthScale: 0.1, wakeAlpha: 0.78, impactStyle: 'burst', launchDelayScale: 1 },
  frost: { ...PROJECTILE_PROFILES.frost, arcBend: -0.008, pathWobble: 1.2, pathWaves: 1, depthScale: 0.05, wakeAlpha: 0.5, impactStyle: 'shatter', launchDelayScale: 1.02 },
  holy: { ...PROJECTILE_PROFILES.holy, arcBend: 0, pathWobble: 0.5, pathWaves: 1, depthScale: 0.04, wakeAlpha: 0.38, impactStyle: 'burst', launchDelayScale: 1.08 },
  magic: { ...PROJECTILE_PROFILES.magic, arcBend: -0.022, pathWobble: 4.2, pathWaves: 1.7, depthScale: 0.09, wakeAlpha: 0.58, impactStyle: 'burst', launchDelayScale: 1.12 },
  nature: { ...PROJECTILE_PROFILES.nature, arcBend: 0.036, pathWobble: 2.6, pathWaves: 1.3, depthScale: 0.07, wakeAlpha: 0.64, impactStyle: 'splash', launchDelayScale: 1.08 },
  arrow: { ...PROJECTILE_PROFILES.steel, arcBend: 0, pathWobble: 0, pathWaves: 1, depthScale: 0.025, wakeAlpha: 0.18, impactStyle: 'pierce', launchDelayScale: 0.78 },
  lighting: { ...PROJECTILE_PROFILES.storm, arcBend: 0, pathWobble: 2.8, pathWaves: 3.4, depthScale: 0.035, wakeAlpha: 0.32, impactStyle: 'shock', launchDelayScale: 0.66 },
  void: { ...PROJECTILE_PROFILES.void, arcBend: -0.03, pathWobble: 5.2, pathWaves: 1.55, depthScale: 0.1, wakeAlpha: 0.44, impactStyle: 'collapse', launchDelayScale: 1.14 },
  water: { ...PROJECTILE_PROFILES.water, arcBend: 0.026, pathWobble: 5, pathWaves: 1.35, depthScale: 0.085, wakeAlpha: 0.72, impactStyle: 'splash', launchDelayScale: 1.04 },
  bullet: { ...PROJECTILE_PROFILES.bullet, arcBend: 0, pathWobble: 0, pathWaves: 1, depthScale: 0.015, wakeAlpha: 0.12, impactStyle: 'pierce', launchDelayScale: 0.48 },
  rock: { ...PROJECTILE_PROFILES.gold, beamSequenceKey: 'projectileRock', beamSequenceScale: 0.44, speedScale: 1.16, arcBend: 0, pathWobble: 0, pathWaves: 1, depthScale: 0.06, wakeAlpha: 0.9, impactStyle: 'crush', launchDelayScale: 1.28 },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function scaleInHost(hostRect: HostRectLike, renderSize?: RenderSizeLike) {
  return {
    x: renderSize && hostRect.width ? renderSize.width / hostRect.width : 1,
    y: renderSize && hostRect.height ? renderSize.height / hostRect.height : 1,
  };
}

export function pointInHost(point: VfxPoint, hostRect: HostRectLike, renderSize?: RenderSizeLike): VfxPoint {
  const scale = scaleInHost(hostRect, renderSize);
  return {
    x: (point.x - hostRect.left) * scale.x,
    y: (point.y - hostRect.top) * scale.y,
  };
}

export function rectInHost(rect: RectLike, hostRect: HostRectLike, renderSize?: RenderSizeLike) {
  const scale = scaleInHost(hostRect, renderSize);
  return {
    x: (rect.left - hostRect.left) * scale.x,
    y: (rect.top - hostRect.top) * scale.y,
    width: rect.width * scale.x,
    height: rect.height * scale.y,
  };
}

export function centerPointInHost(rect: RectLike, hostRect: HostRectLike, renderSize?: RenderSizeLike): VfxPoint {
  return {
    x: (rect.left + rect.width / 2 - hostRect.left) * scaleInHost(hostRect, renderSize).x,
    y: (rect.top + rect.height / 2 - hostRect.top) * scaleInHost(hostRect, renderSize).y,
  };
}

export function targetHitPointInHost(unitRect: RectLike, hostRect: HostRectLike, renderSize?: RenderSizeLike): VfxPoint {
  return centerPointInHost(unitRect, hostRect, renderSize);
}

export function sourceCastPointInHost(unitRect: RectLike, hostRect: HostRectLike, renderSize?: RenderSizeLike): VfxPoint {
  return centerPointInHost(unitRect, hostRect, renderSize);
}

export function createProjectileVfxProfile(event: ProjectileProfileEvent = {}): ProjectileVfxProfile {
  const descriptor = resolveBattleVfxDescriptor(event);
  if (descriptor.typeCatalog === 'proj') {
    return PROJECTILE_PROFILE_BY_TYPE[normalizeBattleProjectileTypeEffect(descriptor.typeEffect)];
  }
  const family = descriptor.family !== 'neutral'
    ? descriptor.family
    : resolveBattleVfxFamily(event.attackType, event.buffName, event.skillName, event.skillRole, event.rangeMode);
  const familyProfile: Partial<Record<BattleVfxFamily, ProjectileVfxProfile>> = {
    fire: PROJECTILE_PROFILES.fire,
    frost: PROJECTILE_PROFILES.frost,
    thunder: PROJECTILE_PROFILES.storm,
    water: PROJECTILE_PROFILES.water,
    nature: PROJECTILE_PROFILES.nature,
    poison: PROJECTILE_PROFILES.nature,
    corrupt: PROJECTILE_PROFILES.curse,
    dark: PROJECTILE_PROFILES.void,
    light: PROJECTILE_PROFILES.holy,
    magic: PROJECTILE_PROFILES.magic,
    stun: PROJECTILE_PROFILES.storm,
    frozen: PROJECTILE_PROFILES.frost,
    wound: PROJECTILE_PROFILES.blood,
    curse: PROJECTILE_PROFILES.curse,
    heal: PROJECTILE_PROFILES.holy,
    pray: PROJECTILE_PROFILES.holy,
    weapon: PROJECTILE_PROFILES.steel,
    flesh: PROJECTILE_PROFILES.blood,
    gun: PROJECTILE_PROFILES.bullet,
  };

  if (familyProfile[family]) return familyProfile[family];
  if (event.actionType === 'attack') return PROJECTILE_PROFILES.steel;
  return PROJECTILE_PROFILES.gold;
}

export function instantHitSequenceKeyForEvent(event: ProjectileProfileEvent = {}): InstantHitSequenceKey {
  const descriptor = resolveBattleVfxDescriptor(event);
  const directKey = INSTANT_HIT_SEQUENCE_BY_TOKEN[instantHitToken(descriptor.typeEffect)];
  if (directKey) return directKey;

  const familyKey = INSTANT_HIT_SEQUENCE_BY_TOKEN[instantHitToken(descriptor.family)];
  if (familyKey) return familyKey;

  const profileKey: Record<ProjectileVfxProfile['id'], InstantHitSequenceKey> = {
    fire: 'fire',
    blood: 'claw',
    frost: 'frost',
    void: 'dark',
    curse: 'dark',
    holy: 'light',
    steel: 'strike',
    bullet: 'bulletHit',
    gold: 'smash',
    nature: 'nature',
    water: 'water',
    storm: 'thunder',
    magic: 'magic',
  };
  return profileKey[createProjectileVfxProfile(event).id];
}

export function createBuffBorderVfxPlan(event: ProjectileProfileEvent = {}): BuffBorderVfxPlan {
  const profile = createProjectileVfxProfile({
    ...event,
    typeCatalog: undefined,
    typeEffect: undefined,
    type_catalog: undefined,
    type_effect: undefined,
    buffTypeEffect: undefined,
    buff_type_effect: undefined,
  });

  return {
    placement: 'card-border',
    profile,
    particleTextureMix: profile.textureMix,
    edgeParticleCount: Math.round(clamp(18 + profile.particleDensity * 12, 18, 36)),
    borderGlowWidth: Math.round(clamp(2 + profile.particleScale * 2.2, 3, 6)),
    pulseDurationMs: Math.round(clamp(820 * profile.speedScale, 680, 980)),
  };
}

export function createFastProjectilePlan(distance: number, profile: ProjectileVfxProfile = PROJECTILE_PROFILES.gold): FastProjectilePlan {
  const normalized = clamp(distance, 220, 720);
  const launchDelayMs = Math.round(clamp(62 * (profile.launchDelayScale ?? 1), 30, 84));
  const flightDurationMs = Math.round(clamp((142 + normalized * 0.13) * profile.speedScale, 175, 235));
  const trailMaterialScale = clamp(profile.trailFraction / 0.14, 0.72, 1.18);
  const bodyLengthPx = clamp(314 * (profile.beamSequenceScale ?? 0.42) * 0.78 * PROJECTILE_BODY_LENGTH_SCALE, 76, 128);
  const visibleTrailLengthPx = clamp((104 + normalized * 0.05) * trailMaterialScale, 96, 154);

  return {
    launchDelayMs,
    flightDurationMs,
    trailFraction: clamp((bodyLengthPx * 0.72 + visibleTrailLengthPx) / Math.max(180, distance), 0.36, 0.68),
    trailFadeMs: Math.round(clamp(profile.trailFadeMs, 96, 180)),
    impactDelayMs: launchDelayMs + flightDurationMs,
    particleCount: Math.round(clamp((10 + normalized / 42) * profile.particleDensity, 10, 34)),
    emitterParticleCount: Math.round(clamp((16 + normalized / 30) * profile.particleDensity, 18, 54)),
    bodyFootprintFraction: clamp(bodyLengthPx / Math.max(180, distance), 0.1, 0.42),
  };
}

export function createImpactVfxPlan(event: ProjectileProfileEvent = {}): ImpactVfxPlan {
  const profile = createProjectileVfxProfile(event);
  const criticalScale = event.isCrit ? 1.14 : 1;

  return {
    style: profile.impactStyle ?? 'burst',
    radius: Math.round(clamp(64 * profile.impactScale * criticalScale, 48, 92)),
    textureKey: profile.impactTextureKey,
    textureAnchor: { ...profile.impactAnchor },
    ringAnchor: { ...profile.impactRingAnchor },
    showFlashTexture: profile.impactFlashTexture ?? true,
    flashScale: profile.impactFlashScale * criticalScale,
    particleCount: Math.round(profile.shardCount * criticalScale),
  };
}

export function projectileTrailWindow(headT: number, plan: FastProjectilePlan) {
  const endT = clamp(headT, 0, 1);
  return {
    startT: clamp(endT - plan.trailFraction, 0, 1),
    endT,
  };
}

export function projectileTrailBodyJunction(headT: number, plan: FastProjectilePlan) {
  const trail = projectileTrailWindow(headT, plan);
  const bodyFootprint = Math.min(plan.bodyFootprintFraction * 0.72, plan.trailFraction * 0.58);
  return clamp(trail.endT - bodyFootprint, trail.startT, trail.endT);
}

export function projectileTrailSegments(
  headT: number,
  plan: FastProjectilePlan,
  segmentCount = 8,
): ProjectileTrailSegment[] {
  const trail = projectileTrailWindow(headT, plan);
  const bodyJunction = projectileTrailBodyJunction(headT, plan);
  const span = bodyJunction - trail.startT;
  const count = clamp(Math.floor(segmentCount), 3, 12);
  if (span <= 0.001) return [];

  return Array.from({ length: count }, (_, index) => {
    const startRatio = index / count;
    const endRatio = (index + 1) / count;
    return {
      startT: trail.startT + span * startRatio,
      endT: trail.startT + span * endRatio,
      strength: Math.pow(endRatio, 1.55),
    };
  });
}

export function projectileHeadProgress(timeProgress: number) {
  const t = clamp(timeProgress, 0, 1);
  return t * (0.42 + 0.58 * t);
}

export function projectilePathSample(
  start: VfxPoint,
  end: VfxPoint,
  progress: number,
  arcBend = 0,
  wobbleAmplitude = 0,
  wobbleWaves = 1,
) {
  const t = clamp(progress, 0, 1);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: -dy / distance, y: dx / distance };
  const arcEnvelope = 4 * t * (1 - t);
  const arcOffset = distance * arcBend * arcEnvelope;
  const wobbleEnvelope = Math.sin(Math.PI * t);
  const wobblePhase = Math.PI * 2 * wobbleWaves * t;
  const wobbleOffset = wobbleAmplitude * Math.sin(wobblePhase) * wobbleEnvelope;
  const offset = arcOffset + wobbleOffset;
  const arcDerivative = distance * arcBend * (4 - 8 * t);
  const wobbleDerivative = wobbleAmplitude * (
    Math.PI * 2 * wobbleWaves * Math.cos(wobblePhase) * wobbleEnvelope
    + Math.PI * Math.sin(wobblePhase) * Math.cos(Math.PI * t)
  );
  const tangent = {
    x: dx + normal.x * (arcDerivative + wobbleDerivative),
    y: dy + normal.y * (arcDerivative + wobbleDerivative),
  };

  return {
    point: {
      x: start.x + dx * t + normal.x * offset,
      y: start.y + dy * t + normal.y * offset,
    },
    angle: Math.atan2(tangent.y, tangent.x),
    depthEnvelope: Math.sin(Math.PI * t),
  };
}

export function projectileBodyEnvelope(headProgress: number) {
  const t = clamp(headProgress / 0.16, 0, 1);
  const eased = 1 - Math.pow(1 - t, 3);
  return {
    scale: clamp(0.72 + eased * 0.28, 0.72, 1),
    alpha: clamp(0.32 + eased * 0.68, 0.32, 1),
  };
}

export function projectileBodyRenderScale(
  envelopeScale: number,
  depthEnvelope = 0,
  depthScale = 0.05,
) {
  const visualScale = envelopeScale * (1 + depthScale * depthEnvelope);
  return {
    x: visualScale * PROJECTILE_BODY_LENGTH_SCALE,
    y: visualScale,
  };
}

export function projectileFlightFrameIndex(
  flightProgress: number,
  frameRange: [number, number] = [4, 11],
) {
  const first = clamp(Math.floor(frameRange[0]), 0, 11);
  const last = clamp(Math.floor(frameRange[1]), first, 11);
  const t = clamp(flightProgress, 0, 1);
  return first + Math.min(last - first, Math.floor(t * (last - first + 1)));
}

export function projectileAimBasis(start: VfxPoint, end: VfxPoint, angleOffsetDeg = 0) {
  const baseAngle = Math.atan2(end.y - start.y, end.x - start.x);
  const angle = baseAngle + angleOffsetDeg * Math.PI / 180;
  const clean = (value: number) => Math.abs(value) < 1e-10 ? 0 : value;
  const dir = { x: clean(Math.cos(angle)), y: clean(Math.sin(angle)) };
  return {
    angle,
    dir,
    normal: { x: clean(-dir.y), y: dir.x },
  };
}

export function projectileParticleAlpha(ageMs: number, plan: FastProjectilePlan) {
  if (ageMs <= 0) return 1;
  if (ageMs >= plan.trailFadeMs) return 0;
  const t = ageMs / plan.trailFadeMs;
  return Math.pow(1 - t, 2.2);
}
