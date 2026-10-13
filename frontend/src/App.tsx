import React, { useEffect, useState } from 'react';
import { ArrowRight, Mail, RefreshCw, Send, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameShell, type ArenaSideKey, type ForgeSideKey, type GameSectionKey, type HomeSideKey, type VaultSideKey } from './components/GameShell';
import { VaultPage } from './components/VaultPage';
import { ForgePage } from './components/ForgePage';
import { ArenaPage } from './components/ArenaPage';
import { PvePage } from './components/PvePage';
import { VfxTestPage } from './components/VfxTestPage';
import { MarketPage } from './components/MarketPage';
import { SettingsPage } from './components/SettingsPage';
import { HomeExperience } from './components/HomeExperience';
import { PlayerProfile } from './components/PlayerProfile';
import { DailyActivity } from './components/DailyActivity';
import { SectionHeader } from './components/Effects';
import {
  clearStoredSession,
  decomposeCard,
  enchantCard,
  equipCardRelic,
  fetchBattles,
  fetchCurrentUser,
  fetchEconomy,
  fetchFriends,
  fetchHeroes,
  fetchLadder,
  forgeHero,
  getStoredSession,
  getStoredToken,
  requestLoginCode,
  setStoredSession,
  verifyLoginCode,
  washCardEnchant,
} from './lib/api';
import { normalizeCharacterData, type CharacterData, type Rarity } from './lib/gameLogic';
import { createMockEconomy, createMockHeroes, mockEconomy, mockHeroes, mockRelicCatalog } from './lib/mockContent';
import { IS_MOCK_MODE, MOCK_STORAGE_KEYS } from './lib/runtimeMode';
import type { AuthUser, BattleHistoryRecord, EconomySnapshot, HeroHistoryRecord, LadderSnapshot, SavedHero } from './types';

type VaultSort = 'date' | 'bp' | 'name';

const LOGIN_RESEND_SECONDS = 60;
const MOCK_SANDBOX_KEY = MOCK_STORAGE_KEYS.sandbox;

function createMockSession() {
  return { token: 'mock-token', email: 'forger@example.com', expiresAt: new Date(Date.now() + 86400000).toISOString() };
}

type MockSandbox = {
  heroes: SavedHero[];
  economy: EconomySnapshot;
};

function readMockSandbox(): MockSandbox | null {
  try {
    const raw = localStorage.getItem(MOCK_SANDBOX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MockSandbox>;
    if (!Array.isArray(parsed.heroes) || !parsed.economy?.wallet || !Array.isArray(parsed.economy.relics)) return null;
    const baseline = createMockEconomy();
    const storedRelics = new Map(parsed.economy.relics.map((relic) => [relic.relic_type, relic]));
    return {
      heroes: parsed.heroes,
      economy: {
        ...baseline,
        ...parsed.economy,
        wallet: {
          ...baseline.wallet!,
          ...parsed.economy.wallet,
          dust_balance: Math.max(baseline.wallet!.dust_balance, parsed.economy.wallet.dust_balance),
        },
        relics: baseline.relics.map((relic) => {
          const stored = storedRelics.get(relic.relic_type);
          return stored ? { ...relic, ...stored, amount: Math.max(relic.amount, stored.amount) } : relic;
        }),
      },
    };
  } catch {
    return null;
  }
}

function createForgedMockHero(image: string): SavedHero {
  const index = Date.now() % 4;
  const variants = [
    { name: 'Cinder Warden', type: 'fire guardian', bp: 5420, hp: 2860, mp: 620, atk: 342, def: 62, speed: 76, effect: 'fire', skill: 'Cinder Verdict' },
    { name: 'Veil Seeker', type: 'void assassin', bp: 5180, hp: 2110, mp: 780, atk: 368, def: 34, speed: 122, effect: 'void', skill: 'Nightfall Needle' },
    { name: 'Storm Cantor', type: 'storm mage', bp: 4960, hp: 1940, mp: 980, atk: 326, def: 30, speed: 108, effect: 'storm', skill: 'Choir of Thunder' },
    { name: 'Oathbreaker', type: 'steel warrior', bp: 5640, hp: 3140, mp: 540, atk: 354, def: 68, speed: 70, effect: 'weapon', skill: 'Iron Eclipse' },
  ] as const;
  const variant = variants[index];
  const now = Date.now();
  const character: CharacterData = {
    name: `${variant.name} ${String(now).slice(-3)}`,
    description: 'A locally forged sandbox card. Its actions, skills, enchantments, and Arena behavior can be tested without a live service.',
    BP: String(variant.bp),
    rarity: 'rare',
    template: variant.type,
    state: {
      HP: String(variant.hp), MP: String(variant.mp), ATK: String(variant.atk), DEF: String(variant.def),
      CC: '18', SPEED: String(variant.speed), CA: '14', PI: '12', EV: '10', AC: '12', TYPE: variant.type,
      type_catalog: 'instant', type_effect: variant.effect,
    },
    skill: {
      s1: { name: variant.skill, description: 'A primary sandbox combat skill.', TYPE: variant.effect, TARGET: 'Enemy', TARGET_NUM: '1', RANGE: 'enemy', ROLE: 'attack', type_catalog: 'instant', type_effect: variant.effect, DMG: '108', MP_COST: '28' },
      s2: { name: 'Forge Resonance', description: 'A self-protecting secondary sandbox skill.', TYPE: 'buff', TARGET: 'Self', TARGET_NUM: '1', RANGE: 'self', ROLE: 'buff', type_catalog: 'instant', type_effect: variant.effect, BUFF_NAME: 'guard', BUFF_TIME: '2', BUFF_DEF: '18', MP_COST: '22' },
    },
  };
  return {
    id: `mock-forged-${now}-${Math.floor(Math.random() * 10000)}`,
    createdAt: now,
    image,
    character,
    equippedRelicId: null,
    enchantment: null,
    pvpLifeState: 'active',
    pveLifeState: 'active',
    cardStatus: 'active',
  };
}

function dustBalance(economy: EconomySnapshot | null) {
  return economy?.wallet?.dust_balance ?? economy?.starter.dust_balance ?? 0;
}

function relicBalance(economy: EconomySnapshot | null) {
  return economy?.relics.reduce((sum, relic) => sum + relic.amount, 0) ?? 0;
}

function normalizeHeroEnchantment(enchantment: HeroHistoryRecord['enchantment']): SavedHero['enchantment'] {
  if (!enchantment) return null;
  const relicId = enchantment.relicId ?? enchantment.relicType ?? '';
  if (!relicId) return null;
  return {
    relicId,
    relicName: enchantment.relicName ?? enchantment.relicNameLegacy ?? relicId,
    effectProfile: enchantment.effectProfile ?? enchantment.effect_profile,
    appliedAt: enchantment.appliedAt ?? enchantment.applied_at ?? '',
    removedAt: enchantment.removedAt ?? enchantment.removed_at ?? null,
  };
}

function heroImageFromSourcePayload(sourcePayload: unknown): string | undefined {
  if (!sourcePayload || typeof sourcePayload !== 'object') return undefined;
  const imageUrl = (sourcePayload as Record<string, unknown>).image_url;
  return typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl : undefined;
}

function heroRecordToSavedHero(record: HeroHistoryRecord): SavedHero {
  return {
    id: record.id,
    createdAt: new Date(record.created_at).getTime() || Date.now(),
    image: heroImageFromSourcePayload(record.source_payload),
    character: normalizeCharacterData(record.hero_payload),
    equippedRelicId: record.equipped_relic_type ?? null,
    enchantment: normalizeHeroEnchantment(record.enchantment),
    pvpLifeState: record.pvp_life_state,
    pveLifeState: record.pve_life_state,
    cardStatus: record.card_status,
    lockedReason: record.locked_reason,
    pvpDeadAt: record.pvp_dead_at,
    decomposedAt: record.decomposed_at,
    activePvpEntryId: record.active_pvp_entry_id,
  };
}

function AuthPanel({
  email,
  code,
  codeSent,
  sending,
  verifying,
  cooldown,
  authError,
  authMessage,
  showMockLogin,
  onEmailChange,
  onCodeChange,
  onRequestCode,
  onVerifyCode,
  onMockLogin,
}: {
  email: string;
  code: string;
  codeSent: boolean;
  sending: boolean;
  verifying: boolean;
  cooldown: number;
  authError: string;
  authMessage: string;
  showMockLogin: boolean;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onRequestCode: () => void;
  onVerifyCode: () => void;
  onMockLogin: () => void;
}) {
  return (
    <div className="border border-white/10 bg-[#0a0a0a]/88 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
      <SectionHeader eyebrow="Access" title="Sign in with email" description="We will send a one-time code to your inbox." />
      <div className="mt-6 space-y-4">
        <label className="block space-y-2">
          <span className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Email</span>
          <div className="flex items-center gap-3 border border-white/10 bg-black/45 px-4 py-3 focus-within:border-[#b49664]/50">
            <Mail size={16} className="text-stone-500" />
            <input
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              type="email"
              placeholder="forger@example.com"
              className="w-full bg-transparent text-sm text-stone-100 outline-none placeholder:text-stone-600"
            />
          </div>
        </label>
        <button
          type="button"
          onClick={onRequestCode}
          disabled={sending || cooldown > 0 || !email.trim()}
          className="inline-flex w-full items-center justify-center gap-2 bg-[#806838] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-100 transition hover:bg-[#9a7d4a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
          {cooldown > 0 ? `Resend in ${cooldown}s` : codeSent ? 'Resend code' : 'Send code'}
        </button>
        {codeSent && (
          <label className="block space-y-2">
            <span className="text-[10px] uppercase tracking-[0.28em] text-stone-500">One-time code</span>
            <div className="flex items-center gap-3 border border-white/10 bg-black/45 px-4 py-3 focus-within:border-[#b49664]/50">
              <Sparkles size={16} className="text-stone-500" />
              <input
                value={code}
                onChange={(event) => onCodeChange(event.target.value)}
                inputMode="numeric"
                maxLength={6}
                className="w-full bg-transparent text-sm tracking-[0.35em] text-stone-100 outline-none placeholder:text-stone-600"
              />
            </div>
          </label>
        )}
        {codeSent && (
          <button
            type="button"
            onClick={onVerifyCode}
            disabled={verifying || !code.trim()}
            className="inline-flex w-full items-center justify-center gap-2 border border-white/10 bg-black/45 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-200 transition hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifying ? <RefreshCw size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            Verify code
          </button>
        )}
        <AnimatePresence mode="wait">
          {(authError || authMessage) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`border px-4 py-3 text-sm ${
                authError
                  ? 'border-amber-400/20 bg-amber-400/10 text-amber-100'
                  : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
              }`}
            >
              {authError || authMessage}
            </motion.div>
          )}
        </AnimatePresence>
        {showMockLogin && (
          <button
            type="button"
            onClick={onMockLogin}
            className="w-full border border-white/10 px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-stone-500 transition hover:border-stone-600 hover:text-stone-200"
          >
            Open Preview Mode
          </button>
        )}
      </div>
    </div>
  );
}

function AuthModal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 px-5 py-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close sign in"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-[430px]"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute -right-3 -top-3 z-10 flex h-9 w-9 items-center justify-center border border-white/10 bg-[#090909] text-stone-500 transition hover:border-stone-500 hover:text-stone-200"
              aria-label="Close sign in"
            >
              <X size={16} />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HomePage({
  user,
  activeTab,
  heroes,
  onInspectHero,
  dust,
  relics,
  economy,
  token,
  onNavigate,
  onEconomyChange,
  onOpenAuth,
  onOpenFriends,
  onOpenBattleReplay,
  previewContentEnabled,
}: {
  user: AuthUser | null;
  activeTab: HomeSideKey;
  heroCount: number;
  heroes: SavedHero[];
  onInspectHero: (id: string) => void;
  bestHeroBp: number | null;
  dust: number;
  relics: number;
  economy: EconomySnapshot | null;
  token?: string | null;
  onNavigate: (section: GameSectionKey) => void;
  onEconomyChange: (economy: EconomySnapshot) => void;
  onOpenAuth: () => void;
  onOpenFriends: () => void;
  onOpenBattleReplay: (record: BattleHistoryRecord) => void;
  previewContentEnabled: boolean;
}) {
  const dailyToken = token && token !== 'mock-token' ? token : null;
  const [loadedBattleHistory, setLoadedBattleHistory] = useState<BattleHistoryRecord[] | null>(null);
  const [ladder, setLadder] = useState<LadderSnapshot | null>(null);
  const [battleHistoryError, setBattleHistoryError] = useState<string | null>(null);
  const [ladderError, setLadderError] = useState<string | null>(null);
  const [profileLoadNonce, setProfileLoadNonce] = useState(0);
  const battleHistory = dailyToken ? loadedBattleHistory : [];

  useEffect(() => {
    if (activeTab !== 'profile') return;
    if (!dailyToken) return;
    let cancelled = false;
    fetchBattles(dailyToken)
      .then((records) => {
        if (!cancelled) {
          setLoadedBattleHistory(records);
          setBattleHistoryError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedBattleHistory([]);
          setBattleHistoryError('Combat history is temporarily unavailable.');
        }
      });
    fetchLadder(dailyToken)
      .then((snapshot) => {
        if (!cancelled) {
          setLadder(snapshot);
          setLadderError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLadder(null);
          setLadderError('Ladder data is temporarily unavailable.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, dailyToken, profileLoadNonce]);
  const retryProfile = () => {
    setLoadedBattleHistory(null);
    setBattleHistoryError(null);
    setLadder(null);
    setLadderError(null);
    setProfileLoadNonce((value) => value + 1);
  };
  const playerName = user?.email?.split('@')[0] || 'Visitor';

  if (!user) {
    return <HomeExperience onJoin={onOpenAuth} onNavigate={onNavigate} onInspect={onInspectHero} onFriends={onOpenFriends} />;
  }

  if (activeTab === 'profile') {
    return <PlayerProfile user={user} heroes={heroes} dust={dust} relics={relics} economy={economy}
      ladder={ladder} history={battleHistory} historyError={battleHistoryError} ladderError={ladderError}
      demo={previewContentEnabled} retry={retryProfile} onNavigate={onNavigate}
      onInspect={onInspectHero} onReplay={onOpenBattleReplay} />;
  }

  return <HomeExperience playerName={playerName} heroes={heroes} dust={dust} relics={relics}
    onJoin={onOpenAuth} onNavigate={onNavigate} onInspect={onInspectHero} onFriends={onOpenFriends}
    daily={<DailyActivity token={dailyToken} demoMode={previewContentEnabled} economy={economy} onEconomyChange={onEconomyChange} />} />;
}

function AccessRequired({ onOpenAuth }: { onOpenAuth: () => void }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-74px)] max-w-[1540px] items-center justify-center px-8 py-10">
      <div className="w-full max-w-3xl">
        <div className="flex flex-col justify-center border border-white/8 bg-black/20 p-10 text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#b49664]">Access required</div>
          <h2 className="mt-4 font-display text-5xl font-light uppercase tracking-[0.18em] text-stone-100">Sign in to use this module</h2>
          <p className="mt-5 text-sm leading-7 text-stone-500">
            Home remains open as the game introduction. Forge, Vault, Arena, Chronicle, and Market require a player session.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="mx-auto mt-8 bg-[#806838] px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-100 transition hover:bg-[#9a7d4a]"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
}

const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<GameSectionKey>('home');
  const [homeTab, setHomeTab] = useState<HomeSideKey>('welcome');
  const [forgeTab, setForgeTab] = useState<ForgeSideKey>('create');
  const [arenaTab, setArenaTab] = useState<ArenaSideKey>('queue');
  const [arenaLocked, setArenaLocked] = useState(false);
  const [vaultTab, setVaultTab] = useState<VaultSideKey>('card');
  const [replayRecord, setReplayRecord] = useState<BattleHistoryRecord | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(getStoredSession());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [email, setEmail] = useState(session?.email || '');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [economy, setEconomy] = useState<EconomySnapshot | null>(null);
  const [savedHeroes, setSavedHeroes] = useState<SavedHero[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [character, setCharacter] = useState<CharacterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedVaultId, setSelectedVaultId] = useState('');
  const [vaultSort, setVaultSort] = useState<VaultSort>('bp');
  const [vaultQuery, setVaultQuery] = useState('');
  const [vaultRarityFilter, setVaultRarityFilter] = useState<Rarity | 'all'>('all');
  const [friendAlertCount, setFriendAlertCount] = useState(0);

  const reloadCollections = async (tokenArg?: string | null) => {
    const token = tokenArg ?? session?.token ?? getStoredToken();
    if (!token || token === 'mock-token') return [];
    try {
      const heroRecords = await fetchHeroes(token);
      const heroes = heroRecords
        .filter((record) => record.card_status !== 'decomposed')
        .map(heroRecordToSavedHero);
      setSavedHeroes(heroes);
      try {
        setEconomy(await fetchEconomy(token));
      } catch {
        setEconomy(null);
      }
      return heroes;
    } catch {
      return [];
    }
  };

  useEffect(() => {
    const boot = async () => {
      if (IS_MOCK_MODE) {
        const mockSession = createMockSession();
        const sandbox = readMockSandbox() ?? { heroes: createMockHeroes(), economy: createMockEconomy() };
        setSession(mockSession);
        setUser({ id: 'mock-user', email: mockSession.email, expires_at: mockSession.expiresAt });
        setEmail(mockSession.email);
        setEconomy(sandbox.economy);
        setSavedHeroes(sandbox.heroes);
        setBooting(false);
        return;
      }

      const stored = getStoredSession();
      if (!stored) {
        setBooting(false);
        return;
      }
      try {
        const me = await fetchCurrentUser(stored.token);
        if (me) {
          setSession(stored);
          setUser(me);
          setEmail(stored.email);
          await reloadCollections(stored.token);
        } else {
          clearStoredSession();
          setSession(null);
        }
      } catch {
        clearStoredSession();
        setSession(null);
      } finally {
        setBooting(false);
      }
    };
    void boot();
  }, []);

  useEffect(() => {
    if (!IS_MOCK_MODE || !economy) return;
    try {
      localStorage.setItem(MOCK_SANDBOX_KEY, JSON.stringify({ heroes: savedHeroes, economy } satisfies MockSandbox));
    } catch {
      // Sandbox persistence is best-effort; the active testing session remains usable.
    }
  }, [economy, savedHeroes]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refreshFriendAlerts = async () => {
      try {
        if (IS_MOCK_MODE) {
          const raw = window.localStorage.getItem(MOCK_STORAGE_KEYS.friends);
          const snapshot = raw ? JSON.parse(raw) : null;
          const incomingRequests = Array.isArray(snapshot?.incoming_requests) ? snapshot.incoming_requests.length : 1;
          const incomingChallenges = Array.isArray(snapshot?.incoming_challenges)
            ? snapshot.incoming_challenges.filter((item: { status?: string }) => item.status === 'pending' || item.status === 'accepted').length
            : 1;
          if (!cancelled) setFriendAlertCount(incomingRequests + incomingChallenges);
          return;
        }
        const currentToken = session?.token ?? getStoredToken();
        if (!currentToken || currentToken === 'mock-token') return;
        const snapshot = await fetchFriends(currentToken);
        if (!cancelled) {
          setFriendAlertCount(
            snapshot.incoming_requests.length
            + snapshot.incoming_challenges.filter((item) => item.status === 'pending' || item.status === 'accepted').length,
          );
        }
      } catch {
        // Friend alerts are non-blocking; the Friends page exposes a retryable error state.
      }
    };
    void refreshFriendAlerts();
    const interval = window.setInterval(() => void refreshFriendAlerts(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session?.token, user]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [activeSection]);

  const authPanel = (
    <AuthPanel
      email={email}
      code={code}
      codeSent={codeSent}
      sending={sending}
      verifying={verifying}
      cooldown={cooldown}
      authError={authError}
      authMessage={authMessage}
      showMockLogin={IS_MOCK_MODE}
      onEmailChange={setEmail}
      onCodeChange={setCode}
      onRequestCode={async () => {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) {
          setAuthError('Enter email.');
          return;
        }
        setSending(true);
        setAuthError('');
        setAuthMessage('');
        try {
          await requestLoginCode(cleanEmail);
          setCodeSent(true);
          setCooldown(LOGIN_RESEND_SECONDS);
          setAuthMessage('Code sent.');
        } catch (requestError: unknown) {
          setAuthError(requestError instanceof Error ? requestError.message : 'Failed to request login code.');
        } finally {
          setSending(false);
        }
      }}
      onVerifyCode={async () => {
        const cleanEmail = email.trim().toLowerCase();
        const cleanCode = code.trim();
        if (!cleanEmail || !cleanCode) {
          setAuthError('Enter both.');
          return;
        }
        setVerifying(true);
        setAuthError('');
        setAuthMessage('');
        try {
          const result = await verifyLoginCode(cleanEmail, cleanCode);
          const nextSession = { token: result.token, email: result.user.email, expiresAt: result.expires_at };
          setStoredSession(nextSession);
          setSession(nextSession);
          setUser(result.user);
          setCode('');
          setCodeSent(false);
          setCooldown(0);
          setAuthOpen(false);
          setActiveSection('home');
          await reloadCollections(result.token);
        } catch (verifyError: unknown) {
          setAuthError(verifyError instanceof Error ? verifyError.message : 'Failed to verify login code.');
        } finally {
          setVerifying(false);
        }
      }}
      onMockLogin={() => {
        if (!IS_MOCK_MODE) return;
        const mockSession = createMockSession();
        setStoredSession(mockSession);
        setSession(mockSession);
        setUser({ id: 'mock-user', email: mockSession.email, expires_at: mockSession.expiresAt });
        setEmail(mockSession.email);
        setEconomy(mockEconomy);
        setSavedHeroes(mockHeroes);
        setAuthOpen(false);
        setActiveSection('vault');
      }}
    />
  );

  const isAuthenticated = Boolean(user);
  const demoMode = IS_MOCK_MODE;
  const bestHeroBp = savedHeroes.length
    ? Math.max(...savedHeroes.map((hero) => Number.parseInt(String(hero.character.BP), 10) || 0))
    : null;
  const handleNavigate = (section: GameSectionKey) => {
    if (section === 'home') setHomeTab('welcome');
    if (section === 'forge') setForgeTab('create');
    if (section !== 'arena') setReplayRecord(null);
    setActiveSection(section);
  };
  const handleOpenBattleReplay = (record: BattleHistoryRecord) => {
    setReplayRecord(record);
    setArenaTab('battle');
    setActiveSection('arena');
  };
  const handleCloseBattleReplay = () => {
    setReplayRecord(null);
    setActiveSection('home');
    setHomeTab('profile');
  };
  const handleImageSelect = async (file: File) => {
    setLoading(true);
    setCharacter(null);
    setError(null);

    try {
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('This image could not be read. Choose another image.'));
        reader.onabort = () => reject(new Error('Image loading was interrupted. Please try again.'));
        reader.readAsDataURL(file);
      });
      setImage(base64Image);
      const token = session?.token ?? getStoredToken();
      if (IS_MOCK_MODE) {
        const forgeCost = economy?.costs.forge ?? mockEconomy.costs.forge;
        const currentDust = economy?.wallet?.dust_balance ?? mockEconomy.wallet?.dust_balance ?? 0;
        if (currentDust < forgeCost) throw new Error(`Need ${forgeCost} Dust to forge this card.`);
        const forgedHero = createForgedMockHero(base64Image);
        const timestamp = new Date().toISOString();
        setCharacter(forgedHero.character);
        setSavedHeroes((current) => [forgedHero, ...current]);
        setEconomy((current) => {
          const base = current ?? createMockEconomy();
          const nextDust = Math.max(0, (base.wallet?.dust_balance ?? 0) - forgeCost);
          return {
            ...base,
            wallet: base.wallet ? { ...base.wallet, dust_balance: nextDust, updated_at: timestamp } : base.wallet,
            transactions: [{
              id: `mock-forge-${Date.now()}`,
              resource_type: 'dust',
              delta: -forgeCost,
              balance_after: nextDust,
              reason: 'forge_card',
              ref_type: 'hero',
              metadata: { hero_id: forgedHero.id },
              created_at: timestamp,
            }, ...base.transactions],
          };
        });
        return;
      }
      if (!token || token === 'mock-token') throw new Error('Login with a real session to forge cards.');
      const heroData = await forgeHero(file, token);
      const normalizedHero = normalizeCharacterData(heroData);
      setCharacter(normalizedHero);
      const refreshedHeroes = await reloadCollections(token);
      const forgedHeroId = normalizedHero.hero_id ?? refreshedHeroes.find((hero) => hero.character.name === normalizedHero.name)?.id ?? refreshedHeroes[0]?.id;
      if (forgedHeroId) {
        setSavedHeroes((current) => current.map((hero) => (
          hero.id === forgedHeroId ? { ...hero, image: base64Image } : hero
        )));
      }
    } catch (forgeError) {
      setError(forgeError instanceof Error ? forgeError.message : 'Forging failed.');
    } finally {
      setLoading(false);
    }
  };

  const resetForge = () => {
    setImage(null);
    setCharacter(null);
    setError(null);
  };

  const findRelicDefinition = (relicId: string) => {
    const catalog = economy?.relic_catalog?.length ? economy.relic_catalog : IS_MOCK_MODE ? mockRelicCatalog : [];
    return catalog.find((relic) => relic.relic_type === relicId);
  };

  const updateRelicAmount = (relicId: string, delta: number) => {
    setEconomy((prev) => {
      const base = prev ?? (IS_MOCK_MODE ? mockEconomy : null);
      if (!base) return prev;
      return {
        ...base,
        relics: base.relics.map((relic) => (
          relic.relic_type === relicId
            ? { ...relic, amount: Math.max(0, relic.amount + delta), updated_at: new Date().toISOString() }
            : relic
        )),
      };
    });
  };

  const updateSavedHeroFromRecord = (record: HeroHistoryRecord) => {
    setSavedHeroes((prev) => prev.map((hero) => (
      hero.id === record.id ? { ...heroRecordToSavedHero(record), image: hero.image } : hero
    )));
  };

  const handleEquipRelic = async (heroId: string, relicId: string | null) => {
    const token = session?.token ?? getStoredToken();
    if (token && token !== 'mock-token') {
      try {
        const result = await equipCardRelic(heroId, relicId, token);
        updateSavedHeroFromRecord(result.card);
        setEconomy(result.economy);
      } catch (equipError) {
        setError(equipError instanceof Error ? equipError.message : 'Failed to equip relic.');
      }
      return;
    }

    if (!IS_MOCK_MODE) {
      setError('Login with a live session to equip relics.');
      return;
    }

    setSavedHeroes((prev) => prev.map((hero) => (
      hero.id === heroId ? { ...hero, equippedRelicId: relicId } : hero
    )));
  };

  const handleEnchantHero = async (heroId: string, relicId: string) => {
    setError(null);
    const token = session?.token ?? getStoredToken();
    if (token && token !== 'mock-token') {
      try {
        const result = await enchantCard(heroId, relicId, token);
        updateSavedHeroFromRecord(result.card);
        setEconomy(result.economy);
      } catch (enchantError) {
        setError(enchantError instanceof Error ? enchantError.message : 'Failed to enchant card.');
      }
      return;
    }

    if (!IS_MOCK_MODE) {
      setError('Login with a live session to enchant cards.');
      return;
    }

    const relicInventory = economy?.relics?.length ? economy.relics : mockEconomy.relics;
    const hasRelic = (relicInventory.find((entry) => entry.relic_type === relicId)?.amount ?? 0) > 0;
    if (!hasRelic) return;

    const shouldConsume = savedHeroes.some((hero) => hero.id === heroId && !hero.enchantment);
    if (!shouldConsume) return;

    setSavedHeroes((prev) => prev.map((hero) => {
      if (hero.id !== heroId || hero.enchantment) return hero;
      const relic = findRelicDefinition(relicId);
      return {
        ...hero,
        enchantment: {
          relicId,
          relicName: relic?.display_name ?? relicId,
          effectProfile: relic?.effect_profile,
          appliedAt: new Date().toISOString(),
        },
      };
    }));
    updateRelicAmount(relicId, -1);
  };

  const handleWashEnchant = async (heroId: string) => {
    setError(null);
    const token = session?.token ?? getStoredToken();
    if (token && token !== 'mock-token') {
      try {
        const result = await washCardEnchant(heroId, token);
        updateSavedHeroFromRecord(result.card);
        setEconomy(result.economy);
      } catch (washError) {
        setError(washError instanceof Error ? washError.message : 'Failed to wash enchant.');
      }
      return;
    }

    if (!IS_MOCK_MODE) {
      setError('Login with a live session to wash enchantments.');
      return;
    }

    setSavedHeroes((prev) => prev.map((hero) => {
      if (hero.id !== heroId || !hero.enchantment || hero.enchantment.removedAt) return hero;
      return {
        ...hero,
        enchantment: {
          ...hero.enchantment,
          removedAt: new Date().toISOString(),
        },
      };
    }));
  };

  const handleBreakHero = async (heroId: string): Promise<number | null> => {
    setError(null);
    const token = session?.token ?? getStoredToken();
    if (token && token !== 'mock-token') {
      try {
        const result = await decomposeCard(heroId, token);
        setSavedHeroes((prev) => prev.filter((hero) => hero.id !== heroId));
        setEconomy(result.economy);
        return result.dust_returned;
      } catch (breakError) {
        setError(breakError instanceof Error ? breakError.message : 'Failed to break card.');
        return null;
      }
    }

    if (!IS_MOCK_MODE) {
      setError('Login with a live session to break cards.');
      return null;
    }

    const target = savedHeroes.find((hero) => hero.id === heroId);
    if (!target) return null;
    const bp = Number.parseInt(String(target.character.BP), 10) || 0;
    const dustReturned = Math.max(10, Math.floor(bp * 0.05));
    setSavedHeroes((prev) => prev.filter((hero) => hero.id !== heroId));
    setEconomy((prev) => {
      const base = prev ?? mockEconomy;
      const wallet = base.wallet ?? mockEconomy.wallet!;
      return { ...base, wallet: { ...wallet, dust_balance: wallet.dust_balance + dustReturned } };
    });
    return dustReturned;
  };

  const content = (() => {
    if (activeSection === 'home') {
      if (homeTab === 'friends') {
        return (
          <ArenaPage
            heroes={savedHeroes}
            economy={economy}
            token={session?.token ?? getStoredToken()}
            demoMode={demoMode}
            activeTab="friends"
            onTabChange={(tab) => {
              setArenaTab(tab === 'friends' ? 'queue' : tab);
              setActiveSection('arena');
            }}
            onBattleLockChange={setArenaLocked}
            onRefresh={async () => {
              await reloadCollections();
            }}
            sectionTitle="Home"
          />
        );
      }
      return (
        <HomePage
          user={user}
          activeTab={homeTab}
          heroCount={savedHeroes.length}
          heroes={savedHeroes}
          onInspectHero={(id) => { setSelectedVaultId(id); setVaultTab('card'); handleNavigate('vault'); }}
          bestHeroBp={bestHeroBp}
          dust={dustBalance(economy)}
          relics={relicBalance(economy)}
          economy={economy}
          token={session?.token ?? getStoredToken()}
          onNavigate={handleNavigate}
          onEconomyChange={setEconomy}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenFriends={() => setHomeTab('friends')}
          onOpenBattleReplay={handleOpenBattleReplay}
          previewContentEnabled={IS_MOCK_MODE}
        />
      );
    }

    if (activeSection === 'vfx') {
      return <VfxTestPage />;
    }

    if (!isAuthenticated) return <AccessRequired onOpenAuth={() => setAuthOpen(true)} />;

    if (activeSection === 'settings') {
      return <SettingsPage token={session?.token ?? getStoredToken()} demoMode={demoMode} />;
    }

    if (activeSection === 'vault') {
      return (
        <VaultPage
          heroes={savedHeroes}
          economy={economy}
          selectedHeroId={selectedVaultId}
          onSelectHero={setSelectedVaultId}
          query={vaultQuery}
          onQueryChange={setVaultQuery}
          rarityFilter={vaultRarityFilter}
          onRarityFilterChange={setVaultRarityFilter}
          sort={vaultSort}
          onSortChange={setVaultSort}
          onEquipRelic={handleEquipRelic}
          demoMode={demoMode}
          activeTab={vaultTab}
          onTabChange={setVaultTab}
          onOpenEnchant={() => { setForgeTab('enchant'); setActiveSection('forge'); }}
        />
      );
    }

    if (activeSection === 'forge') {
      return (
        <ForgePage
          loading={loading}
          error={error}
          resultImage={image}
          resultHero={character}
          heroes={savedHeroes}
          economy={economy}
          demoMode={demoMode}
          activeTab={forgeTab}
          onEnchantHero={handleEnchantHero}
          onWashEnchant={handleWashEnchant}
          onBreakHero={handleBreakHero}
          onGenerate={handleImageSelect}
          onBreak={resetForge}
        />
      );
    }

    if (activeSection === 'arena') {
      return (
        <ArenaPage
          heroes={savedHeroes}
          economy={economy}
          token={session?.token ?? getStoredToken()}
          demoMode={demoMode}
          activeTab={arenaTab}
          onTabChange={(tab) => setArenaTab(tab === 'friends' ? 'queue' : tab)}
          onBattleLockChange={setArenaLocked}
          replayRecord={replayRecord}
          onReplayClose={handleCloseBattleReplay}
          onRefresh={async () => {
            await reloadCollections();
          }}
        />
      );
    }

    if (activeSection === 'chronicle') {
      return <PvePage heroes={savedHeroes} token={session?.token ?? getStoredToken()} demoMode={demoMode} />;
    }

    return (
      <MarketPage
        heroes={savedHeroes}
        economy={economy}
        token={session?.token ?? getStoredToken()}
        demoMode={demoMode}
        onEconomyChange={setEconomy}
      />
    );
  })();

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070707] text-stone-200">
        <div className="flex items-center gap-3 text-sm uppercase tracking-[0.28em] text-stone-400">
          <RefreshCw className="animate-spin" size={16} />
          Booting client
        </div>
      </div>
    );
  }

  return (
    <>
      <GameShell
        activeSection={activeSection}
        onNavigate={handleNavigate}
        user={user}
        dustBalance={dustBalance(economy)}
        gemBalance={economy?.wallet?.diamond_balance ?? 0}
        homeTab={homeTab}
        forgeTab={forgeTab}
        arenaTab={arenaTab}
        vaultTab={vaultTab}
        arenaLocked={arenaLocked}
        friendAlertCount={user ? friendAlertCount : 0}
        onHomeTabChange={setHomeTab}
        onForgeTabChange={setForgeTab}
        onVaultTabChange={setVaultTab}
        onArenaTabChange={(tab) => {
          if (arenaLocked && tab !== 'battle') return;
          setArenaTab(tab);
        }}
        onOpenAuth={() => setAuthOpen(true)}
        onOpenSettings={() => {
          if (!user) {
            setAuthOpen(true);
            return;
          }
          setActiveSection('settings');
        }}
      >
        {content}
      </GameShell>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)}>
        {authPanel}
      </AuthModal>
    </>
  );
};

export default App;
