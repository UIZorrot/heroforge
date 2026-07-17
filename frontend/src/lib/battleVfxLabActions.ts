import { battleVfxManifest } from '../generated/battleVfxManifest';
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

/** VFX Lab and Battle consume the same generated starter-action manifest. */
export const battleVfxLabActions: readonly BattleVfxLabAction[] = battleVfxManifest;

export function getBattleVfxLabAction(value: string): BattleVfxLabAction {
  return battleVfxLabActions.find((action) => action.value === value) ?? battleVfxLabActions[0];
}
