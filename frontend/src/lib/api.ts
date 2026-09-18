import type {
  AgentAccessKey,
  AuthUser,
  BattleHistoryRecord,
  BattleResult,
  DailySnapshot,
  EconomySnapshot,
  FriendChallengeRecord,
  FriendsSnapshot,
  ArenaFormation,
  BattleSessionAction,
  BattleSessionSnapshot,
  CharacterData,
  CreateAgentAccessKeyResponse,
  CurrencyDiamondPack,
  CurrencyDustPack,
  HeroHistoryRecord,
  LadderSnapshot,
  LoginCodeResponse,
  MarketBoardSnapshot,
  PvpEntryStatusResponse,
  PvpJoinResponse,
  SessionSnapshot,
  VerifyLoginResponse,
} from '../types';
import { normalizeCharacterData } from './gameLogic';
import { APP_MODE, STORAGE_NAMESPACE } from './runtimeMode';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5544').replace(/\/$/, '');
const TOKEN_KEY = `${STORAGE_NAMESPACE}.session.token`;
const EMAIL_KEY = `${STORAGE_NAMESPACE}.session.email`;
const EXPIRES_KEY = `${STORAGE_NAMESPACE}.session.expires_at`;

type JsonValue = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

export function getBackendUrl() {
  return BACKEND_URL;
}

export function getStoredSession(): SessionSnapshot | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const email = localStorage.getItem(EMAIL_KEY);
  if (!token || !email) return null;
  return {
    token,
    email,
    expiresAt: localStorage.getItem(EXPIRES_KEY) || undefined,
  };
}

export function setStoredSession(session: SessionSnapshot) {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(EMAIL_KEY, session.email);
  if (session.expiresAt) {
    localStorage.setItem(EXPIRES_KEY, session.expiresAt);
  } else {
    localStorage.removeItem(EXPIRES_KEY);
  }
}

export function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function authHeaders(token?: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const sessionToken = token ?? getStoredToken();
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  return headers;
}

async function requestJson<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  if (APP_MODE === 'mock') {
    throw new Error('Backend requests are disabled in mock mode. Set VITE_APP_MODE=live to use the live service.');
  }
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      ...authHeaders(token),
      ...(init.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function requestLoginCode(email: string): Promise<LoginCodeResponse> {
  const payload = await requestJson<{ data?: LoginCodeResponse; email?: string; expires_at?: string; id?: string }>(
    '/api/auth/request-code',
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    }
  );

  return payload.data ?? {
    email: payload.email ?? email,
    expires_at: payload.expires_at ?? '',
    id: payload.id ?? '',
  };
}

export async function verifyLoginCode(email: string, code: string): Promise<VerifyLoginResponse> {
  const payload = await requestJson<{ data?: VerifyLoginResponse }>(
    '/api/auth/verify-code',
    {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }
  );

  if (!payload.data) {
    throw new Error('Login response missing session data');
  }

  setStoredSession({
    token: payload.data.token,
    email: payload.data.user.email,
    expiresAt: payload.data.expires_at,
  });

  return payload.data;
}

export async function fetchCurrentUser(token?: string | null): Promise<AuthUser | null> {
  const payload = await requestJson<{ authenticated: boolean; user?: AuthUser }>(
    '/api/auth/me',
    { method: 'GET' },
    token
  );
  return payload.authenticated ? (payload.user ?? null) : null;
}

export async function logout(token?: string | null): Promise<void> {
  await requestJson<{ ok: true }>(
    '/api/auth/logout',
    { method: 'POST' },
    token
  );
  clearStoredSession();
}

export async function fetchAgentAccessKeys(token?: string | null): Promise<AgentAccessKey[]> {
  const payload = await requestJson<{ data: AgentAccessKey[] }>('/api/me/agent-keys', { method: 'GET' }, token);
  return payload.data ?? [];
}

export async function createAgentAccessKey(name: string, token?: string | null): Promise<CreateAgentAccessKeyResponse> {
  const payload = await requestJson<{ data: CreateAgentAccessKeyResponse }>(
    '/api/me/agent-keys',
    { method: 'POST', body: JSON.stringify({ name }) },
    token
  );
  if (!payload.data?.secret || !payload.data?.key) throw new Error('Agent key response is incomplete');
  return payload.data;
}

export async function revokeAgentAccessKey(keyId: string, token?: string | null): Promise<AgentAccessKey> {
  const payload = await requestJson<{ data: AgentAccessKey }>(
    `/api/me/agent-keys/${encodeURIComponent(keyId)}`,
    { method: 'DELETE' },
    token
  );
  if (!payload.data) throw new Error('Agent key revoke response is incomplete');
  return payload.data;
}

export async function fetchHeroes(token?: string | null): Promise<HeroHistoryRecord[]> {
  const payload = await requestJson<{ data: HeroHistoryRecord[] }>('/api/me/heroes', { method: 'GET' }, token);
  return Array.isArray(payload.data)
    ? payload.data.map((record) => ({
      ...record,
      hero_payload: normalizeCharacterData(record.hero_payload),
    }))
    : [];
}

export async function fetchBattles(token?: string | null): Promise<BattleHistoryRecord[]> {
  const payload = await requestJson<{ data: BattleHistoryRecord[] }>('/api/me/battles', { method: 'GET' }, token);
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function fetchEconomy(token?: string | null): Promise<EconomySnapshot> {
  const payload = await requestJson<{ data: EconomySnapshot }>('/api/me/economy', { method: 'GET' }, token);
  return payload.data;
}

export async function fetchMarketBoard(token?: string | null): Promise<MarketBoardSnapshot> {
  const payload = await requestJson<{ data: MarketBoardSnapshot }>('/api/market/board', { method: 'GET' }, token);
  return payload.data;
}

export async function fetchDaily(token?: string | null): Promise<DailySnapshot> {
  const payload = await requestJson<{ data: DailySnapshot }>('/api/daily/me', { method: 'GET' }, token);
  return payload.data;
}

export async function claimDailySignIn(token?: string | null): Promise<DailySnapshot> {
  const payload = await requestJson<{ data: DailySnapshot }>(
    '/api/daily/sign-in/claim',
    { method: 'POST' },
    token
  );
  return payload.data;
}

export async function claimDailyTask(taskKey: string, token?: string | null): Promise<DailySnapshot> {
  const payload = await requestJson<{ data: DailySnapshot }>(
    `/api/daily/tasks/${encodeURIComponent(taskKey)}/claim`,
    { method: 'POST' },
    token
  );
  return payload.data;
}

export async function fetchLadder(token?: string | null): Promise<LadderSnapshot> {
  const payload = await requestJson<{ data: LadderSnapshot }>('/api/ladder/me', { method: 'GET' }, token);
  return payload.data;
}

export async function fileToBase64(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

export async function forgeHero(imageFile: File, token?: string | null): Promise<CharacterData> {
  const image = await fileToBase64(imageFile);
  const payload = await requestJson<CharacterData>(
    '/api/forge',
    {
      method: 'POST',
      body: JSON.stringify({ image }),
    },
    token
  );
  return normalizeCharacterData(payload);
}

export async function battleHeroes(heroA: unknown, heroB: unknown, token?: string | null): Promise<BattleResult> {
  return await requestJson<BattleResult>(
    '/api/battle',
    {
      method: 'POST',
      body: JSON.stringify({ heroA, heroB }),
    },
    token
  );
}

export async function battleTeams(
  teamA: unknown[],
  teamB: unknown[],
  size: '1v1' | '3v3' | '4v4' | 'arena_2x3',
  labelA: string,
  labelB: string,
  token?: string | null
): Promise<BattleResult> {
  return await requestJson<BattleResult>(
    '/api/battle/team',
    {
      method: 'POST',
      body: JSON.stringify({ teamA, teamB, size, labelA, labelB }),
    },
    token
  );
}

export async function createBattleSession(
  teamA: unknown[],
  teamB: unknown[],
  battleMode: '1v1' | '4v4' | 'arena_2x3',
  labelA: string,
  labelB: string,
  token?: string | null,
  waitSeconds?: number
): Promise<BattleSessionSnapshot> {
  const payload = await requestJson<{ data: BattleSessionSnapshot }>(
    '/api/battle/sessions',
    {
      method: 'POST',
      body: JSON.stringify({ teamA, teamB, battleMode, labelA, labelB, controlMode: 'rest', waitSeconds }),
    },
    token
  );
  return payload.data;
}

export async function prepareBattleSession(teamA: unknown[], teamB: unknown[], token?: string | null, controlMode: 'program' | 'manual' = 'program'): Promise<BattleSessionSnapshot> {
  const payload = await requestJson<{ data: BattleSessionSnapshot }>('/api/battle/sessions', {
    method: 'POST', body: JSON.stringify({ teamA, teamB, battleMode: 'arena_2x3', controlMode, preparation: true, labelA: 'Forger', labelB: 'Rival' }),
  }, token);
  return payload.data;
}

export async function confirmBattleFormation(sessionId: string, positions: Record<string, number>, token?: string | null): Promise<BattleSessionSnapshot> {
  const payload = await requestJson<{ data: BattleSessionSnapshot }>(`/api/battle/sessions/${encodeURIComponent(sessionId)}/confirm`, {
    method: 'POST', body: JSON.stringify({ positions }),
  }, token);
  return payload.data;
}

export async function fetchBattleSession(sessionId: string, token?: string | null): Promise<BattleSessionSnapshot> {
  const payload = await requestJson<{ data: BattleSessionSnapshot }>(
    `/api/battle/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'GET' },
    token
  );
  return payload.data;
}

export async function submitBattleSessionAction(
  sessionId: string,
  action: BattleSessionAction,
  token?: string | null
): Promise<BattleSessionSnapshot> {
  const payload = await requestJson<{ data: BattleSessionSnapshot }>(
    `/api/battle/sessions/${encodeURIComponent(sessionId)}/actions`,
    {
      method: 'POST',
      body: JSON.stringify({ action }),
    },
    token
  );
  return payload.data;
}

export async function joinPvpQueue(
  heroIds: string[],
  battleMode: '1v1' | '4v4' = '4v4',
  queueKey = 'ranked',
  token?: string | null
): Promise<PvpJoinResponse> {
  return await requestJson<PvpJoinResponse>(
    '/api/pvp/join',
    {
      method: 'POST',
      body: JSON.stringify({ heroIds, battleMode, queueKey }),
    },
    token
  );
}

export async function joinArenaQueue(
  formation: ArenaFormation,
  queueKey = 'ranked',
  token?: string | null
): Promise<PvpJoinResponse> {
  return await requestJson<PvpJoinResponse>(
    '/api/pvp/join',
    {
      method: 'POST',
      body: JSON.stringify({ mode: 'arena_2x3', queueKey, formation }),
    },
    token
  );
}

export async function fetchPvpEntryStatus(entryId: string, token?: string | null): Promise<PvpEntryStatusResponse> {
  return await requestJson<PvpEntryStatusResponse>(
    `/api/pvp/entries/${entryId}`,
    { method: 'GET' },
    token
  );
}

export async function cancelPvpEntry(entryId: string, token?: string | null): Promise<{ ok: true; entry: unknown }> {
  return await requestJson<{ ok: true; entry: unknown }>(
    '/api/pvp/cancel',
    {
      method: 'POST',
      body: JSON.stringify({ entryId }),
    },
    token
  );
}

export async function reviveCard(cardId: string, token?: string | null): Promise<{ ok: true; card: HeroHistoryRecord; economy: EconomySnapshot }> {
  return await requestJson<{ ok: true; card: HeroHistoryRecord; economy: EconomySnapshot }>(
    `/api/cards/${cardId}/revive`,
    { method: 'POST' },
    token
  );
}

export async function equipCardRelic(cardId: string, relicType: string | null, token?: string | null): Promise<{ ok: true; card: HeroHistoryRecord; economy: EconomySnapshot }> {
  return await requestJson<{ ok: true; card: HeroHistoryRecord; economy: EconomySnapshot }>(
    `/api/cards/${cardId}/equip-relic`,
    {
      method: 'POST',
      body: JSON.stringify({ relicType }),
    },
    token
  );
}

export async function enchantCard(cardId: string, relicType: string, token?: string | null): Promise<{ ok: true; card: HeroHistoryRecord; economy: EconomySnapshot }> {
  return await requestJson<{ ok: true; card: HeroHistoryRecord; economy: EconomySnapshot }>(
    `/api/cards/${cardId}/enchant`,
    {
      method: 'POST',
      body: JSON.stringify({ relicType }),
    },
    token
  );
}

export async function washCardEnchant(cardId: string, token?: string | null): Promise<{ ok: true; card: HeroHistoryRecord; economy: EconomySnapshot }> {
  return await requestJson<{ ok: true; card: HeroHistoryRecord; economy: EconomySnapshot }>(
    `/api/cards/${cardId}/wash-enchant`,
    { method: 'POST' },
    token
  );
}

export async function decomposeCard(cardId: string, token?: string | null): Promise<{ ok: true; card: HeroHistoryRecord; dust_returned: number; economy: EconomySnapshot }> {
  return await requestJson<{ ok: true; card: HeroHistoryRecord; dust_returned: number; economy: EconomySnapshot }>(
    `/api/cards/${cardId}/decompose`,
    { method: 'POST' },
    token
  );
}

export async function buyDiamondPack(packId: string, token?: string | null): Promise<{ ok: true; pack: CurrencyDiamondPack; economy: EconomySnapshot }> {
  return await requestJson<{ ok: true; pack: CurrencyDiamondPack; economy: EconomySnapshot }>(
    '/api/market/currency/diamonds',
    { method: 'POST', body: JSON.stringify({ packId }) },
    token
  );
}

export async function buyDustPack(packId: string, token?: string | null): Promise<{ ok: true; pack: CurrencyDustPack; economy: EconomySnapshot }> {
  return await requestJson<{ ok: true; pack: CurrencyDustPack; economy: EconomySnapshot }>(
    '/api/market/currency/dust',
    { method: 'POST', body: JSON.stringify({ packId }) },
    token
  );
}

export async function buyMarketRelic(
  relicType: string,
  quantity: number,
  token?: string | null
): Promise<{ ok: true; trade: { side: 'buy'; relicType: string; quantity: number; unitPrice: number; totalPrice: number }; economy: EconomySnapshot }> {
  return await requestJson<{ ok: true; trade: { side: 'buy'; relicType: string; quantity: number; unitPrice: number; totalPrice: number }; economy: EconomySnapshot }>(
    '/api/market/relics/buy',
    {
      method: 'POST',
      body: JSON.stringify({ relicType, quantity }),
    },
    token
  );
}

export async function sellMarketRelic(
  relicType: string,
  quantity: number,
  token?: string | null
): Promise<{ ok: true; trade: { side: 'sell'; relicType: string; quantity: number; unitPrice: number; totalPrice: number }; economy: EconomySnapshot }> {
  return await requestJson<{ ok: true; trade: { side: 'sell'; relicType: string; quantity: number; unitPrice: number; totalPrice: number }; economy: EconomySnapshot }>(
    '/api/market/relics/sell',
    {
      method: 'POST',
      body: JSON.stringify({ relicType, quantity }),
    },
    token
  );
}

export async function fetchFriends(token?: string | null): Promise<FriendsSnapshot> {
  const payload = await requestJson<{ ok: true; data: FriendsSnapshot }>('/api/friends', {}, token);
  return payload.data;
}

export async function sendFriendRequest(email: string, token?: string | null): Promise<FriendsSnapshot> {
  const payload = await requestJson<{ ok: true; friends: FriendsSnapshot }>(
    '/api/friends/requests',
    { method: 'POST', body: JSON.stringify({ email }) },
    token
  );
  return payload.friends;
}

export async function respondFriendRequest(requestId: string, action: 'accept' | 'decline', token?: string | null): Promise<FriendsSnapshot> {
  const payload = await requestJson<{ ok: true; data: FriendsSnapshot }>(
    `/api/friends/requests/${encodeURIComponent(requestId)}/${action}`,
    { method: 'POST' },
    token
  );
  return payload.data;
}

export async function removeFriend(friendUserId: string, token?: string | null): Promise<FriendsSnapshot> {
  const payload = await requestJson<{ ok: true; data: FriendsSnapshot }>(
    `/api/friends/${encodeURIComponent(friendUserId)}`,
    { method: 'DELETE' },
    token
  );
  return payload.data;
}

export async function createFriendChallenge(friendUserId: string, formation: ArenaFormation, token?: string | null): Promise<FriendsSnapshot> {
  const payload = await requestJson<{ ok: true; friends: FriendsSnapshot }>(
    `/api/friends/${encodeURIComponent(friendUserId)}/challenges`,
    { method: 'POST', body: JSON.stringify({ formation }) },
    token
  );
  return payload.friends;
}

export async function respondFriendChallenge(
  challengeId: string,
  action: 'accept' | 'decline' | 'cancel',
  formation: ArenaFormation | null,
  token?: string | null
): Promise<{ snapshot?: FriendsSnapshot; challenge?: FriendChallengeRecord; battle?: BattleResult | null; battle_session?: BattleSessionSnapshot | null }> {
  const payload = await requestJson<{ ok: true; data: FriendsSnapshot | FriendChallengeRecord; battle?: BattleResult | null; battle_session?: BattleSessionSnapshot | null }>(
    `/api/friend-challenges/${encodeURIComponent(challengeId)}/${action}`,
    { method: 'POST', body: JSON.stringify(formation ? { formation } : {}) },
    token
  );
  if (action === 'accept') return { challenge: payload.data as FriendChallengeRecord, battle: payload.battle ?? null, battle_session: payload.battle_session };
  return { snapshot: payload.data as FriendsSnapshot };
}

export function stableHeroKey(hero: CharacterData) {
  return `${hero.name}-${hero.BP}-${hero.state.TYPE}`;
}

export function sanitizeJsonValue(value: JsonValue): JsonValue {
  return value;
}
