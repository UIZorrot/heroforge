import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CARD_FALLBACK_SRC } from '../lib/cards';
import { resolveRarity } from '../lib/gameLogic';
import { circularCardOffset, wrapCardIndex } from '../lib/cardCarousel';
import type { SavedHero } from '../types';
import './CardCarousel.css';

export function CardCarousel({ heroes, selectedHeroId, onSelectHero, onActivateHero, size = 'regular', title = 'From your collection', badgeForHero, disabled = false }: {
  heroes: SavedHero[];
  selectedHeroId: string;
  onSelectHero: (id: string) => void;
  onActivateHero?: (id: string) => void;
  size?: 'regular' | 'large';
  title?: string;
  badgeForHero?: (hero: SavedHero) => string | undefined;
  disabled?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; startX: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const wheel = useRef({ delta: 0, last: 0, changed: 0 });
  const activeIndex = Math.max(0, heroes.findIndex((hero) => hero.id === selectedHeroId));
  const canMove = heroes.length > 1 && !disabled;
  const move = useCallback((direction: number) => {
    if (!canMove) return;
    onSelectHero(heroes[wrapCardIndex(activeIndex + direction, heroes.length)].id);
  }, [activeIndex, canMove, heroes, onSelectHero]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      if (!canMove || event.ctrlKey) return;
      event.preventDefault();
      const now = performance.now();
      const state = wheel.current;
      const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1);
      if (now - state.last > 160 || Math.sign(delta) !== Math.sign(state.delta)) state.delta = 0;
      state.last = now;
      if (now - state.changed < 220) return;
      state.delta += delta;
      if (Math.abs(state.delta) >= 40) {
        move(Math.sign(state.delta));
        state.delta = 0;
        state.changed = now;
      }
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [canMove, move]);

  return (
    <div className={`card-carousel${size === 'large' ? ' card-carousel--large' : ''}`} role="region" aria-roledescription="carousel" aria-label={title}>
      <div className="card-carousel__heading"><span>{title}</span><span>Drag or scroll to browse</span></div>
      {heroes.length === 0 ? <p className="card-carousel__empty">No cards available.</p> : <>
        <div className="card-carousel__stage">
          <button type="button" className="card-carousel__arrow card-carousel__arrow--previous" aria-label="Previous collection card" disabled={!canMove} onClick={() => move(-1)}><ChevronLeft size={20} /></button>
          <div ref={viewport} className="card-carousel__viewport" role="group" aria-label="Choose a card" tabIndex={0}
            onKeyDown={(event) => {
              if (!disabled && event.key === 'Enter' && event.target === event.currentTarget && onActivateHero) {
                event.preventDefault();
                onActivateHero(heroes[activeIndex].id);
                return;
              }
              if (disabled || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              // Keep keyboard focus on the stable rail while the selected card moves.
              event.currentTarget.focus({ preventScroll: true });
              if (event.key === 'Home') onSelectHero(heroes[0].id);
              else if (event.key === 'End') onSelectHero(heroes[heroes.length - 1].id);
              else move(event.key === 'ArrowRight' ? 1 : -1);
            }}
            onPointerDown={(event) => {
              suppressClick.current = false;
              if (!canMove || event.button !== 0) return;
              drag.current = { id: event.pointerId, x: event.clientX, startX: event.clientX, moved: false };
            }}
            onPointerMove={(event) => {
              const pointer = drag.current;
              if (!pointer || pointer.id !== event.pointerId) return;
              if (Math.abs(event.clientX - pointer.startX) > 8) {
                pointer.moved = true;
                suppressClick.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
              }
              const distance = event.clientX - pointer.x;
              if (Math.abs(distance) >= 55) {
                move(distance < 0 ? 1 : -1);
                pointer.x = event.clientX;
              }
            }}
            onPointerUp={(event) => {
              const pointer = drag.current;
              if (pointer?.id !== event.pointerId) return;
              const remaining = event.clientX - pointer.x;
              if (pointer.moved && Math.abs(remaining) > 24) move(remaining < 0 ? 1 : -1);
              drag.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => { drag.current = null; }}
            onLostPointerCapture={() => { drag.current = null; }}
            onClickCapture={(event) => {
              if (!suppressClick.current) return;
              event.preventDefault();
              event.stopPropagation();
              suppressClick.current = false;
            }}
          >
            {heroes.map((hero, index) => {
              const offset = circularCardOffset(index, activeIndex, heroes.length);
              const distance = Math.abs(offset);
              const active = index === activeIndex;
              const visible = distance <= 3;
              const badge = badgeForHero?.(hero);
              return <button type="button" key={hero.id} className="portrait-card card-carousel__card" aria-label={`Show ${hero.character.name}`} aria-pressed={active} aria-hidden={!visible} tabIndex={active ? 0 : -1} disabled={disabled || !visible}
                style={{ '--card-offset': Math.sign(offset) * (1 - Math.pow(.8, distance)) / .2, '--card-scale': Math.pow(.8, distance), '--card-opacity': visible ? 1 : 0, '--card-brightness': Math.max(.55, 1 - distance * .15), zIndex: 10 - Math.min(distance, 9) } as CSSProperties}
                onClick={() => { onSelectHero(hero.id); onActivateHero?.(hero.id); }}>
                {visible && <img src={hero.image || CARD_FALLBACK_SRC} alt="" draggable={false} onError={(event) => { if (event.currentTarget.getAttribute('src') !== CARD_FALLBACK_SRC) event.currentTarget.src = CARD_FALLBACK_SRC; }} />}
                <span className="card-carousel__rarity">{resolveRarity(hero.character)}</span>
                {badge && <span className="card-carousel__badge">{badge}</span>}
                <span className="card-carousel__name">{hero.character.name}</span>
              </button>;
            })}
          </div>
          <button type="button" className="card-carousel__arrow card-carousel__arrow--next" aria-label="Next collection card" disabled={!canMove} onClick={() => move(1)}><ChevronRight size={20} /></button>
        </div>
        <div className="card-carousel__position" aria-live="polite" aria-atomic="true"><span>{heroes[activeIndex].character.name}</span><span>{activeIndex + 1} / {heroes.length}</span></div>
        {onActivateHero && <p className="card-carousel__open-hint">Select a card to begin the ritual</p>}
      </>}
    </div>
  );
}
