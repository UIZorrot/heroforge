export type Rarity = 'common' | 'rare' | 'epic' | 'mythic';
export type CardType = 'warrior' | 'mage' | 'rogue' | 'tank' | 'support';

export interface CharacterState {
  HP: string;
  MP: string;
  ATK: string;
  DEF: string;
  CC: string;
  SPEED: string;
  CA: string;
  PI: string;
  EV: string;
  AC: string;
  TYPE: string;
}

export interface Skill {
  name: string;
  description: string;
  TYPE: string;
  TARGET: string;
  TARGET_NUM: string;
  RANGE?: string;
  IS_PASSIVE?: boolean | string;
  IS_STUN?: boolean | string;
  BUFF_TIME?: string | number;
  BUFF_NAME?: string;
  DMG?: string | number;
  BUFF_HP?: string | number;
  BUFF_MP?: string | number;
  BUFF_DMG?: string | number;
  BUFF_CC?: string | number;
  BUFF_DEF?: string | number;
  BUFF_EV?: string | number;
  BUFF_AC?: string | number;
  MP_COST?: string | number;
  MP_COST_RATE?: string | number;
  ROLE?: string;
}

export interface CharacterData {
  name: string;
  description: string;
  extra?: string;
  BP: string;
  template?: string;
  state: CharacterState;
  skill: {
    s1: Skill;
    s2: Skill;
  };
  activeBuffs?: Array<{ name: string; duration: number; value: number }>;
}

export function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function calculateRarity(bp: number): Rarity {
  if (bp >= 3000) return 'mythic';
  if (bp >= 1800) return 'epic';
  if (bp >= 900) return 'rare';
  return 'common';
}

export function normalizeCardType(typeStr: string): CardType {
  const lower = (typeStr || '').toLowerCase();
  if (lower.includes('mage') || lower.includes('wizard') || lower.includes('sorcerer') || lower.includes('cleric')) return 'mage';
  if (lower.includes('rogue') || lower.includes('assassin') || lower.includes('thief')) return 'rogue';
  if (lower.includes('tank') || lower.includes('guard') || lower.includes('shield')) return 'tank';
  if (lower.includes('support') || lower.includes('healer') || lower.includes('priest')) return 'support';
  return 'warrior';
}

function toStringValue(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeBooleanString(value: unknown): string {
  if (value === true || value === 'True' || value === 'true' || value === 1) return 'True';
  return 'False';
}

function normalizeSkill(raw: Record<string, unknown> | undefined): Skill {
  return {
    name: toStringValue(raw?.name, 'Untitled Skill'),
    description: toStringValue(raw?.description, ''),
    TYPE: toStringValue(raw?.TYPE, 'attack'),
    TARGET: toStringValue(raw?.TARGET, 'Enemy'),
    TARGET_NUM: toStringValue(raw?.TARGET_NUM, '1'),
    RANGE: toStringValue(raw?.RANGE, 'enemy'),
    IS_PASSIVE: normalizeBooleanString(raw?.IS_PASSIVE),
    IS_STUN: normalizeBooleanString(raw?.IS_STUN),
    BUFF_TIME: toStringValue(raw?.BUFF_TIME, '0'),
    BUFF_NAME: toStringValue(raw?.BUFF_NAME, ''),
    DMG: toStringValue(raw?.DMG, '0'),
    BUFF_HP: toStringValue(raw?.BUFF_HP, '0'),
    BUFF_MP: toStringValue(raw?.BUFF_MP, '0'),
    BUFF_DMG: toStringValue(raw?.BUFF_DMG, '0'),
    BUFF_CC: toStringValue(raw?.BUFF_CC, '0'),
    BUFF_DEF: toStringValue(raw?.BUFF_DEF, '0'),
    BUFF_EV: toStringValue(raw?.BUFF_EV, '0'),
    BUFF_AC: toStringValue(raw?.BUFF_AC, '0'),
    MP_COST: toStringValue(raw?.MP_COST, '0'),
    MP_COST_RATE: toStringValue(raw?.MP_COST_RATE, '0'),
    ROLE: toStringValue(raw?.ROLE, 'attack'),
  };
}

function normalizeState(raw: Record<string, unknown> | undefined): CharacterState {
  return {
    HP: toStringValue(raw?.HP, '0'),
    MP: toStringValue(raw?.MP, '0'),
    ATK: toStringValue(raw?.ATK, '0'),
    DEF: toStringValue(raw?.DEF, '0'),
    CC: toStringValue(raw?.CC, '0'),
    SPEED: toStringValue(raw?.SPEED, '0'),
    CA: toStringValue(raw?.CA, '0'),
    PI: toStringValue(raw?.PI, '0'),
    EV: toStringValue(raw?.EV, '0'),
    AC: toStringValue(raw?.AC, '0'),
    TYPE: toStringValue(raw?.TYPE, 'flesh'),
  };
}

export function normalizeCharacterData(source: unknown): CharacterData {
  const record = (source && typeof source === 'object' ? source : {}) as Record<string, unknown>;
  const payload = (record.hero_payload && typeof record.hero_payload === 'object' ? record.hero_payload : record) as Record<string, unknown>;
  const state = normalizeState((payload.state || payload.state_weights) as Record<string, unknown> | undefined);
  const skill = (payload.skill && typeof payload.skill === 'object' ? payload.skill : {}) as Record<string, Record<string, unknown>>;

  return {
    name: toStringValue(payload.name, 'Unknown Hero'),
    description: toStringValue(payload.description, ''),
    extra: toStringValue(payload.extra, ''),
    BP: toStringValue(payload.BP, '1000'),
    template: toStringValue(payload.template, ''),
    state,
    skill: {
      s1: normalizeSkill(skill.s1),
      s2: normalizeSkill(skill.s2),
    },
    activeBuffs: Array.isArray(payload.activeBuffs)
      ? payload.activeBuffs.map((buff) => ({
        name: toStringValue((buff as Record<string, unknown>).name, ''),
        duration: toNumber((buff as Record<string, unknown>).duration, 0),
        value: toNumber((buff as Record<string, unknown>).value, 0),
      }))
      : undefined,
  };
}

export function calculateActualBP(state: CharacterState): number {
  const HP = toNumber(state.HP);
  const MP = toNumber(state.MP);
  const ATK = toNumber(state.ATK);
  const DEF = toNumber(state.DEF);
  const CC = toNumber(state.CC);
  const SPEED = toNumber(state.SPEED);
  const CA = toNumber(state.CA);
  const PI = toNumber(state.PI);
  const EV = toNumber(state.EV);
  const AC = toNumber(state.AC);
  return Math.floor(HP * 0.5 + MP * 0.5 + ATK * 5 + DEF * 5 + SPEED * 4 + CC * 3 + CA * 3 + PI * 3 + EV * 3 + AC * 3);
}

export function adjustBasedOnBP(characterJson: Record<string, unknown>): CharacterData {
  return normalizeCharacterData(characterJson);
}

export function extractJson(text: string): Record<string, unknown> | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}
