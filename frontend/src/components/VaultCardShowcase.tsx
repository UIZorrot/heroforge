import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, FlipHorizontal2, Pause, Play, RotateCcw } from 'lucide-react';
import { CARD_FALLBACK_SRC } from '../lib/cards';
import { normalizeCardType, resolveRarity, toNumber } from '../lib/gameLogic';
import type { SavedHero } from '../types';
import './VaultCardShowcase.css';

const finishes = {
  common: { color: '#b2aaa0', foil: 0.2 },
  rare: { color: '#99bccc', foil: 0.45 },
  epic: { color: '#b7a1c9', foil: 0.6 },
  mythic: { color: '#d7b67c', foil: 0.8 },
};

function fallbackImage(event: React.SyntheticEvent<HTMLImageElement>) {
  if (event.currentTarget.getAttribute('src') !== CARD_FALLBACK_SRC) {
    event.currentTarget.src = CARD_FALLBACK_SRC;
  }
}

export function VaultCardShowcase({ hero, position, count, onPrevious, onNext }: {
  hero: SavedHero;
  position: number;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const rarity = resolveRarity(hero.character);
  const finish = finishes[rarity];
  const [flipped, setFlipped] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const [foil, setFoil] = useState(finish.foil);
  const tilt = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const angle = useRef({ x: -3, y: -9 });
  const dragging = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const helpId = useId();
  const foilId = useId();
  const character = hero.character;
  const skills = [character.skill.s1, character.skill.s2].filter((skill) => Boolean(skill));
  const number = (value: unknown) => new Intl.NumberFormat('en-US').format(toNumber(value, 0));

  function paint(x: number, y: number) {
    angle.current = { x, y };
    const node = tilt.current;
    if (!node) return;
    node.style.setProperty('--tilt-x', `${x}deg`);
    node.style.setProperty('--tilt-y', `${y}deg`);
    node.style.setProperty('--light-x', `${50 + y * 2}%`);
    node.style.setProperty('--light-y', `${50 - x * 2}%`);
    node.style.setProperty('--foil-angle', `${115 + y * 2}deg`);
  }

  useEffect(() => {
    if (!automatic || reducedMotion) return;
    let frame = 0;
    let visible = true;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    if (stage.current) observer.observe(stage.current);
    const animate = (time: number) => {
      if (visible && !document.hidden) paint(Math.sin(time / 1900) * 7, Math.sin(time / 2400) * 17);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [automatic, reducedMotion]);

  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' && dragging.current !== event.pointerId) return;
    if (reducedMotion && dragging.current !== event.pointerId) return;
    setAutomatic(false);
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
    paint(-y * 13, x * 22);
  }

  function reset() {
    setAutomatic(false);
    setFlipped(false);
    paint(0, 0);
  }

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'f', 'F', 'r', 'R'].includes(event.key)) return;
    event.preventDefault();
    setAutomatic(false);
    if (event.key.toLowerCase() === 'f') setFlipped((value) => !value);
    else if (event.key.toLowerCase() === 'r') reset();
    else {
      const x = angle.current.x + (event.key === 'ArrowUp' ? 4 : event.key === 'ArrowDown' ? -4 : 0);
      const y = angle.current.y + (event.key === 'ArrowRight' ? 4 : event.key === 'ArrowLeft' ? -4 : 0);
      paint(Math.max(-16, Math.min(16, x)), Math.max(-24, Math.min(24, y)));
    }
  }

  return (
    <div className="vault-showcase" style={{ '--card-accent': finish.color, '--foil-strength': foil } as CSSProperties}>
      <div className="vault-showcase__caption">
        <span>THE COLLECTION <span className="vault-showcase__caption-divider">/</span> {rarity}</span>
        <span aria-live="polite">{flipped ? 'VERSO' : 'RECTO'} · {String(position + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>
      </div>

      <div className="vault-showcase__stage" ref={stage}>
        <span className="vault-showcase__watermark" aria-hidden="true">HF</span>
        <button type="button" className="vault-showcase__previous" aria-label="Previous card" disabled={count < 2} onClick={onPrevious}><ChevronLeft size={20} /></button>
        <div className="vault-showcase__interaction" tabIndex={0} role="group" aria-label={`${character.name}, interactive collectible card`} aria-describedby={helpId}
          onKeyDown={keyboard} onPointerMove={move}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            dragging.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.focus({ preventScroll: true });
            setAutomatic(false);
            move(event);
          }}
          onPointerUp={(event) => {
            dragging.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => { dragging.current = null; }}
          onLostPointerCapture={() => { dragging.current = null; }}
          onPointerLeave={() => { if (dragging.current === null && !automatic) paint(0, 0); }}
        >
          <div ref={tilt} className="vault-showcase__tilt">
            <div className={`vault-showcase__card${flipped ? ' is-flipped' : ''}`}>
              <div className="vault-showcase__face vault-showcase__front" aria-hidden={flipped}>
                <img className="vault-showcase__art" src={hero.image || CARD_FALLBACK_SRC} alt={character.name} draggable={false} onError={fallbackImage} />
                <div className="vault-showcase__shade" />
                <div className="vault-showcase__foil" />
                <div className="vault-showcase__sheen" />
                <div className="vault-showcase__frame" />
                <div className="vault-showcase__card-top"><span>{rarity}</span><span>{normalizeCardType(character.state.TYPE)}</span></div>
                <div className="vault-showcase__card-bottom">
                  {hero.enchantment && <span className="vault-showcase__enchant">✦ {hero.enchantment.relicName}</span>}
                  <h3>{character.name}</h3>
                  <div className="vault-showcase__stats">
                    <span><small>BP</small>{number(character.BP)}</span>
                    <span><small>HP</small>{number(character.state.HP)}</span>
                    <span><small>ATK</small>{number(character.state.ATK)}</span>
                  </div>
                </div>
              </div>
              <div className="vault-showcase__face vault-showcase__back" aria-hidden={!flipped}>
                <div className="vault-showcase__frame" />
                <div className="vault-showcase__foil" />
                <span className="vault-showcase__back-label">HERO FORGE · VAULT</span>
                <div className="vault-showcase__seal" aria-hidden="true"><span>HF</span></div>
                <h3>{character.name}</h3>
                <p className="vault-showcase__lore">{character.description || 'A hero preserved in the Forge archives.'}</p>
                <div className="vault-showcase__abilities">{skills.map((skill, index) => <p key={index}><small>0{index + 1}</small>{skill?.name || 'Untitled ability'}</p>)}</div>
                <span className="vault-showcase__identity" title={hero.id}>{hero.id}</span>
              </div>
            </div>
          </div>
        </div>
        <button type="button" className="vault-showcase__next" aria-label="Next card" disabled={count < 2} onClick={onNext}><ChevronRight size={20} /></button>
      </div>

      <p id={helpId} className="vault-showcase__hint">Drag to catch the light <span>·</span> Arrow keys to tilt, F to flip</p>
      <div className="vault-showcase__controls">
        <div className="vault-showcase__buttons">
          <button type="button" aria-pressed={flipped} onClick={() => { setAutomatic(false); setFlipped(!flipped); }}><FlipHorizontal2 size={14} />{flipped ? 'Show front' : 'Flip card'}</button>
          <button type="button" aria-pressed={automatic && !reducedMotion} disabled={Boolean(reducedMotion)} title={reducedMotion ? 'Automatic motion is off with reduced motion enabled' : 'Slowly rotate the card'} onClick={() => setAutomatic(!automatic)}>{automatic && !reducedMotion ? <Pause size={14} /> : <Play size={14} />}Auto</button>
          <button type="button" onClick={reset} aria-label="Reset card view"><RotateCcw size={14} /></button>
        </div>
        <label className="vault-showcase__finish" htmlFor={foilId}>Foil<input id={foilId} type="range" min="0" max="1" step="0.05" value={foil} onChange={(event) => setFoil(Number(event.target.value))} /><output htmlFor={foilId}>{Math.round(foil * 100)}%</output></label>
      </div>
    </div>
  );
}
