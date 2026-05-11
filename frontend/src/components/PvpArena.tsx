import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Clock3, RefreshCw, Search, Swords, Trash2, Zap } from 'lucide-react';
import { BattleVisualizer } from './BattleVisualizer';
import { EmptyState, MetricCard, SectionHeader, StatPill, StatusPill } from './Effects';
import { HeroCard } from './HeroCard';
import { cancelPvpEntry, fetchPvpEntryStatus, getStoredToken, joinArenaQueue, reviveCard } from '../lib/api';
import { cn } from '../lib/utils';
import { toNumber } from '../lib/gameLogic';
import type { ArenaFormation, ArenaSlotKey, BattleResult, EconomySnapshot, PvpMatchRecord, PvpQueueEntry, SavedHero } from '../types';

type StoredArenaState = {
  selectedHeroIds: string[];
  queueKey: string;
  resumeEntryId: string | null;
};

const STORAGE_KEY = 'hf.pvp.arena.v1';
const DEFAULT_QUEUE_KEY = 'ranked';
const MAX_TEAM_SIZE = 4;
const ARENA_ROWS: Array<{ label: string; slots: ArenaSlotKey[] }> = [
  { label: 'Front', slots: ['front_0', 'front_1', 'front_2'] },
  { label: 'Back', slots: ['back_0', 'back_1', 'back_2'] },
];
const ARENA_SLOT_ORDER: ArenaSlotKey[] = ['front_0', 'front_1', 'front_2', 'back_0', 'back_1', 'back_2'];

function readStoredArenaState(): StoredArenaState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredArenaState>;
    return {
      selectedHeroIds: Array.isArray(parsed.selectedHeroIds) ? parsed.selectedHeroIds.map(String) : [],
      queueKey: typeof parsed.queueKey === 'string' && parsed.queueKey.trim() ? parsed.queueKey.trim() : DEFAULT_QUEUE_KEY,
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

export function clearStoredArenaState() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function formatCountdown(targetIso?: string | null, now = Date.now()) {
  if (!targetIso) return '00:00';
  const diff = Math.max(0, new Date(targetIso).getTime() - now);
  const totalSeconds = Math.ceil(diff / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function heroTotalBp(hero: SavedHero) {
  return toNumber(hero.character.BP, 0);
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

interface PvpArenaProps {
  heroes: SavedHero[];
  economy: EconomySnapshot | null;
  token?: string | null;
  onRefresh: () => Promise<void>;
}

export function PvpArena({ heroes, economy, token, onRefresh }: PvpArenaProps) {
  const [search, setSearch] = useState('');
  const [selectedHeroIds, setSelectedHeroIds] = useState<string[]>(() => readStoredArenaState()?.selectedHeroIds ?? []);
  const [queueKey, setQueueKey] = useState(() => readStoredArenaState()?.queueKey ?? DEFAULT_QUEUE_KEY);
  const [resumeEntryId, setResumeEntryId] = useState<string | null>(() => readStoredArenaState()?.resumeEntryId ?? null);
  const [queueEntry, setQueueEntry] = useState<PvpQueueEntry | null>(null);
  const [matchRecord, setMatchRecord] = useState<PvpMatchRecord | null>(null);
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [revivingHeroId, setRevivingHeroId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const initializedRef = useRef(false);
  const currentToken = token ?? getStoredToken();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (initializedRef.current || !heroes.length) return;
    initializedRef.current = true;
    const stored = readStoredArenaState();
    const eligibleHeroes = heroes.filter(isArenaEligible);
    if (stored) {
      const validIds = stored.selectedHeroIds.filter((id) => eligibleHeroes.some((hero) => hero.id === id)).slice(0, MAX_TEAM_SIZE);
      setSelectedHeroIds(validIds.length > 0 ? validIds : rankHeroes(eligibleHeroes).slice(0, MAX_TEAM_SIZE).map((hero) => hero.id));
      setQueueKey(stored.queueKey || DEFAULT_QUEUE_KEY);
      setResumeEntryId(stored.resumeEntryId);
      return;
    }
    setSelectedHeroIds(rankHeroes(eligibleHeroes).slice(0, MAX_TEAM_SIZE).map((hero) => hero.id));
  }, [heroes]);

  useEffect(() => {
    if (!initializedRef.current) return;
    writeStoredArenaState({
      selectedHeroIds,
      queueKey,
      resumeEntryId,
    });
  }, [selectedHeroIds, queueKey, resumeEntryId]);

  const rankedHeroes = useMemo(() => rankHeroes(heroes), [heroes]);
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

  const selectedHeroes = useMemo(
    () => selectedHeroIds.map((id) => heroes.find((hero) => hero.id === id)).filter((hero): hero is SavedHero => Boolean(hero)),
    [heroes, selectedHeroIds]
  );
  const arenaFormation = useMemo(() => buildArenaFormation(selectedHeroIds), [selectedHeroIds]);

  const totalBp = useMemo(() => selectedHeroes.reduce((sum, hero) => sum + heroTotalBp(hero), 0), [selectedHeroes]);
  const tolerancePct = economy?.pvp.match_tolerance_pct ?? 10;
  const relicDropPct = economy?.pvp.low_tier_relic_drop_pct ?? 3;
  const stakeDust = economy?.costs.pvp_stake ?? economy?.costs.pvp_entry ?? 30;
  const reviveDust = economy?.costs.pvp_revive ?? 200;
  const walletDust = economy?.wallet?.dust_balance ?? economy?.starter.dust_balance ?? 0;
  const lowerBp = totalBp > 0 ? Math.ceil(totalBp / (1 + tolerancePct / 100)) : 0;
  const upperBp = totalBp > 0 ? Math.floor(totalBp * (1 + tolerancePct / 100)) : 0;
  const selectedHeroesEligible = selectedHeroes.every(isArenaEligible);
  const queueReady = selectedHeroes.length > 0 && selectedHeroes.length <= MAX_TEAM_SIZE && selectedHeroesEligible && walletDust >= stakeDust && !busy;
  const waiting = queueEntry?.status === 'waiting';
  const matchResolved = Boolean(battleResult);
  const queueCountdown = formatCountdown(queueEntry?.expires_at, now);
  const activeTeamNames = selectedHeroes.map((hero) => hero.character.name);
  const deadHeroes = heroes.filter((hero) => hero.pvpLifeState === 'pvp_dead');
  const matchRelicDrop =
    matchRecord?.reward_payload && typeof matchRecord.reward_payload === 'object'
      ? (matchRecord.reward_payload as { relic_drop?: { relic_type?: string; display_name?: string; amount?: number } }).relic_drop ?? null
      : null;

  const clearQueueArtifacts = () => {
    setQueueEntry(null);
    setMatchRecord(null);
    setBattleResult(null);
    setResumeEntryId(null);
  };

  const syncResolvedMatch = async (entry: PvpQueueEntry, match: PvpMatchRecord | null, battle: BattleResult | null, statusMessage: string) => {
    setQueueEntry(entry);
    setMatchRecord(match);
    setBattleResult(battle);
    setResumeEntryId(null);
    setMessage(statusMessage);
    try {
      await onRefresh();
    } catch {
      // keep the match visible even if refresh fails
    }
  };

  const handleToggleHero = (heroId: string) => {
    if (waiting) {
      setError('Cancel the current queue before changing your lineup.');
      return;
    }
    const hero = heroes.find((item) => item.id === heroId);
    if (hero && !isArenaEligible(hero)) {
      setError(hero.pvpLifeState === 'pvp_dead' ? 'This card is dead. Revive it before Arena.' : 'This card is not available for Arena.');
      return;
    }
    setError('');
    setMessage('');
    setSelectedHeroIds((current) => {
      if (current.includes(heroId)) {
        return current.filter((id) => id !== heroId);
      }
      if (current.length >= MAX_TEAM_SIZE) {
        setError('Formal PvP supports up to 4 heroes.');
        return current;
      }
      return [...current, heroId];
    });
  };

  const handleJoin = async () => {
    if (!currentToken) {
      setError('Please login first.');
      return;
    }
    if (!queueReady) {
      if (selectedHeroes.length === 0 || selectedHeroes.length > MAX_TEAM_SIZE) {
        setError('Choose between 1 and 4 heroes first.');
      } else if (!selectedHeroesEligible) {
        setError('Every deployed card must be active before entering Arena.');
      } else if (walletDust < stakeDust) {
        setError(`Need ${stakeDust} Dust to enter Arena.`);
      } else {
        setError('Arena lineup is not ready.');
      }
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await joinArenaQueue(arenaFormation, queueKey, currentToken);
      setQueueEntry(response.entry);
      setMatchRecord(response.match ?? null);
      const battle = resolveBattleResult(response.match, response.battle);
      setBattleResult(battle);
      setResumeEntryId(response.status === 'waiting' ? response.entry.id : null);
      if (response.status === 'waiting') {
        setMessage(`Queued. Waiting for a rival within the ${tolerancePct}% BP window.`);
        try {
          await onRefresh();
        } catch {
          // parent refresh is best-effort
        }
      } else {
        await syncResolvedMatch(response.entry, response.match ?? null, battle, 'Match found. The arena resolved the fight.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join PvP queue');
    } finally {
      setBusy(false);
    }
  };

  const handleRevive = async (heroId: string) => {
    if (!currentToken) {
      setError('Please login first.');
      return;
    }
    if (walletDust < reviveDust) {
      setError(`Need ${reviveDust} Dust to revive this card.`);
      return;
    }
    setRevivingHeroId(heroId);
    setError('');
    setMessage('');
    try {
      await reviveCard(heroId, currentToken);
      setMessage(`Card revived for ${reviveDust} Dust.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revive card');
    } finally {
      setRevivingHeroId(null);
    }
  };

  const handleCancel = async () => {
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
        // ignore refresh failures
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel queue');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!resumeEntryId || !currentToken) return;
    let cancelled = false;

    const syncStatus = async () => {
      try {
        const response = await fetchPvpEntryStatus(resumeEntryId, currentToken);
        if (cancelled) return;
        setQueueEntry(response.entry);
        setMatchRecord(response.match ?? null);
        const battle = response.match?.battle_result ?? null;
        if (response.entry.status === 'waiting') {
          setMessage('Waiting for opponent...');
          return;
        }
        if (battle || response.match) {
          await syncResolvedMatch(response.entry, response.match ?? null, battle, 'Match resolved while you were away. The arena is ready.');
        } else {
          setResumeEntryId(null);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to sync PvP queue');
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
  }, [currentToken, resumeEntryId]);

  const selectedSummary = selectedHeroes.map((hero, index) => (
    <div key={hero.id} className="flex items-center justify-between gap-3 border border-stone-800/80 bg-black/35 px-3 py-3">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Slot {index + 1}</div>
        <div className="truncate text-sm text-stone-100">{hero.character.name}</div>
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em] text-stone-500">
          <span>{hero.character.state.TYPE}</span>
          <span>BP {hero.character.BP}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => handleToggleHero(hero.id)}
        disabled={waiting || busy}
        className="inline-flex items-center gap-1 border border-stone-800 bg-black/40 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-stone-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 size={12} />
        Remove
      </button>
    </div>
  ));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeader
          eyebrow="Arena"
          title="Ranked PvP"
          description="This is the formal battle lobby. Bring up to 4 heroes, place them into a 2 by 3 formation, and fight only opponents inside the 5% BP window."
        />
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={waiting ? 'amber' : matchResolved ? 'emerald' : 'slate'}>
            {waiting ? 'Waiting' : matchResolved ? 'Resolved' : 'Idle'}
          </StatusPill>
          <StatusPill tone="gold">2x3 board</StatusPill>
          <StatusPill tone="violet">Dust stake {stakeDust}</StatusPill>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 border border-stone-800 bg-black/40 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-[#c59a5a]/30 bg-[#c59a5a]/10 p-2 text-[#f0d8ad]">
                <Swords size={16} />
              </div>
              <div>
                <div className="text-sm uppercase tracking-[0.24em] text-stone-300">Queue key</div>
                <div className="text-xl font-light tracking-[0.12em] text-stone-100">{queueKey}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <MetricCard label="Selected" value={`${selectedHeroes.length}/4`} hint="Choose up to 4 heroes" />
              <MetricCard label="Total BP" value={totalBp} hint={`Allowed range ${lowerBp} - ${upperBp}`} />
              <MetricCard label="Stake" value={stakeDust} hint="Dust wager per queue entry" />
            </div>
          </div>

          <div className="grid gap-4 2xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <SectionHeader eyebrow="Vault" title="Select your roster" description="Click cards to place them into the Arena formation. MVP fills slots front-left to back-right." />
                <div className="flex items-center gap-2 border border-stone-800 bg-black/35 px-3 py-2">
                  <Search size={14} className="text-stone-500" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search heroes"
                    className="w-40 bg-transparent text-sm text-stone-100 outline-none placeholder:text-stone-600"
                  />
                </div>
              </div>

              {filteredHeroes.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredHeroes.map((hero) => {
                    const dead = hero.pvpLifeState === 'pvp_dead';
                    const eligible = isArenaEligible(hero);
                    return (
                      <div key={hero.id} className="space-y-2">
                        <HeroCard
                          character={hero.character}
                          compact
                          disabled={!eligible}
                          statusLabel={dead ? 'Dead' : !eligible ? 'Locked' : undefined}
                          className={cn(
                            'min-h-[340px]',
                            selectedHeroIds.includes(hero.id) && 'ring-1 ring-[#c59a5a]/60 shadow-[0_0_0_1px_rgba(197,154,90,0.25)]'
                          )}
                          isSelected={selectedHeroIds.includes(hero.id)}
                          onClick={waiting ? undefined : () => handleToggleHero(hero.id)}
                        />
                        {dead && (
                          <button
                            type="button"
                            onClick={() => handleRevive(hero.id)}
                            disabled={revivingHeroId === hero.id || walletDust < reviveDust}
                            className="w-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {revivingHeroId === hero.id ? 'Reviving...' : `Revive for ${reviveDust} Dust`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="No heroes found"
                  description="Your search did not match any hero in the vault."
                />
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-3 border border-stone-800 bg-black/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Lineup</div>
                    <div className="mt-1 text-sm text-stone-300">2 rows, 3 lanes, up to 4 heroes</div>
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Locked when queued</div>
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    {ARENA_ROWS.map((row) => (
                      <div key={row.label} className="grid grid-cols-[72px_repeat(3,minmax(0,1fr))] gap-2">
                        <div className="flex items-center text-[10px] uppercase tracking-[0.24em] text-stone-500">{row.label}</div>
                        {row.slots.map((slot) => {
                          const heroId = arenaFormation[slot];
                          const hero = heroId ? heroes.find((item) => item.id === heroId) : null;
                          return (
                            <button
                              key={slot}
                              type="button"
                              disabled={waiting || busy}
                              onClick={() => hero && handleToggleHero(hero.id)}
                              className={cn(
                                'min-h-20 border bg-black/35 px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                                hero ? 'border-[#c59a5a]/35 text-stone-100' : 'border-dashed border-stone-800 text-stone-600'
                              )}
                            >
                              <div className="text-[9px] uppercase tracking-[0.2em] text-stone-500">{slot}</div>
                              <div className="mt-2 truncate text-sm">{hero?.character.name ?? 'Empty'}</div>
                              {hero && <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-stone-500">BP {hero.character.BP}</div>}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  {selectedSummary}
                  {Array.from({ length: Math.max(0, MAX_TEAM_SIZE - selectedHeroes.length) }).map((_, index) => (
                    <div key={`empty-slot-${index}`} className="border border-dashed border-stone-800 bg-black/25 px-3 py-4 text-center text-[10px] uppercase tracking-[0.28em] text-stone-600">
                      Slot {selectedHeroes.length + index + 1} empty
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 border border-stone-800 bg-black/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Match control</div>
                    <div className="mt-1 text-sm text-stone-300">Queue, cancel, and watch the lobby resolve</div>
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">{tolerancePct}% window</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="border border-stone-800 bg-black/30 p-3">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Lower bound</div>
                    <div className="mt-1 text-lg text-stone-100">{lowerBp}</div>
                  </div>
                  <div className="border border-stone-800 bg-black/30 p-3">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Upper bound</div>
                    <div className="mt-1 text-lg text-stone-100">{upperBp}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={!queueReady}
                    className="inline-flex items-center gap-2 border border-[#c59a5a]/30 bg-[#c59a5a]/10 px-4 py-3 text-xs uppercase tracking-[0.24em] text-[#f0d8ad] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                    Find match
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (waiting) {
                        setError('Cancel the queue before clearing the result.');
                        return;
                      }
                      clearQueueArtifacts();
                      setMessage('Result cleared.');
                    }}
                    className="inline-flex items-center gap-2 border border-stone-800 bg-black/45 px-4 py-3 text-xs uppercase tracking-[0.24em] text-stone-300"
                  >
                    <CheckCircle2 size={14} />
                    Clear result
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={!waiting || busy}
                    className="inline-flex items-center gap-2 border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-xs uppercase tracking-[0.24em] text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    Cancel queue
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatPill label="Tolerance" value={`${tolerancePct}%`} tone="emerald" />
                  <StatPill label="Relic" value={`${relicDropPct}%`} tone="violet" />
                  <StatPill label="TTL" value={`${economy?.pvp.queue_ttl_minutes ?? 10}m`} tone="violet" />
                  <StatPill label="Queue" value={waiting ? queueCountdown : 'idle'} tone={waiting ? 'amber' : 'slate'} />
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {(error || message) && (
              <motion.div
                key={`${error || message}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={cn(
                  'border px-4 py-3 text-sm',
                  error ? 'border-amber-400/20 bg-amber-400/10 text-amber-100' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
                )}
              >
                {error || message}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-4">
          <div className="border border-stone-800 bg-black/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Lobby state</div>
                <div className="mt-1 text-lg font-light tracking-[0.12em] text-stone-100">
                  {matchResolved ? 'Match resolved' : waiting ? 'Searching for opponent' : 'Idle'}
                </div>
              </div>
              <div className="rounded-full border border-stone-800 bg-black/35 p-2 text-stone-300">
                <Clock3 size={16} />
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="border border-stone-800 bg-black/30 p-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Stake cost</div>
                <div className="mt-1 text-lg text-stone-100">{stakeDust}</div>
              </div>
              <div className="border border-stone-800 bg-black/30 p-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Wallet</div>
                <div className="mt-1 text-lg text-stone-100">{walletDust}</div>
              </div>
            </div>
            <div className="mt-3 text-sm leading-7 text-stone-400">
              {waiting
                ? `You are in the lobby. The backend only matches opponents whose total BP stays inside the +/-${tolerancePct}% window.`
                : matchResolved
                  ? 'The board has been resolved. The result panel below shows the Arena battle.'
                  : 'Queue your 2 by 3 formation to enter ranked PvP. You can bring 1 to 4 heroes, and empty slots are allowed.'}
            </div>
          </div>

          {matchResolved && battleResult ? (
            <BattleVisualizer heroA={null} heroB={null} result={battleResult} onClose={() => setBattleResult(null)} />
          ) : queueEntry ? (
            <div className="border border-stone-800 bg-black/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Queue entry</div>
                <StatusPill tone={waiting ? 'amber' : 'emerald'}>{queueEntry.status}</StatusPill>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="border border-stone-800 bg-black/30 p-3">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Entry ID</div>
                  <div className="mt-1 break-all text-xs text-stone-300">{queueEntry.id}</div>
                </div>
                <div className="border border-stone-800 bg-black/30 p-3">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">BP</div>
                  <div className="mt-1 text-lg text-stone-100">{queueEntry.bp_value}</div>
                </div>
                <div className="border border-stone-800 bg-black/30 p-3">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Battle mode</div>
                  <div className="mt-1 text-lg text-stone-100">{queueEntry.battle_mode}</div>
                </div>
                <div className="border border-stone-800 bg-black/30 p-3">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Expires</div>
                  <div className="mt-1 text-lg text-stone-100">{queueCountdown}</div>
                </div>
              </div>
              <div className="mt-3 text-sm leading-7 text-stone-400">
                {queueEntry.status === 'waiting'
                  ? 'Still waiting for a valid opponent.'
                  : queueEntry.status === 'matched'
                    ? 'The queue has resolved. The arena result will appear below.'
                    : `Entry is ${queueEntry.status}.`}
              </div>
              {matchRecord?.battle_result && (
                <div className="mt-4 border border-stone-800 bg-black/35 p-3 text-xs text-stone-400">
                  Matched opponent BP gap: {matchRecord.bp_gap_pct?.toFixed?.(2) ?? matchRecord.bp_gap_pct}%
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              title="No active queue"
              description={`Choose up to four heroes from the vault, then enter the ranked arena to fight within the ${tolerancePct}% BP band.`}
            />
          )}

          {matchResolved && battleResult && matchRecord && (
            <div className="border border-stone-800 bg-black/40 p-4 text-sm text-stone-400">
              <div className="flex flex-wrap gap-2">
                <StatPill label="Your BP" value={matchRecord.user_a_id ? matchRecord.bp_a : 0} tone="gold" />
                <StatPill label="Enemy BP" value={matchRecord.user_b_id ? matchRecord.bp_b : 0} tone="violet" />
                <StatPill label="Gap" value={`${matchRecord.bp_gap_pct.toFixed(2)}%`} tone="emerald" />
                <StatPill label="Stake" value={matchRecord.stake_dust} tone="amber" />
                {matchRelicDrop && (
                <StatPill
                  label="Relic"
                  value={`${matchRelicDrop.display_name ?? matchRelicDrop.relic_type ?? 'Arena relic'} x${matchRelicDrop.amount ?? 0}`}
                  tone="violet"
                />
              )}
              </div>
              <div className="mt-3 leading-7 text-stone-300">
                {battleResult.summary || 'Arena result resolved successfully.'}
              </div>
              <div className="mt-2 text-xs uppercase tracking-[0.22em] text-stone-500">
                Participants: {activeTeamNames.join(' / ') || 'Unknown lineup'}
              </div>
            </div>
          )}

          {deadHeroes.length > 0 && (
            <div className="border border-rose-300/20 bg-rose-400/10 p-4">
              <div className="text-[10px] uppercase tracking-[0.28em] text-rose-100">Revival needed</div>
              <div className="mt-2 text-sm text-stone-300">
                PvP-dead cards cannot enter Arena. Revive costs {reviveDust} Dust.
              </div>
              <div className="mt-4 space-y-2">
                {deadHeroes.map((hero) => (
                  <div key={hero.id} className="flex items-center justify-between gap-3 border border-rose-200/10 bg-black/30 px-3 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-stone-100">{hero.character.name}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-rose-100">PvP dead</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevive(hero.id)}
                      disabled={revivingHeroId === hero.id || walletDust < reviveDust}
                      className="shrink-0 border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {revivingHeroId === hero.id ? 'Reviving' : `Revive ${reviveDust}`}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
