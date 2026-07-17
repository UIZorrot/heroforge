import { battleVfxManifest } from '../generated/battleVfxManifest';
import type { BattleEvent } from './battleTypes';

export type BattleActionVfxId = (typeof battleVfxManifest)[number]['id'];
export type BattleActionVfxTreatment = 'instant-plate' | 'projectile-plate' | 'buff-plate' | 'heal-plate';
export type BattleActionVfxTimingPreset =
  | 'melee-snap'
  | 'melee-heavy'
  | 'projectile-precise'
  | 'projectile-heavy'
  | 'projectile-rapid'
  | 'impact-critical'
  | 'control-snap'
  | 'control-bloom'
  | 'support-bloom';

export type BattleActionVfxDefinition = {
  id: BattleActionVfxId;
  label: string;
  heroName: string;
  description: string;
  actionType: BattleEvent['actionType'];
  skillName: string | null;
  typeCatalog: 'instant' | 'proj';
  typeEffect: string;
  treatment: BattleActionVfxTreatment;
  assetId: string;
  impactAssetId: string | null;
  timingPreset: BattleActionVfxTimingPreset;
};

/** Generated from backend/starter_cards.py; visual fields are joined by the generator. */
export const battleActionVfxDefinitions = battleVfxManifest as readonly BattleActionVfxDefinition[];

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
  const skillName = token(event.skillName);
  const typeEffect = token(event.typeEffect ?? event.type_effect);
  return battleActionVfxDefinitions.find((definition) => (
    definition.actionType === event.actionType
    && token(definition.skillName) === skillName
    && token(definition.typeCatalog) === eventCatalog(event)
    && token(definition.typeEffect) === typeEffect
  )) ?? null;
}
