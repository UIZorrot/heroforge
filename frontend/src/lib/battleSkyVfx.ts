import type { BattleEvent } from './battleTypes';
import { resolveBattleVfxDescriptor } from './battleVfxCatalog';

export { normalizeVfxPresentation, type BattleVfxPresentation } from './battleVfxPresentation';
export type SkyVfxKind = 'meteor' | 'ice' | 'storm' | 'light' | 'shard' | 'rain';
export const SKY_VFX_TIMING = { anticipationMs: 260, descentMs: 460, staggerMs: 28, maxStaggerMs: 140, recoveryMs: 540 } as const;

/** The 3D prototype is paused; active combat uses the existing instant renderer. */
export function battleUsesSkyVfx(_events: BattleEvent[]) { return false; }
export function skyVfxProfile(event: BattleEvent) {
  const { family, tone } = resolveBattleVfxDescriptor(event);
  const palettes: Record<string, { core: number; hot: number }> = {
    fire: { core: 0xf16d26, hot: 0xffe2a3 }, frost: { core: 0x65b8eb, hot: 0xe2f7ff },
    holy: { core: 0xcda667, hot: 0xfff5cb }, heal: { core: 0x5ea884, hot: 0xe1f9db },
    gold: { core: 0xc6a36d, hot: 0xfff4c6 }, void: { core: 0x805db1, hot: 0xe4ceff },
    nature: { core: 0x6b9d58, hot: 0xdbecbc }, water: { core: 0x5193b8, hot: 0xd5f1ff },
    storm: { core: 0x7da9cf, hot: 0xebf5ff }, steel: { core: 0x9ba8b6, hot: 0xf0e9d9 },
    wound: { core: 0xad4f43, hot: 0xffb39c }, magic: { core: 0x827aaa, hot: 0xe7d8ff },
    curse: { core: 0x806d8f, hot: 0xd7c3df }, light: { core: 0xcda667, hot: 0xfff5cb },
    stun: { core: 0xb5a56c, hot: 0xf5e5ba },
  };
  const kind: SkyVfxKind = ['fire', 'rock'].includes(family) || event.typeEffect === 'explode' ? 'meteor'
    : family === 'frost' ? 'ice' : ['thunder', 'storm'].includes(family) || ['lighting', 'thunder'].includes(event.typeEffect ?? '') ? 'storm'
    : ['heal', 'pray', 'light'].includes(family) || event.heal > 0 ? 'light' : event.typeEffect === 'arrow' ? 'rain' : 'shard';
  return { kind, ...(palettes[tone] ?? palettes.gold), support: event.heal > 0 || ['heal', 'pray'].includes(family), critical: event.isCrit };
}
export function skyTargetTiming(index: number) {
  const startMs = SKY_VFX_TIMING.anticipationMs + Math.min(Math.max(index, 0) * SKY_VFX_TIMING.staggerMs, SKY_VFX_TIMING.maxStaggerMs);
  return { startMs, impactMs: startMs + SKY_VFX_TIMING.descentMs, endMs: startMs + SKY_VFX_TIMING.descentMs + SKY_VFX_TIMING.recoveryMs };
}
export function skyTargetPhase(elapsedMs: number, index: number) {
  const { startMs, impactMs, endMs } = skyTargetTiming(index);
  return { descent: Math.max(0, Math.min(1, (elapsedMs - startMs) / (impactMs - startMs))),
    recovery: Math.max(0, Math.min(1, (elapsedMs - impactMs) / (endMs - impactMs))),
    impacted: elapsedMs >= impactMs, finished: elapsedMs >= endMs };
}
