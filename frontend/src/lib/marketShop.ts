import type { RelicDefinition } from '../types';

/** Always-available equipment relics (small stock shelf). */
export const STOCK_RELIC_TYPES = [
  'named_echo_heart',
  'named_oath_lantern',
  'named_thorn_votive',
  'named_sable_talisman',
] as const;

/** Weekly specials rotate through this pool. */
export const WEEKLY_SPECIAL_POOL = [
  'limited_eclipse_medal',
  'limited_blood_moon_seal',
  'limited_frozen_cathedral_token',
  'limited_red_comet_fragment',
  'named_ashen_crown',
  'named_storm_choir_bell',
  'named_mirror_of_the_first_duel',
  'named_frostbound_reliquary',
  'named_grave_key_of_auralis',
  'named_sunless_seal',
  'named_harrow_glass',
  'named_lantern_of_the_ninth_bell',
  'named_hollow_choir',
  'named_crownless_scepter',
] as const;

export const WEEKLY_SPECIAL_COUNT = 3;

export function currentIsoWeekKey(date = new Date()): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function weeklySpecialRelicTypes(date = new Date()): string[] {
  const weekKey = currentIsoWeekKey(date);
  const [, weekPart] = weekKey.split('-W');
  const year = Number(weekKey.slice(0, 4));
  const week = Number(weekPart);
  const offset = (year * 53 + week) % WEEKLY_SPECIAL_POOL.length;
  const selected: string[] = [];
  for (let step = 0; step < WEEKLY_SPECIAL_COUNT; step += 1) {
    const relicType = WEEKLY_SPECIAL_POOL[(offset + step) % WEEKLY_SPECIAL_POOL.length];
    if (!selected.includes(relicType) && !STOCK_RELIC_TYPES.includes(relicType as (typeof STOCK_RELIC_TYPES)[number])) {
      selected.push(relicType);
    }
  }
  let cursor = offset + WEEKLY_SPECIAL_COUNT;
  while (selected.length < WEEKLY_SPECIAL_COUNT && cursor < offset + WEEKLY_SPECIAL_POOL.length * 2) {
    const relicType = WEEKLY_SPECIAL_POOL[cursor % WEEKLY_SPECIAL_POOL.length];
    cursor += 1;
    if (!selected.includes(relicType) && !STOCK_RELIC_TYPES.includes(relicType as (typeof STOCK_RELIC_TYPES)[number])) {
      selected.push(relicType);
    }
  }
  return selected;
}

export function resolvePurchaseWindow(
  relic: Pick<RelicDefinition, 'relic_type' | 'kind'>,
  date = new Date(),
): 'open' | 'stock' | 'weekly' | null {
  const kind = relic.kind === 'shard' || relic.relic_type.startsWith('low_') ? 'shard' : 'relic';
  if (kind === 'shard') return 'open';
  if ((STOCK_RELIC_TYPES as readonly string[]).includes(relic.relic_type)) return 'stock';
  if (weeklySpecialRelicTypes(date).includes(relic.relic_type)) return 'weekly';
  return null;
}
