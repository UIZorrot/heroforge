import { describe, expect, it } from 'vitest';
import { canonicalBattleInstantTypeEffects } from './battleVfxCatalog';
import {
  centerPointInHost,
  createFastProjectilePlan,
  createImpactVfxPlan,
  createBuffBorderVfxPlan,
  createProjectileVfxProfile,
  instantHitSequenceKeyForEvent,
  PROJECTILE_BODY_LENGTH_SCALE,
  targetHitPointInHost,
  projectileBodyEnvelope,
  projectileBodyRenderScale,
  projectileFlightFrameIndex,
  projectileHeadProgress,
  projectilePathSample,
  projectileTrailBodyJunction,
  projectileTrailSegments,
  projectileTrailWindow,
  projectileParticleAlpha,
  projectileAimBasis,
  sourceCastPointInHost,
} from './battleVfxParticlePlan';

describe('battle VFX particle plan', () => {
  it('keeps projectile timing fast and gives the trail a bounded visible length', () => {
    const plan = createFastProjectilePlan(520);

    expect(plan.flightDurationMs).toBeGreaterThanOrEqual(175);
    expect(plan.flightDurationMs).toBeLessThanOrEqual(235);
    expect(plan.trailFraction).toBeGreaterThanOrEqual(0.36);
    expect(plan.trailFraction).toBeLessThanOrEqual(0.68);
    expect(plan.trailFadeMs).toBeLessThanOrEqual(180);
    expect(plan.launchDelayMs).toBeGreaterThanOrEqual(30);
    expect(plan.launchDelayMs).toBeLessThanOrEqual(84);
    expect(plan.impactDelayMs).toBe(plan.launchDelayMs + plan.flightDurationMs);
  });

  it('only draws a short trail window immediately behind the projectile head', () => {
    const plan = createFastProjectilePlan(520);
    const window = projectileTrailWindow(0.72, plan);

    expect(window.endT).toBeCloseTo(0.72, 4);
    expect(window.startT).toBeGreaterThan(0.25);
    expect(window.endT - window.startT).toBeLessThanOrEqual(0.68);
  });

  it('ends the luminous trail behind the projectile body instead of drawing a second head', () => {
    const plan = createFastProjectilePlan(520);
    const window = projectileTrailWindow(0.72, plan);
    const junction = projectileTrailBodyJunction(0.72, plan);

    expect(junction).toBeGreaterThanOrEqual(window.startT);
    expect(junction).toBeLessThan(window.endT);
    expect(window.endT - junction).toBeCloseTo(plan.bodyFootprintFraction * 0.72, 6);
  });

  it('builds a smooth tapered trail that grows brighter toward the projectile body', () => {
    const plan = createFastProjectilePlan(520);
    const segments = projectileTrailSegments(0.72, plan, 8);

    expect(segments).toHaveLength(8);
    expect(segments[0]?.startT).toBeLessThan(segments[7]?.endT ?? 0);
    expect(segments[0]?.strength).toBeLessThan(segments[3]?.strength ?? 0);
    expect(segments[3]?.strength).toBeLessThan(segments[7]?.strength ?? 0);
    expect(segments[7]?.strength).toBe(1);
  });

  it('accelerates the projectile into impact instead of slowing near the target', () => {
    expect(projectileHeadProgress(0)).toBe(0);
    expect(projectileHeadProgress(0.5)).toBeLessThan(0.5);
    expect(projectileHeadProgress(0.85)).toBeLessThan(0.98);
    expect(projectileHeadProgress(1)).toBe(1);
  });

  it('keeps a subtle authored length ratio without distance-based stretching', () => {
    const start = projectileBodyEnvelope(0);
    const early = projectileBodyEnvelope(0.08);
    const settled = projectileBodyEnvelope(0.2);
    const startRenderScale = projectileBodyRenderScale(start.scale);
    const settledRenderScale = projectileBodyRenderScale(settled.scale, 1, 0.08);

    expect(start).toEqual({ scale: 0.72, alpha: 0.32 });
    expect(early.scale).toBeGreaterThan(start.scale);
    expect(early.alpha).toBeGreaterThan(start.alpha);
    expect(settled).toEqual({ scale: 1, alpha: 1 });
    expect(Object.keys(settled)).not.toContain('scaleX');
    expect(Object.keys(settled)).not.toContain('scaleY');
    expect(startRenderScale.x / startRenderScale.y).toBeCloseTo(PROJECTILE_BODY_LENGTH_SCALE, 6);
    expect(settledRenderScale.x / settledRenderScale.y).toBeCloseTo(PROJECTILE_BODY_LENGTH_SCALE, 6);
  });

  it('uses only sustained flight frames and excludes dissolve frames at impact', () => {
    expect(projectileFlightFrameIndex(0)).toBe(4);
    expect(projectileFlightFrameIndex(0.5)).toBe(8);
    expect(projectileFlightFrameIndex(1)).toBe(11);
    expect(projectileFlightFrameIndex(1, [0, 15])).toBe(11);
  });

  it('curves authored projectiles while preserving exact source and target contact points', () => {
    const start = { x: 10, y: 20 };
    const end = { x: 410, y: 220 };
    const launch = projectilePathSample(start, end, 0, 0.06, 4, 1.5);
    const middle = projectilePathSample(start, end, 0.5, 0.06, 4, 1.5);
    const impact = projectilePathSample(start, end, 1, 0.06, 4, 1.5);

    expect(launch.point).toEqual(start);
    expect(impact.point.x).toBeCloseTo(end.x, 6);
    expect(impact.point.y).toBeCloseTo(end.y, 6);
    expect(middle.point.y).not.toBeCloseTo(120, 2);
    expect(middle.depthEnvelope).toBeCloseTo(1, 6);
    expect(launch.angle).not.toBe(impact.angle);
  });

  it('keeps arrow, bullet, and rock projectiles on an exact straight path', () => {
    const start = { x: 40, y: 120 };
    const end = { x: 440, y: 220 };

    for (const typeEffect of ['arrow', 'bullet', 'rock']) {
      const profile = createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect });
      const middle = projectilePathSample(start, end, 0.5, profile.arcBend, profile.pathWobble, profile.pathWaves);

      expect(profile.arcBend).toBe(0);
      expect(profile.pathWobble).toBe(0);
      expect(middle.point).toEqual({ x: 240, y: 170 });
    }
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

  it('anchors combat hit effects to the full target card center', () => {
    const point = targetHitPointInHost(
      { left: 640, top: 210, width: 160, height: 220 },
      { left: 200, top: 90 }
    );

    expect(point).toEqual({ x: 520, y: 230 });
  });

  it('anchors instant caster effects to the full source card center', () => {
    const point = sourceCastPointInHost(
      { left: 240, top: 210, width: 160, height: 220 },
      { left: 200, top: 90 }
    );

    expect(point).toEqual({ x: 120, y: 230 });
  });

  it('maps DOM card centers into the Pixi renderer coordinate space', () => {
    const point = targetHitPointInHost(
      { left: 900, top: 330, width: 160, height: 220 },
      { left: 100, top: 80, width: 1200, height: 800 },
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
    const steel = createProjectileVfxProfile({ actionType: 'attack', attackType: 'strike' });

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
    const buffNames = ['stun', 'frozen', 'poison', 'wound', 'burn', 'curse', 'heal', 'pray'] as const;

    for (const buffName of buffNames) {
      const plan = createBuffBorderVfxPlan({
        actionType: 'skill',
        skillRole: 'buff',
        buffName,
        buffTypeEffect: 'fire',
      });

      expect(plan.placement).toBe('card-border');
      expect(plan.particleTextureMix.length).toBeGreaterThanOrEqual(3);
      expect(plan.edgeParticleCount).toBeGreaterThanOrEqual(18);
    }
  });

  it('keeps styled projectile profiles fast while varying silhouette and impact weight', () => {
    const fire = createFastProjectilePlan(520, createProjectileVfxProfile({ attackType: 'fire' }));
    const frost = createFastProjectilePlan(520, createProjectileVfxProfile({ attackType: 'frost' }));
    const steel = createFastProjectilePlan(520, createProjectileVfxProfile({ actionType: 'attack', attackType: 'strike' }));

    for (const plan of [fire, frost, steel]) {
      expect(plan.flightDurationMs).toBeGreaterThanOrEqual(175);
      expect(plan.flightDurationMs).toBeLessThanOrEqual(235);
      expect(plan.trailFraction).toBeLessThanOrEqual(0.68);
      expect(plan.trailFadeMs).toBeLessThanOrEqual(180);
    }
    expect(fire.particleCount).toBeGreaterThan(steel.particleCount);
    expect(steel.trailFraction).toBeLessThan(fire.trailFraction);
  });

  it('plans impact independently from projectile distance, path, and body scaling', () => {
    const event = { typeCatalog: 'proj', typeEffect: 'fire', isCrit: false };
    const nearProjectile = createFastProjectilePlan(220, createProjectileVfxProfile(event));
    const farProjectile = createFastProjectilePlan(720, createProjectileVfxProfile(event));
    const impact = createImpactVfxPlan(event);

    expect(impact.radius).toBe(createImpactVfxPlan({ ...event }).radius);
    expect(impact.textureKey).toBe('impactFire');
    expect(impact.textureAnchor).toEqual({ x: 0.5, y: 0.5 });
    expect(impact.ringAnchor).toEqual({ x: 0.5, y: 0.5 });
    expect(nearProjectile).not.toHaveProperty('impactRadius');
    expect(farProjectile).not.toHaveProperty('impactRadius');
    expect(impact).not.toHaveProperty('angle');
    expect(impact).not.toHaveProperty('scaleX');
    expect(impact).not.toHaveProperty('scaleY');
  });

  it('lets critical hits increase impact weight without changing the impact asset or anchors', () => {
    const normal = createImpactVfxPlan({ typeCatalog: 'proj', typeEffect: 'frost', isCrit: false });
    const critical = createImpactVfxPlan({ typeCatalog: 'proj', typeEffect: 'frost', isCrit: true });

    expect(critical.radius).toBeGreaterThan(normal.radius);
    expect(critical.particleCount).toBeGreaterThan(normal.particleCount);
    expect(critical.textureKey).toBe(normal.textureKey);
    expect(critical.textureAnchor).toEqual(normal.textureAnchor);
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

  it('keeps every canonical projectile at a fixed, distance-independent body size', () => {
    const effects = ['blood', 'fire', 'frost', 'holy', 'magic', 'nature', 'arrow', 'lighting', 'void', 'water', 'bullet', 'rock'];
    const profiles = effects.map((typeEffect) => createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect }));

    for (const profile of profiles) {
      expect(profile.beamSequenceScale).toBeGreaterThanOrEqual(0.3);
      expect(profile.beamSequenceScale).toBeLessThanOrEqual(0.44);
      expect(profile.beamSequenceFrameRange?.[0]).toBeGreaterThanOrEqual(4);
      expect(profile.beamSequenceFrameRange?.[1]).toBeLessThanOrEqual(11);
      expect(profile.impactStyle).toBeTruthy();
    }

    expect(new Set(profiles.map((profile) => profile.impactStyle)).size).toBe(7);
    expect(createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect: 'lighting' }).impactStyle).toBe('shock');
    expect(createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect: 'bullet' }).impactStyle).toBe('pierce');
    expect(createProjectileVfxProfile({ typeCatalog: 'proj', typeEffect: 'rock' }).impactStyle).toBe('crush');
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
    expect(fire.beamSequenceScale).toBeGreaterThanOrEqual(0.3);
    expect(fire.beamSequenceScale).toBeLessThanOrEqual(0.44);
    expect(fire.beamSequenceFrameRange).toEqual([4, 11]);
    expect(fire.impactDirectionalCut ?? true).toBe(true);
    expect(fire.impactFlashTexture ?? true).toBe(true);
    expect(frost.beamSequenceKey).toBe('projectileFrost');
    expect(frost.beamSequenceScale).toBeLessThanOrEqual(0.44);
    expect(frost.beamSequenceFrameRange).toEqual([4, 11]);
    expect(light.beamSequenceKey).toBe('projectileHoly');
    expect(light.beamSequenceScale).toBeLessThanOrEqual(0.44);
    expect(light.beamSequenceFrameRange).toEqual([4, 11]);
    expect(light.impactDirectionalCut).toBe(false);
    expect(light.impactFlashTexture).toBe(false);
    expect(blood.beamSequenceKey).toBe('projectileBlood');
    expect(blood.beamSequenceScale).toBeLessThanOrEqual(0.44);
    expect(blood.beamSequenceFrameRange).toEqual([4, 11]);
    expect(defaultGold.beamSequenceKey).toBe('projectileBeam');
    expect(defaultGold.beamSequenceFrameRange).toEqual([4, 11]);
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

  it('uses dedicated family instant textures instead of generic vector-only cuts', () => {
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

  it('maps every instant effect to the authored sequence pack', () => {
    const expected = {
      magic: 'magic',
      thunder: 'thunder',
      strike: 'strike',
      explode: 'explode',
      fire: 'fire',
      poison: 'poison',
      frost: 'frost',
      dark: 'dark',
      light: 'light',
      nature: 'nature',
      water: 'water',
      claw: 'claw',
      pierce: 'pierce',
      blunt: 'smash',
      bullet_hit: 'bulletHit',
    } as const;

    expect(Object.keys(expected)).toEqual(canonicalBattleInstantTypeEffects);
    for (const typeEffect of canonicalBattleInstantTypeEffects) {
      expect(instantHitSequenceKeyForEvent({ typeCatalog: 'instant', typeEffect })).toBe(expected[typeEffect]);
    }
  });
});
