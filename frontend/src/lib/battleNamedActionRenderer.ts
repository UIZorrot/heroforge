import { gsap } from 'gsap';
import { BlurFilter, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { BattleActionVfxDefinition } from './battleActionVfxCatalog';
import type { BattleEvent } from './battleTypes';

export type NamedActionPoint = { x: number; y: number };
export type NamedActionAdd = <T extends Container | Graphics | Text | Sprite>(node: T, zIndex?: number) => T;

export type NamedActionTextures = {
  basicAttack: Texture;
  witchflameCut: Texture;
  arcaneCometProjectile: Texture;
  arcaneCometImpact: Texture;
};

type RenderNamedActionVfxOptions = {
  add: NamedActionAdd;
  tweens: gsap.core.Tween[];
  start: NamedActionPoint;
  end: NamedActionPoint;
  event: BattleEvent;
  action: BattleActionVfxDefinition;
  textures: NamedActionTextures;
};

function pointBetween(start: NamedActionPoint, end: NamedActionPoint, progress: number) {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
}

function renderImpactPlate({
  add,
  tweens,
  point,
  texture,
  scale,
  duration,
  rotation,
  delay = 0,
}: {
  add: NamedActionAdd;
  tweens: gsap.core.Tween[];
  point: NamedActionPoint;
  texture: Texture;
  scale: number;
  duration: number;
  rotation: number;
  delay?: number;
}) {
  const bloom = add(new Sprite(texture), 10);
  const plate = add(new Sprite(texture), 11);
  const state = { alpha: 0, scale: scale * 0.48, rotation: rotation - 0.08 };

  for (const sprite of [bloom, plate]) {
    sprite.anchor.set(0.5);
    sprite.blendMode = 'add';
    sprite.x = point.x;
    sprite.y = point.y;
    sprite.alpha = 0;
    sprite.rotation = state.rotation;
    sprite.scale.set(state.scale);
  }
  bloom.filters = [new BlurFilter({ strength: 7 })];

  tweens.push(gsap.to(state, {
    alpha: 1,
    scale,
    rotation,
    duration: duration * 0.42,
    delay,
    ease: 'power4.out',
    onUpdate: () => {
      plate.alpha = state.alpha;
      plate.scale.set(state.scale);
      plate.rotation = state.rotation;
      bloom.alpha = state.alpha * 0.32;
      bloom.scale.set(state.scale * 1.08);
      bloom.rotation = state.rotation;
    },
  }));

  tweens.push(gsap.to(state, {
    alpha: 0,
    scale: scale * 1.14,
    duration: duration * 0.58,
    delay: delay + duration * 0.42,
    ease: 'power3.in',
    onUpdate: () => {
      plate.alpha = state.alpha;
      plate.scale.set(state.scale);
      bloom.alpha = state.alpha * 0.3;
      bloom.scale.set(state.scale * 1.1);
    },
    onComplete: () => {
      plate.destroy();
      bloom.destroy();
    },
  }));
}

function renderArcaneComet(options: RenderNamedActionVfxOptions) {
  const { add, tweens, start, end, textures } = options;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const bloom = add(new Sprite(textures.arcaneCometProjectile), 10);
  const comet = add(new Sprite(textures.arcaneCometProjectile), 11);
  const charge = add(new Graphics(), 8);
  const state = { progress: 0, alpha: 0, scale: 0.105 };
  const chargeState = { alpha: 1, scale: 1 };

  charge.blendMode = 'add';
  charge.circle(start.x, start.y, 12);
  charge.stroke({ color: 0xd8b4fe, width: 2, alpha: 0.75 });
  charge.circle(start.x, start.y, 24);
  charge.stroke({ color: 0x8b5cf6, width: 1, alpha: 0.42 });

  for (const sprite of [bloom, comet]) {
    sprite.anchor.set(0.82, 0.5);
    sprite.blendMode = 'add';
    sprite.x = start.x;
    sprite.y = start.y;
    sprite.rotation = angle;
    sprite.alpha = 0;
    sprite.scale.set(state.scale);
  }
  bloom.filters = [new BlurFilter({ strength: 8 })];

  tweens.push(gsap.to(chargeState, {
    alpha: 0,
    scale: 1.8,
    duration: 0.2,
    ease: 'power3.out',
    onUpdate: () => {
      charge.alpha = chargeState.alpha;
      charge.scale.set(chargeState.scale);
    },
    onComplete: () => charge.destroy(),
  }));

  tweens.push(gsap.to(state, {
    progress: 1,
    alpha: 1,
    scale: 0.17,
    duration: 0.46,
    ease: 'power2.in',
    onUpdate: () => {
      const point = pointBetween(start, end, state.progress);
      comet.x = bloom.x = point.x;
      comet.y = bloom.y = point.y;
      comet.alpha = Math.min(1, state.alpha * 1.2);
      bloom.alpha = state.alpha * 0.34;
      comet.scale.set(state.scale);
      bloom.scale.set(state.scale * 1.1);
    },
    onComplete: () => {
      comet.destroy();
      bloom.destroy();
      renderImpactPlate({
        add,
        tweens,
        point: end,
        texture: textures.arcaneCometImpact,
        scale: 0.3,
        duration: 0.55,
        rotation: angle + Math.PI / 2,
      });
    },
  }));
}

export function renderNamedActionVfx(options: RenderNamedActionVfxOptions) {
  const { action, add, tweens, end, textures } = options;
  if (action.id === 'arcane-comet') {
    renderArcaneComet(options);
    return;
  }

  renderImpactPlate({
    add,
    tweens,
    point: end,
    texture: action.id === 'witchflame-cut' ? textures.witchflameCut : textures.basicAttack,
    scale: action.id === 'witchflame-cut' ? 0.25 : 0.21,
    duration: action.id === 'witchflame-cut' ? 0.48 : 0.3,
    rotation: action.id === 'witchflame-cut' ? 0.04 : -0.08,
  });
}
