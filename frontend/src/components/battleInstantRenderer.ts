import { Container, Graphics, type Application } from 'pixi.js';
import { INSTANT_PARTICLES, instantParticlePresentationSample } from '../lib/battleInstantParticles';
import type { BattleVfxInstantTypeEffect } from '../lib/battleVfxCatalog';

export function renderInstantParticles(app: Application, parent: Container, origin: { x: number; y: number }, cardWidth: number, effect: BattleVfxInstantTypeEffect, palette: { core: number; hot: number }, critical: boolean, registerCleanup: (cleanup: () => void) => void) {
  const layer = new Graphics();
  layer.blendMode = 'add';
  layer.position.set(origin.x, origin.y);
  const point = { x: 0, y: 0 };
  parent.addChild(layer);
  const recipe = INSTANT_PARTICLES[effect];
  let elapsed = 0;
  let disposed = false;
  const update = () => {
    elapsed += Math.min(64, app.ticker.deltaMS);
    layer.clear();
    for (let i = 0; i < recipe.count; i++) {
      const particle = instantParticlePresentationSample(effect, i, elapsed, cardWidth, critical);
      if (particle.alpha <= .01) continue;
      const x = point.x + particle.x, y = point.y + particle.y;
      const color = i % 3 ? palette.core : palette.hot;
      const alpha = particle.alpha * .95;
      if (particle.shape === 'streak') {
        const tail = instantParticlePresentationSample(effect, i, Math.max(0, elapsed - 28), cardWidth, critical);
        layer.moveTo(point.x + tail.x, point.y + tail.y).lineTo(x, y).stroke({ color, width: particle.size * 2, alpha: alpha * .12 });
        layer.moveTo(point.x + tail.x, point.y + tail.y).lineTo(x, y).stroke({ color, width: Math.max(.65, particle.size * .8), alpha });
      } else if (particle.shape === 'shard' || particle.shape === 'leaf') {
        const size = particle.size * (particle.shape === 'leaf' ? 1.6 : 1.3);
        const dx = Math.cos(particle.angle + elapsed * .004) * size;
        const dy = Math.sin(particle.angle + elapsed * .004) * size;
        layer.poly([x - dx, y - dy, x - dy * .4, y + dx * .4, x + dx, y + dy, x + dy * .4, y - dx * .4]).fill({ color, alpha });
      } else if (particle.shape === 'bubble') {
        layer.circle(x, y, particle.size * 1.25).stroke({ color, width: .65, alpha });
      } else {
        layer.circle(x, y, particle.size * 2).fill({ color, alpha: alpha * .1 });
        layer.circle(x, y, particle.size).fill({ color, alpha });
      }
    }
    if (elapsed > recipe.life + 110) cleanup();
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    app.ticker.remove(update);
    layer.destroy();
  };
  app.ticker.add(update);
  registerCleanup(cleanup);
}
