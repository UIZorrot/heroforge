import { describe, expect, it } from 'vitest';
import {
  centerPointInHost,
  createFastProjectilePlan,
  createBuffBorderVfxPlan,
  createProjectileVfxProfile,
  targetHitPointInHost,
  projectileHeadProgress,
  projectileTrailWindow,
  projectileParticleAlpha,
  projectileAimBasis,
  projectileSequenceReveal,
} from './battleVfxParticlePlan';

describe('battle VFX particle plan', () => {
  it('keeps projectile timing fast and the visible trail short', () => {
    const plan = createFastProjectilePlan(520);

    expect(plan.flightDurationMs).toBeGreaterThanOrEqual(205);
    expect(plan.flightDurationMs).toBeLessThanOrEqual(255);
    expect(plan.trailFraction).toBeLessThanOrEqual(0.18);
    expect(plan.trailFadeMs).toBeLessThanOrEqual(180);
    expect(plan.beamLingerMs).toBeLessThanOrEqual(35);
    expect(plan.impactDelayMs).toBe(plan.flightDurationMs);
  });

  it('only draws a short trail window immediately behind the projectile head', () => {
    const plan = createFastProjectilePlan(520);
    const window = projectileTrailWindow(0.72, plan);

    expect(window.endT).toBeCloseTo(0.72, 4);
    expect(window.startT).toBeGreaterThan(0.54);
    expect(window.endT - window.startT).toBeLessThanOrEqual(0.18);
  });

  it('keeps the projectile body visible through the middle of the flight', () => {
    expect(projectileHeadProgress(0)).toBe(0);
    expect(projectileHeadProgress(0.5)).toBeLessThanOrEqual(0.78);
    expect(projectileHeadProgress(0.85)).toBeLessThan(0.98);
    expect(projectileHeadProgress(1)).toBe(1);
  });

  it('unfolds authored projectile sprites from the head instead of sliding a full decal', () => {
    const start = projectileSequenceReveal(0);
    const early = projectileSequenceReveal(0.18);
    const middle = projectileSequenceReveal(0.42);
    const late = projectileSequenceReveal(0.78);

    expect(start.scaleX).toBeLessThan(0.24);
    expect(start.scaleY).toBeGreaterThan(0.72);
    expect(early.scaleX).toBeGreaterThan(start.scaleX);
    expect(middle.scaleX).toBeGreaterThan(early.scaleX);
    expect(middle.scaleX).toBeLessThan(1);
    expect(late.scaleX).toBe(1);
    expect(late.scaleY).toBe(1);
  });

  it('can rotate the projectile visual basis without changing the card-to-card path', () => {
    const straight = projectileAimBasis({ x: 0, y: 0 }, { x: 100, y: 0 });
    const tilted = projectileAimBasis({ x: 0, y: 0 }, { x: 100, y: 0 }, 30);

    expect(straight.angle).toBeCloseTo(0, 4);
    expect(straight.dir).toEqual({ x: 1, y: 0 });
    expect(straight.normal).toEqual({ x: 0, y: 1 });
    expect(tilted.angle).toBeCloseTo(Math.PI / 6, 4);
    expect(tilted.dir.x).toBeCloseTo(Math.cos(Math.PI / 6), 4);
    expect(tilted.dir.y).toBeCloseTo(Math.sin(Math.PI / 6), 4);
    expect(tilted.normal.x).toBeCloseTo(-Math.sin(Math.PI / 6), 4);
    expect(tilted.normal.y).toBeCloseTo(Math.cos(Math.PI / 6), 4);
  });

  it('decays particles before impact instead of leaving a full-path cloud', () => {
    const plan = createFastProjectilePlan(520);

    expect(projectileParticleAlpha(0, plan)).toBe(1);
    expect(projectileParticleAlpha(plan.trailFadeMs / 2, plan)).toBeGreaterThan(0.2);
    expect(projectileParticleAlpha(plan.trailFadeMs + 1, plan)).toBe(0);
  });

  it('anchors hit effects at the exact target card center', () => {
    const point = centerPointInHost(
      { left: 640, top: 210, width: 160, height: 220 },
      { left: 200, top: 90 }
    );

    expect(point).toEqual({ x: 520, y: 230 });
  });

  it('keeps combat hit effects on the full target card center even when an art hitbox is present', () => {
    const point = targetHitPointInHost(
      { left: 640, top: 210, width: 160, height: 220 },
      { left: 200, top: 90 },
      { left: 650, top: 220, width: 140, height: 120 }
    );

    expect(point).toEqual({ x: 520, y: 230 });
  });

  it('maps DOM card centers into the Pixi renderer coordinate space', () => {
    const point = targetHitPointInHost(
      { left: 900, top: 330, width: 160, height: 220 },
      { left: 100, top: 80, width: 1200, height: 800 },
      null,
      { width: 900, height: 600 }
    );

    expect(point).toEqual({ x: 660, y: 270 });
  });

  it('uses centered impact texture anchors so hits stay on the target center', () => {
    const profile = createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect: 'fire' });

    expect(profile.impactAnchor).toEqual({ x: 0.5, y: 0.5 });
    expect(profile.impactRingAnchor).toEqual({ x: 0.5, y: 0.5 });
  });

  it('selects distinct projectile profiles from battle event semantics', () => {
    const fire = createProjectileVfxProfile({ attackType: 'fire', skillName: 'Ember Lance' });
    const frost = createProjectileVfxProfile({ attackType: 'frost', skillName: 'Frozen Spear' });
    const voidBolt = createProjectileVfxProfile({ attackType: 'dark', skillName: 'Soul Siphon' });
    const steel = createProjectileVfxProfile({ actionType: 'attack', attackType: 'slash' });

    expect(new Set([fire.id, frost.id, voidBolt.id, steel.id]).size).toBe(4);
    expect(new Set([fire.beamSequenceKey, frost.beamSequenceKey, voidBolt.beamSequenceKey, steel.beamSequenceKey]).size).toBe(4);
    expect(new Set([fire.impactTextureKey, frost.impactTextureKey, voidBolt.impactTextureKey, steel.impactTextureKey]).size).toBe(4);
    expect(frost.textureMix).not.toEqual(fire.textureMix);
    expect(voidBolt.textureMix).not.toEqual(fire.textureMix);
    expect(steel.coreWidth).toBeLessThan(fire.coreWidth);
  });

  it('prioritizes explicit visual type fields over legacy attack type when selecting resources', () => {
    const frostProjectile = createProjectileVfxProfile({
      actionType: 'skill',
      attackType: 'fire',
      typeCatalog: 'proj',
      typeEffect: 'frost',
    });
    const clawInstant = createProjectileVfxProfile({
      actionType: 'skill',
      attackType: 'fire',
      typeCatalog: 'instant',
      typeEffect: 'claw',
    });

    expect(frostProjectile.id).toBe('frost');
    expect(frostProjectile.beamSequenceKey).toBe('projectileFrost');
    expect(clawInstant.id).toBe('blood');
    expect(clawInstant.instantTextureKey).toBe('instantBlood');
  });

  it('plans buff VFX as card-border decoration using canonical buff names', () => {
    const expected = {
      stun: 'buffBorderStorm',
      frozen: 'buffBorderFrost',
      poison: 'buffBorderNature',
      wound: 'buffBorderBlood',
      curse: 'buffBorderCurse',
      bless: 'buffBorderHoly',
      heal: 'buffBorderHoly',
      haste: 'buffBorderStorm',
      pray: 'buffBorderHoly',
      weakness: 'buffBorderCurse',
      vulnerable: 'buffBorderCurse',
    } as const;

    for (const [buffName, borderTextureKey] of Object.entries(expected)) {
      const plan = createBuffBorderVfxPlan({
        actionType: 'skill',
        skillRole: 'buff',
        buffName,
        buffTypeEffect: 'fire',
      });

      expect(plan.placement).toBe('card-border');
      expect(plan.borderTextureKey).toBe(borderTextureKey);
      expect(plan.particleTextureMix.length).toBeGreaterThanOrEqual(3);
      expect(plan.edgeParticleCount).toBeGreaterThanOrEqual(18);
    }
  });

  it('keeps styled projectile profiles fast while varying silhouette and impact weight', () => {
    const fire = createFastProjectilePlan(520, createProjectileVfxProfile({ attackType: 'fire' }));
    const frost = createFastProjectilePlan(520, createProjectileVfxProfile({ attackType: 'frost' }));
    const steel = createFastProjectilePlan(520, createProjectileVfxProfile({ actionType: 'attack', attackType: 'slash' }));

    for (const plan of [fire, frost, steel]) {
      expect(plan.flightDurationMs).toBeGreaterThanOrEqual(190);
      expect(plan.flightDurationMs).toBeLessThanOrEqual(255);
      expect(plan.trailFraction).toBeLessThanOrEqual(0.18);
      expect(plan.trailFadeMs).toBeLessThanOrEqual(180);
    }
    expect(fire.particleCount).toBeGreaterThan(steel.particleCount);
    expect(frost.impactRadius).not.toBe(fire.impactRadius);
    expect(steel.trailFraction).toBeLessThan(fire.trailFraction);
  });

  it('maps every canonical attack type into a projectile visual profile', () => {
    const canonicalTypes = ['flesh', 'magic', 'thunder', 'weapon', 'gun', 'fire', 'poison', 'frost', 'dark', 'light', 'nature', 'water'];
    const ids = canonicalTypes.map((attackType) => createProjectileVfxProfile({ attackType }).id);

    expect(ids).toEqual([
      'blood',
      'magic',
      'storm',
      'steel',
      'bullet',
      'fire',
      'nature',
      'frost',
      'void',
      'holy',
      'nature',
      'water',
    ]);
  });

  it('uses blood magic resources and a heavier organic silhouette for flesh projectiles', () => {
    const flesh = createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect: 'blood' });
    const weapon = createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect: 'arrow' });
    const gun = createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect: 'bullet' });

    expect(flesh.id).toBe('blood');
    expect(flesh.beamSequenceKey).toBe('projectileBlood');
    expect(flesh.impactTextureKey).toBe('impactBlood');
    expect(flesh.instantTextureKey).toBe('instantBlood');
    expect(flesh.coreWidth).toBeGreaterThan(weapon.coreWidth);
    expect(flesh.scatter).toBeGreaterThan(weapon.scatter);
    expect(flesh.tailSmokeWidth).toBeGreaterThan(weapon.tailSmokeWidth);
    expect(gun.id).toBe('bullet');
    expect(gun.coreWidth).toBeLessThan(weapon.coreWidth);
    expect(gun.trailFraction).toBeLessThan(weapon.trailFraction);
  });

  it('varies projectile silhouettes by type beyond family color', () => {
    const effects = ['blood', 'fire', 'frost', 'holy', 'magic', 'nature', 'arrow', 'lighting', 'void', 'water', 'bullet', 'rock'];
    const signatures = effects.map((typeEffect) => {
      const profile = createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect });
      return [
        profile.id,
        profile.beamSequenceKey,
        profile.coreWidth,
        profile.bloomWidth,
        profile.beamThicknessScale,
        profile.trailFraction,
        profile.scatter,
        profile.tailSmokeWidth,
        profile.emitterRate,
        profile.filamentCount,
        profile.shardCount,
      ].join(':');
    });

    expect(new Set(signatures).size).toBeGreaterThanOrEqual(9);
  });

  it('uses beam silhouettes instead of arrowhead projectile geometry', () => {
    const projectileTypes = ['fire', 'frost', 'dark', 'weapon', 'magic', 'thunder', 'nature', 'water'];
    const profiles = projectileTypes.map((attackType) => createProjectileVfxProfile({ attackType }));

    for (const profile of profiles) {
      expect(profile.headShape).toBe('beam');
      expect(profile.beamSequenceKey).toMatch(/^projectile[A-Z]/);
      expect(profile.beamThicknessScale).toBeLessThanOrEqual(0.82);
      expect(profile.vectorTrailAlpha).toBe(0);
      expect(profile.vectorHeadAlpha).toBe(0);
      expect(profile.arcBend).toBe(0);
      expect(profile.beamTrailFraction).toBeGreaterThanOrEqual(0.82);
      expect(profile.filamentCount).toBeGreaterThanOrEqual(3);
      expect(profile.headGlowRadius).toBeGreaterThan(profile.coreWidth);
    }
  });

  it('uses family-specific projectile sequence frames for authored projectile spritesheets', () => {
    const fire = createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect: 'fire' });
    const frost = createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect: 'frost' });
    const light = createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect: 'holy' });
    const blood = createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect: 'blood' });
    const defaultGold = createProjectileVfxProfile();

    expect(fire.beamSequenceKey).toBe('projectileFire');
    expect(fire.beamSequenceMode).toBe('fixed-frame');
    expect(fire.beamSequenceScale).toBeGreaterThanOrEqual(0.4);
    expect(fire.beamSequenceScale).toBeLessThanOrEqual(0.54);
    expect(fire.beamSequenceBloomScale).toBeLessThanOrEqual(0.62);
    expect(fire.beamSequenceFrameRange).toEqual([1, 3]);
    expect(fire.impactDirectionalCut ?? true).toBe(true);
    expect(fire.impactFlashTexture ?? true).toBe(true);
    expect(frost.beamSequenceKey).toBe('projectileFrost');
    expect(frost.beamSequenceScale).toBeLessThanOrEqual(0.52);
    expect(frost.beamSequenceBloomScale).toBeLessThanOrEqual(0.6);
    expect(frost.beamSequenceFrameRange).toEqual([2, 10]);
    expect(light.beamSequenceKey).toBe('projectileHoly');
    expect(light.beamSequenceScale).toBeLessThanOrEqual(0.52);
    expect(light.beamSequenceBloomScale).toBeLessThanOrEqual(0.6);
    expect(light.beamSequenceBloomAlpha).toBe(0);
    expect(light.beamSequenceFrameRange).toEqual([2, 9]);
    expect(light.impactDirectionalCut).toBe(false);
    expect(light.impactFlashTexture).toBe(false);
    expect(blood.beamSequenceKey).toBe('projectileBlood');
    expect(blood.beamSequenceScale).toBeLessThanOrEqual(0.53);
    expect(blood.beamSequenceBloomScale).toBeLessThanOrEqual(0.61);
    expect(blood.beamSequenceBloomAlpha).toBe(0);
    expect(blood.beamSequenceFrameRange).toEqual([2, 10]);
    expect(defaultGold.beamSequenceKey).toBe('projectileBeam');
    expect(defaultGold.beamSequenceMode).toBe('fixed-frame');
    expect(defaultGold.beamSequenceFrameRange).toEqual([2, 15]);
    expect(createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect: 'bullet' }).beamSequenceKey).toBe('projectileBullet');
  });

  it('keeps projectile smoke tails narrow and drives motion with live emitter particles', () => {
    const projectileTypes = ['fire', 'frost', 'dark', 'weapon', 'magic', 'thunder', 'nature', 'water'];
    const profiles = projectileTypes.map((attackType) => createProjectileVfxProfile({ attackType }));

    for (const profile of profiles) {
      const plan = createFastProjectilePlan(520, profile);

      expect(profile.beamThicknessScale).toBeLessThanOrEqual(0.62);
      expect(profile.tailSmokeWidth).toBeLessThanOrEqual(10);
      expect(profile.tailSmokeScale).toBeLessThanOrEqual(0.13);
      expect(profile.emitterRate).toBeGreaterThanOrEqual(3);
      expect(profile.emitterJitter).toBeGreaterThan(0);
      expect(plan.emitterParticleCount).toBeGreaterThanOrEqual(plan.particleCount);
    }
  });

  it('uses family-colored impact textures anchored on the visual blast center', () => {
    const profiles = [
      createProjectileVfxProfile({ attackType: 'fire' }),
      createProjectileVfxProfile({ attackType: 'frost' }),
      createProjectileVfxProfile({ attackType: 'dark' }),
      createProjectileVfxProfile({ attackType: 'nature' }),
      createProjectileVfxProfile({ attackType: 'water' }),
      createProjectileVfxProfile({ attackType: 'thunder' }),
    ];

    expect(profiles.map((profile) => profile.impactTextureKey)).toEqual([
      'impactFire',
      'impactFrost',
      'impactVoid',
      'impactNature',
      'impactWater',
      'impactStorm',
    ]);

    for (const profile of profiles) {
      expect(profile.impactAnchor).toEqual({ x: 0.5, y: 0.5 });
      expect(profile.impactRingAnchor).toEqual({ x: 0.5, y: 0.5 });
    }
  });

  it('uses dedicated family instant textures instead of generic vector-only slashes', () => {
    const profiles = [
      createProjectileVfxProfile({ attackType: 'fire' }),
      createProjectileVfxProfile({ attackType: 'frost' }),
      createProjectileVfxProfile({ attackType: 'dark' }),
      createProjectileVfxProfile({ attackType: 'nature' }),
      createProjectileVfxProfile({ attackType: 'water' }),
      createProjectileVfxProfile({ attackType: 'thunder' }),
    ];

    expect(profiles.map((profile) => profile.instantTextureKey)).toEqual([
      'instantFire',
      'instantFrost',
      'instantVoid',
      'instantNature',
      'instantWater',
      'instantStorm',
    ]);

    for (const profile of profiles) {
      expect(profile.instantAnchor).toEqual({ x: 0.5, y: 0.5 });
      expect(profile.instantScale).toBeGreaterThan(0.58);
      expect(profile.instantScale).toBeLessThan(0.92);
      expect(profile.instantClarityScale).toBeGreaterThanOrEqual(1.1);
      expect(profile.instantParticleCount).toBeGreaterThanOrEqual(24);
      expect(profile.buffGlyphScale).toBeGreaterThanOrEqual(0.72);
      expect(profile.impactFlashScale).toBeGreaterThanOrEqual(0.72);
    }
  });
});
