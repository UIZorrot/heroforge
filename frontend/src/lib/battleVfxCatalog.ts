export const canonicalBattleAttackTypes = [
  'flesh',
  'magic',
  'thunder',
  'weapon',
  'gun',
  'fire',
  'poison',
  'frost',
  'dark',
  'light',
  'nature',
  'water',
] as const;

export const canonicalBattleProjectileTypeEffects = [
  'blood',
  'fire',
  'frost',
  'holy',
  'magic',
  'nature',
  'arrow',
  'lighting',
  'void',
  'water',
  'bullet',
  'rock',
] as const;

export const canonicalBattleInstantTypeEffects = [
  'magic',
  'thunder',
  'strike',
  'explode',
  'fire',
  'poison',
  'frost',
  'dark',
  'light',
  'nature',
  'water',
  'claw',
  'pierce',
  'blunt',
  'bullet_hit',
] as const;

export const canonicalBattleBuffTypeEffects = [
  'stun',
  'frozen',
  'poison',
  'wound',
  'burn',
  'curse',
  'heal',
  'pray',
] as const;

export const canonicalBattleBuffNames = [
  'stun',
  'frozen',
  'poison',
  'wound',
  'burn',
  'curse',
  'heal',
  'pray',
] as const;

export type BattleVfxAttackType = (typeof canonicalBattleAttackTypes)[number];
export type BattleVfxTypeCatalog = 'proj' | 'instant';
export type BattleVfxProjectileTypeEffect = (typeof canonicalBattleProjectileTypeEffects)[number];
export type BattleVfxInstantTypeEffect = (typeof canonicalBattleInstantTypeEffects)[number];
export type BattleVfxBuffTypeEffect = (typeof canonicalBattleBuffTypeEffects)[number];
export type BattleVfxBuffName = (typeof canonicalBattleBuffNames)[number];
export type BattleVfxFamily =
  | BattleVfxAttackType
  | 'stun'
  | 'frozen'
  | 'corrupt'
  | 'heal'
  | 'pray'
  | 'wound'
  | 'curse'
  | 'rock'
  | 'neutral';

export type BattleVfxTone =
  | 'fire'
  | 'void'
  | 'heal'
  | 'stun'
  | 'steel'
  | 'gold'
  | 'frost'
  | 'wound'
  | 'curse'
  | 'nature'
  | 'water'
  | 'storm'
  | 'magic'
  | 'light';

export type BattleVfxMode = 'projectile' | 'instant' | 'buff';

export type BattleVfxEventInput = {
  actionType?: string | null;
  attackType?: string | null;
  skillRole?: string | null;
  skillName?: string | null;
  buffName?: string | null;
  typeCatalog?: string | null;
  typeEffect?: string | null;
  buffTypeEffect?: string | null;
  type_catalog?: string | null;
  type_effect?: string | null;
  buff_type_effect?: string | null;
  rangeMode?: string | null;
  damage?: number | null;
  heal?: number | null;
  isStunned?: boolean | null;
};

export type BattleVfxDescriptor = {
  family: BattleVfxFamily;
  tone: BattleVfxTone;
  mode: BattleVfxMode;
  isSupport: boolean;
  typeCatalog?: BattleVfxTypeCatalog;
  typeEffect?: string;
  buffTypeEffect?: string;
};

const FAMILY_ALIASES: Array<[BattleVfxFamily, string[]]> = [
  ['frost', ['frost', 'forst', 'frozen', 'freeze', 'ice', 'snow', 'cold']],
  ['thunder', ['thunder', 'lighting', 'lightning', 'storm', 'bolt', 'shock']],
  ['water', ['water', 'tide', 'wave', 'mist']],
  ['nature', ['nature', 'thorn', 'beast', 'root', 'leaf', 'vine']],
  ['poison', ['poison', 'venom', 'toxin']],
  ['corrupt', ['corrupt', 'corruption']],
  ['curse', ['curse', 'hex', 'doom', 'weakness', 'vulnerable', 'vulnerability', 'exposed']],
  ['wound', ['wound', 'bleed', 'blood']],
  ['dark', ['dark', 'void', 'shadow', 'siphon', 'soul']],
  ['light', ['light', 'holy', 'radiant']],
  ['fire', ['fire', 'burn', 'ember', 'flame', 'ash']],
  ['magic', ['magic', 'arcane', 'spell', 'rune']],
  ['gun', ['gun', 'shot', 'bullet']],
  ['weapon', ['weapon', 'strike', 'blade', 'sword', 'steel']],
  ['flesh', ['flesh', 'flash', 'claw', 'bite', 'fang', 'blood', 'hemomancy']],
  ['rock', ['rock', 'stone', 'earth', 'boulder']],
  ['stun', ['stun', 'stunned', 'daze']],
  ['heal', ['heal', 'regen', 'restore', 'recover']],
  ['pray', ['pray', 'prayer', 'oath', 'bless', 'blessing', 'haste', 'quick', 'speed', 'accuracy']],
];

const POSITIVE_BUFFS = new Set<BattleVfxFamily>(['heal', 'pray']);
const SUPPORT_SKILL_ROLES = new Set(['buff', 'support', 'heal', 'defense', 'utility']);
const SUPPORT_RANGES = new Set(['self', 'ally']);
const PROJECTILE_ATTACK_TYPES = new Set<BattleVfxFamily>([
  'magic',
  'thunder',
  'gun',
  'fire',
  'poison',
  'frost',
  'dark',
  'light',
  'nature',
  'water',
]);

function normalizedText(value?: string | null) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizedTypeCatalog(value?: string | null): BattleVfxTypeCatalog | undefined {
  const text = normalizedText(value);
  if (text === 'proj' || text === 'projectile' || text === 'ranged') return 'proj';
  if (text === 'instant' || text === 'melee') return 'instant';
  return undefined;
}

function normalizedEffectToken(value?: string | null) {
  return normalizedText(value).replace(/\s+/g, '_').replace(/-/g, '_') || undefined;
}

const PROJECTILE_TYPE_EFFECT_ALIASES: Record<string, BattleVfxProjectileTypeEffect> = {
  blood: 'blood',
  flesh: 'blood',
  bleed: 'blood',
  fire: 'fire',
  flame: 'fire',
  frost: 'frost',
  freeze: 'frost',
  ice: 'frost',
  holy: 'holy',
  light: 'holy',
  radiant: 'holy',
  magic: 'magic',
  arcane: 'magic',
  nature: 'nature',
  poison: 'nature',
  venom: 'nature',
  arrow: 'arrow',
  weapon: 'arrow',
  bow: 'arrow',
  lighting: 'lighting',
  lightning: 'lighting',
  thunder: 'lighting',
  storm: 'lighting',
  void: 'void',
  dark: 'void',
  shadow: 'void',
  water: 'water',
  tide: 'water',
  wave: 'water',
  bullet: 'bullet',
  gun: 'bullet',
  gunsmoke: 'bullet',
  shot: 'bullet',
  rock: 'rock',
  stone: 'rock',
  earth: 'rock',
};

export function normalizeBattleProjectileTypeEffect(value?: string | null): BattleVfxProjectileTypeEffect {
  const token = normalizedEffectToken(value) ?? 'magic';
  if (PROJECTILE_TYPE_EFFECT_ALIASES[token]) return PROJECTILE_TYPE_EFFECT_ALIASES[token];
  for (const word of token.split('_')) {
    if (PROJECTILE_TYPE_EFFECT_ALIASES[word]) return PROJECTILE_TYPE_EFFECT_ALIASES[word];
  }
  return 'magic';
}

function eventTypeCatalog(event: BattleVfxEventInput = {}) {
  return normalizedTypeCatalog(event.typeCatalog ?? event.type_catalog);
}

function eventTypeEffect(event: BattleVfxEventInput = {}) {
  return normalizedEffectToken(event.typeEffect ?? event.type_effect);
}

function eventBuffTypeEffect(event: BattleVfxEventInput = {}) {
  return normalizedEffectToken(event.buffTypeEffect ?? event.buff_type_effect);
}

function visualEffectFamily(effect?: string): BattleVfxFamily {
  switch (effect) {
    case 'arrow':
    case 'pierce':
    case 'blunt':
    case 'strike':
      return 'weapon';
    case 'claw':
      return 'flesh';
    case 'blood':
      return 'wound';
    case 'bullet_hit':
    case 'bullet':
      return 'gun';
    case 'explode':
    case 'burn':
      return 'fire';
    case 'thunder':
    case 'lighting':
      return 'thunder';
    case 'magic':
      return 'magic';
    case 'fire':
      return 'fire';
    case 'poison':
      return 'poison';
    case 'frost':
      return 'frost';
    case 'dark':
    case 'void':
      return 'dark';
    case 'light':
    case 'holy':
      return 'light';
    case 'nature':
      return 'nature';
    case 'water':
      return 'water';
    case 'gun':
      return 'gun';
    case 'flesh':
      return 'flesh';
    case 'rock':
      return 'rock';
    case 'stun':
      return 'stun';
    case 'frozen':
      return 'frost';
    case 'wound':
      return 'wound';
    case 'curse':
      return 'curse';
    case 'heal':
      return 'heal';
    case 'pray':
      return 'pray';
    default:
      return 'neutral';
  }
}

function includesWord(text: string, keyword: string) {
  if (!text || !keyword) return false;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

export function resolveBattleVfxFamily(...values: Array<string | null | undefined>): BattleVfxFamily {
  const text = values.map(normalizedText).filter(Boolean).join(' ');
  if (!text) return 'neutral';

  for (const [family, aliases] of FAMILY_ALIASES) {
    if (aliases.some((alias) => includesWord(text, alias))) {
      return family;
    }
  }

  return 'neutral';
}

export function battleVfxToneForFamily(family: BattleVfxFamily): BattleVfxTone {
  switch (family) {
    case 'fire':
      return 'fire';
    case 'frost':
    case 'frozen':
      return 'frost';
    case 'thunder':
      return 'storm';
    case 'water':
      return 'water';
    case 'nature':
    case 'poison':
      return 'nature';
    case 'dark':
      return 'void';
    case 'corrupt':
    case 'curse':
      return 'curse';
    case 'wound':
      return 'wound';
    case 'heal':
    case 'pray':
      return 'heal';
    case 'light':
      return 'light';
    case 'stun':
      return 'stun';
    case 'magic':
      return 'magic';
    case 'gun':
    case 'weapon':
      return 'steel';
    case 'flesh':
      return 'wound';
    case 'rock':
      return 'gold';
    default:
      return 'gold';
  }
}

export function isBattleSupportEvent(event: BattleVfxEventInput = {}) {
  const role = normalizedText(event.skillRole);
  const range = normalizedText(event.rangeMode);
  const buffFamily = resolveBattleVfxFamily(event.buffName);
  const heal = Number(event.heal ?? 0);
  const damage = Number(event.damage ?? 0);

  return (
    event.actionType === 'heal' ||
    (heal > 0 && damage <= 0) ||
    SUPPORT_SKILL_ROLES.has(role) ||
    SUPPORT_RANGES.has(range) ||
    POSITIVE_BUFFS.has(buffFamily)
  );
}

export function battleVfxModeForEvent(event: BattleVfxEventInput = {}, family: BattleVfxFamily = resolveBattleVfxFamily(event.attackType, event.buffName, event.skillName)): BattleVfxMode {
  if (isBattleSupportEvent(event)) return 'buff';
  if (event.actionType === 'stunned' || event.isStunned) return 'instant';
  if (event.actionType === 'dot_damage') return 'instant';
  const explicitTypeCatalog = eventTypeCatalog(event);
  if (explicitTypeCatalog === 'proj') return 'projectile';
  if (explicitTypeCatalog === 'instant') return 'instant';

  const range = normalizedText(event.rangeMode);
  const actionType = normalizedText(event.actionType);
  const damage = Number(event.damage ?? 0);
  const hasBuffOnly = Boolean(event.buffName) && damage <= 0;

  if (hasBuffOnly) return 'buff';
  if (range === 'ranged' || range === 'enemy' || range === 'back') return 'projectile';
  if (PROJECTILE_ATTACK_TYPES.has(family)) return 'projectile';
  if (actionType === 'skill') return 'projectile';

  return 'instant';
}

export function resolveBattleVfxDescriptor(event: BattleVfxEventInput = {}): BattleVfxDescriptor {
  const explicitTypeCatalog = eventTypeCatalog(event);
  const explicitTypeEffect = eventTypeEffect(event);
  const explicitBuffTypeEffect = eventBuffTypeEffect(event);
  const explicitFamily = visualEffectFamily(explicitTypeEffect);
  const explicitBuffFamily = visualEffectFamily(explicitBuffTypeEffect);
  const support = isBattleSupportEvent(event);
  const buffNameFamily = resolveBattleVfxFamily(event.buffName);
  const statusVisualFamily = event.actionType === 'dot_damage' || support ? buffNameFamily : 'neutral';
  const primaryFamily = statusVisualFamily !== 'neutral'
    ? statusVisualFamily
    : explicitBuffFamily !== 'neutral'
      ? explicitBuffFamily
      : explicitFamily !== 'neutral'
      ? explicitFamily
      : resolveBattleVfxFamily(event.buffName, event.attackType, event.skillName);
  const family = primaryFamily === 'frozen' ? 'frost' : primaryFamily;
  const mode = battleVfxModeForEvent(event, family);

  return {
    family,
    mode,
    tone: battleVfxToneForFamily(family),
    isSupport: support,
    typeCatalog: explicitTypeCatalog,
    typeEffect: explicitTypeEffect,
    buffTypeEffect: explicitBuffTypeEffect,
  };
}
