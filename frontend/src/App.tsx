import React, { useEffect, useMemo, useState } from 'react';
import { Crown, Gem, RotateCcw, Shield, Sparkles, Swords, Timer, X, Plus, Search } from 'lucide-react';
import { ParticleBackground } from './components/ParticleBackground';
import { HeroCard } from './components/HeroCard';
import { Forge } from './components/Forge';
import { BattleVisualizer } from './components/BattleVisualizer';
import { motion, AnimatePresence } from 'framer-motion';
import { forgeHero } from './lib/kimiService';
import { calculateRarity, type CharacterData, type Rarity } from './lib/gameLogic';
import { runTeamDuel } from './lib/battleLogic';
import type { SavedHero, MaterialKey, MaterialInventory, MaterialDefinition } from './types';
import type { BattleEvent, BattleResult } from './lib/battleTypes';

type SectionKey = 'barracks' | 'forge' | 'duel' | 'chronicle';
type DuelSize = '1v1' | '3v3';
type VaultSort = 'date' | 'bp' | 'name';

const STORAGE_KEY = 'hero_forge_saved_cards_v1';
const MATERIAL_STORAGE_KEY = 'hero_forge_material_inventory_v1';

const MATERIAL_DEFINITIONS: MaterialDefinition[] = [
  {
    key: 'glowGem',
    label: '辉光宝石',
    effect: '偏向光明、精准、速度',
    rewardTag: 'Luminous Gem',
    overlayClass: 'from-amber-200/35 via-yellow-300/15 to-transparent mix-blend-screen',
    particleClass: 'bg-amber-200/80',
    badgeClass: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
  },
  {
    key: 'chaosMind',
    label: '混沌心智',
    effect: '偏向暗影、爆发、控制',
    rewardTag: 'Chaos Mind',
    overlayClass: 'from-violet-500/35 via-fuchsia-500/20 to-transparent mix-blend-color-dodge',
    particleClass: 'bg-violet-300/80',
    badgeClass: 'border-violet-400/40 bg-violet-500/10 text-violet-200',
  },
  {
    key: 'emberCore',
    label: '余烬之核',
    effect: '偏向火焰、持续灼烧、压制',
    rewardTag: 'Ember Core',
    overlayClass: 'from-orange-500/30 via-red-500/20 to-transparent mix-blend-screen',
    particleClass: 'bg-orange-300/80',
    badgeClass: 'border-orange-400/40 bg-orange-500/10 text-orange-200',
  },
  {
    key: 'frostShard',
    label: '霜晶碎片',
    effect: '偏向寒霜、减速、生存',
    rewardTag: 'Frost Shard',
    overlayClass: 'from-cyan-300/30 via-blue-300/20 to-transparent mix-blend-screen',
    particleClass: 'bg-cyan-200/80',
    badgeClass: 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200',
  },
  {
    key: 'stormSigil',
    label: '风暴印记',
    effect: '偏向雷电、连击、节奏',
    rewardTag: 'Storm Sigil',
    overlayClass: 'from-indigo-400/30 via-sky-400/20 to-transparent mix-blend-screen',
    particleClass: 'bg-sky-200/80',
    badgeClass: 'border-sky-400/40 bg-sky-500/10 text-sky-200',
  },
  {
    key: 'voidDust',
    label: '虚空尘埃',
    effect: '偏向穿透、扰动、诡变',
    rewardTag: 'Void Dust',
    overlayClass: 'from-fuchsia-400/30 via-purple-400/20 to-transparent mix-blend-color-dodge',
    particleClass: 'bg-fuchsia-200/80',
    badgeClass: 'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200',
  },
];

const createEmptyInventory = (): MaterialInventory => ({
  glowGem: 0,
  chaosMind: 0,
  emberCore: 0,
  frostShard: 0,
  stormSigil: 0,
  voidDust: 0,
});

const normalizeInventory = (source?: Partial<Record<MaterialKey, unknown>>): MaterialInventory => {
  const next = createEmptyInventory();
  MATERIAL_DEFINITIONS.forEach(({ key }) => {
    next[key] = Math.max(0, Number(source?.[key] ?? 0));
  });
  return next;
};

const toInt = (value: string): number => Number.parseInt(value, 10) || 0;
const toBP = (hero: SavedHero): number => Math.max(1, toInt(hero.character.BP));

const createHeroId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};
const createEmptyTeamSlots = (): [string, string, string] => ['', '', ''];

const App: React.FC = () => {
  const navItems: Array<{ key: SectionKey; label: string }> = [
    { key: 'barracks', label: 'Barracks' },
    { key: 'forge', label: 'Forge' },
    { key: 'duel', label: 'Duel' },
    { key: 'chronicle', label: 'Chronicle' },
  ];
  const initialSavedHeroes = (() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [] as SavedHero[];
    try {
      const parsed = JSON.parse(raw) as SavedHero[];
      return Array.isArray(parsed)
        ? parsed.map((hero) => ({
            ...hero,
            infusedMaterials: normalizeInventory(hero.infusedMaterials),
          }))
        : [];
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return [] as SavedHero[];
    }
  })();
  const initialMaterials = (() => {
    const raw = localStorage.getItem(MATERIAL_STORAGE_KEY);
    if (!raw) {
      const starter = createEmptyInventory();
      starter.glowGem = 2;
      starter.chaosMind = 1;
      return starter;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<Record<MaterialKey, unknown>>;
      return normalizeInventory(parsed);
    } catch {
      localStorage.removeItem(MATERIAL_STORAGE_KEY);
      const starter = createEmptyInventory();
      starter.glowGem = 2;
      starter.chaosMind = 1;
      return starter;
    }
  })();
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [character, setCharacter] = useState<CharacterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedHeroes, setSavedHeroes] = useState<SavedHero[]>(initialSavedHeroes);
  const [activeSection, setActiveSection] = useState<SectionKey>('barracks');
  const [materials, setMaterials] = useState<MaterialInventory>(initialMaterials);
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedHeroes));
  }, [savedHeroes]);
  useEffect(() => {
    localStorage.setItem(MATERIAL_STORAGE_KEY, JSON.stringify(materials));
  }, [materials]);

  const spendMaterial = (key: MaterialKey, delta: number) => {
    setForgeSpend((prev) => {
      const next = Math.max(0, Math.min(materials[key], prev[key] + delta));
      return { ...prev, [key]: next };
    });
  };

  const handleImageSelect = async (file: File) => {
    const spendSnapshot = { ...forgeSpend };
    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
    };
    reader.readAsDataURL(file);

    setLoading(true);
    setCharacter(null);
    setError(null);

    try {
      const data = await forgeHero(file, spendSnapshot);
      
      setTimeout(() => {
        setCharacter(data);
        setLastForgeInfusion(spendSnapshot);
        if (reader.result) {
          const newHeroId = createHeroId();
          setSavedHeroes((prev) => [
            {
              id: newHeroId,
              createdAt: Date.now(),
              image: reader.result as string,
              character: data,
              infusedMaterials: spendSnapshot,
            },
            ...prev,
          ]);
          setSelectedVaultId(newHeroId);
        }
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



  const materialInfluenceText = useMemo(() => {
    const influences = MATERIAL_DEFINITIONS
      .filter(({ key }) => forgeSpend[key] > 0)
      .map((item) => `${item.label} x${forgeSpend[item.key]}：${item.effect}`);
    if (influences.length === 0) return '未添加特殊材料，按基础图像生成';
    return influences.join('；');
  }, [forgeSpend]);

  const runSandboxBattle = () => {
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

      const result = runTeamDuel(teamA, teamB, '3v3', '练习A', '练习B');
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
    
    const result = runTeamDuel([heroA], [heroB], '1v1', '练习A', '练习B');
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
    return 'Chronicle';
  }, [activeSection]);
  const duelSlotIndices = duelSize === '3v3' ? [0, 1, 2] : [0];
  const duelAActiveIds = duelSize === '3v3' ? duelAIds : [duelAId];
  const duelBActiveIds = duelSize === '3v3' ? duelBIds : [duelBId];
  const duelReady = duelSize === '3v3'
    ? duelAActiveIds.every(Boolean) && duelBActiveIds.every(Boolean)
    : Boolean(duelAId) && Boolean(duelBId) && duelAId !== duelBId;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] font-sans text-slate-100 selection:bg-amber-500/30">
      {/* Immersive Background Layers */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(60,20,10,0.4),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(20,40,80,0.3),transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]" />
      <ParticleBackground />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1920px] flex-col px-4 pb-6 pt-4 md:px-8">
        {/* HUD Header */}
        <header className="mb-6 flex flex-col gap-4 rounded-b-3xl border-x border-b border-slate-800/60 bg-slate-950/80 px-8 py-4 backdrop-blur-xl shadow-2xl md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-900/20 to-black shadow-[0_0_15px_rgba(245,158,11,0.15)]">
              <Crown size={24} className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
              <div className="absolute -inset-1 rounded-xl border border-amber-500/10 blur-sm" />
            </div>
            <div>
              <h1 className="font-serif text-3xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 drop-shadow-sm md:text-4xl">
                HERO FORGE
              </h1>
              <div className="flex items-center gap-2">
                <div className="h-[1px] w-8 bg-amber-500/50" />
                <p className="text-[10px] uppercase tracking-[0.4em] text-amber-500/60">Arcane Command Interface</p>
                <div className="h-[1px] w-8 bg-amber-500/50" />
              </div>
            </div>
          </div>
          
          <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-800/50 bg-black/40 p-1.5 backdrop-blur-md shadow-inner">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                className={`relative overflow-hidden rounded-xl px-6 py-2.5 text-xs font-bold uppercase tracking-widest transition-all duration-300 ${
                  activeSection === item.key
                    ? 'text-black shadow-[0_0_20px_rgba(251,191,36,0.3)]'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                {activeSection === item.key && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 bg-gradient-to-r from-amber-400 to-yellow-500"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {item.key === 'barracks' && <Shield size={14} />}
                  {item.key === 'forge' && <RotateCcw size={14} />}
                  {item.key === 'duel' && <Swords size={14} />}
                  {item.key === 'chronicle' && <Timer size={14} />}
                  {item.label}
                </span>
              </button>
            ))}
          </nav>
        </header>

        <main className={`grid flex-1 gap-6 ${activeSection === 'forge' ? 'lg:grid-cols-[320px_1fr_380px]' : 'lg:grid-cols-[320px_1fr]'}`}>
          <aside className="rounded-2xl border border-slate-700 bg-slate-950/65 p-4 backdrop-blur-md">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-amber-400">{activeSectionTitle}</h2>
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                {savedHeroes.length} Cards
              </span>
            </div>
            <div className="mb-4 space-y-2">
              {savedHeroes.slice(0, 6).map((hero) => (
                <button
                  key={hero.id}
                  onClick={() => {
                    setSelectedVaultId(hero.id);
                    setActiveSection('barracks');
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition ${
                    selectedVaultId === hero.id
                      ? 'border-amber-400/70 bg-amber-500/10'
                      : 'border-slate-700 bg-slate-900/70 hover:border-slate-500'
                  }`}
                >
                  <img src={hero.image} alt={hero.character.name} className="h-14 w-12 rounded-md object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{hero.character.name}</p>
                    <p className="text-xs text-slate-400">BP {hero.character.BP}</p>
                  </div>
                </button>
              ))}
              {savedHeroes.length === 0 && <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-3 py-6 text-center text-xs text-slate-500">暂无卡牌，先锻造一张英雄卡</div>}
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Material Vault</p>
              <div className="max-h-48 space-y-2 overflow-auto pr-1">
                {MATERIAL_DEFINITIONS.map((material) => (
                  <div key={material.key} className={`group flex items-center justify-between rounded-md border px-2 py-1.5 transition-all hover:scale-105 ${material.badgeClass}`}>
                    <span className="text-[10px] font-bold uppercase tracking-wider">{material.label}</span>
                    <span className="font-mono text-xs font-black">{materials[material.key]}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-700 bg-slate-950/45 p-4 backdrop-blur-md">
            {activeSection === 'forge' && (
              <AnimatePresence mode="wait">
                {!forgePreviewImage ? (
                  <motion.div key="forge" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-[740px] items-center justify-center">
                    <Forge key={forgeSessionKey} onImageSelect={handleImageSelect} isForging={false} error={error} />
                  </motion.div>
                ) : loading ? (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-[740px] items-center justify-center">
                    <Forge onImageSelect={() => {}} isForging={true} />
                  </motion.div>
                ) : forgePreviewHero ? (
                  <motion.div key="hero-display" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex min-h-[740px] flex-col items-center justify-center gap-6">
                    <div className="pointer-events-none absolute inset-0 m-auto h-[420px] w-[420px] rounded-full bg-amber-400/10 blur-3xl" />
                    <HeroCard character={forgePreviewHero} image={forgePreviewImage} infusions={forgedCardInfusions} className="z-10" />
                    <div className="z-10 flex gap-3">
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={resetForge} className="inline-flex items-center gap-2 rounded-full border border-amber-500/60 bg-gradient-to-r from-amber-500 to-yellow-300 px-6 py-2 font-bold text-black shadow-lg shadow-amber-500/25">
                        <RotateCcw size={16} />
                        Forge New Card
                      </motion.button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            )}
            {activeSection === 'barracks' && (
              <div className="relative min-h-[740px] space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="font-serif text-4xl font-black tracking-wider text-amber-300">THE VAULT</h2>
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">{savedHeroes.length} Relics Collected</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">Avg BP {collectionAverageBP}</div>
                    <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
                      Strongest {strongestHero ? strongestHero.character.name : 'N/A'}
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-slate-950/80 p-4 backdrop-blur-xl">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative min-w-[220px] flex-1">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                        <Search size={16} />
                      </div>
                      <input
                        value={vaultQuery}
                        onChange={(e) => setVaultQuery(e.target.value)}
                        placeholder="Search heroes..."
                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-600 focus:border-amber-400/30 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-1">
                      {(['all', 'mythic', 'epic', 'rare', 'common'] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => setVaultRarityFilter(r)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                            vaultRarityFilter === r ? 'bg-amber-400 text-slate-950' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-1">
                      {[
                        { value: 'date', label: 'Latest' },
                        { value: 'bp', label: 'Power' },
                        { value: 'name', label: 'Name' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setVaultSort(opt.value as VaultSort)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                            vaultSort === opt.value ? 'bg-amber-400 text-slate-950' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {vaultCards.length > 0 ? (
                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
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
                  <div className="flex h-96 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-900/20 text-center">
                    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-800/50">
                      <Search size={32} className="text-slate-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-500">No Relics Found</h3>
                    <p className="mt-2 text-sm text-slate-600">Try adjusting your filters or forge new heroes.</p>
                  </div>
                )}
                <AnimatePresence>
                  {selectedVaultHero && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-xl md:p-8"
                      onClick={() => setSelectedVaultId('')}
                    >
                      <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 40 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 40 }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative flex h-full max-h-[800px] w-full max-w-6xl flex-col overflow-hidden rounded-[2.5rem] border border-slate-800 bg-slate-950 shadow-2xl md:flex-row"
                      >
                        <button
                          onClick={() => setSelectedVaultId('')}
                          className="absolute right-6 top-6 z-50 rounded-full bg-white/5 p-3 text-slate-400 backdrop-blur-md transition-all hover:bg-white/10 hover:text-white"
                        >
                          <X size={24} />
                        </button>
                        <div className="flex items-center justify-center bg-gradient-to-br from-slate-900/50 to-transparent p-10 md:w-5/12">
                          <HeroCard
                            character={selectedVaultHero.character}
                            image={selectedVaultHero.image}
                            infusions={selectedCardInfusions}
                            className="h-[460px] w-[320px]"
                          />
                        </div>
                        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-8 md:p-10">
                          <div>
                            <h3 className="font-serif text-4xl font-black text-white">{selectedVaultHero.character.name}</h3>
                            <p className="mt-1 text-sm text-amber-400">BP {selectedVaultHero.character.BP}</p>
                          </div>
                          {selectedCardInfusions.length > 0 && (
                            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Infused Materials</p>
                              <div className="flex flex-wrap gap-2">
                                {selectedCardInfusions.map((inf, i) => (
                                  <span key={i} className="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300">
                                    {inf.label} x{inf.count}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="rounded bg-slate-800/80 px-3 py-2">ATK {selectedVaultHero.character.state.ATK}</div>
                            <div className="rounded bg-slate-800/80 px-3 py-2">DEF {selectedVaultHero.character.state.DEF}</div>
                            <div className="rounded bg-slate-800/80 px-3 py-2">SPD {selectedVaultHero.character.state.SPEED}</div>
                            <div className="rounded bg-slate-800/80 px-3 py-2">CRT {selectedVaultHero.character.state.CC}</div>
                          </div>
                          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Skills</p>
                            <div className="grid gap-3">
                              {[selectedVaultHero.character.skill.s1, selectedVaultHero.character.skill.s2].map((skill, idx) => (
                                <div key={`${skill.name}-${idx}`} className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                                  <div className="mb-2 flex items-center justify-between gap-3">
                                    <p className="truncate text-sm font-bold text-slate-100">{skill.name || `Skill ${idx + 1}`}</p>
                                    <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                                      MP {skill.MP_COST || '0'}
                                    </span>
                                  </div>
                                  <p className="text-xs leading-6 text-slate-300">{skill.description || 'No description available.'}</p>
                                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider">
                                    <span className="rounded border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-violet-300">{skill.TYPE || 'N/A'}</span>
                                    <span className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-rose-300">DMG {skill.DMG || '0'}</span>
                                    <span className="rounded border border-slate-600 bg-slate-800/70 px-2 py-1 text-slate-300">{skill.TARGET || 'single'} x{skill.TARGET_NUM || '1'}</span>
                                    {skill.IS_STUN === 'True' && (
                                      <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-300">Stun</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm leading-7 text-slate-300">
                            {selectedVaultHero.character.description}
                          </div>
                          <div className="flex gap-3 border-t border-slate-800 pt-5">
                            <button
                              onClick={() => {
                                if (duelSize === '3v3') {
                                  const aIndex = duelAIds.findIndex((id) => !id);
                                  if (aIndex >= 0) setDuelSlotHero('A', aIndex, selectedVaultHero.id);
                                  else {
                                    const bIndex = duelBIds.findIndex((id) => !id);
                                    if (bIndex >= 0) setDuelSlotHero('B', bIndex, selectedVaultHero.id);
                                    else setDuelSlotHero('A', 0, selectedVaultHero.id);
                                  }
                                } else if (!duelAId) setDuelAId(selectedVaultHero.id);
                                else if (!duelBId && duelAId !== selectedVaultHero.id) setDuelBId(selectedVaultHero.id);
                                else setDuelAId(selectedVaultHero.id);
                                setSelectedVaultId('');
                                setActiveSection('duel');
                              }}
                              className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-3 text-sm font-black uppercase tracking-widest text-white"
                            >
                              Deploy to Arena
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Are you sure you want to dismantle this unit? This action cannot be undone.')) {
                                  removeHero(selectedVaultHero.id);
                                  setSelectedVaultId('');
                                }
                              }}
                              className="rounded-xl border border-rose-900/30 bg-rose-950/20 px-6 py-3 text-sm font-bold uppercase tracking-widest text-rose-500"
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
            {activeSection === 'duel' && (
              <div className="relative flex min-h-[800px] flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
                <AnimatePresence>
                  {showBattle && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-[100] bg-slate-950"
                    >
                      {(() => {
                        if (battleHeroes && battleEvents.length > 0) {
                          return (
                            <BattleVisualizer 
                              heroA={battleHeroes.a} 
                              heroB={battleHeroes.b} 
                              events={battleEvents} 
                              onClose={() => setShowBattle(false)} 
                            />
                          );
                        }
                        return null;
                      })()}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Arena Ambient Background */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(76,29,149,0.1),transparent_70%)]" />
                  <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/hexellence.png')]" />
                  <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black via-slate-950/80 to-transparent" />
                </div>

                {/* Arena Header */}
                <div className="relative z-10 flex items-center justify-between border-b border-white/5 bg-white/5 px-8 py-4 backdrop-blur-md">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                      <Swords size={20} className="text-rose-400" />
                    </div>
                    <div>
                      <h2 className="font-serif text-xl font-black tracking-wider text-slate-100">BATTLE ARENA</h2>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-500/60">Simulation Protocol Active</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 p-1">
                      {(['1v1', '3v3'] as const).map((size) => (
                        <button
                          key={size}
                          onClick={() => {
                            setDuelSize(size);
                            setBattleResult(null);
                            setShowBattle(false);
                          }}
                          className={`rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all ${
                            duelSize === size ? 'bg-amber-400 text-slate-900' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                     <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/50 px-4 py-1.5">
                        <div className={`h-2 w-2 rounded-full ${battleResult ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'bg-slate-600'}`} />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          {battleResult ? 'Combat Finished' : 'Ready'}
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
                                className={`${duelSize === '3v3' ? 'h-[220px] w-[170px]' : 'h-[440px] w-[280px]'} transition-all duration-500 ${isWinner ? 'scale-105 ring-4 ring-amber-400 shadow-[0_0_50px_rgba(251,191,36,0.4)]' : 'shadow-2xl'} ${battleResult && !isWinner && battleResult.winner !== '平局' ? 'grayscale opacity-60 scale-95' : ''}`}
                              />
                              <button
                                onClick={() => clearDuelSlot('A', slotIndex)}
                                className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-slate-400 shadow-xl transition-all hover:bg-rose-600 hover:text-white hover:scale-110 z-50"
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
                            className={`group relative flex ${duelSize === '3v3' ? 'h-[220px] w-[170px]' : 'h-[440px] w-[280px]'} flex-col items-center justify-center gap-4 rounded-[2rem] border-2 border-dashed border-slate-800 bg-slate-900/30 transition-all hover:border-rose-500/50 hover:bg-rose-500/5`}
                          >
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 shadow-inner transition-transform group-hover:scale-110 group-hover:bg-rose-500/20">
                              <Plus size={24} className="text-slate-600 transition-colors group-hover:text-rose-400" />
                            </div>
                            <div className="text-center">
                              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 group-hover:text-rose-300">Select Fighter</p>
                              <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-600">Slot A{slotIndex + 1}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* VS Controller */}
                  <div className="flex flex-col items-center gap-8 py-8 md:py-0">
                    <div className="relative">
                       <h3 className="font-serif text-6xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-slate-200 to-slate-600 opacity-20 select-none">VS</h3>
                       <div className="absolute inset-0 flex items-center justify-center">
                         <div className="h-px w-24 bg-gradient-to-r from-transparent via-rose-500/50 to-transparent" />
                       </div>
                    </div>

                    <button 
                      onClick={runSandboxBattle}
                      disabled={!duelReady}
                      className="group relative flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-rose-500 to-red-600 px-10 py-4 font-black tracking-widest text-white shadow-[0_0_30px_rgba(225,29,72,0.4)] transition-all hover:scale-105 hover:shadow-[0_0_50px_rgba(225,29,72,0.6)] active:scale-95 disabled:pointer-events-none disabled:opacity-50 disabled:grayscale"
                    >
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
                      <span className="relative z-10 flex items-center gap-2">
                        {battleResult ? <RotateCcw size={18} /> : <Swords size={18} />}
                        {battleResult ? 'REMATCH' : 'ENGAGE'}
                      </span>
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
                                className={`${duelSize === '3v3' ? 'h-[220px] w-[170px]' : 'h-[440px] w-[280px]'} transition-all duration-500 ${isWinner ? 'scale-105 ring-4 ring-amber-400 shadow-[0_0_50px_rgba(251,191,36,0.4)]' : 'shadow-2xl'} ${battleResult && !isWinner && battleResult.winner !== '平局' ? 'grayscale opacity-60 scale-95' : ''}`}
                              />
                              <button
                                onClick={() => clearDuelSlot('B', slotIndex)}
                                className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-slate-400 shadow-xl transition-all hover:bg-blue-600 hover:text-white hover:scale-110 z-50"
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
                            className={`group relative flex ${duelSize === '3v3' ? 'h-[220px] w-[170px]' : 'h-[440px] w-[280px]'} flex-col items-center justify-center gap-4 rounded-[2rem] border-2 border-dashed border-slate-800 bg-slate-900/30 transition-all hover:border-blue-500/50 hover:bg-blue-500/5`}
                          >
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 shadow-inner transition-transform group-hover:scale-110 group-hover:bg-blue-500/20">
                              <Plus size={24} className="text-slate-600 transition-colors group-hover:text-blue-400" />
                            </div>
                            <div className="text-center">
                              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 group-hover:text-blue-300">Select Fighter</p>
                              <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-600">Slot B{slotIndex + 1}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Battle Log Console */}
                <div className="border-t border-slate-800 bg-black/40 p-4 backdrop-blur-md">
                   <div className="mb-2 flex items-center justify-between">
                     <div className="flex items-center gap-2">
                       <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                       <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">System Log</span>
                     </div>
                     {duelSummary && <span className="text-xs font-medium text-amber-400">{duelSummary}</span>}
                   </div>
                   <div className="h-32 overflow-auto rounded-lg border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs shadow-inner">
                     {duelLogs.length === 0 ? (
                       <div className="flex h-full items-center justify-center text-slate-700">
                         <p>[SYSTEM] Awaiting combat initiation sequence...</p>
                       </div>
                     ) : (
                       <div className="space-y-1">
                         {duelLogs.map((log, idx) => (
                           <div key={idx} className="flex gap-3 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200">
                             <span className="w-8 shrink-0 select-none text-right text-slate-700">{(idx + 1).toString().padStart(2, '0')}</span>
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
                      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm"
                    >
                      <motion.div 
                        initial={{ scale: 0.5, y: 50 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.5, y: 50 }}
                        className="relative flex flex-col items-center"
                      >
                        <div className="absolute inset-0 -z-10 bg-amber-500/20 blur-[100px]" />
                        <h2 className="font-serif text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-amber-300 via-yellow-500 to-amber-700 drop-shadow-[0_0_30px_rgba(245,158,11,0.6)]">
                          {battleResult.winner === '平局' ? 'DRAW' : 'VICTORY'}
                        </h2>
                        <div className="mt-4 flex items-center gap-4">
                          <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-amber-500" />
                          <p className="text-2xl font-bold uppercase tracking-[0.3em] text-white drop-shadow-lg">
                            {battleResult.winner === '平局' ? 'No Winner' : battleResult.winner}
                          </p>
                          <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-amber-500" />
                        </div>
                        <button 
                           onClick={() => setBattleResult(null)}
                           className="mt-12 rounded-full border border-white/10 bg-white/5 px-8 py-2 text-xs font-bold uppercase tracking-widest text-slate-400 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white"
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
                        className="flex h-[80vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-8 py-6">
                          <div>
                            <h3 className="font-serif text-2xl font-bold text-slate-100">Select Combatant</h3>
                            <p className="text-xs uppercase tracking-widest text-slate-500">
                              Deploy unit to Slot {selectingDuelSlot.team}{selectingDuelSlot.index + 1}
                            </p>
                          </div>
                          <button onClick={() => setSelectingDuelSlot(null)} className="rounded-full bg-slate-800 p-2 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">
                            <X size={20} />
                          </button>
                        </div>
                        <div className="flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(30,41,59,0.3),transparent)] p-8">
                          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                            {savedHeroes.map((hero) => {
                               const heroInfusions = MATERIAL_DEFINITIONS.filter(({ key }) => (hero.infusedMaterials?.[key] ?? 0) > 0).map((material) => ({
                                  label: material.label,
                                  count: hero.infusedMaterials?.[material.key] ?? 0,
                                  overlayClass: material.overlayClass,
                                  particleClass: material.particleClass,
                              }));
                              const selectedInTeam = selectingDuelSlot.team === 'A' ? duelAActiveIds : duelBActiveIds;
                              const oppositeTeam = selectingDuelSlot.team === 'A' ? duelBActiveIds : duelAActiveIds;
                              const isSelected = selectedInTeam[selectingDuelSlot.index] === hero.id;
                              const isDisabled = oppositeTeam.includes(hero.id);

                              return (
                                <div key={`duel-select-${hero.id}`} className={`relative group ${isDisabled ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
                                  <div className="absolute -inset-2 rounded-2xl bg-gradient-to-b from-slate-800 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                                  <div className="relative">
                                    <HeroCard 
                                      character={hero.character} 
                                      image={hero.image} 
                                      infusions={heroInfusions}
                                      compact={true}
                                      onClick={() => {
                                        setDuelSlotHero(selectingDuelSlot.team, selectingDuelSlot.index, hero.id);
                                        setSelectingDuelSlot(null);
                                      }}
                                      className={`cursor-pointer transition-transform group-hover:-translate-y-2 ${isSelected ? 'ring-2 ring-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.3)]' : ''}`}
                                    />
                                  </div>
                                  {isDisabled && (
                                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-black/60 backdrop-blur-[1px]">
                                      <span className="rounded-md border border-slate-600 bg-black/80 px-2 py-1 text-[10px] font-bold uppercase text-slate-400">Deployed</span>
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
                <div className="w-full max-w-xl rounded-2xl border border-amber-500/30 bg-slate-900/70 p-8 text-center">
                  <h3 className="text-2xl font-black text-amber-200">Chronicle · Coming Soon</h3>
                  <p className="mt-3 text-sm text-slate-400">PVE 冒险与关卡战报正在制作，后续会接入材料掉落与剧情推进。</p>
                </div>
              </div>
            )}
          </section>

          {activeSection === 'forge' && (
            <aside className="flex flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-950/65 p-4 backdrop-blur-md">
              <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-amber-400">
                  <Gem size={14} />
                  Essence Infusion
                </div>
                <div className="max-h-[380px] overflow-auto pr-1">
                  <div className="grid gap-3">
                  {MATERIAL_DEFINITIONS.map((material) => (
                    <div key={material.key} className="group relative overflow-hidden rounded-lg border border-slate-700 bg-slate-800/40 p-3 transition-all hover:border-slate-600 hover:bg-slate-800/60">
                      <div className={`absolute inset-0 opacity-0 transition-opacity group-hover:opacity-10 ${material.overlayClass.split(' ')[0].replace('from-', 'bg-')}`} />
                      
                      <div className="relative z-10 flex items-center justify-between mb-2">
                        <span className={`text-xs font-bold uppercase tracking-wider ${material.badgeClass.replace('bg-', 'text-').split(' ')[2]}`}>{material.label}</span>
                        <span className="text-[10px] text-slate-500 font-mono">OWNED: {materials[material.key]}</span>
                      </div>
                      
                      <div className="relative z-10 flex items-center justify-between gap-4">
                         <div className="h-1.5 flex-1 rounded-full bg-slate-950">
                           <div 
                             className={`h-full rounded-full transition-all duration-300 ${material.particleClass.replace('bg-', 'bg-')}`}
                             style={{ width: `${Math.min(100, (forgeSpend[material.key] / 5) * 100)}%` }} 
                           />
                         </div>
                         <div className="flex items-center gap-1">
                            <button 
                              onClick={() => spendMaterial(material.key, -1)} 
                              className="flex h-6 w-6 items-center justify-center rounded bg-slate-900 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                            >
                              <span className="mb-0.5">-</span>
                            </button>
                            <div className="w-6 text-center font-mono text-sm font-bold text-slate-200">{forgeSpend[material.key]}</div>
                            <button 
                              onClick={() => spendMaterial(material.key, 1)} 
                              className="flex h-6 w-6 items-center justify-center rounded bg-slate-900 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                            >
                              <span className="mb-0.5">+</span>
                            </button>
                         </div>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-amber-400">
                  <Sparkles size={14} />
                  Prompt Influence
                </div>
                <p className="text-xs leading-6 text-slate-300">{materialInfluenceText}</p>
              </div>
            </aside>
          )}
        </main>

        <footer className="mt-4 text-center text-[11px] uppercase tracking-[0.2em] text-slate-500">
          Powered by Arcane Intelligence · System Version 2.1
        </footer>
      </div>
    </div>
  );
};

export default App;
