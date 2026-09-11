export type AppMode = 'mock' | 'live';

const configuredMode = String(import.meta.env.VITE_APP_MODE || 'live').trim().toLowerCase();

// Live is the safe default so an omitted or invalid deployment variable cannot enable mock content.
export const APP_MODE: AppMode = configuredMode === 'mock' ? 'mock' : 'live';
export const IS_MOCK_MODE = APP_MODE === 'mock';
export const STORAGE_NAMESPACE = `hf.${APP_MODE}`;

// Mock persistence is intentionally explicit. Live code must never derive or
// consume these keys, even when it shares the same browser profile.
export const MOCK_STORAGE_KEYS = {
  sandbox: 'hf.mock.sandbox.v1',
  daily: 'hf.mock.daily.v1',
  friends: 'hf.mock.friends.v1',
} as const;
