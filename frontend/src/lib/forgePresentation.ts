export const FORGE_GATHER_MS = 680;
export const FORGE_FORM_MS = 2400;

export type ForgePhase = 'empty' | 'prepared' | 'gathering' | 'shaping' | 'sealed' | 'revealed';

// The ritual can wait for the server, but it can never manufacture a result.
export function forgePhase(input: {
  hasImage: boolean; hasResult: boolean; pending: boolean; failed: boolean;
  started: boolean; elapsed: number; revealed: boolean; reducedMotion: boolean;
}): ForgePhase {
  if (input.hasResult && !input.started) return 'revealed';
  if (input.failed && !input.pending && !input.hasResult) return input.hasImage ? 'prepared' : 'empty';
  if (input.started || input.pending) {
    if (!input.reducedMotion && input.elapsed < FORGE_GATHER_MS) return 'gathering';
    if (input.pending || !input.hasResult || (!input.reducedMotion && input.elapsed < FORGE_FORM_MS)) return 'shaping';
    return input.revealed ? 'revealed' : 'sealed';
  }
  return input.hasImage ? 'prepared' : 'empty';
}
