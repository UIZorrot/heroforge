import type { RelicDefinition } from '../types';

export type RelicCategory = 'weapon' | 'armor' | 'accessory' | 'artifact';

function fileNameFromDisplayName(displayName: string) {
  const trimmed = displayName.trim();
  return trimmed ? `${trimmed}.png` : '';
}

export function getRelicIconSrc(relic?: Pick<RelicDefinition, 'display_name'> | null) {
  if (!relic?.display_name) return null;
  return `/relics/${encodeURIComponent(fileNameFromDisplayName(relic.display_name))}`;
}

export function getRelicCategory(relic?: Pick<RelicDefinition, 'display_name' | 'family'> | null): RelicCategory {
  const text = `${relic?.display_name ?? ''} ${relic?.family ?? ''}`.toLowerCase();
  if (text.includes('fang') || text.includes('scepter') || text.includes('key')) return 'weapon';
  if (text.includes('crown') || text.includes('reliquary') || text.includes('banner')) return 'armor';
  if (
    text.includes('heart') ||
    text.includes('lantern') ||
    text.includes('rosary') ||
    text.includes('talisman') ||
    text.includes('medal') ||
    text.includes('token') ||
    text.includes('seal') ||
    text.includes('votive') ||
    text.includes('glass')
  ) {
    return 'accessory';
  }
  return 'artifact';
}
