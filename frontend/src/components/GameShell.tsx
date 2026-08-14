import type { ReactNode } from 'react';
import { ChevronDown, Gem, Home, Landmark, Settings, Shield, Sparkles, Swords, User, WalletCards, Zap } from 'lucide-react';
import { AppLogo } from './AppLogo';
import type { AuthUser } from '../types';
import { IS_MOCK_MODE } from '../lib/runtimeMode';

export type GameSectionKey = 'home' | 'forge' | 'vault' | 'arena' | 'vfx' | 'chronicle' | 'market' | 'settings';
export type ArenaSideKey = 'queue' | 'train' | 'battle';
export type HomeSideKey = 'welcome' | 'profile';
export type ForgeSideKey = 'create' | 'enchant' | 'break';

type NavItem = {
  key: GameSectionKey;
  label: string;
};

type SideItem = {
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  key?: ArenaSideKey | HomeSideKey | ForgeSideKey;
};

type GameShellProps = {
  activeSection: GameSectionKey;
  onNavigate: (section: GameSectionKey) => void;
  user: AuthUser | null;
  dustBalance: number;
  relicBalance: number;
  homeTab?: HomeSideKey;
  forgeTab?: ForgeSideKey;
  arenaTab?: ArenaSideKey;
  arenaLocked?: boolean;
  onHomeTabChange?: (tab: HomeSideKey) => void;
  onForgeTabChange?: (tab: ForgeSideKey) => void;
  onArenaTabChange?: (tab: ArenaSideKey) => void;
  onOpenAuth?: () => void;
  onOpenSettings?: () => void;
  children: ReactNode;
};

const navItems: NavItem[] = [
  { key: 'home', label: 'Home' },
  { key: 'forge', label: 'Forge' },
  { key: 'vault', label: 'Vault' },
  { key: 'arena', label: 'Arena' },
  ...(IS_MOCK_MODE ? [{ key: 'vfx' as const, label: 'VFX' }] : []),

  { key: 'chronicle', label: 'Chronicle' },
  { key: 'market', label: 'Market' },
];

const sideItemsBySection: Record<GameSectionKey, SideItem[]> = {
  home: [],
  forge: [
    { key: 'create', label: 'Create', icon: <Gem size={20} /> },
    { key: 'enchant', label: 'Enchant', icon: <Sparkles size={20} /> },
    { key: 'break', label: 'Break', icon: <Landmark size={20} /> },
  ],
  vault: [
    { label: 'Overview', icon: <WalletCards size={20} />, active: true },
    { label: 'Card', icon: <Gem size={20} /> },
    { label: 'Relic', icon: <Sparkles size={20} /> },
  ],
  arena: [],
  vfx: [
    { label: 'Matrix', icon: <Sparkles size={20} />, active: true },
    { label: 'Projectile', icon: <Zap size={20} /> },
    { label: 'Impact', icon: <Swords size={20} /> },
  ],
  chronicle: [
    { label: 'Runs', icon: <Landmark size={20} />, active: true },
    { label: 'Bosses', icon: <Shield size={20} /> },
  ],
  market: [
    { label: 'Market', icon: <Gem size={20} />, active: true },
    { label: 'Orders', icon: <WalletCards size={20} /> },
  ],
  settings: [],
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(value || 0)));
}

function userLabel(user: AuthUser | null) {
  if (!user) return 'Guest';
  return user.email?.split('@')[0] || 'Forger';
}

export function GameShell({
  activeSection,
  onNavigate,
  user,
  dustBalance,
  relicBalance,
  homeTab = 'welcome',
  forgeTab = 'create',
  arenaTab = 'queue',
  arenaLocked = false,
  onHomeTabChange,
  onForgeTabChange,
  onArenaTabChange,
  onOpenAuth,
  onOpenSettings,
  children,
}: GameShellProps) {
  const sideItems: SideItem[] =
    activeSection === 'home'
      ? [
        { key: 'welcome' as const, label: 'Welcome', icon: <Home size={20} />, active: homeTab === 'welcome' },
        { key: 'profile' as const, label: 'Profile', icon: <User size={20} />, active: Boolean(user && homeTab === 'profile'), disabled: !user },
      ]
      : activeSection === 'forge'
      ? sideItemsBySection.forge.map((item) => ({ ...item, active: item.key === forgeTab }))
      : activeSection === 'arena'
      ? [
        { key: 'queue' as const, label: 'Queue', icon: <Swords size={20} />, active: arenaTab === 'queue', disabled: arenaLocked },
        { key: 'train' as const, label: 'Train', icon: <Shield size={20} />, active: arenaTab === 'train', disabled: arenaLocked },
        { key: 'battle' as const, label: 'Battle', icon: <Landmark size={20} />, active: arenaTab === 'battle' },
      ]
      : sideItemsBySection[activeSection];

  return (
    <div className="min-h-screen bg-[#070707] text-stone-200">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_28%_12%,rgba(180,150,100,0.11),transparent_28%),radial-gradient(circle_at_72%_18%,rgba(40,45,55,0.18),transparent_24%),linear-gradient(180deg,#080808_0%,#050505_100%)]" />
      <header className="fixed left-0 right-0 top-0 z-40 h-[74px] border-b border-white/8 bg-[#080808]/92 backdrop-blur-xl">
        <div className="grid h-full grid-cols-[88px_1fr_auto] items-center">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="flex h-full items-center justify-center border-r border-white/8 text-white transition-colors hover:bg-white/[0.03]"
            aria-label="Home"
          >
            <AppLogo showText={false} iconClassName="h-9 w-9" />
          </button>

          <nav className="flex h-full items-center justify-center gap-10">
            {navItems.map((item) => {
              const active = item.key === activeSection;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onNavigate(item.key)}
                  className={`relative h-full px-1 text-[11px] font-semibold uppercase tracking-[0.32em] transition-colors ${
                    active ? 'text-stone-100' : 'text-stone-500 hover:text-stone-300'
                  }`}
                >
                  {item.label}
                  {active && <span className="absolute inset-x-2 bottom-0 h-px bg-[#b49664]" />}
                </button>
              );
            })}
          </nav>

          <div className="flex h-full items-center border-l border-white/8">
            <div className="flex h-full items-center gap-5 border-r border-white/8 px-6">
              <div className="flex items-center gap-2 text-sm text-stone-200">
                <Gem size={16} className="text-stone-300" />
                <span>{formatNumber(relicBalance)}</span>
                <button type="button" className="text-stone-500 hover:text-stone-200" aria-label="Add relics">
                  +
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm text-stone-200">
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-stone-500 text-[9px]">D</span>
                <span>{formatNumber(dustBalance)}</span>
                <button type="button" className="text-stone-500 hover:text-stone-200" aria-label="Add dust">
                  +
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!user) {
                  onOpenAuth?.();
                  return;
                }
                onNavigate('home');
                onHomeTabChange?.('profile');
              }}
              className="flex h-full items-center gap-3 px-5 text-left transition-colors hover:bg-white/[0.03]"
            >
              <div className="h-11 w-11 overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_50%_22%,rgba(180,150,100,0.35),rgba(0,0,0,0.9)_68%)]">
                <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.2em] text-stone-300">
                  {user ? userLabel(user).slice(0, 2) : 'HF'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-400">
                  {user ? userLabel(user) : 'Sign In'}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  {user ? 'Lv. 12' : 'Join now'}
                </div>
              </div>
              <ChevronDown size={14} className="text-stone-500" />
            </button>
          </div>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-[74px] z-30 flex w-[88px] flex-col border-r border-white/8 bg-[#080808]/92">
        <div className="flex flex-1 flex-col items-center gap-4 py-7">
          {sideItems.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (activeSection === 'home' && item.key && onHomeTabChange) {
                  onHomeTabChange(item.key as HomeSideKey);
                }
                if (activeSection === 'forge' && item.key && onForgeTabChange) {
                  onForgeTabChange(item.key as ForgeSideKey);
                }
                if (activeSection === 'arena' && item.key && onArenaTabChange) {
                  onArenaTabChange(item.key as ArenaSideKey);
                }
              }}
              className={`flex w-full flex-col items-center gap-2 border-l-2 py-4 text-[9px] font-semibold uppercase tracking-[0.14em] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                item.active
                  ? 'border-[#b49664] bg-[#b49664]/8 text-stone-100'
                  : 'border-transparent text-stone-500 hover:bg-white/[0.03] hover:text-stone-300'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className={`flex w-full flex-col items-center gap-2 border-l-2 py-5 text-[9px] font-semibold uppercase tracking-[0.14em] transition-colors hover:bg-white/[0.03] hover:text-stone-300 ${
            activeSection === 'settings' ? 'border-[#b49664] bg-[#b49664]/8 text-stone-100' : 'border-transparent text-stone-500'
          }`}
        >
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </aside>

      <main className="min-h-screen pl-[88px] pt-[74px]">
        {children}
      </main>
    </div>
  );
}
