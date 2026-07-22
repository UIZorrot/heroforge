import { resolveBattleVfxDescriptor, type BattleVfxEventInput, type BattleVfxFamily } from './battleVfxCatalog';

/**
 * Element-flavored debris scattered by hits. The authored sheets stay the
 * hero of the effect; debris adds the physical read — embers rising from
 * fire, ice shards flying off frost, droplets falling from water.
 */
export type BattleDebrisMotion = 'rise' | 'scatter' | 'fall' | 'float';

export type BattleDebrisRecipe = {
  /** Particle source: spark textures, smoke textures, or drawn dots. */
  pool: 'sparks' | 'smokes' | 'dots';
  count: number;
  motion: BattleDebrisMotion;
  /** Initial speed range in px/ms. */
  speed: readonly [number, number];
  /** Acceleration in px/ms^2 — positive pulls down, negative lifts up. */
  gravity: number;
  /** Random horizontal acceleration per frame (arc sparks). */
  jitter: number;
  lifeMs: readonly [number, number];
  scale: readonly [number, number];
  alpha: number;
};

const DEFAULT_DEBRIS_RECIPE: BattleDebrisRecipe = {
  pool: 'dots',
  count: 10,
  motion: 'scatter',
  speed: [0.14, 0.32],
  gravity: 0.00012,
  jitter: 0,
  lifeMs: [550, 880],
  scale: [0.7, 1.2],
  alpha: 0.85,
};

export const BATTLE_DEBRIS_RECIPES: Partial<Record<BattleVfxFamily, BattleDebrisRecipe>> = {
  fire: {
    pool: 'sparks', count: 14, motion: 'rise',
    speed: [0.13, 0.3], gravity: -0.00008, jitter: 0.0012,
    lifeMs: [600, 1050], scale: [0.6, 1.1], alpha: 0.92,
  },
  frost: {
    pool: 'dots', count: 12, motion: 'scatter',
    speed: [0.18, 0.42], gravity: 0.00012, jitter: 0,
    lifeMs: [520, 830], scale: [0.6, 1.1], alpha: 0.9,
  },
  frozen: {
    pool: 'dots', count: 12, motion: 'scatter',
    speed: [0.18, 0.42], gravity: 0.00012, jitter: 0,
    lifeMs: [520, 830], scale: [0.6, 1.1], alpha: 0.9,
  },
  water: {
    pool: 'dots', count: 12, motion: 'fall',
    speed: [0.14, 0.32], gravity: 0.0003, jitter: 0,
    lifeMs: [580, 900], scale: [0.7, 1.2], alpha: 0.85,
  },
  nature: {
    pool: 'dots', count: 11, motion: 'fall',
    speed: [0.11, 0.27], gravity: 0.0002, jitter: 0.0006,
    lifeMs: [680, 1050], scale: [0.7, 1.2], alpha: 0.85,
  },
  poison: {
    pool: 'dots', count: 11, motion: 'fall',
    speed: [0.11, 0.27], gravity: 0.00026, jitter: 0,
    lifeMs: [620, 990], scale: [0.7, 1.2], alpha: 0.85,
  },
  light: {
    pool: 'sparks', count: 12, motion: 'float',
    speed: [0.04, 0.12], gravity: -0.00005, jitter: 0.0004,
    lifeMs: [700, 1150], scale: [0.7, 1.3], alpha: 0.9,
  },
  magic: {
    pool: 'sparks', count: 12, motion: 'float',
    speed: [0.04, 0.14], gravity: -0.00004, jitter: 0.001,
    lifeMs: [700, 1150], scale: [0.7, 1.4], alpha: 0.9,
  },
  thunder: {
    pool: 'sparks', count: 14, motion: 'scatter',
    speed: [0.2, 0.45], gravity: 0.00005, jitter: 0.004,
    lifeMs: [420, 700], scale: [0.7, 1.3], alpha: 0.92,
  },
  flesh: {
    pool: 'dots', count: 12, motion: 'fall',
    speed: [0.14, 0.32], gravity: 0.0003, jitter: 0,
    lifeMs: [550, 880], scale: [0.7, 1.2], alpha: 0.88,
  },
  wound: {
    pool: 'dots', count: 12, motion: 'fall',
    speed: [0.14, 0.32], gravity: 0.0003, jitter: 0,
    lifeMs: [550, 880], scale: [0.7, 1.2], alpha: 0.88,
  },
  dark: {
    pool: 'smokes', count: 8, motion: 'rise',
    speed: [0.04, 0.1], gravity: -0.00003, jitter: 0.0004,
    lifeMs: [830, 1250], scale: [0.6, 1.1], alpha: 0.7,
  },
  corrupt: {
    pool: 'smokes', count: 8, motion: 'rise',
    speed: [0.04, 0.1], gravity: -0.00003, jitter: 0.0004,
    lifeMs: [830, 1250], scale: [0.6, 1.1], alpha: 0.7,
  },
  curse: {
    pool: 'smokes', count: 8, motion: 'rise',
    speed: [0.04, 0.1], gravity: -0.00003, jitter: 0.0004,
    lifeMs: [830, 1250], scale: [0.6, 1.1], alpha: 0.7,
  },
  weapon: {
    pool: 'dots', count: 12, motion: 'fall',
    speed: [0.2, 0.45], gravity: 0.00042, jitter: 0,
    lifeMs: [470, 730], scale: [0.6, 1.1], alpha: 0.9,
  },
  gun: {
    pool: 'dots', count: 12, motion: 'fall',
    speed: [0.2, 0.45], gravity: 0.00042, jitter: 0,
    lifeMs: [470, 730], scale: [0.6, 1.1], alpha: 0.9,
  },
  rock: {
    pool: 'dots', count: 13, motion: 'fall',
    speed: [0.18, 0.38], gravity: 0.00048, jitter: 0,
    lifeMs: [500, 780], scale: [0.7, 1.3], alpha: 0.9,
  },
  stun: {
    pool: 'sparks', count: 12, motion: 'scatter',
    speed: [0.18, 0.38], gravity: 0.00008, jitter: 0.002,
    lifeMs: [470, 750], scale: [0.7, 1.3], alpha: 0.9,
  },
  heal: {
    pool: 'sparks', count: 10, motion: 'float',
    speed: [0.04, 0.1], gravity: -0.00005, jitter: 0.0004,
    lifeMs: [730, 1150], scale: [0.7, 1.2], alpha: 0.85,
  },
  pray: {
    pool: 'sparks', count: 10, motion: 'float',
    speed: [0.04, 0.1], gravity: -0.00005, jitter: 0.0004,
    lifeMs: [730, 1150], scale: [0.7, 1.2], alpha: 0.85,
  },
};

export function battleDebrisRecipeForFamily(family?: BattleVfxFamily | null): BattleDebrisRecipe {
  return (family && BATTLE_DEBRIS_RECIPES[family]) || DEFAULT_DEBRIS_RECIPE;
}

export function battleDebrisRecipeForEvent(event: BattleVfxEventInput = {}): BattleDebrisRecipe {
  return battleDebrisRecipeForFamily(resolveBattleVfxDescriptor(event).family);
}

/** Softer, fewer, slower variant used as the lingering tail of an instant hit. */
export function battleDebrisLingerRecipe(recipe: BattleDebrisRecipe): BattleDebrisRecipe {
  return {
    ...recipe,
    count: Math.max(4, Math.round(recipe.count * 0.45)),
    speed: [recipe.speed[0] * 0.5, recipe.speed[1] * 0.5],
    gravity: recipe.gravity * 0.6,
    lifeMs: [recipe.lifeMs[0] + 200, recipe.lifeMs[1] + 300],
    alpha: recipe.alpha * 0.7,
  };
}
