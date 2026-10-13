import { normalizeVfxPresentation } from './battleVfxPresentation';
import { normalizeBattleProjectileTypeEffect } from './battleVfxCatalog';

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
  type_catalog: string;
  type_effect: string;
}

export interface Skill {
  name: string;
  description: string;
  TYPE: string;
  TARGET: string;
  TARGET_NUM: string;
  type_catalog?: string;
  type_effect?: string;
  buff_type_effect?: string;
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
  VFX_PRESENTATION?: 'auto' | 'instant' | 'direct';
  ROLE?: string;
}

export interface CharacterData {
  hero_id?: string;
  generation_id?: string;
  name: string;
  description: string;
  extra?: string;
  BP: string;
  rarity?: Rarity;
  template?: string;
  state: CharacterState;
  skill: Record<string, Skill> & {
    s1: Skill;
    s2: Skill;
  };
  activeBuffs?: Array<{ name: string; duration: number; value: number }>;
}

export type PowerTier = 'human' | 'superhuman' | 'monster' | 'hero' | 'demigod' | 'god';

export const POWER_TIER_LABEL: Record<PowerTier, string> = {
  human: 'Human',
  superhuman: 'Superhuman',
  monster: 'Monster',
  hero: 'Hero',
  demigod: 'Demigod',
  god: 'God',
};

export function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRarityToken(value: unknown): Rarity | null {
  const token = String(value ?? '').trim().toLowerCase();
  if (token === 'common' || token === 'rare' || token === 'epic' || token === 'mythic') return token;
  return null;
}

/** Prefer stored card rarity. Missing/legacy payloads fall back to common (not BP thresholds). */
export function resolveRarity(source: { rarity?: unknown } | Rarity | null | undefined): Rarity {
  if (typeof source === 'string') return normalizeRarityToken(source) ?? 'common';
  return normalizeRarityToken(source?.rarity) ?? 'common';
}

/** @deprecated Use resolveRarity — rarity is independent of BP. */
export function calculateRarity(_bp: number): Rarity {
  void _bp; // Keep the legacy signature; rarity no longer derives from BP.
  return 'common';
}

/** Display-only BP ladder; independent of card rarity. */
export function powerTierFromBp(bp: number): PowerTier {
  if (bp >= 10000) return 'god';
  if (bp >= 5000) return 'demigod';
  if (bp >= 1000) return 'hero';
  if (bp >= 500) return 'monster';
  if (bp >= 200) return 'superhuman';
  return 'human';
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

function normalizeToken(value: unknown, fallback = ''): string {
  const token = toStringValue(value, fallback).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  return token || fallback;
}

function inferTypeCatalog(type: string): 'proj' | 'instant' {
  const token = normalizeToken(type, 'flesh');
  if (token === 'weapon' || token === 'flesh' || token === 'claw' || token === 'slash') return 'instant';
  return 'proj';
}

function inferTypeEffect(type: string, catalog: string): string {
  const token = normalizeToken(type, 'flesh');
  if (catalog === 'instant') {
    if (token === 'weapon') return 'strike';
    if (token === 'flesh') return 'claw';
  }
  if (catalog === 'proj' && token === 'weapon') return 'arrow';
  return token;
}

function normalizeTypeCatalog(value: unknown, fallbackType: string): string {
  const token = normalizeToken(value, '');
  if (token === 'proj' || token === 'projectile' || token === 'ranged') return 'proj';
  if (token === 'instant' || token === 'melee') return 'instant';
  return inferTypeCatalog(fallbackType);
}

function normalizeSkill(raw: Record<string, unknown> | undefined): Skill {
  const legacyType = toStringValue(raw?.TYPE, 'attack');
  const typeCatalog = normalizeTypeCatalog(raw?.type_catalog ?? raw?.typeCatalog, legacyType);
  const rawTypeEffect = normalizeToken(raw?.type_effect ?? raw?.typeEffect, inferTypeEffect(legacyType, typeCatalog));
  return {
    name: toStringValue(raw?.name, 'Untitled Skill'),
    description: toStringValue(raw?.description, ''),
    TYPE: legacyType,
    TARGET: toStringValue(raw?.TARGET, 'Enemy'),
    TARGET_NUM: toStringValue(raw?.TARGET_NUM, '1'),
    type_catalog: typeCatalog,
    type_effect: typeCatalog === 'proj' ? normalizeBattleProjectileTypeEffect(rawTypeEffect) : rawTypeEffect,
    buff_type_effect: normalizeToken(raw?.buff_type_effect ?? raw?.buffTypeEffect, ''),
    VFX_PRESENTATION: normalizeVfxPresentation(raw?.VFX_PRESENTATION ?? raw?.vfxPresentation),
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
  const legacyType = toStringValue(raw?.TYPE, 'flesh');
  const typeCatalog = normalizeTypeCatalog(raw?.type_catalog ?? raw?.typeCatalog, legacyType);
  const rawTypeEffect = normalizeToken(raw?.type_effect ?? raw?.typeEffect, inferTypeEffect(legacyType, typeCatalog));
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
    TYPE: legacyType,
    type_catalog: typeCatalog,
    type_effect: typeCatalog === 'proj' ? normalizeBattleProjectileTypeEffect(rawTypeEffect) : rawTypeEffect,
  };
}

export function normalizeCharacterData(source: unknown): CharacterData {
  const record = (source && typeof source === 'object' ? source : {}) as Record<string, unknown>;
  const payload = (record.hero_payload && typeof record.hero_payload === 'object' ? record.hero_payload : record) as Record<string, unknown>;
  const state = normalizeState((payload.state || payload.state_weights) as Record<string, unknown> | undefined);
  const skill = (payload.skill && typeof payload.skill === 'object' ? payload.skill : {}) as Record<string, Record<string, unknown>>;
  const normalizedSkills = Object.fromEntries(
    Object.entries(skill).map(([key, value]) => [key, normalizeSkill(value)])
  ) as Record<string, Skill> & { s1: Skill; s2: Skill };
  normalizedSkills.s1 = normalizedSkills.s1 ?? normalizeSkill(skill.s1);
  normalizedSkills.s2 = normalizedSkills.s2 ?? normalizeSkill(skill.s2);

  return {
    name: toStringValue(payload.name, 'Unknown Hero'),
    hero_id: payload.hero_id ? toStringValue(payload.hero_id) : undefined,
    generation_id: payload.generation_id ? toStringValue(payload.generation_id) : undefined,
    description: toStringValue(payload.description, ''),
    extra: toStringValue(payload.extra, ''),
    BP: toStringValue(payload.BP, '1000'),
    rarity: resolveRarity(payload),
    template: toStringValue(payload.template, ''),
    state,
    skill: normalizedSkills,
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
  return Math.floor(HP + MP + ATK * 4 + DEF * 8 + SPEED * 10 + CC * 4 + CA * 4 + PI * 8 + EV * 6 + AC * 4);
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
