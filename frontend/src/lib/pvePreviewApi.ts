import type { SavedHero } from '../types';
import { IS_MOCK_MODE } from './runtimeMode';
import type { PveRun, PveTier, PveOperation, PveInput } from './pveTypes';

export const CAN_PLAY_PVE_PREVIEW = IS_MOCK_MODE && import.meta.env.DEV;

async function previewRequest(path: string, body?: unknown): Promise<PveRun | null> {
  if (!CAN_PLAY_PVE_PREVIEW) throw new Error('Saved adventures require a live account.');
  const response = await fetch(`/api/pve-preview/runs${path}`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : undefined);
  if (!(response.headers.get('Content-Type') ?? '').includes('application/json')) {
    throw new Error('Start the local climb test service to play this preview.');
  }
  const result = await response.json() as { data?: PveRun; error?: string };
  if (!response.ok) throw new Error(result.error ?? 'The local climb service is unavailable.');
  return result.data ?? null;
}

export const fetchPreviewPveRun = (id: string) => previewRequest(`/${encodeURIComponent(id)}`);
export const fetchActivePreviewPveRun = () => previewRequest('/active');
export async function createPreviewPveRun(tier: PveTier, heroes: SavedHero[]) {
  return (await previewRequest('', { tier, requestId: crypto.randomUUID(), party: heroes.map((hero, index) => ({
    id: hero.id, slot: index, image: hero.image, character: hero.character,
  })) }))!;
}
export async function mutatePreviewPveRun(run: PveRun, operation: PveOperation, input: PveInput) {
  return (await previewRequest(`/${encodeURIComponent(run.id)}/${operation}`, { ...input, revision: run.revision, requestId: crypto.randomUUID() }))!;
}
