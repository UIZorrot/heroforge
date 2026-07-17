import arcaneCometImpactUrl from '../assets/battle/vfx-signatures/arcane-comet-impact.webp';
import arcaneCometProjectileUrl from '../assets/battle/vfx-signatures/arcane-comet-projectile.webp';
import basicAttackUrl from '../assets/battle/vfx-signatures/basic-attack.webp';
import bloodBannerUrl from '../assets/battle/vfx-signatures/blood-banner.webp';
import briarArrowUrl from '../assets/battle/vfx-signatures/briar-arrow.webp';
import corruptingSigilUrl from '../assets/battle/vfx-signatures/corrupting-sigil.webp';
import deadeyeVolleyUrl from '../assets/battle/vfx-signatures/deadeye-volley.webp';
import frostPrismUrl from '../assets/battle/vfx-signatures/frost-prism.webp';
import graveHexUrl from '../assets/battle/vfx-signatures/grave-hex.webp';
import lumenSpearUrl from '../assets/battle/vfx-signatures/lumen-spear.webp';
import nullLanceUrl from '../assets/battle/vfx-signatures/null-lance.webp';
import pointBlankExecuteUrl from '../assets/battle/vfx-signatures/point-blank-execute.webp';
import rendingClawUrl from '../assets/battle/vfx-signatures/rending-claw.webp';
import shieldbreakerSlashUrl from '../assets/battle/vfx-signatures/shieldbreaker-slash.webp';
import stormOathUrl from '../assets/battle/vfx-signatures/storm-oath.webp';
import tideOfGraceUrl from '../assets/battle/vfx-signatures/tide-of-grace.webp';
import venomRootUrl from '../assets/battle/vfx-signatures/venom-root.webp';
import witchflameCutUrl from '../assets/battle/vfx-signatures/witchflame-cut.webp';
import type { BattleActionVfxDefinition } from './battleActionVfxCatalog';

export type BattleNamedActionVfxAsset = { id: string; src: string };

export const battleNamedActionVfxAssets: readonly BattleNamedActionVfxAsset[] = [
  { id: 'arcane-comet-impact', src: arcaneCometImpactUrl },
  { id: 'arcane-comet-projectile', src: arcaneCometProjectileUrl },
  { id: 'basic-attack', src: basicAttackUrl },
  { id: 'blood-banner', src: bloodBannerUrl },
  { id: 'briar-arrow', src: briarArrowUrl },
  { id: 'corrupting-sigil', src: corruptingSigilUrl },
  { id: 'deadeye-volley', src: deadeyeVolleyUrl },
  { id: 'frost-prism', src: frostPrismUrl },
  { id: 'grave-hex', src: graveHexUrl },
  { id: 'lumen-spear', src: lumenSpearUrl },
  { id: 'null-lance', src: nullLanceUrl },
  { id: 'point-blank-execute', src: pointBlankExecuteUrl },
  { id: 'rending-claw', src: rendingClawUrl },
  { id: 'shieldbreaker-slash', src: shieldbreakerSlashUrl },
  { id: 'storm-oath', src: stormOathUrl },
  { id: 'tide-of-grace', src: tideOfGraceUrl },
  { id: 'venom-root', src: venomRootUrl },
  { id: 'witchflame-cut', src: witchflameCutUrl },
] as const;

const assetsById = new Map(battleNamedActionVfxAssets.map((asset) => [asset.id, asset]));

export function namedActionVfxAssetsFor(action: BattleActionVfxDefinition) {
  const ids = [action.assetId, action.impactAssetId].filter((id): id is string => Boolean(id));
  return ids.map((id) => assetsById.get(id)).filter((asset): asset is BattleNamedActionVfxAsset => Boolean(asset));
}
