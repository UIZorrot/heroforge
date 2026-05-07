import type {
  AuthUser,
  BattleHistoryRecord,
  BattleResult,
  DailySnapshot,
  EconomySnapshot,
  ArenaFormation,
  CharacterData,
  HeroHistoryRecord,
  LoginCodeResponse,
  PvpEntryStatusResponse,
  PvpJoinResponse,
  SessionSnapshot,
  VerifyLoginResponse,
} from '../types';
import { normalizeCharacterData } from './gameLogic';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5544').replace(/\/$/, '');
const TOKEN_KEY = 'hf.session.token';
const EMAIL_KEY = 'hf.session.email';
const EXPIRES_KEY = 'hf.session.expires_at';

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

export async function forgeHero(imageFile: File, materials: Record<string, number> = {}, token?: string | null): Promise<CharacterData> {
  const image = await fileToBase64(imageFile);
  const payload = await requestJson<CharacterData>(
    '/api/forge',
    {
      method: 'POST',
      body: JSON.stringify({ image, materials }),
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
  size: '1v1' | '3v3' | '4v4',
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

export function stableHeroKey(hero: CharacterData) {
  return `${hero.name}-${hero.BP}-${hero.state.TYPE}`;
}

export function sanitizeJsonValue(value: JsonValue): JsonValue {
  return value;
}
