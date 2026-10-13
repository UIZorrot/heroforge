export const GAME_ART_VERSION = 'hf-climb-20261014-2';

/** Refresh built-in portraits without rewriting player uploads or saved NFT metadata. */
export function gameArtUrl(uri: string): string;
export function gameArtUrl(uri: string | undefined): string | undefined;
export function gameArtUrl(uri: string | null | undefined): string | null | undefined;
export function gameArtUrl(uri: string | null | undefined): string | null | undefined {
  if (!uri) return uri;
  try {
    const url = new URL(uri, 'https://hf.txzy.net');
    if (url.origin !== 'https://hf.txzy.net' ||
        !(url.pathname.startsWith('/test/') || url.pathname.startsWith('/art/void-labyrinth/'))) return uri;
    url.searchParams.set('v', GAME_ART_VERSION);
    return uri.startsWith('/') && !uri.startsWith('//') ? `${url.pathname}${url.search}${url.hash}` : url.href;
  } catch {
    return uri;
  }
}
