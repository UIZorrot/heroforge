import { battleUsesInstantVfx, type BattleVfxPresentation } from '../lib/battleVfxPresentation';
import { useEffect, useMemo, useState } from 'react';
import { Crosshair, Minus, Move, Play, Plus, RotateCcw, Shield, Sparkles, Zap } from 'lucide-react';
import { ArenaBattleScene, type BattleOutcome } from './ArenaBattleScene';
import { PageHeader } from './PageHeader';
import { cn } from '../lib/utils';
import {
  createVfxScenarioBoard,
  placeVfxTeamUnits,
  vfxFormationCounts,
  vfxTestCount,
  type VfxTestTeamCounts,
  createVfxTestAction,
  type VfxTestFormation,
  createVfxTestResult,
  vfxTestCategories,
  vfxTestOptions,
  type VfxTestCategory,
} from '../lib/vfxTestHarness';
import './VfxTestPage.css';
import type { BattleBoardState, BattleBoardUnit } from '../lib/battleTypes';

const categoryIcons: Record<VfxTestCategory, typeof Zap> = {
  projectile: Zap,
  instant: Crosshair,
  buff: Shield,
};

function mergeBoardLayout(nextBoard: BattleBoardState, currentBoard: BattleBoardState) {
  const bottomSlots = new Map(currentBoard.bottom.filter((unit): unit is BattleBoardUnit => Boolean(unit)).map((unit) => [unit.tag, unit.slot]));
  const topSlots = new Map(currentBoard.top.filter((unit): unit is BattleBoardUnit => Boolean(unit)).map((unit) => [unit.tag, unit.slot]));

  return {
    ...nextBoard,
    bottom: placeVfxTeamUnits(nextBoard.bottom, bottomSlots),
    top: placeVfxTeamUnits(nextBoard.top, topSlots),
  };
}

function moveUnitWithinTeam(units: Array<BattleBoardUnit | null>, unitTag: string, targetSlot: number) {
  const teamUnits = units.filter((unit): unit is BattleBoardUnit => Boolean(unit));
  const actor = teamUnits.find((unit) => unit.tag === unitTag);
  if (!actor || actor.slot === targetSlot) return placeVfxTeamUnits(units);

  const occupant = teamUnits.find((unit) => unit.slot === targetSlot);
  const slotByTag = new Map(teamUnits.map((unit) => [unit.tag, unit.slot]));
  slotByTag.set(actor.tag, targetSlot);

  if (occupant && occupant.tag !== actor.tag) {
    slotByTag.set(occupant.tag, actor.slot);
  }

  return placeVfxTeamUnits(units, slotByTag);
}

export function VfxTestPage() {
  const [category, setCategory] = useState<VfxTestCategory>('projectile');
  const [effect, setEffect] = useState(vfxTestOptions.projectile[0]?.value ?? '');
  const [sequence, setSequence] = useState(1);
  const [amount, setAmount] = useState(360);
  const [crit, setCrit] = useState(false);
  const [formation, setFormation] = useState<VfxTestFormation>('duel');
  const [customCounts, setCustomCounts] = useState<VfxTestTeamCounts>({ allies: 1, enemies: 1 });
  const teamCounts = useMemo(() => vfxFormationCounts(formation, customCounts), [formation, customCounts]);
  const [targetCount, setTargetCount] = useState(1);
  const [presentation, setPresentation] = useState<BattleVfxPresentation>('auto');
  const [resultPreview, setResultPreview] = useState<Exclude<BattleOutcome, 'draw'> | null>(null);

  const options = vfxTestOptions[category];
  const selectedEffect = options.some((option) => option.value === effect) ? effect : options[0]?.value ?? effect;
  const defaultBoard = useMemo(() => createVfxScenarioBoard(category, selectedEffect, formation, customCounts), [category, selectedEffect, formation, customCounts]);
  const [board, setBoard] = useState<BattleBoardState>(() => createVfxScenarioBoard('projectile', vfxTestOptions.projectile[0]?.value ?? '', 'duel'));

  useEffect(() => {
    setBoard((currentBoard) => mergeBoardLayout(defaultBoard, currentBoard));
  }, [defaultBoard]);

  const events = useMemo(
    () => createVfxTestAction(board, category, selectedEffect, sequence, targetCount, { amount, crit, presentation }),
    [amount, board, category, crit, selectedEffect, sequence, targetCount, presentation]
  );
  const result = useMemo(() => createVfxTestResult(board, events), [board, events]);
  const previewBoard = useMemo<BattleBoardState>(() => {
    if (!resultPreview) return board;
    const defeatedSide = resultPreview === 'victory' ? 'top' : 'bottom';
    return {
      ...board,
      [defeatedSide]: board[defeatedSide].map((unit) => unit ? { ...unit, hp: 0, alive: false } : null),
    };
  }, [board, resultPreview]);
  const previewResult = useMemo(() => {
    if (!resultPreview) return result;
    const victory = resultPreview === 'victory';
    const finalHpA = previewBoard.bottom.reduce((sum, unit) => sum + (unit?.hp ?? 0), 0);
    const finalHpB = previewBoard.top.reduce((sum, unit) => sum + (unit?.hp ?? 0), 0);
    return {
      ...result,
      winner: victory ? 'A' : 'B',
      winnerLabel: victory ? previewBoard.bottomLabel : previewBoard.topLabel,
      events: [],
      logs: [],
      board: previewBoard,
      boardHistory: [previewBoard],
      finalHpA,
      finalHpB,
      aliveA: previewBoard.bottom.filter((unit) => unit?.alive && unit.hp > 0).length,
      aliveB: previewBoard.top.filter((unit) => unit?.alive && unit.hp > 0).length,
    };
  }, [previewBoard, result, resultPreview]);

  function adjustCards(side: keyof VfxTestTeamCounts, delta: number) {
    setCustomCounts({ ...teamCounts, [side]: vfxTestCount(teamCounts[side] + delta) });
    setFormation('custom');
    setResultPreview(null);
  }

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
    <div className="mx-auto min-h-[calc(100vh-74px)] max-w-[1680px] px-3 py-5 sm:px-6 sm:py-8 xl:px-8">
      <PageHeader
        title="VFX"
        eyebrow="Battle Lab"
        subtitle="Effect Test"
        description="The same action events, renderer, textures, and timing used by Battle."

      />

      <div className="vfx-lab">
        <section className="vfx-lab__controls border border-white/8 bg-black/24">
          <div className="border-b border-white/8 px-5 py-4">
            <div className="flex items-center gap-3">
              <Sparkles size={17} className="text-[#d8b06c]" />
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#b49664]">VFX Matrix</div>
            </div>
          </div>

          <div className="vfx-lab__settings space-y-6 p-5">
            <section className="vfx-lab__formation-editor" aria-label="Test cards and targets">
              <div className="vfx-lab__editor-title">Cards & targets</div>
              <label className="vfx-lab__preset">Formation<select aria-label="Test formation" value={formation} onChange={event => { setFormation(event.target.value as VfxTestFormation); setResultPreview(null); }}>
                <option value="duel">Duel · 1 vs 1</option><option value="full">Full · 6 vs 6</option><option value="pve">PvE · 4 vs 6</option><option value="custom">Custom</option>
              </select></label>
              {(['allies', 'enemies'] as const).map(side => {
                const label = side === 'allies' ? 'ally' : 'enemy';
                return <div key={side} className="vfx-lab__count-row">
                  <span>{side === 'allies' ? 'Allies' : 'Enemies'}<small>test cards</small></span>
                  <div className="vfx-lab__stepper">
                    <button type="button" aria-label={`Remove ${label} card`} title={`Remove last ${label} card`} disabled={teamCounts[side] <= 1} onClick={() => adjustCards(side, -1)}><Minus size={15} /></button>
                    <output aria-label={`${side === 'allies' ? 'Ally' : 'Enemy'} card count`}>{teamCounts[side]}<small>/6</small></output>
                    <button type="button" aria-label={`Add ${label} card`} title={`Add ${label} card`} disabled={teamCounts[side] >= 6} onClick={() => adjustCards(side, 1)}><Plus size={15} /></button>
                  </div>
                </div>;
              })}
              <div className="vfx-lab__count-row vfx-lab__target-row">
                <label htmlFor="vfx-target-count">Spell targets</label>
                <div className="vfx-lab__stepper">
                  <button type="button" aria-label="Decrease skill targets" disabled={targetCount <= 1} onClick={() => setTargetCount(value => vfxTestCount(value - 1))}><Minus size={15} /></button>
                  <select id="vfx-target-count" aria-label="Skill target count" value={targetCount} onChange={event => setTargetCount(vfxTestCount(Number(event.target.value)))}>
                    {[1, 2, 3, 4, 5, 6].map(count => <option key={count} value={count}>{count}</option>)}
                  </select>
                  <button type="button" aria-label="Increase skill targets" disabled={targetCount >= 6} onClick={() => setTargetCount(value => vfxTestCount(value + 1))}><Plus size={15} /></button>
                </div>
              </div>
              <p className="vfx-lab__target-feedback" aria-live="polite">{events.length} of {targetCount} targets affected</p>
            </section>

            <div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-600">Category</div>
              <div className="grid grid-cols-2 gap-2">
                {vfxTestCategories.map((item) => {
                  const Icon = categoryIcons[item.value];
                  const active = item.value === category;
                  return (
                    <button
                      key={item.value}
                      type="button"
                    onClick={() => {
                        setResultPreview(null);
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
                        setResultPreview(null);
                        setEffect(option.value);
                        setSequence((value) => value + 1);
                      }}
                      className={cn(
                        'min-h-11 border px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.16em] transition',
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
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-600">Battle Result</div>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Battle result preview">
                {([
                  { value: null, label: 'Effect' },
                  { value: 'victory', label: 'Victory' },
                  { value: 'defeat', label: 'Defeat' },
                ] as const).map((item) => {
                  const active = resultPreview === item.value;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setResultPreview(item.value);
                        setSequence((value) => value + 1);
                      }}
                      className={cn(
                        'h-10 border px-2 text-[9px] font-semibold uppercase tracking-[0.12em] transition',
                        active
                          ? item.value === 'defeat'
                            ? 'border-[#b95f54]/70 bg-[#8f332c]/14 text-[#efb0a6]'
                            : 'border-[#d8b06c]/70 bg-[#d8b06c]/10 text-stone-100'
                          : 'border-white/8 bg-black/28 text-stone-500 hover:border-white/18 hover:text-stone-300'
                      )}
                    >
                      {item.label}
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
              <div className="vfx-lab__slots mb-4"><label className="col-span-2">Delivery<select aria-label="Skill delivery" value={presentation} onChange={event => setPresentation(event.target.value as BattleVfxPresentation)}>
                <option value="auto">Auto · skill default</option><option value="instant">Instant · on target</option><option value="direct">Direct · caster to target</option>
              </select></label></div>
              <p className="mb-2 text-xs text-[#bca176]">{battleUsesInstantVfx(events) ? 'Instant · simultaneous target impacts' : 'Direct · cast, travel, impact'}</p>
              <p className="mb-4 text-xs text-stone-500">{targetCount} requested · {events.length} affected. Heal / Pray target allies; harmful effects target enemies.</p>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-600">
                <Move size={14} />
                Slot Drag
              </div>
              <p className="mt-2 text-xs leading-6 text-stone-500">
                Drag a card onto another slot to test attack paths and impact positions on the arena table.
              </p>
              <div className="vfx-lab__slots">
                {(['A1', 'B1'] as const).map((tag) => {
                  const team = tag === 'A1' ? board.bottom : board.top;
                  return <label key={tag}>{tag === 'A1' ? 'Caster slot' : 'Target slot'}<select aria-label={tag === 'A1' ? 'Caster slot' : 'Target slot'} value={team.find(unit => unit?.tag === tag)?.slot ?? 0} onChange={(event) => moveUnitToSlot(tag, Number(event.target.value))}>
                    {Array.from({ length: 6 }, (_, slot) => <option key={slot} value={slot}>{slot < 3 ? 'Front' : 'Back'} · {slot % 3 + 1}</option>)}
                  </select></label>;
                })}
              </div>
              <button
                type="button"
                onClick={resetFormation}
                className="mt-3 inline-flex min-h-11 items-center gap-2 border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-stone-400 transition hover:border-stone-500 hover:text-stone-100"
              >
                <RotateCcw size={13} />
                Reset formation
              </button>
            </div>
          </div>
        </section>

        <section className="vfx-lab__preview min-w-0">
          <ArenaBattleScene
            key={`${category}-${selectedEffect}-${sequence}-${amount}-${crit ? 'crit' : 'normal'}-${formation}-${teamCounts.allies}-${teamCounts.enemies}-${targetCount}-${presentation}-${resultPreview ?? 'effect'}`}
            board={previewBoard}
            events={resultPreview ? [] : events}
            logs={resultPreview ? [] : events.map(event => event.log)}
            result={previewResult}
            autoStartKey={`${category}-${selectedEffect}-${sequence}-${amount}-${crit ? 'crit' : 'normal'}-${formation}-${teamCounts.allies}-${teamCounts.enemies}-${targetCount}-${presentation}-${resultPreview ?? 'effect'}`}
            showCommanders={false}
            showResultReveal={false}
            resultPreviewOutcome={resultPreview}
            showPlaybackControls={false}
            editUnitSlots={!resultPreview}
            onUnitSlotChange={moveUnitToSlot}
          />
        </section>
      </div>
    </div>
  );
}
