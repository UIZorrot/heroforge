import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { gsap } from 'gsap';
import { Application, Assets, BlurFilter, Container, Graphics, Particle, ParticleContainer, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { Pause, Play, RotateCcw, Shield, Sparkles } from 'lucide-react';
import arenaHallPerspective from '../assets/battle/arena-hall-perspective.png';
import { CARD_FALLBACK_SRC } from '../lib/cards';
import {
  blackBackedVfxAlphaForLuminance,
  battleVfxTextureAssets,
  projectileBeamSequence,
  projectileBeamSequenceFrameIndex,
  projectileBeamSequenceFrameRect,
} from '../lib/battleVfxAssets';
import { resolveBattleVfxDescriptor, type BattleVfxMode, type BattleVfxTone } from '../lib/battleVfxCatalog';
import type { BattleBoardState, BattleBoardUnit, BattleEvent, BattleResult } from '../lib/battleTypes';
import {
  createFastProjectilePlan,
  createBuffBorderVfxPlan,
  createProjectileVfxProfile,
  projectileAimBasis,
  projectileHeadProgress,
  projectileParticleAlpha,
  projectileSequenceReveal,
  projectileTrailWindow,
  pointInHost,
  rectInHost,
  targetHitPointInHost,
  type FastProjectilePlan,
  type BuffBorderTextureKey,
  type ProjectileVfxBeamTextureKey,
  type ProjectileVfxImpactTextureKey,
  type ProjectileVfxInstantTextureKey,
  type ProjectileVfxProfile,
  type ProjectileVfxSequenceTextureKey,
  type ProjectileVfxTextureKey,
} from '../lib/battleVfxParticlePlan';
import { cn } from '../lib/utils';

type ArenaBattleSceneProps = {
  board: BattleBoardState;
  events: BattleEvent[];
  logs: string[];
  result: BattleResult;
  autoStartKey?: string | number;
  showCommanders?: boolean;
  editUnitSlots?: boolean;
  onUnitSlotChange?: (unitTag: string, slot: number) => void;
};

type SlotSpec = {
  slot: number;
  lane: number;
  row: 'front' | 'back';
};

const forgerSlots: SlotSpec[] = [
  { slot: 3, lane: 0, row: 'back' },
  { slot: 0, lane: 0, row: 'front' },
  { slot: 4, lane: 1, row: 'back' },
  { slot: 1, lane: 1, row: 'front' },
  { slot: 5, lane: 2, row: 'back' },
  { slot: 2, lane: 2, row: 'front' },
];

const rivalSlots: SlotSpec[] = [
  { slot: 0, lane: 0, row: 'front' },
  { slot: 3, lane: 0, row: 'back' },
  { slot: 1, lane: 1, row: 'front' },
  { slot: 4, lane: 1, row: 'back' },
  { slot: 2, lane: 2, row: 'front' },
  { slot: 5, lane: 2, row: 'back' },
];

const PLAYBACK_STEP_MS = 1150;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function hpRatio(unit: BattleBoardUnit | null) {
  if (!unit || !unit.maxHp) return 0;
  return Math.max(0, Math.min(1, unit.hp / unit.maxHp));
}

function boardSlotUnit(units: Array<BattleBoardUnit | null>, slot: number) {
  return units.find((unit) => unit?.slot === slot) ?? units[slot] ?? null;
}

function sideTotals(units: Array<BattleBoardUnit | null>) {
  return units.reduce(
    (totals, unit) => {
      if (!unit) return totals;
      return {
        hp: totals.hp + Math.max(0, unit.hp),
        maxHp: totals.maxHp + Math.max(0, unit.maxHp),
        alive: totals.alive + (unit.alive && unit.hp > 0 ? 1 : 0),
        total: totals.total + 1,
      };
    },
    { hp: 0, maxHp: 0, alive: 0, total: 0 }
  );
}

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(value ?? 0)));
}

function eventKey(event: BattleEvent | null | undefined, fallback = 0) {
  if (!event) return `event-${fallback}`;
  return `${event.round}-${event.attacker}-${event.defender}-${event.actionType}-${event.timestamp ?? fallback}`;
}

function unitMatchesTag(unit: BattleBoardUnit | null, tag?: string | null) {
  if (!unit || !tag || tag === '-') return false;
  const normalized = tag.trim().toLowerCase();
  return unit.tag.toLowerCase() === normalized || unit.name.toLowerCase() === normalized || (tag.length === 1 && unit.tag.startsWith(tag));
}

function eventAmountLabel(event?: BattleEvent | null) {
  if (!event) return '';
  if (event.heal > 0) return `+${formatNumber(event.heal)}`;
  if (event.damage > 0) return `-${formatNumber(event.damage)}`;
  if (event.isMiss) return 'MISS';
  if (event.isStunned) return 'STUN';
  return '0';
}

function eventActionLabel(event?: BattleEvent | null) {
  if (!event) return 'Preparation';
  if (event.actionType === 'dot_damage') return 'Wound';
  if (event.actionType === 'heal') return 'Heal';
  if (event.actionType === 'stunned') return 'Stunned';
  if (event.skillName) return event.skillName;
  return event.actionType === 'skill' ? 'Skill' : 'Attack';
}

function isCombatMotionEvent(event?: BattleEvent | null) {
  return Boolean(event && event.actionType !== 'stunned' && event.defender && event.defender !== '-');
}

export function battleUnitMotionKey(unit: BattleBoardUnit | null, event?: BattleEvent | null) {
  if (!unit) return 'empty-card-motion';
  const active = isCombatMotionEvent(event) && (unitMatchesTag(unit, event?.attacker) || unitMatchesTag(unit, event?.defender));
  return active ? `${unit.tag}-motion-${eventKey(event)}` : `${unit.tag}-motion-idle`;
}

type BattleAnchor = {
  x: number;
  y: number;
  unit?: BattleBoardUnit | null;
};

function eventVfxTone(event?: BattleEvent | null): BattleVfxTone {
  return resolveBattleVfxDescriptor(event ?? undefined).tone;
}

function eventVfxMode(event?: BattleEvent | null): BattleVfxMode {
  return resolveBattleVfxDescriptor(event ?? undefined).mode;
}

function anchorForUnit(unit?: BattleBoardUnit | null): BattleAnchor | null {
  if (!unit) return null;
  const lane = unit.slot >= 3 ? unit.slot - 3 : unit.slot;
  const row = unit.slot >= 3 ? 'back' : 'front';
  const y = [26, 50, 74][Math.max(0, Math.min(2, lane))];
  const x = unit.side === 'A'
    ? row === 'front' ? 30 : 14
    : row === 'front' ? 70 : 86;
  return { x, y, unit };
}

function findEventUnit(board: BattleBoardState, ref?: string | null) {
  if (!ref || ref === '-') return null;
  const units = [...board.bottom, ...board.top].filter((unit): unit is BattleBoardUnit => Boolean(unit));
  const normalized = ref.trim().toLowerCase();
  return units.find((unit) => unit.tag.toLowerCase() === normalized || unit.name.toLowerCase() === normalized || (ref.length === 1 && unit.tag.startsWith(ref))) ?? null;
}

function eventAnchors(board: BattleBoardState, event: BattleEvent): { from: BattleAnchor; to: BattleAnchor; selfTarget: boolean } {
  const actor = findEventUnit(board, event.attacker);
  const target = findEventUnit(board, event.defender) ?? (event.actionType === 'stunned' ? actor : null);
  const from = anchorForUnit(actor) ?? { x: event.attacker?.startsWith('B') ? 64 : 36, y: 52, unit: actor };
  const to = anchorForUnit(target) ?? { x: event.defender?.startsWith('B') ? 64 : 36, y: 52, unit: target };
  return { from, to, selfTarget: Boolean(actor && target && actor.tag === target.tag) || event.attacker === event.defender };
}

function initials(value: string | undefined) {
  if (!value) return '--';
  const clean = value.replace(/[^a-zA-Z0-9]/g, '');
  return clean.slice(0, 2).toUpperCase() || value.slice(0, 2).toUpperCase();
}

function unitImage(unit?: BattleBoardUnit | null) {
  return unit?.image ?? null;
}

function unitTone(unit: BattleBoardUnit | null) {
  if (!unit) return 'border-[#3d2c19]/50 bg-black/28 text-stone-700';
  if (!unit.alive || unit.hp <= 0) return 'border-stone-800/70 bg-black/45 text-stone-500 opacity-65 grayscale';
  return 'border-[#b49664]/55 bg-[#100c08] shadow-[0_0_18px_rgba(180,150,100,0.14)]';
}

function unitArtTone(unit?: BattleBoardUnit | null) {
  if (!unit) return 'from-black via-[#130f0a] to-black';
  if (!unit.alive || unit.hp <= 0) return 'from-stone-950 via-black to-black';
  return 'from-stone-950 via-[#21180f] to-black';
}

function unitPersistentTone(unit?: BattleBoardUnit | null) {
  const names = unit?.buffs.map((buff) => buff.name.toLowerCase()).join(' ') ?? '';
  if (!names) return null;
  if (names.includes('frozen') || names.includes('stun')) return 'border-sky-300/20 bg-sky-950/22 shadow-[inset_0_0_34px_rgba(8,47,73,0.62)]';
  if (names.includes('curse') || names.includes('weakness') || names.includes('wound') || names.includes('poison') || names.includes('vulnerable')) {
    return 'border-violet-400/18 bg-violet-950/26 shadow-[inset_0_0_34px_rgba(46,16,101,0.66)]';
  }
  if (names.includes('heal') || names.includes('bless') || names.includes('haste') || names.includes('pray')) return 'border-emerald-200/42 bg-emerald-300/8 shadow-[inset_0_0_22px_rgba(110,231,183,0.16),0_0_22px_rgba(110,231,183,0.16)]';
  return 'border-[#d8b06c]/38 bg-[#d8b06c]/8 shadow-[inset_0_0_22px_rgba(216,176,108,0.14),0_0_22px_rgba(216,176,108,0.14)]';
}

function actionTone(event?: BattleEvent | null) {
  if (!event) return 'border-stone-700 bg-black/45 text-stone-300';
  if (event.actionType === 'heal') return 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100';
  if (event.actionType === 'dot_damage') return 'border-violet-400/35 bg-violet-400/10 text-violet-100';
  if (event.actionType === 'stunned') return 'border-amber-300/35 bg-amber-400/10 text-amber-100';
  if (event.actionType === 'skill') return 'border-[#c59a5a]/40 bg-[#c59a5a]/10 text-[#f0d8ad]';
  return 'border-stone-500/50 bg-stone-500/10 text-stone-100';
}

function unitSpeed(unit: BattleBoardUnit | null) {
  const raw = unit?.state?.SPEED;
  const numeric = typeof raw === 'number' ? raw : Number(raw ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function initiativeOrder(board: BattleBoardState) {
  return [...board.bottom, ...board.top]
    .filter((unit): unit is BattleBoardUnit => Boolean(unit && unit.alive && unit.hp > 0))
    .sort((a, b) => unitSpeed(b) - unitSpeed(a) || a.tag.localeCompare(b.tag));
}

function ArenaUnitCard({ unit, slot, side, currentEvent }: { unit: BattleBoardUnit | null; slot: SlotSpec; side: 'forger' | 'rival'; currentEvent?: BattleEvent | null }) {
  const ratio = hpRatio(unit);
  const alive = Boolean(unit && unit.alive && unit.hp > 0);
  const rowLabel = slot.row === 'front' ? 'Front' : 'Back';
  const sideLabel = side === 'rival' ? 'B' : 'A';
  const isActor = unitMatchesTag(unit, currentEvent?.attacker);
  const isTarget = unitMatchesTag(unit, currentEvent?.defender);
  const canMove = isCombatMotionEvent(currentEvent);
  const tone = eventVfxTone(currentEvent);
  const mode = eventVfxMode(currentEvent);
  const hitDelay = mode === 'projectile' ? 0.32 : 0.04;
  const actorDirection = side === 'forger' ? 24 : -24;
  const recoilDirection = side === 'forger' ? -16 : 16;
  const motionX = canMove && isActor ? [0, actorDirection, -3, 0] : canMove && isTarget ? [0, recoilDirection, -recoilDirection * 0.65, recoilDirection * 0.28, 0] : 0;
  const motionY = canMove && isActor ? [0, -4, 0, 0] : canMove && isTarget ? [0, -2, 2, 0] : 0;
  const motionScale = canMove && isActor ? [1, 1.06, 1.01, 1] : canMove && isTarget ? [1, 0.965, 1.035, 1] : 1;
  const motionRotate = canMove && isTarget ? [0, side === 'forger' ? -1.8 : 1.8, side === 'forger' ? 1.2 : -1.2, 0] : 0;
  const image = unitImage(unit) ?? CARD_FALLBACK_SRC;
  const persistentTone = unitPersistentTone(unit);

  if (!unit) {
    return (
      <div className="relative h-full w-full overflow-hidden border border-[#b49664]/22 bg-black/24 text-stone-600 shadow-[inset_0_0_26px_rgba(0,0,0,0.72)]">
        <div className="pointer-events-none absolute inset-1.5 border border-[#d8b06c]/12" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_49%,rgba(216,176,108,0.12)_50%,transparent_51%),linear-gradient(45deg,transparent_49%,rgba(216,176,108,0.08)_50%,transparent_51%)]" />
        <div className="relative flex h-full flex-col justify-between p-2">
          <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.22em]">
            <span>{sideLabel}{slot.slot + 1}</span>
            <span>{rowLabel}</span>
          </div>
          <div className="text-center text-[9px] uppercase tracking-[0.3em] text-stone-500">Empty</div>
          <div className="h-1 border border-black/50 bg-black/60" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      key={battleUnitMotionKey(unit, currentEvent)}
      initial={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
      animate={{ opacity: 1, x: motionX, y: motionY, scale: motionScale, rotate: motionRotate }}
      transition={canMove && (isActor || isTarget) ? { duration: 0.58, ease: [0.22, 0.9, 0.24, 1] } : { duration: 0.35, ease: 'easeOut' }}
      className={cn(
        'group relative box-border h-full w-full min-w-0 overflow-hidden border p-1.5 transition ring-1 ring-black/80',
        unitTone(unit),
        isActor && 'z-10 border-[#f0d8ad]/90 shadow-[0_0_38px_rgba(216,176,108,0.36)]',
        isTarget && !isActor && 'z-10 border-red-300/80 shadow-[0_0_34px_rgba(220,38,38,0.28)]'
      )}
    >
      {(isActor || isTarget) && (
        <motion.div
          key={`${unit.tag}-${eventKey(currentEvent)}`}
          className={cn(
            'pointer-events-none absolute inset-0 z-20 border-2',
            isActor ? 'border-[#f0d8ad]/80 bg-[#d8b06c]/10' : 'border-red-300/70 bg-red-950/10'
          )}
          initial={{ opacity: 0.25, scale: 0.98 }}
          animate={{ opacity: [0.38, 0.9, 0.28], scale: [0.99, 1.035, 1] }}
          transition={{ duration: 0.72, ease: 'easeOut' }}
        />
      )}
      {isTarget && currentEvent && (
        <motion.div
          key={`hit-flash-${unit.tag}-${eventKey(currentEvent)}`}
          className="pointer-events-none absolute inset-0 z-30 bg-[radial-gradient(circle_at_50%_34%,rgba(255,244,214,0.86),rgba(248,113,113,0.32)_28%,transparent_58%)] mix-blend-screen"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: [0, 0.95, 0.2, 0], scale: [0.92, 1.05, 1.02, 1] }}
          transition={{ duration: currentEvent.isCrit ? 0.82 : 0.66, delay: hitDelay, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,rgba(255,255,255,0.13),transparent_26%,rgba(180,150,100,0.18)_74%,transparent)] opacity-85" />
      {persistentTone && (
        <div className={cn('pointer-events-none absolute inset-0 z-10 border', persistentTone)} />
      )}
      {isTarget && currentEvent && tone === 'frost' && (
        <motion.div
          key={`frost-card-${eventKey(currentEvent)}`}
          className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(135deg,transparent_0_36%,rgba(186,230,253,0.38)_37%,transparent_39%_58%,rgba(186,230,253,0.28)_59%,transparent_61%),radial-gradient(circle_at_50%_44%,rgba(224,242,254,0.18),transparent_46%)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.85, 0.28] }}
          transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      {isTarget && currentEvent && tone === 'curse' && (
        <motion.div
          key={`curse-card-${eventKey(currentEvent)}`}
          className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(circle_at_50%_48%,rgba(168,85,247,0.3),transparent_42%),linear-gradient(180deg,rgba(88,28,135,0.16),rgba(0,0,0,0.08))]"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: [0, 0.72, 0.18], scale: [0.96, 1.02, 1] }}
          transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <div data-battle-unit-hitbox className={cn('relative h-[116px] overflow-hidden border border-black/70 bg-gradient-to-br xl:h-[124px] 2xl:h-[132px]', unitArtTone(unit))}>
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover object-top opacity-90" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.16)_42%,rgba(0,0,0,0.84)_100%)]" />
        <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center border border-[#d8b06c]/50 bg-black/70 font-display text-[10px] text-[#f0d8ad]">
          {slot.lane + 1}
        </div>
        <div className="absolute right-2 top-2 text-[8px] uppercase tracking-[0.16em] text-stone-300">{unit.tag}</div>
        <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-black/60 px-2 py-1.5">
          <div className="truncate text-[10px] uppercase tracking-[0.16em] text-stone-100">{unit.name}</div>
        </div>
      </div>
      <div className="relative mt-1.5 flex items-center justify-between gap-2">
        <div className="truncate text-[9px] uppercase tracking-[0.18em] text-[#b49664]">{unit.state?.TYPE ?? 'Unknown'}</div>
        <div className="text-[8px] uppercase tracking-[0.16em] text-stone-500">HP</div>
      </div>
      <div className="relative mt-1.5 h-1.5 border border-black/60 bg-black">
        <motion.div
          className={cn('h-full', ratio <= 0.25 ? 'bg-red-500' : ratio <= 0.6 ? 'bg-amber-500' : 'bg-emerald-500')}
          initial={false}
          animate={{ width: `${ratio * 100}%` }}
          transition={{ duration: 0.35 }}
        />
      </div>
      <div className="relative mt-1.5 flex items-center justify-between text-[8px] text-stone-400">
        <span>HP {formatNumber(unit.hp)}</span>
        <span>{formatNumber(unit.mp)}</span>
      </div>
      <div className="relative mt-1 flex min-h-3 flex-wrap gap-1 overflow-hidden">
        {unit.buffs.length ? (
          unit.buffs.slice(0, 2).map((buff, index) => (
            <span key={`${unit.tag}-${buff.name}-${index}`} className="border border-[#c59a5a]/25 bg-[#c59a5a]/10 px-1.5 py-0.5 text-[7px] uppercase tracking-[0.18em] text-[#f0d8ad]">
              {buff.name} {buff.duration}
            </span>
          ))
        ) : (
          <span className="text-[7px] uppercase tracking-[0.2em] text-stone-700">No effect</span>
        )}
      </div>
      {!alive && <div className="pointer-events-none absolute inset-0 bg-black/45 ring-1 ring-inset ring-stone-900" />}
    </motion.div>
  );
}

function SlotCell({
  unit,
  slot,
  side,
  currentEvent,
  editUnitSlots,
  activeDragUnitTag,
  isDropTarget,
  onDragUnitStart,
  onDragUnitEnd,
  onDragUnitHover,
  onDropUnit,
}: {
  unit: BattleBoardUnit | null;
  slot: SlotSpec;
  side: 'forger' | 'rival';
  currentEvent?: BattleEvent | null;
  editUnitSlots?: boolean;
  activeDragUnitTag?: string | null;
  isDropTarget?: boolean;
  onDragUnitStart?: (unitTag: string) => void;
  onDragUnitEnd?: () => void;
  onDragUnitHover?: (slot: number | null) => void;
  onDropUnit?: (unitTag: string, slot: number) => void;
}) {
  const draggable = Boolean(editUnitSlots && unit && onDragUnitStart && onDropUnit);
  const canAcceptDrop = Boolean(editUnitSlots && activeDragUnitTag && activeDragUnitTag !== unit?.tag && onDropUnit);

  function handleDragStart(event: ReactDragEvent<HTMLDivElement>) {
    if (!unit || !draggable) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', unit.tag);
    onDragUnitStart?.(unit.tag);
  }

  function handleDragEnd() {
    onDragUnitEnd?.();
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!canAcceptDrop) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    onDragUnitHover?.(slot.slot);
  }

  function handleDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    if (!isDropTarget) return;
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    onDragUnitHover?.(null);
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (!canAcceptDrop) return;
    event.preventDefault();
    const unitTag = event.dataTransfer.getData('text/plain') || activeDragUnitTag;
    if (!unitTag) return;
    onDropUnit?.(unitTag, slot.slot);
  }

  return (
    <div
      className={cn(
        'relative h-[196px] w-[130px] shrink-0 xl:h-[204px] xl:w-[136px] 2xl:h-[216px] 2xl:w-36',
        isDropTarget ? 'ring-1 ring-[#d8b06c]/70 ring-offset-2 ring-offset-black/80' : ''
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        data-battle-unit-tag={unit?.tag ?? undefined}
        data-battle-unit-name={unit?.name ?? undefined}
        data-battle-unit-side={unit?.side ?? undefined}
        className={cn(
          'absolute inset-0',
          draggable ? 'cursor-grab active:cursor-grabbing' : '',
          activeDragUnitTag === unit?.tag ? 'opacity-45' : ''
        )}
        draggable={draggable}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <ArenaUnitCard unit={unit} slot={slot} side={side} currentEvent={currentEvent} />
      </div>
    </div>
  );
}

function FormationGrid({
  units,
  side,
  currentEvent,
  editUnitSlots,
  onUnitSlotChange,
}: {
  units: Array<BattleBoardUnit | null>;
  side: 'forger' | 'rival';
  currentEvent?: BattleEvent | null;
  editUnitSlots?: boolean;
  onUnitSlotChange?: (unitTag: string, slot: number) => void;
}) {
  const [activeDragUnitTag, setActiveDragUnitTag] = useState<string | null>(null);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const slots = side === 'forger' ? forgerSlots : rivalSlots;

  function clearDragState() {
    setActiveDragUnitTag(null);
    setHoverSlot(null);
  }

  return (
    <div className="relative h-[345px] w-[158px] shrink-0 sm:h-[452px] sm:w-[204px] md:h-[540px] md:w-[244px] lg:h-[628px] lg:w-[284px] xl:h-[652px] xl:w-[300px] 2xl:h-[688px] 2xl:w-[316px]">
      <div className="absolute left-1/2 top-0 grid origin-top -translate-x-1/2 scale-[0.55] grid-cols-[130px_130px] grid-rows-[196px_196px_196px] justify-center gap-x-6 gap-y-5 sm:scale-[0.72] md:scale-[0.86] lg:scale-100 xl:grid-cols-[136px_136px] xl:grid-rows-[204px_204px_204px] 2xl:grid-cols-[144px_144px] 2xl:grid-rows-[216px_216px_216px]">
        {slots.map((slot) => {
          const unit = boardSlotUnit(units, slot.slot);
          return (
            <SlotCell
              key={`${side}-${slot.slot}`}
              unit={unit}
              slot={slot}
              side={side}
              currentEvent={currentEvent}
              editUnitSlots={editUnitSlots}
              activeDragUnitTag={activeDragUnitTag}
              isDropTarget={activeDragUnitTag !== null && hoverSlot === slot.slot && activeDragUnitTag !== unit?.tag}
              onDragUnitStart={setActiveDragUnitTag}
              onDragUnitEnd={clearDragState}
              onDragUnitHover={setHoverSlot}
              onDropUnit={(unitTag, nextSlot) => {
                onUnitSlotChange?.(unitTag, nextSlot);
                clearDragState();
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function CommanderPanel({ label, units, side }: { label: string; units: Array<BattleBoardUnit | null>; side: 'forger' | 'rival' }) {
  const totals = sideTotals(units);
  const leader = units.find((unit) => unit && unit.alive) ?? units.find(Boolean);
  const ratio = totals.maxHp > 0 ? totals.hp / totals.maxHp : 0;
  const leaderImage = leader ? unitImage(leader) ?? CARD_FALLBACK_SRC : null;

  return (
    <aside className="relative min-h-[760px] overflow-hidden border border-[#40311f] bg-[#050403]/90 p-4 shadow-[0_22px_80px_rgba(0,0,0,0.52)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(216,176,108,0.12),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_18%,rgba(0,0,0,0.5))]" />
      <div className="pointer-events-none absolute inset-x-4 top-4 h-px bg-gradient-to-r from-transparent via-[#b49664]/30 to-transparent" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-[#b49664]">{side}</div>
          <h3 className="mt-2 font-display text-2xl font-light uppercase tracking-[0.18em] text-stone-100">{label}</h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center border border-[#b49664]/30 bg-[#b49664]/10 text-[#d8b06c]">
          <Shield size={18} />
        </div>
      </div>

      <div className="relative mt-4 overflow-hidden border border-[#3d2c19] bg-[#070707]">
        <div
          className={cn('relative h-[310px] overflow-hidden bg-gradient-to-br', unitArtTone(leader))}
          style={leaderImage ? { backgroundImage: `url(${leaderImage})`, backgroundPosition: 'center top', backgroundSize: 'cover' } : undefined}
        >
          {!leaderImage && (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(245,185,95,0.16),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.86))]" />
              <div className="absolute left-1/2 top-16 flex h-16 w-16 -translate-x-1/2 items-center justify-center border border-[#d8b06c]/22 bg-black/36 font-display text-xl tracking-[0.14em] text-[#e3c589]">
                {initials(leader?.name)}
              </div>
            </>
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.22)_42%,rgba(0,0,0,0.86)_100%)]" />
          <div className="relative flex h-full flex-col justify-end p-4">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#b49664]">{leader?.state?.TYPE ?? 'Mythic'}</div>
            <div className="mt-2 font-display text-2xl font-light uppercase tracking-[0.18em] text-stone-100">{leader?.name ?? 'No leader'}</div>
          </div>
        </div>
        <div className="border-t border-white/8 p-3">
          <div className="text-2xl font-light tracking-[0.08em] text-stone-100">{formatNumber(totals.hp)}</div>
          <div className="mt-2 h-1.5 border border-white/8 bg-black">
            <div className="h-full bg-gradient-to-r from-red-700 via-amber-500 to-emerald-500" style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[9px] uppercase tracking-[0.18em] text-stone-500">
            <span>Alive {totals.alive}</span>
            <span>Total {totals.total}</span>
            <span>Round</span>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[10px] uppercase tracking-[0.28em] text-[#b49664]">Reserves</div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }, (_, index) => units[index] ?? null).map((unit, index) => {
            const reserveImage = unit ? unitImage(unit) ?? CARD_FALLBACK_SRC : null;
            return (
            <div key={`${side}-reserve-${unit?.tag ?? index}`} className="relative flex h-16 flex-col justify-end overflow-hidden border border-[#3d2c19] bg-black/50 p-2">
              <div className={cn('absolute inset-0 bg-gradient-to-br opacity-55', unitArtTone(unit))} />
              {reserveImage && <img src={reserveImage} alt="" className="absolute inset-0 h-full w-full object-cover object-top opacity-75" />}
              <div className="absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-black/92 to-transparent" />
              <div className="truncate text-[9px] uppercase tracking-[0.12em] text-stone-300">{unit?.name ?? 'Empty'}</div>
            </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function ActionRail({ board, currentEvent, started }: { board: BattleBoardState; currentEvent?: BattleEvent | null; started: boolean }) {
  const order = initiativeOrder(board);
  return (
    <div className="min-w-0 border border-[#2b241b] bg-black/45 px-4 py-3 shadow-[inset_0_0_48px_rgba(0,0,0,0.45)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.28em] text-[#b49664]">Action Order</div>
        <div className="text-[9px] uppercase tracking-[0.22em] text-stone-600">{started ? 'Speed initiative' : 'Ready by speed'}</div>
      </div>
      <div className="grid grid-cols-6 gap-2 xl:grid-cols-12">
        {order.map((unit, index) => (
          <div key={`${unit.tag}-${index}`} className="min-w-0">
            <div className={cn(
              'relative mx-auto aspect-[2/3] w-12 overflow-hidden border p-1 transition xl:w-14',
              unitMatchesTag(unit, currentEvent?.attacker)
                ? 'border-[#d8b06c]/90 bg-[#d8b06c]/10 shadow-[0_0_26px_rgba(216,176,108,0.26)]'
                : unit.side === 'A'
                  ? 'border-[#b49664]/35 bg-[#b49664]/8 text-[#f0d8ad]'
                  : 'border-red-400/28 bg-red-950/10 text-red-100'
            )}>
              <div className={cn('absolute inset-0 bg-gradient-to-br opacity-60', unit.side === 'A' ? 'from-[#412312] via-[#16110e] to-black' : 'from-[#3b1412] via-[#141010] to-black')} />
              <div
                className="absolute inset-0 bg-cover bg-center opacity-45"
                style={unit.image ? { backgroundImage: `url(${unit.image})` } : undefined}
              />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,229,170,0.24),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.82))]" />
              <div className="absolute left-1/2 top-5 h-10 w-7 -translate-x-1/2 rounded-t-full border border-white/10 bg-black/35 xl:h-12 xl:w-8" />
              <div className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center border border-[#d8b06c]/45 bg-black/65 font-display text-[8px] text-[#f0d8ad]">
                {index + 1}
              </div>
              <div className="absolute inset-x-1 bottom-1 border-t border-white/10 bg-black/70 px-1 py-1">
                <div className="truncate text-center text-[7px] uppercase tracking-[0.1em] text-stone-100">{unit.tag}</div>
              </div>
            </div>
            <div className="mt-1 text-center text-[10px] font-light text-stone-500">SPD {unitSpeed(unit)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

type PixiPoint = { x: number; y: number };
type PixiRect = { x: number; y: number; width: number; height: number };
type PixiPalette = { core: number; hot: number; dark: number; text: number };
type PixiAdd = <T extends Container | Graphics | Text | Sprite>(node: T, zIndex?: number) => T;
type BattleVfxTextures = {
  projectileBeamFrames: Texture[];
  projectileSequenceFrames: Record<ProjectileVfxSequenceTextureKey, Texture[]>;
  sparkA: Texture;
  sparkB: Texture;
  sparkC: Texture;
  sparkD: Texture;
  sparkE: Texture;
  sparks: Texture[];
  smokeA: Texture;
  smokeB: Texture;
  smokeC: Texture;
  smokeD: Texture;
  smokes: Texture[];
  beams: Record<ProjectileVfxBeamTextureKey, Texture>;
  impacts: Record<ProjectileVfxImpactTextureKey, Texture>;
  instants: Record<ProjectileVfxInstantTextureKey, Texture>;
  buffBorders: Record<BuffBorderTextureKey, Texture>;
  slash: Texture;
  impact: Texture;
  ring: Texture;
};

function pixiPalette(tone: BattleVfxTone): PixiPalette {
  const palettes: Record<BattleVfxTone, PixiPalette> = {
    fire: { core: 0xff8a22, hot: 0xfff0c2, dark: 0x8f2410, text: 0xffded0 },
    void: { core: 0x9a5cff, hot: 0xf2dcff, dark: 0x3f157f, text: 0xe7d7ff },
    curse: { core: 0xd946ef, hot: 0xffd3fb, dark: 0x6b126f, text: 0xf8c8ff },
    frost: { core: 0x7dd3fc, hot: 0xf0fbff, dark: 0x0f5f88, text: 0xe0f7ff },
    nature: { core: 0x84cc16, hot: 0xf3ffd2, dark: 0x365314, text: 0xecfccb },
    water: { core: 0x38bdf8, hot: 0xe0f7ff, dark: 0x075985, text: 0xdff6ff },
    storm: { core: 0xfacc15, hot: 0xffffd8, dark: 0x854d0e, text: 0xfff4b8 },
    magic: { core: 0xe879f9, hot: 0xffe4ff, dark: 0x701a75, text: 0xfae8ff },
    light: { core: 0xfff2b8, hot: 0xffffff, dark: 0xb8860b, text: 0xfff8dc },
    heal: { core: 0x6ee7b7, hot: 0xf2fff9, dark: 0x047857, text: 0xdbfff0 },
    wound: { core: 0xf87171, hot: 0xffe3dc, dark: 0x991b1b, text: 0xffded8 },
    stun: { core: 0xfacc15, hot: 0xfff7cc, dark: 0x92400e, text: 0xfff2b8 },
    steel: { core: 0xd6d3d1, hot: 0xffffff, dark: 0x57534e, text: 0xf5f5f4 },
    gold: { core: 0xd8b06c, hot: 0xfff1c8, dark: 0x7a4f1f, text: 0xffedc2 },
  };
  return palettes[tone];
}

function linePoint(a: PixiPoint, b: PixiPoint, t: number): PixiPoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function drawLineSegment(graphics: Graphics, a: PixiPoint, b: PixiPoint, startT: number, endT: number, color: number, width: number, alpha: number) {
  const from = Math.max(0, Math.min(1, startT));
  const to = Math.max(from + 0.001, Math.min(1, endT));
  const first = linePoint(a, b, from);
  graphics.moveTo(first.x, first.y);
  const last = linePoint(a, b, to);
  graphics.lineTo(last.x, last.y);
  graphics.stroke({ color, width, alpha, cap: 'round', join: 'round' });
}

function drawGlowCircle(graphics: Graphics, x: number, y: number, radius: number, color: number, alpha: number) {
  graphics.circle(x, y, radius);
  graphics.fill({ color, alpha });
}

function drawBeamHead(graphics: Graphics, point: PixiPoint, angle: number, normal: PixiPoint, palette: PixiPalette, profile: ProjectileVfxProfile) {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  drawGlowCircle(graphics, point.x, point.y, profile.headGlowRadius, palette.core, 0.18);
  drawGlowCircle(graphics, point.x, point.y, Math.max(5, profile.headGlowRadius * 0.34), palette.hot, 0.82);

  for (let i = 0; i < profile.filamentCount; i += 1) {
    const offsetRatio = profile.filamentCount <= 1 ? 0 : i / (profile.filamentCount - 1) - 0.5;
    const side = offsetRatio * profile.coreWidth * 1.45;
    const length = 18 + (profile.filamentCount - i) * 3;
    const start = {
      x: point.x - dir.x * length + normal.x * side,
      y: point.y - dir.y * length + normal.y * side,
    };
    const end = {
      x: point.x + dir.x * (5 + i * 0.7) + normal.x * side * 0.18,
      y: point.y + dir.y * (5 + i * 0.7) + normal.y * side * 0.18,
    };
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);
    graphics.stroke({
      color: i % 2 ? palette.core : palette.hot,
      width: Math.max(1.1, profile.coreWidth * (0.36 - Math.abs(offsetRatio) * 0.16)),
      alpha: 0.52 + (1 - Math.abs(offsetRatio) * 2) * 0.28,
      cap: 'round',
      join: 'round',
    });
  }
}

function createProjectileBeamSequenceTextures(texture: Texture) {
  const sourceTexture = createBlackBackedVfxRuntimeTexture(texture);
  return Array.from({ length: projectileBeamSequence.frameCount }, (_, index) => {
    const rect = projectileBeamSequenceFrameRect(sourceTexture.width, sourceTexture.height, index);
    return new Texture({
      source: sourceTexture.source,
      frame: new Rectangle(rect.x, rect.y, rect.width, rect.height),
    });
  });
}

function createBlackBackedVfxRuntimeTexture(texture: Texture) {
  if (typeof document === 'undefined') return texture;
  const resource = texture.source.resource as CanvasImageSource | undefined;
  if (!resource) return texture;

  try {
    const width = Math.floor(texture.width);
    const height = Math.floor(texture.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return texture;

    context.drawImage(resource, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const luminance = Math.max(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
      data[i + 3] = Math.round(blackBackedVfxAlphaForLuminance(luminance) * 255);
    }
    context.putImageData(imageData, 0, 0);
    return Texture.from(canvas);
  } catch {
    return texture;
  }
}

function createBattleVfxTextures(loadedTextures: Record<string, Texture>): BattleVfxTextures {
  const sparkA = loadedTextures.sparkA;
  const sparkB = loadedTextures.sparkB;
  const sparkC = loadedTextures.sparkC;
  const sparkD = loadedTextures.sparkD;
  const sparkE = loadedTextures.sparkE;
  const smokeA = loadedTextures.smokeA;
  const smokeB = loadedTextures.smokeB;
  const smokeC = loadedTextures.smokeC;
  const smokeD = loadedTextures.smokeD;
  return {
    projectileBeamFrames: createProjectileBeamSequenceTextures(loadedTextures.projectileBeam),
    projectileSequenceFrames: {
      projectileBeam: createProjectileBeamSequenceTextures(loadedTextures.projectileBeam),
      projectileFire: createProjectileBeamSequenceTextures(loadedTextures.projectileFire),
      projectileFrost: createProjectileBeamSequenceTextures(loadedTextures.projectileFrost),
      projectileLight: createProjectileBeamSequenceTextures(loadedTextures.projectileLight),
      projectileBlood: createProjectileBeamSequenceTextures(loadedTextures.projectileBlood),
    },
    sparkA,
    sparkB,
    sparkC,
    sparkD,
    sparkE,
    sparks: [sparkA, sparkB, sparkC, sparkD, sparkE],
    smokeA,
    smokeB,
    smokeC,
    smokeD,
    smokes: [smokeA, smokeB, smokeC, smokeD],
    beams: {
      beamFire: loadedTextures.beamFire,
      beamBlood: loadedTextures.beamBlood,
      beamFrost: loadedTextures.beamFrost,
      beamVoid: loadedTextures.beamVoid,
      beamCurse: loadedTextures.beamCurse,
      beamHoly: loadedTextures.beamHoly,
      beamSteel: loadedTextures.beamSteel,
      beamGold: loadedTextures.beamGold,
      beamNature: loadedTextures.beamNature,
      beamWater: loadedTextures.beamWater,
      beamStorm: loadedTextures.beamStorm,
      beamMagic: loadedTextures.beamMagic,
    },
    impacts: {
      impactFire: loadedTextures.impactFire,
      impactBlood: loadedTextures.impactBlood,
      impactFrost: loadedTextures.impactFrost,
      impactVoid: loadedTextures.impactVoid,
      impactCurse: loadedTextures.impactCurse,
      impactHoly: loadedTextures.impactHoly,
      impactSteel: loadedTextures.impactSteel,
      impactGold: loadedTextures.impactGold,
      impactNature: loadedTextures.impactNature,
      impactWater: loadedTextures.impactWater,
      impactStorm: loadedTextures.impactStorm,
      impactMagic: loadedTextures.impactMagic,
    },
    instants: {
      instantFire: loadedTextures.instantFire,
      instantBlood: loadedTextures.instantBlood,
      instantFrost: loadedTextures.instantFrost,
      instantVoid: loadedTextures.instantVoid,
      instantCurse: loadedTextures.instantCurse,
      instantHoly: loadedTextures.instantHoly,
      instantSteel: loadedTextures.instantSteel,
      instantGold: loadedTextures.instantGold,
      instantNature: loadedTextures.instantNature,
      instantWater: loadedTextures.instantWater,
      instantStorm: loadedTextures.instantStorm,
      instantMagic: loadedTextures.instantMagic,
    },
    buffBorders: {
      buffBorderFire: loadedTextures.buffBorderFire,
      buffBorderBlood: loadedTextures.buffBorderBlood,
      buffBorderFrost: loadedTextures.buffBorderFrost,
      buffBorderVoid: loadedTextures.buffBorderVoid,
      buffBorderCurse: loadedTextures.buffBorderCurse,
      buffBorderHoly: loadedTextures.buffBorderHoly,
      buffBorderSteel: loadedTextures.buffBorderSteel,
      buffBorderGold: loadedTextures.buffBorderGold,
      buffBorderNature: loadedTextures.buffBorderNature,
      buffBorderWater: loadedTextures.buffBorderWater,
      buffBorderStorm: loadedTextures.buffBorderStorm,
      buffBorderMagic: loadedTextures.buffBorderMagic,
    },
    slash: loadedTextures.slashStreak,
    impact: loadedTextures.impactBurst,
    ring: loadedTextures.ring,
  };
}

function vfxTexture(textures: BattleVfxTextures, key: ProjectileVfxTextureKey) {
  return textures[key];
}

function projectileBeamTexture(textures: BattleVfxTextures, key: ProjectileVfxBeamTextureKey) {
  return textures.beams[key];
}

function impactBurstTexture(textures: BattleVfxTextures, key: ProjectileVfxImpactTextureKey) {
  return textures.impacts[key];
}

function instantGlyphTexture(textures: BattleVfxTextures, key: ProjectileVfxInstantTextureKey) {
  return textures.instants[key];
}

function buffBorderTexture(textures: BattleVfxTextures, key: BuffBorderTextureKey) {
  return textures.buffBorders[key];
}

function addParticle(parent: Container, x: number, y: number, palette: PixiPalette, scale = 1) {
  const particle = new Graphics();
  particle.blendMode = 'add';
  particle.circle(0, 0, 2.4 * scale);
  particle.fill({ color: Math.random() > 0.32 ? palette.hot : palette.core, alpha: 0.95 });
  particle.x = x;
  particle.y = y;
  parent.addChild(particle);
  return particle;
}

function addTextureParticle(parent: Container, textures: BattleVfxTextures, x: number, y: number, palette: PixiPalette, scale = 1) {
  const options = textures.sparks;
  const particle = new Sprite(options[Math.floor(Math.random() * options.length)]);
  particle.anchor.set(0.5);
  particle.blendMode = 'add';
  particle.tint = Math.random() > 0.45 ? palette.hot : palette.core;
  particle.alpha = 0;
  particle.scale.set(0.055 * scale);
  particle.x = x;
  particle.y = y;
  parent.addChild(particle);
  return particle;
}

function renderPixiImpact(
  add: PixiAdd,
  tweens: gsap.core.Tween[],
  point: PixiPoint,
  palette: PixiPalette,
  event: BattleEvent,
  delay = 0,
  textures?: BattleVfxTextures,
  projectilePlan?: FastProjectilePlan,
  profile?: ProjectileVfxProfile,
  showDirectionalCut = true
) {
  const burst = add(new Graphics(), 8);
  const shock = add(new Graphics(), 7);
  const shards = add(new Container(), 9);
  burst.blendMode = shock.blendMode = shards.blendMode = 'add';
  burst.filters = [new BlurFilter({ strength: 3 })];
  const impactRadius = projectilePlan?.impactRadius ?? (event.isCrit ? 88 : 68);

  if (textures) {
    const showImpactFlashTexture = profile?.impactFlashTexture ?? true;
    const flashTexture = showImpactFlashTexture ? (profile ? impactBurstTexture(textures, profile.impactTextureKey) : textures.impact) : null;
    const ringAnchor = profile?.impactRingAnchor ?? { x: 0.5, y: 0.5 };
    const flash = flashTexture ? add(new Sprite(flashTexture), 8) : null;
    const cut = showDirectionalCut ? add(new Sprite(textures.slash), 9) : null;
    const cutState = { alpha: 0.44, scaleX: 0.13, scaleY: 0.034, rotation: -0.62 + Math.random() * 0.18 };
    const ringSprite = add(new Sprite(textures.ring), 8);
    const ringSpriteState = { alpha: 0.46, scale: 0.28, rotation: Math.random() * Math.PI };
    if (flash) {
      const flashAnchor = profile?.impactAnchor ?? { x: 0.5, y: 0.5 };
      const flashScale = profile?.impactFlashScale ?? 0.72;
      const flashState = { alpha: 0, scale: 0.1, rotation: Math.random() * Math.PI };
      flash.anchor.set(flashAnchor.x, flashAnchor.y);
      flash.blendMode = 'add';
      flash.tint = profile ? 0xffffff : palette.hot;
      flash.x = point.x;
      flash.y = point.y;
      flash.alpha = 0;
      flash.scale.set(flashScale * 0.16);
      tweens.push(gsap.fromTo(flashState, { alpha: event.isCrit ? 1 : 0.96, scale: flashScale * 0.34 }, {
        alpha: 0,
        scale: flashScale * (event.isCrit ? 1.06 : 0.86),
        duration: event.isCrit ? 0.42 : 0.36,
        delay,
        ease: 'power4.out',
        onStart: () => {
          flash.alpha = flashState.alpha;
        },
        onUpdate: () => {
          flash.alpha = flashState.alpha;
          flash.rotation = flashState.rotation;
          flash.scale.set(flashState.scale);
        },
        onComplete: () => flash.destroy(),
      }));
    }
    if (cut) {
      cut.anchor.set(0.72, 0.58);
      cut.blendMode = 'add';
      cut.tint = palette.hot;
      cut.x = point.x;
      cut.y = point.y;
      cut.alpha = 0;
      cut.scale.set(cutState.scaleX, cutState.scaleY);
    }
    ringSprite.anchor.set(ringAnchor.x, ringAnchor.y);
    ringSprite.blendMode = 'add';
    ringSprite.tint = palette.core;
    ringSprite.x = point.x;
    ringSprite.y = point.y;
    ringSprite.alpha = 0;
    ringSprite.scale.set(ringSpriteState.scale);
    if (cut) {
      tweens.push(gsap.fromTo(cutState, {
        alpha: 0.76,
        scaleX: (event.isCrit ? 0.38 : 0.3) * (profile?.slashScaleX ?? 1),
        scaleY: 0.08 * (profile?.slashScaleY ?? 1),
      }, {
        alpha: 0,
        scaleX: event.isCrit ? 0.54 : 0.42,
        scaleY: 0.035,
        duration: 0.2,
        delay,
        ease: 'power4.out',
        onUpdate: () => {
          cut.alpha = cutState.alpha;
          cut.rotation = cutState.rotation;
          cut.scale.set(cutState.scaleX, cutState.scaleY);
        },
        onComplete: () => cut.destroy(),
      }));
    }
    tweens.push(gsap.fromTo(ringSpriteState, { alpha: event.isCrit ? 0.72 : 0.52, scale: 0.22 }, {
      alpha: 0,
      scale: event.isCrit ? 0.72 : 0.58,
      duration: event.isCrit ? 0.48 : 0.36,
      delay,
      ease: 'power4.out',
      onUpdate: () => {
        ringSprite.alpha = ringSpriteState.alpha;
        ringSprite.rotation = ringSpriteState.rotation;
        ringSprite.scale.set(ringSpriteState.scale);
      },
      onComplete: () => ringSprite.destroy(),
    }));
  }

  tweens.push(gsap.fromTo(burst, { alpha: 0, scale: 0.4 }, {
    alpha: 0,
    scale: 1.18,
    duration: 0.28,
    delay,
    ease: 'power4.out',
    onStart: () => {
      burst.clear();
      drawGlowCircle(burst, point.x, point.y, impactRadius * 0.54, palette.hot, event.isCrit ? 0.62 : 0.44);
      drawGlowCircle(burst, point.x, point.y, impactRadius, palette.core, event.isCrit ? 0.2 : 0.13);
    },
    onUpdate: () => {
      burst.x = point.x * (1 - burst.scale.x);
      burst.y = point.y * (1 - burst.scale.y);
    },
    onComplete: () => burst.destroy(),
  }));

  const ring = { r: 18, alpha: 0.95 };
  tweens.push(gsap.to(ring, {
    r: event.isCrit ? impactRadius * 1.18 : impactRadius,
    alpha: 0,
    duration: event.isCrit ? 0.44 : 0.34,
    delay,
    ease: 'power4.out',
    onUpdate: () => {
      shock.clear();
      shock.circle(point.x, point.y, ring.r);
      shock.stroke({ color: palette.hot, width: event.isCrit ? 4 : 3, alpha: ring.alpha });
      shock.circle(point.x, point.y, ring.r * 0.62);
      shock.stroke({ color: palette.core, width: 2, alpha: ring.alpha * 0.6 });
    },
    onComplete: () => shock.destroy(),
  }));

  const shardCount = event.isCrit ? Math.round((profile?.shardCount ?? 38) * 1.35) : (profile?.shardCount ?? 38);
  for (let i = 0; i < shardCount; i += 1) {
    const angle = (Math.PI * 2 * i) / shardCount + (Math.random() - 0.5) * 0.28;
    const length = 16 + Math.random() * (event.isCrit ? 72 : 48);
    const particle = textures
      ? addTextureParticle(shards, textures, point.x, point.y, palette, Math.random() * 1.2 + 0.8)
      : addParticle(shards, point.x, point.y, palette, Math.random() * 1.8 + 0.9);
    if (textures) {
      const particleState = {
        x: point.x,
        y: point.y,
        alpha: 0.82,
        scale: particle.scale.x,
      };
      tweens.push(gsap.to(particleState, {
        x: point.x + Math.cos(angle) * length,
        y: point.y + Math.sin(angle) * length,
        alpha: 0,
        scale: Math.random() * 0.05 + 0.018,
        duration: 0.22 + Math.random() * 0.2,
        delay: delay + Math.random() * 0.08,
        ease: 'power4.out',
        onStart: () => {
          particle.alpha = particleState.alpha;
        },
        onUpdate: () => {
          if (particle.destroyed) return;
          particle.x = particleState.x;
          particle.y = particleState.y;
          particle.alpha = particleState.alpha;
          particle.scale.set(particleState.scale);
        },
        onComplete: () => particle.destroy(),
      }));
    } else {
      const particleTween: gsap.TweenVars = {
        x: point.x + Math.cos(angle) * length,
        y: point.y + Math.sin(angle) * length,
        alpha: 0,
        duration: 0.22 + Math.random() * 0.2,
        delay: delay + Math.random() * 0.08,
        ease: 'power4.out',
        onStart: () => { particle.alpha = 1; },
        onComplete: () => particle.destroy(),
      };
      particleTween.scale = Math.random() * 0.5 + 0.2;
      tweens.push(gsap.to(particle, particleTween));
    }
  }

  if (event.isCrit && event.damage > 0) {
    const label = add(new Text({
      text: 'CRITICAL',
      style: {
        fill: palette.text,
        fontFamily: 'serif',
        fontSize: 24,
        fontWeight: '700',
        letterSpacing: 5,
        stroke: { color: 0x120807, width: 3 },
        dropShadow: { color: palette.core, blur: 14, alpha: 0.9, distance: 0 },
      },
    }), 12);
    label.anchor.set(0.5);
    label.x = point.x;
    label.y = point.y - 96;
    label.blendMode = 'add';
    tweens.push(gsap.fromTo(label, { alpha: 0, y: point.y - 68, scale: 0.75 }, {
      alpha: 0,
      y: point.y - 132,
      scale: 1.18,
      duration: 0.95,
      delay,
      ease: 'power3.out',
      onStart: () => { label.alpha = 1; },
      onComplete: () => label.destroy(),
    }));
  }
}

function renderPixiInstant(add: PixiAdd, tweens: gsap.core.Tween[], point: PixiPoint, palette: PixiPalette, event: BattleEvent, textures?: BattleVfxTextures, profile?: ProjectileVfxProfile) {
  const layer = add(new Container(), 8);
  layer.blendMode = 'add';

  if (textures && profile) {
    const glyph = new Sprite(instantGlyphTexture(textures, profile.instantTextureKey));
    const glyphScale = profile.instantScale * profile.instantClarityScale;
    const glyphState = { alpha: 1, scale: glyphScale * 0.58, rotation: Math.random() * Math.PI };
    glyph.anchor.set(profile.instantAnchor.x, profile.instantAnchor.y);
    glyph.blendMode = 'add';
    glyph.x = point.x;
    glyph.y = point.y;
    glyph.alpha = 0;
    glyph.scale.set(glyphState.scale);
    glyph.rotation = glyphState.rotation;
    layer.addChild(glyph);
    tweens.push(gsap.fromTo(glyphState, {
      alpha: 1,
      scale: glyphScale * 0.42,
    }, {
      alpha: 0,
      scale: glyphScale,
      rotation: glyphState.rotation + Math.PI * 0.36,
      duration: 0.44,
      ease: 'power4.out',
      onStart: () => { glyph.alpha = glyphState.alpha; },
      onUpdate: () => {
        glyph.alpha = glyphState.alpha;
        glyph.scale.set(glyphState.scale);
        glyph.rotation = glyphState.rotation;
      },
      onComplete: () => glyph.destroy(),
    }));
  }

  if (!textures) {
    for (let i = 0; i < 3; i += 1) {
      const slash = new Graphics();
      slash.blendMode = 'add';
      slash.moveTo(-58, 0);
      slash.lineTo(58, 0);
      slash.stroke({ color: i % 2 ? palette.core : palette.hot, width: i % 2 ? 4 : 2, alpha: 0.82, cap: 'round' });
      slash.x = point.x;
      slash.y = point.y + (i - 1) * 15;
      slash.rotation = (-32 + i * 28) * Math.PI / 180;
      slash.scale.x = 0.1;
      slash.alpha = 0;
      layer.addChild(slash);
      tweens.push(gsap.to(slash, {
        alpha: 0,
        scaleX: 1.0,
        duration: 0.24,
        delay: i * 0.035,
        ease: 'power3.out',
        onStart: () => { slash.alpha = 0.86; },
        onComplete: () => slash.destroy(),
      }));
    }
  }

  if (textures) {
    const particleCount = profile?.instantParticleCount ?? 24;
    for (let i = 0; i < particleCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const particle = addTextureParticle(layer, textures, point.x, point.y, palette, 0.92 + Math.random() * 0.95);
      const state = {
        x: point.x,
        y: point.y,
        alpha: 0.78 + Math.random() * 0.2,
        scale: particle.scale.x,
      };
      tweens.push(gsap.to(state, {
        x: point.x + Math.cos(angle) * (34 + Math.random() * 58),
        y: point.y + Math.sin(angle) * (30 + Math.random() * 50),
        alpha: 0,
        scale: state.scale * 0.24,
        duration: 0.26 + Math.random() * 0.16,
        delay: Math.random() * 0.04,
        ease: 'power4.out',
        onStart: () => { particle.alpha = state.alpha; },
        onUpdate: () => {
          particle.x = state.x;
          particle.y = state.y;
          particle.alpha = state.alpha;
          particle.scale.set(state.scale);
        },
        onComplete: () => particle.destroy(),
      }));
    }
  }

  renderPixiImpact(add, tweens, point, palette, event, 0.02, textures, undefined, profile, false);
  tweens.push(gsap.delayedCall(0.72, () => layer.destroy({ children: true })));
}

function pointOnRectEdge(rect: PixiRect, t: number): PixiPoint {
  const perimeter = rect.width * 2 + rect.height * 2;
  const distance = ((t % 1) + 1) % 1 * perimeter;
  if (distance <= rect.width) return { x: rect.x + distance, y: rect.y };
  if (distance <= rect.width + rect.height) return { x: rect.x + rect.width, y: rect.y + distance - rect.width };
  if (distance <= rect.width * 2 + rect.height) return { x: rect.x + rect.width - (distance - rect.width - rect.height), y: rect.y + rect.height };
  return { x: rect.x, y: rect.y + rect.height - (distance - rect.width * 2 - rect.height) };
}

function renderPixiBuff(add: PixiAdd, tweens: gsap.core.Tween[], point: PixiPoint, targetBox: PixiRect, palette: PixiPalette, event: BattleEvent, textures?: BattleVfxTextures) {
  const plan = createBuffBorderVfxPlan(event);
  const border = add(new Graphics(), 8);
  const fill = add(new Graphics(), 7);
  const motes = add(new Container(), 9);
  const corners = add(new Container(), 10);
  const rect = {
    x: targetBox.x - 7,
    y: targetBox.y - 7,
    width: targetBox.width + 14,
    height: targetBox.height + 14,
  };
  border.blendMode = fill.blendMode = motes.blendMode = corners.blendMode = 'add';
  border.filters = [new BlurFilter({ strength: 1.4 })];

  const pulse = { alpha: 0.9, inset: 5, glow: plan.borderGlowWidth };
  tweens.push(gsap.to(pulse, {
    alpha: 0,
    inset: -5,
    glow: plan.borderGlowWidth + 4,
    duration: plan.pulseDurationMs / 1000,
    ease: 'power3.out',
    onUpdate: () => {
      border.clear();
      fill.clear();
      const x = rect.x + pulse.inset;
      const y = rect.y + pulse.inset;
      const w = rect.width - pulse.inset * 2;
      const h = rect.height - pulse.inset * 2;
      border.roundRect(x, y, w, h, 4);
      border.stroke({ color: palette.hot, width: pulse.glow, alpha: pulse.alpha * 0.72 });
      border.roundRect(x + 4, y + 4, w - 8, h - 8, 3);
      border.stroke({ color: palette.core, width: Math.max(1.5, pulse.glow * 0.42), alpha: pulse.alpha * 0.86 });
      fill.roundRect(x + 2, y + 2, w - 4, h - 4, 4);
      fill.fill({ color: palette.core, alpha: pulse.alpha * 0.045 });
    },
    onComplete: () => {
      border.destroy();
      fill.destroy();
    },
  }));

  if (textures) {
    const cornerTexture = buffBorderTexture(textures, plan.borderTextureKey);
    const cornerPoints = [
      { x: rect.x, y: rect.y, rotation: -Math.PI * 0.25 },
      { x: rect.x + rect.width, y: rect.y, rotation: Math.PI * 0.25 },
      { x: rect.x + rect.width, y: rect.y + rect.height, rotation: Math.PI * 0.75 },
      { x: rect.x, y: rect.y + rect.height, rotation: -Math.PI * 0.75 },
    ];
    cornerPoints.forEach((corner, index) => {
      const sprite = new Sprite(cornerTexture);
      const state = { alpha: 0.72, scale: plan.cornerScale * (index % 2 ? 0.92 : 1.04), rotation: corner.rotation };
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      sprite.tint = 0xffffff;
      sprite.x = corner.x;
      sprite.y = corner.y;
      sprite.alpha = 0;
      sprite.scale.set(state.scale);
      sprite.rotation = state.rotation;
      corners.addChild(sprite);
      tweens.push(gsap.to(state, {
        alpha: 0,
        scale: state.scale * 1.8,
        rotation: state.rotation + (index % 2 ? -0.42 : 0.42),
        duration: 0.76,
        delay: index * 0.025,
        ease: 'power3.out',
        onStart: () => { sprite.alpha = state.alpha; },
        onUpdate: () => {
          sprite.alpha = state.alpha;
          sprite.scale.set(state.scale);
          sprite.rotation = state.rotation;
        },
        onComplete: () => sprite.destroy(),
      }));
    });
  }

  for (let i = 0; i < plan.edgeParticleCount; i += 1) {
    const edgeStart = pointOnRectEdge(rect, i / plan.edgeParticleCount + Math.random() * 0.025);
    const outward = {
      x: edgeStart.x < point.x ? -1 : edgeStart.x > point.x ? 1 : 0,
      y: edgeStart.y < point.y ? -1 : edgeStart.y > point.y ? 1 : 0,
    };
    const p = textures
      ? addTextureParticle(motes, textures, edgeStart.x, edgeStart.y, palette, 0.7 + Math.random() * 0.7)
      : addParticle(motes, edgeStart.x, edgeStart.y, palette, 0.9 + Math.random() * 0.8);
    const particleState = {
      x: edgeStart.x,
      y: edgeStart.y,
      alpha: 0.76 + Math.random() * 0.2,
      scale: p.scale.x,
    };
    tweens.push(gsap.to(particleState, {
      x: edgeStart.x + outward.x * (8 + Math.random() * 18) + (Math.random() - 0.5) * 16,
      y: edgeStart.y + outward.y * (8 + Math.random() * 18) + (Math.random() - 0.5) * 16,
      alpha: 0,
      scale: textures ? 0.014 : 0.18,
      duration: 0.55 + Math.random() * 0.36,
      delay: Math.random() * 0.16,
      ease: 'power3.out',
      onStart: () => { p.alpha = particleState.alpha; },
      onUpdate: () => {
        p.x = particleState.x;
        p.y = particleState.y;
        p.alpha = particleState.alpha;
        p.scale.set(particleState.scale);
      },
      onComplete: () => p.destroy(),
    }));
  }

  tweens.push(gsap.delayedCall(1.05, () => {
    motes.destroy();
    corners.destroy();
  }));
}

type TickerCleanup = () => void;
type LiveVfxParticle = {
  particle: Particle;
  ageMs: number;
  lifeMs: number;
  vx: number;
  vy: number;
  spin: number;
  startScale: number;
  endScale: number;
  delayMs: number;
  alpha: number;
};

function renderPixiProjectileEmitter({
  add,
  app,
  tweens,
  start,
  end,
  dist,
  palette,
  event,
  textures,
  profile,
  registerCleanup,
}: {
  add: PixiAdd;
  app: Application;
  tweens: gsap.core.Tween[];
  start: PixiPoint;
  end: PixiPoint;
  dist: number;
  palette: PixiPalette;
  event: BattleEvent;
  textures: BattleVfxTextures;
  profile: ProjectileVfxProfile;
  registerCleanup: (cleanup: TickerCleanup) => void;
}) {
  const beamPalette = palette;
  const rawAngleOffsetDeg = event.vfxAngleOffsetDeg ?? event.vfx_angle_offset_deg ?? 0;
  const angleOffsetDeg = Number.isFinite(Number(rawAngleOffsetDeg)) ? Number(rawAngleOffsetDeg) : 0;
  const aim = projectileAimBasis(start, end, angleOffsetDeg);
  const effectDx = aim.dir.x * dist;
  const effectDy = aim.dir.y * dist;
  const effectNormal = aim.normal;
  const beamSequenceKey = profile.beamSequenceKey ?? 'projectileBeam';
  const beamSequenceFrames = textures.projectileSequenceFrames[beamSequenceKey] ?? textures.projectileBeamFrames;
  const useBeamSequence = profile.beamAnimation === 'projectile-beam-sequence' && beamSequenceFrames.length > 0;
  const initialBeamTexture = useBeamSequence
    ? beamSequenceFrames[0]
    : projectileBeamTexture(textures, profile.beamTextureKey);
  let currentBeamFrameIndex = -1;
  const plan = createFastProjectilePlan(dist, profile);
  const core = add(new Graphics(), 6);
  const bloom = add(new Graphics(), 5);
  const source = add(new Graphics(), 4);
  const beamBloom = add(new Sprite(initialBeamTexture), 8);
  const beam = add(new Sprite(initialBeamTexture), 9);
  const particleLayer = add(new ParticleContainer<Particle>({
    dynamicProperties: {
      position: true,
      rotation: true,
      vertex: true,
      uvs: true,
      color: true,
    },
    texture: textures.sparkA,
  }), 7);
  const smokeLayer = add(new ParticleContainer<Particle>({
    dynamicProperties: {
      position: true,
      rotation: true,
      vertex: true,
      uvs: true,
      color: true,
    },
    texture: textures.smokeA,
  }), 6);
  const shardLayer = add(new ParticleContainer<Particle>({
    dynamicProperties: {
      position: true,
      rotation: true,
      vertex: true,
      uvs: true,
      color: true,
    },
    texture: textures.sparkB,
  }), 8);
  const activeParticles: LiveVfxParticle[] = [];
  const allParticles: Particle[] = [];
  const sourceState = { alpha: 1, radius: 10 };
  const totalMs = plan.flightDurationMs + plan.beamLingerMs + 320;
  let elapsedMs = 0;
  let emitterBudget = plan.emitterParticleCount;
  let emitterAccumulator = 0;
  let impactDone = false;
  let disposed = false;

  core.blendMode = bloom.blendMode = source.blendMode = particleLayer.blendMode = smokeLayer.blendMode = shardLayer.blendMode = 'add';
  beamBloom.blendMode = useBeamSequence ? projectileBeamSequence.blendMode : 'add';
  beam.blendMode = useBeamSequence ? projectileBeamSequence.blendMode : 'add';
  bloom.filters = [new BlurFilter({ strength: 3 })];
  source.filters = [new BlurFilter({ strength: 2 })];
  beamBloom.anchor.set(0.96, 0.5);
  beamBloom.alpha = 0;
  beamBloom.tint = 0xffffff;
  beamBloom.scale.set(0.01, 0.12);
  beam.anchor.set(0.94, 0.5);
  beam.alpha = 0;
  beam.tint = 0xffffff;
  beam.scale.set(0.01, 0.12);

  const updateBeamSequenceTexture = (progress: number) => {
    if (!useBeamSequence) return;
    const baseFrameIndex = projectileBeamSequenceFrameIndex(progress);
    const [firstFrame, lastFrame] = profile.beamSequenceFrameRange ?? [0, projectileBeamSequence.frameCount - 1];
    const frameSpan = Math.max(1, Math.min(projectileBeamSequence.frameCount - 1, lastFrame) - Math.max(0, firstFrame) + 1);
    const normalizedFrameProgress = baseFrameIndex / Math.max(1, projectileBeamSequence.frameCount - 1);
    const frameIndex = Math.max(0, firstFrame) + Math.min(frameSpan - 1, Math.floor(normalizedFrameProgress * frameSpan));
    if (frameIndex === currentBeamFrameIndex) return;
    currentBeamFrameIndex = frameIndex;
    const frameTexture = beamSequenceFrames[frameIndex] ?? initialBeamTexture;
    beam.texture = frameTexture;
    beamBloom.texture = frameTexture;
  };

  const createParticle = (container: ParticleContainer<Particle>, texture: Texture, point: PixiPoint, velocity: PixiPoint, lifeMs: number, scale: number, alpha: number, delayMs = 0) => {
    const particle = new Particle({
      texture,
      x: point.x,
      y: point.y,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: scale,
      scaleY: scale,
      rotation: Math.random() * Math.PI * 2,
      tint: Math.random() > 0.42 ? beamPalette.hot : beamPalette.core,
      alpha: delayMs > 0 ? 0 : alpha,
    });
    container.addParticle(particle);
    allParticles.push(particle);
    activeParticles.push({
      particle,
      ageMs: 0,
      lifeMs,
      vx: velocity.x,
      vy: velocity.y,
      spin: (Math.random() - 0.5) * 0.018,
      startScale: scale,
      endScale: Math.max(0.004, scale * 0.18),
      delayMs,
      alpha,
    });
  };

  for (let i = 0; i < plan.particleCount; i += 1) {
    const pathT = 0.06 + Math.random() * 0.72;
    const p = linePoint(start, end, pathT);
    const side = Math.random() > 0.5 ? 1 : -1;
    const textureKey = profile.textureMix[i % profile.textureMix.length];
    createParticle(
      particleLayer,
      vfxTexture(textures, textureKey),
      {
        x: p.x - effectDx * 0.02 * Math.random(),
        y: p.y - effectDy * 0.02 * Math.random(),
      },
      {
        x: effectNormal.x * side * (0.035 + Math.random() * 0.065) * profile.scatter - effectDx * 0.00008,
        y: effectNormal.y * side * (0.035 + Math.random() * 0.065) * profile.scatter - effectDy * 0.00008,
      },
      95 + Math.random() * 80,
      (0.018 + Math.random() * 0.022) * profile.particleScale,
      0.46 + Math.random() * 0.26,
      (pathT * plan.flightDurationMs) * 0.72
    );
  }

  const emitFlightParticle = (headT: number, headPoint: PixiPoint) => {
    if (emitterBudget <= 0) return;
    emitterBudget -= 1;
    const side = Math.random() > 0.5 ? 1 : -1;
    const backT = Math.max(0, headT - Math.random() * plan.trailFraction * 0.72);
    const p = linePoint(start, end, backT);
    const textureKey = profile.textureMix[(emitterBudget + Math.floor(Math.random() * profile.textureMix.length)) % profile.textureMix.length];
    const lateral = (Math.random() - 0.5) * profile.emitterJitter * 18;
    const backDrift = 0.012 + Math.random() * 0.026;
    createParticle(
      particleLayer,
      vfxTexture(textures, textureKey),
      {
        x: p.x + effectNormal.x * lateral,
        y: p.y + effectNormal.y * lateral,
      },
      {
        x: effectNormal.x * side * (0.018 + Math.random() * 0.052) * profile.scatter - effectDx * backDrift * 0.01,
        y: effectNormal.y * side * (0.018 + Math.random() * 0.052) * profile.scatter - effectDy * backDrift * 0.01,
      },
      72 + Math.random() * 92,
      (0.014 + Math.random() * 0.026) * profile.particleScale,
      0.58 + Math.random() * 0.32
    );
    if (Math.random() > 0.72) {
      createParticle(
        particleLayer,
        vfxTexture(textures, textureKey),
        {
          x: headPoint.x - effectDx * (0.006 + Math.random() * 0.012) + effectNormal.x * lateral * 0.42,
          y: headPoint.y - effectDy * (0.006 + Math.random() * 0.012) + effectNormal.y * lateral * 0.42,
        },
        {
          x: -effectDx * 0.00014 + effectNormal.x * side * 0.018,
          y: -effectDy * 0.00014 + effectNormal.y * side * 0.018,
        },
        58 + Math.random() * 60,
        (0.01 + Math.random() * 0.018) * profile.particleScale,
        0.72 + Math.random() * 0.2
      );
    }
  };

  tweens.push(gsap.to(sourceState, {
    alpha: 0,
    radius: 34,
    duration: 0.16,
    ease: 'power4.out',
  }));

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    app.ticker.remove(update);
    allParticles.forEach((particle) => {
      if (particleLayer.particleChildren.includes(particle)) particleLayer.removeParticle(particle);
      if (smokeLayer.particleChildren.includes(particle)) smokeLayer.removeParticle(particle);
      if (shardLayer.particleChildren.includes(particle)) shardLayer.removeParticle(particle);
    });
    particleLayer.destroy();
    smokeLayer.destroy();
    shardLayer.destroy();
    core.destroy();
    bloom.destroy();
    source.destroy();
    beamBloom.destroy();
    beam.destroy();
  };

  const spawnImpact = () => {
    if (impactDone) return;
    impactDone = true;
    renderPixiImpact(add, tweens, end, palette, event, 0, textures, plan, profile, profile.impactDirectionalCut ?? true);
    for (let i = 0; i < profile.shardCount; i += 1) {
      const angle = (Math.PI * 2 * i) / profile.shardCount + (Math.random() - 0.5) * 0.18;
      const speed = (0.08 + Math.random() * 0.18) * profile.scatter;
      const textureKey = profile.textureMix[(i + 1) % profile.textureMix.length];
      createParticle(
        shardLayer,
        vfxTexture(textures, textureKey),
        {
          x: end.x + Math.cos(angle) * (4 + Math.random() * 8),
          y: end.y + Math.sin(angle) * (4 + Math.random() * 8),
        },
        {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        180 + Math.random() * 130,
        (0.022 + Math.random() * 0.034) * profile.particleScale,
        0.72 + Math.random() * 0.22
      );
    }
  };

  for (let i = 0; i < 8; i += 1) {
    const texture = textures.smokes[i % textures.smokes.length];
    const drift = (Math.random() - 0.5) * 0.08;
    createParticle(
      smokeLayer,
      texture,
      {
        x: start.x - effectDx * (0.014 + Math.random() * 0.018) + effectNormal.x * (Math.random() - 0.5) * profile.tailSmokeWidth,
        y: start.y - effectDy * (0.014 + Math.random() * 0.018) + effectNormal.y * (Math.random() - 0.5) * profile.tailSmokeWidth,
      },
      {
        x: -effectDx * 0.00005 + effectNormal.x * drift,
        y: -effectDy * 0.00005 + effectNormal.y * drift,
      },
      150 + Math.random() * 130,
      (profile.tailSmokeScale + Math.random() * 0.035) * profile.particleScale,
      0.14 + Math.random() * 0.12,
      Math.random() * plan.flightDurationMs * 0.35
    );
  }

  function update() {
    const deltaMs = app.ticker.deltaMS;
    elapsedMs += deltaMs;
    const postImpactMs = Math.max(0, elapsedMs - plan.flightDurationMs);
    const travelT = Math.min(1, elapsedMs / plan.flightDurationMs);
    const headT = projectileHeadProgress(travelT);
    const headPoint = linePoint(start, end, headT);
    const angle = aim.angle;
    const trail = projectileTrailWindow(headT, plan);

    if (elapsedMs >= plan.flightDurationMs && !impactDone) {
      spawnImpact();
    }

    source.clear();
    drawGlowCircle(source, start.x, start.y, 8 + sourceState.radius, beamPalette.core, sourceState.alpha * 0.18);
    drawGlowCircle(source, start.x, start.y, 7, beamPalette.hot, sourceState.alpha * 0.5);

    core.clear();
    bloom.clear();
    if (!impactDone && elapsedMs <= plan.flightDurationMs + plan.beamLingerMs) {
      updateBeamSequenceTexture(travelT);
      const visibleLength = Math.min(dist * Math.max(0.94, profile.beamTrailFraction), dist * headT + 120);
      const beamFade = postImpactMs > 0 ? Math.max(0, 1 - postImpactMs / plan.beamLingerMs) : 1;
      const beamAlpha = Math.min(1, travelT / 0.07) * beamFade;
      const useFixedSequenceFrame = useBeamSequence && profile.beamSequenceMode === 'fixed-frame';
      const distanceScale = useFixedSequenceFrame ? Math.max(0.86, Math.min(1.08, dist / 520)) : 1;
      const sequenceReveal = useFixedSequenceFrame ? projectileSequenceReveal(headT) : { scaleX: 1, scaleY: 1 };
      const sequenceBaseScale = (profile.beamSequenceScale ?? 0.58) * distanceScale;
      const sequenceBloomBaseScale = (profile.beamSequenceBloomScale ?? (profile.beamSequenceScale ?? 0.58) * 1.16) * distanceScale;
      const sequenceBloomAlpha = profile.beamSequenceBloomAlpha ?? 0.38;
      const beamScaleX = useFixedSequenceFrame
        ? sequenceBaseScale * sequenceReveal.scaleX
        : visibleLength / Math.max(1, beam.texture.width);
      const beamScaleY = useFixedSequenceFrame
        ? sequenceBaseScale * sequenceReveal.scaleY
        : (0.24 + Math.min(1, dist / 760) * 0.075) * profile.beamThicknessScale;
      const bloomScaleX = sequenceBloomBaseScale * sequenceReveal.scaleX;
      const bloomScaleY = sequenceBloomBaseScale * sequenceReveal.scaleY;
      const beamStartT = Math.max(0, headT - visibleLength / dist);
      if (profile.vectorTrailAlpha > 0) {
        drawLineSegment(bloom, start, end, beamStartT, trail.endT, beamPalette.core, profile.bloomWidth * 1.25, 0.24 * beamAlpha * profile.vectorTrailAlpha);
        drawLineSegment(core, start, end, beamStartT, trail.endT, beamPalette.dark, profile.coreWidth + 8, 0.34 * beamAlpha * profile.vectorTrailAlpha);
        drawLineSegment(core, start, end, beamStartT, trail.endT, beamPalette.core, Math.max(5, profile.coreWidth * 0.95), 0.68 * beamAlpha * profile.vectorTrailAlpha);
        drawLineSegment(core, start, end, Math.max(beamStartT, headT - 0.22), trail.endT, beamPalette.hot, 3.6, 0.94 * beamAlpha * profile.vectorTrailAlpha);
      }
      if (profile.vectorHeadAlpha > 0) {
        drawBeamHead(core, headPoint, angle, effectNormal, beamPalette, profile);
      }
      beamBloom.x = headPoint.x;
      beamBloom.y = headPoint.y;
      beamBloom.rotation = angle;
      beamBloom.alpha = sequenceBloomAlpha * beamAlpha;
      beamBloom.scale.set(
        useFixedSequenceFrame ? bloomScaleX : beamScaleX * 1.12,
        useFixedSequenceFrame ? bloomScaleY : beamScaleY * 1.24,
      );
      beam.x = headPoint.x;
      beam.y = headPoint.y;
      beam.rotation = angle;
      beam.alpha = 0.98 * beamAlpha;
      beam.scale.set(
        useFixedSequenceFrame ? beamScaleX : beamScaleX * 1.04,
        useFixedSequenceFrame ? beamScaleY : beamScaleY * 0.96,
      );
    } else {
      beamBloom.alpha = 0;
      beam.alpha = 0;
    }

    if (elapsedMs <= plan.flightDurationMs && emitterBudget > 0) {
      emitterAccumulator += profile.emitterRate * (deltaMs / 16.67);
      while (emitterAccumulator >= 1 && emitterBudget > 0) {
        emitFlightParticle(headT, headPoint);
        emitterAccumulator -= 1;
      }
    }

    for (let i = activeParticles.length - 1; i >= 0; i -= 1) {
      const live = activeParticles[i];
      if (live.delayMs > 0) {
        live.delayMs -= deltaMs;
        live.particle.alpha = 0;
        continue;
      }
      live.ageMs += deltaMs;
      const t = Math.min(1, live.ageMs / live.lifeMs);
      live.particle.x += live.vx * deltaMs;
      live.particle.y += live.vy * deltaMs;
      live.particle.rotation += live.spin * deltaMs;
      const scale = live.startScale + (live.endScale - live.startScale) * t;
      live.particle.scaleX = scale;
      live.particle.scaleY = scale;
      live.particle.alpha = live.alpha * projectileParticleAlpha(t * plan.trailFadeMs, plan);
      if (t >= 1) {
        activeParticles.splice(i, 1);
        if (particleLayer.particleChildren.includes(live.particle)) particleLayer.removeParticle(live.particle);
        if (smokeLayer.particleChildren.includes(live.particle)) smokeLayer.removeParticle(live.particle);
        if (shardLayer.particleChildren.includes(live.particle)) shardLayer.removeParticle(live.particle);
      }
    }

    if (elapsedMs >= totalMs) {
      cleanup();
    }
  }

  app.ticker.add(update);
  registerCleanup(cleanup);
}

function findBattleUnitElement(root: ParentNode, ref?: string | null) {
  if (!ref || ref === '-') return null;
  const normalized = ref.trim().toLowerCase();
  const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-battle-unit-tag]'));
  return elements.find((element) => {
    const tag = element.dataset.battleUnitTag?.trim().toLowerCase();
    const name = element.dataset.battleUnitName?.trim().toLowerCase();
    return tag === normalized || name === normalized || (ref.length === 1 && Boolean(tag?.startsWith(normalized)));
  }) ?? null;
}

function resolvePixiAnchors(host: HTMLDivElement, board: BattleBoardState, event: BattleEvent, width: number, height: number) {
  const fallback = eventAnchors(board, event);
  const root = host.parentElement ?? host;
  const actorElement = findBattleUnitElement(root, event.attacker);
  const targetElement = findBattleUnitElement(root, event.defender) ?? (event.actionType === 'stunned' ? actorElement : null);
  const hostRect = host.getBoundingClientRect();

  if (!actorElement || !targetElement) {
    const fallbackEnd = { x: width * fallback.to.x / 100, y: height * fallback.to.y / 100 };
    return {
      start: { x: width * fallback.from.x / 100, y: height * fallback.from.y / 100 },
      end: fallbackEnd,
      targetBox: { x: fallbackEnd.x - 72, y: fallbackEnd.y - 100, width: 144, height: 200 },
      selfTarget: fallback.selfTarget,
    };
  }

  const actorRect = actorElement.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();
  const targetHitboxRect = targetElement.querySelector<HTMLElement>('[data-battle-unit-hitbox]')?.getBoundingClientRect();
  const renderSize = { width, height };
  const actorCenterX = actorRect.left + actorRect.width / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const actorToRight = targetCenterX >= actorCenterX;
  const start = pointInHost({
    x: actorToRight ? actorRect.right - actorRect.width * 0.18 : actorRect.left + actorRect.width * 0.18,
    y: actorRect.top + actorRect.height * 0.34,
  }, hostRect, renderSize);
  const end = targetHitPointInHost(targetRect, hostRect, targetHitboxRect, renderSize);
  const targetBox = rectInHost(targetRect, hostRect, renderSize);

  return {
    start: {
      x: Math.max(0, Math.min(width, start.x)),
      y: Math.max(0, Math.min(height, start.y)),
    },
    end: {
      x: Math.max(0, Math.min(width, end.x)),
      y: Math.max(0, Math.min(height, end.y)),
    },
    targetBox: {
      x: Math.max(0, Math.min(width, targetBox.x)),
      y: Math.max(0, Math.min(height, targetBox.y)),
      width: Math.max(1, Math.min(width, targetBox.width)),
      height: Math.max(1, Math.min(height, targetBox.height)),
    },
    selfTarget: fallback.selfTarget,
  };
}

type FloatingTextAnchor = {
  x: number;
  y: number;
};

function resolveFloatingTextAnchor(host: HTMLDivElement, event: BattleEvent): FloatingTextAnchor | null {
  const root = host.parentElement ?? host;
  const targetElement = findBattleUnitElement(root, event.defender) ?? (event.actionType === 'stunned' ? findBattleUnitElement(root, event.attacker) : null);
  if (!targetElement) return null;

  const hostRect = host.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();
  const hitboxRect = targetElement.querySelector<HTMLElement>('[data-battle-unit-hitbox]')?.getBoundingClientRect();
  const anchorRect = hitboxRect ?? targetRect;

  return {
    x: anchorRect.left + anchorRect.width / 2 - hostRect.left,
    y: Math.max(82, targetRect.top - hostRect.top - 4),
  };
}

function BattleFloatingTextLayer({ event, disabled }: { event?: BattleEvent | null; disabled?: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<FloatingTextAnchor | null>(null);
  const label = eventAmountLabel(event);
  const shouldRender = Boolean(event && !disabled && label && label !== '0');
  const mode = eventVfxMode(event);
  const hitDelay = mode === 'projectile' ? 0.34 : 0.06;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !event || !shouldRender) {
      setAnchor(null);
      return;
    }

    const updateAnchor = () => setAnchor(resolveFloatingTextAnchor(host, event));
    updateAnchor();

    if (typeof window === 'undefined') return;
    window.addEventListener('resize', updateAnchor);
    return () => window.removeEventListener('resize', updateAnchor);
  }, [event, shouldRender]);

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-40 overflow-visible">
      <AnimatePresence>
        {event && shouldRender && anchor && (
          <div
            key={`floating-amount-${eventKey(event)}`}
            className="pointer-events-none absolute -translate-x-1/2"
            style={{ left: anchor.x, top: anchor.y }}
          >
            <motion.div
              initial={{ opacity: 0, y: 26, scale: event.isCrit ? 0.68 : 0.78 }}
              animate={{ opacity: [0, 1, 1, 0], y: [26, -6, -20, -50], scale: event.isCrit ? [0.68, 1.46, 1.16, 1] : [0.78, 1.18, 1.04, 0.96] }}
              exit={{ opacity: 0, y: -54, scale: 0.92 }}
              transition={{ duration: event.isCrit ? 1.12 : 0.94, delay: hitDelay, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'text-center font-display font-semibold leading-none tracking-normal [letter-spacing:0]',
                event.isCrit ? 'text-[56px]' : 'text-[46px]',
                event.heal > 0
                  ? 'text-emerald-50 [text-shadow:0_0_18px_rgba(110,231,183,0.95),0_4px_0_rgba(0,0,0,0.9),0_0_2px_rgba(255,255,255,0.95)]'
                  : event.isMiss
                    ? 'text-stone-50 [text-shadow:0_0_16px_rgba(231,229,228,0.82),0_4px_0_rgba(0,0,0,0.95)]'
                    : 'text-red-50 [text-shadow:0_0_18px_rgba(248,113,113,0.98),0_4px_0_rgba(0,0,0,0.95),0_0_2px_rgba(255,255,255,0.95)]'
              )}
            >
              {event.isCrit && event.damage > 0 && (
                <div className="mb-1 text-[15px] font-semibold uppercase tracking-[0.22em] text-[#fff1c8] [text-shadow:0_0_16px_rgba(216,176,108,0.95),0_2px_0_rgba(0,0,0,0.95)]">
                  Critical
                </div>
              )}
              {label}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BattleEffectLayer({ board, event, disabled }: { board: BattleBoardState; event?: BattleEvent | null; disabled?: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const layerRef = useRef<Container | null>(null);
  const texturesRef = useRef<BattleVfxTextures | null>(null);
  const tweensRef = useRef<gsap.core.Tween[]>([]);
  const tickerCleanupRef = useRef<TickerCleanup[]>([]);
  const [renderToken, setRenderToken] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let initialized = false;
    const app = new Application();
    appRef.current = app;

    void (async () => {
      await app.init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        preference: 'webgl',
      });
      const loadedEntries = await Promise.all(battleVfxTextureAssets.map(
        async (asset) => [asset.id, await Assets.load<Texture>(asset.src)] as const,
      ));
      initialized = true;
      if (disposed) {
        app.destroy(true);
        return;
      }
      texturesRef.current = createBattleVfxTextures(Object.fromEntries(loadedEntries));
      app.canvas.className = 'h-full w-full';
      host.appendChild(app.canvas);
      const layer = new Container();
      layer.sortableChildren = true;
      layerRef.current = layer;
      app.stage.addChild(layer);
      setRenderToken((value) => value + 1);
    })();

    return () => {
      disposed = true;
      tickerCleanupRef.current.forEach((cleanup) => cleanup());
      tickerCleanupRef.current = [];
      tweensRef.current.forEach((tween) => tween.kill());
      tweensRef.current = [];
      layerRef.current = null;
      texturesRef.current = null;
      appRef.current = null;
      if (initialized) {
        app.destroy(true);
      }
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    const layer = layerRef.current;
    const host = hostRef.current;
    if (!app || !layer || !host || disabled || !event) {
      tickerCleanupRef.current.forEach((cleanup) => cleanup());
      tickerCleanupRef.current = [];
      tweensRef.current.forEach((tween) => tween.kill());
      tweensRef.current = [];
      layer?.removeChildren().forEach((child) => child.destroy({ children: true }));
      return;
    }

    tweensRef.current.forEach((tween) => tween.kill());
    tweensRef.current = [];
    tickerCleanupRef.current.forEach((cleanup) => cleanup());
    tickerCleanupRef.current = [];
    layer.removeChildren().forEach((child) => child.destroy({ children: true }));

    const mode = eventVfxMode(event);
    const tone = eventVfxTone(event);
    const palette = pixiPalette(tone);
    const profile = createProjectileVfxProfile(event);
    const textures = texturesRef.current ?? undefined;
    const hostRect = host.getBoundingClientRect();
    const width = hostRect.width;
    const height = hostRect.height;
    const { start, end, targetBox, selfTarget } = resolvePixiAnchors(host, board, event, width, height);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.max(1, Math.hypot(dx, dy));

    const add: PixiAdd = <T extends Container | Graphics | Text | Sprite>(node: T, zIndex = 1) => {
      node.zIndex = zIndex;
      layer.addChild(node);
      return node;
    };

    const pulse = add(new Graphics(), 1);
    pulse.blendMode = 'add';
    pulse.filters = [new BlurFilter({ strength: 4 })];
    drawGlowCircle(pulse, start.x, start.y, 20, palette.core, 0.5);
    tweensRef.current.push(gsap.to(pulse, {
      alpha: 0,
      duration: 0.52,
      ease: 'power3.out',
      onUpdate: () => {
        pulse.clear();
        drawGlowCircle(pulse, start.x, start.y, 24 + (1 - pulse.alpha) * 80, palette.core, pulse.alpha * 0.5);
      },
      onComplete: () => pulse.destroy(),
    }));

    if (mode === 'buff') {
      renderPixiBuff(add, tweensRef.current, end, targetBox, palette, event, textures);
      return;
    }

    if (mode === 'projectile' && !selfTarget && textures) {
      renderPixiProjectileEmitter({
        add,
        app,
        tweens: tweensRef.current,
        start,
        end,
        dist,
        palette,
        event,
        textures,
        profile,
        registerCleanup: (cleanup) => {
          tickerCleanupRef.current.push(cleanup);
        },
      });
    } else if (mode === 'projectile' && !selfTarget) {
      renderPixiImpact(add, tweensRef.current, end, palette, event, 0, undefined, createFastProjectilePlan(dist, profile), profile);
    } else {
      renderPixiInstant(add, tweensRef.current, end, palette, event, textures, profile);
    }

    return () => {
      tweensRef.current.forEach((tween) => tween.kill());
      tweensRef.current = [];
      tickerCleanupRef.current.forEach((cleanup) => cleanup());
      tickerCleanupRef.current = [];
    };
  }, [board, disabled, event, renderToken]);

  return <div ref={hostRef} className="pointer-events-none absolute inset-0 z-30 overflow-hidden" />;
}

function BattleLogPanel({ events, logs, currentEvent, orderBoard, started }: { events: BattleEvent[]; logs: string[]; currentEvent?: BattleEvent | null; orderBoard: BattleBoardState; started: boolean }) {
  const recentEvents = events.slice(-2).reverse();
  const recentLogs = logs.slice(-3).reverse();
  return (
    <div className="grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)]">
      <div className="border border-[#2b241b] bg-black/40 p-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.28em] text-[#b49664]">Battle Log</div>
          <Sparkles size={14} className="text-stone-600" />
        </div>
        <div className="mt-3 space-y-1.5">
          {recentLogs.length ? recentLogs.map((log, index) => (
            <div key={`${log}-${index}`} className="line-clamp-1 text-[11px] leading-5 text-stone-500">{log}</div>
          )) : (
            <div className="text-[11px] leading-5 text-stone-600">Preparation phase initiated.</div>
          )}
        </div>
      </div>

      <ActionRail board={orderBoard} currentEvent={currentEvent} started={started} />

      <div className="xl:col-span-2">
        {recentEvents.length ? (
          <div className="grid gap-2 lg:grid-cols-2">
            <AnimatePresence initial={false}>
              {recentEvents.map((event, index) => (
                <motion.div
                  key={`${event.round}-${event.attacker}-${event.defender}-${index}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={cn('border px-3 py-2 text-xs', actionTone(event))}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate uppercase tracking-[0.18em]">{event.attacker}</span>
                    <span className="shrink-0 text-xs text-stone-500">R{event.round}</span>
                  </div>
                  <div className="mt-1 line-clamp-1 leading-5 text-stone-300">{event.log}</div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="border border-dashed border-[#2b241b] bg-black/30 px-4 py-3 text-xs text-stone-600">Combat events will populate this feed when the battle resolves.</div>
        )}
      </div>
    </div>
  );
}

function ArenaStage({
  board,
  currentEvent,
  totalRounds,
  reducedMotion,
  editUnitSlots,
  onUnitSlotChange,
}: {
  board: BattleBoardState;
  currentEvent?: BattleEvent | null;
  totalRounds: number;
  reducedMotion?: boolean;
  editUnitSlots?: boolean;
  onUnitSlotChange?: (unitTag: string, slot: number) => void;
}) {
  return (
    <section className="relative min-h-[480px] overflow-hidden border border-[#2b241b] bg-[#050505] pb-6 sm:min-h-[590px] sm:pb-9 lg:min-h-[clamp(720px,78vh,820px)] lg:pb-12">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-80"
        style={{
          backgroundImage: `url(${arenaHallPerspective})`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(216,176,108,0.14),transparent_24%),radial-gradient(circle_at_50%_58%,rgba(216,176,108,0.16),transparent_28%),linear-gradient(180deg,rgba(0,0,0,0.2),rgba(0,0,0,0.34)_48%,rgba(0,0,0,0.78)_100%)]" />
      <div className="pointer-events-none absolute inset-x-[7%] top-[96px] bottom-[46px] border-y border-[#b49664]/12 bg-[radial-gradient(circle_at_50%_54%,rgba(216,176,108,0.08),transparent_34%)] shadow-[inset_0_0_90px_rgba(0,0,0,0.72)]" />
      <div className="pointer-events-none absolute bottom-[86px] left-1/2 top-[122px] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-[#d8b06c]/56 to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-[53%] h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#b49664]/22 shadow-[inset_0_0_28px_rgba(216,176,108,0.1),0_0_42px_rgba(216,176,108,0.08)]" />
      <BattleEffectLayer board={board} event={currentEvent} disabled={reducedMotion} />
      <BattleFloatingTextLayer event={currentEvent} disabled={reducedMotion} />

      <div className="relative z-10 min-h-20 px-3 pt-4 sm:px-6 sm:pt-5">
        <div className="absolute left-3 top-4 hidden sm:block sm:left-6 sm:top-5">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-600">Round</div>
          <div className="mt-1 text-xl font-light text-stone-100">{board.round}</div>
        </div>
        <div className="absolute left-1/2 top-5 -translate-x-1/2 text-center">
          <div className="text-[10px] uppercase tracking-[0.34em] text-stone-500">Round {board.round} / {Math.max(board.round, totalRounds)}</div>
          <div className="mt-1 max-w-[220px] truncate font-display text-lg font-light uppercase tracking-[0.2em] text-[#e3c589] sm:max-w-none sm:text-2xl sm:tracking-[0.28em]">
            {currentEvent?.skillName ?? (currentEvent?.actionType === 'attack' ? 'Basic Attack' : 'Combat')}
          </div>
          {currentEvent?.typeCatalog && currentEvent?.typeEffect ? (
            <div className="mt-1 text-[9px] uppercase tracking-[0.24em] text-stone-500">{currentEvent.typeCatalog} / {currentEvent.typeEffect}</div>
          ) : null}
          <div className="mx-auto mt-2 h-px w-36 bg-gradient-to-r from-transparent via-[#b49664] to-transparent sm:w-52" />
        </div>
      </div>

      <div className="relative z-10 mx-auto mt-3 grid w-full max-w-[980px] grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)] items-center gap-1 px-1 pb-6 sm:mt-5 sm:grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)] sm:gap-2 sm:px-3 md:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] md:gap-4 lg:mt-7 lg:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] lg:gap-8 lg:px-6 lg:pb-10 2xl:max-w-[1040px] 2xl:gap-12">
        <FormationGrid
          units={board.bottom}
          side="forger"
          currentEvent={currentEvent}
          editUnitSlots={editUnitSlots}
          onUnitSlotChange={onUnitSlotChange}
        />
        <div className="flex min-h-[345px] flex-col items-center justify-center sm:min-h-[452px] md:min-h-[540px] lg:min-h-[628px] 2xl:min-h-[688px]">
          <div className="h-20 w-px bg-gradient-to-b from-transparent via-[#b49664]/46 to-transparent sm:h-24 lg:h-32" />
          <div className="relative my-3 flex h-8 w-8 items-center justify-center sm:my-4 sm:h-12 sm:w-12 md:h-16 md:w-16 lg:my-5 lg:h-28 lg:w-28">
            <div className="pointer-events-none absolute inset-0 rounded-full border border-[#b49664]/18 shadow-[inset_0_0_24px_rgba(216,176,108,0.08),0_0_34px_rgba(216,176,108,0.08)]" />
            <div className="pointer-events-none absolute inset-4 rounded-full border border-[#b49664]/10" />
            <div className="font-display text-sm font-light tracking-[0.08em] text-[#d8b06c]/90 sm:text-lg lg:text-3xl">VS</div>
          </div>
          <div className="h-20 w-px bg-gradient-to-b from-transparent via-[#b49664]/46 to-transparent sm:h-24 lg:h-32" />
        </div>
        <FormationGrid
          units={board.top}
          side="rival"
          currentEvent={currentEvent}
          editUnitSlots={editUnitSlots}
          onUnitSlotChange={onUnitSlotChange}
        />
      </div>
    </section>
  );
}

export function ArenaBattleScene({
  board,
  events,
  logs,
  result,
  autoStartKey,
  showCommanders = true,
  editUnitSlots = false,
  onUnitSlotChange,
}: ArenaBattleSceneProps) {
  const [eventIndex, setEventIndex] = useState(-1);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (!media) return;

    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
      if (event.matches) setIsPlaying(false);
    };

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (reducedMotion || !isPlaying || events.length <= 1) return;
    const timer = window.setInterval(() => {
      setEventIndex((current) => {
        if (current >= events.length - 1) {
          window.clearInterval(timer);
          setIsPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, PLAYBACK_STEP_MS);

    return () => window.clearInterval(timer);
  }, [events.length, isPlaying, reducedMotion]);

  useEffect(() => {
    if (autoStartKey === undefined || !events.length) return;
    setEventIndex(reducedMotion ? events.length - 1 : 0);
    setIsPlaying(!reducedMotion && events.length > 1);
  }, [autoStartKey, events.length, reducedMotion]);

  const started = eventIndex >= 0;
  const safeEventIndex = events.length && started ? Math.min(eventIndex, events.length - 1) : -1;
  const currentEvent = safeEventIndex >= 0 ? events[safeEventIndex] ?? null : null;
  const currentRound = currentEvent?.round ?? board.round;
  const boardHistory = useMemo(() => result.boardHistory?.length ? result.boardHistory : [board], [board, result.boardHistory]);
  const playbackBoard = useMemo(() => {
    if (!started) return boardHistory[0] ?? board;
    const indexedBoard = boardHistory[Math.min(Math.max(safeEventIndex, 0), boardHistory.length - 1)];
    if (indexedBoard) return indexedBoard;
    const eligibleBoards = boardHistory.filter((entry) => entry.round <= currentRound);
    return eligibleBoards[eligibleBoards.length - 1] ?? boardHistory[0] ?? board;
  }, [board, boardHistory, currentRound, events.length, safeEventIndex, started]);
  const visibleEvents = useMemo(() => (started ? events.slice(0, safeEventIndex + 1) : []), [events, safeEventIndex, started]);
  const visibleLogs = useMemo(() => {
    if (!started) return [];
    const eventLogs = visibleEvents.map((event) => event.log).filter(Boolean);
    return eventLogs.length ? eventLogs : logs;
  }, [logs, started, visibleEvents]);
  const totalRounds = useMemo(() => {
    const eventMax = events.reduce((max, event) => Math.max(max, event.round), 0);
    const boardMax = boardHistory.reduce((max, entry) => Math.max(max, entry.round), 0);
    return Math.max(board.round, eventMax, boardMax);
  }, [board.round, boardHistory, events]);

  const startPlayback = () => {
    if (!events.length) return;
    setEventIndex(reducedMotion ? events.length - 1 : 0);
    setIsPlaying(!reducedMotion && events.length > 1);
  };

  const restartPlayback = () => {
    setEventIndex(-1);
    setIsPlaying(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-stretch justify-between gap-3 border border-[#2b241b] bg-black/30 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.28em] text-[#b49664]">Battle Control</div>
          <div className="mt-1 truncate text-xs text-stone-500">
            {currentEvent ? `${eventActionLabel(currentEvent)} - ${currentEvent.attacker} to ${currentEvent.defender}` : events.length ? 'Ready. Start battle to execute the resolved combat feed.' : 'No combat feed generated.'}
          </div>
          <div className="hidden">
            {currentEvent ? `${eventActionLabel(currentEvent)} · ${currentEvent.attacker} to ${currentEvent.defender}` : 'Waiting for combat feed'}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <div className="hidden text-[10px] uppercase tracking-[0.2em] text-stone-600 sm:block">
            {started && events.length ? safeEventIndex + 1 : 0} / {events.length}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!started) {
                startPlayback();
                return;
              }
              setIsPlaying((value) => !value);
            }}
            disabled={!events.length || (started && reducedMotion)}
            className="flex h-11 items-center justify-center gap-2 border border-white/10 bg-black/45 px-4 text-[10px] uppercase tracking-[0.18em] text-stone-300 transition hover:border-[#b49664]/45 hover:text-[#f0d8ad] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={isPlaying ? 'Pause battle playback' : 'Play battle playback'}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            <span>{!started ? 'Start Battle' : isPlaying ? 'Pause' : 'Play'}</span>
          </button>
          <button
            type="button"
            onClick={restartPlayback}
            disabled={!started}
            className="flex h-11 w-11 items-center justify-center border border-white/10 bg-black/45 text-stone-300 transition hover:border-[#b49664]/45 hover:text-[#f0d8ad] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Restart battle playback"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
      {showCommanders ? (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[260px_minmax(0,1fr)_260px]">
          <div className="order-2 min-w-0 2xl:order-1">
            <CommanderPanel label={playbackBoard.bottomLabel} units={playbackBoard.bottom} side="forger" />
          </div>
          <div className="order-1 min-w-0 lg:col-span-2 2xl:order-2 2xl:col-span-1">
            <ArenaStage
              board={playbackBoard}
              currentEvent={currentEvent}
              totalRounds={totalRounds}
              reducedMotion={reducedMotion}
              editUnitSlots={editUnitSlots}
              onUnitSlotChange={onUnitSlotChange}
            />
          </div>
          <div className="order-3 min-w-0">
            <CommanderPanel label={playbackBoard.topLabel} units={playbackBoard.top} side="rival" />
          </div>
        </div>
      ) : (
        <ArenaStage
          board={playbackBoard}
          currentEvent={currentEvent}
          totalRounds={totalRounds}
          reducedMotion={reducedMotion}
          editUnitSlots={editUnitSlots}
          onUnitSlotChange={onUnitSlotChange}
        />
      )}
      <BattleLogPanel events={visibleEvents} logs={visibleLogs} currentEvent={currentEvent} orderBoard={playbackBoard} started={started} />
    </div>
  );
}
