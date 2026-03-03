
import type { CharacterData } from './lib/gameLogic';

export type MaterialKey = 'glowGem' | 'chaosMind' | 'emberCore' | 'frostShard' | 'stormSigil' | 'voidDust';
export type MaterialInventory = Record<MaterialKey, number>;

export interface MaterialDefinition {
  key: MaterialKey;
  label: string;
  effect: string;
  rewardTag: string;
  overlayClass: string;
  particleClass: string;
  badgeClass: string;
}

export interface SavedHero {
  id: string;
  createdAt: number;
  image: string;
  character: CharacterData;
  infusedMaterials?: Partial<MaterialInventory>;
}
