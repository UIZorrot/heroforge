import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Flame, RotateCcw, Shield, Skull, Swords } from 'lucide-react';
import { BattleVisualizer } from './BattleVisualizer';
import { createPveRun, fetchActivePveRun, fetchPveCatalog, fetchPveRun, mutatePveRun } from '../lib/api';
import { pvePreviewCatalog } from '../lib/pvePreviewCatalog';
import { pveBattleResult, type PveCatalog, type PveInput, type PveOperation, type PveRun, type PveTier } from '../lib/pveTypes';
import { IS_MOCK_MODE, STORAGE_NAMESPACE } from '../lib/runtimeMode';
import type { SavedHero } from '../types';
import { VoidLabyrinthScene } from './VoidLabyrinthScene';
import { VoidBestiary } from './VoidBestiary';
import './PvePage.css';

const RUN_KEY = `${STORAGE_NAMESPACE}.pve.lastRun`;
const challenges = ['Break the first anchor. Learn what the dark protects.', 'Pierce the guardians. Choose between the healer and twin anchors.', 'Four companions. Six enemies. One name-devouring ritual.'];
const slotNames = ['Front left', 'Front center', 'Front right', 'Back left', 'Back center', 'Back right'];

export function PvePage({ heroes, token, demoMode = false }: { heroes: SavedHero[]; token?: string | null; demoMode?: boolean }) {
  const preview = demoMode || IS_MOCK_MODE;
  const [catalog, setCatalog] = useState<PveCatalog>(pvePreviewCatalog);
  const [run, setRun] = useState<PveRun | null>(null);
  const [tier, setTier] = useState<PveTier>('threshold');
  const [selection, setSelection] = useState<string[]>([]);
  const [slots, setSlots] = useState<Record<string, number>>({});
  const [branch, setBranch] = useState('A');
  const [revive, setRevive] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState('');
  const [ending, setEnding] = useState(false);
  const available = useMemo(() => heroes.filter(hero => !hero.cardStatus || hero.cardStatus === 'active'), [heroes]);
  const selected = available.filter(hero => selection.includes(hero.id));
  const teamBp = selected.reduce((total, hero) => total + Number(hero.character.BP), 0);
  const currentNode = catalog.nodes.find(node => node.id === `N${run?.node}`);
  const previewEncounter = run && currentNode ? catalog.encounters?.find(item => item.tier === run.tier && item.node === currentNode.id && item.variant === (currentNode.variants ? run.branches[currentNode.id] ?? branch : 'default')) : null;
  const room = run?.battleSession;
  const battle = useMemo(() => run ? pveBattleResult(run, catalog.bestiary) : null, [run, catalog.bestiary]);
  const livingBattle = room?.status === 'awaiting_action';

  useEffect(() => {
    let cancelled = false;
    if (preview) return;
    async function load() {
      try {
        const [nextCatalog, active] = await Promise.all([fetchPveCatalog(token), fetchActivePveRun(token)]);
        const lastId = localStorage.getItem(RUN_KEY);
        const restored = active ?? (lastId ? await fetchPveRun(lastId, token).catch(() => null) : null);
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
      const updated = await mutatePveRun(run, operation, input, token);
      if (updated.status === 'abandoned') { setRun(null); setEnding(false); localStorage.removeItem(RUN_KEY); }
      else setRun(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The action could not be completed. Try again.');
      // Unknown network outcomes refresh the committed state instead of blindly resubmitting a turn.
      const refreshed = await fetchPveRun(run.id, token).catch(() => null);
      if (refreshed) setRun(refreshed);
    } finally { setBusy(false); }
  }, [run, busy, token]);

  useEffect(() => {
    if (!livingBattle || busy || error || room?.expectedActionSource !== 'program') return;
    const timer = window.setTimeout(() => { void perform('advance'); }, 2800);
    return () => window.clearTimeout(timer);
  }, [livingBattle, busy, error, room?.expectedActionSource, room?.activeActorTag, run?.revision, perform]);

  async function start() {
    if (busy || preview || loading) return;
    setBusy(true); setError('');
    try { setRun(await createPveRun(tier, selected.map(hero => hero.id), selected.map(hero => slots[hero.id]), token)); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to begin the expedition.');
      const active = await fetchActivePveRun(token).catch(() => null);
      if (active) setRun(active);
    } finally { setBusy(false); }
  }

  function toggleHero(id: string) {
    if (selection.includes(id)) setSelection(current => current.filter(value => value !== id));
    else if (selection.length < 4) {
      const occupied = new Set(selection.map(value => slots[value]));
      const slot = [0, 1, 2, 3, 4, 5].find(value => !occupied.has(value)) ?? 0;
      setSlots(current => ({ ...current, [id]: slot }));
      setSelection(current => [...current, id]);
    }
  }

  const duplicateSlots = new Set(selected.map(hero => slots[hero.id])).size !== selected.length;
  const deadHeroes = run?.party.filter(hero => run.resources[hero.id].hp <= 0) ?? [];

  return <section className="void-campaign" aria-label="Void Labyrinth">
    <div className="void-gateway">
      <VoidLabyrinthScene tier={run?.tier ?? tier} node={run?.node ?? 0} />
      <header className="void-campaign__opening">
        <p className="void-eyebrow">CHAPTER I / THE FORGOTTEN REALM</p><h1>The Void<br /><em>Labyrinth</em></h1>
        <p className="void-lede">The walls are forgetting your name.<br />Keep the lantern burning.</p>
      </header>
      {!run ? <div className="void-tier-list" role="group" aria-label="Choose a labyrinth depth">{catalog.tiers.map((item, index) => <button key={item.id} type="button" aria-pressed={tier === item.id} onClick={() => setTier(item.id as PveTier)}>
        <span className="void-tier-list__number">DEPTH 0{index + 1}</span><strong>{item.name}</strong><span className="void-tier-list__bp">{item.recommended_team_bp.toLocaleString()}<small>TEAM BP</small></span><small className="void-tier-list__challenge">{challenges[index]}</small>
      </button>)}</div> : <div className="void-world-caption"><span>{catalog.tiers.find(item => item.id === run.tier)?.name}</span><strong>{currentNode?.name ?? 'The journey ends'}</strong></div>}
    </div>
    <div className="void-content">
    <p className="void-campaign__promise">Free entry & retries <span>◆</span> No ranked stakes <span>◆</span> Fixed enemies at each depth <span>◆</span> Two waits per hero, per encounter</p>
    {error && <div className="void-error" role="alert">{error}<button type="button" onClick={() => setError('')}>Dismiss</button></div>}
    {loading && <p role="status">Searching for your lantern…</p>}
    {preview && <p className="void-notice">Preview realm — explore the depths, creatures and formation here. Connect to a live account to begin a saved adventure.</p>}
    {!run && <>
      <div className="void-preparation"><div className="void-section-title"><h2>Gather your companions</h2><span>{selected.length} / 4 companions · {teamBp.toLocaleString()} BP</span></div>
        <p>Frontline heroes protect the companion behind them. Ranged attacks cross the line. Choose your positions before entering.</p>
        {available.length === 0 && <p>No companions are available. Forge a hero or claim your starter cards.</p>}
        <div className="void-roster">{available.map(hero => <div key={hero.id} className="void-roster__hero" data-selected={selection.includes(hero.id)}>
          <button type="button" aria-pressed={selection.includes(hero.id)} disabled={!selection.includes(hero.id) && selection.length >= 4} onClick={() => toggleHero(hero.id)}>
            {hero.image && <img src={hero.image} alt="" loading="lazy" />}<span><strong>{hero.character.name}</strong><small>{Number(hero.character.BP).toLocaleString()} BP</small></span>
          </button>
          {selection.includes(hero.id) && <label>Position<select aria-label={`${hero.character.name} position`} value={slots[hero.id]} onChange={event => setSlots(current => ({ ...current, [hero.id]: Number(event.target.value) }))}>{slotNames.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>}
        </div>)}</div>
        {duplicateSlots && <p role="alert">Each companion needs a different position.</p>}
        {selected.length > 0 && selected.length < 4 && <p>You may enter with fewer companions; encounters are designed for a party of four.</p>}
        <button className="void-primary" type="button" disabled={busy || loading || preview || !selected.length || duplicateSlots} onClick={() => void start()}>{busy ? 'Lighting the lantern…' : 'Enter the labyrinth'}<ChevronRight size={16} /></button>
      </div>
    </>}

    {run && <>
      <div className="void-run-heading"><div><p className="void-eyebrow">{catalog.tiers.find(item => item.id === run.tier)?.name} · {run.teamBp.toLocaleString()} BP</p><h2>{run.status === 'completed' ? 'Your name endures' : currentNode?.name ?? 'The journey ends'}</h2><p>{run.honorEligible ? 'Within this depth’s BP challenge band' : 'Open challenge · outside this depth’s BP record band'} · Retries: {run.retries} · Rounds resolved: {run.totalRounds}</p></div><span className="void-saved">Journey saved</span></div>
      <ol className="void-map" aria-label="Journey route">{catalog.nodes.map((node, index) => <li key={node.id} data-current={run.node === index + 1} data-cleared={run.clearedNodes.includes(index + 1)} aria-current={run.node === index + 1 ? 'step' : undefined}>
        <span className="void-map__glyph">{node.kind === 'camp' ? <Flame size={19} /> : node.kind === 'boss' ? <Skull size={19} /> : node.kind === 'elite' ? <Shield size={19} /> : <Swords size={17} />}</span><span><small>{String(index + 1).padStart(2, '0')}</small>{node.name}</span>
      </li>)}</ol>
      <div className="void-party" aria-label="Companion resources">{run.party.map(hero => <div key={hero.id}><strong>{hero.character.name}</strong><span>{slotNames[hero.slot]}</span><p>{run.resources[hero.id].hp <= 0 ? 'Fallen this expedition' : `${run.resources[hero.id].hp} / ${hero.character.state.HP} HP`} · {run.resources[hero.id].mp} MP</p></div>)}</div>

      {battle && room && <div className="void-battle" key={room.sessionId}>
        {room.status !== 'resolved' && <details className="void-intents" open><summary>Enemy intent · marked heroes stay locked; stun interrupts wind-up</summary><ul>{room.intents.map(intent => <li key={intent.actorTag} data-marked={intent.interruptible}>
          <strong>{intent.name}</strong><span>{intent.action}{intent.targetCount ? ` · Up to ${intent.targetCount} targets` : ''}{intent.damageMultiplier ? ` · ${intent.damageMultiplier}× ATK` : ''}{intent.curse ? ' · ATK curse' : ''}</span>
          {intent.targetTags.length > 0 && <small>Marked: {intent.targetTags.map(tag => room.board?.bottom.find(unit => unit?.tag === tag)?.name ?? tag).join(', ')}</small>}
          {intent.interruptible && <b>Interruptible · destroying anchors updates the ritual</b>}
        </li>)}</ul></details>}
        <BattleVisualizer heroA={null} heroB={null} result={battle} liveSession={livingBattle} showPlaybackControls={false}
          sceneControls={livingBattle ? { manual: { actorTag: room.activeActorTag ?? null, ownSide: 'A', options: room.actionOptions ?? [], busy,
            revision: room.events?.length ?? 0, waitingUntil: null, onAction: action => { void perform('action', { action }); } } } : undefined} />
        {livingBattle && room.expectedActionSource === 'program' && <p className="void-notice" role="status">The enemy is about to act.{error && <button type="button" disabled={busy} onClick={() => void perform('advance')}>Retry enemy turn</button>}</p>}
        {room.status === 'resolved' && <p className="void-notice">{run.status === 'failed' ? 'The encounter was lost. Restore the latest checkpoint for free.' : 'Encounter cleared. Remaining HP and MP carry into the next chamber.'}</p>}
      </div>}

      {run.status === 'failed' && <div className="void-node-actions"><p>Checkpoint: chamber {run.checkpointNode}. Restore the resources saved there and replay the encounters beyond it.</p><button className="void-primary" type="button" disabled={busy} onClick={() => void perform('retry')}><RotateCcw size={16} />Restore checkpoint</button></div>}
      {run.status === 'active' && !livingBattle && currentNode && <div className="void-node-actions">
        {currentNode.kind === 'camp' ? <><h3>Shelter by the lantern</h3><p>Rest: living companions recover 35% of maximum HP and MP; revive one fallen hero at 30% HP and 20% MP. Lantern vow: gain ATK worth 2% of the stat budget for the first two rounds of the next battle.</p>
          {deadHeroes.length > 0 && <label>Revive a companion<select aria-label="Revive a companion" value={revive} onChange={event => setRevive(event.target.value)}><option value="">Choose one fallen hero</option>{deadHeroes.map(hero => <option key={hero.id} value={hero.id}>{hero.character.name}</option>)}</select></label>}
          <div className="void-action-row"><button className="void-primary" type="button" disabled={busy || deadHeroes.length > 0 && !deadHeroes.some(hero => hero.id === revive)} onClick={() => void perform('camp', { choice: 'rest', ...(deadHeroes.length ? { reviveHeroId: revive } : {}) })}>Rest</button><button type="button" disabled={busy} onClick={() => void perform('camp', { choice: 'boon' })}>Lantern vow · gain ATK</button></div>
        </> : <><h3>Next chamber · {currentNode.name}</h3>{currentNode.variants && <fieldset><legend>Choose a passage. Retrying preserves your chosen route.</legend>{currentNode.variants.map(value => <label key={value}><input type="radio" name="void-branch" value={value} checked={(run.branches[currentNode.id] ?? branch) === value} disabled={Boolean(run.branches[currentNode.id]) || busy} onChange={() => setBranch(value)} />{value === 'A' ? currentNode.id === 'N2' ? 'Stone passage · slow, fortified guardians' : 'Whisper bridge · curses and damage over time' : 'Mirror passage · swift hunters, vulnerable to area damage'}</label>)}</fieldset>}
          {previewEncounter && <details className="void-encounter-preview" open><summary>Scouting · {previewEncounter.enemies.length} enemies · {previewEncounter.enemyTotalBp.toLocaleString()} BP</summary><ul>{previewEncounter.enemies.map((enemy, index) => <li key={`${enemy.slot}-${index}`}>{enemy.name} · {slotNames[enemy.slot]}</li>)}</ul></details>}
          <button className="void-primary" type="button" disabled={busy} onClick={() => void perform('enter', { branch: currentNode.variants ? run.branches[currentNode.id] ?? branch : 'default' })}>Enter the chamber<ChevronRight size={16} /></button></>}
      </div>}
      {run.status === 'completed' && <div className="void-completion"><h3>The labyrinth is cleared</h3><p>{run.reward?.firstClear ? 'Your first clear has been recorded.' : 'Your challenge result has been recorded.'} Dust and cosmetic rewards are not available yet.</p><button type="button" onClick={() => { setRun(null); localStorage.removeItem(RUN_KEY); }}>Gather another party</button></div>}
      {['active', 'failed'].includes(run.status) && <footer className="void-run-footer"><p>Your journey is saved when you leave. Ending the expedition abandons its unfinished progress.</p>{ending ? <div className="void-action-row"><button type="button" disabled={busy} onClick={() => void perform('abandon')}>Confirm end expedition</button><button type="button" onClick={() => setEnding(false)}>Keep exploring</button></div> : <button type="button" disabled={busy} onClick={() => setEnding(true)}>End expedition</button>}</footer>}
    </>}
    <VoidBestiary creatures={catalog.bestiary} />
    </div>
  </section>;
}
