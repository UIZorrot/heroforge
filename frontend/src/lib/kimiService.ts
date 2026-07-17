import type { CharacterData } from './gameLogic';
import { forgeHero as forgeHeroApi } from './api';

export async function forgeHero(imageFile: File, token?: string | null): Promise<CharacterData> {
  return await forgeHeroApi(imageFile, token);
}
