import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, ImagePlus, RotateCcw, Sparkles, X } from 'lucide-react';
import { resolveRarity, toNumber, type CharacterData } from '../lib/gameLogic';
import { FORGE_FORM_MS, FORGE_GATHER_MS, forgePhase } from '../lib/forgePresentation';
import { CARD_FALLBACK_SRC } from '../lib/cards';
import { ForgeCardDetails } from './ForgeCardDetails';
import './ForgeCreationScene.css';

type Props = {
  loading: boolean; error: string | null; resultImage: string | null; resultHero: CharacterData | null;
  cost: number; balance: number | null;
  onGenerate: (file: File) => Promise<void> | void; onReset: () => void;
};
const number = (value: unknown) => new Intl.NumberFormat('en-US').format(toNumber(value, 0));
const accent = { common: '#dcc9a3', rare: '#9acfe3', epic: '#c5a5ee', mythic: '#f4ce80' };

export function ForgeCreationScene({ loading, error, resultImage, resultHero, cost, balance, onGenerate, onReset }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [still, setStill] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const reducedMotion = Boolean(useReducedMotion());
  const pending = loading || submitting;
  const failure = localError || (!submitting ? error : null);
  const image = resultImage || preview;
  const phase = forgePhase({ hasImage: Boolean(image), hasResult: Boolean(resultHero), pending,
    failed: Boolean(failure), started: attempt > 0, elapsed, revealed, reducedMotion });
  const working = phase === 'gathering' || phase === 'shaping';
  const complete = phase === 'revealed';
  const canPick = !pending && !working && !resultHero;
  const insufficient = balance !== null && balance < cost;
  const rarity = resultHero ? resolveRarity(resultHero) : 'common';

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    if (!attempt) return;
    const gather = window.setTimeout(() => setElapsed(FORGE_GATHER_MS), FORGE_GATHER_MS);
    const form = window.setTimeout(() => setElapsed(FORGE_FORM_MS), FORGE_FORM_MS);
    return () => { clearTimeout(gather); clearTimeout(form); };
  }, [attempt]);

  function pick(next: File) {
    if (!canPick || locked.current) return;
    if (!next.type.startsWith('image/')) { setLocalError('Choose an image file to begin.'); return; }
    onReset();
    setAttempt(0); setElapsed(0); setRevealed(false); setLocalError('');
    setFile(next); setPreview(URL.createObjectURL(next));
  }
  async function forge() {
    if (!file || locked.current || pending || working || resultHero || insufficient) return;
    locked.current = true;
    setSubmitting(true); setLocalError(''); onReset();
    setElapsed(0); setRevealed(false); setAttempt(value => value + 1);
    try { await onGenerate(file); }
    catch (cause) { if (mounted.current) setLocalError(cause instanceof Error ? cause.message : 'The forge could not finish. Please try again.'); }
    finally { locked.current = false; if (mounted.current) setSubmitting(false); }
  }
  function reset() {
    if (pending) return;
    onReset(); setFile(null); setPreview(null); setAttempt(0); setElapsed(0); setRevealed(false); setLocalError('');
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (reducedMotion || still || event.pointerType !== 'mouse' || !scene.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
    scene.current.style.setProperty('--view-x', `${-y * 3}deg`);
    scene.current.style.setProperty('--view-y', `${x * 6}deg`);
    scene.current.style.setProperty('--light-x', `${50 + x * 30}%`);
  }
  function resetView() {
    scene.current?.style.setProperty('--view-x', '0deg');
    scene.current?.style.setProperty('--view-y', '0deg');
    scene.current?.style.setProperty('--light-x', '50%');
  }

  const title = { empty: 'Every legend begins with an image.', prepared: 'An image. A spark. A new hero.', gathering: 'Awaken the forge.', shaping: 'A hero is taking form.', sealed: 'Your hero awaits.', revealed: resultHero?.name ?? 'A new legend.' }[phase];
  const description = { empty: 'Place an image in the light to begin.', prepared: 'Your image gives this hero its identity.', gathering: 'Dust gathers around your image.', shaping: 'The forge is shaping your card. Stay a moment.', sealed: 'Break the seal and meet your new hero.', revealed: 'Forged and added to your collection.' }[phase];

  return <section className="forge-creation" data-phase={phase} data-still={still || reducedMotion} style={{ '--forge-accent': complete ? accent[rarity] : accent.common } as CSSProperties}>
    <header className="forge-creation__heading">
      <div><span className="forge-creation__eyebrow">The creation chamber</span><h2>{title}</h2><p role="status">{description}</p></div>
      <button type="button" className="forge-creation__view" aria-pressed={still || reducedMotion} disabled={reducedMotion} onClick={() => { setStill(!still); resetView(); }}>{still || reducedMotion ? 'Motion off' : 'Motion on'}</button>
    </header>

    <div ref={scene} className={`forge-creation__scene${dragOver ? ' is-dragging' : ''}`} onPointerMove={move} onPointerLeave={resetView}
      onDragOver={event => { event.preventDefault(); if (canPick) setDragOver(true); }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false); }}
      onDrop={event => { event.preventDefault(); setDragOver(false); const dropped = event.dataTransfer.files[0]; if (dropped) pick(dropped); }}>
      <div className="forge-creation__haze" aria-hidden="true" />
      <div className="forge-creation__beam" aria-hidden="true" />
      <div className="forge-creation__world">
        <div className="forge-creation__floor" aria-hidden="true"><div className="forge-creation__orbit" /><div className="forge-creation__orbit forge-creation__orbit--inner" /><div className="forge-creation__floor-core" /></div>
        <div className="forge-creation__shadow" aria-hidden="true" />
        <div className="forge-creation__dust" aria-hidden="true">{Array.from({ length: 48 }, (_, i) => {
          const theta = i * 2.39996;
          return <i key={i} style={{ '--dx': `${Math.cos(theta) * (160 + i % 5 * 28)}px`, '--dy': `${Math.sin(theta) * (130 + i % 7 * 21)}px`, '--dz': `${(i % 9 - 4) * 22}px`, '--delay': `${-(i % 17) * .21}s`, '--speed': `${2.2 + i % 5 * .32}s`, '--grain': `${i % 4 === 0 ? 2 : 1}px` } as CSSProperties} />;
        })}</div>
        <div className="forge-creation__suspension">
          <div className="forge-creation__levitation">
          <div className="forge-creation__card">
            <div className="forge-creation__face forge-creation__source" aria-hidden={complete}>
              {image && <img src={image} alt="" draggable={false} />}
              <div className="forge-creation__source-shade" />
              <div className="forge-creation__seal" aria-hidden="true"><span className="forge-creation__logo" /></div>
              <span className="forge-creation__inscription">{working ? 'IN THE MAKING' : phase === 'sealed' ? 'A LEGEND WITHIN' : image ? 'THE ORIGIN' : 'HEROFORGE'}</span>
              <div className="forge-creation__scan" />
            </div>
            <div className="forge-creation__face forge-creation__hero" aria-hidden={!complete}>
              {resultHero && <>
                <img src={image || CARD_FALLBACK_SRC} alt={complete ? resultHero.name : ''} draggable={false} />
                <div className="forge-creation__hero-shade" />
                <span className="forge-creation__rarity">{rarity}</span>
                <div className="forge-creation__identity"><h3>{resultHero.name}</h3><div className="forge-creation__stats">
                  <span><small>BP</small>{number(resultHero.BP)}</span><span><small>HP</small>{number(resultHero.state.HP)}</span><span><small>ATK</small>{number(resultHero.state.ATK)}</span>
                </div></div>
              </>}
              <div className="forge-creation__sheen" />
            </div>
          </div>
          {phase === 'empty' && <button type="button" className="forge-creation__card-action" onClick={() => input.current?.click()}><span>Place an image</span><small>Click or drop here</small></button>}
          {phase === 'sealed' && <button type="button" className="forge-creation__card-action forge-creation__card-action--reveal" onClick={() => setRevealed(true)} aria-label="Reveal your new hero"><span>Touch to reveal</span></button>}
          </div>
        </div>
        {complete && <div key={attempt} className="forge-creation__burst" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ '--angle': `${i * 360 / 28}deg`, '--reach': `${160 + i % 5 * 25}px`, '--delay': `${i % 4 * .025}s` } as CSSProperties} />)}</div>}
      </div>
      <div className="forge-creation__stage-note" aria-hidden="true"><span>IMAGE</span><i /><span>DUST</span><i /><span>HERO</span></div>
    </div>

    <input ref={input} type="file" accept="image/*" hidden onChange={event => { const next = event.target.files?.[0]; if (next) pick(next); event.target.value = ''; }} />
    <div className="forge-creation__console">
      <div className="forge-creation__offering">
        {complete ? <><Check size={18} /><div><strong>In your collection</strong><span>Your new hero is ready for Enchant.</span></div></> : <><Sparkles size={18} /><div><strong>{number(cost)} Dust <span className="forge-creation__cost-label">/ forge</span></strong><span>{balance === null ? 'One image becomes one hero' : `${number(balance)} Dust available`}</span></div></>}
      </div>
      <div className="forge-creation__actions">
        {canPick && file && <button type="button" className="forge-creation__change" onClick={() => input.current?.click()} title={file.name}><ImagePlus size={15} />Change image</button>}
        {canPick && file && <button type="button" className="forge-creation__clear" onClick={reset} aria-label="Remove image"><X size={16} /></button>}
        <button type="button" className="forge-creation__primary" disabled={working || pending || (phase === 'prepared' && insufficient)} onClick={() => {
          if (complete) reset(); else if (phase === 'sealed') setRevealed(true); else if (!file) input.current?.click(); else void forge();
        }}>
          {complete ? <RotateCcw size={16} /> : <Sparkles size={16} />}
          {working ? 'Forging your hero…' : complete ? 'Forge another' : phase === 'sealed' ? 'Reveal hero' : !file ? 'Choose image' : insufficient ? 'Not enough Dust' : 'Begin forging'}
          {!working && <ArrowRight size={16} />}
        </button>
      </div>
    </div>
    {failure && <p className="forge-creation__error" role="alert">{failure}</p>}
    {complete && resultHero && <ForgeCardDetails hero={resultHero} />}
    <footer className="forge-creation__footer"><span>{complete ? resultHero?.description : 'An image gives form. Dust gives life.'}</span><span>{complete ? 'Move your cursor to catch the light' : 'Shards and relics can be bound after forging.'}</span></footer>
  </section>;
}
