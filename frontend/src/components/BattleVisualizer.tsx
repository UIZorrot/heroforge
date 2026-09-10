import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Crosshair,
  Droplets,
  Flame,
  Leaf,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Sun,
  Sword,
  Zap,
  Snowflake,
} from 'lucide-react';
import type { BattleEvent, BattleResult } from '../lib/battleTypes';
import type { CharacterData } from '../lib/gameLogic';
import { toNumber } from '../lib/gameLogic';
import { cn } from '../lib/utils';
import { EmptyState, SectionHeader, StatPill } from './Effects';
import { HeroCard } from './HeroCard';
import { ArenaBattleScene } from './ArenaBattleScene';

interface BattleVisualizerProps {
  heroA: CharacterData | null;
  heroB: CharacterData | null;
  result: BattleResult | null;
  liveSession?: boolean;
  showPlaybackControls?: boolean;
  onClose?: () => void;
  editUnitSlots?: boolean;
  editableSide?: 'A' | 'B';
  onUnitSlotChange?: (tag: string, slot: number) => void;
}

function hpPercent(current: number | undefined, max: number | undefined) {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(1, (current ?? 0) / max));
}

type VisualTone = {
  ring: string;
  glow: string;
  chip: string;
  icon: typeof Sparkles;
  label: string;
};

function normalizeEffectKey(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function getTypeVisual(type?: string | null): VisualTone {
  const key = normalizeEffectKey(type);
  if (key.includes('fire')) {
    return {
      ring: 'border-orange-500/35',
      glow: 'from-orange-500/15 via-amber-500/10 to-transparent',
      chip: 'border-orange-400/30 bg-orange-500/10 text-orange-100',
      icon: Flame,
      label: 'Fire',
    };
  }
  if (key.includes('frost') || key.includes('ice')) {
    return {
      ring: 'border-cyan-400/35',
      glow: 'from-cyan-400/15 via-sky-400/10 to-transparent',
      chip: 'border-cyan-300/30 bg-cyan-500/10 text-cyan-100',
      icon: Snowflake,
      label: 'Frost',
    };
  }
  if (key.includes('thunder') || key.includes('lightning')) {
    return {
      ring: 'border-yellow-400/35',
      glow: 'from-yellow-400/15 via-amber-400/10 to-transparent',
      chip: 'border-yellow-300/30 bg-yellow-500/10 text-yellow-100',
      icon: Zap,
      label: 'Thunder',
    };
  }
  if (key.includes('water')) {
    return {
      ring: 'border-sky-400/35',
      glow: 'from-sky-400/15 via-cyan-400/10 to-transparent',
      chip: 'border-sky-300/30 bg-sky-500/10 text-sky-100',
      icon: Droplets,
      label: 'Water',
    };
  }
  if (key.includes('poison') || key.includes('nature')) {
    return {
      ring: 'border-emerald-400/35',
      glow: 'from-emerald-500/15 via-lime-400/10 to-transparent',
      chip: 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100',
      icon: Leaf,
      label: key.includes('poison') ? 'Poison' : 'Nature',
    };
  }
  if (key.includes('dark')) {
    return {
      ring: 'border-violet-500/35',
      glow: 'from-violet-500/15 via-fuchsia-500/10 to-transparent',
      chip: 'border-violet-400/30 bg-violet-500/10 text-violet-100',
      icon: Skull,
      label: 'Dark',
    };
  }
  if (key.includes('light')) {
    return {
      ring: 'border-amber-300/35',
      glow: 'from-amber-300/15 via-yellow-300/10 to-transparent',
      chip: 'border-amber-200/30 bg-amber-500/10 text-amber-50',
      icon: Sun,
      label: 'Light',
    };
  }
  if (key.includes('magic')) {
    return {
      ring: 'border-fuchsia-400/35',
      glow: 'from-fuchsia-400/15 via-violet-400/10 to-transparent',
      chip: 'border-fuchsia-300/30 bg-fuchsia-500/10 text-fuchsia-100',
      icon: Sparkles,
      label: 'Magic',
    };
  }
  if (key.includes('gun')) {
    return {
      ring: 'border-stone-400/35',
      glow: 'from-stone-400/15 via-stone-500/10 to-transparent',
      chip: 'border-stone-300/30 bg-stone-500/10 text-stone-100',
      icon: Crosshair,
      label: 'Gun',
    };
  }
  if (key.includes('weapon') || key.includes('flesh')) {
    return {
      ring: 'border-stone-500/35',
      glow: 'from-stone-500/15 via-stone-400/10 to-transparent',
      chip: 'border-stone-300/30 bg-stone-500/10 text-stone-100',
      icon: Swords,
      label: key.includes('flesh') ? 'Flesh' : 'Weapon',
    };
  }
  return {
    ring: 'border-stone-600/35',
    glow: 'from-stone-500/10 via-stone-500/5 to-transparent',
    chip: 'border-stone-500/30 bg-stone-500/10 text-stone-100',
    icon: Sparkles,
    label: 'Neutral',
  };
}

function getBuffVisual(name?: string | null): VisualTone {
  const key = normalizeEffectKey(name);
  if (key === 'stun') {
    return { ring: 'border-amber-400/35', glow: 'from-amber-400/18 via-yellow-400/10 to-transparent', chip: 'border-amber-300/30 bg-amber-500/10 text-amber-100', icon: Zap, label: 'Stun' };
  }
  if (key === 'wound') {
    return { ring: 'border-rose-500/35', glow: 'from-rose-500/18 via-red-500/10 to-transparent', chip: 'border-rose-400/30 bg-rose-500/10 text-rose-100', icon: Skull, label: 'Wound' };
  }
  if (key === 'curse' || key === 'corrupt' || key === 'weakness' || key === 'vulnerable') {
    return { ring: 'border-violet-500/35', glow: 'from-violet-500/18 via-fuchsia-500/10 to-transparent', chip: 'border-violet-400/30 bg-violet-500/10 text-violet-100', icon: Shield, label: 'Curse' };
  }
  if (key === 'burn') {
    return { ring: 'border-orange-500/35', glow: 'from-orange-500/18 via-red-400/10 to-transparent', chip: 'border-orange-400/30 bg-orange-500/10 text-orange-100', icon: Flame, label: 'Burn' };
  }
  if (key === 'bless' || key === 'pray' || key === 'haste') {
    return { ring: 'border-amber-200/35', glow: 'from-amber-200/18 via-amber-100/10 to-transparent', chip: 'border-amber-100/30 bg-amber-200/10 text-amber-50', icon: Sparkles, label: 'Pray' };
  }
  if (key === 'heal') {
    return { ring: 'border-amber-400/35', glow: 'from-amber-400/18 via-yellow-500/10 to-transparent', chip: 'border-amber-300/30 bg-amber-500/10 text-amber-100', icon: Sparkles, label: 'Heal' };
  }
  if (key === 'frozen') {
    return { ring: 'border-cyan-300/35', glow: 'from-cyan-300/18 via-sky-300/10 to-transparent', chip: 'border-cyan-200/30 bg-cyan-500/10 text-cyan-100', icon: Snowflake, label: 'Frozen' };
  }
  return { ring: 'border-stone-600/35', glow: 'from-stone-500/10 via-stone-500/5 to-transparent', chip: 'border-stone-500/30 bg-stone-500/10 text-stone-100', icon: Sparkles, label: key || 'Effect' };
}

function getActionVisual(actionType: BattleEvent['actionType']) {
  if (actionType === 'heal') {
    return { ring: 'border-emerald-400/35', glow: 'from-emerald-400/18 via-teal-400/10 to-transparent', chip: 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100', icon: Sparkles, label: 'Heal' };
  }
  if (actionType === 'dot_damage') {
    return { ring: 'border-violet-500/35', glow: 'from-violet-500/18 via-fuchsia-500/10 to-transparent', chip: 'border-violet-400/30 bg-violet-500/10 text-violet-100', icon: Skull, label: 'DOT' };
  }
  if (actionType === 'stunned') {
    return { ring: 'border-amber-400/35', glow: 'from-amber-400/18 via-yellow-400/10 to-transparent', chip: 'border-amber-300/30 bg-amber-500/10 text-amber-100', icon: Zap, label: 'Stunned' };
  }
  if (actionType === 'skill') {
    return { ring: 'border-[#c59a5a]/35', glow: 'from-[#c59a5a]/15 via-amber-400/10 to-transparent', chip: 'border-[#c59a5a]/30 bg-[#c59a5a]/10 text-[#f0d8ad]', icon: Swords, label: 'Skill' };
  }
  return { ring: 'border-stone-500/35', glow: 'from-stone-500/10 via-stone-500/5 to-transparent', chip: 'border-stone-500/30 bg-stone-500/10 text-stone-100', icon: Swords, label: 'Attack' };
}

function healthTone(ratio: number) {
  if (ratio <= 0.25) return 'from-red-700 to-red-400';
  if (ratio <= 0.6) return 'from-amber-600 to-amber-400';
  return 'from-emerald-700 to-emerald-400';
}

function BattleEventCard({ event }: { event: BattleResult['events'][number] }) {
  const actionVisual = getActionVisual(event.actionType);
  const attackVisual = getTypeVisual(event.attackType);
  const buffVisual = getBuffVisual(event.buffName);
  const isEffectEvent = Boolean(event.buffName || event.attackType);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.28 }}
      className={cn(
        'group relative overflow-hidden border px-3 py-2 text-xs text-stone-300',
        actionVisual.ring,
        'bg-black/30'
      )}
    >
      <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-r opacity-60 transition group-hover:opacity-90', actionVisual.glow)} />
      <div className="relative flex gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center border', actionVisual.chip)}>
          <actionVisual.icon size={15} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-14 shrink-0 font-mono text-stone-500">R{event.round}</span>
            <span className={cn('inline-flex items-center gap-1 border px-2 py-0.5 text-[9px] uppercase tracking-[0.24em]', actionVisual.chip)}>
              <actionVisual.icon size={10} />
              {actionVisual.label}
            </span>
            {event.attackType && (
              <span className={cn('inline-flex items-center gap-1 border px-2 py-0.5 text-[9px] uppercase tracking-[0.24em]', attackVisual.chip)}>
                <attackVisual.icon size={10} />
                {attackVisual.label}
              </span>
            )}
            {event.buffName && (
              <span className={cn('inline-flex items-center gap-1 border px-2 py-0.5 text-[9px] uppercase tracking-[0.24em]', buffVisual.chip)}>
                <buffVisual.icon size={10} />
                {buffVisual.label}
              </span>
            )}
            {event.isCrit && <span className="border border-[#c59a5a]/30 bg-[#c59a5a]/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.24em] text-[#f0d8ad]">Crit</span>}
            {event.isMiss && <span className="border border-stone-700 bg-stone-900/60 px-2 py-0.5 text-[9px] uppercase tracking-[0.24em] text-stone-300">Miss</span>}
            {event.isStunned && <span className="border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.24em] text-amber-100">Stun</span>}
            {isEffectEvent && <span className="text-[9px] uppercase tracking-[0.22em] text-stone-500">fx</span>}
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="leading-5 text-stone-200">{event.log}</div>
              {(event.skillName || event.rangeMode || event.skillRole) && (
                <div className="mt-1 flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.22em] text-stone-500">
                  {event.skillName && <span>{event.skillName}</span>}
                  {event.skillRole && <span>{event.skillRole}</span>}
                  {event.rangeMode && <span>{event.rangeMode}</span>}
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-right">
              {(event.damage > 0 || event.heal > 0) && (
                <div className={cn('text-lg font-light tracking-[0.12em]', event.heal > 0 ? 'text-emerald-200' : event.isCrit ? 'text-[#f0d8ad]' : 'text-stone-100')}>
                  {event.heal > 0 ? `+${event.heal}` : `-${event.damage}`}
                </div>
              )}
              <div className="text-[9px] uppercase tracking-[0.22em] text-stone-500">
                {event.attacker}
                {' '}
                <span className="text-stone-600">to</span>
                {' '}
                {event.defender}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function BattleVisualizer({ heroA, heroB, result, liveSession = false, showPlaybackControls = false, editUnitSlots = false, editableSide, onUnitSlotChange, onClose }: BattleVisualizerProps) {
  const board = result?.board ?? result?.details?.board ?? null;
  const lastLog = result?.logs?.[result.logs.length - 1];
  const winner = result?.winnerLabel || result?.winner || 'Pending';
  const hpA = result?.finalHpA ?? toNumber(heroA?.state.HP, 1);
  const hpB = result?.finalHpB ?? toNumber(heroB?.state.HP, 1);
  const maxHpA = result?.maxHpA ?? toNumber(heroA?.state.HP, 1);
  const maxHpB = result?.maxHpB ?? toNumber(heroB?.state.HP, 1);
  const ratioA = hpPercent(hpA, maxHpA);
  const ratioB = hpPercent(hpB, maxHpB);

  const eventCount = result?.events?.length ?? 0;
  const roundCount = useMemo(() => {
    if (board?.round) return board.round;
    if (!result?.events?.length) return 0;
    return Math.max(...result.events.map((event) => event.round));
  }, [board, result]);

  if (board && result) {
    return (
      <ArenaBattleScene
        board={board}
        events={result?.events ?? []}
        logs={result?.logs ?? []}
        result={result}
        liveSession={liveSession}
        editUnitSlots={editUnitSlots}
        editableSide={editableSide}
        onUnitSlotChange={onUnitSlotChange}
        showResultReveal={!liveSession}
        showPlaybackControls={showPlaybackControls}
        autoStartKey={showPlaybackControls ? undefined : `${result.winner}-${eventCount}-${result.events?.at(-1)?.timestamp ?? 'ready'}`}
      />
    );
  }

  if (!heroA || !heroB) {
    return (
      <EmptyState
        title="Select two heroes"
        description="Pick a pair from your vault to simulate a duel and inspect the result log."
      />
    );
  }

  return (
    <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <SectionHeader
            eyebrow="Arena"
            title="Duel Resolution"
            description="Inspect the selected combatants, outcome summary, and resolved battle feed."
          />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="border border-stone-800 bg-black/50 px-3 py-2 text-xs uppercase tracking-[0.24em] text-stone-400 transition hover:border-[#c59a5a]/40 hover:text-[#f0d8ad]"
          >
            Close
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(220px,0.8fr)_1fr]">
        <div className="space-y-3">
          <HeroCard character={heroA} compact />
          <div className="border border-stone-800 bg-black/40 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-stone-500">
              <span>{heroA.name}</span>
              <span>Side A</span>
            </div>
            <div className="mt-3 h-3 border border-stone-800 bg-black">
              <div className={cn('h-full bg-gradient-to-r transition-all', healthTone(ratioA))} style={{ width: `${ratioA * 100}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
              <span>HP {hpA}</span>
              <span>Max {maxHpA}</span>
            </div>
          </div>
        </div>

        <div className="flex min-w-[240px] flex-col justify-center gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.28em] text-stone-500">
              <Sword size={14} />
              <span>{result ? winner : 'Awaiting battle'}</span>
              <Shield size={14} />
            </div>
          </div>

          <div className="space-y-2 border border-stone-800 bg-black/40 p-4 text-center">
            <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Outcome</div>
            <div className="text-xl font-light tracking-[0.12em] text-stone-100">
              {result ? (result.winner === 'Tie' ? 'Draw' : winner) : 'No result yet'}
            </div>
            {result?.summary && <div className="text-xs text-stone-400">{result.summary}</div>}
            {lastLog && <div className="text-xs text-[#f0d8ad]">{lastLog}</div>}
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <StatPill label="Events" value={eventCount} tone="violet" />
              <StatPill label="Rounds" value={roundCount} tone="emerald" />
              <StatPill label="Logs" value={result?.logs?.length ?? 0} tone="amber" />
            </div>
          </div>

          <div className="border border-stone-800 bg-black/40 p-4 text-xs text-stone-400">
            <div className="flex items-center gap-2 uppercase tracking-[0.24em] text-stone-500">
              <Swords size={14} />
              <span>Combat Data</span>
            </div>
            <p className="mt-2 leading-6">
              Resolved from generated stats, skills, buffs, and backend battle events.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <HeroCard character={heroB} compact />
          <div className="border border-stone-800 bg-black/40 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-stone-500">
              <span>{heroB.name}</span>
              <span>Side B</span>
            </div>
            <div className="mt-3 h-3 border border-stone-800 bg-black">
              <div className={cn('h-full bg-gradient-to-r transition-all', healthTone(ratioB))} style={{ width: `${ratioB * 100}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
              <span>HP {hpB}</span>
              <span>Max {maxHpB}</span>
            </div>
          </div>
        </div>
      </div>

      {result?.events?.length ? (
        <div className="border border-stone-800 bg-black/45">
          <div className="flex items-center justify-between border-b border-stone-800 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">Battle Feed</div>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{result.events.length} events</div>
          </div>
          <div className="max-h-[320px] overflow-auto p-4">
            <div className="space-y-2">
              {result.events.map((event, index) => (
                <BattleEventCard key={`${event.round}-${event.attacker}-${event.defender}-${index}`} event={event} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No battle feed yet"
          description="Once a duel is run, the event feed will appear here with round-by-round logs."
        />
      )}
    </div>
  );
}
