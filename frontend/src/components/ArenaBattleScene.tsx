import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { gsap } from 'gsap';
import { Application, Assets, BlurFilter, Container, Graphics, Particle, ParticleContainer, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { Crown, Pause, Play, RotateCcw, Shield, Skull, Sparkles } from 'lucide-react';
import arenaHallPerspective from '../assets/battle/arena-hall-perspective.png';
import { CARD_FALLBACK_SRC } from '../lib/cards';
import {
  blackBackedVfxAlphaForLuminance,
  battleVfxTextureAssets,
  instantHitSequence,
  instantHitSequenceAssetFiles,
  instantHitSequenceAssetId,
  instantHitSequenceFrameIndex,
  instantHitSequenceFrameRect,
  instantHitFrameAnchorFromRgba,
  instantHitVfxAlphaForLuminance,
  projectileBeamSequence,
  projectileBeamSequenceFrameRect,
  projectileFrameCenterAnchorYFromRgba,
  projectileFrameTipAnchorFromRgba,
} from '../lib/battleVfxAssets';
import { resolveBattleVfxDescriptor, type BattleVfxMode, type BattleVfxTone } from '../lib/battleVfxCatalog';
import {
  BATTLE_BUFF_DISPLAY,
  activeBattleBuffKeys,
  battleBuffKeyForName,
  dominantBattleBuffKey,
  type BattleBuffBehavior,
  type BattleBuffKey,
} from '../lib/battleBuffDisplay';
import {
  battleDebrisLingerRecipe,
  battleDebrisRecipeForEvent,
  type BattleDebrisRecipe,
} from '../lib/battleVfxDebris';
import type { BattleBoardState, BattleBoardUnit, BattleEvent, BattleResult } from '../lib/battleTypes';
import {
  createFastProjectilePlan,
  createImpactVfxPlan,
  createBuffBorderVfxPlan,
  createProjectileVfxProfile,
  instantHitSequenceKeyForEvent,
  projectileAimBasis,
  projectileBodyEnvelope,
  projectileBodyRenderScale,
  projectileFlightFrameIndex,
  projectileHeadProgress,
  projectileParticleAlpha,
  projectilePathSample,
  projectileTrailSegments,
  pointInHost,
  rectInHost,
  sourceCastPointInHost,
  targetHitPointInHost,
  type ImpactVfxPlan,
  type ProjectileVfxImpactTextureKey,
  type ProjectileVfxInstantTextureKey,
  type ProjectileVfxProfile,
  type ProjectileVfxSequenceTextureKey,
  type ProjectileVfxTextureKey,
} from '../lib/battleVfxParticlePlan';
import type { InstantHitSequenceKey } from '../lib/battleVfxAssets';
import { cn } from '../lib/utils';

type ArenaBattleSceneProps = {
  board: BattleBoardState;
  events: BattleEvent[];
  logs: string[];
  result: BattleResult;
  autoStartKey?: string | number;
  showCommanders?: boolean;
  showResultReveal?: boolean;
  editUnitSlots?: boolean;
  onUnitSlotChange?: (unitTag: string, slot: number) => void;
};

export type BattleOutcome = 'victory' | 'defeat' | 'draw';

function normalizedOutcomeLabel(value?: string | null) {
  return String(value ?? '').trim().toLowerCase();
}

export function battleOutcomeForBottom(result: BattleResult, board: BattleBoardState): BattleOutcome {
  const winner = normalizedOutcomeLabel(result.winner);
  const winnerLabel = normalizedOutcomeLabel(result.winnerLabel);
  if (winner === 'tie' || winnerLabel === 'tie' || winner === 'draw' || winnerLabel === 'draw') return 'draw';
  if (winner === 'a') return 'victory';
  if (winner === 'b') return 'defeat';

  const bottomLabel = normalizedOutcomeLabel(board.bottomLabel);
  const topLabel = normalizedOutcomeLabel(board.topLabel);
  if (bottomLabel && (winner === bottomLabel || winnerLabel === bottomLabel)) return 'victory';
  if (topLabel && (winner === topLabel || winnerLabel === topLabel)) return 'defeat';
  if (Number.isFinite(result.finalHpA) && Number.isFinite(result.finalHpB)) {
    if ((result.finalHpA ?? 0) === (result.finalHpB ?? 0)) return 'draw';
    return (result.finalHpA ?? 0) > (result.finalHpB ?? 0) ? 'victory' : 'defeat';
  }
  return 'draw';
}

export function battlePlaybackHistoryIndex(historyLength: number, eventLength: number, eventIndex: number) {
  if (historyLength <= 0 || eventIndex < 0) return -1;
  const includesInitialSnapshot = historyLength > eventLength;
  return Math.min(historyLength - 1, eventIndex + (includesInitialSnapshot ? 1 : 0));
}

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

/**
 * EXPERIMENT: projectile trail rendering.
 * 'particles' — smoky spark ribbon spawned along the flight path.
 * 'strokes'  — the original drawn line-segment trail (revert to this to undo).
 */
const PROJECTILE_TRAIL_MODE: 'strokes' | 'particles' = 'particles';

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
  if (!event?.defender || event.defender === '-') return false;

  // Support, healing, status, and DoT events must not move the card. Their
  // persistent VFX is anchored to the slot, while only an offensive action
  // receives the short attack/recoil motion.
  if (event.actionType === 'attack') return true;
  if (event.actionType !== 'skill') return false;

  const role = event.skillRole?.trim().toLowerCase();
  return role === 'damage' || Number(event.damage) > 0;
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

function unitBuffDisplay(unit?: BattleBoardUnit | null) {
  if (!unit) return null;
  const key = dominantBattleBuffKey(unit.buffs.map((buff) => buff.name));
  return key ? BATTLE_BUFF_DISPLAY[key] : null;
}

function paletteCss(value: number, alpha: number) {
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
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
  const buffDisplay = unitBuffDisplay(unit);
  const buffChips = unit
    ? [...unit.buffs.reduce((grouped, buff) => {
        const key = battleBuffKeyForName(buff.name);
        if (key) {
          const entry = grouped.get(key) ?? { count: 0, duration: 0 };
          entry.count += 1;
          entry.duration = Math.max(entry.duration, buff.duration);
          grouped.set(key, entry);
        }
        return grouped;
      }, new Map<BattleBuffKey, { count: number; duration: number }>()).entries()].slice(0, 4)
    : [];

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
      {isTarget && currentEvent && mode !== 'buff' && (
        <motion.div
          key={`hit-flash-${unit.tag}-${eventKey(currentEvent)}`}
          className="pointer-events-none absolute inset-0 z-30 bg-[radial-gradient(circle_at_50%_34%,rgba(255,244,214,0.86),rgba(248,113,113,0.32)_28%,transparent_58%)] mix-blend-screen"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: [0, 0.95, 0.2, 0], scale: [0.92, 1.05, 1.02, 1] }}
          transition={{ duration: currentEvent.isCrit ? 0.82 : 0.66, delay: hitDelay, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,rgba(255,255,255,0.13),transparent_26%,rgba(180,150,100,0.18)_74%,transparent)] opacity-85" />
      {buffDisplay && (
        <div className={cn('pointer-events-none absolute inset-0 z-10 border', buffDisplay.gradeClass)} />
      )}
      {isTarget && currentEvent && tone === 'frost' && mode !== 'buff' && (
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
        <img src={image} alt="" className={cn('absolute inset-0 h-full w-full object-cover object-top opacity-90', buffDisplay?.artClass)} />
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
        {buffChips.length ? (
          buffChips.map(([key, chip]) => {
            const display = BATTLE_BUFF_DISPLAY[key];
            return (
              <span
                key={`${unit.tag}-${key}`}
                className="border px-1.5 py-0.5 text-[7px] uppercase tracking-[0.18em]"
                style={{
                  borderColor: paletteCss(display.palette.core, 0.4),
                  backgroundColor: paletteCss(display.palette.core, 0.12),
                  color: paletteCss(display.palette.text, 1),
                }}
              >
                {display.label}{chip.count > 1 ? `×${chip.count}` : ''} {chip.duration}
              </span>
            );
          })
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
type ProjectileSequenceFrame = { texture: Texture; tipAnchorX: number; centerAnchorY: number };
type InstantHitSequenceFrame = { texture: Texture; anchorX: number; anchorY: number };
type BattleVfxTextures = {
  projectileBeamFrames: ProjectileSequenceFrame[];
  projectileSequenceFrames: Record<ProjectileVfxSequenceTextureKey, ProjectileSequenceFrame[]>;
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
  impacts: Record<ProjectileVfxImpactTextureKey, Texture>;
  instants: Record<ProjectileVfxInstantTextureKey, Texture>;
  instantHits: Record<InstantHitSequenceKey, InstantHitSequenceFrame[]>;
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

function drawImpactSignature(
  graphics: Graphics,
  style: ImpactVfxPlan['style'],
  palette: PixiPalette,
  radius: number,
) {
  const ray = (from: number, to: number, rotation: number, width = 1.5, alpha = 0.78) => {
    graphics.moveTo(Math.cos(rotation) * from, Math.sin(rotation) * from);
    graphics.lineTo(Math.cos(rotation) * to, Math.sin(rotation) * to);
    graphics.stroke({ color: palette.hot, width, alpha, cap: 'round' });
  };

  if (style === 'pierce') {
    for (let spoke = 0; spoke < 4; spoke += 1) {
      ray(radius * 0.06, radius * (spoke % 2 ? 0.34 : 0.52), spoke * Math.PI / 2, spoke % 2 ? 1.2 : 2.2, spoke % 2 ? 0.58 : 0.92);
    }
    return;
  }

  if (style === 'shock') {
    for (let branch = 0; branch < 7; branch += 1) {
      const rotation = branch * Math.PI * 2 / 7;
      const middle = radius * (0.2 + (branch % 3) * 0.035);
      graphics.moveTo(Math.cos(rotation) * 4, Math.sin(rotation) * 4);
      graphics.lineTo(
        Math.cos(rotation) * middle + Math.cos(rotation + Math.PI / 2) * (branch % 2 ? 5 : -5),
        Math.sin(rotation) * middle + Math.sin(rotation + Math.PI / 2) * (branch % 2 ? 5 : -5),
      );
      graphics.lineTo(Math.cos(rotation) * radius * 0.62, Math.sin(rotation) * radius * 0.62);
      graphics.stroke({ color: branch % 2 ? palette.core : palette.hot, width: branch % 2 ? 1.2 : 2, alpha: 0.82, cap: 'round' });
    }
    return;
  }

  if (style === 'splash') {
    graphics.circle(0, 0, radius * 0.42);
    graphics.stroke({ color: palette.hot, width: 2, alpha: 0.64 });
    graphics.circle(0, 0, radius * 0.24);
    graphics.stroke({ color: palette.core, width: 1.4, alpha: 0.58 });
    for (let drop = 0; drop < 6; drop += 1) {
      ray(radius * 0.18, radius * (0.38 + (drop % 2) * 0.08), -Math.PI * 0.82 + drop * Math.PI * 0.13, 1.3, 0.62);
    }
    return;
  }

  if (style === 'collapse') {
    graphics.circle(0, 0, radius * 0.52);
    graphics.stroke({ color: palette.core, width: 2.2, alpha: 0.66 });
    graphics.circle(0, 0, radius * 0.28);
    graphics.stroke({ color: palette.hot, width: 1.4, alpha: 0.78 });
    for (let spoke = 0; spoke < 6; spoke += 1) {
      ray(radius * 0.32, radius * 0.56, spoke * Math.PI / 3, 1.2, 0.54);
    }
    return;
  }

  const count = style === 'crush' ? 10 : style === 'shatter' ? 12 : 8;
  for (let spoke = 0; spoke < count; spoke += 1) {
    const rotation = spoke * Math.PI * 2 / count;
    const inner = style === 'crush' ? radius * 0.12 : radius * 0.08;
    const outer = radius * (0.38 + (spoke % 3) * 0.08);
    ray(inner, outer, rotation, style === 'crush' ? 2.4 : 1.5, style === 'burst' ? 0.68 : 0.78);
  }
}

function createProjectileBeamSequenceTextures(texture: Texture) {
  const sourceTexture = createBlackBackedVfxRuntimeTexture(texture);
  const resource = sourceTexture.source.resource as { getContext?: (contextId: '2d', options?: { willReadFrequently?: boolean }) => CanvasRenderingContext2D | null } | undefined;
  const context = resource?.getContext?.('2d', { willReadFrequently: true }) ?? null;
  return Array.from({ length: projectileBeamSequence.frameCount }, (_, index) => {
    const rect = projectileBeamSequenceFrameRect(sourceTexture.width, sourceTexture.height, index);
    let tipAnchorX = 0.9;
    let centerAnchorY = 0.5;
    if (context) {
      try {
        const pixels = context.getImageData(rect.x, rect.y, rect.width, rect.height).data;
        tipAnchorX = projectileFrameTipAnchorFromRgba(pixels, rect.width, rect.height);
        centerAnchorY = projectileFrameCenterAnchorYFromRgba(pixels, rect.width, rect.height);
      } catch {
        tipAnchorX = 0.9;
        centerAnchorY = 0.5;
      }
    }
    return {
      texture: new Texture({
        source: sourceTexture.source,
        frame: new Rectangle(rect.x, rect.y, rect.width, rect.height),
      }),
      tipAnchorX,
      centerAnchorY,
    };
  });
}

/**
 * Instant-hit sheets are rendered with 'screen' blending inside an add-blend
 * group, so their black backing still needs alpha removal — but only the
 * near-black range. A gentle threshold keeps the photorealistic mid-dark
 * flame body at full opacity instead of gutting it.
 */
function createInstantHitSequenceTextures(texture: Texture): InstantHitSequenceFrame[] {
  const sourceTexture = createBlackBackedVfxRuntimeTexture(texture, instantHitVfxAlphaForLuminance);
  const resource = sourceTexture.source.resource as { getContext?: (contextId: '2d', options?: { willReadFrequently?: boolean }) => CanvasRenderingContext2D | null } | undefined;
  const context = resource?.getContext?.('2d', { willReadFrequently: true }) ?? null;

  return Array.from({ length: instantHitSequence.frameCount }, (_, index) => {
    const rect = instantHitSequenceFrameRect(sourceTexture.width, sourceTexture.height, index);
    let anchor = { x: 0.5, y: 0.5 };
    if (context) {
      try {
        const pixels = context.getImageData(rect.x, rect.y, rect.width, rect.height).data;
        anchor = instantHitFrameAnchorFromRgba(pixels, rect.width, rect.height);
      } catch {
        anchor = { x: 0.5, y: 0.5 };
      }
    }
    return {
      texture: new Texture({
        source: sourceTexture.source,
        frame: new Rectangle(rect.x, rect.y, rect.width, rect.height),
      }),
      anchorX: anchor.x,
      anchorY: anchor.y,
    };
  });
}

function createBlackBackedVfxRuntimeTexture(texture: Texture, alphaForLuminance: (luminance: number) => number = blackBackedVfxAlphaForLuminance) {
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
      data[i + 3] = Math.round(alphaForLuminance(luminance) * 255);
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
  const projectileFrameCache = new Map<Texture, ProjectileSequenceFrame[]>();
  const projectileFrames = (key: ProjectileVfxSequenceTextureKey) => {
    const texture = loadedTextures[key] ?? loadedTextures.projectileBeam;
    const cached = projectileFrameCache.get(texture);
    if (cached) return cached;
    const frames = createProjectileBeamSequenceTextures(texture);
    projectileFrameCache.set(texture, frames);
    return frames;
  };
  const instantHitFrameCache = new Map<Texture, InstantHitSequenceFrame[]>();
  const instantHitFrames = (key: InstantHitSequenceKey) => {
    const texture = loadedTextures[instantHitSequenceAssetId(key)]
      ?? loadedTextures[instantHitSequenceAssetId('strike')];
    const cached = texture ? instantHitFrameCache.get(texture) : undefined;
    if (cached) return cached;
    const frames = texture ? createInstantHitSequenceTextures(texture) : [];
    if (texture) instantHitFrameCache.set(texture, frames);
    return frames;
  };
  const instantHits = {} as Record<InstantHitSequenceKey, InstantHitSequenceFrame[]>;
  for (const key of Object.keys(instantHitSequenceAssetFiles) as InstantHitSequenceKey[]) {
    instantHits[key] = instantHitFrames(key);
  }
  return {
    projectileBeamFrames: projectileFrames('projectileBeam'),
    projectileSequenceFrames: {
      projectileBeam: projectileFrames('projectileBeam'),
      projectileBlood: projectileFrames('projectileBlood'),
      projectileFire: projectileFrames('projectileFire'),
      projectileFrost: projectileFrames('projectileFrost'),
      projectileHoly: projectileFrames('projectileHoly'),
      projectileMagic: projectileFrames('projectileMagic'),
      projectileNature: projectileFrames('projectileNature'),
      projectileArrow: projectileFrames('projectileArrow'),
      projectileLighting: projectileFrames('projectileLighting'),
      projectileVoid: projectileFrames('projectileVoid'),
      projectileWater: projectileFrames('projectileWater'),
      projectileBullet: projectileFrames('projectileBullet'),
      projectileRock: projectileFrames('projectileRock'),
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
    instantHits,
    slash: loadedTextures.slashStreak,
    impact: loadedTextures.impactBurst,
    ring: loadedTextures.ring,
  };
}

function vfxTexture(textures: BattleVfxTextures, key: ProjectileVfxTextureKey) {
  return textures[key];
}

function impactBurstTexture(textures: BattleVfxTextures, key: ProjectileVfxImpactTextureKey) {
  return textures.impacts[key];
}

function instantGlyphTexture(textures: BattleVfxTextures, key: ProjectileVfxInstantTextureKey) {
  return textures.instants[key];
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

function renderPixiInstantHitSequence(
  add: PixiAdd,
  tweens: gsap.core.Tween[],
  point: PixiPoint,
  event: BattleEvent,
  textures: BattleVfxTextures,
  profile?: ProjectileVfxProfile,
  delay = 0,
) {
  const sequenceKey = instantHitSequenceKeyForEvent(event);
  const frames = textures.instantHits[sequenceKey];
  if (!frames?.length) return false;

  const firstTexture = frames[0]?.texture ?? frames[frames.length - 1].texture;
  const hitLayer = add(new Container(), 11);
  const hit = new Sprite(firstTexture);
  const profileScale = profile?.instantScale ?? 0.8;
  const clarityScale = profile?.instantClarityScale ?? 1;
  const baseScale = Math.max(0.5, Math.min(1.0, profileScale * clarityScale * 0.85));
  const frameState = { progress: 0 };
  const isFineSteelCut = sequenceKey === 'strike';
  const alpha = event.isCrit ? 1 : 0.95;
  const scale = baseScale * (isFineSteelCut ? 1.18 : 1) * (event.isCrit ? 1.08 : 1);
  const duration = (instantHitSequence.durationMs + (event.isCrit ? 15 : 0)) / 1000;
  let currentFrameIndex = 0;

  hit.anchor.set(frames[0]?.anchorX ?? 0.5, frames[0]?.anchorY ?? 0.5);
  hit.blendMode = instantHitSequence.blendMode;
  hit.tint = 0xffffff;
  hit.x = point.x;
  hit.y = point.y;
  hit.alpha = alpha;
  hit.scale.set(scale);
  hit.rotation = 0;
  hitLayer.addChild(hit);

  const applyFrame = () => {
    if (hitLayer.destroyed || hit.destroyed) return;
    const frameIndex = instantHitSequenceFrameIndex(frameState.progress);
    if (frameIndex !== currentFrameIndex) {
      currentFrameIndex = frameIndex;
      const frame = frames[frameIndex] ?? frames[frames.length - 1];
      hit.texture = frame.texture;
      hit.anchor.set(frame.anchorX, frame.anchorY);
    }
  };

  tweens.push(gsap.to(frameState, {
    progress: 1,
    duration,
    delay,
    ease: 'none',
    onUpdate: applyFrame,
    onComplete: () => {
      // Hold the final frame briefly and fade instead of cutting to black.
      tweens.push(gsap.to(hit, {
        alpha: 0,
        duration: 0.16,
        ease: 'power1.out',
        onComplete: () => {
          if (!hitLayer.destroyed) hitLayer.destroy({ children: true });
        },
      }));
    },
  }));

  return true;
}

function renderPixiProjectileHitGlyph(
  add: PixiAdd,
  tweens: gsap.core.Tween[],
  point: PixiPoint,
  event: BattleEvent,
  textures: BattleVfxTextures,
  profile: ProjectileVfxProfile,
  delay = 0,
) {
  const glyph = add(new Sprite(instantGlyphTexture(textures, profile.instantTextureKey)), 11);
  const glyphScale = profile.instantScale * profile.instantClarityScale;
  const state = {
    alpha: event.isCrit ? 1 : 0.9,
    scale: glyphScale * 0.58,
    rotation: Math.random() * Math.PI,
  };
  glyph.anchor.set(profile.instantAnchor.x, profile.instantAnchor.y);
  glyph.blendMode = 'add';
  glyph.x = point.x;
  glyph.y = point.y;
  glyph.alpha = 0;
  glyph.scale.set(state.scale);
  glyph.rotation = state.rotation;

  tweens.push(gsap.to(state, {
    alpha: 0,
    scale: glyphScale * (event.isCrit ? 1.1 : 1),
    rotation: state.rotation + Math.PI * 0.36,
    duration: event.isCrit ? 0.5 : 0.44,
    delay,
    ease: 'power4.out',
    onStart: () => {
      glyph.alpha = state.alpha;
    },
    onUpdate: () => {
      glyph.alpha = state.alpha;
      glyph.scale.set(state.scale);
      glyph.rotation = state.rotation;
    },
    onComplete: () => glyph.destroy(),
  }));

  return true;
}

function renderPixiImpact(
  add: PixiAdd,
  tweens: gsap.core.Tween[],
  point: PixiPoint,
  palette: PixiPalette,
  event: BattleEvent,
  delay = 0,
  textures?: BattleVfxTextures,
  impactPlan: ImpactVfxPlan = createImpactVfxPlan(event),
  showProjectileHitGlyph = true,
) {
  const projectileHitGlyphRendered = textures && showProjectileHitGlyph
    ? renderPixiProjectileHitGlyph(add, tweens, point, event, textures, createProjectileVfxProfile(event), delay)
    : false;
  const burst = add(new Graphics(), 8);
  const shock = add(new Graphics(), 7);
  const shards = add(new Container(), 9);
  burst.blendMode = shock.blendMode = shards.blendMode = 'add';
  burst.filters = [new BlurFilter({ strength: 3 })];
  const impactRadius = impactPlan.radius;
  const impactStyle = impactPlan.style;
  const impactMotion = {
    burst: { textureAlpha: 0.66, textureStart: 0.2, textureEnd: 0.62, duration: 0.3, ringAlpha: 0.42, ringEnd: 0.58, particles: 1 },
    collapse: { textureAlpha: 0.58, textureStart: 0.58, textureEnd: 0.2, duration: 0.28, ringAlpha: 0.34, ringEnd: 0.4, particles: 0.82 },
    shatter: { textureAlpha: 0.64, textureStart: 0.18, textureEnd: 0.5, duration: 0.24, ringAlpha: 0.24, ringEnd: 0.44, particles: 1.18 },
    pierce: { textureAlpha: 0.42, textureStart: 0.12, textureEnd: 0.32, duration: 0.18, ringAlpha: 0.18, ringEnd: 0.3, particles: 0.46 },
    shock: { textureAlpha: 0.6, textureStart: 0.12, textureEnd: 0.4, duration: 0.2, ringAlpha: 0.5, ringEnd: 0.48, particles: 0.74 },
    splash: { textureAlpha: 0.5, textureStart: 0.2, textureEnd: 0.56, duration: 0.32, ringAlpha: 0.32, ringEnd: 0.64, particles: 0.88 },
    crush: { textureAlpha: 0.7, textureStart: 0.2, textureEnd: 0.58, duration: 0.3, ringAlpha: 0.28, ringEnd: 0.5, particles: 1.32 },
  }[impactStyle];
  const signature = add(new Graphics(), 10);
  signature.x = point.x;
  signature.y = point.y;
  signature.blendMode = 'add';
  drawImpactSignature(signature, impactStyle, palette, impactRadius);
  const signatureState = {
    alpha: impactStyle === 'pierce' ? 0.9 : 0.76,
    scale: impactStyle === 'collapse' ? 1.06 : 0.64,
    rotation: 0,
  };
  signature.alpha = signatureState.alpha;
  signature.scale.set(signatureState.scale);
  signature.rotation = signatureState.rotation;
  tweens.push(gsap.fromTo(signatureState, {
    alpha: signatureState.alpha,
    scale: signatureState.scale,
  }, {
    alpha: 0,
    scale: impactStyle === 'collapse' ? 0.48 : 1.08,
    rotation: impactStyle === 'collapse' ? -0.12 : 0.06,
    duration: impactMotion.duration + 0.08,
    delay,
    ease: 'power4.out',
    onUpdate: () => {
      signature.alpha = signatureState.alpha;
      signature.scale.set(signatureState.scale);
      signature.rotation = signatureState.rotation;
    },
    onComplete: () => signature.destroy(),
  }));

  if (textures) {
    const flashTexture = !projectileHitGlyphRendered && impactPlan.showFlashTexture
      ? impactBurstTexture(textures, impactPlan.textureKey)
      : null;
    const flash = flashTexture ? add(new Sprite(flashTexture), 8) : null;
    const ringSprite = add(new Sprite(textures.ring), 8);
    const ringSpriteState = { alpha: impactMotion.ringAlpha, scale: 0.2, rotation: Math.random() * Math.PI };
    if (flash) {
      const flashScale = impactPlan.flashScale;
      const flashState = { alpha: 0, scale: 0.1, rotation: Math.random() * Math.PI };
      flash.anchor.set(impactPlan.textureAnchor.x, impactPlan.textureAnchor.y);
      flash.blendMode = 'add';
      flash.tint = 0xffffff;
      flash.x = point.x;
      flash.y = point.y;
      flash.alpha = 0;
      flash.scale.set(flashScale * 0.16);
      tweens.push(gsap.fromTo(flashState, { alpha: event.isCrit ? Math.min(0.86, impactMotion.textureAlpha + 0.14) : impactMotion.textureAlpha, scale: flashScale * impactMotion.textureStart }, {
        alpha: 0,
        scale: flashScale * impactMotion.textureEnd * (event.isCrit ? 1.14 : 1),
        duration: impactMotion.duration * (event.isCrit ? 1.18 : 1),
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
    ringSprite.anchor.set(impactPlan.ringAnchor.x, impactPlan.ringAnchor.y);
    ringSprite.blendMode = 'add';
    ringSprite.tint = palette.core;
    ringSprite.x = point.x;
    ringSprite.y = point.y;
    ringSprite.alpha = 0;
    ringSprite.scale.set(ringSpriteState.scale);
    tweens.push(gsap.fromTo(ringSpriteState, { alpha: event.isCrit ? Math.min(0.66, impactMotion.ringAlpha + 0.14) : impactMotion.ringAlpha, scale: impactStyle === 'collapse' ? impactMotion.ringEnd : 0.16 }, {
      alpha: 0,
      scale: impactStyle === 'collapse' ? 0.14 : impactMotion.ringEnd * (event.isCrit ? 1.14 : 1),
      duration: impactMotion.duration + 0.06,
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

  tweens.push(gsap.fromTo(burst, { alpha: 1, scale: impactStyle === 'collapse' ? 1 : 0.42 }, {
    alpha: 0,
    scale: impactStyle === 'collapse' ? 0.62 : 1.02,
    duration: impactMotion.duration,
    delay,
    ease: 'power4.out',
    onStart: () => {
      burst.clear();
      drawGlowCircle(burst, point.x, point.y, impactRadius * 0.46, palette.hot, event.isCrit ? 0.46 : 0.3);
      drawGlowCircle(burst, point.x, point.y, impactRadius * 0.84, palette.core, event.isCrit ? 0.16 : 0.1);
    },
    onUpdate: () => {
      burst.x = point.x * (1 - burst.scale.x);
      burst.y = point.y * (1 - burst.scale.y);
    },
    onComplete: () => burst.destroy(),
  }));

  const ring = { r: impactStyle === 'collapse' ? impactRadius * 0.78 : 12, alpha: impactMotion.ringAlpha + 0.22 };
  tweens.push(gsap.to(ring, {
    r: impactStyle === 'collapse' ? 8 : (event.isCrit ? impactRadius * 0.96 : impactRadius * 0.82),
    alpha: 0,
    duration: impactMotion.duration + 0.04,
    delay,
    ease: 'power4.out',
    onUpdate: () => {
      shock.clear();
      shock.circle(point.x, point.y, ring.r);
      shock.stroke({ color: palette.hot, width: event.isCrit ? 3 : 2, alpha: ring.alpha });
      shock.circle(point.x, point.y, ring.r * 0.62);
      shock.stroke({ color: palette.core, width: 2, alpha: ring.alpha * 0.6 });
    },
    onComplete: () => shock.destroy(),
  }));

  const baseShardCount = Math.round(impactPlan.particleCount * impactMotion.particles);
  const shardCount = event.isCrit ? Math.round(baseShardCount * 1.22) : baseShardCount;
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

function renderPixiInstant(
  add: PixiAdd,
  app: Application,
  tweens: gsap.core.Tween[],
  point: PixiPoint,
  palette: PixiPalette,
  event: BattleEvent,
  textures: BattleVfxTextures | undefined,
  profile: ProjectileVfxProfile | undefined,
  registerCleanup: (cleanup: TickerCleanup) => void,
) {
  const layer = add(new Container(), 8);
  layer.blendMode = 'add';
  const addToLayer: PixiAdd = (node, zIndex = 1) => {
    node.zIndex = zIndex;
    layer.addChild(node);
    return node;
  };

  // Contact flash + element debris give the authored sheet its physical read.
  renderPixiContactFlash(addToLayer, tweens, point, palette);
  const debrisRecipe = battleDebrisRecipeForEvent(event);
  renderPixiDebrisBurst(addToLayer, app, point, palette, textures, debrisRecipe, registerCleanup);

  const renderedHitSequence = textures
    ? renderPixiInstantHitSequence(
      addToLayer,
      tweens,
      point,
      event,
      textures,
      profile,
    )
    : false;

  // A loaded sequence owns the entire instant hit. Do not dilute its authored
  // silhouette with the old generic ring, random sparks, or impact burst —
  // only a soft lingering tail of debris as the energy settles.
  if (renderedHitSequence) {
    tweens.push(gsap.delayedCall(instantHitSequence.durationMs / 1000, () => {
      renderPixiDebrisBurst(addToLayer, app, point, palette, textures, battleDebrisLingerRecipe(debrisRecipe), registerCleanup);
    }));
    tweens.push(gsap.delayedCall((instantHitSequence.durationMs + (event.isCrit ? 15 : 0) + 200) / 1000, () => {
      if (!layer.destroyed) layer.destroy({ children: true });
    }));
    return;
  }

  // Keep the old glyph only as a resilience fallback if a sequence asset fails to load.
  if (textures && profile) {
    const glyph = new Sprite(instantGlyphTexture(textures, profile.instantTextureKey));
    glyph.anchor.set(profile.instantAnchor.x, profile.instantAnchor.y);
    glyph.blendMode = 'add';
    glyph.x = point.x;
    glyph.y = point.y;
    glyph.alpha = 0;
    glyph.scale.set(profile.instantScale * profile.instantClarityScale * 0.72);
    layer.addChild(glyph);
    tweens.push(gsap.to(glyph, {
      alpha: 0,
      scale: profile.instantScale * profile.instantClarityScale,
      duration: 0.28,
      ease: 'power4.out',
      onStart: () => { glyph.alpha = 0.9; },
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
        duration: 0.18,
        delay: i * 0.025,
        ease: 'power3.out',
        onStart: () => { slash.alpha = 0.86; },
        onComplete: () => slash.destroy(),
      }));
    }
  }

  if (textures) {
    const particleCount = Math.max(12, Math.round((profile?.instantParticleCount ?? 24) * 0.72));
    for (let i = 0; i < particleCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const particle = addTextureParticle(layer, textures, point.x, point.y, palette, 0.92 + Math.random() * 0.95);
      const state = {
        x: point.x,
        y: point.y,
        alpha: 0.5 + Math.random() * 0.18,
        scale: particle.scale.x,
      };
      tweens.push(gsap.to(state, {
        x: point.x + Math.cos(angle) * (34 + Math.random() * 58),
        y: point.y + Math.sin(angle) * (30 + Math.random() * 50),
        alpha: 0,
        scale: state.scale * 0.24,
        duration: 0.18 + Math.random() * 0.1,
        delay: Math.random() * 0.025,
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

  renderPixiImpact(add, tweens, point, palette, event, 0.02, textures, {
    ...createImpactVfxPlan(event),
    showFlashTexture: false,
  }, false);
  tweens.push(gsap.delayedCall((instantHitSequence.durationMs + (event.isCrit ? 15 : 0) + 120) / 1000, () => layer.destroy({ children: true })));
}

function pointOnRectEdge(rect: PixiRect, t: number): PixiPoint {
  const perimeter = rect.width * 2 + rect.height * 2;
  const distance = ((t % 1) + 1) % 1 * perimeter;
  if (distance <= rect.width) return { x: rect.x + distance, y: rect.y };
  if (distance <= rect.width + rect.height) return { x: rect.x + rect.width, y: rect.y + distance - rect.width };
  if (distance <= rect.width * 2 + rect.height) return { x: rect.x + rect.width - (distance - rect.width - rect.height), y: rect.y + rect.height };
  return { x: rect.x, y: rect.y + rect.height - (distance - rect.width * 2 - rect.height) };
}

type BuffMote = {
  node: Graphics | Sprite;
  age: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  sway: number;
  baseAlpha: number;
  baseScale: number;
  orbitAngle: number;
};

const BUFF_MOTE_COUNTS: Record<BattleBuffBehavior, number> = {
  snowfall: 14,
  orbitStars: 3,
  bubbles: 11,
  bloodDrips: 9,
  embers: 16,
  wisps: 12,
  mendGlow: 9,
  radiantMotes: 12,
};

function createBuffMoteNode(behavior: BattleBuffBehavior, palette: PixiPalette, textures?: BattleVfxTextures): Graphics | Sprite {
  if (behavior === 'wisps' && textures?.smokes.length) {
    const sprite = new Sprite(textures.smokes[Math.floor(Math.random() * textures.smokes.length)]);
    sprite.anchor.set(0.5);
    sprite.tint = palette.core;
    sprite.blendMode = 'add';
    return sprite;
  }
  if (behavior === 'radiantMotes' && textures?.sparks.length) {
    const sprite = new Sprite(textures.sparks[Math.floor(Math.random() * textures.sparks.length)]);
    sprite.anchor.set(0.5);
    sprite.tint = palette.hot;
    sprite.blendMode = 'add';
    return sprite;
  }
  const g = new Graphics();
  g.blendMode = 'add';
  if (behavior === 'bubbles') {
    g.circle(0, 0, 2.6);
    g.stroke({ color: palette.core, width: 1, alpha: 0.9 });
    g.circle(-0.8, -0.8, 0.7);
    g.fill({ color: palette.hot, alpha: 0.95 });
  } else if (behavior === 'bloodDrips') {
    g.moveTo(0, -3.8);
    g.lineTo(0, 3.8);
    g.stroke({ color: palette.core, width: 1.1, alpha: 0.85, cap: 'round' });
    g.circle(0, 3.8, 0.9);
    g.fill({ color: palette.core, alpha: 0.85 });
  } else if (behavior === 'orbitStars') {
    g.moveTo(0, -4.4);
    g.lineTo(1.3, -1.3);
    g.lineTo(4.4, 0);
    g.lineTo(1.3, 1.3);
    g.lineTo(0, 4.4);
    g.lineTo(-1.3, 1.3);
    g.lineTo(-4.4, 0);
    g.lineTo(-1.3, -1.3);
    g.closePath();
    g.fill({ color: palette.hot, alpha: 0.95 });
  } else if (behavior === 'mendGlow') {
    g.rect(-2.2, -0.65, 4.4, 1.3);
    g.rect(-0.65, -2.2, 1.3, 4.4);
    g.fill({ color: palette.hot, alpha: 0.85 });
  } else {
    g.circle(0, 0, behavior === 'embers' ? 1.5 : 1.7);
    g.fill({ color: Math.random() > 0.4 ? palette.hot : palette.core, alpha: 0.95 });
  }
  return g;
}

/**
 * Persistent buff loop: a thin status frame plus one large-amplitude,
 * slow particle behavior per buff (see battleBuffDisplay). Secondary
 * buffs ride the card perimeter as small orbiters.
 */
function renderPixiBuffAuraLoop(
  add: PixiAdd,
  app: Application,
  keys: BattleBuffKey[],
  targetBox: PixiRect,
  textures: BattleVfxTextures | undefined,
  registerCleanup: (cleanup: TickerCleanup) => void,
) {
  const dominantKey = keys[0];
  if (!dominantKey) return false;
  const display = BATTLE_BUFF_DISPLAY[dominantKey];
  const palette = display.palette;
  const behavior = display.behavior;
  const rect = {
    x: snapToDevicePixel(targetBox.x - 2),
    y: snapToDevicePixel(targetBox.y - 2),
    width: snapToDevicePixel(targetBox.width + 4),
    height: snapToDevicePixel(targetBox.height + 4),
  };
  const centerX = rect.x + rect.width / 2;
  const phase = ((targetBox.x * 0.009 + targetBox.y * 0.007) % 1) * Math.PI * 2;

  const layer = add(new Container(), 3);
  layer.blendMode = 'add';

  const frame = new Graphics();
  frame.blendMode = 'add';
  frame.roundRect(rect.x, rect.y, rect.width, rect.height, 3);
  frame.stroke({ color: palette.core, width: 1.5, alpha: 0.62 });
  if (display.control) {
    const arm = 7;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const cx = sx > 0 ? rect.x + rect.width : rect.x;
      const cy = sy > 0 ? rect.y + rect.height : rect.y;
      frame.moveTo(cx - sx * arm, cy);
      frame.lineTo(cx, cy);
      frame.lineTo(cx, cy - sy * arm);
      frame.stroke({ color: palette.hot, width: 1.6, alpha: 0.85, cap: 'round' });
    }
  }
  layer.addChild(frame);

  const accent = new Graphics();
  accent.blendMode = 'add';
  if (dominantKey === 'curse') {
    const radius = Math.min(rect.width, rect.height) * 0.16;
    const cy = rect.y + rect.height * 0.4;
    accent.circle(centerX, cy, radius);
    accent.stroke({ color: palette.core, width: 1, alpha: 0.55 });
    for (let index = 0; index < 3; index += 1) {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / 3;
      accent.moveTo(centerX + Math.cos(angle) * radius * 0.35, cy + Math.sin(angle) * radius * 0.35);
      accent.lineTo(centerX + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      accent.stroke({ color: palette.core, width: 1, alpha: 0.55, cap: 'round' });
    }
  } else if (dominantKey === 'pray') {
    accent.ellipse(centerX, rect.y - 2, rect.width * 0.26, 4.5);
    accent.stroke({ color: palette.hot, width: 1.1, alpha: 0.42 });
  }
  layer.addChild(accent);

  // Streaming light chasing around the card edge — the primary "this card is marked" read.
  const stream = new Graphics();
  stream.blendMode = 'add';
  layer.addChild(stream);
  const streamHeads = display.control ? 2 : 1;

  const resetMote = (mote: BuffMote, initial: boolean) => {
    mote.age = initial ? Math.random() * 4000 : 0;
    mote.vx = 0;
    mote.vy = 0;
    mote.sway = Math.random() * Math.PI * 2;
    mote.baseScale = 0.7 + Math.random() * 0.6;
    mote.baseAlpha = 0.7 + Math.random() * 0.3;
    switch (behavior) {
      case 'snowfall':
        mote.x = rect.x + 7 + Math.random() * (rect.width - 14);
        mote.y = initial ? rect.y + 4 + Math.random() * (rect.height - 8) : rect.y + 4;
        mote.vy = 0.026 + Math.random() * 0.022;
        break;
      case 'bubbles':
        mote.x = rect.x + 8 + Math.random() * (rect.width - 16);
        mote.y = initial ? rect.y + rect.height * (0.45 + Math.random() * 0.5) : rect.y + rect.height - 5;
        mote.vy = -(0.03 + Math.random() * 0.028);
        break;
      case 'bloodDrips':
        mote.x = rect.x + 7 + Math.random() * (rect.width - 14);
        mote.y = initial ? rect.y + Math.random() * rect.height * 0.8 : rect.y + 3;
        mote.vy = 0.015 + Math.random() * 0.01;
        mote.baseScale = 0.5 + Math.random() * 0.4;
        mote.baseAlpha = 0.55 + Math.random() * 0.25;
        break;
      case 'embers':
        mote.x = rect.x + 6 + Math.random() * (rect.width - 12);
        mote.y = initial ? rect.y + rect.height * (0.35 + Math.random() * 0.6) : rect.y + rect.height - 3 - Math.random() * 6;
        mote.vy = -(0.035 + Math.random() * 0.045);
        mote.vx = (Math.random() - 0.5) * 0.02;
        break;
      case 'wisps':
        mote.x = centerX + (Math.random() - 0.5) * rect.width * 0.5;
        mote.y = initial ? rect.y + rect.height * (0.4 + Math.random() * 0.5) : rect.y + rect.height - 8;
        mote.vy = -(0.011 + Math.random() * 0.01);
        mote.vx = (Math.random() - 0.5) * 0.008;
        mote.baseScale = 0.045;
        break;
      case 'mendGlow':
        mote.x = rect.x + 10 + Math.random() * (rect.width - 20);
        mote.y = initial ? rect.y + rect.height * (0.35 + Math.random() * 0.55) : rect.y + rect.height - 6;
        mote.vy = -(0.02 + Math.random() * 0.016);
        mote.baseScale = 0.5 + Math.random() * 0.35;
        mote.baseAlpha = 0.55 + Math.random() * 0.25;
        break;
      case 'radiantMotes':
        mote.x = rect.x + 6 + Math.random() * (rect.width - 12);
        mote.y = initial ? rect.y + Math.random() * rect.height : rect.y + rect.height - 3;
        mote.vy = -(0.032 + Math.random() * 0.028);
        mote.baseScale = 0.04 + Math.random() * 0.02;
        break;
      case 'orbitStars':
        break;
    }
  };

  const moteCount = BUFF_MOTE_COUNTS[behavior];
  const motes: BuffMote[] = [];
  for (let index = 0; index < moteCount; index += 1) {
    const node = createBuffMoteNode(behavior, palette, textures);
    layer.addChild(node);
    const mote: BuffMote = {
      node,
      age: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      sway: 0,
      baseAlpha: 0.8,
      baseScale: 1,
      orbitAngle: (index / moteCount) * Math.PI * 2,
    };
    resetMote(mote, true);
    motes.push(mote);
  }

  const orbiters: Array<{ node: Graphics; offset: number }> = [];
  keys.slice(1, 3).forEach((key, keyIndex) => {
    const orbitPalette = BATTLE_BUFF_DISPLAY[key].palette;
    for (let index = 0; index < 2; index += 1) {
      const node = new Graphics();
      node.circle(0, 0, 1.7);
      node.fill({ color: orbitPalette.hot, alpha: 0.9 });
      node.blendMode = 'add';
      layer.addChild(node);
      orbiters.push({ node, offset: keyIndex * 0.5 + index * 0.25 + phase / (Math.PI * 2) });
    }
  });

  const fadeEnvelope = (t: number) => Math.min(1, Math.max(0, t) * 5) * Math.min(1, Math.max(0, 1 - t) * 5);
  let elapsedMs = 0;
  const update = () => {
    const deltaMs = Math.min(64, app.ticker.deltaMS);
    elapsedMs += deltaMs;

    frame.alpha = 0.44 + Math.sin((elapsedMs / 2600) * Math.PI * 2 + phase) * 0.08;
    if (dominantKey === 'curse') accent.alpha = 0.22 + 0.16 * Math.sin((elapsedMs / 1500) * Math.PI * 2 + phase);
    if (dominantKey === 'pray') accent.alpha = 0.32 + 0.14 * Math.sin((elapsedMs / 2100) * Math.PI * 2 + phase);
    if (dominantKey === 'stun') layer.x = Math.sin(elapsedMs * 0.11) * 0.6;

    stream.clear();
    for (let head = 0; head < streamHeads; head += 1) {
      const headT = ((((elapsedMs / 2800) + phase / (Math.PI * 2) + head / streamHeads) % 1) + 1) % 1;
      const trailLength = 0.18;
      const segments = 14;
      for (let i = 0; i < segments; i += 1) {
        const t0 = headT - (i / segments) * trailLength;
        const t1 = headT - ((i + 1) / segments) * trailLength;
        const p0 = pointOnRectEdge(rect, t0);
        const p1 = pointOnRectEdge(rect, t1);
        const strength = 1 - i / segments;
        stream.moveTo(p0.x, p0.y);
        stream.lineTo(p1.x, p1.y);
        stream.stroke({
          color: i < 2 ? palette.hot : palette.core,
          width: 1 + strength * 2.2,
          alpha: 0.8 * strength * strength,
          cap: 'round',
        });
      }
      const headPoint = pointOnRectEdge(rect, headT);
      drawGlowCircle(stream, headPoint.x, headPoint.y, 3.4, palette.hot, 0.34);
      drawGlowCircle(stream, headPoint.x, headPoint.y, 1.5, palette.hot, 0.85);
    }

    for (const mote of motes) {
      mote.age += deltaMs;

      if (behavior === 'orbitStars') {
        const angle = mote.orbitAngle + (elapsedMs / 2400) * Math.PI * 2;
        mote.node.x = centerX + Math.cos(angle) * rect.width * 0.3;
        mote.node.y = rect.y - 3 + Math.sin(angle) * 4.5;
        mote.node.alpha = 0.45 + 0.45 * Math.max(0, Math.sin(angle));
        continue;
      }

      if (behavior === 'bloodDrips') mote.vy += 0.00008 * deltaMs;
      mote.x += mote.vx * deltaMs;
      mote.y += mote.vy * deltaMs;

      if (behavior === 'snowfall' || behavior === 'mendGlow' || behavior === 'radiantMotes') {
        mote.node.x = mote.x + Math.sin(mote.age / 700 + mote.sway) * 3;
        mote.node.y = mote.y;
      } else if (behavior === 'bubbles') {
        mote.node.x = mote.x + Math.sin(mote.age / 260 + mote.sway) * 1.6;
        mote.node.y = mote.y;
      } else {
        mote.node.x = mote.x;
        mote.node.y = mote.y;
      }

      const fromTop = Math.min(1, Math.max(0, (mote.y - rect.y) / rect.height));
      mote.node.alpha = behavior === 'snowfall' || behavior === 'bloodDrips'
        ? mote.baseAlpha * fadeEnvelope(fromTop)
        : mote.baseAlpha * fadeEnvelope(1 - fromTop);

      if (behavior === 'embers') {
        mote.node.alpha *= 0.6 + 0.4 * Math.sin(mote.age / 43 + mote.sway * 3);
        mote.node.scale.set(mote.baseScale * (0.7 + 0.3 * Math.sin(mote.age / 90 + mote.sway)));
      } else if (behavior === 'wisps') {
        const grow = Math.min(1, mote.age / 5200);
        mote.node.scale.set(mote.baseScale + grow * 0.2);
        mote.node.alpha = mote.baseAlpha * 0.6 * Math.sin(grow * Math.PI);
        mote.node.rotation += 0.0004 * deltaMs;
      } else {
        mote.node.scale.set(mote.baseScale);
      }

      if (mote.y < rect.y - 6 || mote.y > rect.y + rect.height + 6 || mote.age > 9000) {
        resetMote(mote, false);
      }
    }

    for (const orbiter of orbiters) {
      const t = (((elapsedMs / 6400 + orbiter.offset) % 1) + 1) % 1;
      const point = pointOnRectEdge(rect, t);
      orbiter.node.x = point.x;
      orbiter.node.y = point.y;
      orbiter.node.alpha = 0.55 + 0.35 * Math.sin((elapsedMs / 900) * Math.PI * 2 + orbiter.offset * 9);
    }
  };
  const cleanup = () => {
    app.ticker.remove(update);
    layer.destroy({ children: true });
  };
  update();
  app.ticker.add(update);
  registerCleanup(cleanup);
  return true;
}

function snapToDevicePixel(value: number) {
  const resolution = typeof window === 'undefined'
    ? 1
    : Math.min(window.devicePixelRatio || 1, 2);
  return Math.round(value * resolution) / resolution;
}

function renderPixiBuff(add: PixiAdd, tweens: gsap.core.Tween[], point: PixiPoint, targetBox: PixiRect, palette: PixiPalette, event: BattleEvent, textures?: BattleVfxTextures) {
  const buffKey = battleBuffKeyForName(event.buffName ?? event.buffTypeEffect ?? event.typeEffect);
  const effectPalette = buffKey ? BATTLE_BUFF_DISPLAY[buffKey].palette : palette;
  const plan = createBuffBorderVfxPlan(event);
  const border = add(new Graphics(), 8);
  const fill = add(new Graphics(), 7);
  const motes = add(new Container(), 9);
  const rect = {
    x: targetBox.x - 7,
    y: targetBox.y - 7,
    width: targetBox.width + 14,
    height: targetBox.height + 14,
  };
  border.blendMode = fill.blendMode = motes.blendMode = 'add';
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
      border.stroke({ color: effectPalette.hot, width: pulse.glow, alpha: pulse.alpha * 0.72 });
      border.roundRect(x + 4, y + 4, w - 8, h - 8, 3);
      border.stroke({ color: effectPalette.core, width: Math.max(1.5, pulse.glow * 0.42), alpha: pulse.alpha * 0.86 });
      fill.roundRect(x + 2, y + 2, w - 4, h - 4, 4);
      fill.fill({ color: effectPalette.core, alpha: pulse.alpha * 0.045 });
    },
    onComplete: () => {
      border.destroy();
      fill.destroy();
    },
  }));

  for (let i = 0; i < plan.edgeParticleCount; i += 1) {
    const edgeStart = pointOnRectEdge(rect, i / plan.edgeParticleCount + Math.random() * 0.025);
    const outward = {
      x: edgeStart.x < point.x ? -1 : edgeStart.x > point.x ? 1 : 0,
      y: edgeStart.y < point.y ? -1 : edgeStart.y > point.y ? 1 : 0,
    };
    const p = textures
      ? addTextureParticle(motes, textures, edgeStart.x, edgeStart.y, effectPalette, 0.7 + Math.random() * 0.7)
      : addParticle(motes, edgeStart.x, edgeStart.y, effectPalette, 0.9 + Math.random() * 0.8);
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
  }));
}

type TickerCleanup = () => void;

function createDebrisNode(recipe: BattleDebrisRecipe, palette: PixiPalette, textures?: BattleVfxTextures): Graphics | Sprite {
  if (recipe.pool === 'smokes' && textures?.smokes.length) {
    const sprite = new Sprite(textures.smokes[Math.floor(Math.random() * textures.smokes.length)]);
    sprite.anchor.set(0.5);
    sprite.tint = palette.dark;
    sprite.blendMode = 'add';
    sprite.scale.set(0.08);
    return sprite;
  }
  if (recipe.pool === 'sparks' && textures?.sparks.length) {
    const sprite = new Sprite(textures.sparks[Math.floor(Math.random() * textures.sparks.length)]);
    sprite.anchor.set(0.5);
    sprite.tint = Math.random() > 0.4 ? palette.hot : palette.core;
    sprite.blendMode = 'add';
    sprite.scale.set(0.05);
    return sprite;
  }
  const g = new Graphics();
  g.blendMode = 'add';
  g.circle(0, 0, 1.4 + Math.random() * 1.1);
  g.fill({ color: Math.random() > 0.4 ? palette.hot : palette.core, alpha: 0.95 });
  return g;
}

/**
 * Element-flavored debris scattered by a hit. One ticker drives simple
 * physics (initial velocity + gravity/drift) so fire embers rise, ice
 * shards fly, and droplets fall — the authored sheet stays the hero.
 */
function renderPixiDebrisBurst(
  add: PixiAdd,
  app: Application,
  point: PixiPoint,
  palette: PixiPalette,
  textures: BattleVfxTextures | undefined,
  recipe: BattleDebrisRecipe,
  registerCleanup: (cleanup: TickerCleanup) => void,
) {
  const layer = add(new Container(), 10);
  layer.blendMode = 'add';
  type DebrisParticle = {
    node: Graphics | Sprite;
    vx: number;
    vy: number;
    spin: number;
    age: number;
    life: number;
    scale0: number;
    baseScale: number;
  };
  const particles: DebrisParticle[] = [];

  for (let index = 0; index < recipe.count; index += 1) {
    const node = createDebrisNode(recipe, palette, textures);
    layer.addChild(node);
    node.x = point.x;
    node.y = point.y;
    const angle = recipe.motion === 'rise'
      ? -Math.PI / 2 + (Math.random() - 0.5) * 2.4
      : Math.random() * Math.PI * 2;
    const speed = recipe.speed[0] + Math.random() * (recipe.speed[1] - recipe.speed[0]);
    const upwardBias = recipe.motion === 'float' ? -Math.abs(Math.sin(angle)) : 1;
    particles.push({
      node,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * upwardBias,
      spin: (Math.random() - 0.5) * 0.006,
      age: 0,
      life: recipe.lifeMs[0] + Math.random() * (recipe.lifeMs[1] - recipe.lifeMs[0]),
      scale0: recipe.scale[0] + Math.random() * (recipe.scale[1] - recipe.scale[0]),
      baseScale: node instanceof Sprite ? 0.085 : 1,
    });
  }

  let disposed = false;
  const update = () => {
    if (disposed || layer.destroyed) {
      disposed = true;
      app.ticker.remove(update);
      return;
    }
    const deltaMs = Math.min(64, app.ticker.deltaMS);
    let alive = 0;
    for (const p of particles) {
      if (p.age >= p.life) {
        p.node.visible = false;
        continue;
      }
      alive += 1;
      p.age += deltaMs;
      p.vy += recipe.gravity * deltaMs;
      if (recipe.jitter) p.vx += (Math.random() - 0.5) * recipe.jitter * deltaMs;
      p.node.x += p.vx * deltaMs;
      p.node.y += p.vy * deltaMs;
      p.node.rotation += p.spin * deltaMs;
      const t = Math.min(1, p.age / p.life);
      p.node.alpha = recipe.alpha * (t < 0.12 ? t / 0.12 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
      p.node.scale.set(p.scale0 * p.baseScale * (1 - t * 0.45));
    }
    if (!alive && !disposed) cleanup();
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    app.ticker.remove(update);
    layer.destroy({ children: true });
  };
  update();
  app.ticker.add(update);
  registerCleanup(cleanup);
}

/** A bright contact point at the moment of impact — the "crack" of the hit. */
function renderPixiContactFlash(add: PixiAdd, tweens: gsap.core.Tween[], point: PixiPoint, palette: PixiPalette) {
  const flash = add(new Graphics(), 12);
  flash.blendMode = 'add';
  drawGlowCircle(flash, point.x, point.y, 16, palette.hot, 0.9);
  drawGlowCircle(flash, point.x, point.y, 34, palette.core, 0.4);
  flash.filters = [new BlurFilter({ strength: 2 })];
  tweens.push(gsap.to(flash, {
    alpha: 0,
    duration: 0.16,
    ease: 'power2.out',
    onComplete: () => flash.destroy(),
  }));
}

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
  onImpact,
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
  onImpact?: () => void;
}) {
  const beamPalette = palette;
  const aim = projectileAimBasis(start, end);
  const effectDx = aim.dir.x * dist;
  const effectDy = aim.dir.y * dist;
  const effectNormal = aim.normal;
  const beamSequenceKey = profile.beamSequenceKey;
  const beamSequenceFrames = textures.projectileSequenceFrames[beamSequenceKey] ?? textures.projectileBeamFrames;
  const useBeamSequence = beamSequenceFrames.length > 0;
  const initialBeamFrame = beamSequenceFrames[0] ?? textures.projectileBeamFrames[0];
  let currentBeamFrameIndex = -1;
  const plan = createFastProjectilePlan(dist, profile);
  const core = add(new Graphics(), 6);
  const bloom = add(new Graphics(), 5);
  const source = add(new Graphics(), 4);
  const beam = add(new Sprite(initialBeamFrame.texture), 9);
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
  const activeParticles: LiveVfxParticle[] = [];
  const allParticles: Particle[] = [];
  const totalMs = plan.impactDelayMs + 520;
  let elapsedMs = 0;
  let emitterBudget = plan.emitterParticleCount;
  let emitterAccumulator = 0;
  let trailAccumMs = 0;
  let trailTick = 0;
  let launchBurstDone = false;
  let impactDone = false;
  let disposed = false;

  const spawnTrailParticle = (point: PixiPoint, travelAngle: number, strength: number) => {
    trailTick += 1;
    const useSmoke = trailTick % 3 === 0;
    const texture = useSmoke
      ? textures.smokes[Math.floor(Math.random() * textures.smokes.length)]
      : textures.sparks[Math.floor(Math.random() * textures.sparks.length)];
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.blendMode = 'add';
    sprite.tint = useSmoke ? beamPalette.core : (Math.random() > 0.35 ? beamPalette.hot : beamPalette.core);
    const backX = point.x - Math.cos(travelAngle) * 5 + (Math.random() - 0.5) * 3.5;
    const backY = point.y - Math.sin(travelAngle) * 5 + (Math.random() - 0.5) * 3.5;
    sprite.x = backX;
    sprite.y = backY;
    sprite.rotation = Math.random() * Math.PI * 2;
    const startScale = (useSmoke ? 0.11 : 0.07) * (0.75 + Math.random() * 0.55) * (0.4 + strength * 0.6);
    const state = {
      alpha: (useSmoke ? 0.42 : 0.85) * strength,
      scale: startScale,
      x: backX,
      y: backY,
    };
    sprite.scale.set(startScale);
    sprite.alpha = state.alpha;
    add(sprite, 6);
    tweens.push(gsap.to(state, {
      alpha: 0,
      scale: startScale * 0.35,
      x: backX - Math.cos(travelAngle) * 14,
      y: backY - Math.sin(travelAngle) * 14,
      duration: 0.3 + Math.random() * 0.18,
      ease: 'power1.out',
      onUpdate: () => {
        sprite.alpha = state.alpha;
        sprite.scale.set(state.scale);
        sprite.x = state.x;
        sprite.y = state.y;
      },
      onComplete: () => sprite.destroy(),
    }));
  };

  core.blendMode = bloom.blendMode = source.blendMode = particleLayer.blendMode = smokeLayer.blendMode = 'add';
  beam.blendMode = useBeamSequence ? projectileBeamSequence.blendMode : 'add';
  bloom.filters = [new BlurFilter({ strength: 3 })];
  source.filters = [new BlurFilter({ strength: 2 })];
  beam.anchor.set(initialBeamFrame.tipAnchorX, initialBeamFrame.centerAnchorY);
  beam.alpha = 0;
  beam.tint = 0xffffff;
  beam.scale.set(0.01);

  const updateBeamSequenceTexture = (progress: number) => {
    if (!useBeamSequence) return;
    const frameIndex = projectileFlightFrameIndex(progress, profile.beamSequenceFrameRange);
    if (frameIndex === currentBeamFrameIndex) return;
    currentBeamFrameIndex = frameIndex;
    const frame = beamSequenceFrames[frameIndex] ?? initialBeamFrame;
    beam.texture = frame.texture;
    beam.anchor.x = frame.tipAnchorX;
    beam.anchor.y = frame.centerAnchorY;
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

  const emitFlightParticle = (headT: number, headPoint: PixiPoint) => {
    if (emitterBudget <= 0) return;
    emitterBudget -= 1;
    const side = Math.random() > 0.5 ? 1 : -1;
    const backT = Math.max(0, headT - Math.random() * plan.trailFraction * 0.72);
    const p = projectilePathSample(start, end, backT, profile.arcBend, profile.pathWobble, profile.pathWaves).point;
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
    if (Math.random() < (profile.wakeAlpha ?? 0.5) * 0.34) {
      const smokeTexture = textures.smokes[(emitterBudget + Math.floor(Math.random() * textures.smokes.length)) % textures.smokes.length];
      createParticle(
        smokeLayer,
        smokeTexture,
        {
          x: p.x + effectNormal.x * lateral * 0.35,
          y: p.y + effectNormal.y * lateral * 0.35,
        },
        {
          x: -effectDx * 0.00008 + effectNormal.x * (Math.random() - 0.5) * 0.028,
          y: -effectDy * 0.00008 + effectNormal.y * (Math.random() - 0.5) * 0.028,
        },
        130 + Math.random() * 90,
        (profile.tailSmokeScale + Math.random() * 0.025) * profile.particleScale,
        (0.06 + Math.random() * 0.08) * (profile.wakeAlpha ?? 0.5),
      );
    }
  };

  const spawnLaunchBurst = () => {
    if (launchBurstDone) return;
    launchBurstDone = true;
    const count = Math.round(6 + profile.particleDensity * 5);
    for (let i = 0; i < count; i += 1) {
      const side = Math.random() - 0.5;
      const textureKey = profile.textureMix[i % profile.textureMix.length];
      createParticle(
        particleLayer,
        vfxTexture(textures, textureKey),
        {
          x: start.x + aim.dir.x * (2 + Math.random() * 8),
          y: start.y + aim.dir.y * (2 + Math.random() * 8),
        },
        {
          x: -aim.dir.x * (0.05 + Math.random() * 0.08) + aim.normal.x * side * 0.16,
          y: -aim.dir.y * (0.05 + Math.random() * 0.08) + aim.normal.y * side * 0.16,
        },
        90 + Math.random() * 90,
        (0.016 + Math.random() * 0.028) * profile.particleScale,
        0.58 + Math.random() * 0.34,
      );
    }
  };

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    app.ticker.remove(update);
    allParticles.forEach((particle) => {
      if (particleLayer.particleChildren.includes(particle)) particleLayer.removeParticle(particle);
      if (smokeLayer.particleChildren.includes(particle)) smokeLayer.removeParticle(particle);
    });
    particleLayer.destroy();
    smokeLayer.destroy();
    core.destroy();
    bloom.destroy();
    source.destroy();
    beam.destroy();
  };

  const spawnImpact = () => {
    if (impactDone) return;
    impactDone = true;
    beam.alpha = 0;
    beam.visible = false;
    core.clear();
    bloom.clear();
    onImpact?.();
    renderPixiImpact(add, tweens, end, palette, event, 0, textures, createImpactVfxPlan(event));
    renderPixiContactFlash(add, tweens, end, palette);
    renderPixiDebrisBurst(add, app, end, palette, textures, battleDebrisRecipeForEvent(event), registerCleanup);
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
      plan.launchDelayMs * 0.45 + Math.random() * plan.flightDurationMs * 0.18
    );
  }

  function update() {
    const deltaMs = app.ticker.deltaMS;
    elapsedMs += deltaMs;
    const flightElapsedMs = Math.max(0, elapsedMs - plan.launchDelayMs);
    const travelT = Math.min(1, flightElapsedMs / plan.flightDurationMs);
    const headT = projectileHeadProgress(travelT);
    const path = projectilePathSample(start, end, headT, profile.arcBend, profile.pathWobble, profile.pathWaves);
    const headPoint = path.point;
    const angle = path.angle;
    const trailSegments = projectileTrailSegments(headT, plan);

    if (elapsedMs >= plan.launchDelayMs && !launchBurstDone) {
      spawnLaunchBurst();
    }

    if (elapsedMs >= plan.impactDelayMs && !impactDone) {
      spawnImpact();
    }

    source.clear();
    const chargeT = Math.min(1, elapsedMs / Math.max(1, plan.launchDelayMs));
    const releaseT = Math.max(0, Math.min(1, (elapsedMs - plan.launchDelayMs) / 110));
    const sourceAlpha = elapsedMs < plan.launchDelayMs ? 0.28 + chargeT * 0.72 : 1 - releaseT;
    const chargeRadius = 9 + chargeT * 10 + releaseT * 16;
    drawGlowCircle(source, start.x, start.y, chargeRadius, beamPalette.core, sourceAlpha * 0.12);
    drawGlowCircle(source, start.x, start.y, Math.max(3, 7 - releaseT * 3), beamPalette.hot, sourceAlpha * 0.68);
    source.circle(start.x, start.y, 12 + chargeT * 7 + releaseT * 9);
    source.stroke({ color: beamPalette.core, width: 1.5, alpha: sourceAlpha * 0.58 });
    source.moveTo(start.x - aim.normal.x * 8 - aim.dir.x * 7, start.y - aim.normal.y * 8 - aim.dir.y * 7);
    source.lineTo(start.x + aim.dir.x * (12 + chargeT * 13), start.y + aim.dir.y * (12 + chargeT * 13));
    source.stroke({ color: beamPalette.hot, width: 1.2, alpha: sourceAlpha * 0.54, cap: 'round' });

    core.clear();
    bloom.clear();
    if (!impactDone && elapsedMs >= plan.launchDelayMs && elapsedMs < plan.impactDelayMs) {
      updateBeamSequenceTexture(travelT);
      const beamAlpha = Math.min(1, travelT / 0.08);
      const body = projectileBodyEnvelope(headT);
      const bodyScale = projectileBodyRenderScale(
        (profile.beamSequenceScale ?? 0.42) * body.scale,
        path.depthEnvelope,
        profile.depthScale,
      );
      if (PROJECTILE_TRAIL_MODE === 'strokes') {
        for (const segment of trailSegments) {
          const segmentStart = projectilePathSample(start, end, segment.startT, profile.arcBend, profile.pathWobble, profile.pathWaves).point;
          const segmentEnd = projectilePathSample(start, end, segment.endT, profile.arcBend, profile.pathWobble, profile.pathWaves).point;
          const strength = segment.strength * beamAlpha;

          bloom.moveTo(segmentStart.x, segmentStart.y);
          bloom.lineTo(segmentEnd.x, segmentEnd.y);
          bloom.stroke({
            color: beamPalette.core,
            width: Math.max(11, profile.bloomWidth * 0.72) * (0.28 + segment.strength * 0.72),
            alpha: 0.28 * strength,
            cap: 'round',
          });

          core.moveTo(segmentStart.x, segmentStart.y);
          core.lineTo(segmentEnd.x, segmentEnd.y);
          core.stroke({
            color: beamPalette.core,
            width: Math.max(3.4, profile.coreWidth * 0.62) * (0.2 + segment.strength * 0.8),
            alpha: 0.76 * strength,
            cap: 'round',
          });

          if (segment.strength > 0.48) {
            const hotStrength = (segment.strength - 0.48) / 0.52;
            core.moveTo(segmentStart.x, segmentStart.y);
            core.lineTo(segmentEnd.x, segmentEnd.y);
            core.stroke({
              color: beamPalette.hot,
              width: 1.15 + hotStrength * 1.55,
              alpha: 0.9 * hotStrength * beamAlpha,
              cap: 'round',
            });
          }
        }
      } else {
        trailAccumMs += deltaMs;
        while (trailAccumMs >= 13) {
          trailAccumMs -= 13;
          spawnTrailParticle(headPoint, angle, beamAlpha);
        }
      }
      drawGlowCircle(bloom, headPoint.x, headPoint.y, Math.max(6, profile.headGlowRadius * 0.48), beamPalette.core, 0.08 * beamAlpha);
      if (profile.vectorHeadAlpha > 0) {
        drawBeamHead(core, headPoint, angle, effectNormal, beamPalette, profile);
      }
      beam.x = headPoint.x;
      beam.y = headPoint.y;
      beam.rotation = angle;
      beam.alpha = body.alpha * beamAlpha;
      beam.scale.set(bodyScale.x, bodyScale.y);
    } else {
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
    const fallbackStart = { x: width * fallback.from.x / 100, y: height * fallback.from.y / 100 };
    const fallbackEnd = { x: width * fallback.to.x / 100, y: height * fallback.to.y / 100 };
    return {
      start: fallbackStart,
      sourceEffect: fallbackStart,
      end: fallbackEnd,
      targetBox: { x: fallbackEnd.x - 72, y: fallbackEnd.y - 100, width: 144, height: 200 },
      selfTarget: fallback.selfTarget,
    };
  }

  const actorRect = actorElement.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();
  const renderSize = { width, height };
  const actorCenterX = actorRect.left + actorRect.width / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const actorToRight = targetCenterX >= actorCenterX;
  const start = pointInHost({
    x: actorToRight ? actorRect.right - actorRect.width * 0.18 : actorRect.left + actorRect.width * 0.18,
    y: actorRect.top + actorRect.height * 0.34,
  }, hostRect, renderSize);
  const end = targetHitPointInHost(targetRect, hostRect, renderSize);
  const sourceEffect = sourceCastPointInHost(actorRect, hostRect, renderSize);
  const targetBox = rectInHost(targetRect, hostRect, renderSize);

  return {
    start: {
      x: Math.max(0, Math.min(width, start.x)),
      y: Math.max(0, Math.min(height, start.y)),
    },
    sourceEffect: {
      x: Math.max(0, Math.min(width, sourceEffect.x)),
      y: Math.max(0, Math.min(height, sourceEffect.y)),
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
  const persistentLayerRef = useRef<Container | null>(null);
  const texturesRef = useRef<BattleVfxTextures | null>(null);
  const tweensRef = useRef<gsap.core.Tween[]>([]);
  const tickerCleanupRef = useRef<TickerCleanup[]>([]);
  const persistentTickerCleanupRef = useRef<TickerCleanup[]>([]);
  const [renderToken, setRenderToken] = useState(0);
  const textureSignature = battleVfxTextureAssets.map((asset) => `${asset.id}:${asset.src}`).join('|');

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
      const persistentLayer = new Container();
      persistentLayer.sortableChildren = true;
      const layer = new Container();
      layer.sortableChildren = true;
      persistentLayerRef.current = persistentLayer;
      layerRef.current = layer;
      app.stage.addChild(persistentLayer);
      app.stage.addChild(layer);
      setRenderToken((value) => value + 1);
    })();

    return () => {
      disposed = true;
      tickerCleanupRef.current.forEach((cleanup) => cleanup());
      tickerCleanupRef.current = [];
      persistentTickerCleanupRef.current.forEach((cleanup) => cleanup());
      persistentTickerCleanupRef.current = [];
      tweensRef.current.forEach((tween) => tween.kill());
      tweensRef.current = [];
      layerRef.current = null;
      persistentLayerRef.current = null;
      texturesRef.current = null;
      appRef.current = null;
      if (initialized) {
        app.destroy(true);
      }
    };
  }, [textureSignature]);

  useEffect(() => {
    const app = appRef.current;
    const layer = persistentLayerRef.current;
    const host = hostRef.current;
    const textures = texturesRef.current;
    const clearPersistentEffects = () => {
      persistentTickerCleanupRef.current.forEach((cleanup) => cleanup());
      persistentTickerCleanupRef.current = [];
      layer?.removeChildren().forEach((child) => child.destroy({ children: true }));
    };

    clearPersistentEffects();
    if (!app || !layer || !host || !textures || disabled) return clearPersistentEffects;

    const hostRect = host.getBoundingClientRect();
    const width = hostRect.width;
    const height = hostRect.height;
    const root = host.parentElement ?? host;
    const add: PixiAdd = <T extends Container | Graphics | Text | Sprite>(node: T, zIndex = 1) => {
      node.zIndex = zIndex;
      layer.addChild(node);
      return node;
    };

    for (const unit of [...board.bottom, ...board.top]) {
      if (!unit?.alive) continue;
      const activeKeys = activeBattleBuffKeys(unit.buffs.map((buff) => buff.name));
      if (!activeKeys.length) continue;
      const unitElement = findBattleUnitElement(root, unit.tag);
      if (!unitElement) continue;
      const box = rectInHost(unitElement.getBoundingClientRect(), hostRect, { width, height });
      const targetBox = {
        x: Math.max(0, Math.min(width, box.x)),
        y: Math.max(0, Math.min(height, box.y)),
        width: Math.max(1, Math.min(width, box.width)),
        height: Math.max(1, Math.min(height, box.height)),
      };
      renderPixiBuffAuraLoop(add, app, activeKeys, targetBox, textures, (cleanup) => {
        persistentTickerCleanupRef.current.push(cleanup);
      });
    }

    return clearPersistentEffects;
  }, [board, disabled, renderToken]);

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

    if (mode === 'buff') {
      // The buff lands at the center of the card it marks, not at the caster's edge.
      const buffKey = battleBuffKeyForName(event.buffName ?? event.buffTypeEffect ?? event.typeEffect);
      const pulsePalette = buffKey ? BATTLE_BUFF_DISPLAY[buffKey].palette : palette;
      const pulsePoint = {
        x: targetBox.x + targetBox.width / 2,
        y: targetBox.y + targetBox.height / 2,
      };
      const pulse = add(new Graphics(), 1);
      pulse.blendMode = 'add';
      pulse.filters = [new BlurFilter({ strength: 4 })];
      drawGlowCircle(pulse, pulsePoint.x, pulsePoint.y, 20, pulsePalette.core, 0.5);
      tweensRef.current.push(gsap.to(pulse, {
        alpha: 0,
        duration: 0.52,
        ease: 'power3.out',
        onUpdate: () => {
          pulse.clear();
          drawGlowCircle(pulse, pulsePoint.x, pulsePoint.y, 24 + (1 - pulse.alpha) * 80, pulsePalette.core, pulse.alpha * 0.5);
        },
        onComplete: () => pulse.destroy(),
      }));
    }

    if (mode === 'buff') {
      renderPixiBuff(add, tweensRef.current, end, targetBox, palette, event, textures);
      return;
    }

    if (mode === 'projectile' && !selfTarget && textures) {
      const targetElement = findBattleUnitElement(host.parentElement ?? host, event.defender);
      const impactDirection = dx >= 0 ? 1 : -1;
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
        onImpact: () => {
          if (!targetElement || typeof targetElement.animate !== 'function') return;
          const strength = profile.impactStyle === 'crush' ? 6 : profile.impactStyle === 'pierce' ? 2.5 : 4;
          targetElement.animate([
            { translate: '0 0', filter: 'brightness(1)' },
            { offset: 0.2, translate: `${impactDirection * strength}px 0`, filter: 'brightness(1.34)' },
            { offset: 0.48, translate: `${impactDirection * -strength * 0.42}px 0`, filter: 'brightness(1.12)' },
            { translate: '0 0', filter: 'brightness(1)' },
          ], {
            duration: profile.impactStyle === 'crush' ? 210 : 160,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          });
        },
      });
    } else if (mode === 'projectile' && !selfTarget) {
      renderPixiImpact(add, tweensRef.current, end, palette, event, 0, undefined, createImpactVfxPlan(event));
    } else {
      renderPixiInstant(add, app, tweensRef.current, end, palette, event, textures, profile, (cleanup) => {
        tickerCleanupRef.current.push(cleanup);
      });
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

function BattleResultReveal({
  outcome,
  result,
  board,
  totalRounds,
  reducedMotion,
}: {
  outcome: BattleOutcome;
  result: BattleResult;
  board: BattleBoardState;
  totalRounds: number;
  reducedMotion?: boolean;
}) {
  const presentation = outcome === 'victory'
    ? {
        eyebrow: 'Battle Concluded',
        title: 'Victory',
        statement: `${board.bottomLabel} commands the field`,
        accent: '#e3c589',
        hot: '#fff1bd',
        muted: '#8f6b32',
        backdrop: 'radial-gradient(circle at 50% 48%, rgba(216,176,108,0.32), rgba(14,10,5,0.9) 48%, rgba(0,0,0,0.96) 100%)',
        Icon: Crown,
      }
    : outcome === 'defeat'
      ? {
          eyebrow: 'The Field Is Lost',
          title: 'Defeat',
          statement: `${result.winnerLabel ?? result.winner} holds the field`,
          accent: '#cf7568',
          hot: '#ffc1b5',
          muted: '#71352f',
          backdrop: 'radial-gradient(circle at 50% 48%, rgba(137,45,37,0.34), rgba(17,7,6,0.92) 48%, rgba(0,0,0,0.97) 100%)',
          Icon: Skull,
        }
      : {
          eyebrow: 'No Side Yields',
          title: 'Stalemate',
          statement: 'The field falls silent without a victor',
          accent: '#b8b0a1',
          hot: '#eee8da',
          muted: '#5f5a52',
          backdrop: 'radial-gradient(circle at 50% 48%, rgba(148,137,119,0.22), rgba(12,11,10,0.92) 48%, rgba(0,0,0,0.97) 100%)',
          Icon: Shield,
        };
  const bottomAlive = board.bottom.filter((unit) => unit?.alive && unit.hp > 0).length;
  const topAlive = board.top.filter((unit) => unit?.alive && unit.hp > 0).length;
  const enter = reducedMotion ? { duration: 0 } : { duration: 0.72, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <motion.div
      key={`battle-result-${outcome}-${result.winner}`}
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-40 flex items-start justify-center overflow-hidden pt-8 sm:pt-12 lg:pt-16"
      style={{ backgroundImage: presentation.backdrop }}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={enter}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.72),transparent_20%,transparent_80%,rgba(0,0,0,0.72))]" />
      <motion.div
        className="pointer-events-none absolute left-1/2 top-[38%] h-[min(70vw,560px)] w-[min(70vw,560px)] -translate-x-1/2 -translate-y-1/2 rotate-45 border"
        style={{ borderColor: `${presentation.accent}33`, boxShadow: `inset 0 0 80px ${presentation.accent}14, 0 0 80px ${presentation.accent}12` }}
        initial={reducedMotion ? false : { opacity: 0, scale: 0.72, rotate: 34 }}
        animate={{ opacity: 1, scale: 1, rotate: 45 }}
        transition={enter}
      />
      <motion.div
        className="pointer-events-none absolute left-1/2 top-[38%] h-[min(46vw,360px)] w-[min(46vw,360px)] -translate-x-1/2 -translate-y-1/2 rotate-45 border"
        style={{ borderColor: `${presentation.hot}24` }}
        initial={reducedMotion ? false : { opacity: 0, scale: 1.25 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...enter, delay: reducedMotion ? 0 : 0.1 }}
      />

      {!reducedMotion && Array.from({ length: 22 }, (_, index) => {
        const angle = index / 22 * Math.PI * 2;
        const distance = 132 + index % 5 * 22;
        return (
          <motion.span
            key={index}
            className="pointer-events-none absolute left-1/2 top-[38%] h-px origin-left"
            style={{ width: index % 3 === 0 ? 34 : 18, background: `linear-gradient(90deg, ${presentation.hot}, transparent)` }}
            initial={{ opacity: 0, x: 0, y: 0, rotate: angle * 180 / Math.PI, scaleX: 0.15 }}
            animate={{
              opacity: [0, index % 3 === 0 ? 0.82 : 0.48, 0],
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance,
              scaleX: [0.15, 1, 0.35],
            }}
            transition={{ duration: 0.8, delay: 0.08 + index * 0.012, ease: [0.16, 1, 0.3, 1] }}
          />
        );
      })}

      <div className="relative z-10 w-full max-w-3xl px-6 text-center">
        <motion.div
          className="mx-auto flex h-16 w-16 rotate-45 items-center justify-center border bg-black/45 sm:h-20 sm:w-20 lg:h-24 lg:w-24"
          style={{ borderColor: `${presentation.accent}66`, boxShadow: `0 0 42px ${presentation.accent}30` }}
          initial={reducedMotion ? false : { opacity: 0, scale: 0.6, rotate: 24 }}
          animate={{ opacity: 1, scale: 1, rotate: 45 }}
          transition={enter}
        >
          <presentation.Icon className="-rotate-45" size={34} strokeWidth={1.15} style={{ color: presentation.hot }} />
        </motion.div>

        <motion.div
          className="mt-5 text-[10px] uppercase tracking-[0.5em] sm:mt-6 sm:text-xs"
          style={{ color: presentation.accent }}
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...enter, delay: reducedMotion ? 0 : 0.12 }}
        >
          {presentation.eyebrow}
        </motion.div>
        <motion.h2
          className="mt-2 font-display text-[clamp(3rem,7vw,6.5rem)] font-light uppercase leading-[0.86] tracking-[0.14em]"
          style={{ color: presentation.hot, textShadow: `0 0 38px ${presentation.accent}54` }}
          initial={reducedMotion ? false : { opacity: 0, y: 22, letterSpacing: '0.24em' }}
          animate={{ opacity: 1, y: 0, letterSpacing: '0.14em' }}
          transition={{ ...enter, delay: reducedMotion ? 0 : 0.17 }}
        >
          {presentation.title}
        </motion.h2>
        <motion.div
          className="mx-auto mt-5 flex max-w-xl items-center gap-4 sm:mt-6"
          initial={reducedMotion ? false : { opacity: 0, scaleX: 0.25 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ ...enter, delay: reducedMotion ? 0 : 0.24 }}
        >
          <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${presentation.muted})` }} />
          <Sparkles size={14} strokeWidth={1.25} style={{ color: presentation.accent }} />
          <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${presentation.muted}, transparent)` }} />
        </motion.div>
        <motion.p
          className="mt-4 text-sm uppercase tracking-[0.24em] text-stone-300 sm:text-base"
          initial={reducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...enter, delay: reducedMotion ? 0 : 0.3 }}
        >
          {presentation.statement}
        </motion.p>
        <motion.div
          className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[10px] uppercase tracking-[0.26em] text-stone-500 sm:mt-7"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...enter, delay: reducedMotion ? 0 : 0.36 }}
        >
          <span>Round {totalRounds}</span>
          <span style={{ color: presentation.accent }}>Survivors {bottomAlive} · {topAlive}</span>
          <span>Final HP {result.finalHpA ?? 0} · {result.finalHpB ?? 0}</span>
        </motion.div>
      </div>
    </motion.div>
  );
}

function ArenaStage({
  board,
  currentEvent,
  totalRounds,
  reducedMotion,
  resultReveal,
  editUnitSlots,
  onUnitSlotChange,
}: {
  board: BattleBoardState;
  currentEvent?: BattleEvent | null;
  totalRounds: number;
  reducedMotion?: boolean;
  resultReveal?: { outcome: BattleOutcome; result: BattleResult } | null;
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
      <AnimatePresence>
        {resultReveal ? (
          <BattleResultReveal
            outcome={resultReveal.outcome}
            result={resultReveal.result}
            board={board}
            totalRounds={totalRounds}
            reducedMotion={reducedMotion}
          />
        ) : null}
      </AnimatePresence>
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
  showResultReveal = true,
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
  const reachedFinalEvent = started && events.length > 0 && safeEventIndex >= events.length - 1;
  const playbackFinished = reachedFinalEvent && !isPlaying;
  const outcome = useMemo(() => battleOutcomeForBottom(result, result.board ?? board), [board, result]);
  const playbackBoard = useMemo(() => {
    if (!started) return boardHistory[0] ?? board;
    if (reachedFinalEvent) return result.board ?? boardHistory[boardHistory.length - 1] ?? board;
    if (boardHistory.length >= events.length) {
      const historyIndex = battlePlaybackHistoryIndex(boardHistory.length, events.length, safeEventIndex);
      const indexedBoard = historyIndex >= 0 ? boardHistory[historyIndex] : undefined;
      if (indexedBoard) return indexedBoard;
    }
    const completesRound = events[safeEventIndex + 1]?.round !== currentRound;
    const eligibleBoards = boardHistory.filter((entry) => completesRound ? entry.round <= currentRound : entry.round < currentRound);
    return eligibleBoards[eligibleBoards.length - 1] ?? boardHistory[0] ?? board;
  }, [board, boardHistory, currentRound, events, reachedFinalEvent, result.board, safeEventIndex, started]);
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
            {playbackFinished
              ? `Battle resolved · ${result.winnerLabel ?? result.winner}`
              : currentEvent
                ? `${eventActionLabel(currentEvent)} - ${currentEvent.attacker} to ${currentEvent.defender}`
                : events.length
                  ? 'Ready. Start battle to execute the resolved combat feed.'
                  : 'No combat feed generated.'}
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
              if (!started || playbackFinished) {
                startPlayback();
                return;
              }
              setIsPlaying((value) => !value);
            }}
            disabled={!events.length || (started && reducedMotion)}
            className="flex h-11 items-center justify-center gap-2 border border-white/10 bg-black/45 px-4 text-[10px] uppercase tracking-[0.18em] text-stone-300 transition hover:border-[#b49664]/45 hover:text-[#f0d8ad] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={playbackFinished ? 'Replay battle' : isPlaying ? 'Pause battle playback' : 'Play battle playback'}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            <span>{!started ? 'Start Battle' : playbackFinished ? 'Replay' : isPlaying ? 'Pause' : 'Play'}</span>
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
              resultReveal={showResultReveal && playbackFinished ? { outcome, result } : null}
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
          resultReveal={showResultReveal && playbackFinished ? { outcome, result } : null}
          editUnitSlots={editUnitSlots}
          onUnitSlotChange={onUnitSlotChange}
        />
      )}
      <BattleLogPanel events={visibleEvents} logs={visibleLogs} currentEvent={currentEvent} orderBoard={playbackBoard} started={started} />
    </div>
  );
}
