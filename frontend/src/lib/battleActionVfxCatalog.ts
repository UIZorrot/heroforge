import type { BattleEvent } from './battleTypes';

export type BattleActionVfxId = 'basic-attack' | 'witchflame-cut' | 'arcane-comet';

export type BattleActionVfxDefinition = {
  id: BattleActionVfxId;
  label: string;
  actionType: BattleEvent['actionType'];
  skillName: string | null;
  typeCatalog: 'instant' | 'proj';
  typeEffect: string;
  treatment: 'instant-plate' | 'projectile-plate';
};

/** The gameplay event is the source of truth for every named treatment. */
export const battleActionVfxDefinitions: readonly BattleActionVfxDefinition[] = [
  { id: 'basic-attack', label: 'Basic Attack', actionType: 'attack', skillName: null, typeCatalog: 'instant', typeEffect: 'slash', treatment: 'instant-plate' },
  { id: 'witchflame-cut', label: 'Witchflame Cut', actionType: 'skill', skillName: 'Witchflame Cut', typeCatalog: 'instant', typeEffect: 'fire', treatment: 'instant-plate' },
  { id: 'arcane-comet', label: 'Arcane Comet', actionType: 'skill', skillName: 'Arcane Comet', typeCatalog: 'proj', typeEffect: 'magic', treatment: 'projectile-plate' },
] as const;

function token(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function eventCatalog(event: BattleEvent) {
  const value = token(event.typeCatalog ?? event.type_catalog);
  if (value === 'projectile' || value === 'ranged') return 'proj';
  if (value === 'melee') return 'instant';
  return value;
}

export function resolveBattleActionVfx(event: BattleEvent): BattleActionVfxDefinition | null {
  if (event.actionType === 'attack') {
    const basicAttack = battleActionVfxDefinitions[0];
    return eventCatalog(event) === basicAttack.typeCatalog
      && token(event.typeEffect ?? event.type_effect) === basicAttack.typeEffect
      ? basicAttack
      : null;
  }
  const skillName = token(event.skillName);
  const typeEffect = token(event.typeEffect ?? event.type_effect);
  return battleActionVfxDefinitions.find((definition) => (
    definition.actionType === event.actionType
    && token(definition.skillName) === skillName
    && token(definition.typeCatalog) === eventCatalog(event)
    && token(definition.typeEffect) === typeEffect
  )) ?? null;
}
