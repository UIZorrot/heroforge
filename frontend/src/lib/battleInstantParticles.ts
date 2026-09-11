import type { BattleVfxInstantTypeEffect } from './battleVfxCatalog';

type Motion = 'cut' | 'fork' | 'burst' | 'rise' | 'spiral' | 'splash';
type Shape = 'streak' | 'shard' | 'dot' | 'bubble' | 'leaf';
type Recipe = { motion: Motion; shape: Shape; count: number; radius: number; life: number; gravity?: number; inward?: boolean };

export const INSTANT_PARTICLES: Record<BattleVfxInstantTypeEffect, Recipe> = {
  strike: { motion: 'cut', shape: 'streak', count: 38, radius: 64, life: 330 },
  claw: { motion: 'cut', shape: 'streak', count: 54, radius: 57, life: 380 },
  pierce: { motion: 'cut', shape: 'streak', count: 28, radius: 76, life: 300 },
  thunder: { motion: 'fork', shape: 'streak', count: 48, radius: 68, life: 360 },
  explode: { motion: 'burst', shape: 'shard', count: 72, radius: 85, life: 540, gravity: 32 },
  fire: { motion: 'rise', shape: 'streak', count: 62, radius: 60, life: 580 },
  poison: { motion: 'rise', shape: 'bubble', count: 36, radius: 42, life: 620 },
  frost: { motion: 'burst', shape: 'shard', count: 46, radius: 60, life: 480, gravity: 16 },
  dark: { motion: 'spiral', shape: 'streak', count: 56, radius: 65, life: 550, inward: true },
  magic: { motion: 'spiral', shape: 'dot', count: 56, radius: 58, life: 520 },
  light: { motion: 'burst', shape: 'streak', count: 42, radius: 76, life: 430 },
  nature: { motion: 'spiral', shape: 'leaf', count: 36, radius: 56, life: 620 },
  water: { motion: 'splash', shape: 'dot', count: 64, radius: 70, life: 580, gravity: 75 },
  blunt: { motion: 'splash', shape: 'shard', count: 40, radius: 55, life: 420, gravity: 56 },
  bullet_hit: { motion: 'burst', shape: 'streak', count: 30, radius: 42, life: 260, gravity: 12 },
};

const noise = (index: number, salt: number) => {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

// Deterministic trajectories keep the VFX lab and battle replay identical.
// All shapes are tiny primitives; no full-card raster sheet is involved.
export function instantParticleSample(effect: BattleVfxInstantTypeEffect, index: number, elapsedMs: number, critical = false) {
  const recipe = INSTANT_PARTICLES[effect];
  const seed = noise(index, 1), variation = noise(index, 2);
  const delay = seed * (recipe.motion === 'cut' ? 65 : 100);
  const life = recipe.life * (.65 + variation * .35);
  const t = Math.max(0, Math.min(1, (elapsedMs - delay) / life));
  const travel = 1 - (1 - t) ** 3;
  const radius = recipe.radius * (.35 + seed * .65) * (critical ? 1.18 : 1);
  let angle = variation * Math.PI * 2;
  let x = Math.cos(angle) * radius * travel;
  let y = Math.sin(angle) * radius * travel;
  if (recipe.motion === 'cut') {
    angle = effect === 'pierce' ? -.12 : -.68;
    const lane = effect === 'claw' ? (index % 3 - 1) * 18 : (variation - .5) * 7;
    const along = (travel * 2 - 1) * radius;
    x = Math.cos(angle) * along - Math.sin(angle) * lane;
    y = Math.sin(angle) * along + Math.cos(angle) * lane;
  } else if (recipe.motion === 'fork') {
    angle = (index % 6) * Math.PI / 3;
    const kink = Math.sin(travel * Math.PI * 5) * 7 * Math.sin(Math.PI * t);
    x = Math.cos(angle) * radius * travel - Math.sin(angle) * kink;
    y = Math.sin(angle) * radius * travel + Math.cos(angle) * kink;
  } else if (recipe.motion === 'rise') {
    x = (variation - .5) * radius + Math.sin(t * 7 + seed * 6) * 7 * t;
    y = 14 - radius * t - 18 * t * t;
  } else if (recipe.motion === 'spiral') {
    angle += travel * (recipe.inward ? -2.4 : 2.4);
    const orbit = radius * (recipe.inward ? 1 - travel : .15 + travel * .85);
    x = Math.cos(angle) * orbit;
    y = Math.sin(angle) * orbit * .7;
  } else if (recipe.motion === 'splash') {
    angle = -Math.PI * (.1 + variation * .8);
    x = Math.cos(angle) * radius * travel;
    y = Math.sin(angle) * radius * travel;
  }
  y += (recipe.gravity ?? 0) * t * t;
  const alpha = elapsedMs < delay || t >= 1 ? 0 : Math.min(1, t * 14) * (1 - t) ** 1.35;
  return { x, y, angle, alpha, size: (.8 + noise(index, 3) * 1.8) * (1 - t * .55), shape: recipe.shape };
}
