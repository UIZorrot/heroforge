import { mockHeroes } from './mockContent';
import type { BattleEvent } from './battleTypes';

export type BattleVfxLabAction = {
  value: string;
  label: string;
  heroName: string;
  description: string;
  actionType: BattleEvent['actionType'];
  skillName: string | null;
  attackType: string | null;
  typeCatalog: string;
  typeEffect: string;
  buffTypeEffect: string | null;
  buffName: string | null;
  skillRole: string | null;
  rangeMode: string | null;
};

const basicAttackHero = mockHeroes.find((hero) => hero.character.name === 'Garran') ?? mockHeroes[0];

const basicAttack: BattleVfxLabAction = {
  value: `basic:${basicAttackHero.id}`,
  label: 'Basic Attack',
  heroName: basicAttackHero.character.name,
  description: `Uses ${basicAttackHero.character.name}'s real character-state VFX contract.`,
  actionType: 'attack',
  skillName: null,
  attackType: basicAttackHero.character.state.TYPE,
  typeCatalog: basicAttackHero.character.state.type_catalog,
  typeEffect: basicAttackHero.character.state.type_effect,
  buffTypeEffect: null,
  buffName: null,
  skillRole: null,
  rangeMode: basicAttackHero.character.state.type_catalog === 'proj' ? 'enemy' : 'melee',
};

const skillActions = mockHeroes.flatMap((hero) => Object.entries(hero.character.skill).map(([slot, skill]) => {
  const role = String(skill.ROLE ?? 'attack').toLowerCase();
  const typeCatalog = String(skill.type_catalog ?? 'instant');
  return {
    value: `skill:${hero.id}:${slot}`,
    label: skill.name,
    heroName: hero.character.name,
    description: skill.description,
    actionType: role === 'heal' ? 'heal' : 'skill',
    skillName: skill.name,
    attackType: skill.TYPE,
    typeCatalog,
    typeEffect: String(skill.type_effect ?? skill.TYPE).toLowerCase(),
    buffTypeEffect: skill.buff_type_effect || null,
    buffName: skill.BUFF_NAME || null,
    skillRole: role,
    rangeMode: String(skill.RANGE ?? (typeCatalog === 'proj' ? 'enemy' : 'melee')).toLowerCase(),
  } satisfies BattleVfxLabAction;
}));

export const battleVfxLabActions: readonly BattleVfxLabAction[] = [basicAttack, ...skillActions];

export function getBattleVfxLabAction(value: string) {
  return battleVfxLabActions.find((action) => action.value === value) ?? basicAttack;
}
