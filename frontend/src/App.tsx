import React, { useEffect, useMemo, useState } from 'react';
import { Gem, Swords, X, Plus, Search, ChevronRight, ChevronDown, Mail, RefreshCw, ArrowRight, Sparkles, Send, Trophy } from 'lucide-react';
import { HeroCard } from './components/HeroCard';
import { Forge } from './components/Forge';
import { BattleVisualizer } from './components/BattleVisualizer';
import { PvpArena } from './components/PvpArena';
import { AppLogo } from './components/AppLogo';
import { DailyActivity } from './components/DailyActivity';
import { LadderPanel } from './components/LadderPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { forgeHero, fetchHeroes, fetchEconomy, fetchCurrentUser, getStoredSession, getStoredToken, verifyLoginCode, requestLoginCode, clearStoredSession } from './lib/api';
import { calculateRarity, normalizeCharacterData, toNumber, type CharacterData, type Rarity } from './lib/gameLogic';
import { runTeamDuel } from './lib/battleLogic';
import { LandingPage } from './components/LandingPage';
import type { AuthUser, EconomySnapshot, MaterialDefinition, MaterialInventory, MaterialKey, RelicDefinition, SavedHero } from './types';
import type { BattleEvent, BattleResult } from './lib/battleTypes';
import { SectionHeader } from './components/Effects';
import { Shield } from 'lucide-react';

type SectionKey = 'barracks' | 'forge' | 'train' | 'duel' | 'ladder' | 'chronicle' | 'profile';
type DuelSize = '1v1' | '3v3' | '4v4';
type VaultSort = 'date' | 'bp' | 'name';

const LOGIN_RESEND_SECONDS = 60;
const MATERIAL_STORAGE_KEY = 'hero_forge_material_inventory_v1';

const MATERIAL_DEFINITIONS: MaterialDefinition[] = [
  { key: 'glowGem', label: 'Luminous Gem', effect: 'Light, precision, speed', rewardTag: 'Luminous Gem', overlayClass: 'from-gold-matte/25 via-gold-matte/10 to-transparent mix-blend-screen', particleClass: 'bg-gold-matte/80', badgeClass: 'border-gold-matte/35 bg-gold-matte/5 text-gold-100' },
  { key: 'chaosMind', label: 'Chaos Mind', effect: 'Shadow, burst, control', rewardTag: 'Chaos Mind', overlayClass: 'from-violet-400/24 via-violet-300/12 to-transparent mix-blend-screen', particleClass: 'bg-violet-300/70', badgeClass: 'border-violet-400/28 bg-violet-400/6 text-violet-200' },
  { key: 'emberCore', label: 'Ember Core', effect: 'Fire, burn, suppression', rewardTag: 'Ember Core', overlayClass: 'from-orange-400/24 via-orange-300/12 to-transparent mix-blend-screen', particleClass: 'bg-orange-300/70', badgeClass: 'border-orange-400/28 bg-orange-400/6 text-orange-200' },
  { key: 'frostShard', label: 'Frost Shard', effect: 'Frost, slow, survival', rewardTag: 'Frost Shard', overlayClass: 'from-sky-300/24 via-blue-300/12 to-transparent mix-blend-screen', particleClass: 'bg-sky-300/70', badgeClass: 'border-sky-400/28 bg-sky-400/6 text-sky-200' },
  { key: 'stormSigil', label: 'Storm Sigil', effect: 'Lightning, combo, rhythm', rewardTag: 'Storm Sigil', overlayClass: 'from-indigo-400/24 via-sky-300/12 to-transparent mix-blend-screen', particleClass: 'bg-indigo-300/70', badgeClass: 'border-indigo-400/28 bg-indigo-400/6 text-indigo-200' },
  { key: 'voidDust', label: 'Void Dust', effect: 'Penetration, disruption', rewardTag: 'Void Dust', overlayClass: 'from-fuchsia-400/24 via-purple-300/12 to-transparent mix-blend-screen', particleClass: 'bg-fuchsia-300/70', badgeClass: 'border-fuchsia-400/28 bg-fuchsia-400/6 text-fuchsia-200' },
];

const createEmptyInventory = (): MaterialInventory => ({ glowGem: 0, chaosMind: 0, emberCore: 0, frostShard: 0, stormSigil: 0, voidDust: 0 });

const toBP = (hero: SavedHero): number => Math.max(1, toNumber(hero.character.BP, 0));

const createEmptyTeamSlots = (): [string, string, string] => ['', '', ''];

const App: React.FC = () => {
  const navItems: Array<{ key: SectionKey; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
    { key: 'forge', label: 'FORGE', icon: Gem },
    { key: 'barracks', label: 'VAULT', icon: Search },
    { key: 'train', label: 'TRAIN', icon: Swords },
    { key: 'duel', label: 'DUEL', icon: Swords },
    { key: 'ladder', label: 'RANKED', icon: Trophy },
    { key: 'chronicle', label: 'CHRONICLE', icon: Shield },
  ];
  const [route, setRoute] = useState<'landing' | 'login' | 'dashboard'>('landing');
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

  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [character, setCharacter] = useState<CharacterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedHeroes, setSavedHeroes] = useState<SavedHero[]>([]);
  const [activeSection, setActiveSection] = useState<SectionKey>('barracks');
  const [materials, setMaterials] = useState<MaterialInventory>(createEmptyInventory());
  const [forgeSpend, setForgeSpend] = useState<MaterialInventory>(createEmptyInventory());
  const [lastForgeInfusion, setLastForgeInfusion] = useState<MaterialInventory>(createEmptyInventory());
  const [forgeSessionKey, setForgeSessionKey] = useState(0);
  const [duelAId, setDuelAId] = useState<string>('');
  const [duelBId, setDuelBId] = useState<string>('');
  const [duelAIds, setDuelAIds] = useState<[string, string, string]>(createEmptyTeamSlots());
  const [duelBIds, setDuelBIds] = useState<[string, string, string]>(createEmptyTeamSlots());
  const [duelLogs, setDuelLogs] = useState<string[]>([]);
  const [duelSummary, setDuelSummary] = useState<string>('');
  const [duelSize, setDuelSize] = useState<DuelSize>('1v1');
  const [selectedVaultId, setSelectedVaultId] = useState<string>('');
  const [vaultSort, setVaultSort] = useState<VaultSort>('date');
  const [vaultQuery, setVaultQuery] = useState('');
  const [vaultRarityFilter, setVaultRarityFilter] = useState<Rarity | 'all'>('all');
  const [selectingDuelSlot, setSelectingDuelSlot] = useState<{ team: 'A' | 'B'; index: number } | null>(null);
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const [battleEvents, setBattleEvents] = useState<BattleEvent[]>([]);
  const [battleHeroes, setBattleHeroes] = useState<{ a: SavedHero; b: SavedHero } | null>(null);
  const [showBattle, setShowBattle] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);

  const reloadCollections = async (tokenArg?: string | null) => {
    const token = tokenArg ?? session?.token ?? getStoredToken();
    if (!token) return [];
    try {
      const heroRecords = await fetchHeroes(token);
      const heroes = heroRecords.map((record: any) => ({
        id: record.id,
        createdAt: new Date(record.created_at).getTime() || Date.now(),
        character: normalizeCharacterData(record.hero_payload),
        infusedMaterials: createEmptyInventory(),
        pvpLifeState: record.pvp_life_state,
        pveLifeState: record.pve_life_state,
        cardStatus: record.card_status,
        lockedReason: record.locked_reason,
        pvpDeadAt: record.pvp_dead_at,
        decomposedAt: record.decomposed_at,
        activePvpEntryId: record.active_pvp_entry_id,
      }));
      setSavedHeroes(heroes);
      try {
        setEconomy(await fetchEconomy(token));
      } catch (err) {}
      return heroes;
    } catch {}
    return [];
  };

  useEffect(() => {
    const boot = async () => {
      const stored = getStoredSession();
      if (!stored) { setBooting(false); return; }
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
        clearStoredSession();
        setSession(null);
      } finally {
        setBooting(false);
      }
    };
    void boot();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const handleMockLogin = () => {
    const mockSession = { token: 'mock-token', email: 'test@example.com', expiresAt: new Date(Date.now() + 86400000).toISOString() };
    const mockUser = { id: 'mock-user', email: 'test@example.com', username: 'Tester', created_at: new Date().toISOString() } as AuthUser;
    setSession(mockSession);
    setUser(mockUser);
    setRoute('dashboard');
  };

  const handleRequestCode = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) { setAuthError('Enter email.'); return; }
    setSending(true); setAuthError(''); setAuthMessage('');
    try {
      await requestLoginCode(cleanEmail);
      setCodeSent(true); setCooldown(LOGIN_RESEND_SECONDS);
      setAuthMessage('Code sent.');
    } catch (error: any) { setAuthError(error.message); } finally { setSending(false); }
  };

  const handleVerifyCode = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();
    if (!cleanEmail || !cleanCode) { setAuthError('Enter both.'); return; }
    setVerifying(true); setAuthError(''); setAuthMessage('');
    try {
      const result = await verifyLoginCode(cleanEmail, cleanCode);
      setSession({ token: result.token, email: result.user.email, expiresAt: result.expires_at });
      setUser(result.user);
      setCode(''); setCodeSent(false); setCooldown(0);
      setRoute('dashboard');
      await reloadCollections(result.token);
    } catch (error: any) { setAuthError(error.message); } finally { setVerifying(false); }
  };

  useEffect(() => {
    localStorage.setItem(MATERIAL_STORAGE_KEY, JSON.stringify(materials));
  }, [materials]);

  const selectForgeMaterial = (key: MaterialKey | null) => {
    const next = createEmptyInventory();
    if (key && materials[key] > 0) {
      next[key] = 1;
    }
    setForgeSpend(next);
    setMaterialPickerOpen(false);
  };

  const handleImageSelect = async (file: File) => {
    const spendSnapshot = createEmptyInventory();
    const selectedKey = MATERIAL_DEFINITIONS.find(({ key }) => forgeSpend[key] > 0 && materials[key] > 0)?.key;
    if (selectedKey) {
      spendSnapshot[selectedKey] = 1;
    }
    const base64Image = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    setImage(base64Image);
    setLoading(true);
    setCharacter(null);
    setError(null);

    try {
      const token = session?.token ?? getStoredToken();
      if (!token) throw new Error("Not logged in");

      const heroData = await forgeHero(file, spendSnapshot, token);

      setTimeout(() => {
        setCharacter(normalizeCharacterData(heroData));
        setLastForgeInfusion(spendSnapshot);
        setSelectedVaultId('');
        void reloadCollections(token);
        setMaterials((prev) => {
          const next = { ...prev };
          MATERIAL_DEFINITIONS.forEach(({ key }) => {
            next[key] = Math.max(0, next[key] - spendSnapshot[key]);
          });
          return next;
        });
        setForgeSpend(createEmptyInventory());
        setLoading(false);
      }, 1000);

    } catch (err) {
      console.error(err);
      setError('Forging failed. The soul essence was rejected.');
      setLoading(false);
      setImage(null);
    }
  };

  const resetForge = () => {
    setImage(null);
    setCharacter(null);
    setError(null);
    setLastForgeInfusion(createEmptyInventory());
    setForgeSpend(createEmptyInventory());
    setMaterialPickerOpen(false);
    setForgeSessionKey((prev) => prev + 1);
  };

  const removeHero = (id: string) => {
    setSavedHeroes((prev) => prev.filter((hero) => hero.id !== id));
    if (duelAId === id) setDuelAId('');
    if (duelBId === id) setDuelBId('');
    setDuelAIds((prev) => prev.map((slot) => (slot === id ? '' : slot)) as [string, string, string]);
    setDuelBIds((prev) => prev.map((slot) => (slot === id ? '' : slot)) as [string, string, string]);
  };

  const selectedVaultHero = useMemo(() => savedHeroes.find((hero) => hero.id === selectedVaultId) ?? null, [savedHeroes, selectedVaultId]);
  const forgePreviewHero = character;
  const forgePreviewImage = image;
  const forgedCardInfusions = useMemo(
    () =>
      MATERIAL_DEFINITIONS.filter(({ key }) => (lastForgeInfusion[key] ?? 0) > 0).map((material) => ({
        label: material.label,
        count: lastForgeInfusion[material.key],
        overlayClass: material.overlayClass,
        particleClass: material.particleClass,
      })),
    [lastForgeInfusion]
  );
  const selectedCardInfusions = useMemo(
    () =>
      MATERIAL_DEFINITIONS.filter(({ key }) => (selectedVaultHero?.infusedMaterials?.[key] ?? 0) > 0).map((material) => ({
        label: material.label,
        count: selectedVaultHero?.infusedMaterials?.[material.key] ?? 0,
        overlayClass: material.overlayClass,
        particleClass: material.particleClass,
      })),
    [selectedVaultHero]
  );
  const relicEntries = economy?.relics ?? [];
  const relicCatalogByType = useMemo<Record<string, RelicDefinition>>(
    () => Object.fromEntries((economy?.relic_catalog ?? []).map((relic) => [relic.relic_type, relic])),
    [economy]
  );
  const collectionAverageBP = useMemo(() => {
    if (savedHeroes.length === 0) return 0;
    return Math.round(savedHeroes.reduce((sum, hero) => sum + toBP(hero), 0) / savedHeroes.length);
  }, [savedHeroes]);
  const strongestHero = useMemo(() => {
    if (savedHeroes.length === 0) return null;
    return [...savedHeroes].sort((a, b) => toBP(b) - toBP(a))[0];
  }, [savedHeroes]);
  const vaultCards = useMemo(() => {
    let result = [...savedHeroes];
    if (vaultQuery.trim()) {
      const query = vaultQuery.trim().toLowerCase();
      result = result.filter((hero) => hero.character.name.toLowerCase().includes(query));
    }
    if (vaultRarityFilter !== 'all') {
      result = result.filter((hero) => calculateRarity(toBP(hero)) === vaultRarityFilter);
    }
    result.sort((a, b) => {
      if (vaultSort === 'bp') return toBP(b) - toBP(a);
      if (vaultSort === 'name') return a.character.name.localeCompare(b.character.name);
      return b.createdAt - a.createdAt;
    });
    return result;
  }, [savedHeroes, vaultQuery, vaultSort, vaultRarityFilter]);



  const selectedForgeMaterialKey = useMemo(
    () => MATERIAL_DEFINITIONS.find(({ key }) => forgeSpend[key] > 0)?.key ?? null,
    [forgeSpend]
  );
  const selectedForgeMaterial = useMemo(
    () => MATERIAL_DEFINITIONS.find(({ key }) => key === selectedForgeMaterialKey) ?? null,
    [selectedForgeMaterialKey]
  );
  const runSandboxBattle = async () => {
    setBattleResult(null);
    setBattleEvents([]);
    setShowBattle(false);

    if (duelSize === '3v3') {
      const teamAIds = duelAIds.filter(Boolean);
      const teamBIds = duelBIds.filter(Boolean);
      if (teamAIds.length !== 3 || teamBIds.length !== 3) {
        setDuelSummary('3v3 需要双方各选择 3 张不同卡牌');
        setDuelLogs([]);
        return;
      }

      const teamA = teamAIds
        .map((id) => savedHeroes.find((hero) => hero.id === id))
        .filter((hero): hero is SavedHero => Boolean(hero));
      const teamB = teamBIds
        .map((id) => savedHeroes.find((hero) => hero.id === id))
        .filter((hero): hero is SavedHero => Boolean(hero));
      if (teamA.length !== 3 || teamB.length !== 3) {
        setDuelSummary('3v3 阵容存在无效卡牌，请重新选择');
        setDuelLogs([]);
        return;
      }

      const result = await runTeamDuel(teamA.map(h => h.character), teamB.map(h => h.character), '3v3', '练习A', '练习B');
      setDuelSummary(`${result.summary}（练习模式无材料奖励）`);
      setDuelLogs(result.logs);
      return;
    }
    // Sandbox 1v1
    const heroA = savedHeroes.find(h => h.id === duelAId);
    const heroB = savedHeroes.find(h => h.id === duelBId);

    if (!heroA || !heroB || heroA.id === heroB.id) {
      setDuelSummary('练习模式需要两张不同卡牌');
      setDuelLogs([]);
      return;
    }

    const result = await runTeamDuel([heroA.character], [heroB.character], '1v1', '练习A', '练习B');
    setDuelSummary(`${result.summary}（练习模式无材料奖励）`);
    setDuelLogs(result.logs);
    if (result.details) {
      setBattleResult(result.details);
      setBattleEvents(result.events);
      setBattleHeroes({ a: heroA, b: heroB });
      setShowBattle(true);
    }
  };

  const setDuelSlotHero = (team: 'A' | 'B', index: number, heroId: string) => {
    if (team === 'A') {
      if (duelSize === '1v1') {
        setDuelAId(heroId);
        return;
      }
      setDuelAIds((prev) => {
        const next = [...prev] as [string, string, string];
        next[index] = heroId;
        return next;
      });
      return;
    }
    if (duelSize === '1v1') {
      setDuelBId(heroId);
      return;
    }
    setDuelBIds((prev) => {
      const next = [...prev] as [string, string, string];
      next[index] = heroId;
      return next;
    });
  };

  const clearDuelSlot = (team: 'A' | 'B', index: number) => {
    if (team === 'A') {
      if (duelSize === '1v1') {
        setDuelAId('');
      } else {
        setDuelAIds((prev) => {
          const next = [...prev] as [string, string, string];
          next[index] = '';
          return next;
        });
      }
    } else if (duelSize === '1v1') {
      setDuelBId('');
    } else {
      setDuelBIds((prev) => {
        const next = [...prev] as [string, string, string];
        next[index] = '';
        return next;
      });
    }
    setBattleResult(null);
  };

  const activeSectionTitle = useMemo(() => {
    if (activeSection === 'barracks') return '牌库总览';
    if (activeSection === 'forge') return '英雄锻造';
    if (activeSection === 'duel') return '对战控制台';
    if (activeSection === 'ladder') return '天梯档案';
    return 'Chronicle';
  }, [activeSection]);
  const duelSlotIndices = duelSize === '3v3' ? [0, 1, 2] : [0];
  const duelAActiveIds = duelSize === '3v3' ? duelAIds : [duelAId];
  const duelBActiveIds = duelSize === '3v3' ? duelBIds : [duelBId];
  const duelReady = duelSize === '3v3'
    ? duelAActiveIds.every(Boolean) && duelBActiveIds.every(Boolean)
    : Boolean(duelAId) && Boolean(duelBId) && duelAId !== duelBId;
  const sidebarWidth = sidebarExpanded ? 232 : 92;

  const authPanel = (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="border border-stone-800 bg-black/55 p-6 backdrop-blur-xl w-full max-w-sm">
      <SectionHeader eyebrow="Access" title="Sign in with email" description="We'll send a one-time code to your inbox." />
      <div className="mt-6 space-y-4">
        <label className="block space-y-2">
          <span className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Email</span>
          <div className="flex items-center gap-3 border border-stone-800 bg-black/45 px-4 py-3 focus-within:border-gold-matte/50">
            <Mail size={16} className="text-stone-500" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="ui_zorrot@163.com" className="w-full bg-transparent text-sm text-stone-100 outline-none placeholder:text-stone-600" />
          </div>
        </label>
        <button type="button" onClick={handleRequestCode} disabled={sending || cooldown > 0 || !email.trim()} className="inline-flex w-full items-center justify-center gap-2 border border-gold-matte/25 bg-gold-matte/10 px-4 py-3 text-sm uppercase tracking-[0.22em] text-gold-100 transition hover:border-gold-matte/50 disabled:cursor-not-allowed disabled:opacity-50">
          {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
          {cooldown > 0 ? `Resend in ${cooldown}s` : codeSent ? 'Resend code' : 'Send code'}
        </button>
        {codeSent && (
          <>
            <label className="block space-y-2">
              <span className="text-[10px] uppercase tracking-[0.28em] text-stone-500">One-time code</span>
              <div className="flex items-center gap-3 border border-stone-800 bg-black/45 px-4 py-3 focus-within:border-gold-matte/50">
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
      </div>
    </motion.div>
  );

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
        <div className="relative z-10 w-full max-w-[1600px] h-full flex flex-col text-center">
          <LandingPage
            onNavigate={(sec) => { setActiveSection(sec as SectionKey); setRoute('dashboard'); }}
            onLogin={() => setRoute('login')}
            isAuthenticated={!!user}
          />
        </div>
      </div>
    );
  }

  if (route === 'login') {
    return (
      <div className="relative min-h-screen w-full bg-[#080808] text-stone-100 flex flex-col items-center justify-center p-4">
        <div className="relative z-10 w-full max-w-sm">
          {authPanel}
          <div className="mt-8 text-center">
            <button onClick={handleMockLogin} className="text-[10px] uppercase tracking-[0.2em] text-stone-500 hover:text-stone-300 underline underline-offset-4">Skip to Dashboard (Testing)</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080808]">
      <motion.div
        className="pointer-events-none absolute -left-24 top-16 h-72 w-72 bg-gold-matte/10 blur-3xl"
        animate={{ opacity: [0.25, 0.45, 0.25], scale: [1, 1.08, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute right-12 top-[34%] h-80 w-80 bg-violet-500/10 blur-3xl"
        animate={{ opacity: [0.12, 0.24, 0.12], x: [0, -16, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.aside
        animate={{ width: sidebarWidth }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed left-0 top-0 z-50 flex h-screen flex-col bg-black/60 py-8 backdrop-blur-xl ${sidebarExpanded ? '' : 'border-r border-stone-800/70'}`}
      >
        <button
          onClick={() => setSidebarExpanded((prev) => !prev)}
          className={`mb-8 flex items-center bg-transparent px-1 text-stone-500 transition-colors hover:text-stone-200 ${sidebarExpanded ? 'mx-auto gap-3' : 'mx-auto justify-center'}`}
        >
          <span className={`flex h-6 w-6 items-center justify-center transition-transform duration-300 ${sidebarExpanded ? 'rotate-180' : ''}`}>
            <ChevronRight size={16} />
          </span>
          <AnimatePresence>
            {sidebarExpanded && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="text-[10px] uppercase tracking-[0.25em] text-stone-500"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>
        <div className={`mb-14 w-full text-gold-matte ${sidebarExpanded ? 'px-6' : 'flex justify-center px-0'}`}>
          <AnimatePresence mode="wait">
            {sidebarExpanded ? (
              <motion.div
                key="logo-full"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="text-left"
              >
                <div className="text-[10px] font-light uppercase tracking-[0.3em] text-stone-500">CONSOLE</div>
                <AppLogo
                  className="mt-2"
                  iconClassName="h-7 w-7"
                  textClassName="text-[16px] tracking-[0.22em]"
                />
              </motion.div>
            ) : (
              <motion.div
                key="logo-mini"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center"
              >
                <AppLogo showText={false} iconClassName="h-8 w-8" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className={`flex flex-1 flex-col justify-center ${sidebarExpanded ? 'px-4' : 'items-center'} gap-2`}>
          {navItems.map((item, index) => {
            const isActive = activeSection === item.key;
            const Icon = item.icon;
            return (
              <motion.button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                whileHover={{ x: sidebarExpanded ? 4 : 0 }}
                whileTap={{ scale: 0.98 }}
                className={`group relative flex items-center ${sidebarExpanded ? 'w-full justify-between px-3 py-2' : 'justify-center py-2'} bg-transparent text-left`}
              >
                {isActive && (
                  <motion.span
                    layoutId="active-nav-marker"
                    className={`absolute left-0 top-1/2 h-[65%] w-[1px] -translate-y-1/2 bg-gold-matte ${sidebarExpanded ? '' : 'hidden'}`}
                  />
                )}
                <div className="flex items-center gap-3">
                  <Icon size={14} className={`transition-colors ${isActive ? 'text-gold-matte' : 'text-stone-500 group-hover:text-stone-300'}`} />
                  <AnimatePresence>
                    {sidebarExpanded && (
                      <motion.span
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        className={`text-[10px] uppercase tracking-[0.25em] transition-colors ${isActive ? 'text-gold-matte' : 'text-stone-500 group-hover:text-stone-300'}`}
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <AnimatePresence>
                  {sidebarExpanded && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-[10px] text-stone-700"
                    >
                      {(index + 1).toString().padStart(2, '0')}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>
        <div className={`mt-6 flex items-center ${sidebarExpanded ? 'justify-between px-6' : 'justify-center'} gap-3`}>
          <motion.span
            className="h-1.5 w-1.5 rotate-45 border border-stone-700"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <AnimatePresence>
            {sidebarExpanded && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[10px] font-light tracking-[0.2em] text-stone-600"
              >
                OFFLINE
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>

      <motion.main
        animate={{ marginLeft: sidebarWidth }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="h-screen overflow-y-auto overflow-x-hidden px-10 py-10"
      >
        <div className="mx-auto max-w-[1600px]">
          <motion.div
            key={`overview-${activeSection}`}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="mb-8 grid gap-6 border border-stone-800/70 bg-black/25 p-6 backdrop-blur-md lg:grid-cols-[1.3fr_1fr]"
          >
            <div className="border-r border-stone-800/70 pr-6">
              <p className="text-[10px] uppercase tracking-[0.25em] text-stone-500">OVERVIEW</p>
              <h1 className="mt-3 text-5xl font-light tracking-[0.3em] text-stone-200">
                {activeSection === 'forge' ? 'FORGE' : activeSection === 'barracks' ? 'VAULT' : activeSection === 'duel' ? 'DUEL' : activeSection === 'ladder' ? 'RANKED' : 'CHRONICLE'}
              </h1>
              <div className="mt-6 flex items-center gap-4">
                <div className="h-px w-16 bg-stone-700" />
                <div className="h-1.5 w-1.5 rotate-45 border border-stone-700" />
                <div className="h-px w-28 bg-stone-700" />
              </div>
            </div>
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="text-xs italic text-stone-500">"Illuminate the enemy"</p>
                <p className="mt-3 text-[10px] uppercase tracking-[0.25em] text-stone-600">{activeSectionTitle}</p>
              </div>
              <motion.div
                animate={{ boxShadow: ['0 0 0 rgba(0,0,0,0)', '0 0 24px rgba(187,138,74,0.12)', '0 0 0 rgba(0,0,0,0)'] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                className="border border-stone-800 bg-black/30 px-4 py-3"
              >
                <p className="text-[10px] font-light uppercase tracking-[0.2em] text-stone-500">CARDS</p>
                <p className="mt-1 text-2xl font-light text-gold-matte">{savedHeroes.length}</p>
              </motion.div>
            </div>
          </motion.div>

          <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
            <motion.aside
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="relative overflow-hidden border border-stone-800/70 bg-black/25 p-6 backdrop-blur-md"
            >
              <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-gold-matte/30 to-transparent" />
              <motion.div
                className="pointer-events-none absolute -left-1/3 top-0 h-px w-1/2 bg-gradient-to-r from-transparent via-gold-matte/70 to-transparent"
                animate={{ x: ['0%', '220%'] }}
                transition={{ duration: 4.4, repeat: Infinity, ease: 'linear' }}
              />
              <div className="mb-8 flex items-center justify-between">
                <h2 className="text-xs font-light uppercase tracking-[0.4em] text-gold-matte">{activeSectionTitle}</h2>
                <span className="border border-gold-matte/20 bg-gold-matte/5 px-2 py-1 text-[10px] font-light uppercase tracking-widest text-gold-matte/80">
                  {savedHeroes.length} CARDS
                </span>
              </div>
              <div className="mb-4 space-y-2">
                {savedHeroes.slice(0, 6).map((hero) => (
                  <motion.button
                    key={hero.id}
                    onClick={() => {
                      setSelectedVaultId(hero.id);
                      setActiveSection('barracks');
                    }}
                    whileHover={{ x: 3 }}
                    className={`flex w-full items-center gap-3 border p-2 text-left transition ${selectedVaultId === hero.id
                      ? 'border-gold-matte/50 bg-gold-matte/5'
                      : 'border-stone-800 bg-black/40 hover:border-stone-700'
                      }`}
                  >
                    <img src={hero.image} alt={hero.character.name} className="h-14 w-12 object-cover" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-light tracking-[0.08em] text-stone-100">{hero.character.name}</p>
                      <p className="text-[10px] font-light uppercase tracking-[0.16em] text-stone-400">BP {hero.character.BP}</p>
                    </div>
                  </motion.button>
                ))}
                {savedHeroes.length === 0 && <div className="border-y border-stone-800 bg-black/20 py-8 text-center text-[10px] uppercase tracking-widest text-stone-500">NO CARDS FORGED</div>}
              </div>
              <DailyActivity token={session?.token ?? getStoredToken()} onEconomyChange={setEconomy} />
              <div className="mt-6 border-t border-stone-800 pt-6">
                <p className="mb-4 text-[10px] font-light uppercase tracking-[0.3em] text-stone-500">Material Vault</p>
                <div className="max-h-48 space-y-3 overflow-auto pr-1">
                  {MATERIAL_DEFINITIONS.map((material) => (
                    <div key={material.key} className="flex items-center justify-between border border-stone-800 bg-black/30 px-2 py-1.5 transition-colors hover:border-stone-700">
                      <span className="text-[10px] uppercase tracking-wider text-stone-400">{material.label}</span>
                      <span className="text-xs font-light tracking-[0.12em] text-stone-300">{materials[material.key]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 border-t border-stone-800 pt-6">
                <p className="mb-4 text-[10px] font-light uppercase tracking-[0.3em] text-stone-500">Relic Vault</p>
                <div className="max-h-64 space-y-3 overflow-auto pr-1">
                  {relicEntries.length > 0 ? (
                    relicEntries.map((relic) => {
                      const definition = relicCatalogByType[relic.relic_type];
                      return (
                        <div
                          key={relic.relic_type}
                          className="border border-stone-800 bg-black/30 px-3 py-2 transition-colors hover:border-stone-700"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-[10px] uppercase tracking-[0.22em] text-stone-200">
                                {definition?.display_name ?? relic.relic_type}
                              </div>
                              <div className="mt-1 text-[9px] uppercase tracking-[0.28em] text-stone-500">
                                {definition?.family ?? 'Unknown'} / {definition?.tier ?? 'common'}
                              </div>
                            </div>
                            <div className="shrink-0 border border-stone-700 px-2 py-1 text-[10px] tracking-[0.22em] text-stone-300">
                              x{relic.amount}
                            </div>
                          </div>
                          {definition?.lore_summary && (
                            <p className="mt-2 line-clamp-2 text-[10px] leading-5 text-stone-500">
                              {definition.lore_summary}
                            </p>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="border-y border-stone-800 bg-black/20 py-8 text-center text-[10px] uppercase tracking-widest text-stone-500">
                      No relics bound
                    </div>
                  )}
                </div>
              </div>
            </motion.aside>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="relative w-full"
            >
              <div className="absolute inset-0 -z-10 border border-stone-800/70 bg-black/30 backdrop-blur-md" />
              <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-gold-matte/30 to-transparent" />
              <motion.div
                className="pointer-events-none absolute -left-1/3 top-0 h-px w-1/2 bg-gradient-to-r from-transparent via-gold-matte/70 to-transparent"
                animate={{ x: ['0%', '220%'] }}
                transition={{ duration: 5.4, repeat: Infinity, ease: 'linear' }}
              />
              <div className="p-8">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`section-${activeSection}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  >
                {activeSection === 'forge' && (
                  <div className="relative min-h-[740px] py-12">
                    <div className="mb-20 text-center">
                      <p className="mb-4 text-xs italic tracking-wide text-stone-600">"Illuminate the enemy"</p>
                      <h1 className="mb-4 text-5xl font-display font-light tracking-[0.25em] text-stone-200 md:text-6xl">
                        F O R G E
                      </h1>
                      <div className="mt-8 flex items-center justify-center gap-4">
                        <div className="h-1 w-1 rotate-45 border border-stone-800" />
                        <div className="divider-minimal w-32" />
                        <div className="h-1 w-1 rotate-45 border border-stone-800" />
                      </div>
                    </div>
                    <div className="mx-auto max-w-3xl space-y-4">
                      <div className="border border-stone-800/70 bg-black/25 p-6">
                        {loading ? (
                          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <Forge onImageSelect={() => { }} isForging={true} />
                          </motion.div>
                        ) : forgePreviewHero ? (
                          <motion.div key="hero-display" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8 border-t border-stone-900 pt-8">
                            <div className="mx-auto max-w-[280px] animate-fade-in">
                              <HeroCard character={forgePreviewHero!} image={forgePreviewImage!} infusions={forgedCardInfusions} />
                            </div>
                            <div className="text-center pt-8">
                              <button
                                onClick={resetForge}
                                className="cursor-pointer border-b border-stone-800 pb-1 text-[10px] tracking-[0.2em] text-stone-600 transition-all hover:text-stone-400"
                              >
                                FORGE NEW RELIC
                              </button>
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div key="forge" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <Forge key={forgeSessionKey} onImageSelect={handleImageSelect} isForging={false} error={error} previewUrl={forgePreviewImage} onClearPreview={resetForge} />
                          </motion.div>
                        )}
                      </div>
                      <div className="border border-stone-800/70 bg-black/30 p-4">
                        <button
                          onClick={() => setMaterialPickerOpen((prev) => !prev)}
                          className="flex w-full items-center justify-between border border-stone-800 bg-black/40 px-3 py-3 text-left transition-colors hover:border-stone-600"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Gem size={14} className="text-gold-matte" />
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">材料选择（单次仅一种）</p>
                              <p className="truncate text-sm text-stone-200">{selectedForgeMaterial?.label ?? '不使用材料'}</p>
                            </div>
                          </div>
                          <ChevronDown
                            size={14}
                            className={`text-stone-500 transition-transform ${materialPickerOpen ? 'rotate-180' : ''}`}
                          />
                        </button>
                        <AnimatePresence initial={false}>
                          {materialPickerOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              className="mt-3 space-y-2"
                            >
                              <button
                                onClick={() => selectForgeMaterial(null)}
                                className={`w-full border px-3 py-2 text-left transition-colors ${selectedForgeMaterialKey === null
                                  ? 'border-gold-matte/60 bg-gold-matte/10 text-gold-matte'
                                  : 'border-stone-800 bg-black/35 text-stone-400 hover:border-stone-600 hover:text-stone-200'
                                  }`}
                              >
                                <p className="text-xs tracking-[0.12em]">不使用材料</p>
                                <p className="mt-1 text-[10px] text-stone-500">按基础图像生成</p>
                              </button>
                              {MATERIAL_DEFINITIONS.map((material) => {
                                const selected = selectedForgeMaterialKey === material.key;
                                const disabled = materials[material.key] <= 0;
                                return (
                                  <button
                                    key={material.key}
                                    onClick={() => selectForgeMaterial(material.key)}
                                    disabled={disabled}
                                    className={`w-full border px-3 py-2 text-left transition-colors ${selected
                                      ? 'border-gold-matte/60 bg-gold-matte/10 text-gold-matte'
                                      : 'border-stone-800 bg-black/35 text-stone-300 hover:border-stone-600'
                                      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-xs tracking-[0.12em]">{material.label}</p>
                                      <span className="text-[10px] font-light tracking-[0.14em] text-stone-500">库存 {materials[material.key]}</span>
                                    </div>
                                    <p className="mt-1 text-[10px] text-stone-500">{material.effect}</p>
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                )}
                {activeSection === 'barracks' && (
                  <div className="relative min-h-[740px]">
                    {/* ── Page Title ── */}
                    <div className="mb-20 text-center">
                      <p className="text-stone-600 text-xs italic mb-4">"Archive of legends"</p>
                      <h1 className="text-5xl font-light text-stone-200 title-spaced mb-6">
                        V A U L T
                      </h1>
                      <div className="mb-8 flex items-center justify-center gap-4">
                        <div className="w-1 h-1 rotate-45 border border-stone-800"></div>
                        <div className="divider-minimal w-32"></div>
                        <div className="w-1 h-1 rotate-45 border border-stone-800"></div>
                      </div>

                      {/* Stats - Minimal */}
                      <div className="flex items-center justify-center gap-12 text-xs font-light uppercase tracking-[0.22em] text-stone-600">
                        <div>
                          <span className="text-2xl font-light text-gold-matte block mb-1">{savedHeroes.length}</span>
                          <span className="text-[10px] tracking-[0.24em]">TOTAL</span>
                        </div>
                        <div className="w-px h-8 bg-stone-800"></div>
                        <div>
                          <span className="text-2xl font-light text-stone-400 block mb-1">{collectionAverageBP}</span>
                          <span className="text-[10px] tracking-[0.24em]">AVG BP</span>
                        </div>
                        <div className="w-px h-8 bg-stone-800"></div>
                        <div>
                          <span className="text-2xl font-light text-stone-400 block mb-1">{strongestHero?.character?.name || 'N/A'}</span>
                          <span className="text-[10px] tracking-[0.24em]">STRONGEST</span>
                        </div>
                      </div>
                    </div>

                    {/* ── Filter Bar - Minimal Text Buttons ── */}
                    <div className="mb-12">
                      {/* Search */}
                      <div className="max-w-md mx-auto mb-8">
                        <input
                          type="text"
                          value={vaultQuery}
                          onChange={(e) => setVaultQuery(e.target.value)}
                          placeholder="Search by name..."
                          className="w-full bg-transparent border-0 border-b border-stone-800 px-0 py-3 text-stone-200 placeholder-stone-700 focus:outline-none focus:border-gold-matte transition-colors text-sm tracking-wider"
                        />
                      </div>

                      {/* Filters & Sort */}
                      <div className="flex items-center justify-center gap-8 text-[10px] font-light uppercase tracking-[0.22em]">
                        {/* Rarity Filter */}
                        <div className="flex items-center gap-3">
                          <span className="text-stone-600">RARITY</span>
                          <div className="flex items-center gap-2">
                            {(['all', 'mythic', 'epic', 'rare', 'common'] as const).map((rarity) => (
                              <button
                                key={rarity}
                                onClick={() => setVaultRarityFilter(rarity)}
                                className={`cursor-pointer whitespace-nowrap px-3 py-1 tracking-[0.2em] transition-colors ${vaultRarityFilter === rarity
                                  ? 'text-gold-matte border-b border-gold-matte'
                                  : 'text-stone-600 hover:text-stone-400'
                                  }`}
                              >
                                {rarity.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="w-px h-4 bg-stone-800"></div>

                        {/* Sort */}
                        <div className="flex items-center gap-3">
                          <span className="text-stone-600">SORT</span>
                          <div className="flex items-center gap-2">
                            {([
                              { value: 'date', label: 'LATEST' },
                              { value: 'bp', label: 'POWER' },
                              { value: 'name', label: 'NAME' },
                            ] as const).map(opt => (
                              <button
                                key={opt.value}
                                onClick={() => setVaultSort(opt.value)}
                                className={`cursor-pointer whitespace-nowrap px-3 py-1 tracking-[0.2em] transition-colors ${vaultSort === opt.value
                                  ? 'text-gold-matte border-b border-gold-matte'
                                  : 'text-stone-600 hover:text-stone-400'
                                  }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    {vaultCards.length > 0 ? (
                      <div className="grid grid-cols-3 gap-x-12 gap-y-16">
                        {vaultCards.map((hero) => {
                          const heroInfusions = MATERIAL_DEFINITIONS.filter(({ key }) => (hero.infusedMaterials?.[key] ?? 0) > 0).map((material) => ({
                            label: material.label,
                            count: hero.infusedMaterials?.[material.key] ?? 0,
                            overlayClass: material.overlayClass,
                            particleClass: material.particleClass,
                          }));

                          return (
                            <div key={`barracks-grid-${hero.id}`} className="group relative h-[305px]">
                              <HeroCard
                                character={hero.character}
                                image={hero.image}
                                infusions={heroInfusions}
                                compact={true}
                                onClick={() => setSelectedVaultId(hero.id)}
                                className="h-full w-full cursor-pointer transition-all duration-300 group-hover:-translate-y-2"
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex h-96 flex-col items-center justify-center border border-stone-800 bg-black/20 text-center">
                        <div className="mb-6 flex h-16 w-16 items-center justify-center border border-stone-800 bg-black/30 rotate-45">
                          <Search size={24} className="text-stone-600 -rotate-45" />
                        </div>
                        <h3 className="text-sm tracking-[0.3em] font-light uppercase text-stone-500">No Relics Found</h3>
                        <p className="mt-2 text-[10px] tracking-widest text-stone-600">Adjust parameters or forge anew.</p>
                      </div>
                    )}
                    <AnimatePresence>
                      {selectedVaultHero && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md md:p-8"
                          onClick={() => setSelectedVaultId('')}
                        >
                          <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 40 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 40 }}
                            onClick={(e) => e.stopPropagation()}
                            className="relative flex h-full max-h-[800px] w-full max-w-6xl flex-col overflow-hidden border border-stone-800 bg-black md:flex-row"
                          >
                            <button
                              onClick={() => setSelectedVaultId('')}
                              className="absolute right-6 top-6 z-50 border border-stone-700 bg-black/60 p-3 text-stone-400 transition-colors hover:border-stone-500 hover:text-stone-100"
                            >
                              <X size={24} />
                            </button>
                            <div className="flex items-center justify-center border-b border-stone-800 bg-black/40 p-10 md:w-5/12 md:border-b-0 md:border-r">
                              <HeroCard
                                character={selectedVaultHero?.character}
                                image={selectedVaultHero?.image}
                                infusions={selectedCardInfusions}
                                className="h-[460px] w-[320px]"
                              />
                            </div>
                            <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-8 md:p-10">
                              <div className="border-b border-stone-800 pb-4">
                                <h3 className="text-3xl font-light tracking-[0.08em] text-stone-100">{selectedVaultHero?.character.name}</h3>
                                <p className="mt-1 text-xs tracking-[0.2em] text-gold-matte">BP {selectedVaultHero?.character.BP}</p>
                              </div>
                              {selectedCardInfusions.length > 0 && (
                                <div className="border border-stone-800 bg-black/30 p-4">
                                  <p className="mb-3 text-xs font-light uppercase tracking-[0.2em] text-stone-500">Infused Materials</p>
                                  <div className="flex flex-wrap gap-2">
                                    {selectedCardInfusions.map((inf, i) => (
                                      <span key={i} className="border border-stone-700 px-2 py-1 text-xs text-stone-300">
                                        {inf.label} x{inf.count}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="border border-stone-800 bg-black/40 px-3 py-2">ATK {selectedVaultHero?.character.state.ATK}</div>
                                <div className="border border-stone-800 bg-black/40 px-3 py-2">DEF {selectedVaultHero?.character.state.DEF}</div>
                                <div className="border border-stone-800 bg-black/40 px-3 py-2">SPD {selectedVaultHero?.character.state.SPEED}</div>
                                <div className="border border-stone-800 bg-black/40 px-3 py-2">CRT {selectedVaultHero?.character.state.CC}</div>
                              </div>
                              <div className="border border-stone-800 bg-black/30 p-4">
                                <p className="mb-3 text-xs font-light uppercase tracking-[0.2em] text-stone-500">Skills</p>
                                <div className="grid gap-3">
                                  {[selectedVaultHero?.character.skill.s1, selectedVaultHero?.character.skill.s2].map((skill, idx) => (
                                    <div key={`${skill.name}-${idx}`} className="border border-stone-700 bg-black/40 p-3">
                                      <div className="mb-2 flex items-center justify-between gap-3">
                                        <p className="truncate text-sm font-light tracking-wide text-stone-100">{skill.name || `Skill ${idx + 1}`}</p>
                                        <span className="border border-stone-700 px-2 py-0.5 text-[10px] uppercase tracking-widest text-stone-400">
                                          MP {skill.MP_COST || '0'}
                                        </span>
                                      </div>
                                      <p className="text-xs leading-6 text-stone-300">{skill.description || 'No description available.'}</p>
                                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wider">
                                        <span className="border border-stone-700 px-2 py-1 text-stone-300">{skill.TYPE || 'N/A'}</span>
                                        <span className="border border-stone-700 px-2 py-1 text-stone-300">DMG {skill.DMG || '0'}</span>
                                        <span className="border border-stone-700 px-2 py-1 text-stone-300">{skill.TARGET || 'single'} x{skill.TARGET_NUM || '1'}</span>
                                        {skill.IS_STUN === 'True' && (
                                          <span className="border border-gold-matte/40 px-2 py-1 text-gold-matte">Stun</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="flex-1 border border-stone-800 bg-black/30 p-4 text-sm leading-7 text-stone-300">
                                {selectedVaultHero?.character.description}
                              </div>
                              <div className="flex gap-3 border-t border-stone-800 pt-5">
                                <button
                                  onClick={() => {
                                    if (duelSize === '3v3') {
                                      const aIndex = duelAIds.findIndex((id) => !id);
                                      if (aIndex >= 0) setDuelSlotHero('A', aIndex, selectedVaultHero?.id);
                                      else {
                                        const bIndex = duelBIds.findIndex((id) => !id);
                                        if (bIndex >= 0) setDuelSlotHero('B', bIndex, selectedVaultHero?.id);
                                        else setDuelSlotHero('A', 0, selectedVaultHero?.id);
                                      }
                                    } else if (!duelAId) setDuelAId(selectedVaultHero?.id);
                                    else if (!duelBId && duelAId !== selectedVaultHero?.id) setDuelBId(selectedVaultHero?.id);
                                    else setDuelAId(selectedVaultHero?.id);
                                    setSelectedVaultId('');
                                    setActiveSection('train');
                                  }}
                                  className="flex-1 border border-gold-matte/40 bg-gold-matte/10 px-6 py-3 text-sm font-light uppercase tracking-[0.2em] text-gold-100 transition-colors hover:border-gold-matte/70 hover:bg-gold-matte/15"
                                >
                                  Deploy to Training
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Are you sure you want to dismantle this unit? This action cannot be undone.')) {
                                      removeHero(selectedVaultHero?.id);
                                      setSelectedVaultId('');
                                    }
                                  }}
                                  className="border border-stone-700 px-6 py-3 text-sm font-light uppercase tracking-[0.2em] text-stone-400 transition-colors hover:border-stone-500 hover:text-stone-200"
                                >
                                  Dismantle
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
                {activeSection === 'train' && (
                  <div className="relative min-h-[740px] font-light">
                    <AnimatePresence>
                      {showBattle && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 z-[100] bg-black"
                        >
                          {(() => {
                            if (battleHeroes && battleEvents.length > 0) {
                              return (
                                <BattleVisualizer
                                  heroA={battleHeroes?.a.character}
                                  heroB={battleHeroes?.b.character}
                                  onClose={() => setShowBattle(false)}
                                  result={battleResult}
                                />
                              );
                            }
                            return null;
                          })()}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Arena Ambient Background */}
                    <div className="relative z-10 mb-20 text-center">
                      <div className="flex items-center justify-center gap-6 mb-4">
                        <div className="w-12 h-[0.5px] bg-stone-700" />
                        <div className="w-2 h-2 rotate-45 border border-stone-700" />
                        <div className="w-12 h-[0.5px] bg-stone-700" />
                      </div>
                      <h1 className="text-5xl font-display text-stone-200 mb-3 title-spaced">
                        A R E N A
                      </h1>
                      <p className="text-stone-500 italic text-sm">"Illuminate the enemy"</p>
                      <div className="flex items-center justify-center gap-6 mt-4">
                        <div className="w-12 h-[0.5px] bg-stone-700" />
                        <div className="w-2 h-2 rotate-45 border border-stone-700" />
                        <div className="w-12 h-[0.5px] bg-stone-700" />
                      </div>

                      {/* Duel Size Controller */}
                      <div className="flex items-center justify-center gap-8 mt-12">
                        <div className="flex items-center gap-4">
                          {(['1v1', '3v3'] as const).map((size) => (
                            <button
                              key={size}
                              onClick={() => {
                                setDuelSize(size);
                                setBattleResult(null);
                                setShowBattle(false);
                              }}
                              className={`text-[10px] font-light uppercase tracking-[0.3em] transition-all hover:text-gold-300 ${duelSize === size ? 'text-gold-400 border-b border-gold-400 pb-1' : 'text-stone-500'
                                }`}
                            >
                              {size} MODE
                            </button>
                          ))}
                        </div>
                        <div className="w-px h-4 bg-stone-800" />
                        <div className="flex items-center gap-3">
                          <div className={`h-1.5 w-1.5 rotate-45 border ${battleResult ? 'border-gold-matte bg-gold-matte/40' : 'border-stone-700 bg-transparent'}`} />
                          <span className="text-[10px] font-light uppercase tracking-widest text-stone-400">
                            {battleResult ? 'Combat Finished' : 'Simulation Ready'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Main Battle Stage */}
                    <div className="relative z-10 flex flex-1 flex-col items-center justify-center p-8 md:flex-row md:gap-12">

                      {/* Player A Zone */}
                      <div className="flex flex-col items-center gap-4">
                        <div className={`grid ${duelSize === '3v3' ? 'grid-cols-1 gap-4' : 'grid-cols-1 gap-6'}`}>
                          {duelSlotIndices.map((slotIndex) => {
                            const heroId = duelAActiveIds[slotIndex] ?? '';
                            const hero = heroId ? savedHeroes.find((h) => h.id === heroId) : null;
                            if (hero) {
                              const infusions = MATERIAL_DEFINITIONS.filter(({ key }) => (hero.infusedMaterials?.[key] ?? 0) > 0).map((material) => ({
                                label: material.label,
                                count: hero.infusedMaterials?.[material.key] ?? 0,
                                overlayClass: material.overlayClass,
                                particleClass: material.particleClass,
                              }));
                              const isWinner = battleResult?.winner === hero.character.name;
                              return (
                                <div key={`duel-a-slot-${slotIndex}`} className="relative">
                                  <HeroCard
                                    character={hero.character}
                                    image={hero.image}
                                    infusions={infusions}
                                    compact={true}
                                    className={`${duelSize === '3v3' ? 'h-[220px] w-[170px]' : 'h-[440px] w-[280px]'} transition-all duration-500 ${isWinner ? 'scale-[1.01] border border-gold-matte/60' : ''} ${battleResult && !isWinner && battleResult?.winner !== '平局' ? 'grayscale opacity-60 scale-95' : ''}`}
                                  />
                                  <button
                                    onClick={() => clearDuelSlot('A', slotIndex)}
                                    className="absolute -right-3 -top-3 z-50 flex h-8 w-8 items-center justify-center border border-stone-700 bg-black text-stone-400 transition-colors hover:border-stone-500 hover:text-stone-100"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              );
                            }
                            return (
                              <button
                                key={`duel-a-slot-${slotIndex}`}
                                onClick={() => setSelectingDuelSlot({ team: 'A', index: slotIndex })}
                                className={`group relative flex ${duelSize === '3v3' ? 'h-[220px] w-[170px]' : 'h-[440px] w-[280px]'} flex-col items-center justify-center gap-4 border border-dashed border-stone-800 bg-black/30 transition-all hover:border-gold-matte/50`}
                              >
                                <div className="flex h-16 w-16 items-center justify-center border border-stone-800 bg-black transition-colors group-hover:border-gold-matte/40">
                                  <Plus size={24} className="text-stone-600 transition-colors group-hover:text-gold-matte/80" />
                                </div>
                                <div className="text-center">
                                  <p className="text-xs font-light uppercase tracking-[0.2em] text-stone-500 group-hover:text-stone-300">Select Fighter</p>
                                  <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-stone-600">Slot A{slotIndex + 1}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* VS Controller */}
                      <div className="flex flex-col items-center justify-center gap-8 py-8 md:py-0">
                        <div className="flex flex-col items-center justify-center -mt-8">
                          <div className="w-[0.5px] h-24 bg-stone-800 mb-6" />
                          <div className="text-4xl font-display text-stone-700 title-spaced">
                            VS
                          </div>
                          <div className="w-[0.5px] h-24 bg-stone-800 mt-6" />
                        </div>

                        <button
                          onClick={runSandboxBattle}
                          disabled={!duelReady}
                          className="group relative px-16 py-4 border border-stone-800 text-stone-400 disabled:opacity-30 disabled:cursor-not-allowed hover:border-gold-400/50 hover:text-gold-400 transition-all duration-300 bg-transparent cursor-pointer"
                        >
                          <span className="text-sm title-spaced">{battleResult?.winner ? 'REMATCH' : 'ENGAGE'}</span>
                          <div className="absolute inset-0 border border-gold-400/0 group-hover:border-gold-400/20 transition-all duration-300 pointer-events-none" style={{ margin: '4px' }} />
                        </button>
                      </div>

                      {/* Player B Zone */}
                      <div className="flex flex-col items-center gap-4">
                        <div className={`grid ${duelSize === '3v3' ? 'grid-cols-1 gap-4' : 'grid-cols-1 gap-6'}`}>
                          {duelSlotIndices.map((slotIndex) => {
                            const heroId = duelBActiveIds[slotIndex] ?? '';
                            const hero = heroId ? savedHeroes.find((h) => h.id === heroId) : null;
                            if (hero) {
                              const infusions = MATERIAL_DEFINITIONS.filter(({ key }) => (hero.infusedMaterials?.[key] ?? 0) > 0).map((material) => ({
                                label: material.label,
                                count: hero.infusedMaterials?.[material.key] ?? 0,
                                overlayClass: material.overlayClass,
                                particleClass: material.particleClass,
                              }));
                              const isWinner = battleResult?.winner === hero.character.name;
                              return (
                                <div key={`duel-b-slot-${slotIndex}`} className="relative">
                                  <HeroCard
                                    character={hero.character}
                                    image={hero.image}
                                    infusions={infusions}
                                    compact={true}
                                    className={`${duelSize === '3v3' ? 'h-[220px] w-[170px]' : 'h-[440px] w-[280px]'} transition-all duration-500 ${isWinner ? 'scale-[1.01] border border-gold-matte/60' : ''} ${battleResult && !isWinner && battleResult?.winner !== '平局' ? 'grayscale opacity-60 scale-95' : ''}`}
                                  />
                                  <button
                                    onClick={() => clearDuelSlot('B', slotIndex)}
                                    className="absolute -right-3 -top-3 z-50 flex h-8 w-8 items-center justify-center border border-stone-700 bg-black text-stone-400 transition-colors hover:border-stone-500 hover:text-stone-100"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              );
                            }
                            return (
                              <button
                                key={`duel-b-slot-${slotIndex}`}
                                onClick={() => setSelectingDuelSlot({ team: 'B', index: slotIndex })}
                                className={`group relative flex ${duelSize === '3v3' ? 'h-[220px] w-[170px]' : 'h-[440px] w-[280px]'} flex-col items-center justify-center gap-4 border border-dashed border-stone-800 bg-black/30 transition-all hover:border-gold-matte/50`}
                              >
                                <div className="flex h-16 w-16 items-center justify-center border border-stone-800 bg-black transition-colors group-hover:border-gold-matte/40">
                                  <Plus size={24} className="text-stone-600 transition-colors group-hover:text-gold-matte/80" />
                                </div>
                                <div className="text-center">
                                  <p className="text-xs font-light uppercase tracking-[0.2em] text-stone-500 group-hover:text-stone-300">Select Fighter</p>
                                  <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-stone-600">Slot B{slotIndex + 1}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Battle Log Console */}
                    <div className="border-t border-stone-800 bg-black/40 p-4 backdrop-blur-md">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-1.5 animate-pulse rotate-45 border border-gold-matte/60 bg-gold-matte/30" />
                          <span className="text-[10px] font-light uppercase tracking-[0.2em] text-stone-500">System Log</span>
                        </div>
                        {duelSummary && <span className="text-xs font-light text-gold-matte">{duelSummary}</span>}
                      </div>
                      <div className="h-32 overflow-auto border border-stone-800 bg-black/60 p-3 text-xs font-light tracking-[0.08em]">
                        {duelLogs.length === 0 ? (
                          <div className="flex h-full items-center justify-center text-stone-700">
                            <p>[SYSTEM] Awaiting combat initiation sequence...</p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {duelLogs.map((log, idx) => (
                              <div key={idx} className="flex gap-3 text-stone-400 transition-colors hover:bg-white/5 hover:text-stone-200">
                                <span className="w-8 shrink-0 select-none text-right text-stone-700">{(idx + 1).toString().padStart(2, '0')}</span>
                                <span>{log}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Victory Overlay */}
                    <AnimatePresence>
                      {battleResult && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                        >
                          <motion.div
                            initial={{ scale: 0.5, y: 50 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.5, y: 50 }}
                            className="relative flex flex-col items-center border border-stone-800 bg-black/60 px-16 py-14"
                          >
                            <h2 className="text-6xl font-light tracking-[0.25em] text-gold-matte/90">
                              {battleResult?.winner === '平局' ? 'DRAW' : 'VICTORY'}
                            </h2>
                            <div className="mt-4 flex items-center gap-4">
                              <div className="h-[1px] w-12 bg-stone-700" />
                              <p className="text-lg font-light uppercase tracking-[0.3em] text-stone-200">
                                {battleResult?.winner === '平局' ? 'No Winner' : battleResult?.winner}
                              </p>
                              <div className="h-[1px] w-12 bg-stone-700" />
                            </div>
                            <button
                              onClick={() => setBattleResult(null)}
                              className="mt-12 border border-stone-700 px-8 py-2 text-xs font-light uppercase tracking-[0.2em] text-stone-400 transition-colors hover:border-stone-500 hover:text-stone-200"
                            >
                              Dismiss Overlay
                            </button>
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Hero Selection Modal */}
                    <AnimatePresence>
                      {selectingDuelSlot && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-6"
                          onClick={() => setSelectingDuelSlot(null)}
                        >
                          <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex h-[80vh] w-full max-w-6xl flex-col overflow-hidden border border-stone-800 bg-black"
                          >
                            <div className="flex items-center justify-between border-b border-stone-800 bg-black/60 px-8 py-6">
                              <div>
                                <h3 className="text-2xl font-light tracking-[0.08em] text-stone-100">Select Combatant</h3>
                                <p className="text-xs uppercase tracking-widest text-stone-500">
                                  Deploy unit to Slot {selectingDuelSlot?.team}{selectingDuelSlot?.index + 1}
                                </p>
                              </div>
                              <button onClick={() => setSelectingDuelSlot(null)} className="border border-stone-700 bg-black p-2 text-stone-400 transition-colors hover:border-stone-500 hover:text-stone-100">
                                <X size={20} />
                              </button>
                            </div>
                            <div className="flex-1 overflow-y-auto bg-black/40 p-8">
                              <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                                {savedHeroes.map((hero) => {
                                  const heroInfusions = MATERIAL_DEFINITIONS.filter(({ key }) => (hero.infusedMaterials?.[key] ?? 0) > 0).map((material) => ({
                                    label: material.label,
                                    count: hero.infusedMaterials?.[material.key] ?? 0,
                                    overlayClass: material.overlayClass,
                                    particleClass: material.particleClass,
                                  }));
                                  const selectedInTeam = selectingDuelSlot?.team === 'A' ? duelAActiveIds : duelBActiveIds;
                                  const oppositeTeam = selectingDuelSlot?.team === 'A' ? duelBActiveIds : duelAActiveIds;
                                  const isSelected = selectedInTeam[selectingDuelSlot?.index] === hero.id;
                                  const isDisabled = oppositeTeam.includes(hero.id);

                                  return (
                                    <div key={`duel-select-${hero.id}`} className={`relative group ${isDisabled ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
                                      <div className="relative">
                                        <HeroCard
                                          character={hero.character}
                                          image={hero.image}
                                          infusions={heroInfusions}
                                          compact={true}
                                          isSelected={isSelected}
                                          onClick={() => {
                                            setDuelSlotHero(selectingDuelSlot?.team, selectingDuelSlot?.index, hero.id);
                                            setSelectingDuelSlot(null);
                                          }}
                                          className="w-full aspect-[3/4] cursor-pointer transition-transform group-hover:-translate-y-1"
                                        />
                                      </div>
                                      {isDisabled && (
                                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-[1px]">
                                          <span className="border border-stone-600 bg-black/80 px-2 py-1 text-[10px] uppercase text-stone-400">Deployed</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
                {activeSection === 'chronicle' && (
                  <div className="flex min-h-[740px] items-center justify-center">
                    <div className="w-full max-w-xl border border-stone-800 bg-black/40 p-8 text-center ring-1 ring-[#c59a5a]/20">
                      <h3 className="text-2xl font-light tracking-[0.08em] text-gold-matte">Chronicle Mode</h3>
                      <p className="mt-3 leading-7 text-sm text-stone-400">A mysterious PvE challenge campaign. Earn exclusive materials and conquer pre-configured boss nodes.</p>
                      <button className="mt-6 border border-stone-800 px-6 py-2 text-xs uppercase tracking-widest text-stone-500 cursor-not-allowed">
                        Initializing...
                      </button>
                    </div>
                  </div>
                )}
                {activeSection === 'duel' && (
                  <PvpArena
                    heroes={savedHeroes}
                    economy={economy}
                    token={session?.token ?? getStoredToken()}
                    onRefresh={async () => {
                      await reloadCollections();
                    }}
                  />
                )}
                {activeSection === 'ladder' && (
                  <LadderPanel token={session?.token ?? getStoredToken()} />
                )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.section>

          </div>
        </div>
      </motion.main>
    </div>
  );
};

export default App;
