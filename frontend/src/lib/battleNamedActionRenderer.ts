import { gsap } from 'gsap';
import { BlurFilter, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { BattleActionVfxDefinition, BattleActionVfxTimingPreset } from './battleActionVfxCatalog';
import type { BattleEvent } from './battleTypes';

export type NamedActionPoint = { x: number; y: number };
export type NamedActionAdd = <T extends Container | Graphics | Text | Sprite>(node: T, zIndex?: number) => T;
export type NamedActionTextures = Record<string, Texture>;

type RenderNamedActionVfxOptions = {
  add: NamedActionAdd;
  tweens: gsap.core.Tween[];
  start: NamedActionPoint;
  end: NamedActionPoint;
  event: BattleEvent;
  action: BattleActionVfxDefinition;
  textures: NamedActionTextures;
};

type Timing = {
  anticipation: number;
  action: number;
  impact: number;
  plateScale: number;
  impactScale: number;
};

const TIMINGS: Record<BattleActionVfxTimingPreset, Timing> = {
  'melee-snap': { anticipation: 0.08, action: 0.12, impact: 0.3, plateScale: 0.21, impactScale: 0.21 },
  'melee-heavy': { anticipation: 0.15, action: 0.15, impact: 0.5, plateScale: 0.28, impactScale: 0.28 },
  'projectile-precise': { anticipation: 0.13, action: 0.4, impact: 0.32, plateScale: 0.17, impactScale: 0.16 },
  'projectile-heavy': { anticipation: 0.18, action: 0.5, impact: 0.52, plateScale: 0.18, impactScale: 0.23 },
  'projectile-rapid': { anticipation: 0.06, action: 0.3, impact: 0.25, plateScale: 0.18, impactScale: 0.14 },
  'impact-critical': { anticipation: 0.1, action: 0.1, impact: 0.48, plateScale: 0.25, impactScale: 0.25 },
  'control-snap': { anticipation: 0.12, action: 0.12, impact: 0.56, plateScale: 0.27, impactScale: 0.27 },
  'control-bloom': { anticipation: 0.16, action: 0.16, impact: 0.68, plateScale: 0.27, impactScale: 0.27 },
  'support-bloom': { anticipation: 0.2, action: 0.18, impact: 0.78, plateScale: 0.28, impactScale: 0.28 },
};

function pointBetween(start: NamedActionPoint, end: NamedActionPoint, progress: number) {
  return { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress };
}

function renderAnticipation(add: NamedActionAdd, tweens: gsap.core.Tween[], point: NamedActionPoint, duration: number, supportive: boolean) {
  const ring = add(new Graphics(), 8);
  const color = supportive ? 0xbfffe8 : 0xe3c589;
  ring.blendMode = 'add';
  ring.circle(point.x, point.y, 14).stroke({ color, width: 1.5, alpha: 0.72 });
  ring.circle(point.x, point.y, 24).stroke({ color, width: 0.75, alpha: 0.3 });
  const state = { alpha: 0.85, scale: 0.62 };
  tweens.push(gsap.to(state, {
    alpha: 0,
    scale: supportive ? 1.85 : 1.45,
    duration,
    ease: 'expo.out',
    onUpdate: () => { ring.alpha = state.alpha; ring.scale.set(state.scale); },
    onComplete: () => ring.destroy(),
  }));
}

function renderImpactPlate({
  add, tweens, point, texture, scale, duration, delay = 0, rotation = 0, supportive = false,
}: {
  add: NamedActionAdd;
  tweens: gsap.core.Tween[];
  point: NamedActionPoint;
  texture: Texture;
  scale: number;
  duration: number;
  delay?: number;
  rotation?: number;
  supportive?: boolean;
}) {
  const bloom = add(new Sprite(texture), 10);
  const plate = add(new Sprite(texture), 11);
  const state = { alpha: 0, scale: scale * 0.42, rotation: rotation - 0.045, y: point.y + (supportive ? 20 : 0) };
  for (const sprite of [bloom, plate]) {
    sprite.anchor.set(0.5);
    sprite.blendMode = 'add';
    sprite.position.set(point.x, state.y);
    sprite.alpha = 0;
    sprite.rotation = state.rotation;
    sprite.scale.set(state.scale);
  }
  bloom.filters = [new BlurFilter({ strength: supportive ? 5 : 7 })];

  tweens.push(gsap.to(state, {
    alpha: 1,
    scale,
    rotation,
    y: point.y,
    duration: duration * 0.38,
    delay,
    ease: 'expo.out',
    onUpdate: () => {
      plate.alpha = state.alpha;
      plate.scale.set(state.scale);
      plate.rotation = state.rotation;
      plate.y = state.y;
      bloom.alpha = state.alpha * (supportive ? 0.2 : 0.32);
      bloom.scale.set(state.scale * 1.08);
      bloom.rotation = state.rotation;
      bloom.y = state.y;
    },
  }));
  tweens.push(gsap.to(state, {
    alpha: 0,
    scale: scale * (supportive ? 1.08 : 1.16),
    y: point.y - (supportive ? 12 : 0),
    duration: duration * 0.62,
    delay: delay + duration * 0.38,
    ease: 'power3.in',
    onUpdate: () => {
      plate.alpha = state.alpha;
      plate.scale.set(state.scale);
      plate.y = state.y;
      bloom.alpha = state.alpha * 0.26;
      bloom.scale.set(state.scale * 1.1);
      bloom.y = state.y;
    },
    onComplete: () => { plate.destroy(); bloom.destroy(); },
  }));
}

function renderProjectile(options: RenderNamedActionVfxOptions, texture: Texture, impactTexture: Texture, timing: Timing) {
  const { add, tweens, start, end } = options;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const bloom = add(new Sprite(texture), 10);
  const projectile = add(new Sprite(texture), 11);
  const state = { progress: 0, alpha: 0, scale: timing.plateScale * 0.68 };
  for (const sprite of [bloom, projectile]) {
    sprite.anchor.set(0.82, 0.5);
    sprite.blendMode = 'add';
    sprite.position.set(start.x, start.y);
    sprite.rotation = angle;
    sprite.alpha = 0;
    sprite.scale.set(state.scale);
  }
  bloom.filters = [new BlurFilter({ strength: 7 })];
  tweens.push(gsap.to(state, {
    progress: 1,
    alpha: 1,
    scale: timing.plateScale,
    duration: timing.action,
    delay: timing.anticipation * 0.5,
    ease: options.action.timingPreset === 'projectile-heavy' ? 'power2.in' : 'power1.inOut',
    onUpdate: () => {
      const point = pointBetween(start, end, state.progress);
      projectile.position.set(point.x, point.y);
      bloom.position.set(point.x, point.y);
      projectile.alpha = Math.min(1, state.alpha * 1.2);
      bloom.alpha = state.alpha * 0.3;
      projectile.scale.set(state.scale);
      bloom.scale.set(state.scale * 1.08);
    },
    onComplete: () => {
      projectile.destroy();
      bloom.destroy();
      renderImpactPlate({ add, tweens, point: end, texture: impactTexture, scale: timing.impactScale, duration: timing.impact, rotation: angle + Math.PI / 2 });
    },
  }));
}

export function renderNamedActionVfx(options: RenderNamedActionVfxOptions) {
  const { action, add, tweens, start, end, textures } = options;
  const texture = textures[action.assetId];
  if (!texture) return;
  const timing = TIMINGS[action.timingPreset];
  const supportive = action.treatment === 'heal-plate' || action.treatment === 'buff-plate';
  renderAnticipation(add, tweens, supportive ? end : start, timing.anticipation, supportive);

  if (action.treatment === 'projectile-plate') {
    const impactTexture = textures[action.impactAssetId ?? action.assetId] ?? texture;
    renderProjectile(options, texture, impactTexture, timing);
    return;
  }

  renderImpactPlate({
    add,
    tweens,
    point: end,
    texture,
    scale: timing.impactScale,
    duration: timing.impact,
    delay: timing.anticipation * 0.35,
    supportive,
    rotation: action.id === 'witchflame-cut' ? 0.04 : action.id === 'basic-attack' ? -0.08 : 0,
  });
}
