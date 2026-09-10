import { useId, useRef, type PointerEvent, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import './DepthPreview.css';

export function DepthPreview({ label, material = false, variant = 'card', children }: { label: string; material?: boolean; variant?: 'card' | 'item'; children: ReactNode }) {
  const isItem = variant === 'item';
  const object = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const angle = useRef(isItem ? { x: 0, y: 0 } : { x: -3, y: -8 });
  const helpId = useId();
  const reducedMotion = useReducedMotion();
  const limit = isItem ? (material ? 4 : 6) : (material ? 10 : 18);
  const keyStep = isItem ? 2 : 4;
  function paint(x: number, y: number) {
    angle.current = { x: Math.max(-limit, Math.min(limit, x)), y: Math.max(-limit, Math.min(limit, y)) };
    const element = object.current;
    if (!element) return;
    element.style.setProperty('--preview-x', `${angle.current.x}deg`);
    element.style.setProperty('--preview-y', `${angle.current.y}deg`);
    element.style.setProperty('--preview-light-x', `${50 + angle.current.y * 2}%`);
    element.style.setProperty('--preview-light-y', `${50 - angle.current.x * 2}%`);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (pointer.current === null && (event.pointerType !== 'mouse' || reducedMotion)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    paint(-((event.clientY - bounds.top) / bounds.height * 2 - 1) * limit * .7, ((event.clientX - bounds.left) / bounds.width * 2 - 1) * limit);
  }
  return <div className={`depth-preview${material ? ' depth-preview--material' : ''}${isItem ? ' depth-preview--item' : ''}`}>
    <div className="depth-preview__stage" role="group" tabIndex={0} aria-label={`${label}, ${isItem ? 'item' : '3D'} preview`} aria-describedby={helpId}
      onDragStart={(event) => event.preventDefault()}
      onPointerMove={move}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus({ preventScroll: true });
        move(event);
      }}
      onPointerUp={(event) => { pointer.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { pointer.current = null; paint(0, 0); }}
      onLostPointerCapture={() => { pointer.current = null; }}
      onPointerLeave={() => { if (pointer.current === null) paint(0, 0); }}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'r', 'R'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key.toLowerCase() === 'r') paint(0, 0);
        else paint(angle.current.x + (event.key === 'ArrowUp' ? keyStep : event.key === 'ArrowDown' ? -keyStep : 0), angle.current.y + (event.key === 'ArrowRight' ? keyStep : event.key === 'ArrowLeft' ? -keyStep : 0));
      }}>
      <div ref={object} className="depth-preview__object">{children}</div>
    </div>
    <div className="depth-preview__controls"><span id={helpId}>{isItem ? 'Move to tilt · Arrow keys' : 'Drag to inspect · Arrow keys'}</span><button type="button" aria-label={`Reset ${label} preview`} onClick={() => paint(0, 0)}><RotateCcw size={13} /><span>Reset</span></button></div>
  </div>;
}
