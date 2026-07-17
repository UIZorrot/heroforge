export type AppMode = 'mock' | 'live';

const configuredMode = String(import.meta.env.VITE_APP_MODE || 'live').trim().toLowerCase();

// Live is the safe default so an omitted or invalid deployment variable cannot enable mock content.
export const APP_MODE: AppMode = configuredMode === 'mock' ? 'mock' : 'live';
export const IS_MOCK_MODE = APP_MODE === 'mock';
export const STORAGE_NAMESPACE = `hf.${APP_MODE}`;
