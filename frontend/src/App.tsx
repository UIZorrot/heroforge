import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Library,
  LogOut,
  Mail,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Sword,
  Swords,
  UserRound,
  Wand2,
} from 'lucide-react';
import { BattleVisualizer } from './components/BattleVisualizer';
import { EmptyState, MetricCard, SectionHeader, StatPill, StatusPill } from './components/Effects';
import { Forge } from './components/Forge';
import { HeroCard } from './components/HeroCard';
import { ParticleBackground } from './components/ParticleBackground';
import { PvpArena, clearStoredArenaState } from './components/PvpArena';
import { LandingPage } from './components/LandingPage';
import { battleHeroes, battleTeams, clearStoredSession, fetchBattles, fetchCurrentUser, fetchEconomy, fetchHeroes, forgeHero, getStoredSession, getStoredToken, logout, requestLoginCode, verifyLoginCode } from './lib/api';
import { calculateRarity, normalizeCharacterData, toNumber } from './lib/gameLogic';
import { cn } from './lib/utils';
import type { AuthUser, BattleHistoryRecord, CharacterData, EconomySnapshot, SavedHero, SectionKey, VerifyLoginResponse } from './types';
import type { BattleResult } from './lib/battleTypes';

const NAV_ITEMS: Array<{ key: SectionKey; label: string; icon: ComponentType<{ size?: number; className?: string }> }> = [
  { key: 'home', label: 'Home', icon: Sparkles },
  { key: 'forge', label: 'Forge', icon: Wand2 },
  { key: 'vault', label: 'Vault', icon: Library },
  { key: 'duel', label: 'Train', icon: Sword },
  { key: 'arena', label: 'Arena', icon: Swords },
  { key: 'profile', label: 'Profile', icon: UserRound },
];

const LOGIN_RESEND_SECONDS = 60;

const formatDate = (value?: string | number) => {
  if (!value) return 'Unknown';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
};

type HeroRow = { id: string; created_at: string; hero_payload: CharacterData };

const heroFromRecord = (record: HeroRow): SavedHero => ({
  id: record.id,
  createdAt: new Date(record.created_at).getTime() || Date.now(),
  character: normalizeCharacterData(record.hero_payload),
});

function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(getStoredSession());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [route, setRoute] = useState<'landing' | 'login' | 'dashboard'>('landing');
  const [section, setSection] = useState<SectionKey>('home');
  const [email, setEmail] = useState(session?.email || '');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  const [heroes, setHeroes] = useState<SavedHero[]>([]);
  const [battles, setBattles] = useState<BattleHistoryRecord[]>([]);
  const [economy, setEconomy] = useState<EconomySnapshot | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [forgeLoading, setForgeLoading] = useState(false);
  const [forgeError, setForgeError] = useState('');
  const [forgePreviewUrl, setForgePreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [forgeResult, setForgeResult] = useState<CharacterData | null>(null);

  const [selectedDuelA, setSelectedDuelA] = useState('');
  const [selectedDuelB, setSelectedDuelB] = useState('');
  const [battleMode, setBattleMode] = useState<'1v1' | '4v4'>('1v1');
  const [selectedVaultHeroId, setSelectedVaultHeroId] = useState('');
  const [vaultQuery, setVaultQuery] = useState('');
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const [battleError, setBattleError] = useState('');

  useEffect(() => {
    document.title = user ? `Hero Forge - ${user.email}` : 'Hero Forge - Guest';
  }, [user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const reloadCollections = async (tokenArg?: string | null) => {
    const token = tokenArg ?? session?.token ?? getStoredToken();
    if (!token) return;
    setLoadingData(true);
    try {
      const [heroRecords, battleRecords, economyState] = await Promise.all([fetchHeroes(token), fetchBattles(token), fetchEconomy(token)]);
      setHeroes(heroRecords.map((record) => heroFromRecord({ id: record.id, created_at: record.created_at, hero_payload: record.hero_payload })));
      setBattles(battleRecords);
      setEconomy(economyState);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    const boot = async () => {
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
      } catch (error) {
        console.error(error);
        clearStoredSession();
        setSession(null);
      } finally {
        setBooting(false);
      }
    };
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const handleRequestCode = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setAuthError('Please enter an email address.');
      return;
    }
    setSending(true);
    setAuthError('');
    setAuthMessage('');
    try {
      await requestLoginCode(cleanEmail);
      setCodeSent(true);
      setCooldown(LOGIN_RESEND_SECONDS);
      setAuthMessage('A login code was sent to your inbox.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to send login code');
    } finally {
      setSending(false);
    }
  };

  const handleVerifyCode = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();
    if (!cleanEmail || !cleanCode) {
      setAuthError('Enter both email and code.');
      return;
    }
    setVerifying(true);
    setAuthError('');
    setAuthMessage('');
    try {
      const result: VerifyLoginResponse = await verifyLoginCode(cleanEmail, cleanCode);
      setSession({ token: result.token, email: result.user.email, expiresAt: result.expires_at });
      setUser(result.user);
      setCode('');
      setCodeSent(false);
      setCooldown(0);
      setAuthMessage('Login successful.');
      await reloadCollections(result.token);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to verify code');
    } finally {
      setVerifying(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout(session?.token ?? getStoredToken());
    } catch (error) {
      console.error(error);
      clearStoredSession();
    } finally {
      clearStoredSession();
      setSession(null);
      setUser(null);
      setHeroes([]);
      setBattles([]);
      setEconomy(null);
      setSection('home');
      setSelectedDuelA('');
      setSelectedDuelB('');
      setBattleMode('1v1');
      setForgeResult(null);
      setBattleResult(null);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      clearStoredArenaState();
      setForgePreviewUrl(null);
      setEmail('');
    }
  };

  const handleForgeHero = async (file: File) => {
    const token = session?.token ?? getStoredToken();
    if (!token) {
      setForgeError('Please login first.');
      return;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setForgePreviewUrl(url);
    setForgeLoading(true);
    setForgeError('');
    setBattleError('');
    try {
      const hero = await forgeHero(file, {}, token);
      setForgeResult(normalizeCharacterData(hero));
      await reloadCollections(token);
      setSection('vault');
    } catch (error) {
      setForgeError(error instanceof Error ? error.message : 'Forge failed');
    } finally {
      setForgeLoading(false);
    }
  };

  const handleBattle = async () => {
    const token = session?.token ?? getStoredToken();
    if (!token) {
      setBattleError('Please login first.');
      return;
    }
    const heroA = heroes.find((hero) => hero.id === selectedDuelA);
    const heroB = heroes.find((hero) => hero.id === selectedDuelB);
    if (!heroA || !heroB || heroA.id === heroB.id) {
      setBattleError('Pick two different heroes.');
      return;
    }
    setRefreshing(true);
    setBattleError('');
    try {
      const result = await battleHeroes(heroA.character, heroB.character, token);
      setBattleResult(result);
      await reloadCollections(token);
    } catch (error) {
      setBattleError(error instanceof Error ? error.message : 'Battle failed');
    } finally {
      setRefreshing(false);
    }
  };

  const handleBattle4v4 = async () => {
    const token = session?.token ?? getStoredToken();
    if (!token) {
      setBattleError('Please login first.');
      return;
    }
    const rankedHeroes = [...heroes].sort((a, b) => toNumber(b.character.BP, 0) - toNumber(a.character.BP, 0));
    const teamA = rankedHeroes.slice(0, 4);
    const teamB = rankedHeroes.slice(4, 8);
    if (teamA.length < 4 || teamB.length < 4) {
      setBattleError('4v4 requires at least 8 heroes in the vault.');
      return;
    }
    setRefreshing(true);
    setBattleError('');
    try {
      const result = await battleTeams(
        teamA.map((hero) => hero.character),
        teamB.map((hero) => hero.character),
        '4v4',
        'Top 4',
        'Bottom 4',
        token
      );
      setBattleResult(result);
      await reloadCollections(token);
    } catch (error) {
      setBattleError(error instanceof Error ? error.message : 'Battle failed');
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    if (!session) return;
    setRefreshing(true);
    try {
      await reloadCollections(session.token);
    } finally {
      setRefreshing(false);
    }
  };

  const selectedHeroA = heroes.find((hero) => hero.id === selectedDuelA) ?? null;
  const selectedHeroB = heroes.find((hero) => hero.id === selectedDuelB) ?? null;
  const duelReady = Boolean(selectedHeroA && selectedHeroB && selectedHeroA.id !== selectedHeroB.id);
  const averageBP = useMemo(() => {
    if (!heroes.length) return 0;
    return Math.round(heroes.reduce((sum, hero) => sum + toNumber(hero.character.BP, 0), 0) / heroes.length);
  }, [heroes]);
  const dustBalance = economy?.wallet?.dust_balance ?? economy?.starter.dust_balance ?? 0;
  const relicCount = useMemo(() => {
    return economy?.relics.reduce((sum, relic) => sum + Number(relic.amount || 0), 0) ?? 0;
  }, [economy]);
  const strongestHero = useMemo(() => {
    if (!heroes.length) return null;
    return [...heroes].sort((a, b) => toNumber(b.character.BP, 0) - toNumber(a.character.BP, 0))[0];
  }, [heroes]);

  useEffect(() => {
    if (!selectedVaultHeroId && heroes.length > 0) {
      setSelectedVaultHeroId(heroes[0].id);
    }
  }, [heroes, selectedVaultHeroId]);

  const parseBattleText = (battle: BattleHistoryRecord) => battle.result?.summary || battle.result?.logs?.[battle.result.logs.length - 1] || 'No summary available';

  const authPanel = (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="border border-stone-800 bg-black/55 p-6 backdrop-blur-xl">
      <SectionHeader eyebrow="Access" title="Sign in with email" description="We’ll send a one-time code to your inbox." />
      <div className="mt-6 space-y-4">
        <label className="block space-y-2">
          <span className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Email</span>
          <div className="flex items-center gap-3 border border-stone-800 bg-black/45 px-4 py-3 focus-within:border-[#c59a5a]/50">
            <Mail size={16} className="text-stone-500" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="ui_zorrot@163.com" className="w-full bg-transparent text-sm text-stone-100 outline-none placeholder:text-stone-600" />
          </div>
        </label>
        <button type="button" onClick={handleRequestCode} disabled={sending || cooldown > 0 || !email.trim()} className="inline-flex w-full items-center justify-center gap-2 border border-[#c59a5a]/25 bg-[#c59a5a]/10 px-4 py-3 text-sm uppercase tracking-[0.22em] text-[#f0d8ad] transition hover:border-[#c59a5a]/50 disabled:cursor-not-allowed disabled:opacity-50">
          {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
          {cooldown > 0 ? `Resend in ${cooldown}s` : codeSent ? 'Resend code' : 'Send code'}
        </button>
        {codeSent && (
          <>
            <label className="block space-y-2">
              <span className="text-[10px] uppercase tracking-[0.28em] text-stone-500">One-time code</span>
              <div className="flex items-center gap-3 border border-stone-800 bg-black/45 px-4 py-3 focus-within:border-[#c59a5a]/50">
                <Sparkles size={16} className="text-stone-500" />
                <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" className="w-full bg-transparent text-sm tracking-[0.35em] text-stone-100 outline-none placeholder:text-stone-600" />
              </div>
            </label>
            <button type="button" onClick={handleVerifyCode} disabled={verifying || !code.trim()} className="inline-flex w-full items-center justify-center gap-2 border border-stone-800 bg-black/45 px-4 py-3 text-sm uppercase tracking-[0.22em] text-stone-200 transition hover:border-stone-600 disabled:cursor-not-allowed disabled:opacity-50">
              {verifying ? <RefreshCw size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              Verify code
            </button>
          </>
        )}
        <AnimatePresence mode="wait">
          {(authError || authMessage) && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className={cn('border px-4 py-3 text-sm', authError ? 'border-amber-400/20 bg-amber-400/10 text-amber-100' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100')}>
              {authError || authMessage}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );

  const renderSection = () => {
    if (section === 'home') {
      return (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="border border-[#c59a5a]/20 bg-[#c59a5a]/5 p-6 backdrop-blur-md rounded-xl shadow-inner">
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#c59a5a]">Overview</div>
              <h2 className="mt-3 text-3xl font-light tracking-[0.12em] text-stone-100">{user ? `Welcome back, ${user.email.split('@')[0]}` : 'Welcome, guest'}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-400">
                Manage your heroes, explore the vault, and compete in the arena from this central command interface.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => setSection('forge')} className="inline-flex items-center gap-2 border border-[#c59a5a]/40 bg-[#c59a5a]/10 px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-[#f0d8ad] transition hover:bg-[#c59a5a]/20">
                  <Wand2 size={14} /> Forge hero
                </button>
                <button type="button" onClick={() => setSection('arena')} className="inline-flex items-center gap-2 border border-stone-800 bg-black/50 px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-stone-300 transition hover:border-stone-600">
                  <Swords size={14} /> Open arena
                </button>
              </div>
            </div>
            {strongestHero ? (
              <div className="border border-[#c59a5a]/30 p-1 bg-black/40 rounded-3xl shadow-[0_0_20px_rgba(197,154,90,0.1)]">
                 <HeroCard character={strongestHero.character} className="min-h-[420px]" compact />
              </div>
            ) : (
              <EmptyState title="No heroes yet" description="Forge your first hero to populate the dashboard." />
            )}
          </div>
          <div className="space-y-4">
            <MetricCard label="Vault size" value={heroes.length} hint="Stored heroes in your account" />
            <MetricCard label="Battle log" value={battles.length} hint="Total persisted duels" />
            <MetricCard label="Avg BP" value={averageBP} hint="Mean battle power across your vault" />
            
            <div className="border border-[#c59a5a]/20 bg-black/40 p-5 rounded-xl mt-6">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#c59a5a] mb-4">Recent battle</div>
              {battles[0] ? (
                <>
                  <div className="mt-2 text-sm uppercase tracking-[0.22em] text-[#f0d8ad]">{battles[0].battle_type}</div>
                  <div className="mt-1 text-xs text-stone-500">{formatDate(battles[0].created_at)}</div>
                  <div className="mt-3 text-sm text-stone-300 border-t border-stone-800 pt-3">{parseBattleText(battles[0])}</div>
                </>
              ) : (
                <p className="mt-3 text-sm text-stone-400">No battle records yet.</p>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (section === 'forge') {
      return (
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <SectionHeader eyebrow="Forge" title="Generate a hero from an image" description="Upload an image, let the backend choose a template and weights, and save the generated hero to your vault." />
            <Forge
              onImageSelect={handleForgeHero}
              isForging={forgeLoading}
              error={forgeError}
              previewUrl={forgePreviewUrl}
              onClearPreview={() => {
                if (previewUrlRef.current) {
                  URL.revokeObjectURL(previewUrlRef.current);
                  previewUrlRef.current = null;
                }
                setForgePreviewUrl(null);
              }}
            />
          </div>
          <div className="space-y-4">
            <SectionHeader eyebrow="Result" title="Latest forged hero" description="The most recent forge output from the current session." />
            {forgeResult ? <HeroCard character={forgeResult} className="min-h-[420px]" compact /> : <EmptyState title="No forge output yet" description="Upload an image and run Forge to generate a new hero." />}
          </div>
        </div>
      );
    }

    if (section === 'vault') {
      const filtered = [...heroes]
        .filter((hero) => {
          const q = vaultQuery.trim().toLowerCase();
          if (!q) return true;
          return [hero.character.name, hero.character.description, hero.character.state.TYPE, hero.character.template || ''].join(' ').toLowerCase().includes(q);
        })
        .sort((a, b) => toNumber(b.character.BP, 0) - toNumber(a.character.BP, 0));
      const selectedVaultHero = heroes.find((hero) => hero.id === selectedVaultHeroId) ?? filtered[0] ?? null;

      return (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <div className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeader eyebrow="Vault" title="Your hero library" description="Search and inspect heroes saved under your account." />
              <div className="flex items-center gap-2 border border-stone-800 bg-black/35 px-3 py-2">
                <Search size={14} className="text-stone-500" />
                <input value={vaultQuery} onChange={(e) => setVaultQuery(e.target.value)} placeholder="Search heroes" className="bg-transparent text-sm text-stone-100 outline-none placeholder:text-stone-600" />
              </div>
            </div>
            {loadingData ? <EmptyState title="Loading vault" description="Fetching heroes from the backend." /> : filtered.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((hero) => (
                  <HeroCard
                    key={hero.id}
                    character={hero.character}
                    compact
                    className={cn('min-h-[360px]', selectedVaultHero?.id === hero.id && 'ring-1 ring-[#c59a5a]/45')}
                    onClick={() => setSelectedVaultHeroId(hero.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="Your vault is empty" description="Forge a hero first, then come back here to review the saved results." action={<button type="button" onClick={() => setSection('forge')} className="inline-flex items-center gap-2 border border-[#c59a5a]/30 bg-[#c59a5a]/10 px-4 py-2 text-xs uppercase tracking-[0.24em] text-[#f0d8ad]"><Wand2 size={14} />Go to Forge</button>} />
            )}
          </div>
          <div className="space-y-4">
            <SectionHeader eyebrow="Details" title={selectedVaultHero?.character.name || 'Select a hero'} description="Stats and skills for the currently selected card." />
            {selectedVaultHero ? (
              <div className="space-y-4 border border-stone-800 bg-black/40 p-5">
                <div className="flex flex-wrap gap-2">
                  <StatPill label="BP" value={selectedVaultHero.character.BP} tone="gold" />
                  <StatPill label="TYPE" value={selectedVaultHero.character.state.TYPE} tone="violet" />
                  <StatPill label="RARITY" value={calculateRarity(toNumber(selectedVaultHero.character.BP, 0))} tone="emerald" />
                </div>
                <p className="text-sm leading-7 text-stone-400">{selectedVaultHero.character.description}</p>
                <div className="grid grid-cols-2 gap-3">
                  {(['HP', 'MP', 'ATK', 'DEF', 'CC', 'SPEED', 'CA', 'PI', 'EV', 'AC'] as const).map((key) => (
                    <div key={key} className="border border-stone-800 bg-black/40 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-stone-500">{key}</div>
                      <div className="mt-1 text-lg text-stone-100">{selectedVaultHero.character.state[key]}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState title="No selection" description="Choose a hero from the grid to inspect it here." />
            )}
          </div>
        </div>
      );
    }

    if (section === 'duel') {
      const rankedHeroes = [...heroes].sort((a, b) => toNumber(b.character.BP, 0) - toNumber(a.character.BP, 0));
      const teamA4 = rankedHeroes.slice(0, 4);
      const teamB4 = rankedHeroes.slice(4, 8);
      const team4Ready = teamA4.length === 4 && teamB4.length === 4;

      return (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeader eyebrow="Train" title="Training ground" description="This is the sandbox. Use your own vault cards to test builds, simulate 1v1, or run a 4v4 board experiment without matchmaking." />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setBattleMode('1v1')}
                className={cn(
                  'border px-3 py-2 text-xs uppercase tracking-[0.22em]',
                  battleMode === '1v1' ? 'border-[#c59a5a]/40 bg-[#c59a5a]/10 text-[#f0d8ad]' : 'border-stone-800 bg-black/40 text-stone-400'
                )}
              >
                1v1
              </button>
              <button
                type="button"
                onClick={() => setBattleMode('4v4')}
                className={cn(
                  'border px-3 py-2 text-xs uppercase tracking-[0.22em]',
                  battleMode === '4v4' ? 'border-[#c59a5a]/40 bg-[#c59a5a]/10 text-[#f0d8ad]' : 'border-stone-800 bg-black/40 text-stone-400'
                )}
              >
                4v4 board
              </button>
              <StatusPill tone={battleMode === '1v1' ? (duelReady ? 'emerald' : 'slate') : (team4Ready ? 'emerald' : 'slate')}>
                {battleMode === '1v1' ? (duelReady ? 'Ready' : 'Choose two heroes') : (team4Ready ? 'Ready' : 'Need 8 heroes')}
              </StatusPill>
            </div>
          </div>
          {battleMode === '1v1' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 border border-stone-800 bg-black/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm uppercase tracking-[0.22em] text-stone-500">Hero A</div>
                  {selectedDuelA && <button type="button" onClick={() => setSelectedDuelA('')} className="text-xs uppercase tracking-[0.22em] text-stone-500">Clear</button>}
                </div>
                {selectedHeroA ? <HeroCard character={selectedHeroA.character} compact className="min-h-[360px]" /> : <EmptyState title="Choose Hero A" description="Click a card in the vault grid to assign it here." />}
              </div>
              <div className="space-y-3 border border-stone-800 bg-black/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm uppercase tracking-[0.22em] text-stone-500">Hero B</div>
                  {selectedDuelB && <button type="button" onClick={() => setSelectedDuelB('')} className="text-xs uppercase tracking-[0.22em] text-stone-500">Clear</button>}
                </div>
                {selectedHeroB ? <HeroCard character={selectedHeroB.character} compact className="min-h-[360px]" /> : <EmptyState title="Choose Hero B" description="Pick a different card to create the matchup." />}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 border border-stone-800 bg-black/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm uppercase tracking-[0.22em] text-stone-500">Top 4</div>
                  <div className="text-xs uppercase tracking-[0.22em] text-stone-500">Auto sorted by BP</div>
                </div>
                {teamA4.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {teamA4.map((hero) => (
                      <HeroCard key={hero.id} character={hero.character} compact className="min-h-[280px]" />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="Need more heroes" description="4v4 requires at least eight heroes in your vault." />
                )}
              </div>
              <div className="space-y-3 border border-stone-800 bg-black/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm uppercase tracking-[0.22em] text-stone-500">Bottom 4</div>
                  <div className="text-xs uppercase tracking-[0.22em] text-stone-500">Facing the board</div>
                </div>
                {teamB4.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {teamB4.map((hero) => (
                      <HeroCard key={hero.id} character={hero.character} compact className="min-h-[280px]" />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="Need more heroes" description="4v4 requires at least eight heroes in your vault." />
                )}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={battleMode === '1v1' ? handleBattle : handleBattle4v4}
              disabled={battleMode === '1v1' ? (!duelReady || refreshing) : (!team4Ready || refreshing)}
              className="inline-flex items-center gap-2 border border-[#c59a5a]/30 bg-[#c59a5a]/10 px-5 py-3 text-sm uppercase tracking-[0.24em] text-[#f0d8ad] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sword size={16} />
              {battleResult ? 'Run again' : 'Engage'}
            </button>
            <button type="button" onClick={() => { setSelectedDuelA(''); setSelectedDuelB(''); setBattleResult(null); }} className="inline-flex items-center gap-2 border border-stone-800 bg-black/45 px-5 py-3 text-sm uppercase tracking-[0.24em] text-stone-300">
              Reset
            </button>
          </div>
          {battleError && <div className="border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{battleError}</div>}
          <BattleVisualizer heroA={battleMode === '1v1' ? selectedHeroA?.character ?? null : null} heroB={battleMode === '1v1' ? selectedHeroB?.character ?? null : null} result={battleResult} />
        </div>
      );
    }

    if (section === 'arena') {
      return (
        <PvpArena
          heroes={heroes}
          economy={economy}
          token={session?.token ?? getStoredToken()}
          onRefresh={handleRefresh}
        />
      );
    }

    return (
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <SectionHeader eyebrow="Profile" title="Account details" description="Your email session and backend connection info." />
            <div className="border border-stone-800 bg-black/40 p-5">
              <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Email</div>
              <div className="mt-2 text-xl font-light tracking-[0.08em] text-stone-100">{user?.email}</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MetricCard label="Heroes" value={heroes.length} hint="Saved under this account" />
                <MetricCard label="Battles" value={battles.length} hint="Stored battle history" />
                <MetricCard label="Dust" value={dustBalance} hint="Available resource balance" />
                <MetricCard label="Relics" value={relicCount} hint="Total relic pieces" />
              </div>
            </div>
          </div>
        <div className="space-y-4">
          <SectionHeader eyebrow="System" title="Session & backend" description="Useful technical details for debugging and deployment." />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="border border-stone-800 bg-black/40 p-5">
              <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Token status</div>
              <div className="mt-2 text-lg text-stone-100">Active session</div>
              <div className="mt-2 text-sm text-stone-500">Stored in local browser storage</div>
            </div>
            <div className="border border-stone-800 bg-black/40 p-5">
              <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Backend URL</div>
              <div className="mt-2 text-lg text-stone-100">{import.meta.env.VITE_BACKEND_URL || 'http://localhost:5544'}</div>
              <div className="mt-2 text-sm text-stone-500">Used by auth, forge, and battle endpoints</div>
            </div>
            <div className="border border-stone-800 bg-black/40 p-5">
              <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Latest login</div>
              <div className="mt-2 text-lg text-stone-100">{formatDate(session?.expiresAt)}</div>
              <div className="mt-2 text-sm text-stone-500">Session expiry from the last verified code</div>
            </div>
            <div className="border border-stone-800 bg-black/40 p-5">
              <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Status</div>
              <div className="mt-2 text-lg text-stone-100">Ready</div>
              <div className="mt-2 text-sm text-stone-500">Forge, vault, train, arena, economy, and login are wired together</div>
            </div>
          </div>
          <div className="border border-stone-800 bg-black/40 p-5">
            <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Recent economy</div>
            {economy?.transactions?.length ? (
              <div className="mt-4 space-y-3">
                {economy.transactions.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between gap-3 border border-stone-800/80 bg-black/30 px-4 py-3 text-sm">
                    <div>
                      <div className="text-stone-200">{tx.reason}</div>
                      <div className="mt-1 text-xs text-stone-500">{tx.resource_type}{tx.resource_key ? ` · ${tx.resource_key}` : ''}</div>
                    </div>
                    <div className={cn('text-right text-sm', tx.delta >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                      {tx.delta >= 0 ? '+' : ''}{tx.delta}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-stone-400">No resource transactions yet.</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080808] text-stone-200">
        <div className="flex items-center gap-3 text-sm uppercase tracking-[0.28em] text-stone-400">
          <RefreshCw className="animate-spin" size={16} />
          Booting console
        </div>
      </div>
    );
  }

  if (route === 'landing') {
    return (
      <div className="relative min-h-screen w-full bg-[#080808] text-stone-100 flex items-center justify-center p-4">
        <ParticleBackground />
        <div className="relative z-10 w-full max-w-[1600px] h-full flex flex-col text-center">
          <div className="absolute top-4 right-4 z-50">
             <button onClick={() => setRoute('login')} className="text-sm uppercase tracking-[0.2em] text-stone-400 hover:text-[#f0d8ad]">Enter System</button>
          </div>
          <LandingPage onNavigate={(sec) => { setSection(sec); setRoute('dashboard'); }} isAuthenticated={!!user} />
        </div>
      </div>
    );
  }

  if (route === 'login') {
    return (
      <div className="relative min-h-screen w-full bg-[#080808] text-stone-100 flex flex-col items-center justify-center p-4">
        <ParticleBackground />
        <div className="relative z-10 w-full max-w-sm">
          {authPanel}
          <div className="mt-8 text-center">
            <button onClick={() => setRoute('dashboard')} className="text-[10px] uppercase tracking-[0.2em] text-stone-500 hover:text-stone-300 underline underline-offset-4">Skip to Dashboard (Testing)</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080808] text-stone-100">
      <ParticleBackground />
      <motion.div
        className="pointer-events-none absolute -left-24 top-16 h-72 w-72 bg-[#c59a5a]/10 blur-3xl opacity-50"
        animate={{ opacity: [0.15, 0.35, 0.15], scale: [1, 1.08, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute right-12 top-[34%] h-80 w-80 bg-violet-500/10 blur-3xl opacity-50"
        animate={{ opacity: [0.12, 0.24, 0.12], x: [0, -16, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="hidden w-[280px] shrink-0 border-r border-[#c59a5a]/20 bg-black/60 px-5 py-8 backdrop-blur-3xl lg:flex lg:flex-col shadow-[10px_0_40px_rgba(0,0,0,0.5)]">
          <div className="space-y-2">
            <div className="text-[10px] font-light uppercase tracking-[0.3em] text-[#c59a5a]">Hero Forge</div>
            <div className="text-2xl font-light tracking-[0.12em] text-stone-100 flex items-center gap-3">
              <Sparkles size={20} className="text-[#f0d8ad]" /> Console
            </div>
            <div className="w-[40px] h-[1px] bg-[#c59a5a]/40 mt-4" />
          </div>
          <div className="mt-12 space-y-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = section === item.key;
              return (
                <button key={item.key} type="button" onClick={() => setSection(item.key)} className={cn('group flex w-full items-center justify-between border px-4 py-3.5 text-left transition-all', active ? 'border-[#c59a5a]/50 bg-[#c59a5a]/10 text-[#f0d8ad] shadow-[0_0_20px_rgba(197,154,90,0.15)]' : 'border-stone-800/40 bg-black/35 text-stone-400 hover:border-[#c59a5a]/30 hover:bg-black/55 hover:text-stone-200')}>
                  <span className="flex items-center gap-4"><Icon size={18} className={active ? "" : "opacity-60"} /><span className="text-xs uppercase tracking-[0.24em]">{item.label}</span></span>
                  <ArrowRight size={14} className={active ? "opacity-100" : "opacity-0 group-hover:opacity-100 transition-opacity"} />
                </button>
              );
            })}
          </div>
          <div className="mt-auto space-y-4 border-t border-[#c59a5a]/20 pt-6">
            <div className="border border-stone-800/50 bg-black/35 p-4 rounded-lg">
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#c59a5a]/70">Session</div>
              <div className="mt-2 text-sm text-stone-200 truncate">{user?.email ?? 'Guest mode'}</div>
            </div>
            {user ? (
              <button type="button" onClick={() => { handleLogout(); setRoute('login'); }} className="flex w-full items-center justify-between border border-stone-800/50 bg-black/40 px-4 py-3 text-left text-stone-400 transition hover:border-rose-400/40 hover:text-rose-200 hover:bg-rose-400/5">
                <span className="flex items-center gap-3"><LogOut size={16} /><span className="text-xs uppercase tracking-[0.22em]">Logout</span></span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <button type="button" onClick={() => setRoute('login')} className="flex w-full items-center justify-between border border-stone-800/50 bg-black/40 px-4 py-3 text-left text-stone-400 transition hover:border-[#c59a5a]/40 hover:text-[#f0d8ad] hover:bg-[#c59a5a]/5">
                <span className="flex items-center gap-3"><Mail size={16} /><span className="text-xs uppercase tracking-[0.22em]">Sign in</span></span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </aside>

        <main className="flex-1 px-4 py-6 lg:px-12 lg:py-10 h-screen overflow-y-auto custom-scrollbar">
          <div className="mb-6 flex items-center justify-between border border-[#c59a5a]/20 bg-black/60 px-4 py-3 backdrop-blur-xl lg:hidden shadow-lg">
            <button type="button" onClick={() => setRoute('landing')} className="text-sm font-light uppercase tracking-[0.2em] text-[#f0d8ad]">Hero Forge</button>
            {user ? (
              <button type="button" onClick={() => { handleLogout(); setRoute('landing'); }} className="inline-flex items-center gap-2 border border-stone-800 px-3 py-2 text-xs uppercase tracking-[0.22em] text-stone-300"><LogOut size={14} /> Logout</button>
            ) : (
              <button type="button" onClick={() => setRoute('login')} className="inline-flex items-center gap-2 border border-[#c59a5a]/40 px-3 py-2 text-xs uppercase tracking-[0.22em] text-[#f0d8ad]"><Mail size={14} /> Sign in</button>
            )}
          </div>

          <section className="mb-10 border border-[#c59a5a]/20 bg-black/40 p-6 lg:p-8 relative overflow-hidden backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
            <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-[#c59a5a] to-transparent" />
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#c59a5a] mb-2">{section.toUpperCase()} DASHBOARD</p>
                <h1 className="text-4xl font-light tracking-[0.15em] text-stone-100">Control Center</h1>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <StatPill label="Heroes" value={heroes.length} tone="gold" />
                <StatPill label="Battles" value={battles.length} tone="violet" />
                <button type="button" onClick={handleRefresh} className="inline-flex items-center gap-2 border border-[#c59a5a]/30 bg-black/50 px-4 py-2 text-xs uppercase tracking-[0.22em] text-stone-300 hover:border-[#c59a5a] hover:text-[#f0d8ad] transition-all">
                  <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>
            </div>
          </section>

          <div>
            <AnimatePresence mode="wait">
              <motion.section key={section} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.3 }} className="space-y-6">
                {renderSection()}
              </motion.section>
            </AnimatePresence>
          </div>

          {forgeError && section !== 'forge' && <div className="mt-8 border border-amber-400/30 bg-amber-400/10 px-5 py-4 text-sm tracking-wide text-amber-100 flex items-center gap-3 backdrop-blur-md shadow-lg"><Wand2 size={16} />{forgeError}</div>}
        </main>
      </div>
    </div>
  );
}

export default App;
