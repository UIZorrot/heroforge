import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Coins, Flame, RotateCcw, ScrollText, Shield, Skull, Swords } from 'lucide-react';
import { BattleVisualizer } from './BattleVisualizer';
import { createPveRun, fetchActivePveRun, fetchPveCatalog, fetchPveRun, mutatePveRun } from '../lib/api';
import { pvePreviewCatalog } from '../lib/pvePreviewCatalog';
import { pveBattleResult, pveBpEligibility, type PveCatalog, type PveInput, type PveOperation, type PveRun, type PveTier } from '../lib/pveTypes';
import { applyPreparationPositions, formationPositions, movePreparationCard } from '../lib/battlePreparation';
import { CAN_PLAY_PVE_PREVIEW, createPreviewPveRun, fetchActivePreviewPveRun, fetchPreviewPveRun, mutatePreviewPveRun } from '../lib/pvePreviewApi';
import { IS_MOCK_MODE, STORAGE_NAMESPACE } from '../lib/runtimeMode';
import type { SavedHero } from '../types';
import { VoidLabyrinthScene } from './VoidLabyrinthScene';
import { VoidBestiary } from './VoidBestiary';
import './PvePage.css';

const RUN_KEY = `${STORAGE_NAMESPACE}.pve.lastRun`;
const challenges = ['A first climb. One starter hero can carry the lantern.', 'Sharper guardians. Find rewards that strengthen your party.', 'Up to six enemies. Survive the name-devouring ritual.'];
const slotNames = ['Front left', 'Front center', 'Front right', 'Back left', 'Back center', 'Back right'];

export function PvePage({ heroes, token, demoMode = false, onRewardClaimed }: { heroes: SavedHero[]; token?: string | null; demoMode?: boolean; onRewardClaimed?: () => Promise<unknown> }) {
  const preview = demoMode || IS_MOCK_MODE;
  const [catalog, setCatalog] = useState<PveCatalog>(pvePreviewCatalog);
  const [run, setRun] = useState<PveRun | null>(null);
  const [tier, setTier] = useState<PveTier>('threshold');
  const [selection, setSelection] = useState<string[]>([]);
  const [formationDraft, setFormationDraft] = useState<{ id: string; positions: Record<string, number> } | null>(null);
  const [branch, setBranch] = useState('A');
  const [revive, setRevive] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!preview || CAN_PLAY_PVE_PREVIEW);
  const [error, setError] = useState('');
  const [ending, setEnding] = useState(false);
  const available = useMemo(() => heroes.filter(hero => !hero.cardStatus || hero.cardStatus === 'active'), [heroes]);
  const selected = available.filter(hero => selection.includes(hero.id));
  const teamBp = selected.reduce((total, hero) => total + Number(hero.character.BP), 0);
  const targetBp = catalog.tiers.find(item => item.id === tier)?.recommended_team_bp ?? 1000;
  const eligibility = pveBpEligibility(teamBp, targetBp, selected.length);
  const catalogNode = catalog.nodes.find(node => node.id === `N${run?.node}`);
  const shownFloor = run?.pendingReward?.floor ?? run?.node ?? 0;
  const shownNode = catalog.nodes.find(node => node.id === `N${shownFloor}`);
  const currentNode = run?.legacy && catalogNode && ['event', 'shop'].includes(catalogNode.kind) ? { ...catalogNode, kind: 'battle' } : catalogNode;
  const previewEncounter = run && currentNode ? catalog.encounters?.find(item => item.tier === run.tier && item.node === currentNode.id && item.variant === (currentNode.variants ? run.branches[currentNode.id] ?? branch : 'default')) : null;
  const room = run?.battleSession;
  const preparing = room?.status === 'preparing';
  const battle = useMemo(() => {
    const result = run ? pveBattleResult(run, catalog.bestiary) : null;
    if (!result?.board || !preparing || formationDraft?.id !== room?.sessionId) return result;
    const board = applyPreparationPositions(result.board, 'A', formationDraft.positions);
    return { ...result, board, boardHistory: [board] };
  }, [run, catalog.bestiary, preparing, formationDraft, room?.sessionId]);
  const livingBattle = room?.status === 'awaiting_action';

  useEffect(() => {
    let cancelled = false;
    if (preview && !CAN_PLAY_PVE_PREVIEW) return;
    async function load() {
      try {
        const [nextCatalog, active] = await Promise.all([preview ? Promise.resolve(pvePreviewCatalog) : fetchPveCatalog(token), preview ? fetchActivePreviewPveRun() : fetchActivePveRun(token)]);
        const lastId = localStorage.getItem(RUN_KEY);
        const restored = active ?? (lastId ? await (preview ? fetchPreviewPveRun(lastId) : fetchPveRun(lastId, token)).catch(() => null) : null);
        if (!cancelled) { setCatalog(nextCatalog); setRun(restored?.status === 'abandoned' ? null : restored); }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'The labyrinth could not be loaded.');
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [preview, token]);

  useEffect(() => {
    if (run?.id && run.status !== 'abandoned') localStorage.setItem(RUN_KEY, run.id);
  }, [run?.id, run?.status]);

  const perform = useCallback(async (operation: PveOperation, input: PveInput = {}) => {
    if (!run || busy) return;
    setBusy(true); setError('');
    try {
      const updated = await (preview ? mutatePreviewPveRun(run, operation, input) : mutatePveRun(run, operation, input, token));
      if (operation === 'confirm') setFormationDraft(null);
      if (updated.status === 'abandoned') { setRun(null); setEnding(false); localStorage.removeItem(RUN_KEY); }
      else setRun(updated);
      if (!preview && updated.status === 'completed' && updated.reward?.dust) void onRewardClaimed?.().catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The action could not be completed. Try again.');
      // Unknown network outcomes refresh the committed state instead of blindly resubmitting a turn.
      const refreshed = await (preview ? fetchPreviewPveRun(run.id) : fetchPveRun(run.id, token)).catch(() => null);
      if (refreshed) setRun(refreshed);
    } finally { setBusy(false); }
  }, [run, busy, token, preview, onRewardClaimed]);

  useEffect(() => {
    if (!livingBattle || busy || error || room?.expectedActionSource !== 'program') return;
    const timer = window.setTimeout(() => { void perform('advance'); }, 2800);
    return () => window.clearTimeout(timer);
  }, [livingBattle, busy, error, room?.expectedActionSource, room?.activeActorTag, run?.revision, perform]);

  async function start() {
    if (busy || preview && !CAN_PLAY_PVE_PREVIEW || loading || !eligibility.eligible) return;
    setBusy(true); setError('');
    try { setRun(await (preview ? createPreviewPveRun(tier, selected) : createPveRun(tier, selected.map(hero => hero.id), selected.map((_, index) => index), token))); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to begin the expedition.');
      const active = await (preview ? fetchActivePreviewPveRun() : fetchActivePveRun(token)).catch(() => null);
      if (active) setRun(active);
    } finally { setBusy(false); }
  }

  function toggleHero(id: string) {
    if (selection.includes(id)) setSelection(current => current.filter(value => value !== id));
    else if (selection.length < 4) {
      setSelection(current => [...current, id]);
    }
  }

  const deadHeroes = run?.party.filter(hero => run.resources[hero.id].hp <= 0) ?? [];

  function moveCompanion(tag: string, slot: number) {
    if (!preparing || !battle?.board || !room || busy) return;
    const moved = movePreparationCard(battle.board, 'A', tag, slot);
    setFormationDraft({ id: room.sessionId, positions: formationPositions(moved, 'A') });
  }

  return <section className="void-campaign" data-climbing={Boolean(run)} aria-label="Void Labyrinth">
    <div className="void-gateway">
      <VoidLabyrinthScene tier={run?.tier ?? tier} node={shownFloor} />
      <header className="void-campaign__opening">
        <p className="void-eyebrow">CHAPTER I / THE FORGOTTEN REALM</p><h1>The Void<br /><em>Labyrinth</em></h1>
        <p className="void-lede">The walls are forgetting your name.<br />Keep the lantern burning.</p>
      </header>
      {!run ? <div className="void-tier-list" role="group" aria-label="Choose a labyrinth depth">{catalog.tiers.map((item, index) => <button key={item.id} type="button" aria-pressed={tier === item.id} onClick={() => setTier(item.id as PveTier)}>
        <span className="void-tier-list__number">DEPTH 0{index + 1}</span><strong>{item.name}</strong><span className="void-tier-list__bp">{item.recommended_team_bp.toLocaleString()}<small>TEAM BP</small></span><small className="void-tier-list__challenge">{challenges[index]}</small>
      </button>)}</div> : <div className="void-world-caption"><span>{catalog.tiers.find(item => item.id === run.tier)?.name}</span><strong>{shownNode?.name ?? 'The journey ends'}</strong></div>}
    </div>
    <div className="void-content">
    <p className="void-campaign__promise">10 floors <span>◆</span> Battles, events & lantern trades <span>◆</span> Choose rewards as you climb <span>◆</span> Free entry & retries</p>
    {error && <div className="void-error" role="alert">{error}<button type="button" onClick={() => setError('')}>Dismiss</button></div>}
    {loading && <p role="status">Searching for your lantern…</p>}
    {preview && <p className="void-notice">{CAN_PLAY_PVE_PREVIEW ? 'Local test realm — play the climb with the real combat rules. Progress saves locally; rewards never affect a live wallet.' : 'Preview realm — explore the depths and companions. Connect to a live account to begin a saved climb.'}</p>}
    {!run && <>
      <div className="void-preparation"><div className="void-section-title"><h2>Gather your companions</h2><span>{selected.length} / 4 companions · {teamBp.toLocaleString()} BP</span></div>
        <p>Choose 1–4 companions. Team BP must be within ±5% of this depth. Arrange your cards on the battlefield before every encounter.</p>
        {available.length === 0 && <p>No companions are available. Forge a hero or claim your starter cards.</p>}
        <div className="void-roster">{available.map(hero => <div key={hero.id} className="void-roster__hero" data-selected={selection.includes(hero.id)}>
          <button type="button" aria-pressed={selection.includes(hero.id)} disabled={!selection.includes(hero.id) && selection.length >= 4} onClick={() => toggleHero(hero.id)}>
            {hero.image && <img src={hero.image} alt="" loading="lazy" />}<span><strong>{hero.character.name}</strong><small>{Number(hero.character.BP).toLocaleString()} BP</small></span>
          </button>
        </div>)}</div>
        <div className="void-entry-summary" data-eligible={eligibility.eligible}><div><p className="void-eyebrow">TEAM BP / {targetBp.toLocaleString()} TARGET</p><strong>{teamBp.toLocaleString()} <span>BP</span></strong><p aria-live="polite">{!selected.length ? 'Choose your companions to begin.' : eligibility.eligible ? 'Within the entry band. A full party is optional.' : teamBp < eligibility.lower ? `Need ${(eligibility.lower - teamBp).toLocaleString()} more BP to enter.` : `${(teamBp - eligibility.upper).toLocaleString()} BP above the entry limit.`}<br />Allowed: {eligibility.lower.toLocaleString()}–{eligibility.upper.toLocaleString()} BP · 1–4 heroes</p></div>
        <button className="void-primary" type="button" disabled={busy || loading || preview && !CAN_PLAY_PVE_PREVIEW || !eligibility.eligible} onClick={() => void start()}>{busy ? 'Lighting the lantern…' : 'Enter the labyrinth'}<ChevronRight size={16} /></button></div>
      </div>
    </>}

    {run && <>
      <div className="void-run-heading"><div><p className="void-eyebrow">FLOOR {Math.min(shownFloor, 10)} / 10 · {catalog.tiers.find(item => item.id === run.tier)?.name} · {run.teamBp.toLocaleString()} BP</p><h2>{run.status === 'completed' ? 'Your name endures' : shownNode?.name ?? 'The journey ends'}</h2><p>{run.legacy ? 'Resumed expedition · original entry rules' : 'BP entry verified · your climb rewards stay in this expedition'} · Retries: {run.retries}</p></div><span className="void-saved">{run.lumens ?? 0} Lumens · {preview ? 'Local test save' : 'Journey saved'}</span></div>
      <div className="void-climb-layout"><aside className="void-route"><p className="void-eyebrow">ASCEND / TEN FLOORS</p>
      <ol className="void-map" aria-label="Journey route">{catalog.nodes.map((node, index) => <li key={node.id} data-current={shownFloor === index + 1} data-cleared={run.clearedNodes.includes(index + 1)} aria-current={shownFloor === index + 1 ? 'step' : undefined}>
        <span className="void-map__glyph">{node.kind === 'camp' ? <Flame size={19} /> : node.kind === 'event' ? <ScrollText size={19} /> : node.kind === 'shop' ? <Coins size={19} /> : node.kind === 'boss' ? <Skull size={19} /> : node.kind === 'elite' ? <Shield size={19} /> : <Swords size={17} />}</span><span><small>FLOOR {String(index + 1).padStart(2, '0')} · {node.kind}</small>{node.name}</span>
      </li>)}</ol>
      <p className="void-route__reward">First clear<br /><strong>{catalog.firstClearDust?.[run.tier] ?? 0} Dust</strong><br />Once per depth{preview ? ' · test rewards only' : ''}</p></aside><div className="void-climb-main">
      <div className="void-party" aria-label="Companion resources">{run.party.map(hero => <div key={hero.id}><strong>{hero.character.name}</strong><span>{slotNames[hero.slot]}</span><p>{run.resources[hero.id].hp <= 0 ? 'Fallen this expedition' : `${run.resources[hero.id].hp} / ${hero.character.state.HP} HP`} · {run.resources[hero.id].mp} MP</p></div>)}</div>
      {Object.entries(run.relics ?? {}).length > 0 && <div className="void-climb-relics" aria-label="Climb rewards">{Object.entries(run.relics ?? {}).map(([id, count]) => <span key={id}>{catalog.rewards?.find(item => item.id === id)?.name ?? id} ×{count}</span>)}</div>}
      {run.pendingReward && <div className="void-reward-room"><p className="void-eyebrow">FLOOR {run.pendingReward.floor} CLEARED / +{run.pendingReward.lumens} LUMENS</p><h3>The dark leaves a gift.</h3><p>Choose one reward before ascending. These effects last for this climb.</p><div className="void-choice-grid">{run.pendingReward.choices.map(choice => <button key={choice.id} type="button" disabled={busy} onClick={() => void perform('reward', { choice: choice.id })}><strong>{choice.name}</strong><span>{choice.description}</span><small>CLAIM & ASCEND <ChevronRight size={14} /></small></button>)}</div></div>}

      {battle && room && (room.status !== 'resolved' || run.status === 'failed') && <div className="void-battle" key={room.sessionId}>
        {preparing && <div className="void-board-preparation"><p className="void-eyebrow">BEFORE THIS ENCOUNTER / FORMATION</p><h3>Take your positions.</h3><p>Drag your cards, or select a card and then a board slot. Frontline companions protect the hero behind them. Combat begins only after confirmation.</p></div>}
        {room.status !== 'resolved' && <details className="void-intents" open><summary>Enemy intent · marked heroes stay locked; stun interrupts wind-up</summary><ul>{room.intents.map(intent => <li key={intent.actorTag} data-marked={intent.interruptible}>
          <strong>{intent.name}</strong><span>{intent.action}{intent.targetCount ? ` · Up to ${intent.targetCount} targets` : ''}{intent.damageMultiplier ? ` · ${intent.damageMultiplier}× ATK` : ''}{intent.curse ? ' · ATK curse' : ''}</span>
          {intent.targetTags.length > 0 && <small>Marked: {intent.targetTags.map(tag => room.board?.bottom.find(unit => unit?.tag === tag)?.name ?? tag).join(', ')}</small>}
          {intent.interruptible && <b>Interruptible · destroying anchors updates the ritual</b>}
        </li>)}</ul></details>}
        <BattleVisualizer heroA={null} heroB={null} result={battle} liveSession={livingBattle} showPlaybackControls={false}
          editUnitSlots={preparing && !busy} editableSide="A" onUnitSlotChange={moveCompanion}
          sceneControls={livingBattle ? { manual: { actorTag: room.activeActorTag ?? null, ownSide: 'A', options: room.actionOptions ?? [], busy,
            revision: room.events?.length ?? 0, waitingUntil: null, onAction: action => { void perform('action', { action }); } } } : undefined} />
        {preparing && <button type="button" className="void-primary" disabled={busy} onClick={() => void perform('confirm', { positions: formationPositions(battle.board!, 'A') })}>Confirm formation & fight<ChevronRight size={16} /></button>}
        {livingBattle && room.expectedActionSource === 'program' && <p className="void-notice" role="status">The enemy is about to act.{error && <button type="button" disabled={busy} onClick={() => void perform('advance')}>Retry enemy turn</button>}</p>}
        {room.status === 'resolved' && <p className="void-notice">{run.status === 'failed' ? 'The encounter was lost. Restore the latest checkpoint for free.' : 'Encounter cleared. Remaining HP and MP carry into the next chamber.'}</p>}
      </div>}

      {run.status === 'failed' && <div className="void-node-actions"><p>Checkpoint: chamber {run.checkpointNode}. Restore the resources saved there and replay the encounters beyond it.</p><button className="void-primary" type="button" disabled={busy} onClick={() => void perform('retry')}><RotateCcw size={16} />Restore checkpoint</button></div>}
      {run.status === 'active' && !livingBattle && !preparing && !run.pendingReward && currentNode && <div className="void-node-actions">
        {currentNode.kind === 'camp' ? <><h3>Shelter by the lantern</h3><p>Rest: living companions recover 35% of maximum HP and MP; revive one fallen hero at 30% HP and 20% MP. Lantern vow: gain ATK worth 2% of the stat budget for the first two rounds of the next battle.</p>
          {deadHeroes.length > 0 && <label>Revive a companion<select aria-label="Revive a companion" value={revive} onChange={event => setRevive(event.target.value)}><option value="">Choose one fallen hero</option>{deadHeroes.map(hero => <option key={hero.id} value={hero.id}>{hero.character.name}</option>)}</select></label>}
          <div className="void-action-row"><button className="void-primary" type="button" disabled={busy || deadHeroes.length > 0 && !deadHeroes.some(hero => hero.id === revive)} onClick={() => void perform('camp', { choice: 'rest', ...(deadHeroes.length ? { reviveHeroId: revive } : {}) })}>Rest</button><button type="button" disabled={busy} onClick={() => void perform('camp', { choice: 'boon' })}>Lantern vow · gain ATK</button></div>
        </> : currentNode.kind === 'event' ? <><p className="void-eyebrow">DISCOVERY / FORGOTTEN TABLETS</p><h3>The stone remembers.</h3><p>Not every floor asks for a fight. Read the surviving names, or sacrifice blood to awaken a weapon.</p><div className="void-choice-grid"><button type="button" disabled={busy} onClick={() => void perform('event', { choice: 'study' })}><strong>Study the tablets</strong><span>Gain 20 Lumens. Living companions recover 15% maximum MP.</span></button><button type="button" disabled={busy} onClick={() => void perform('event', { choice: 'blood' })}><strong>Write a blood inscription</strong><span>Lose 10% maximum HP, leaving at least 1 HP. Gain Ember Edge for this climb.</span></button></div></> : currentNode.kind === 'shop' ? <><p className="void-eyebrow">LANTERN TRADE / {run.lumens ?? 0} LUMENS</p><h3>A traveller waits in the dark.</h3><p>Trade the Lumens earned during this climb. Choose one purchase, or continue without spending.</p><div className="void-choice-grid">{catalog.rewards?.map(choice => { const price = ({ edge: 45, ward: 40, renewal: 30 } as Record<string, number>)[choice.id] ?? 0; return <button type="button" key={choice.id} disabled={busy || (run.lumens ?? 0) < price} onClick={() => void perform('shop', { choice: choice.id })}><strong>{choice.name}</strong><span>{choice.description}</span><small>{price} LUMENS</small></button>; })}</div><button type="button" className="void-primary" disabled={busy} onClick={() => void perform('shop', { choice: 'leave' })}>Leave & ascend<ChevronRight size={16} /></button></> : <><h3>Next encounter · {currentNode.name}</h3>{currentNode.variants && <fieldset><legend>Choose a passage. Retrying preserves your chosen route.</legend>{currentNode.variants.map(value => <label key={value}><input type="radio" name="void-branch" value={value} checked={(run.branches[currentNode.id] ?? branch) === value} disabled={Boolean(run.branches[currentNode.id]) || busy} onChange={() => setBranch(value)} />{value === 'A' ? currentNode.id === 'N2' ? 'Stone passage · slow, fortified guardians' : 'Whisper bridge · curses and damage over time' : 'Mirror passage · swift hunters, vulnerable to area damage'}</label>)}</fieldset>}
          {previewEncounter && <details className="void-encounter-preview" open><summary>Scouting · {previewEncounter.enemies.length} enemies · {previewEncounter.enemyTotalBp.toLocaleString()} BP</summary><ul>{previewEncounter.enemies.map((enemy, index) => <li key={`${enemy.slot}-${index}`}>{enemy.name} · {slotNames[enemy.slot]}</li>)}</ul></details>}
          <button className="void-primary" type="button" disabled={busy} onClick={() => void perform('enter', { branch: currentNode.variants ? run.branches[currentNode.id] ?? branch : 'default' })}>Scout & arrange formation<ChevronRight size={16} /></button></>}
      </div>}
      {run.status === 'completed' && <div className="void-completion"><p className="void-eyebrow">TEN FLOORS / CLIMB COMPLETE</p><h3>The labyrinth is cleared</h3><p>{run.reward?.message ?? 'Your climb has been recorded.'}</p><p>{run.totalRounds} combat rounds · {run.rewardHistory?.length ?? 0} rewards & choices · {run.lumens ?? 0} Lumens remaining</p><button type="button" onClick={() => { setRun(null); localStorage.removeItem(RUN_KEY); }}>Gather another party</button></div>}
      {!!run.rewardHistory?.length && <details className="void-reward-history"><summary>Rewards & choices this climb</summary><ul>{run.rewardHistory.map((item, index) => <li key={`${item.floor}-${index}`}>Floor {item.floor} · {item.name}</li>)}</ul></details>}
      </div></div>
      {['active', 'failed'].includes(run.status) && <footer className="void-run-footer"><p>Your journey is saved when you leave. Ending the expedition abandons its unfinished progress.</p>{ending ? <div className="void-action-row"><button type="button" disabled={busy} onClick={() => void perform('abandon')}>Confirm end expedition</button><button type="button" onClick={() => setEnding(false)}>Keep exploring</button></div> : <button type="button" disabled={busy} onClick={() => setEnding(true)}>End expedition</button>}</footer>}
    </>}
    <VoidBestiary creatures={catalog.bestiary} />
    </div>
  </section>;
}
