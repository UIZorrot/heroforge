import { describe, expect, it } from 'vitest';
import { normalizeCharacterData, powerTierFromBp, resolveRarity } from './gameLogic';

describe('game logic data normalization', () => {
  it('normalizes base attack visual fields and preserves more than two skills', () => {
    const hero = normalizeCharacterData({
      name: 'Vera',
      description: 'A test unit.',
      BP: '1200',
      rarity: 'epic',
      state: {
        HP: '1000',
        MP: '100',
        ATK: '120',
        DEF: '20',
        CC: '10',
        SPEED: '30',
        CA: '10',
        PI: '5',
        EV: '8',
        AC: '90',
        TYPE: 'weapon',
        type_catalog: 'instant',
        type_effect: 'strike',
      },
      skill: {
        s1: {
          name: 'Claw Rend',
          description: 'A claw instant.',
          TYPE: 'flesh',
          type_catalog: 'instant',
          type_effect: 'claw',
          buff_type_effect: 'flesh',
          TARGET: 'Enemy',
          TARGET_NUM: '1',
        },
        s2: {
          name: 'Long Shot',
          description: 'An arrow projectile.',
          TYPE: 'weapon',
          type_catalog: 'proj',
          type_effect: 'arrow',
          TARGET: 'Enemy',
          TARGET_NUM: '1',
        },
        s3: {
          name: 'Ash Mark',
          description: 'A fire status.',
          TYPE: 'fire',
          type_catalog: 'instant',
          type_effect: 'explode',
          buff_type_effect: 'fire',
          TARGET: 'Enemy',
          TARGET_NUM: '1',
        },
      },
    });

    expect(hero.state.type_catalog).toBe('instant');
    expect(hero.state.type_effect).toBe('strike');
    expect(hero.rarity).toBe('epic');
    expect(Object.keys(hero.skill)).toEqual(['s1', 's2', 's3']);
    expect(hero.skill.s1.type_catalog).toBe('instant');
    expect(hero.skill.s1.type_effect).toBe('claw');
    expect(hero.skill.s1.buff_type_effect).toBe('flesh');
    expect(hero.skill.s2.type_catalog).toBe('proj');
    expect(hero.skill.s2.type_effect).toBe('arrow');
  });

  it('infers visual fields from legacy TYPE when new fields are absent', () => {
    const hero = normalizeCharacterData({
      state: { TYPE: 'gun' },
      skill: {
        s1: { TYPE: 'weapon', TARGET: 'Enemy', TARGET_NUM: '1' },
        s2: { TYPE: 'flesh', TARGET: 'Enemy', TARGET_NUM: '1' },
      },
    });

    expect(hero.state.type_catalog).toBe('proj');
    expect(hero.state.type_effect).toBe('bullet');
    expect(hero.rarity).toBe('common');
    expect(hero.skill.s1.type_catalog).toBe('instant');
    expect(hero.skill.s1.type_effect).toBe('strike');
    expect(hero.skill.s2.type_catalog).toBe('instant');
    expect(hero.skill.s2.type_effect).toBe('claw');
  });

  it('resolves rarity from payload and maps BP power tiers independently', () => {
    expect(resolveRarity({ rarity: 'mythic' })).toBe('mythic');
    expect(resolveRarity({ rarity: 'nope' })).toBe('common');
    expect(powerTierFromBp(150)).toBe('human');
    expect(powerTierFromBp(250)).toBe('superhuman');
    expect(powerTierFromBp(700)).toBe('monster');
    expect(powerTierFromBp(2000)).toBe('hero');
    expect(powerTierFromBp(6000)).toBe('demigod');
    expect(powerTierFromBp(12000)).toBe('god');
  });
});
