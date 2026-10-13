import { useEffect, useRef, useState } from 'react';
import type { PveTier } from '../lib/pveTypes';
import type { VoidWorld } from '../lib/voidLabyrinthScene';

/** Decorative world only. Accessible DOM controls own all game actions. */
export function VoidLabyrinthScene({ tier, node = 0 }: { tier: PveTier; node?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<VoidWorld | null>(null);
  const latest = useRef({ tier, node });
  const [ready, setReady] = useState(false);
  useEffect(() => { latest.current = { tier, node }; world.current?.select(tier, node); }, [tier, node]);
  useEffect(() => {
    let cancelled = false;
    void import('../lib/voidLabyrinthScene').then(({ createVoidWorld }) => {
      if (cancelled || !host.current) return;
      try {
        world.current = createVoidWorld(host.current, () => setReady(false));
        world.current.select(latest.current.tier, latest.current.node);
        setReady(true);
      } catch { /* The illustrated world remains usable when WebGL is unavailable. */ }
    }).catch(() => { /* Keep the illustrated fallback when a lazy chunk fails. */ });
    return () => { cancelled = true; world.current?.dispose(); world.current = null; };
  }, []);
  return <div className="void-world" data-renderer={ready ? 'three' : 'illustration'} aria-hidden="true"><div ref={host} className="void-world__canvas" /></div>;
}
