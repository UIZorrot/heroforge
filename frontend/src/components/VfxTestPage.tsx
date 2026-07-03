import { useEffect, useMemo, useState } from 'react';
import { Crosshair, Move, Play, RotateCcw, Shield, Sparkles, Zap } from 'lucide-react';
import { ArenaBattleScene } from './ArenaBattleScene';
import { PageHeader, PageHeaderStat } from './PageHeader';
import { cn } from '../lib/utils';
import {
  createVfxTestBoard,
  createVfxTestEvent,
  createVfxTestResult,
  vfxTestCategories,
  vfxTestOptions,
  type VfxTestCategory,
} from '../lib/vfxTestHarness';
import type { BattleBoardState, BattleBoardUnit } from '../lib/battleTypes';

const categoryIcons: Record<VfxTestCategory, typeof Zap> = {
  projectile: Zap,
  instant: Crosshair,
  buff: Shield,
};

function placeTeamUnits(units: Array<BattleBoardUnit | null>, slotOverrides?: Map<string, number>) {
  const nextTeam = Array<BattleBoardUnit | null>(6).fill(null);

  for (const unit of units) {
    if (!unit) continue;
    const slot = slotOverrides?.get(unit.tag) ?? unit.slot;
    nextTeam[slot] = { ...unit, slot };
  }

  return nextTeam;
}

function mergeBoardLayout(nextBoard: BattleBoardState, currentBoard: BattleBoardState) {
  const bottomSlots = new Map(currentBoard.bottom.filter((unit): unit is BattleBoardUnit => Boolean(unit)).map((unit) => [unit.tag, unit.slot]));
  const topSlots = new Map(currentBoard.top.filter((unit): unit is BattleBoardUnit => Boolean(unit)).map((unit) => [unit.tag, unit.slot]));

  return {
    ...nextBoard,
    bottom: placeTeamUnits(nextBoard.bottom, bottomSlots),
    top: placeTeamUnits(nextBoard.top, topSlots),
  };
}

function moveUnitWithinTeam(units: Array<BattleBoardUnit | null>, unitTag: string, targetSlot: number) {
  const teamUnits = units.filter((unit): unit is BattleBoardUnit => Boolean(unit));
  const actor = teamUnits.find((unit) => unit.tag === unitTag);
  if (!actor || actor.slot === targetSlot) return placeTeamUnits(units);

  const occupant = teamUnits.find((unit) => unit.slot === targetSlot);
  const slotByTag = new Map(teamUnits.map((unit) => [unit.tag, unit.slot]));
  slotByTag.set(actor.tag, targetSlot);

  if (occupant && occupant.tag !== actor.tag) {
    slotByTag.set(occupant.tag, actor.slot);
  }

  return placeTeamUnits(units, slotByTag);
}

export function VfxTestPage() {
  const [category, setCategory] = useState<VfxTestCategory>('projectile');
  const [effect, setEffect] = useState(vfxTestOptions.projectile[0]?.value ?? 'flesh');
  const [sequence, setSequence] = useState(1);
  const [amount, setAmount] = useState(360);
  const [angleOffsetDeg, setAngleOffsetDeg] = useState(0);
  const [crit, setCrit] = useState(false);

  const options = vfxTestOptions[category];
  const selectedEffect = options.some((option) => option.value === effect) ? effect : options[0]?.value ?? effect;
  const defaultBoard = useMemo(() => createVfxTestBoard(category, selectedEffect), [category, selectedEffect]);
  const [board, setBoard] = useState<BattleBoardState>(() => createVfxTestBoard('projectile', vfxTestOptions.projectile[0]?.value ?? 'flesh'));

  useEffect(() => {
    setBoard((currentBoard) => mergeBoardLayout(defaultBoard, currentBoard));
  }, [defaultBoard]);

  const event = useMemo(
    () => createVfxTestEvent(category, selectedEffect, sequence, { amount, crit, angleOffsetDeg }),
    [amount, angleOffsetDeg, category, crit, selectedEffect, sequence]
  );
  const result = useMemo(() => createVfxTestResult(board, event), [board, event]);

  function resetFormation() {
    setBoard(defaultBoard);
  }

  function moveUnitToSlot(unitTag: string, targetSlot: number) {
    setBoard((currentBoard) => {
      const isBottomUnit = currentBoard.bottom.some((unit) => unit?.tag === unitTag);
      if (isBottomUnit) {
        return {
          ...currentBoard,
          bottom: moveUnitWithinTeam(currentBoard.bottom, unitTag, targetSlot),
        };
      }

      const isTopUnit = currentBoard.top.some((unit) => unit?.tag === unitTag);
      if (isTopUnit) {
        return {
          ...currentBoard,
          top: moveUnitWithinTeam(currentBoard.top, unitTag, targetSlot),
        };
      }

      return currentBoard;
    });
  }

  return (
    <div className="mx-auto min-h-[calc(100vh-74px)] max-w-[1680px] px-6 py-8 xl:px-8">
      <PageHeader
        title="VFX"
        eyebrow="Battle Lab"
        subtitle="Effect Test"
        description="Projectiles, instant hits, and card-border status VFX."
        stats={
          <>
            <PageHeaderStat label="Projectiles" value={vfxTestOptions.projectile.length} />
            <PageHeaderStat label="Instant" value={vfxTestOptions.instant.length} />
            <PageHeaderStat label="Buffs" value={vfxTestOptions.buff.length} />
            <PageHeaderStat label="Replay" value={sequence} />
          </>
        }
      />

      <div className="mt-6 grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="border border-white/8 bg-black/24">
          <div className="border-b border-white/8 px-5 py-4">
            <div className="flex items-center gap-3">
              <Sparkles size={17} className="text-[#d8b06c]" />
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#b49664]">VFX Matrix</div>
            </div>
          </div>

          <div className="space-y-6 p-5">
            <div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-600">Category</div>
              <div className="grid grid-cols-3 gap-2">
                {vfxTestCategories.map((item) => {
                  const Icon = categoryIcons[item.value];
                  const active = item.value === category;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setCategory(item.value);
                        setEffect(vfxTestOptions[item.value][0]?.value ?? '');
                        setSequence((value) => value + 1);
                      }}
                      className={cn(
                        'flex h-14 flex-col items-center justify-center gap-1 border text-[9px] font-semibold uppercase tracking-[0.16em] transition',
                        active
                          ? 'border-[#d8b06c]/70 bg-[#d8b06c]/10 text-stone-100 shadow-[0_0_22px_rgba(216,176,108,0.12)]'
                          : 'border-white/8 bg-black/28 text-stone-500 hover:border-white/18 hover:text-stone-300'
                      )}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-600">Effect</div>
              <div className="grid max-h-[360px] grid-cols-2 gap-2 overflow-auto pr-1">
                {options.map((option) => {
                  const active = option.value === selectedEffect;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setEffect(option.value);
                        setSequence((value) => value + 1);
                      }}
                      className={cn(
                        'min-h-10 border px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.16em] transition',
                        active
                          ? 'border-[#d8b06c]/70 bg-[#d8b06c]/10 text-stone-100'
                          : 'border-white/8 bg-black/24 text-stone-500 hover:border-white/18 hover:text-stone-300'
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-white/8 pt-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-600">Amount</div>
                <div className="text-sm font-light text-stone-300">{amount}</div>
              </div>
              <input
                type="range"
                min="80"
                max="900"
                step="20"
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
                className="w-full accent-[#d8b06c]"
                aria-label="VFX event amount"
              />
            </div>

            {category === 'projectile' ? (
              <div className="border-t border-white/8 pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-600">Angle</div>
                  <div className="text-sm font-light text-stone-300">{angleOffsetDeg} deg</div>
                </div>
                <input
                  type="range"
                  min="-35"
                  max="35"
                  step="1"
                  value={angleOffsetDeg}
                  onChange={(event) => {
                    setAngleOffsetDeg(Number(event.target.value));
                    setSequence((value) => value + 1);
                  }}
                  className="w-full accent-[#d8b06c]"
                  aria-label="Projectile VFX angle offset"
                />
              </div>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCrit((value) => !value)}
                disabled={category === 'buff'}
                className={cn(
                  'h-11 flex-1 border px-4 text-[10px] font-semibold uppercase tracking-[0.2em] transition disabled:cursor-not-allowed disabled:opacity-35',
                  crit && category !== 'buff'
                    ? 'border-red-300/60 bg-red-400/10 text-red-100'
                    : 'border-white/8 bg-black/28 text-stone-500 hover:border-white/18 hover:text-stone-300'
                )}
              >
                Crit
              </button>
              <button
                type="button"
                onClick={() => setSequence((value) => value + 1)}
                className="flex h-11 flex-[1.45] items-center justify-center gap-2 border border-[#d8b06c]/55 bg-[#d8b06c]/10 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-100 transition hover:border-[#f0d8ad]/75 hover:bg-[#d8b06c]/16"
              >
                <Play size={15} />
                Replay
              </button>
            </div>

            <div className="border-t border-white/8 pt-5">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-600">
                <Move size={14} />
                Slot Drag
              </div>
              <p className="mt-2 text-xs leading-6 text-stone-500">
                Drag cards from one slot to another. Only the card moves; the battlefield layout stays fixed.
              </p>
              <button
                type="button"
                onClick={resetFormation}
                className="mt-3 inline-flex items-center gap-2 border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-stone-400 transition hover:border-stone-500 hover:text-stone-100"
              >
                <RotateCcw size={13} />
                Reset formation
              </button>
            </div>
          </div>
        </section>

        <section className="min-w-0">
          <ArenaBattleScene
            board={board}
            events={[event]}
            logs={[event.log]}
            result={result}
            autoStartKey={`${category}-${selectedEffect}-${sequence}-${amount}-${crit ? 'crit' : 'normal'}`}
            showCommanders={false}
            editUnitSlots={true}
            onUnitSlotChange={moveUnitToSlot}
          />
        </section>
      </div>
    </div>
  );
}
