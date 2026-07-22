import type { BattleVfxBuffName } from './battleVfxCatalog';

export type BattleBuffKey = BattleVfxBuffName;

// Mirrors backend BUFF_ALIASES: negative statuses merge into curse,
// positive ones into pray; legacy names in old battle logs still resolve.
const BUFF_NAME_ALIASES: Record<string, BattleBuffKey> = {
  stun: 'stun',
  stunned: 'stun',
  daze: 'stun',
  frozen: 'frozen',
  freeze: 'frozen',
  poison: 'poison',
  venom: 'poison',
  wound: 'wound',
  bleed: 'wound',
  burn: 'burn',
  burning: 'burn',
  scorch: 'burn',
  curse: 'curse',
  corrupt: 'curse',
  corruption: 'curse',
  hex: 'curse',
  weakness: 'curse',
  vulnerable: 'curse',
  vulnerability: 'curse',
  heal: 'heal',
  regen: 'heal',
  pray: 'pray',
  prayer: 'pray',
  bless: 'pray',
  blessing: 'pray',
  haste: 'pray',
};

export function battleBuffKeyForName(value?: string | null): BattleBuffKey | undefined {
  const token = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return BUFF_NAME_ALIASES[token];
}

export type BattleBuffPolarity = 'positive' | 'negative';

/**
 * Motion language per buff — readable at battle-card scale:
 * large, slow particle moves inside/around the card rect instead of
 * filigree detail that collapses when scaled down.
 */
export type BattleBuffBehavior =
  | 'snowfall' // frozen: flakes drift down inside the card
  | 'orbitStars' // stun: stars circle above the top edge
  | 'bubbles' // poison: bubbles rise from the bottom and pop
  | 'bloodDrips' // wound: streaks run down from the top edge
  | 'embers' // burn: sparks rise with flicker plus faint smoke
  | 'wisps' // curse: dark smoke wisps rise slowly
  | 'mendGlow' // heal: soft plus-motes rise, warm breathing glow
  | 'radiantMotes'; // pray: light motes rise, halo above the card

export type BattleBuffPalette = { core: number; hot: number; dark: number; text: number };

export type BattleBuffDisplay = {
  key: BattleBuffKey;
  label: string;
  polarity: BattleBuffPolarity;
  /** Control buffs take over the whole card (unit cannot act). */
  control: boolean;
  palette: BattleBuffPalette;
  behavior: BattleBuffBehavior;
  /** CSS grade overlay applied to the card DOM (replaces the old coarse tone). */
  gradeClass: string;
  /** Extra CSS filter for the card art when the buff controls the unit. */
  artClass?: string;
};

export const BATTLE_BUFF_DISPLAY: Record<BattleBuffKey, BattleBuffDisplay> = {
  frozen: {
    key: 'frozen',
    label: 'Frozen',
    polarity: 'negative',
    control: true,
    palette: { core: 0x72c9e8, hot: 0xdaf6ff, dark: 0x24576c, text: 0xdff8ff },
    behavior: 'snowfall',
    gradeClass: 'border-sky-200/25 bg-sky-950/28 shadow-[inset_0_0_36px_rgba(8,47,73,0.66)]',
    artClass: 'saturate-[0.55] brightness-[0.82]',
  },
  stun: {
    key: 'stun',
    label: 'Stun',
    polarity: 'negative',
    control: true,
    palette: { core: 0xf0b94c, hot: 0xffe7a0, dark: 0x704313, text: 0xffedb8 },
    behavior: 'orbitStars',
    gradeClass: 'border-amber-300/25 bg-amber-950/20 shadow-[inset_0_0_30px_rgba(120,53,15,0.5)]',
    artClass: 'saturate-[0.75] brightness-[0.9]',
  },
  poison: {
    key: 'poison',
    label: 'Poison',
    polarity: 'negative',
    control: false,
    palette: { core: 0x83b83e, hot: 0xdaf29b, dark: 0x39571d, text: 0xe5f8b2 },
    behavior: 'bubbles',
    gradeClass: 'border-lime-400/20 bg-lime-950/20 shadow-[inset_0_0_28px_rgba(63,98,18,0.5)]',
  },
  wound: {
    key: 'wound',
    label: 'Wound',
    polarity: 'negative',
    control: false,
    palette: { core: 0xc94f56, hot: 0xf2aaa7, dark: 0x6e252b, text: 0xffc5c2 },
    behavior: 'bloodDrips',
    gradeClass: 'border-rose-500/22 bg-rose-950/20 shadow-[inset_0_0_28px_rgba(110,37,43,0.5)]',
  },
  burn: {
    key: 'burn',
    label: 'Burn',
    polarity: 'negative',
    control: false,
    palette: { core: 0xe2723a, hot: 0xffc07a, dark: 0x7a2f14, text: 0xffd9b0 },
    behavior: 'embers',
    gradeClass: 'border-orange-500/25 bg-orange-950/20 shadow-[inset_0_0_30px_rgba(122,47,20,0.52)]',
  },
  curse: {
    key: 'curse',
    label: 'Curse',
    polarity: 'negative',
    control: false,
    palette: { core: 0xa46bc4, hot: 0xddb8ec, dark: 0x512d68, text: 0xebccf3 },
    behavior: 'wisps',
    gradeClass: 'border-violet-400/20 bg-violet-950/24 shadow-[inset_0_0_30px_rgba(81,45,104,0.55)]',
  },
  heal: {
    key: 'heal',
    label: 'Heal',
    polarity: 'positive',
    control: false,
    palette: { core: 0xd9a04e, hot: 0xf7dd9e, dark: 0x6e4d1f, text: 0xfae8bd },
    behavior: 'mendGlow',
    gradeClass: 'border-amber-300/30 bg-amber-200/6 shadow-[inset_0_0_22px_rgba(217,160,78,0.2),0_0_18px_rgba(217,160,78,0.12)]',
  },
  pray: {
    key: 'pray',
    label: 'Pray',
    polarity: 'positive',
    control: false,
    palette: { core: 0xd8cda8, hot: 0xfff3cf, dark: 0x74694d, text: 0xfff1cc },
    behavior: 'radiantMotes',
    gradeClass: 'border-yellow-100/30 bg-yellow-50/6 shadow-[inset_0_0_22px_rgba(216,205,168,0.2),0_0_18px_rgba(216,205,168,0.12)]',
  },
};

/** Dominant-buff priority: control > DoT > stat debuff > regen > stat buff. */
export const BATTLE_BUFF_PRIORITY: readonly BattleBuffKey[] = [
  'frozen',
  'stun',
  'burn',
  'poison',
  'wound',
  'curse',
  'heal',
  'pray',
];

/** Unique active buff keys, priority-ordered (dominant first). */
export function activeBattleBuffKeys(names: Iterable<string>): BattleBuffKey[] {
  const active = new Set<BattleBuffKey>();
  for (const name of names) {
    const key = battleBuffKeyForName(name);
    if (key) active.add(key);
  }
  return BATTLE_BUFF_PRIORITY.filter((key) => active.has(key));
}

export function dominantBattleBuffKey(names: Iterable<string>): BattleBuffKey | undefined {
  return activeBattleBuffKeys(names)[0];
}
