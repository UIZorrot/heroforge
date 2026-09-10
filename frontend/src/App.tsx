import React, { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Gem, Gift, Mail, Newspaper, RefreshCw, Send, ShoppingBag, Sparkles, Swords, WalletCards, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameShell, type ArenaSideKey, type ForgeSideKey, type GameSectionKey, type HomeSideKey, type VaultSideKey } from './components/GameShell';
import { VaultPage } from './components/VaultPage';
import { ForgePage } from './components/ForgePage';
import { ArenaPage } from './components/ArenaPage';
import { VfxTestPage } from './components/VfxTestPage';
import { MarketPage } from './components/MarketPage';
import { SettingsPage } from './components/SettingsPage';
import { DailyActivity } from './components/DailyActivity';
import { SectionHeader } from './components/Effects';
import { PageHeader, PageHeaderStat } from './components/PageHeader';
import {
  clearStoredSession,
  decomposeCard,
  enchantCard,
  equipCardRelic,
  fetchBattles,
  fetchCurrentUser,
  fetchEconomy,
  fetchHeroes,
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
import { IS_MOCK_MODE } from './lib/runtimeMode';
import type { AuthUser, BattleHistoryRecord, EconomySnapshot, HeroHistoryRecord, SavedHero } from './types';

type VaultSort = 'date' | 'bp' | 'name';

const LOGIN_RESEND_SECONDS = 60;
const MOCK_SANDBOX_KEY = 'hf.mock.sandbox.v1';

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
                placeholder="123456"
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

function battleTypeLabel(battleType: string): string {
  if (battleType.startsWith('pvp_')) return `PvP ${battleType.slice(4)}`;
  if (battleType.startsWith('battle_session_')) return `Session ${battleType.slice('battle_session_'.length)}`;
  return battleType.toUpperCase();
}

function battleRecordTitle(record: BattleHistoryRecord): string {
  const labelA = record.payload?.labelA;
  const labelB = record.payload?.labelB;
  if (labelA && labelB) return `${labelA} vs ${labelB}`;
  const board = record.result?.board;
  if (board?.bottomLabel && board?.topLabel) return `${board.bottomLabel} vs ${board.topLabel}`;
  return battleTypeLabel(record.battle_type);
}

function battleRecordDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TRANSACTION_REASON_LABELS: Record<string, string> = {
  forge_entry: 'Forge',
  repair: 'Repair',
  pve_entry: 'PvE entry',
  pvp_entry: 'Arena entry',
  pvp_stake: 'Arena stake',
  pvp_revive: 'Arena revive',
  pvp_queue_join_refund: 'Arena queue refund',
  pvp_relic_drop: 'Arena shard drop',
  pvp_reward: 'Arena reward',
  daily_sign_in: 'Daily sign-in',
  daily_task_reward: 'Daily task',
  market_buy_relic: 'Market buy',
  market_sell_relic: 'Market sell',
  card_enchant: 'Shard enchant',
  decompose: 'Card break',
  test_grant: 'Grant',
};

function transactionReasonLabel(reason: string): string {
  return TRANSACTION_REASON_LABELS[reason] ?? reason.replace(/_/g, ' ');
}

function HomePage({
  user,
  activeTab,
  heroCount,
  dust,
  relics,
  economy,
  token,
  onNavigate,
  onEconomyChange,
  onOpenAuth,
  onOpenBattleReplay,
  previewContentEnabled,
}: {
  user: AuthUser | null;
  activeTab: HomeSideKey;
  heroCount: number;
  dust: number;
  relics: number;
  economy: EconomySnapshot | null;
  token?: string | null;
  onNavigate: (section: GameSectionKey) => void;
  onEconomyChange: (economy: EconomySnapshot) => void;
  onOpenAuth: () => void;
  onOpenBattleReplay: (record: BattleHistoryRecord) => void;
  previewContentEnabled: boolean;
}) {
  const dailyToken = token && token !== 'mock-token' ? token : null;
  const [battleHistory, setBattleHistory] = useState<BattleHistoryRecord[] | null>(null);

  useEffect(() => {
    if (activeTab !== 'profile' || !dailyToken) return;
    let cancelled = false;
    fetchBattles(dailyToken)
      .then((records) => {
        if (!cancelled) setBattleHistory(records);
      })
      .catch(() => {
        if (!cancelled) setBattleHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, dailyToken]);
  const playerName = user?.email?.split('@')[0] || 'Visitor';
  const news = [
    {
      title: 'Arena 2x3 Opens',
      tag: 'Season',
      description: 'Deploy front and back lanes, resolve ranked battles, and inspect every combat event.',
      tone: 'from-[#4b2118] via-[#17110e] to-[#050505]',
    },
    {
      title: 'Shard Enchanting',
      tag: 'Forge',
      description: 'New relic rituals are applied to cards after generation.',
      tone: 'from-[#34244f] via-[#111014] to-[#050505]',
    },
    {
      title: 'Vault Audit',
      tag: 'Archive',
      description: 'Power sorting and relic panels have been rebuilt for faster roster review.',
      tone: 'from-[#17313a] via-[#0d1112] to-[#050505]',
    },
  ];
  const offers = previewContentEnabled ? [
    ['新手大礼', '$6.99', 'Starter dust, relic rolls, and first-week forge boosts'],
    ['粉尘包', '$9.99', 'A direct Dust pack for forge costs and Arena stakes'],
    ['遗物包', '$9.99', 'Relic rolls for enchantment and collection growth'],
  ] : [
    ['Dust Economy', 'Internal', 'Dust currently circulates through forge, revive, Arena entry, and relic trading.'],
    ['Relic Loop', 'Live', 'Shards enchant cards, relics equip into the battle slot, and both circulate through drops and the market.'],
    ['Recharge', 'Deferred', 'Real-money recharge and Stripe settlement are intentionally out of scope for the first release.'],
  ];
  const quickLinks: Array<[GameSectionKey, string, string, React.ReactNode]> = [
    ['forge', 'Forge', 'Create or break a hero card.', <Sparkles size={16} />],
    ['vault', 'Vault', 'Inspect cards and relics.', <WalletCards size={16} />],
    ['arena', 'Arena', 'Queue, train, and battle.', <Swords size={16} />],
    ['market', 'Market', 'Browse offers and orders.', <ShoppingBag size={16} />],
  ];
  const profileLevel = previewContentEnabled ? '12' : 'Beta';
  const profileTitle = previewContentEnabled ? 'Forger' : 'Player';
  const profileProgress = previewContentEnabled ? 68 : 0;
  const combatRating = previewContentEnabled ? 'Elite III' : 'Season 0';
  const combatWinRate = previewContentEnabled ? '63.2%' : 'Not tracked';
  const combatStreak = previewContentEnabled ? '8' : 'Pending';
  const bestBp = previewContentEnabled ? '11,500' : heroCount ? 'Recorded in Vault' : '--';
  const relicUses = previewContentEnabled ? '10' : 'Tracked after live play';
  const membershipTitle = previewContentEnabled ? 'Standard Forger' : 'Founders Beta';
  const membershipDescription = previewContentEnabled
    ? 'Daily rewards, Arena queue, Forge, and Vault are available.'
    : 'Core beta scope is live: Forge, Vault, Train, Arena, Daily rewards, and the internal relic market.';
  const header = (
    <PageHeader
      title="Home"
      eyebrow={activeTab === 'profile' ? 'Account' : user ? 'Hero Forge' : 'Access'}
      subtitle={activeTab === 'profile' ? 'Player Profile' : user ? 'Command Center' : 'Guest Lobby'}
      description={
        activeTab === 'profile'
          ? 'Account state, progression, and unlocks.'
          : user
            ? 'Navigate your forge, vault, and battle lanes.'
            : 'Forge images into playable heroes.'
      }
      stats={
        <>
          <PageHeaderStat label="Cards" value={user ? heroCount : 'Forge'} />
          <PageHeaderStat label="Dust" value={user ? dust : 'Stake'} />
          <PageHeaderStat label="Relics" value={user ? relics : 'Enchant'} />
          <PageHeaderStat label="Access" value={user ? 'Active' : 'Guest'} />
        </>
      }
    />
  );

  if (!user) {
    return previewContentEnabled
      ? <GuestLandingHome onJoin={onOpenAuth} onNavigate={onNavigate} previewContentEnabled={previewContentEnabled} />
      : <GuestLandingHomeLive onJoin={onOpenAuth} onNavigate={onNavigate} />;
  }

  if (activeTab === 'profile') {
    return (
      <div className="mx-auto max-w-[1540px] px-6 py-8 2xl:px-8">
        {header}
        <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-6">
            <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
              <div className="border border-white/8 bg-black/20 p-6">
                <div className="flex items-start gap-5">
                  <div className="flex h-20 w-20 items-center justify-center border border-[#b49664]/30 bg-[radial-gradient(circle_at_50%_20%,rgba(180,150,100,0.34),rgba(0,0,0,0.88)_70%)] font-display text-3xl text-stone-100">
                    {user ? playerName.slice(0, 2).toUpperCase() : 'HF'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-[#b49664]">Profile</div>
                    <h2 className="mt-2 truncate font-display text-3xl font-light tracking-[0.12em] text-stone-100">{playerName}</h2>
                    <div className="mt-2 text-xs uppercase tracking-[0.18em] text-stone-500">{user ? user.email : 'Not signed in'}</div>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <SmallProfileStat label="Level" value={user ? profileLevel : '--'} />
                  <SmallProfileStat label="Title" value={user ? profileTitle : 'Guest'} />
                  <SmallProfileStat label="Cards" value={heroCount} />
                  <SmallProfileStat label="Relics" value={relics} />
                </div>
                <div className="mt-6">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-stone-600">
                    <span>Progress</span>
                    <span>{user ? (previewContentEnabled ? `${profileProgress}%` : 'Beta') : 'Locked'}</span>
                  </div>
                  <div className="mt-3 h-2 border border-white/8 bg-black">
                    <div className="h-full bg-[#b49664]" style={{ width: `${profileProgress}%` }} />
                  </div>
                  {!previewContentEnabled && (
                    <div className="mt-3 text-xs leading-5 text-stone-500">Account-wide progression tiers are not finalized for MVP. Real progression today lives in your Vault assets and resource ledger.</div>
                  )}
                </div>
              </div>

              <div className="border border-white/8 bg-black/20 p-6">
                <HomeSectionTitle icon={<WalletCards size={16} />} eyebrow="Account" title="Player Ledger" />
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <ProfileLedgerCard label="Dust Balance" value={dust.toLocaleString()} hint="Forge, revive, and Arena stake currency" />
                  <ProfileLedgerCard label="Relics Owned" value={relics.toLocaleString()} hint="Shards enchant cards; relics equip to a card's battle slot" />
                  <ProfileLedgerCard label="Vault Size" value={heroCount.toLocaleString()} hint="Playable hero cards in this account" />
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <ProfileAction title="Security" description={user ? 'Email session active. Token managed locally.' : 'Sign in to bind progress to an account.'} />
                  <ProfileAction title="Beta Scope" description="MVP scope is Forge, Vault, Train, Arena, Daily rewards, and the internal relic market. Chronicle and recharge are intentionally deferred." />
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="border border-white/8 bg-black/20 p-6">
                <HomeSectionTitle icon={<Swords size={16} />} eyebrow="Arena" title="Combat Record" />
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <SmallProfileStat label="Rating" value={user ? combatRating : '--'} />
                  <SmallProfileStat label="Win Rate" value={user ? combatWinRate : '--'} />
                  <SmallProfileStat label="Streak" value={user ? combatStreak : '--'} />
                </div>
                <div className="mt-6 border-t border-white/8 pt-5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-stone-600">
                    <span>Recent Battles</span>
                    <span>{battleHistory?.length ? `${battleHistory.length} / 25 saved` : ''}</span>
                  </div>
                  {battleHistory === null ? (
                    <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-stone-500">
                      <RefreshCw className="animate-spin" size={12} />
                      Loading combat record
                    </div>
                  ) : battleHistory.length === 0 ? (
                    <p className="mt-4 text-xs leading-5 text-stone-500">
                      No battles recorded yet. Resolve an Arena queue match, training clash, or battle session and it will appear here with a full replay.
                    </p>
                  ) : (
                    <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                      {battleHistory.map((record) => (
                        <button
                          key={record.id}
                          type="button"
                          onClick={() => onOpenBattleReplay(record)}
                          className="group flex w-full items-center justify-between gap-3 border border-white/8 bg-black/30 px-4 py-3 text-left transition-colors hover:border-[#b49664]/40 hover:bg-[#b49664]/5"
                        >
                          <div className="min-w-0">
                            <div className="text-[9px] uppercase tracking-[0.22em] text-[#b49664]">{battleTypeLabel(record.battle_type)}</div>
                            <div className="mt-1 truncate text-sm text-stone-200">{battleRecordTitle(record)}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-stone-400">
                              {record.result?.winnerLabel ? `Winner ${record.result.winnerLabel}` : 'Resolved'}
                            </div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-stone-600 group-hover:text-stone-500">
                              {battleRecordDate(record.created_at)} · Replay
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="border border-white/8 bg-black/20 p-6">
                <HomeSectionTitle icon={<Sparkles size={16} />} eyebrow="Forge" title="Creation Status" />
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <SmallProfileStat label="Today" value="0" />
                  <SmallProfileStat label="Best BP" value={bestBp} />
                  <SmallProfileStat label="Relic Uses" value={relics ? relicUses : '--'} />
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="border border-white/8 bg-black/20 p-6">
              <HomeSectionTitle icon={<Gift size={16} />} eyebrow="Status" title="Membership" />
              <div className="mt-6 border border-[#b49664]/25 bg-[#b49664]/8 p-5">
                <div className="text-sm uppercase tracking-[0.2em] text-stone-100">{user ? membershipTitle : 'Visitor'}</div>
                <p className="mt-3 text-sm leading-6 text-stone-500">
                  {user ? membershipDescription : 'Sign in to unlock persistent progress and daily claims.'}
                </p>
              </div>
            </section>

            <section className="border border-white/8 bg-black/20 p-6">
              <HomeSectionTitle icon={<Newspaper size={16} />} eyebrow="Economy" title="Recent Activity" />
              {(() => {
                const catalog = Object.fromEntries((economy?.relic_catalog ?? []).map((item) => [item.relic_type, item.display_name]));
                const recent = (economy?.transactions ?? []).slice(0, 8);
                if (recent.length === 0) {
                  return (
                    <p className="mt-6 text-xs leading-5 text-stone-500">
                      No activity yet. Forge, battle, trade, and daily claims will be recorded here.
                    </p>
                  );
                }
                return (
                  <div className="mt-6 space-y-2">
                    {recent.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between gap-3 border border-white/8 bg-black/30 px-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs uppercase tracking-[0.16em] text-stone-300">{transactionReasonLabel(tx.reason)}</div>
                          <div className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-stone-600">
                            {tx.resource_type === 'relic' && tx.resource_key ? `${catalog[tx.resource_key] ?? tx.resource_key} · ` : ''}
                            {tx.created_at ? battleRecordDate(tx.created_at) : ''}
                          </div>
                        </div>
                        <div className={`shrink-0 text-sm font-light ${tx.delta >= 0 ? 'text-[#d8b06c]' : 'text-stone-400'}`}>
                          {tx.delta >= 0 ? '+' : ''}{tx.delta.toLocaleString()} {tx.resource_type === 'dust' ? 'Dust' : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </section>
          </aside>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1540px] px-6 py-8 2xl:px-8">
      {header}

      <section className="mt-7 grid items-stretch gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="flex h-full flex-col border border-white/8 bg-black/20 p-6">
          <div className="mb-5 flex items-end justify-between gap-4">
            <HomeSectionTitle icon={<Newspaper size={16} />} eyebrow="News" title="Latest Dispatch" />
            <span className="text-[10px] uppercase tracking-[0.24em] text-stone-600">3 updates</span>
          </div>
          <div className="grid flex-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <article className="group flex min-h-[430px] flex-col overflow-hidden border border-white/10 bg-black/30">
              <HomeImage tone={news[0].tone} label={news[0].tag} large />
              <div className="p-5">
                <div className="text-[10px] uppercase tracking-[0.26em] text-[#b49664]">{news[0].tag}</div>
                <h2 className="mt-2 font-display text-3xl font-light tracking-[0.12em] text-stone-100">{news[0].title}</h2>
                <p className="mt-3 text-sm leading-6 text-stone-500">{news[0].description}</p>
              </div>
            </article>
            <div className="grid gap-4">
              {news.slice(1).map((item) => (
                <article key={item.title} className="grid min-h-[206px] grid-cols-[130px_1fr] overflow-hidden border border-white/10 bg-black/30">
                  <HomeImage tone={item.tone} label={item.tag} />
                  <div className="p-4">
                    <div className="text-[9px] uppercase tracking-[0.24em] text-[#b49664]">{item.tag}</div>
                    <h3 className="mt-2 text-base text-stone-100">{item.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-stone-500">{item.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <aside className="flex h-full flex-col gap-6">
          <section className="flex flex-1 flex-col border border-white/8 bg-black/20 p-6">
            <HomeSectionTitle icon={<CalendarDays size={16} />} eyebrow="Daily" title="Ritual Board" />
            {dailyToken || previewContentEnabled ? (
              <DailyActivity token={dailyToken} demoMode={previewContentEnabled} economy={economy} onEconomyChange={onEconomyChange} />
            ) : (
              <DailyPreview />
            )}
          </section>
        </aside>
      </section>

      <section className="mt-6 border border-white/8 bg-black/20 p-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <HomeSectionTitle icon={<Gift size={16} />} eyebrow="Offers" title="Limited Store" />
          <span className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Premium</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {offers.map(([title, price, description], index) => (
            <div key={title} className="border border-white/10 bg-[#070707] p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center border border-[#b49664]/30 bg-[#b49664]/10 text-[#d8b06c]">
                  {index === 0 ? <Gift size={17} /> : index === 1 ? <Gem size={17} /> : <Sparkles size={17} />}
                </div>
                <div className="font-display text-2xl font-light text-stone-100">{price}</div>
              </div>
              <div className="mt-5 text-sm uppercase tracking-[0.18em] text-stone-200">{title}</div>
              <p className="mt-3 min-h-12 text-sm leading-6 text-stone-500">{description}</p>
              <button
                type="button"
                onClick={() => onNavigate('market')}
                className="mt-5 w-full border border-[#b49664]/35 bg-[#806838]/35 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-100 transition hover:bg-[#806838]/55"
              >
                {previewContentEnabled ? 'View Deal' : 'Open Market'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 border border-white/8 bg-black/20 p-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <HomeSectionTitle icon={<ArrowRight size={16} />} eyebrow="Shortcuts" title="Quick Access" />
          <span className="text-[10px] uppercase tracking-[0.24em] text-stone-600">Modules</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map(([target, title, description, icon]) => (
            <button
              key={target}
              type="button"
              onClick={() => onNavigate(target)}
              className="min-h-32 border border-white/10 bg-[#0a0a0a]/70 p-4 text-left transition hover:border-[#b49664]/45 hover:bg-[#111]/80"
            >
              <div className="flex h-9 w-9 items-center justify-center border border-white/10 text-stone-300">{icon}</div>
              <div className="mt-4 text-sm uppercase tracking-[0.2em] text-stone-100">{title}</div>
              <div className="mt-2 text-xs leading-5 text-stone-500">{description}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function HomeSectionTitle({ icon, eyebrow, title }: { icon: React.ReactNode; eyebrow: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center border border-white/10 bg-white/[0.03] text-[#d8b06c]">{icon}</div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.28em] text-[#b49664]">{eyebrow}</div>
        <h2 className="mt-1 font-display text-2xl font-light uppercase tracking-[0.16em] text-stone-100">{title}</h2>
      </div>
    </div>
  );
}

function GuestLandingHome({
  onJoin,
  onNavigate,
  previewContentEnabled,
}: {
  onJoin: () => void;
  onNavigate: (section: GameSectionKey) => void;
  previewContentEnabled: boolean;
}) {
  const guestPanels = previewContentEnabled
    ? [
        ['12M+', 'Heroes Forged'],
        ['2.4M+', 'Battles Fought'],
        ['850K+', 'Players'],
        ['∞', 'Legends Remembered'],
      ]
    : [
        ['Forge', 'Turn an image into a persistent hero card'],
        ['Train', 'Test builds privately before ranked queueing'],
        ['Arena', 'Enter tactical PvP under BP constraints'],
        ['Market', 'Recycle Dust and relic inventory inside the loop'],
      ];
  const guestTicker = previewContentEnabled
    ? [
        ['Latest Battle', 'Angron defeated Lucius in 8 rounds'],
        ['New Relic', 'Voidwalker Cloak joined the relic vault'],
        ['System Update', 'Balance patch v1.2.4 adjusts Arena rewards'],
      ]
    : [
        ['MVP Scope', 'Forge, Vault, Train, Arena, Daily rewards, and relic market are in scope.'],
        ['Chronicle', 'PvE campaign is planned after MVP and does not gate first release.'],
        ['Payments', 'Recharge and Stripe settlement stay out of the first public build.'],
      ];
  const guestStore = previewContentEnabled
    ? [
        ['新手大礼', '$6.99'],
        ['粉尘包', '$9.99'],
        ['遗物包', '$9.99'],
      ]
    : [
        ['Internal Economy', 'Dust only'],
        ['Relic Trading', 'Live'],
        ['Recharge Later', 'Stripe deferred'],
      ];
  void guestPanels;
  void guestTicker;
  void guestStore;
  return (
    <div className="mx-auto max-w-[1540px] px-6 py-8 2xl:px-8">
      <section className="relative overflow-hidden border border-white/8 bg-[#050505] px-8 py-10 xl:min-h-[650px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_47%_45%,rgba(190,120,54,0.24),transparent_22%),radial-gradient(circle_at_42%_42%,rgba(255,230,170,0.11),transparent_16%),linear-gradient(90deg,rgba(0,0,0,0.36),transparent_42%,rgba(0,0,0,0.58))]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/60 to-transparent" />

        <div className="relative grid gap-8 xl:grid-cols-[minmax(310px,0.85fr)_minmax(360px,520px)_340px] xl:items-center">
          <div>
            <div className="text-[10px] uppercase tracking-[0.36em] text-[#b49664]">A generative hero battler</div>
            <h1 className="mt-5 font-display text-6xl font-light uppercase leading-[1.05] tracking-[0.18em] text-stone-100 md:text-7xl">
              Forge
              <br />
              Legends
            </h1>
            <p className="mt-6 text-sm italic tracking-[0.08em] text-stone-500">"Illuminate the enemy."</p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onJoin}
                className="bg-[#806838] px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-100 transition hover:bg-[#9a7d4a]"
              >
                Join the Forge
              </button>
              <button
                type="button"
                className="border border-white/10 px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-400 transition hover:border-stone-500 hover:text-stone-200"
              >
                Watch Trailer
              </button>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[420px]">
            <div className="pointer-events-none absolute inset-x-8 -bottom-7 h-16 rounded-[50%] border border-[#b49664]/25 bg-[#b49664]/15 blur-sm" />
            <div className="relative border border-[#b49664]/45 bg-black/70 p-4 shadow-[0_0_80px_rgba(180,120,54,0.2)]">
              <div className="relative min-h-[520px] overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_50%_26%,rgba(210,150,80,0.28),transparent_25%),linear-gradient(180deg,#17100c_0%,#050505_58%,#090909_100%)]">
                <div className="absolute inset-x-6 top-6 flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-[#d8b06c]">Mythic</div>
                    <div className="inline-flex border border-white/10 bg-black/50 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-stone-300">Warrior</div>
                  </div>
                  <div className="font-display text-3xl font-light text-stone-100">11,500</div>
                </div>
                <div className="absolute inset-x-10 top-28 h-56 bg-[radial-gradient(circle_at_50%_30%,rgba(255,226,160,0.35),transparent_18%),radial-gradient(circle_at_50%_62%,rgba(150,58,22,0.38),transparent_30%)]" />
                <div className="absolute inset-x-8 bottom-8">
                  <h2 className="font-display text-3xl font-light tracking-[0.12em] text-stone-100">Angron</h2>
                  <p className="mt-3 text-sm leading-6 text-stone-400">A daemon-ascended engine of war and rage, forged from image and rule-bound stats.</p>
                  <div className="mt-5 grid grid-cols-4 gap-2 text-[10px] uppercase tracking-[0.18em]">
                    <span className="border border-emerald-400/25 bg-emerald-400/10 px-2 py-2 text-emerald-200">HP 3234</span>
                    <span className="border border-amber-400/25 bg-amber-400/10 px-2 py-2 text-amber-200">ATK 369</span>
                    <span className="border border-violet-400/25 bg-violet-400/10 px-2 py-2 text-violet-200">DEF 59</span>
                    <span className="border border-teal-400/25 bg-teal-400/10 px-2 py-2 text-teal-200">SPD 84</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-5">
            <div className="grid gap-4">
              {[
                ['12M+', 'Heroes Forged'],
                ['2.4M+', 'Battles Fought'],
                ['850K+', 'Players'],
                ['∞', 'Legends Remembered'],
              ].map(([value, label]) => (
                <div key={label} className="grid grid-cols-[70px_1fr] items-center gap-4">
                  <div className="font-display text-2xl font-light text-stone-100">{value}</div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">{label}</div>
                </div>
              ))}
            </div>
            <div className="border border-white/8 bg-black/30 p-5">
              <HomeSectionTitle icon={<CalendarDays size={16} />} eyebrow="Daily" title="Ritual Preview" />
              <DailyPreview />
            </div>
          </aside>
        </div>
      </section>

      <section className="grid border-x border-b border-white/8 bg-black/20 xl:grid-cols-3">
        {[
          ['Vault', 'Your heroes. Eternal record.', 'vault'],
          ['Arena', 'Tactical battles. Real consequences.', 'arena'],
          ['Relics', 'Ancient relics. Alter fate.', 'market'],
        ].map(([title, description, target]) => (
          <button
            key={title}
            type="button"
            onClick={() => onNavigate(target as GameSectionKey)}
            className="min-h-56 border-t border-white/8 p-8 text-left transition hover:bg-white/[0.03] xl:border-t-0 xl:border-r xl:last:border-r-0"
          >
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#b49664]">{title}</div>
            <div className="mt-4 font-display text-2xl font-light uppercase leading-8 tracking-[0.12em] text-stone-100">{description}</div>
            <div className="mt-10 text-[10px] uppercase tracking-[0.24em] text-[#d8b06c]">Enter {title}</div>
          </button>
        ))}
      </section>

      <section className="grid border-x border-b border-white/8 bg-black/30 xl:grid-cols-[1fr_1fr_1fr_220px]">
        {[
          ['Latest Battle', 'Angron defeated Lucius in 8 rounds'],
          ['New Relic', 'Voidwalker Cloak joined the relic vault'],
          ['System Update', 'Balance patch v1.2.4 adjusts Arena rewards'],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-white/8 px-8 py-5 xl:border-b-0 xl:border-r">
            <div className="text-[9px] uppercase tracking-[0.24em] text-[#b49664]">{label}</div>
            <div className="mt-2 text-sm leading-6 text-stone-500">{value}</div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="px-8 py-5 text-left text-[10px] uppercase tracking-[0.24em] text-[#d8b06c] hover:bg-white/[0.03]"
        >
          View All News
        </button>
      </section>

      <section className="mt-6">
        <div className="border border-white/8 bg-black/20 p-6">
          <HomeSectionTitle icon={<Gift size={16} />} eyebrow="Offers" title="Starter Store" />
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              ['新手大礼', '$6.99'],
              ['粉尘包', '$9.99'],
              ['遗物包', '$9.99'],
            ].map(([title, price]) => (
              <div key={title} className="border border-white/8 bg-black/30 p-4">
                <div className="text-sm uppercase tracking-[0.18em] text-stone-200">{title}</div>
                <div className="mt-3 font-display text-2xl font-light text-stone-100">{price}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function GuestLandingHomeLive({ onJoin, onNavigate }: { onJoin: () => void; onNavigate: (section: GameSectionKey) => void }) {
  return (
    <div className="mx-auto max-w-[1540px] px-6 py-8 2xl:px-8">
      <section className="relative overflow-hidden border border-white/8 bg-[#050505] px-8 py-10 xl:min-h-[650px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_47%_45%,rgba(190,120,54,0.24),transparent_22%),radial-gradient(circle_at_42%_42%,rgba(255,230,170,0.11),transparent_16%),linear-gradient(90deg,rgba(0,0,0,0.36),transparent_42%,rgba(0,0,0,0.58))]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/60 to-transparent" />

        <div className="relative grid gap-8 xl:grid-cols-[minmax(310px,0.85fr)_minmax(360px,520px)_340px] xl:items-center">
          <div>
            <div className="text-[10px] uppercase tracking-[0.36em] text-[#b49664]">MVP Beta</div>
            <h1 className="mt-5 font-display text-6xl font-light uppercase leading-[1.05] tracking-[0.18em] text-stone-100 md:text-7xl">
              Forge
              <br />
              Legends
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-stone-500">
              Turn an image into a persistent hero card, test it in training, queue for ranked Arena, and recycle Dust and relics inside a server-authoritative game loop.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onJoin}
                className="bg-[#806838] px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-100 transition hover:bg-[#9a7d4a]"
              >
                Join the Forge
              </button>
              <button
                type="button"
                onClick={() => onNavigate('market')}
                className="border border-white/10 px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-400 transition hover:border-stone-500 hover:text-stone-200"
              >
                View Beta Scope
              </button>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[420px]">
            <div className="pointer-events-none absolute inset-x-8 -bottom-7 h-16 rounded-[50%] border border-[#b49664]/25 bg-[#b49664]/15 blur-sm" />
            <div className="relative border border-[#b49664]/45 bg-black/70 p-4 shadow-[0_0_80px_rgba(180,120,54,0.2)]">
              <div className="relative min-h-[520px] overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_50%_26%,rgba(210,150,80,0.28),transparent_25%),linear-gradient(180deg,#17100c_0%,#050505_58%,#090909_100%)]">
                <div className="absolute inset-x-6 top-6 flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-[#d8b06c]">MVP</div>
                    <div className="inline-flex border border-white/10 bg-black/50 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-stone-300">Server Authoritative</div>
                  </div>
                  <div className="font-display text-3xl font-light text-stone-100">Forge</div>
                </div>
                <div className="absolute inset-x-10 top-28 h-56 bg-[radial-gradient(circle_at_50%_30%,rgba(255,226,160,0.35),transparent_18%),radial-gradient(circle_at_50%_62%,rgba(150,58,22,0.38),transparent_30%)]" />
                <div className="absolute inset-x-8 bottom-8">
                  <h2 className="font-display text-3xl font-light tracking-[0.12em] text-stone-100">Current Loop</h2>
                  <p className="mt-3 text-sm leading-6 text-stone-400">Forge, Vault, Train, Arena, Daily rewards, and the relic market are live. Chronicle and recharge are intentionally deferred.</p>
                  <div className="mt-5 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-[0.18em]">
                    <span className="border border-emerald-400/25 bg-emerald-400/10 px-2 py-2 text-emerald-200">Forge</span>
                    <span className="border border-amber-400/25 bg-amber-400/10 px-2 py-2 text-amber-200">Arena</span>
                    <span className="border border-violet-400/25 bg-violet-400/10 px-2 py-2 text-violet-200">Market</span>
                    <span className="border border-teal-400/25 bg-teal-400/10 px-2 py-2 text-teal-200">Daily</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-5">
            <div className="grid gap-4">
              {[
                ['Forge', 'Turn an image into a persistent hero card'],
                ['Train', 'Test builds privately before ranked queueing'],
                ['Arena', 'Enter tactical PvP under BP constraints'],
                ['Market', 'Recycle Dust and relic inventory inside the loop'],
              ].map(([value, label]) => (
                <div key={label} className="grid grid-cols-[70px_1fr] items-center gap-4">
                  <div className="font-display text-2xl font-light text-stone-100">{value}</div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">{label}</div>
                </div>
              ))}
            </div>
            <div className="border border-white/8 bg-black/30 p-5">
              <HomeSectionTitle icon={<CalendarDays size={16} />} eyebrow="Daily" title="Ritual Preview" />
              <DailyPreview />
            </div>
          </aside>
        </div>
      </section>

      <section className="grid border-x border-b border-white/8 bg-black/20 xl:grid-cols-3">
        {[
          ['Vault', 'Your heroes. Eternal record.', 'vault'],
          ['Arena', 'Tactical battles. Real consequences.', 'arena'],
          ['Relics', 'Ancient relics. Alter fate.', 'market'],
        ].map(([title, description, target]) => (
          <button
            key={title}
            type="button"
            onClick={() => onNavigate(target as GameSectionKey)}
            className="min-h-56 border-t border-white/8 p-8 text-left transition hover:bg-white/[0.03] xl:border-t-0 xl:border-r xl:last:border-r-0"
          >
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#b49664]">{title}</div>
            <div className="mt-4 font-display text-2xl font-light uppercase leading-8 tracking-[0.12em] text-stone-100">{description}</div>
            <div className="mt-10 text-[10px] uppercase tracking-[0.24em] text-[#d8b06c]">Enter {title}</div>
          </button>
        ))}
      </section>

      <section className="grid border-x border-b border-white/8 bg-black/30 xl:grid-cols-[1fr_1fr_1fr_220px]">
        {[
          ['MVP Scope', 'Forge, Vault, Train, Arena, Daily rewards, and relic market are in scope.'],
          ['Chronicle', 'PvE campaign is planned after MVP and does not gate first release.'],
          ['Payments', 'Recharge and Stripe settlement stay out of the first public build.'],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-white/8 px-8 py-5 xl:border-b-0 xl:border-r">
            <div className="text-[9px] uppercase tracking-[0.24em] text-[#b49664]">{label}</div>
            <div className="mt-2 text-sm leading-6 text-stone-500">{value}</div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="px-8 py-5 text-left text-[10px] uppercase tracking-[0.24em] text-[#d8b06c] hover:bg-white/[0.03]"
        >
          View All News
        </button>
      </section>

      <section className="mt-6">
        <div className="border border-white/8 bg-black/20 p-6">
          <HomeSectionTitle icon={<Gift size={16} />} eyebrow="Economy" title="Launch Scope" />
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              ['Internal Economy', 'Dust only'],
              ['Relic Trading', 'Live'],
              ['Recharge Later', 'Stripe deferred'],
            ].map(([title, price]) => (
              <div key={title} className="border border-white/8 bg-black/30 p-4">
                <div className="text-sm uppercase tracking-[0.18em] text-stone-200">{title}</div>
                <div className="mt-3 font-display text-2xl font-light text-stone-100">{price}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function SmallProfileStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-white/8 bg-black/25 px-4 py-3">
      <div className="text-[9px] uppercase tracking-[0.22em] text-stone-600">{label}</div>
      <div className="mt-2 text-lg font-light text-stone-100">{value}</div>
    </div>
  );
}

function ProfileLedgerCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="border border-white/8 bg-black/25 p-4">
      <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">{label}</div>
      <div className="mt-3 font-display text-3xl font-light text-stone-100">{value}</div>
      <div className="mt-3 text-xs leading-5 text-stone-500">{hint}</div>
    </div>
  );
}

function ProfileAction({ title, description }: { title: string; description: string }) {
  return (
    <div className="border border-white/8 bg-black/25 p-4">
      <div className="text-sm uppercase tracking-[0.18em] text-stone-200">{title}</div>
      <div className="mt-2 text-xs leading-5 text-stone-500">{description}</div>
    </div>
  );
}

function HomeImage({ tone, label, large = false }: { tone: string; label: string; large?: boolean }) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${tone} ${large ? 'h-64' : 'h-full min-h-36'}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_34%_30%,rgba(220,190,130,0.32),transparent_18%),radial-gradient(circle_at_70%_58%,rgba(255,255,255,0.12),transparent_16%),linear-gradient(135deg,transparent_0%,rgba(0,0,0,0.48)_62%)]" />
      <div className="absolute inset-x-5 bottom-5 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.28em] text-stone-300">{label}</span>
        <span className="h-px w-16 bg-[#b49664]/50" />
      </div>
    </div>
  );
}

function DailyPreview() {
  return (
    <div className="mt-6 space-y-3 border-t border-white/8 pt-6">
      {[
        ['Daily Sign In', '+30 Dust', 'Login to claim today.'],
        ['Forge One Card', '+100 Dust', 'Create a hero in Forge.'],
        ['Use One Relic', '+300 Dust', 'Enchant an existing card with relic power.'],
      ].map(([title, reward, description]) => (
        <div key={title} className="border border-white/8 bg-black/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-stone-100">{title}</div>
              <div className="mt-1 text-xs text-stone-500">{description}</div>
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#d8b06c]">{reward}</div>
          </div>
        </div>
      ))}
    </div>
  );
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

function PlaceholderPage({ title, eyebrow, description }: { title: string; eyebrow: string; description: string }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-74px)] max-w-[1540px] items-center justify-center px-8 py-10">
      <section className="w-full max-w-3xl border border-white/8 bg-black/25 p-10 text-center">
        <div className="text-[10px] uppercase tracking-[0.32em] text-[#b49664]">{eyebrow}</div>
        <h1 className="mt-4 font-display text-5xl font-light uppercase tracking-[0.2em] text-stone-100">{title}</h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-stone-500">{description}</p>
        <button
          type="button"
          className="mt-8 cursor-not-allowed border border-white/10 px-7 py-3 text-[11px] uppercase tracking-[0.24em] text-stone-500"
        >
          Initializing
        </button>
      </section>
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
      const forgedHeroId = refreshedHeroes.find((hero) => hero.character.name === normalizedHero.name)?.id ?? refreshedHeroes[0]?.id;
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
          dust={dustBalance(economy)}
          relics={relicBalance(economy)}
          economy={economy}
          token={session?.token ?? getStoredToken()}
          onNavigate={handleNavigate}
          onEconomyChange={setEconomy}
          onOpenAuth={() => setAuthOpen(true)}
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
      return (
        <PlaceholderPage
          eyebrow="Chronicle"
          title="Chronicle"
          description="Chronicle is reserved for the future PvE campaign branch. It is intentionally not part of the first MVP release, so the current live loop stays focused on Forge, Vault, Train, Arena, Daily rewards, and the relic market."
        />
      );
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
