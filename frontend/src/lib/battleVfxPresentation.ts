import type { BattleEvent } from './battleTypes';
import { canonicalBattleInstantTypeEffects, resolveBattleVfxDescriptor } from './battleVfxCatalog';

export type BattleVfxPresentation = 'auto' | 'instant' | 'direct';
export function normalizeVfxPresentation(value: unknown): BattleVfxPresentation {
  // Read saved prototype choices without reactivating the paused sky renderer.
  return value === 'instant' || value === 'sky' ? 'instant' : value === 'direct' ? 'direct' : 'auto';
}
export function battleUsesInstantVfx(events: BattleEvent[]) {
  const event = events[0];
  if (!event || !['skill', 'heal'].includes(event.actionType)) return false;
  const choice = normalizeVfxPresentation(event.vfxPresentation);
  if (choice !== 'auto') return choice === 'instant';
  if (Math.max(event.targetCount ?? 1, events.length) < 2) return false;
  const effect = resolveBattleVfxDescriptor(event).typeEffect;
  return !['claw', 'strike', 'pierce', 'blunt', 'bullet', 'bullet_hit', 'flesh', 'weapon', 'gun'].includes(effect || event.attackType || '');
}
const instantAliases: Record<string, string> = {
  lighting: 'thunder', lightning: 'thunder', storm: 'thunder', holy: 'light', heal: 'light', pray: 'light',
  void: 'dark', curse: 'dark', frozen: 'frost', burn: 'fire', blood: 'claw', wound: 'claw',
  rock: 'blunt', arrow: 'pierce', bullet: 'bullet_hit', stun: 'magic',
};
/** Presentation copies keep every hit, event key, cost and board history intact. */
export function battlePresentationEvents(events: BattleEvent[]): BattleEvent[] {
  if (!battleUsesInstantVfx(events)) return events;
  return events.map(event => {
    const descriptor = resolveBattleVfxDescriptor(event);
    const source = descriptor.typeEffect || descriptor.family;
    const mapped = instantAliases[source] || source;
    const typeEffect = canonicalBattleInstantTypeEffects.some(effect => effect === mapped) ? mapped : 'magic';
    return { ...event, vfxPresentation: 'instant', typeCatalog: 'instant', type_catalog: 'instant', typeEffect, type_effect: typeEffect };
  });
}
