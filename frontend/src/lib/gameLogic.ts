export type Rarity = 'common' | 'rare' | 'epic' | 'mythic';
export type CardType = 'warrior' | 'mage' | 'rogue' | 'tank' | 'support';

export function calculateRarity(bp: number): Rarity {
  if (bp >= 3000) return 'mythic';
  if (bp >= 2000) return 'epic';
  if (bp >= 1000) return 'rare';
  return 'common';
}

export function normalizeCardType(typeStr: string): CardType {
  const lower = typeStr.toLowerCase();
  if (lower.includes('mage') || lower.includes('wizard') || lower.includes('sorcerer')) return 'mage';
  if (lower.includes('rogue') || lower.includes('assassin') || lower.includes('thief')) return 'rogue';
  if (lower.includes('tank') || lower.includes('guard') || lower.includes('shield')) return 'tank';
  if (lower.includes('support') || lower.includes('healer') || lower.includes('priest')) return 'support';
  return 'warrior'; // Default
}

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
  DMG: string;
  TARGET: string;
  TARGET_NUM: string;
  BUFF_HP?: string;
  BUFF_DMG?: string;
  BUFF_CC?: string;
  BUFF_MP?: string;
  BUFF_DEF?: string;
  BUFF_EV?: string;
  BUFF_AC?: string;
  IS_STUN: string;
  MP_COST: string;
  BUFF_TIME?: string;
  BUFF_NAME?: string;
}

export interface CharacterData {
  name: string;
  description: string;
  extra?: string;
  BP: string;
  state: CharacterState;
  skill: {
    s1: Skill;
    s2: Skill;
  };
}

export function extractJson(text: string): Record<string, unknown> | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Failed to parse JSON:", e);
      return null;
    }
  }
  return null;
}

export function calculateActualBP(state: CharacterState): number {
  const HP = parseInt(state.HP) || 0;
  const MP = parseInt(state.MP) || 0;
  const ATK = parseInt(state.ATK) || 0;
  const DEF = parseInt(state.DEF) || 0;
  const CC = parseInt(state.CC) || 0;
  const SPEED = parseInt(state.SPEED) || 0;
  const CA = parseInt(state.CA) || 0;
  const PI = parseInt(state.PI) || 0;
  const EV = parseInt(state.EV) || 0;
  const AC = parseInt(state.AC) || 0;

  return HP + MP + 4 * ATK + 8 * DEF + 4 * CC + 10 * SPEED + 4 * CA + 8 * PI + 6 * EV + 4 * AC;
}

export function adjustBasedOnBP(characterJson: Record<string, unknown>): CharacterData {
  const originalBP = parseInt(String(characterJson.BP ?? '1000')) || 1000;
  const state = (characterJson.state as Record<string, unknown>) || {};
  const skills = (characterJson.skill as Record<string, Record<string, unknown>>) || {};
  const normalizedState: CharacterState = {
    HP: String(state.HP ?? '0'),
    MP: String(state.MP ?? '0'),
    ATK: String(state.ATK ?? '0'),
    DEF: String(state.DEF ?? '0'),
    CC: String(state.CC ?? '0'),
    SPEED: String(state.SPEED ?? '0'),
    CA: String(state.CA ?? '0'),
    PI: String(state.PI ?? '0'),
    EV: String(state.EV ?? '0'),
    AC: String(state.AC ?? '0'),
    TYPE: String(state.TYPE ?? 'flesh')
  };

  const actualBP = calculateActualBP(normalizedState);
  const bpDiff = actualBP !== 0 ? originalBP / actualBP : 1;

  const adjustedState: Record<string, string> = {};
  for (const [key, value] of Object.entries(normalizedState)) {
    if (key === 'TYPE') {
      adjustedState[key] = String(value);
      continue;
    }
    const numVal = parseFloat(String(value));
    if (!isNaN(numVal)) {
      adjustedState[key] = Math.floor(numVal * bpDiff).toString();
    } else {
      adjustedState[key] = String(value ?? '0');
    }
  }

  const adjustedSkills: Record<string, Record<string, unknown>> = {};
  for (const [skillKey, skill] of Object.entries(skills)) {
    const adjustedSkill = { ...skill };
    const numericFields = ['DMG', 'BUFF_HP', 'BUFF_DMG', 'BUFF_CC', 'BUFF_MP', 'BUFF_DEF', 'BUFF_EV', 'BUFF_AC', 'MP_COST'];

    for (const field of numericFields) {
      if (field in skill) {
        const numVal = parseFloat(String(skill[field]));
        if (!isNaN(numVal)) {
          adjustedSkill[field] = Math.floor(numVal * bpDiff).toString();
        }
      }
    }

    if ('IS_STUN' in adjustedSkill) {
      const val = adjustedSkill.IS_STUN;
      adjustedSkill.IS_STUN = (val === true || val === "True") ? "True" : "False";
    }

    adjustedSkills[skillKey] = adjustedSkill;
  }

  return {
    name: String(characterJson.name ?? 'Unknown Hero'),
    description: String(characterJson.description ?? ''),
    extra: String(characterJson.extra ?? ''),
    BP: originalBP.toString(),
    state: adjustedState as unknown as CharacterState,
    skill: adjustedSkills as unknown as CharacterData['skill']
  };
}
