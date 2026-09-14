import { describe, expect, it } from 'vitest';
import { FORGE_FORM_MS, FORGE_GATHER_MS, forgePhase } from './forgePresentation';

const request = { hasImage: true, hasResult: false, pending: true, failed: false,
  started: true, elapsed: 0, revealed: false, reducedMotion: false };

describe('forge presentation and server completion', () => {
  it('keeps an instant response in the ritual until the card has formed', () => {
    const ready = { ...request, pending: false, hasResult: true };
    expect(forgePhase(ready)).toBe('gathering');
    expect(forgePhase({ ...ready, elapsed: FORGE_GATHER_MS })).toBe('shaping');
    expect(forgePhase({ ...ready, elapsed: FORGE_FORM_MS })).toBe('sealed');
    expect(forgePhase({ ...ready, elapsed: FORGE_FORM_MS, revealed: true })).toBe('revealed');
  });
  it('never reveals a slow or missing result when the visual sequence finishes', () => {
    expect(forgePhase({ ...request, elapsed: 60_000 })).toBe('shaping');
    expect(forgePhase({ ...request, pending: false, elapsed: 60_000 })).toBe('shaping');
    expect(forgePhase({ ...request, hasResult: true, elapsed: 60_000 })).toBe('shaping');
  });
  it('returns a failed request to the uploaded image for retry', () => {
    expect(forgePhase({ ...request, pending: false, failed: true })).toBe('prepared');
    expect(forgePhase({ ...request, pending: false, failed: true, hasImage: false })).toBe('empty');
  });
  it('does not hide an already created card when collection refresh fails', () => {
    expect(forgePhase({ ...request, pending: false, failed: true, hasResult: true, elapsed: FORGE_FORM_MS })).toBe('sealed');
  });
  it('skips the intro for reduced motion but still waits for the real result', () => {
    expect(forgePhase({ ...request, reducedMotion: true })).toBe('shaping');
    expect(forgePhase({ ...request, pending: false, hasResult: true, reducedMotion: true })).toBe('sealed');
  });
  it('shows an existing result when returning to Forge without replaying a purchase', () => {
    expect(forgePhase({ ...request, started: false, pending: false, hasResult: true })).toBe('revealed');
    expect(forgePhase({ ...request, started: false, pending: false })).toBe('prepared');
  });
});
