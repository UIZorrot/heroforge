import { describe, expect, it } from 'vitest';
import { GAME_ART_VERSION, gameArtUrl } from './artAssets';

describe('built-in artwork cache refresh', () => {
  it.each(['/test/奥术法师.png', '/art/void-labyrinth/sentinel-v2.webp'])('versions %s', (path) => {
    const result = new URL(gameArtUrl(path), 'https://hf.txzy.net');
    expect(decodeURIComponent(result.pathname)).toBe(path);
    expect(result.searchParams.get('v')).toBe(GAME_ART_VERSION);
  });
  it('preserves other parameters and is idempotent', () => {
    const once = gameArtUrl('/test/a.png?quality=high&v=old#portrait');
    expect(gameArtUrl(once)).toBe(once);
    const url = new URL(once, 'https://hf.txzy.net');
    expect(url.searchParams.get('quality')).toBe('high');
    expect(url.searchParams.getAll('v')).toEqual([GAME_ART_VERSION]);
    expect(url.hash).toBe('#portrait');
  });
  it('versions owned absolute URLs without changing their origin', () => {
    const result = gameArtUrl('https://hf.txzy.net/art/void-labyrinth/boss-v2.webp');
    expect(new URL(result).origin).toBe('https://hf.txzy.net');
    expect(new URL(result).searchParams.get('v')).toBe(GAME_ART_VERSION);
  });
  it.each([
    'data:image/png;base64,AA==', 'ipfs://hero/image.png',
    'https://someone.example/test/hero.png', '/uploads/player.png',
    '/monad/art/void-labyrinth/boss-v2.webp', undefined, null,
  ])('keeps custom or independent artwork intact: %s', (uri) => {
    expect(gameArtUrl(uri)).toBe(uri);
  });
});
