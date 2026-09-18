import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  RefreshCw,
  Search,
  Swords,
  Trash2,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { BattleVisualizer } from './BattleVisualizer';
import { advanceLocalManualBattle, startLocalManualBattle } from '../lib/manualBattle';
import { acceptBattleSessionSnapshot, applyPreparationPositions, formationPositions, movePreparationCard } from '../lib/battlePreparation';
import { cancelPvpEntry, submitBattleSessionAction, prepareBattleSession, confirmBattleFormation, createFriendChallenge, fetchBattleSession, fetchFriends, fetchPvpEntryStatus, getStoredToken, joinArenaQueue, removeFriend, respondFriendChallenge, respondFriendRequest, sendFriendRequest } from '../lib/api';
import { resolveRarity, normalizeCardType, toNumber, type Rarity } from '../lib/gameLogic';
import { CARD_FALLBACK_SRC } from '../lib/cards';
import { mockHeroes } from '../lib/mockContent';
import { cn } from '../lib/utils';
import { MOCK_STORAGE_KEYS, STORAGE_NAMESPACE } from '../lib/runtimeMode';
import type { BattleBoardState, BattleBoardUnit } from '../lib/battleTypes';
import type { ArenaFormation, ArenaSlotKey, BattleHistoryRecord, BattleResult, BattleSessionAction, BattleSessionSnapshot, EconomySnapshot, FriendsSnapshot, PvpMatchRecord, PvpQueueEntry, SavedHero } from '../types';

type ArenaTab = 'queue' | 'train' | 'friends' | 'battle';

type StoredArenaState = {
  selectedHeroIds: string[];
  queueKey: string;
  resumeEntryId: string | null;
};

type ArenaPageProps = {
  heroes: SavedHero[];
  economy: EconomySnapshot | null;
  token?: string | null;
  demoMode?: boolean;
  activeTab: ArenaTab;
  onTabChange: (tab: ArenaTab) => void;
  onBattleLockChange: (locked: boolean) => void;
  replayRecord?: BattleHistoryRecord | null;
  onReplayClose?: () => void;
  onRefresh: () => Promise<void>;
  sectionTitle?: 'Arena' | 'Home';
};

const STORAGE_KEY = `${STORAGE_NAMESPACE}.pvp.arena.v1`;
const MOCK_FRIENDS_STORAGE_KEY = MOCK_STORAGE_KEYS.friends;
const DEFAULT_QUEUE_KEY = 'ranked';
const MAX_TEAM_SIZE = 4;
const ARENA_CARD_PAGE_SIZE = 10;
const ARENA_ROWS: Array<{ label: string; slots: ArenaSlotKey[] }> = [
  { label: 'Lane 1', slots: ['front_0', 'back_0'] },
  { label: 'Lane 2', slots: ['front_1', 'back_1'] },
  { label: 'Lane 3', slots: ['front_2', 'back_2'] },
];
const ARENA_SLOT_ORDER: ArenaSlotKey[] = ['front_0', 'front_1', 'front_2', 'back_0', 'back_1', 'back_2'];

const demoHeroes: SavedHero[] = mockHeroes;
const demoFriends: FriendsSnapshot = {
  friends: [{ id: 'demo-friend-rival', email: 'rival@example.com', friends_since: new Date().toISOString() }],
  incoming_requests: [{ id: 'demo-request', status: 'pending', user_id: 'demo-scout', email: 'scout@example.com', created_at: new Date().toISOString() }],
  outgoing_requests: [],
  incoming_challenges: [{
    id: 'demo-challenge', challenger_user_id: 'demo-friend-rival', challenged_user_id: 'simulation-player', status: 'pending',
    challenger_email: 'rival@example.com', expires_at: new Date(Date.now() + 600_000).toISOString(), created_at: new Date().toISOString(),
  }],
  outgoing_challenges: [],
};

const arenaRarityTone: Record<Rarity, { text: string; border: string; label: string }> = {
  mythic: { text: 'text-[#d7a852]', border: 'border-[#b49664]/70', label: 'MYTHIC' },
  epic: { text: 'text-violet-300', border: 'border-violet-400/40', label: 'EPIC' },
  rare: { text: 'text-sky-300', border: 'border-sky-400/35', label: 'RARE' },
  common: { text: 'text-stone-400', border: 'border-white/10', label: 'COMMON' },
};

function createDemoHero(id: string, name: string, type: string, bp: number, hp: number, atk: number, def: number, speed: number, skill: string): SavedHero {
  return {
    id,
    createdAt: Date.now(),
    pvpLifeState: 'active',
    pveLifeState: 'active',
    cardStatus: 'active',
    character: {
      name,
      description: `${type} prepared for formal Arena deployment.`,
      BP: String(bp),
      template: type,
      state: {
        HP: String(hp),
        MP: '100',
        ATK: String(atk),
        DEF: String(def),
        CC: '18',
        SPEED: String(speed),
        CA: '12',
        PI: '10',
        EV: '8',
        AC: '8',
        TYPE: type,
        type_catalog: 'instant',
        type_effect: 'strike',
      },
      skill: {
        s1: { name: skill, description: 'Primary Arena protocol.', TYPE: 'attack', TARGET: 'Enemy', TARGET_NUM: '1' },
        s2: { name: 'Tactical Oath', description: 'Secondary Arena protocol.', TYPE: 'buff', TARGET: 'Self', TARGET_NUM: '1' },
      },
    },
  };
}

function createPreviewRivals() {
  return [
    createDemoHero('preview-lucius', 'Lucius', 'Paladin', 10800, 3024, 342, 62, 78, 'Holy Shield'),
    createDemoHero('preview-archer', 'Holy Archer', 'Ranger', 7350, 2050, 310, 42, 118, 'Dawn Volley'),
    createDemoHero('preview-priestess', 'Priestess', 'Support', 5840, 1880, 196, 55, 86, 'Faithful'),
    createDemoHero('preview-hound', 'Divine Hound', 'Beast', 5120, 2240, 260, 40, 102, 'Hunting Mark'),
  ];
}

function readStoredArenaState(): StoredArenaState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredArenaState>;
    return {
      selectedHeroIds: Array.isArray(parsed.selectedHeroIds) ? parsed.selectedHeroIds.map(String) : [],
      queueKey: DEFAULT_QUEUE_KEY,
      resumeEntryId: typeof parsed.resumeEntryId === 'string' && parsed.resumeEntryId.trim() ? parsed.resumeEntryId.trim() : null,
    };
  } catch {
    return null;
  }
}

function writeStoredArenaState(state: StoredArenaState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function readStoredMockFriends(): FriendsSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MOCK_FRIENDS_STORAGE_KEY) || 'null') as Partial<FriendsSnapshot> | null;
    if (
      !parsed
      || !Array.isArray(parsed.friends)
      || !Array.isArray(parsed.incoming_requests)
      || !Array.isArray(parsed.outgoing_requests)
      || !Array.isArray(parsed.incoming_challenges)
      || !Array.isArray(parsed.outgoing_challenges)
    ) return null;
    return parsed as FriendsSnapshot;
  } catch {
    return null;
  }
}

function writeStoredMockFriends(snapshot: FriendsSnapshot) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MOCK_FRIENDS_STORAGE_KEY, JSON.stringify(snapshot));
}

function formatNumber(value: unknown) {
  const numericValue = typeof value === 'number' ? value : toNumber(value, 0);
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(numericValue || 0)));
}

function heroTotalBp(hero: SavedHero) {
  return toNumber(hero.character.BP, 0);
}

function heroTypeLabel(hero: SavedHero) {
  return normalizeCardType(hero.character.state.TYPE).toUpperCase();
}

function arenaArtClass(hero: SavedHero) {
  const lower = `${hero.character.state.TYPE} ${hero.character.template ?? ''}`.toLowerCase();
  if (lower.includes('fire')) return 'from-[#542515] via-[#18110e] to-[#070707]';
  if (lower.includes('dark') || lower.includes('void')) return 'from-[#172033] via-[#0d1018] to-[#060606]';
  if (lower.includes('nature')) return 'from-[#173126] via-[#10140f] to-[#060606]';
  if (lower.includes('frost') || lower.includes('storm')) return 'from-[#182b3f] via-[#101317] to-[#060606]';
  if (lower.includes('light')) return 'from-[#463620] via-[#17130f] to-[#060606]';
  return 'from-[#2b241b] via-[#111111] to-[#060606]';
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const maxPage = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, maxPage);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    maxPage,
    items: items.slice(start, start + pageSize),
  };
}

function rankHeroes(heroes: SavedHero[]) {
  return [...heroes].sort((a, b) => heroTotalBp(b) - heroTotalBp(a));
}

function isArenaEligible(hero: SavedHero) {
  return hero.pvpLifeState !== 'pvp_dead' && hero.cardStatus !== 'decomposed' && !hero.activePvpEntryId;
}

function buildArenaFormation(heroIds: string[]): ArenaFormation {
  return ARENA_SLOT_ORDER.reduce((formation, slot, index) => {
    formation[slot] = heroIds[index] ?? null;
    return formation;
  }, {} as ArenaFormation);
}

function resolveBattleResult(match?: PvpMatchRecord | null, battle?: BattleResult | null) {
  return battle ?? match?.battle_result ?? null;
}

function battleSessionToResult(session: BattleSessionSnapshot | null): BattleResult | null {
  if (!session) return null;
  if (session.result) return session.result;
  const board = session.board;
  if (!board) return null;
  const totalHp = (units: typeof board.bottom) => units.reduce((sum, unit) => sum + Math.max(0, unit?.hp ?? 0), 0);
  const totalMaxHp = (units: typeof board.bottom) => units.reduce((sum, unit) => sum + Math.max(0, unit?.maxHp ?? 0), 0);
  const alive = (units: typeof board.bottom) => units.filter((unit) => unit?.alive && unit.hp > 0).length;
  return {
    winner: 'Pending',
    winnerLabel: 'Battle in progress',
    logs: session.logs ?? [],
    events: session.events ?? [],
    board,
    boardHistory: session.boardHistory?.length ? session.boardHistory : [board],
    finalHpA: totalHp(board.bottom),
    finalHpB: totalHp(board.top),
    maxHpA: totalMaxHp(board.bottom),
    maxHpB: totalMaxHp(board.top),
    aliveA: alive(board.bottom),
    aliveB: alive(board.top),
    summary: session.lastActionSource === 'program' ? 'Program controller advanced the current turn.' : 'Waiting for the active Agent or program fallback.',
  };
}

function heroSessionPayload(hero: SavedHero) {
  return { id: hero.id, character: hero.character, image: hero.image };
}

function unitFromHero(hero: SavedHero, side: 'A' | 'B', slot: number): BattleBoardUnit {
  const hp = toNumber(hero.character.state.HP, 1000);
  const mp = toNumber(hero.character.state.MP, 100);
  return {
    tag: `${side}${slot + 1}`,
    side,
    slot,
    name: hero.character.name,
    image: hero.image ?? null,
    alive: true,
    hp,
    maxHp: hp,
    mp,
    maxMp: mp,
    buffs: [],
    skills: hero.character.skill,
    state: { ...hero.character.state } as BattleBoardUnit['state'],
  };
}

function cloneBattleUnit(unit: BattleBoardUnit | null): BattleBoardUnit | null {
  if (!unit) return null;
  return {
    ...unit,
    buffs: unit.buffs.map((buff) => ({ ...buff })),
    skills: unit.skills
      ? Object.fromEntries(Object.entries(unit.skills).map(([key, skill]) => [key, skill ? { ...skill } : undefined]))
      : undefined,
    state: unit.state ? { ...unit.state } : undefined,
  };
}

function cloneBattleUnits(units: Array<BattleBoardUnit | null>) {
  return units.map(cloneBattleUnit);
}

function unitSpeed(unit: BattleBoardUnit | null) {
  return toNumber(unit?.state?.SPEED, 0);
}

function unitAttack(unit: BattleBoardUnit | null) {
  return toNumber(unit?.state?.ATK, 20);
}

function unitDefense(unit: BattleBoardUnit | null) {
  return toNumber(unit?.state?.DEF, 0);
}

function firstAliveUnit(units: Array<BattleBoardUnit | null>) {
  return units.find((unit) => unit && unit.alive && unit.hp > 0) ?? null;
}

function teamHp(units: Array<BattleBoardUnit | null>) {
  return units.reduce((sum, unit) => sum + Math.max(0, unit?.hp ?? 0), 0);
}

function teamAlive(units: Array<BattleBoardUnit | null>) {
  return units.filter((unit) => unit && unit.alive && unit.hp > 0).length;
}

function createTrainingBoardSnapshot(round: number, bottom: Array<BattleBoardUnit | null>, top: Array<BattleBoardUnit | null>, riverLabel = 'Training'): NonNullable<BattleResult['board']> {
  return {
    round,
    riverLabel,
    topLabel: 'Rival',
    bottomLabel: 'Forger',
    top: cloneBattleUnits(top),
    bottom: cloneBattleUnits(bottom),
  };
}

function simulateTrainingBattle(bottom: Array<BattleBoardUnit | null>, top: Array<BattleBoardUnit | null>, riverLabel = 'Training') {
  const events: BattleResult['events'] = [];
  const logs: string[] = [];
  const boardHistory: NonNullable<BattleResult['board']>[] = [createTrainingBoardSnapshot(1, bottom, top, riverLabel)];
  const maxRounds = 12;

  for (let round = 1; round <= maxRounds && teamAlive(bottom) > 0 && teamAlive(top) > 0; round += 1) {
    const turnOrder = [...bottom, ...top]
      .filter((unit): unit is BattleBoardUnit => Boolean(unit && unit.alive && unit.hp > 0))
      .sort((a, b) => unitSpeed(b) - unitSpeed(a) || a.tag.localeCompare(b.tag));

    for (const actor of turnOrder) {
      if (!actor.alive || actor.hp <= 0) continue;
      const targetTeam = actor.side === 'A' ? top : bottom;
      const target = firstAliveUnit(targetTeam);
      if (!target) break;

      const rawDamage = unitAttack(actor) - Math.floor(unitDefense(target) * 0.45);
      const damage = Math.max(1, rawDamage);
      target.hp = Math.max(0, target.hp - damage);
      target.alive = target.hp > 0;
      const actionType = round % 3 === 1 ? 'skill' : 'attack';
      const skillName = actionType === 'skill'
        ? String(actor.state?.TYPE ?? 'Skill Strike').split(' ')[0] + ' Strike'
        : undefined;
      const log = `[Round ${round}] ${actor.tag} uses ${skillName ? `[${skillName}]` : '[Attack]'} on ${target.tag} for ${damage} damage`;

      logs.push(log);
      events.push({
        round,
        attacker: actor.tag,
        defender: target.tag,
        attackerSlot: actor.slot,
        defenderSlot: target.slot,
        actionType,
        skillName,
        attackType: String(actor.state?.TYPE ?? 'weapon'),
        buffName: null,
        skillRole: actionType === 'skill' ? 'attack' : null,
        rangeMode: 'front',
        damage,
        heal: 0,
        isCrit: false,
        isMiss: false,
        isStunned: false,
        hpA: teamHp(bottom),
        hpB: teamHp(top),
        mpA: bottom.reduce((sum, unit) => sum + Math.max(0, unit?.mp ?? 0), 0),
        mpB: top.reduce((sum, unit) => sum + Math.max(0, unit?.mp ?? 0), 0),
        maxHpA: bottom.reduce((sum, unit) => sum + Math.max(0, unit?.maxHp ?? 0), 0),
        maxHpB: top.reduce((sum, unit) => sum + Math.max(0, unit?.maxHp ?? 0), 0),
        maxMpA: bottom.reduce((sum, unit) => sum + Math.max(0, unit?.maxMp ?? 0), 0),
        maxMpB: top.reduce((sum, unit) => sum + Math.max(0, unit?.maxMp ?? 0), 0),
        buffsA: [],
        buffsB: [],
        mpCostApplied: 0,
        log,
        timestamp: Date.now() + events.length,
      });
      boardHistory.push(createTrainingBoardSnapshot(round, bottom, top, riverLabel));

      if (teamAlive(bottom) === 0 || teamAlive(top) === 0) break;
    }
  }

  return { events, logs, boardHistory };
}

function enrichBoardUnits(units: Array<BattleBoardUnit | null> | undefined, heroes: SavedHero[]) {
  const heroBySlot = new Map(heroes.map((hero, index) => [index, hero]));
  const heroByName = new Map(heroes.map((hero) => [hero.character.name.toLowerCase(), hero]));
  return (units ?? []).map((unit) => {
    if (!unit) return null;
    const hero = heroByName.get(unit.name.toLowerCase()) ?? heroBySlot.get(unit.slot);
    if (!hero) return unit;
    return {
      ...unit,
      image: unit.image ?? hero.image ?? null,
      skills: unit.skills ?? hero.character.skill,
    };
  });
}

function enrichBattleResultImages(result: BattleResult, teamA: SavedHero[], teamB: SavedHero[]): BattleResult {
  const enrichBoard = (board: NonNullable<BattleResult['board']>) => {
    return {
      ...board,
      bottom: enrichBoardUnits(board.bottom, teamA),
      top: enrichBoardUnits(board.top, teamB),
    };
  };
  return {
    ...result,
    board: result.board ? enrichBoard(result.board) : undefined,
    boardHistory: result.boardHistory?.map(enrichBoard),
  };
}


function SmallStat({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'gold' | 'green' | 'red' }) {
  const toneClass =
    tone === 'gold'
      ? 'text-[#d8b06c]'
      : tone === 'green'
        ? 'text-emerald-300'
        : tone === 'red'
          ? 'text-rose-300'
          : 'text-stone-100';
  return (
    <div className="border border-white/8 bg-black/25 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">{label}</div>
      <div className={cn('mt-2 text-lg font-light', toneClass)}>{value}</div>
    </div>
  );
}

function PanelTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div>
      {eyebrow && <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#b49664]">{eyebrow}</div>}
      <h2 className="mt-2 font-display text-2xl font-light uppercase tracking-[0.2em] text-stone-100">{title}</h2>
    </div>
  );
}

function ArenaPageControl({ page, maxPage, onChange }: { page: number; maxPage: number; onChange: (next: number) => void }) {
  if (maxPage <= 1) return null;
  const visiblePages = Array.from({ length: Math.min(maxPage, 4) }, (_, index) => index + 1);
  return (
    <div className="mt-auto flex items-center justify-center gap-3 pt-8 text-[11px] uppercase tracking-[0.18em] text-stone-500">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        className="flex h-8 w-8 items-center justify-center border border-white/10 hover:text-stone-200"
        aria-label="Previous page"
      >
        <ChevronLeft size={14} />
      </button>
      {visiblePages.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={cn(
            'flex h-8 min-w-8 items-center justify-center border px-2',
            value === page ? 'border-[#b49664]/50 bg-[#b49664]/10 text-stone-100' : 'border-white/10 hover:text-stone-200'
          )}
        >
          {value}
        </button>
      ))}
      {maxPage > visiblePages.length && <span className="px-1">...</span>}
      <button
        type="button"
        onClick={() => onChange(Math.min(maxPage, page + 1))}
        className="flex h-8 w-8 items-center justify-center border border-white/10 hover:text-stone-200"
        aria-label="Next page"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

function ArenaToolbar({
  search,
  onSearchChange,
  onClear,
  right,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  onClear: () => void;
  right?: ReactNode;
}) {
  return (
    <div className="grid gap-3 border-b border-white/8 px-5 py-4 lg:grid-cols-[minmax(220px,1fr)_160px_160px_auto]">
      <label className="flex h-10 min-w-0 items-center border border-white/10 bg-black/45 px-3 focus-within:border-[#b49664]/45">
        <Search size={15} className="mr-2 shrink-0 text-stone-600" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search cards..."
          className="w-full bg-transparent text-sm text-stone-300 outline-none placeholder:text-stone-600"
        />
        {search && (
          <button type="button" onClick={onClear} className="ml-2 text-stone-600 hover:text-stone-300" aria-label="Clear search">
            <X size={14} />
          </button>
        )}
      </label>
      <select className="h-10 border border-white/10 bg-black/45 px-3 text-[10px] uppercase tracking-[0.2em] text-stone-500 outline-none">
        <option>All factions</option>
      </select>
      <select className="h-10 border border-white/10 bg-black/45 px-3 text-[10px] uppercase tracking-[0.2em] text-stone-500 outline-none">
        <option>All rarities</option>
      </select>
      <div className="flex items-center justify-end gap-2">{right}</div>
    </div>
  );
}

function ArenaHeroTile({
  hero,
  selectedForger,
  selectedRival = false,
  disabled = false,
  onSelectForger,
  onSelectRival,
  mode,
}: {
  hero: SavedHero;
  selectedForger: boolean;
  selectedRival?: boolean;
  disabled?: boolean;
  onSelectForger: () => void;
  onSelectRival?: () => void;
  mode: 'queue' | 'train';
}) {
  const rarity = resolveRarity(hero.character);
  const tone = arenaRarityTone[rarity];
  const borderClass = selectedRival && !selectedForger
    ? 'border-rose-500/60 shadow-[0_0_24px_rgba(127,29,29,0.22)]'
    : selectedForger && selectedRival
      ? 'border-[#b49664]/70 shadow-[0_0_26px_rgba(180,80,72,0.22)]'
      : selectedForger
        ? 'border-[#b49664]/75 shadow-[0_0_24px_rgba(180,150,100,0.20)]'
        : tone.border;

  return (
    <div
      className={cn(
        'portrait-card group relative w-full overflow-hidden border bg-[#090909] text-left transition duration-200',
        borderClass,
        disabled ? 'opacity-45' : 'hover:-translate-y-0.5 hover:border-stone-500'
      )}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-95', arenaArtClass(hero))} />
      <img src={hero.image || CARD_FALLBACK_SRC} alt={hero.character.name} className="absolute inset-0 h-full w-full object-cover object-top opacity-72" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.56)_14%,rgba(0,0,0,0.10)_38%,rgba(0,0,0,0.16)_58%,rgba(0,0,0,0.82)_80%,rgba(0,0,0,0.98)_100%)]" />
      {selectedForger && <div className="absolute inset-0 bg-[#b49664]/10" />}
      {selectedRival && <div className="absolute inset-0 bg-rose-950/22" />}
      <div className="absolute left-4 right-4 top-3 flex items-start justify-between gap-3">
        <div>
          <div className={cn('text-[9px] font-semibold uppercase tracking-[0.18em]', tone.text)}>{tone.label}</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-stone-500">{heroTypeLabel(hero)}</div>
        </div>
        <div className="text-sm font-light tracking-[0.05em] text-stone-100">{formatNumber(heroTotalBp(hero))}</div>
      </div>
      {mode === 'queue' && (
        <button
          type="button"
          onClick={onSelectForger}
          disabled={disabled}
          className="absolute inset-0 disabled:cursor-not-allowed"
          aria-label={`Toggle ${hero.character.name}`}
        />
      )}
      {(selectedForger || selectedRival) && (
        <div
          className={cn(
            'absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full border text-stone-100',
            selectedRival && !selectedForger ? 'border-rose-300/70 bg-rose-900/80' : 'border-[#f0d8ad]/70 bg-[#806838]/85'
          )}
        >
          <CheckCircle2 size={16} />
        </div>
      )}
      <div className="pointer-events-none absolute bottom-4 left-4 right-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[1.12rem] font-light leading-tight tracking-[0.02em] text-stone-100">{hero.character.name}</div>
            <div className="mt-2 truncate text-[10px] uppercase tracking-[0.18em] text-stone-500">{hero.character.skill.s1?.name || 'Unbound Skill'}</div>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-stone-600">BP</div>
        </div>
      </div>
      {mode === 'train' && (
        <div className="absolute right-3 top-12 z-20 grid gap-2">
          <button
            type="button"
            onClick={onSelectForger}
            title="Forger"
            disabled={disabled}
            className={cn(
              'flex h-8 w-8 items-center justify-center border text-[10px] font-semibold uppercase transition disabled:cursor-not-allowed',
              selectedForger ? 'border-[#b49664]/65 bg-[#3a2a10]/90 text-[#f0d8ad]' : 'border-white/10 bg-black/70 text-stone-400 hover:text-stone-100'
            )}
          >
            F
          </button>
          <button
            type="button"
            onClick={onSelectRival}
            title="Rival"
            disabled={disabled}
            className={cn(
              'flex h-8 w-8 items-center justify-center border text-[10px] font-semibold uppercase transition disabled:cursor-not-allowed',
              selectedRival ? 'border-rose-500/55 bg-rose-950/85 text-rose-100' : 'border-white/10 bg-black/70 text-stone-400 hover:text-stone-100'
            )}
          >
            R
          </button>
        </div>
      )}
    </div>
  );
}

function RosterThumb({ hero, tone }: { hero: SavedHero | null; tone: 'gold' | 'red' }) {
  return (
    <div
      className={cn(
        'portrait-card relative w-full overflow-hidden border bg-black/35',
        hero ? (tone === 'gold' ? 'border-[#b49664]/55' : 'border-rose-500/45') : 'border-dashed border-white/10'
      )}
    >
      {hero ? (
        <>
          <div className={cn('absolute inset-0 bg-gradient-to-br', arenaArtClass(hero))} />
          <img src={hero.image || CARD_FALLBACK_SRC} alt={hero.character.name} className="absolute inset-0 h-full w-full object-cover object-top opacity-80" />
          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/90 to-transparent" />
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-[9px] uppercase tracking-[0.18em] text-stone-700">Empty</div>
      )}
    </div>
  );
}

function RosterStrip({ label, team, tone }: { label: string; team: SavedHero[]; tone: 'gold' | 'red' }) {
  const slots = Array.from({ length: MAX_TEAM_SIZE }, (_, index) => team[index] ?? null);
  return (
    <div className="border-b border-white/8 px-5 py-5 last:border-b-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn('h-7 w-7 border', tone === 'gold' ? 'border-[#b49664]/55 bg-[#b49664]/10' : 'border-rose-500/45 bg-rose-950/25')} />
          <div className={cn('text-[11px] font-semibold uppercase tracking-[0.32em]', tone === 'gold' ? 'text-[#f0d8ad]' : 'text-rose-100')}>{label}</div>
        </div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{team.length} / {MAX_TEAM_SIZE}</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {slots.map((hero, index) => <RosterThumb key={`${label}-${hero?.id ?? index}`} hero={hero} tone={tone} />)}
      </div>
    </div>
  );
}

function PowerComparison({ left, right = 0, leftLabel = 'Forger', rightLabel = 'Rival' }: { left: number; right?: number; leftLabel?: string; rightLabel?: string }) {
  const total = Math.max(1, left + right);
  const leftPct = right > 0 ? Math.max(8, Math.min(92, (left / total) * 100)) : 100;
  return (
    <div className="px-5 py-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#d8b06c]">Power Comparison</div>
        <Swords size={16} className="text-stone-600" />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#b49664]">{leftLabel}</div>
          <div className="mt-1 text-2xl font-light text-stone-100">{formatNumber(left)}</div>
        </div>
        <div className="pb-1 text-stone-600">vs</div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.2em] text-rose-300">{rightLabel}</div>
          <div className="mt-1 text-2xl font-light text-rose-200">{right > 0 ? formatNumber(right) : '-'}</div>
        </div>
      </div>
      <div className="mt-4 h-2 border border-white/8 bg-black/45">
        <div className="h-full bg-[#b49664]" style={{ width: `${leftPct}%` }} />
        {right > 0 && <div className="float-right -mt-2 h-full bg-rose-700/80" style={{ width: `${100 - leftPct}%` }} />}
      </div>
    </div>
  );
}

export function ArenaPage({ heroes, economy, token, demoMode = false, activeTab, onTabChange, onBattleLockChange, replayRecord = null, onReplayClose, onRefresh, sectionTitle = 'Arena' }: ArenaPageProps) {
  const displayHeroes = demoMode && heroes.length === 0 ? demoHeroes : heroes;
  const [search, setSearch] = useState('');
  const [queuePage, setQueuePage] = useState(1);
  const [trainPage, setTrainPage] = useState(1);
  const [selectedHeroIds, setSelectedHeroIds] = useState<string[]>(() => readStoredArenaState()?.selectedHeroIds ?? []);
  const [trainTeamAIds, setTrainTeamAIds] = useState<string[]>([]);
  const [trainTeamBIds, setTrainTeamBIds] = useState<string[]>([]);
  const queueKey = DEFAULT_QUEUE_KEY;
  const [resumeEntryId, setResumeEntryId] = useState<string | null>(() => readStoredArenaState()?.resumeEntryId ?? null);
  const [battleOrder, setBattleOrder] = useState<string[]>([]);
  const [queueEntry, setQueueEntry] = useState<PvpQueueEntry | null>(null);
  const [, setMatchRecord] = useState<PvpMatchRecord | null>(null);
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const [battleSession, setBattleSession] = useState<BattleSessionSnapshot | null>(null);
  const [combatControl, setCombatControl] = useState<'program' | 'manual'>('program');
  const actionPending = useRef(false);
  const [localPreparation, setLocalPreparation] = useState<BattleBoardState | null>(null);
  const [formationDraft, setFormationDraft] = useState<{ id: string; positions: Record<string, number> } | null>(null);
  const [friends, setFriends] = useState<FriendsSnapshot | null>(() => demoMode ? readStoredMockFriends() ?? demoFriends : null);
  const [friendEmail, setFriendEmail] = useState('');
  const [pendingFriendRemovalId, setPendingFriendRemovalId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const initializedRef = useRef(false);
  const mockQueueTimerRef = useRef<number | null>(null);
  const currentToken = token ?? getStoredToken();

  useEffect(() => () => {
    if (mockQueueTimerRef.current !== null) window.clearTimeout(mockQueueTimerRef.current);
  }, []);

  useEffect(() => {
    if (initializedRef.current || !displayHeroes.length) return;
    initializedRef.current = true;
    const stored = readStoredArenaState();
    const availableIds = new Set(displayHeroes.map((hero) => hero.id));
    setSelectedHeroIds((current) => current.filter((id) => availableIds.has(id)).slice(0, MAX_TEAM_SIZE));
    if (stored) setResumeEntryId(stored.resumeEntryId);
  }, [demoMode, displayHeroes]);

  useEffect(() => {
    if (!initializedRef.current) return;
    writeStoredArenaState({
      selectedHeroIds,
      queueKey,
      resumeEntryId,
    });
  }, [demoMode, selectedHeroIds, queueKey, resumeEntryId]);

  useEffect(() => {
    if (demoMode && friends) writeStoredMockFriends(friends);
  }, [demoMode, friends]);

  useEffect(() => {
    setBattleOrder((current) => {
      const retained = current.filter((id) => selectedHeroIds.includes(id));
      const additions = selectedHeroIds.filter((id) => !retained.includes(id));
      return [...retained, ...additions];
    });
  }, [selectedHeroIds]);

  const rankedHeroes = useMemo(() => rankHeroes(displayHeroes), [displayHeroes]);
  const filteredHeroes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rankedHeroes;
    return rankedHeroes.filter((hero) => {
      const character = hero.character;
      return [character.name, character.description, character.state.TYPE, character.template || '']
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [rankedHeroes, search]);
  const pagedQueueHeroes = useMemo(() => paginate(filteredHeroes, queuePage, ARENA_CARD_PAGE_SIZE), [filteredHeroes, queuePage]);
  const pagedTrainHeroes = useMemo(() => paginate(filteredHeroes, trainPage, ARENA_CARD_PAGE_SIZE), [filteredHeroes, trainPage]);

  useEffect(() => {
    setQueuePage(1);
    setTrainPage(1);
  }, [search, activeTab]);

  const selectedHeroes = useMemo(
    () => selectedHeroIds.map((id) => displayHeroes.find((hero) => hero.id === id)).filter((hero): hero is SavedHero => Boolean(hero)),
    [displayHeroes, selectedHeroIds]
  );
  const trainTeamA = useMemo(
    () => trainTeamAIds.map((id) => displayHeroes.find((hero) => hero.id === id)).filter((hero): hero is SavedHero => Boolean(hero)),
    [displayHeroes, trainTeamAIds]
  );
  const trainTeamB = useMemo(
    () => trainTeamBIds.map((id) => displayHeroes.find((hero) => hero.id === id)).filter((hero): hero is SavedHero => Boolean(hero)),
    [displayHeroes, trainTeamBIds]
  );
  const battleOrderHeroes = useMemo(
    () => battleOrder.map((id) => selectedHeroes.find((hero) => hero.id === id)).filter((hero): hero is SavedHero => Boolean(hero)),
    [battleOrder, selectedHeroes]
  );
  const arenaFormation = useMemo(() => buildArenaFormation(selectedHeroIds), [selectedHeroIds]);

  const totalBp = useMemo(() => selectedHeroes.reduce((sum, hero) => sum + heroTotalBp(hero), 0), [selectedHeroes]);
  const trainBpA = useMemo(() => trainTeamA.reduce((sum, hero) => sum + heroTotalBp(hero), 0), [trainTeamA]);
  const trainBpB = useMemo(() => trainTeamB.reduce((sum, hero) => sum + heroTotalBp(hero), 0), [trainTeamB]);
  const tolerancePct = economy?.pvp.match_tolerance_pct ?? 10;
  const relicDropPct = economy?.pvp.low_tier_relic_drop_pct ?? 3;
  const stakeDust = economy?.costs.pvp_stake ?? economy?.costs.pvp_entry ?? 30;
  const walletDust = demoMode ? 865 : economy?.wallet?.dust_balance ?? economy?.starter.dust_balance ?? 0;
  const lowerBp = totalBp > 0 ? Math.ceil(totalBp / (1 + tolerancePct / 100)) : 0;
  const upperBp = totalBp > 0 ? Math.floor(totalBp * (1 + tolerancePct / 100)) : 0;
  const selectedHeroesEligible = selectedHeroes.every(isArenaEligible);
  const waiting = queueEntry?.status === 'waiting';
  const queueReady = selectedHeroes.length > 0 && selectedHeroes.length <= MAX_TEAM_SIZE && selectedHeroesEligible && walletDust >= stakeDust && !busy;
  const liveBattleResult = useMemo(() => battleResult ?? battleSessionToResult(battleSession), [battleResult, battleSession]);
  const replayResult = useMemo(
    () => (!battleResult && !battleSession && replayRecord?.result ? replayRecord.result : null),
    [battleResult, battleSession, replayRecord]
  );
  const preparationSource = localPreparation ?? (battleSession?.status === 'preparing' ? battleSession.board : null);
  const preparationId = localPreparation ? 'simulation' : battleSession?.sessionId ?? '';
  const ownSide = battleSession?.viewerSide ?? 'A';
  const ownReady = !localPreparation && Boolean(battleSession?.readiness?.[ownSide]);
  const rivalReady = Boolean(localPreparation || battleSession?.readiness?.[ownSide === 'A' ? 'B' : 'A']);
  const preparationBoard = useMemo(() => {
    if (!preparationSource) return null;
    const source = enrichBattleResultImages({ winner: 'Pending', logs: [], events: [], board: preparationSource }, displayHeroes, displayHeroes).board!;
    return formationDraft?.id === preparationId && !ownReady ? applyPreparationPositions(source, ownSide, formationDraft.positions) : source;
  }, [preparationSource, displayHeroes, formationDraft, preparationId, ownReady, ownSide]);
  const preparationResult: BattleResult | null = preparationBoard ? { winner: 'Pending', logs: [], events: [], board: preparationBoard, boardHistory: [preparationBoard] } : null;
  const shownBattleResult = preparationResult ?? liveBattleResult ?? replayResult;
  const battleLoaded = activeTab === 'battle' && Boolean(shownBattleResult);

  const beginPreparation = useCallback(async (teamA: SavedHero[], teamB: SavedHero[]) => {
    if (!teamA.length || !teamB.length) { setError('Choose cards for both sides first.'); return; }
    if (!demoMode && (!currentToken || currentToken === 'mock-token')) { setError('Please login first.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      setBattleResult(null); setBattleSession(null); setLocalPreparation(null); setFormationDraft(null);
      setMatchRecord(null); setQueueEntry(null); setResumeEntryId(null);
      if (demoMode) {
        const bottom = Array.from({ length: 6 }, (_, index) => teamA[index] ? unitFromHero(teamA[index], 'A', index) : null);
        const top = Array.from({ length: 6 }, (_, index) => teamB[index] ? unitFromHero(teamB[index], 'B', index) : null);
        setLocalPreparation(createTrainingBoardSnapshot(1, bottom, top));
      } else {
        setBattleSession(await prepareBattleSession(teamA.map(heroSessionPayload), teamB.map(heroSessionPayload), currentToken, combatControl));
      }
      onTabChange('battle');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to prepare battle.'); }
    finally { setBusy(false); }
  }, [currentToken, demoMode, onTabChange, combatControl]);

  const movePreparedCard = (tag: string, slot: number) => {
    if (!preparationBoard || ownReady || busy) return;
    const moved = movePreparationCard(preparationBoard, ownSide, tag, slot);
    setFormationDraft({ id: preparationId, positions: formationPositions(moved, ownSide) });
  };
  const confirmFormation = async () => {
    if (!preparationBoard || ownReady || busy) return;
    setBusy(true); setError('');
    try {
      if (localPreparation && combatControl === 'manual') {
        setBattleSession(startLocalManualBattle(preparationBoard));
        setLocalPreparation(null);
      } else if (localPreparation) {
        const bottom = preparationBoard.bottom.map(cloneBattleUnit);
        const top = preparationBoard.top.map(cloneBattleUnit);
        const { events, logs, boardHistory } = simulateTrainingBattle(bottom, top);
        const board = boardHistory.at(-1) ?? preparationBoard;
        setBattleResult({ winner: teamHp(bottom) >= teamHp(top) ? 'A' : 'B', winnerLabel: teamHp(bottom) >= teamHp(top) ? 'Forger' : 'Rival', events, logs, board, boardHistory, finalHpA: teamHp(bottom), finalHpB: teamHp(top), aliveA: teamAlive(bottom), aliveB: teamAlive(top) });
        setLocalPreparation(null);
      } else if (battleSession) {
        const snapshot = await confirmBattleFormation(battleSession.sessionId, formationPositions(preparationBoard, ownSide), currentToken);
        setBattleSession(current => acceptBattleSessionSnapshot(current, snapshot));
        if (snapshot.result) setBattleResult(enrichBattleResultImages(snapshot.result, displayHeroes, displayHeroes));
      }
      setFormationDraft(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to confirm. Your formation is still available to retry.'); }
    finally { setBusy(false); }
  };

  const submitManualAction = async (action: BattleSessionAction) => {
    if (!battleSession || busy || actionPending.current) return;
    const session = battleSession;
    actionPending.current = true; setBusy(true); setError('');
    try {
      const snapshot = demoMode ? advanceLocalManualBattle(session, action) : await submitBattleSessionAction(session.sessionId, action, currentToken);
      setBattleSession(current => current?.sessionId === session.sessionId ? acceptBattleSessionSnapshot(current, snapshot) : current);
    } catch (err) { setError(err instanceof Error ? err.message : 'Action failed. Please try again.'); }
    finally { actionPending.current = false; setBusy(false); }
  };

  useEffect(() => {
    if (!demoMode || battleSession?.controlMode !== 'manual' || battleSession.status !== 'awaiting_action' || battleSession.expectedActionSource !== 'program') return;
    const timer = window.setTimeout(() => {
      setBattleSession(current => current === battleSession ? advanceLocalManualBattle(current) : current);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [battleSession, demoMode]);

  const openPreparedSession = async (sessionId: string) => {
    setBusy(true); setError('');
    try {
      const snapshot = await fetchBattleSession(sessionId, currentToken);
      setLocalPreparation(null); setFormationDraft(null); setBattleResult(snapshot.result ?? null); setBattleSession(current => acceptBattleSessionSnapshot(current, snapshot));
      setResumeEntryId(null); onTabChange('battle');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to open battle.'); }
    finally { setBusy(false); }
  };

  // Preparation rooms (including friendly matches) stay synchronized while
  // preserving local drag edits until this participant explicitly confirms.
  useEffect(() => {
    if (!battleSession || battleSession.status === 'resolved' || (battleSession.status !== 'preparing' && battleSession.controlMode !== 'manual') || demoMode) return;
    const sessionId = battleSession.sessionId;
    let cancelled = false;
    let pending = false;
    const timer = window.setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const snapshot = await fetchBattleSession(sessionId, currentToken);
        if (!cancelled) {
          setBattleSession(current => acceptBattleSessionSnapshot(current, snapshot));
          if (snapshot.result) { setFormationDraft(null); setBattleResult(enrichBattleResultImages(snapshot.result, displayHeroes, displayHeroes)); }
        }
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : 'Connection lost. Retrying preparation sync.'); }
      finally { pending = false; }
    }, 1500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [battleSession?.sessionId, battleSession?.status, currentToken, demoMode, displayHeroes]);

  const refreshFriends = useCallback(async () => {
    if (demoMode) {
      setFriends((current) => current ?? demoFriends);
      return;
    }
    if (!currentToken || currentToken === 'mock-token') {
      setError('Please login to use friends.');
      return;
    }
    try {
      setFriends(await fetchFriends(currentToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load friends.');
    }
  }, [currentToken, demoMode]);

  useEffect(() => {
    if (activeTab !== 'friends') return;
    void refreshFriends();
    if (demoMode) return;
    const interval = window.setInterval(() => void refreshFriends(), 5000);
    return () => window.clearInterval(interval);
  }, [activeTab, demoMode, refreshFriends]);

  const handleSendFriendRequest = async () => {
    const email = friendEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid account email address.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (demoMode) {
        setFriends((current) => ({
          ...(current ?? demoFriends),
          outgoing_requests: [...(current ?? demoFriends).outgoing_requests, {
            id: `demo-request-${Date.now()}`, status: 'pending', user_id: `demo-user-${Date.now()}`, email, created_at: new Date().toISOString(),
          }],
        }));
      } else {
        setFriends(await sendFriendRequest(email, currentToken));
      }
      setFriendEmail('');
      setMessage(`Friend request sent to ${email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send friend request.');
    } finally {
      setBusy(false);
    }
  };

  const handleFriendRequest = async (requestId: string, action: 'accept' | 'decline') => {
    setBusy(true);
    setError('');
    try {
      if (demoMode) {
        setFriends((current) => {
          const snapshot = current ?? demoFriends;
          const selected = snapshot.incoming_requests.find((item) => item.id === requestId);
          return {
            ...snapshot,
            incoming_requests: snapshot.incoming_requests.filter((item) => item.id !== requestId),
            friends: action === 'accept' && selected
              ? [...snapshot.friends, { id: selected.user_id, email: selected.email, friends_since: new Date().toISOString() }]
              : snapshot.friends,
          };
        });
      } else {
        setFriends(await respondFriendRequest(requestId, action, currentToken));
      }
      setMessage(action === 'accept' ? 'Friend request accepted.' : 'Friend request declined.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update friend request.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    setBusy(true);
    setError('');
    try {
      if (demoMode) {
        setFriends((current) => ({ ...(current ?? demoFriends), friends: (current ?? demoFriends).friends.filter((item) => item.id !== friendId) }));
      } else {
        setFriends(await removeFriend(friendId, currentToken));
      }
      setMessage('Friend removed.');
      setPendingFriendRemovalId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove friend.');
    } finally {
      setBusy(false);
    }
  };

  const handleChallengeFriend = async (friendId: string) => {
    if (!selectedHeroes.length) {
      setError('Choose at least one hero in the squad panel first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (demoMode) {
        setFriends((current) => ({
          ...(current ?? demoFriends),
          outgoing_challenges: [{
            id: `demo-outgoing-${Date.now()}`, challenger_user_id: 'simulation-player', challenged_user_id: friendId,
            challenged_email: (current ?? demoFriends).friends.find((item) => item.id === friendId)?.email,
            status: 'pending', expires_at: new Date(Date.now() + 600_000).toISOString(), created_at: new Date().toISOString(),
          }, ...(current ?? demoFriends).outgoing_challenges],
        }));
      } else {
        setFriends(await createFriendChallenge(friendId, arenaFormation, currentToken));
      }
      setMessage('Friendly challenge sent. No Dust stake or card death applies.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send friendly challenge.');
    } finally {
      setBusy(false);
    }
  };

  const handleFriendChallenge = async (challengeId: string, action: 'accept' | 'decline' | 'cancel') => {
    if (action === 'accept' && !selectedHeroes.length) {
      setError('Choose at least one hero in the squad panel first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (demoMode) {
        if (action === 'accept') {
          await beginPreparation(selectedHeroes, createPreviewRivals());
        } else {
          setFriends((current) => ({
            ...(current ?? demoFriends),
            incoming_challenges: (current ?? demoFriends).incoming_challenges.filter((item) => item.id !== challengeId),
            outgoing_challenges: (current ?? demoFriends).outgoing_challenges.filter((item) => item.id !== challengeId),
          }));
        }
      } else {
        const response = await respondFriendChallenge(challengeId, action, action === 'accept' ? arenaFormation : null, currentToken);
        if (response.battle_session) {
          setBattleSession(response.battle_session); setBattleResult(null); setLocalPreparation(null); setFormationDraft(null); setResumeEntryId(null);
          onTabChange('battle');
        } else if (response.battle) {
          setBattleResult(enrichBattleResultImages(response.battle, selectedHeroes, []));
          setMessage('Friendly battle resolved. No stake or card death was applied.');
          onTabChange('battle');
        } else if (response.snapshot) {
          setFriends(response.snapshot);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to respond to friendly challenge.');
    } finally {
      setBusy(false);
    }
  };

  const moveBattleHero = (heroId: string, direction: -1 | 1) => {
    setBattleOrder((current) => {
      const index = current.indexOf(heroId);
      if (index < 0) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const clearQueueArtifacts = () => {
    setLocalPreparation(null); setFormationDraft(null);
    setQueueEntry(null);
    setMatchRecord(null);
    setBattleResult(null);
    setBattleSession(null);
    setResumeEntryId(null);
    onTabChange('queue');
  };

  const syncResolvedMatch = useCallback(async (entry: PvpQueueEntry, match: PvpMatchRecord | null, battle: BattleResult | null, statusMessage: string) => {
    const visibleBattle = battle ? enrichBattleResultImages(battle, selectedHeroes, []) : null;
    setQueueEntry(entry);
    setMatchRecord(match);
    setBattleResult(visibleBattle);
    setBattleSession(null);
    if (visibleBattle) onTabChange('battle');
    setResumeEntryId(null);
    setMessage(statusMessage);
    try {
      await onRefresh();
    } catch {
      // The resolved match remains visible even if the parent refresh fails.
    }
  }, [onRefresh, onTabChange, selectedHeroes]);

  const handleToggleHero = (heroId: string) => {
    if (waiting) {
      setError('Cancel matchmaking before changing your formation.');
      return;
    }
    const hero = displayHeroes.find((item) => item.id === heroId);
    if (hero && !isArenaEligible(hero)) {
      setError(hero.pvpLifeState === 'pvp_dead' ? 'This card is dead. Revive it before Arena.' : 'This card is not available for Arena.');
      return;
    }
    setError('');
    setMessage('');
    setSelectedHeroIds((current) => {
      if (current.includes(heroId)) return current.filter((id) => id !== heroId);
      if (current.length >= MAX_TEAM_SIZE) {
        setError('Arena squads support up to 4 heroes.');
        return current;
      }
      return [...current, heroId];
    });
  };

  const handleToggleTrainHero = (heroId: string, side: 'A' | 'B') => {
    const hero = displayHeroes.find((item) => item.id === heroId);
    if (hero && !isArenaEligible(hero)) {
      setError(hero.pvpLifeState === 'pvp_dead' ? 'This card is dead. Revive it before Train.' : 'This card is not available for Train.');
      return;
    }
    const update = (current: string[]) => {
      if (current.includes(heroId)) return current.filter((id) => id !== heroId);
      if (current.length >= MAX_TEAM_SIZE) {
        setError('Train teams support up to 4 heroes per side.');
        return current;
      }
      return [...current, heroId];
    };
    setError('');
    setMessage('');
    if (side === 'A') {
      setTrainTeamAIds(update);
    } else {
      setTrainTeamBIds(update);
    }
  };

  const handleJoin = async () => {
    if (selectedHeroes.length === 0 || selectedHeroes.length > MAX_TEAM_SIZE) {
      setError('Choose between 1 and 4 heroes first.');
      return;
    }
    if (!selectedHeroesEligible) {
      setError('Every deployed card must be active before entering Arena.');
      return;
    }
    if (walletDust < stakeDust) {
      setError(`Need ${stakeDust} Dust to enter Arena.`);
      return;
    }
    if (!queueReady) {
      setError('Arena formation is not ready.');
      return;
    }
    if (!demoMode && (!currentToken || currentToken === 'mock-token')) {
      setError('Please login first.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (demoMode) {
        const now = new Date();
        const entryId = `sim-${now.getTime().toString(36)}`;
        const simulatedEntry: PvpQueueEntry = {
          id: entryId,
          user_id: 'simulation-player',
          queue_key: queueKey,
          battle_mode: 'arena_2x3',
          stake_dust: stakeDust,
          bp_value: totalBp,
          status: 'waiting',
          team_snapshot: {
            hero_ids: selectedHeroes.map((hero) => hero.id),
            team: selectedHeroes.map((hero) => ({ id: hero.id, hero_payload: hero.character, created_at: now.toISOString() })),
            total_bp: totalBp,
          },
          formation_snapshot: { mode: 'arena_2x3', board: arenaFormation },
          expires_at: new Date(now.getTime() + 60_000).toISOString(),
          created_at: now.toISOString(),
        };
        setQueueEntry(simulatedEntry);
        setMatchRecord(null);
        setBattleResult(null);
        setBattleSession(null);
        setMessage(`Simulated ladder queue entered. Searching within the ${tolerancePct}% BP window.`);
        mockQueueTimerRef.current = window.setTimeout(() => {
          const opponents = createPreviewRivals();
          const opponentBp = opponents.reduce((sum, hero) => sum + heroTotalBp(hero), 0);
          setQueueEntry({
            ...simulatedEntry,
            status: 'matched',
            opponent_entry_id: `sim-rival-${entryId}`,
            match_id: `sim-match-${entryId}`,
            matched_at: new Date().toISOString(),
          });
          void beginPreparation(selectedHeroes, opponents);
          setMessage(`Rival found at ${formatNumber(opponentBp)} BP. Confirm your formation to begin.`);
          mockQueueTimerRef.current = null;
          onTabChange('battle');
        }, 1800);
        return;
      }
      const response = await joinArenaQueue(arenaFormation, queueKey, currentToken);
      setQueueEntry(response.entry);
      setMatchRecord(response.match ?? null);
      const sessionId = response.battle_session?.sessionId ?? response.match?.battle_session_id ?? null;
      const liveSession = sessionId ? await fetchBattleSession(sessionId, currentToken) : response.battle_session ?? null;
      setBattleSession(current => liveSession ? acceptBattleSessionSnapshot(current, liveSession) : null);
      setLocalPreparation(null); setFormationDraft(null);
      const battle = resolveBattleResult(response.match, response.battle);
      const visibleBattle = battle ? enrichBattleResultImages(battle, selectedHeroes, []) : battle;
      setBattleResult(visibleBattle);
      setResumeEntryId(response.entry.id);
      if (response.status === 'waiting') {
        setMessage(`Queued. Waiting for a rival within the ${tolerancePct}% BP window.`);
        try {
          await onRefresh();
        } catch {
          // Best effort refresh.
        }
      } else if (visibleBattle) {
        await syncResolvedMatch(response.entry, response.match ?? null, visibleBattle, 'Match resolved. Settlement is complete.');
      } else {
        setMessage('Match found. The shared Arena battle is now live.');
        onTabChange('battle');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join PvP queue.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (demoMode && queueEntry && waiting) {
      if (mockQueueTimerRef.current !== null) window.clearTimeout(mockQueueTimerRef.current);
      mockQueueTimerRef.current = null;
      clearQueueArtifacts();
      setMessage('Simulated ladder search cancelled.');
      return;
    }
    if (!currentToken || !queueEntry || !waiting) {
      clearQueueArtifacts();
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await cancelPvpEntry(queueEntry.id, currentToken);
      clearQueueArtifacts();
      setMessage('Queue cancelled. Dust was returned to your wallet.');
      try {
        await onRefresh();
      } catch {
        // Best effort refresh.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel queue.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartBattle = () => beginPreparation((battleOrderHeroes.length ? battleOrderHeroes : selectedHeroes).slice(0, MAX_TEAM_SIZE), createPreviewRivals());
  const handleStartTrainBattle = () => beginPreparation(trainTeamA, trainTeamB);

  useEffect(() => {
    if (!resumeEntryId || !currentToken || demoMode) return;
    let cancelled = false;

    const syncStatus = async () => {
      try {
        const response = await fetchPvpEntryStatus(resumeEntryId, currentToken);
        if (cancelled) return;
        setQueueEntry(response.entry);
        setMatchRecord(response.match ?? null);
        const sessionId = response.battle_session?.sessionId ?? response.match?.battle_session_id ?? null;
        const liveSession = sessionId ? await fetchBattleSession(sessionId, currentToken) : response.battle_session ?? null;
        if (cancelled) return;
        setBattleSession(current => liveSession ? acceptBattleSessionSnapshot(current, liveSession) : null);
        const battle = response.match?.battle_result ?? null;
        if (response.entry.status === 'waiting') {
          setMessage('Waiting for opponent...');
          return;
        }
        if (battle) {
          await syncResolvedMatch(response.entry, response.match ?? null, battle, 'Match resolved while you were away.');
        } else if (liveSession) {
          setMessage(liveSession.lastActionSource === 'program' ? 'Program controller is advancing the battle.' : 'Arena battle is live.');
          onTabChange('battle');
        } else {
          setResumeEntryId(null);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to sync PvP queue.');
        setResumeEntryId(null);
      }
    };

    void syncStatus();
    const interval = window.setInterval(() => {
      void syncStatus();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentToken, demoMode, onTabChange, resumeEntryId, syncResolvedMatch]);

  useEffect(() => {
    const loadedResult = Boolean(localPreparation || liveBattleResult || replayResult);
    onBattleLockChange(Boolean(loadedResult));
    if (loadedResult && activeTab !== 'battle') {
      onTabChange('battle');
    }
    if (!loadedResult && activeTab === 'battle') {
      onTabChange('queue');
    }
  }, [activeTab, localPreparation, liveBattleResult, replayResult, onBattleLockChange, onTabChange]);

  return (
    <div className={cn('mx-auto max-w-[1540px] px-6 2xl:px-8', battleLoaded ? 'py-5' : 'py-8')}>
      {!battleLoaded && (
        <section className="flex flex-col gap-5 border-b border-white/8 pb-6 xl:flex-row xl:items-end">
          <h1 className="font-display text-5xl font-light uppercase tracking-[0.34em] text-stone-100 xl:text-6xl">{sectionTitle}</h1>
          <div className="hidden h-14 border-l border-white/10 xl:block" />
          <div className="pb-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#b49664]">
              {activeTab === 'train' ? 'Simulation' : activeTab === 'queue' ? 'Matchmaking' : activeTab === 'friends' ? 'Community' : 'Combat'}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-5">
              <h2 className="font-display text-3xl font-light uppercase tracking-[0.24em] text-stone-100">{activeTab}</h2>
              <div className="h-7 border-l border-white/10" />
              <p className="text-sm text-stone-500">
                {activeTab === 'train' ? 'Build both lineups and test the clash.' : activeTab === 'queue' ? 'Select a squad and enter ranked matchmaking.' : activeTab === 'friends' ? 'Manage friends and send stake-free battle invitations.' : 'Resolve the prepared battle.'}
              </p>
            </div>
          </div>
        </section>
      )}

      {(activeTab === 'train' || (activeTab === 'battle' && !shownBattleResult)) && <div className="flex items-center justify-center gap-3 py-4" role="group" aria-label="Battle control mode"><span className="mr-3 text-xs text-stone-400">Battle control</span>{(['program', 'manual'] as const).map(mode => <button key={mode} type="button" aria-pressed={combatControl === mode} disabled={busy} onClick={() => setCombatControl(mode)} className={cn('border px-5 py-2 text-xs', combatControl === mode ? 'border-[#d5b57c] bg-[#806838]/20 text-[#eddbb6]' : 'border-white/10 text-stone-400')}>{mode === 'manual' ? 'Manual' : 'Auto'}</button>)}</div>}
      {activeTab === 'battle' && shownBattleResult ? (
        <section className="space-y-4">
          {!preparationBoard && (!battleResult || replayResult) && (
            <div className="flex items-center justify-between gap-4 border border-[#2b241b] bg-black/30 px-5 py-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#b49664]">
                  {replayResult ? 'Battle Replay' : battleSession?.controlMode === 'manual' ? 'Manual Battle' : 'Arena Battle Live'}
                </div>
                <div className="mt-1 text-xs text-stone-500">
                  {replayResult
                    ? 'Read-only replay loaded from your combat record.'
                    : battleSession?.controlMode === 'manual' ? 'Choose an action and target on the battlefield.' : battleSession?.lastActionSource === 'program'
                      ? 'Program controller advanced the latest turn.'
                      : 'Observing the shared Agent battle session.'}
                </div>
              </div>
              {replayResult ? (
                <button
                  type="button"
                  onClick={onReplayClose}
                  className="flex shrink-0 items-center gap-2 border border-[#b49664]/40 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-[#b49664] transition-colors hover:bg-[#b49664]/10"
                >
                  <X size={12} />
                  Exit Replay
                </button>
              ) : (
                <div className="text-right text-[10px] uppercase tracking-[0.2em] text-stone-500">
                  {battleSession?.activeActorTag ? `Active ${battleSession.activeActorTag}` : 'Syncing'}
                </div>
              )}
            </div>
          )}
          {error && <p role="alert" className="border border-amber-400/25 px-5 py-3 text-sm text-amber-100">{error}</p>}
          <BattleVisualizer
            key={preparationBoard ? `prepare-${preparationId}` : battleSession?.sessionId ?? 'resolved'}
            sceneControls={preparationBoard ? { preparation: { ownReady, rivalReady, busy, simulated: Boolean(localPreparation || battleSession?.opponentAutoReady), onConfirm: confirmFormation } } : battleSession?.controlMode === 'manual' && battleSession.status !== 'resolved' ? { manual: { actorTag: battleSession.activeActorTag ?? null, ownSide, options: battleSession.actionOptions ?? [], busy, revision: battleSession.events?.length ?? 0, waitingUntil: battleSession.waitingUntil, serverNow: battleSession.serverNow, onAction: submitManualAction } } : undefined}
            heroA={null}
            heroB={null}
            result={shownBattleResult}
            editUnitSlots={Boolean(preparationBoard && !ownReady && !busy)}
            editableSide={ownSide}
            onUnitSlotChange={movePreparedCard}
            liveSession={Boolean(preparationBoard) || battleSession?.controlMode === 'manual' || (!battleResult && !replayResult)}
            showPlaybackControls={Boolean(replayResult)}
          />
        </section>
      ) : activeTab === 'battle' ? (
        <section className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="border border-white/8 bg-black/20 p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <PanelTitle eyebrow="Battle" title="Pre-fight Setup" />
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-600">
                {battleOrderHeroes.length}/{MAX_TEAM_SIZE} ordered
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_320px]">
              <div className="border border-white/8 bg-black/25 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Placement order</div>
                    <div className="mt-1 text-sm text-stone-300">Move heroes up or down, then the board will fill front-left to back-right.</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartBattle}
                    disabled={battleOrderHeroes.length === 0 || busy}
                    className="inline-flex h-11 items-center gap-2 bg-[#806838] px-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-100 transition hover:bg-[#9a7d4a] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? <RefreshCw size={15} className="animate-spin" /> : <Zap size={15} />}
                    Enter Battlefield
                  </button>
                </div>

                <div className="space-y-2">
                  {battleOrderHeroes.map((hero, index) => (
                    <div key={hero.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border border-white/8 bg-black/30 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-stone-100">{hero.character.name}</div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-stone-600">
                          Slot {index + 1} · BP {formatNumber(heroTotalBp(hero))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveBattleHero(hero.id, -1)}
                          disabled={index === 0}
                          className="flex h-8 w-8 items-center justify-center border border-white/10 bg-black/45 text-stone-400 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Move ${hero.character.name} up`}
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveBattleHero(hero.id, 1)}
                          disabled={index === battleOrderHeroes.length - 1}
                          className="flex h-8 w-8 items-center justify-center border border-white/10 bg-black/45 text-stone-400 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Move ${hero.character.name} down`}
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {battleOrderHeroes.length === 0 && (
                    <div className="border border-dashed border-white/10 bg-black/25 px-4 py-6 text-center text-xs uppercase tracking-[0.22em] text-stone-600">
                      Select at least one card in Train or Queue first.
                    </div>
                  )}
                </div>
              </div>

              <aside className="space-y-4">
                <div className="border border-white/8 bg-black/25 p-5">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Board preview</div>
                  <div className="mt-4 space-y-3">
                    {ARENA_ROWS.map((row, rowIndex) => (
                      <div key={row.label} className="grid grid-cols-[58px_repeat(2,minmax(120px,1fr))] gap-3">
                        <div className="flex items-center justify-center border border-white/8 bg-black/20 text-[10px] uppercase tracking-[0.22em] text-stone-600">
                          {row.label}
                        </div>
                        {row.slots.map((slot, slotIndex) => {
                          const hero = battleOrderHeroes[rowIndex * 2 + slotIndex] ?? null;
                          return (
                            <div
                              key={slot}
                              className={cn(
                                'flex min-h-[92px] flex-col justify-between border px-3 py-3 text-left',
                                hero ? 'border-[#b49664]/35 bg-[#b49664]/8' : 'border-dashed border-white/10 bg-black/25'
                              )}
                            >
                              <div className="text-[9px] uppercase tracking-[0.18em] text-stone-600">{slot.replace('_', ' ')}</div>
                              <div className="mt-3 truncate text-sm text-stone-100">{hero?.character.name ?? 'Empty'}</div>
                              <div className="mt-2 text-[9px] uppercase tracking-[0.18em] text-stone-500">
                                {hero ? `BP ${formatNumber(heroTotalBp(hero))}` : 'No card'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-white/8 bg-black/25 p-5">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Setup notes</div>
                  <div className="mt-3 space-y-2 text-sm leading-7 text-stone-400">
                    <p>Train and Queue only select the roster.</p>
                    <p>Battle applies the actual placement order and then starts the fight.</p>
                    <p>GUI does not alter combat during the fight.</p>
                  </div>
                </div>
              </aside>
            </div>
          </main>

          <aside className="space-y-5">
            <div className="border border-white/8 bg-black/20 p-5">
              <PanelTitle eyebrow="Summary" title="Battle" />
              <div className="mt-5 grid gap-3">
                <SmallStat label="Selected" value={`${selectedHeroes.length}/${MAX_TEAM_SIZE}`} tone="gold" />
                <SmallStat label="Total Power" value={formatNumber(totalBp)} />
                <SmallStat label="Board" value="2x3" />
              </div>
              <AnimatePresence mode="wait">
                {(error || message) && (
                  <motion.div
                    key={error || message}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={cn(
                      'mt-5 border px-4 py-3 text-sm leading-6',
                      error ? 'border-amber-400/20 bg-amber-400/10 text-amber-100' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
                    )}
                  >
                    {error || message}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </aside>
        </section>
      ) : activeTab === 'friends' ? (
        <section className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <main className="self-start border border-white/8 bg-black/20">
            <div className="flex flex-col gap-5 border-b border-white/8 p-6 lg:flex-row lg:items-end lg:justify-between">
              <PanelTitle eyebrow="Warband" title="Friends" />
              <div className="flex w-full max-w-xl items-end gap-2">
                <label className="min-w-0 flex-1">
                  <span className="mb-2 block text-[9px] uppercase tracking-[0.2em] text-stone-600">Exact account email</span>
                  <input
                    type="email"
                    aria-label="Friend account email"
                    autoComplete="email"
                    maxLength={254}
                    value={friendEmail}
                    onChange={(event) => setFriendEmail(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') void handleSendFriendRequest(); }}
                    placeholder="player@example.com"
                    className="h-11 w-full border border-white/10 bg-black/45 px-4 text-sm text-stone-200 outline-none placeholder:text-stone-600 focus:border-[#b49664]/50"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleSendFriendRequest}
                  disabled={busy || !friendEmail.trim()}
                  className="inline-flex h-11 items-center gap-2 bg-[#806838] px-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-100 transition hover:bg-[#9a7d4a] disabled:opacity-40"
                >
                  <UserPlus size={15} /> Add
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Your allies</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-stone-600">{friends?.friends.length ?? 0} total</div>
              </div>
              {friends === null ? (
                <div className="border border-dashed border-white/10 p-8 text-center">
                  {error ? (
                    <>
                      <p role="alert" className="text-sm text-amber-100">Friends could not be loaded.</p>
                      <button type="button" onClick={() => void refreshFriends()} className="mt-4 inline-flex h-9 items-center gap-2 border border-amber-300/25 px-4 text-[9px] uppercase tracking-[0.2em] text-amber-100 hover:bg-amber-300/10">
                        <RefreshCw size={12} /> Retry
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em] text-stone-500">
                      <RefreshCw size={12} className="animate-spin" /> Loading friends
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                {friends.friends.map((friend) => (
                  <div key={friend.id} className="border border-white/8 bg-black/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#b49664]/30 bg-[#b49664]/8 text-[#d8b06c]">
                          <Users size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm text-stone-100">{friend.email.split('@')[0]}</div>
                          <div className="mt-1 truncate text-[10px] text-stone-600">{friend.email}</div>
                        </div>
                      </div>
                      <button type="button" onClick={() => setPendingFriendRemovalId(friend.id)} disabled={busy} className="p-2 text-stone-600 hover:text-rose-300" aria-label={`Remove ${friend.email}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {pendingFriendRemovalId === friend.id && (
                      <div className="mt-4 border border-rose-400/15 bg-rose-400/5 p-3">
                        <p className="text-xs leading-5 text-stone-400">Remove {friend.email.split('@')[0]} from your friends?</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => void handleRemoveFriend(friend.id)} disabled={busy} className="h-8 bg-rose-900/50 text-[9px] uppercase tracking-[0.18em] text-rose-100">Remove</button>
                          <button type="button" onClick={() => setPendingFriendRemovalId(null)} disabled={busy} className="h-8 border border-white/10 text-[9px] uppercase tracking-[0.18em] text-stone-400">Cancel</button>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleChallengeFriend(friend.id)}
                      disabled={busy || selectedHeroes.length === 0}
                      className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 border border-[#b49664]/35 bg-[#b49664]/8 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#e8c98d] transition hover:bg-[#b49664]/15 disabled:opacity-35"
                    >
                      <Swords size={14} /> Challenge
                    </button>
                  </div>
                ))}
                {!friends.friends.length && (
                  <div className="col-span-full border border-dashed border-white/10 p-8 text-center text-sm text-stone-600">
                    Add a player by their exact account email to begin your warband.
                  </div>
                )}
                </div>
              )}
            </div>
          </main>

          <aside className="space-y-5">
            <div className="border border-white/8 bg-black/20 p-5">
              <PanelTitle eyebrow="Friendly Battle" title="Squad" />
              <div className="mt-5 grid grid-cols-2 gap-3">
                <SmallStat label="Selected" value={`${selectedHeroes.length}/${MAX_TEAM_SIZE}`} tone="gold" />
                <SmallStat label="Power" value={formatNumber(totalBp)} />
              </div>
              <p className="mt-4 text-xs leading-6 text-stone-500">
                Choose up to four heroes here. Friendly battles never charge Dust, change ladder rating, or kill cards.
              </p>
              <div className="mt-4 max-h-[330px] space-y-2 overflow-y-auto pr-1">
                {rankedHeroes.map((hero) => {
                  const selected = selectedHeroIds.includes(hero.id);
                  const eligible = isArenaEligible(hero);
                  const selectionFull = selectedHeroIds.length >= MAX_TEAM_SIZE && !selected;
                  return (
                    <button
                      key={`friend-squad-${hero.id}`}
                      type="button"
                      onClick={() => handleToggleHero(hero.id)}
                      disabled={busy || waiting || !eligible || selectionFull}
                      aria-pressed={selected}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 border px-3 py-3 text-left transition',
                        selected
                          ? 'border-[#b49664]/55 bg-[#b49664]/10 text-stone-100'
                          : 'border-white/8 bg-black/30 text-stone-400 hover:border-white/20 hover:text-stone-200',
                        (!eligible || selectionFull) && 'cursor-not-allowed opacity-35'
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs uppercase tracking-[0.14em]">{hero.character.name}</span>
                        <span className="mt-1 block text-[9px] uppercase tracking-[0.16em] text-stone-600">{heroTypeLabel(hero)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-[10px] text-[#d8b06c]">
                        {formatNumber(heroTotalBp(hero))}
                        {selected && <CheckCircle2 size={13} />}
                      </span>
                    </button>
                  );
                })}
                {!rankedHeroes.length && (
                  <div className="border border-dashed border-white/10 p-5 text-center text-xs leading-5 text-stone-600">Forge a hero before sending a battle invitation.</div>
                )}
              </div>
            </div>

            {!!friends?.incoming_requests.length && (
              <div className="border border-white/8 bg-black/20 p-5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#b49664]">Friend Requests</div>
                <div className="mt-4 space-y-3">
                  {friends.incoming_requests.map((item) => (
                    <div key={item.id} className="border border-white/8 bg-black/30 p-3">
                      <div className="truncate text-sm text-stone-200">{item.email}</div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => handleFriendRequest(item.id, 'accept')} disabled={busy} className="h-9 bg-[#806838] text-[9px] uppercase tracking-[0.2em] text-white">Accept</button>
                        <button type="button" onClick={() => handleFriendRequest(item.id, 'decline')} disabled={busy} className="h-9 border border-white/10 text-[9px] uppercase tracking-[0.2em] text-stone-500">Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!!friends?.incoming_challenges.length && (
              <div className="border border-[#b49664]/25 bg-[#b49664]/[0.04] p-5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#e8c98d]">Battle Invitations</div>
                <div className="mt-4 space-y-3">
                  {friends.incoming_challenges.map((challenge) => (
                    <div key={challenge.id} className="border border-[#b49664]/20 bg-black/35 p-3">
                      <div className="text-sm text-stone-200">{challenge.challenger_email ?? 'A friend'} challenges you</div>
                      {challenge.status === 'accepted' && challenge.battle_session_id ? <button type="button" onClick={() => openPreparedSession(challenge.battle_session_id!)} disabled={busy} className="mt-3 h-9 w-full bg-[#806838] text-xs text-white">Enter battlefield</button> : <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => handleFriendChallenge(challenge.id, 'accept')} disabled={busy || !selectedHeroes.length} className="h-9 bg-[#806838] text-[9px] uppercase tracking-[0.2em] text-white disabled:opacity-35">Fight</button>
                        <button type="button" onClick={() => handleFriendChallenge(challenge.id, 'decline')} disabled={busy} className="h-9 border border-white/10 text-[9px] uppercase tracking-[0.2em] text-stone-500">Decline</button>
                      </div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!!friends?.outgoing_challenges.length && (
              <div className="border border-white/8 bg-black/20 p-5">
                <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Sent Invitations</div>
                <div className="mt-3 space-y-3">
                  {friends.outgoing_challenges.map((challenge) => (
                    <div key={challenge.id} className="border border-white/8 bg-black/30 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 truncate text-xs text-stone-300">{challenge.challenged_email ?? 'Friend'}</div>
                        <div className={cn('text-[9px] uppercase tracking-[0.18em]', challenge.status === 'resolved' ? 'text-emerald-300' : 'text-[#d8b06c]')}>{challenge.status}</div>
                      </div>
                      {challenge.status === 'pending' ? (
                        <button type="button" onClick={() => handleFriendChallenge(challenge.id, 'cancel')} disabled={busy} className="mt-3 h-8 w-full border border-white/10 text-[9px] uppercase tracking-[0.2em] text-stone-500 hover:text-stone-200">Cancel invite</button>
                      ) : challenge.status === 'accepted' && challenge.battle_session_id ? (
                        <button type="button" onClick={() => openPreparedSession(challenge.battle_session_id!)} disabled={busy} className="mt-3 h-9 w-full bg-[#806838] text-xs text-white">Enter battlefield</button>
                      ) : challenge.status === 'resolved' && challenge.battle_result ? (
                        <button
                          type="button"
                          onClick={() => {
                            setBattleResult(enrichBattleResultImages(challenge.battle_result!, selectedHeroes, []));
                            setMessage('Friendly battle replay loaded.');
                            onTabChange('battle');
                          }}
                          className="mt-3 h-8 w-full border border-emerald-400/25 bg-emerald-400/5 text-[9px] uppercase tracking-[0.2em] text-emerald-200"
                        >
                          View battle
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!!friends?.outgoing_requests.length && (
              <div className="border border-white/8 bg-black/20 p-5">
                <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Pending Requests</div>
                <div className="mt-3 space-y-2 text-xs text-stone-500">
                  {friends.outgoing_requests.map((item) => <div key={item.id} className="truncate border-b border-white/6 pb-2">{item.email}</div>)}
                </div>
              </div>
            )}

            <AnimatePresence mode="wait">
              {(error || message) && (
                <motion.div role={error ? 'alert' : 'status'} aria-live="polite" key={error || message} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className={cn('border px-4 py-3 text-sm leading-6', error ? 'border-amber-400/20 bg-amber-400/10 text-amber-100' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100')}>
                  {error || message}
                </motion.div>
              )}
            </AnimatePresence>
          </aside>
        </section>
      ) : activeTab === 'queue' ? (
        <section className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <main className="border border-white/8 bg-black/20">
            <ArenaToolbar
              search={search}
              onSearchChange={setSearch}
              onClear={() => setSearch('')}
              right={<div className="flex h-10 items-center border border-[#b49664]/45 bg-[#b49664]/8 px-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#e8c98d]">Ranked Ladder</div>}
            />

            <div className="flex min-h-[690px] flex-col p-5">
                {pagedQueueHeroes.items.length > 0 ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                      {pagedQueueHeroes.items.map((hero) => {
                        const selected = selectedHeroIds.includes(hero.id);
                        const eligible = isArenaEligible(hero);
                        return (
                          <ArenaHeroTile
                            key={`queue-card-${hero.id}`}
                            hero={hero}
                            mode="queue"
                            selectedForger={selected}
                            disabled={waiting || busy || !eligible}
                            onSelectForger={() => handleToggleHero(hero.id)}
                          />
                        );
                      })}
                    </div>
                    <ArenaPageControl page={pagedQueueHeroes.page} maxPage={pagedQueueHeroes.maxPage} onChange={setQueuePage} />
                  </>
                ) : (
                  <div className="border border-dashed border-white/10 bg-black/25 p-8 text-center">
                    <div className="font-display text-xl font-light uppercase tracking-[0.18em] text-stone-200">No Cards Ready</div>
                    <div className="mt-3 text-sm leading-6 text-stone-500">Forge cards before entering Arena, or clear search.</div>
                  </div>
                )}
            </div>
          </main>

          <aside className="border border-white/8 bg-black/20">
            <RosterStrip label="Forger" team={selectedHeroes} tone="gold" />
            <PowerComparison left={totalBp} leftLabel="Forger" rightLabel="Rival" />
            <div className="border-t border-white/8 px-5 py-5">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-stone-600">Stake</div>
                  <div className="mt-1 text-sm text-stone-200">{stakeDust}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-stone-600">Drop</div>
                  <div className="mt-1 text-sm text-emerald-200">{relicDropPct}%</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-stone-600">BP</div>
                  <div className="mt-1 truncate text-sm text-stone-200">{totalBp ? `${formatNumber(lowerBp)}-${formatNumber(upperBp)}` : '-'}</div>
                </div>
              </div>
              {waiting && queueEntry && (
                <div className="mt-5 border border-[#b49664]/25 bg-[#b49664]/[0.055] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#e8c98d]">{demoMode ? 'Simulated Ladder' : 'Live Queue'}</span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Searching</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-stone-400">
                    {demoMode
                      ? `Searching a simulated ranked population in your ${tolerancePct}% BP window.`
                      : `Awaiting a rival squad in your ${tolerancePct}% BP window. Both players confirm their formations before the server starts combat.`}
                  </p>
                  <div className="mt-2 text-[9px] uppercase tracking-[0.18em] text-stone-600">
                    Entry {queueEntry.id.slice(0, 8)} · Cards locked until match, cancel, or expiry
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={handleJoin}
                disabled={busy || waiting}
                className="mt-5 inline-flex h-14 w-full items-center justify-center gap-3 bg-[#9a7338] px-5 text-[13px] font-semibold uppercase tracking-[0.24em] text-stone-100 transition hover:bg-[#b18647] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <RefreshCw size={17} className="animate-spin" /> : <Zap size={17} />}
                {waiting ? 'Searching' : 'Find Match'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={!waiting || busy}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 border border-white/10 bg-black/45 text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-400 transition hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <X size={14} />
                Cancel
              </button>
              <AnimatePresence mode="wait">
                {(error || message) && (
                  <motion.div
                    key={error || message}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={cn(
                      'mt-5 border px-4 py-3 text-sm leading-6',
                      error ? 'border-amber-400/20 bg-amber-400/10 text-amber-100' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
                    )}
                  >
                    {error || message}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </aside>
        </section>
      ) : (
      <section className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <main className="border border-white/8 bg-black/20">
          <ArenaToolbar
            search={search}
            onSearchChange={setSearch}
            onClear={() => setSearch('')}
            right={
              <select className="h-10 border border-white/10 bg-black/45 px-3 text-[10px] uppercase tracking-[0.2em] text-stone-500 outline-none">
                <option>Sort by power</option>
              </select>
            }
          />

          <div className="flex min-h-[690px] flex-col p-5">
            {pagedTrainHeroes.items.length > 0 ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                  {pagedTrainHeroes.items.map((hero) => {
                    const eligible = isArenaEligible(hero);
                    const selectedA = trainTeamAIds.includes(hero.id);
                    const selectedB = trainTeamBIds.includes(hero.id);
                    return (
                      <ArenaHeroTile
                        key={`train-card-${hero.id}`}
                        hero={hero}
                        mode="train"
                        selectedForger={selectedA}
                        selectedRival={selectedB}
                        disabled={busy || !eligible}
                        onSelectForger={() => handleToggleTrainHero(hero.id, 'A')}
                        onSelectRival={() => handleToggleTrainHero(hero.id, 'B')}
                      />
                    );
                  })}
                </div>
                <ArenaPageControl page={pagedTrainHeroes.page} maxPage={pagedTrainHeroes.maxPage} onChange={setTrainPage} />
              </>
            ) : (
              <div className="border border-dashed border-white/10 bg-black/25 p-8 text-center">
                <div className="font-display text-xl font-light uppercase tracking-[0.18em] text-stone-200">No Cards Ready</div>
                <div className="mt-3 text-sm leading-6 text-stone-500">Forge cards before entering Arena, or clear search.</div>
              </div>
            )}
          </div>
        </main>

        <aside className="border border-white/8 bg-black/20">
          <RosterStrip label="Forger" team={trainTeamA} tone="gold" />
          <RosterStrip label="Rival" team={trainTeamB} tone="red" />
          <PowerComparison left={trainBpA} right={trainBpB} leftLabel="Forger" rightLabel="Rival" />
          <div className="border-t border-white/8 px-5 py-5">
            <button
              type="button"
              onClick={handleStartTrainBattle}
              disabled={busy}
              className="inline-flex h-14 w-full items-center justify-center gap-3 bg-[#9a7338] px-5 text-[13px] font-semibold uppercase tracking-[0.24em] text-stone-100 transition hover:bg-[#b18647] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <RefreshCw size={17} className="animate-spin" /> : <Zap size={17} />}
              Prepare Training
            </button>

            <AnimatePresence mode="wait">
              {(error || message) && (
                <motion.div
                  key={error || message}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className={cn(
                    'mt-5 border px-4 py-3 text-sm leading-6',
                    error ? 'border-amber-400/20 bg-amber-400/10 text-amber-100' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
                  )}
                >
                  {error || message}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </aside>
        </section>
      )}
    </div>
  );
}
