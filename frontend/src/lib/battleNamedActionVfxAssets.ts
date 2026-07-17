import basicAttackUrl from '../assets/battle/vfx-signatures/basic-attack.png';
import witchflameCutUrl from '../assets/battle/vfx-signatures/witchflame-cut.png';
import arcaneCometProjectileUrl from '../assets/battle/vfx-signatures/arcane-comet-projectile.png';
import arcaneCometImpactUrl from '../assets/battle/vfx-signatures/arcane-comet-impact.png';

export const battleNamedActionVfxAssets = [
  { id: 'basicAttack', src: basicAttackUrl },
  { id: 'witchflameCut', src: witchflameCutUrl },
  { id: 'arcaneCometProjectile', src: arcaneCometProjectileUrl },
  { id: 'arcaneCometImpact', src: arcaneCometImpactUrl },
] as const;
