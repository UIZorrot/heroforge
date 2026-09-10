import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { DepthPreview } from './DepthPreview';
import { CARD_FALLBACK_SRC } from '../lib/cards';
import { resolveRarity, toNumber } from '../lib/gameLogic';
import type { SavedHero } from '../types';
import './ForgeRitualDialog.css';

export function ForgeRitualDialog({ hero, mode, busy, onClose, children }: {
  hero: SavedHero;
  mode: 'enchant' | 'break';
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPointer = useRef(false);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} className={`forge-ritual forge-ritual--${mode}`} aria-labelledby={titleId} aria-modal="true" aria-busy={busy}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onPointerDown={(event) => { backdropPointer.current = event.target === event.currentTarget; }}
    onClick={(event) => { if (backdropPointer.current && event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="forge-ritual__surface">
      <header className="forge-ritual__header">
        <div><p>Hero Forge · Card rituals</p><h2 id={titleId}>Enchant · {hero.character.name}</h2></div>
        <button type="button" aria-label="Close ritual" disabled={busy} onClick={onClose}><X size={20} /></button>
      </header>
      <div className="forge-ritual__body">
        <div className="forge-ritual__portrait">
          <DepthPreview key={hero.id} label={hero.character.name}>
          <div className="portrait-card forge-ritual__card">
            <img src={hero.image || CARD_FALLBACK_SRC} alt={hero.character.name} onError={(event) => { if (event.currentTarget.getAttribute('src') !== CARD_FALLBACK_SRC) event.currentTarget.src = CARD_FALLBACK_SRC; }} />
            <span className="forge-ritual__rarity">{resolveRarity(hero.character)}</span>
            <div className="forge-ritual__identity"><h3>{hero.character.name}</h3><div>{[['BP', hero.character.BP], ['HP', hero.character.state.HP], ['ATK', hero.character.state.ATK]].map(([label, value]) => <span key={label}><small>{label}</small>{toNumber(value).toLocaleString('en-US')}</span>)}</div></div>
          </div>
          </DepthPreview>
          <p>{mode === 'enchant' ? 'Bind a shard. Shape their legacy.' : 'Return this hero to the forge.'}</p>
        </div>
        <div className="forge-ritual__content">{children}</div>
      </div>
    </div>
  </dialog>;
}
