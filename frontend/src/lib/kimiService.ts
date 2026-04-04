import type { CharacterData } from './gameLogic';
import { forgeHero as forgeHeroApi } from './api';

type ForgeMaterialsInput = Record<string, number>;

export async function forgeHero(imageFile: File, materials: ForgeMaterialsInput = {}, token?: string | null): Promise<CharacterData> {
  return await forgeHeroApi(imageFile, materials, token);
}
