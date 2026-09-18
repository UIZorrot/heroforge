import { useEffect, useState } from 'react';
import type { BattleBoardUnit, BattleActionOption } from '../lib/battleTypes';
import type { BattleSessionAction } from '../types';
import './BattleSceneHud.css';

export type BattleSceneControls = {
  preparation?: { ownReady: boolean; rivalReady: boolean; busy: boolean; simulated: boolean; onConfirm: () => void };
  manual?: { actorTag: string | null; ownSide: 'A' | 'B'; options: BattleActionOption[]; busy: boolean; revision: number; waitingUntil?: number | null; serverNow?: number; onAction: (action: BattleSessionAction) => void };
};

export function BattleUnitInspector({ unit, onClose }: { unit: BattleBoardUnit; onClose: () => void }) {
  const stats = Object.entries(unit.state ?? {}).filter(([key]) => !['HP', 'MP', 'TYPE', 'type_catalog', 'type_effect', 'buff_type_effect'].includes(key));
  return <aside className={`battle-inspector battle-inspector--${unit.side === 'A' ? 'left' : 'right'}`} aria-label={`${unit.name} details`} onPointerMove={event => event.stopPropagation()}>
    <header><span>{unit.side === 'A' ? 'Left formation' : 'Right formation'} · {unit.tag}</span><button type="button" onClick={onClose} aria-label="Close unit details">×</button></header>
    <h3>{unit.name}</h3><p className="battle-inspector__type">{unit.state?.TYPE ?? 'Hero'}{!unit.alive && ' · Fallen'}</p>
    <dl className="battle-inspector__vitals"><div><dt>HP</dt><dd>{unit.hp.toLocaleString()} <small>/ {unit.maxHp.toLocaleString()}</small></dd></div><div><dt>MP</dt><dd>{unit.mp.toLocaleString()} <small>/ {unit.maxMp.toLocaleString()}</small></dd></div></dl>
    <dl className="battle-inspector__stats">{stats.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
    {unit.buffs.length > 0 && <div className="battle-inspector__buffs">{unit.buffs.map((buff, index) => <span key={`${buff.name}-${index}`}>{buff.name} · {buff.duration} turns · {buff.value}</span>)}</div>}
    <div className="battle-inspector__skills">{Object.entries(unit.skills ?? {}).map(([slot, skill]) => skill && <details key={`${unit.tag}-${slot}`}><summary>{skill.name ?? slot}<span>{skill.MP_COST ?? 0} MP</span></summary><p>{skill.description || 'No description available.'}</p><small>{[skill.TYPE, skill.ROLE, skill.RANGE, skill.TARGET].filter(Boolean).join(' · ')}</small></details>)}</div>
  </aside>;
}

export function BattleSceneHud({ controls, selected, units, presentationBusy }: { controls: BattleSceneControls; selected: BattleBoardUnit | null; units: BattleBoardUnit[]; presentationBusy: boolean }) {
  const prep = controls.preparation;
  const manual = controls.manual;
  if (prep) return <div className="battle-scene-dock" aria-label="Battle preparation" onPointerMove={event => event.stopPropagation()}>
    <p>{prep.ownReady ? 'Formation locked. Waiting for your opponent.' : 'Arrange your cards, then ready your formation.'}</p>
    <div className="battle-scene-dock__readiness" aria-live="polite"><span data-ready={prep.ownReady}>You · {prep.ownReady ? 'Ready' : 'Preparing'}</span><span data-ready={prep.rivalReady}>Opponent · {prep.rivalReady ? 'Ready' : 'Preparing'}</span></div>
    <button className="battle-scene-dock__confirm" type="button" disabled={prep.busy || prep.ownReady} onClick={prep.onConfirm}>{prep.busy ? 'Confirming…' : prep.ownReady ? 'Waiting for opponent' : 'Ready for battle'}</button>
    <small>{prep.simulated ? 'Your simulated opponent is ready.' : 'Battle starts when both players are ready.'}</small>
  </div>;
  if (!manual) return null;
  return <ManualCommands key={`${manual.actorTag}-${manual.revision}`} manual={manual} selected={selected} units={units} presentationBusy={presentationBusy} />;
}

function ManualCommands({ manual, selected, units, presentationBusy }: { manual: NonNullable<BattleSceneControls['manual']>; selected: BattleBoardUnit | null; units: BattleBoardUnit[]; presentationBusy: boolean }) {
  const [choice, setChoice] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!manual.waitingUntil) return;
    const receivedAt = Date.now();
    const serverTime = manual.serverNow ?? receivedAt;
    const update = () => setRemaining(Math.max(0, Math.ceil((manual.waitingUntil! - serverTime - (Date.now() - receivedAt)) / 1000)));
    update();
    const timer = window.setInterval(update, 200);
    return () => window.clearInterval(timer);
  }, [manual.waitingUntil, manual.serverNow]);
  const actor = units.find(unit => unit.tag === manual.actorTag);
  const ownTurn = actor?.side === manual.ownSide && manual.options.length > 0;
  const option = manual.options[choice];
  const target = selected && option?.targets.includes(selected.tag) ? selected : null;
  const disabled = presentationBusy || manual.busy || !ownTurn || remaining === 0;
  return <div className="battle-scene-dock battle-scene-dock--manual" onPointerMove={event => event.stopPropagation()}>
    <p aria-live="polite">{presentationBusy ? 'Resolving the action…' : ownTurn ? `${actor?.name} · Your turn` : `${actor?.name ?? 'Opponent'} is taking a turn…`}</p>
    {manual.waitingUntil && manual.options.length > 0 && remaining !== null && <div className="battle-scene-dock__timer" data-urgent={remaining <= 5} role="timer" aria-label="Time remaining"><strong>{remaining}s</strong><span>{remaining === 0 ? 'Time expired · resolving action' : 'Automatic action when time runs out'}</span></div>}
    {ownTurn && <><div className="battle-scene-dock__abilities">{manual.options.map((item, index) => <button key={item.skillSlot ?? item.kind} type="button" aria-pressed={choice === index} disabled={disabled || Boolean(item.disabled)} title={item.disabled ?? `${item.cost} MP`} onClick={() => setChoice(index)}>{item.name}<small>{item.cost ? `${item.cost} MP` : 'No MP cost'}</small></button>)}</div>
    <div className="battle-scene-dock__cast"><span>{option?.disabled ?? (target ? `Target · ${target.name}` : 'Select a unit on the battlefield to target.')}</span><button type="button" className="battle-scene-dock__confirm" disabled={disabled || !target || !option || Boolean(option.disabled)} onClick={() => option && target && manual.actorTag && manual.onAction({ actorTag: manual.actorTag, kind: option.kind, skillSlot: option.skillSlot, targetTag: target.tag, expectedEventCount: manual.revision })}>{manual.busy ? 'Sending…' : option?.kind === 'skill' ? 'Cast skill' : 'Attack'}</button></div>
    {option && !target && <small>Valid targets: {option.targets.map(tag => units.find(unit => unit.tag === tag)?.name ?? tag).join(', ') || 'None'}</small>}</>}
  </div>;
}
