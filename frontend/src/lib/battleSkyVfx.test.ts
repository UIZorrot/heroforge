import { battleUsesInstantVfx, battlePresentationEvents } from './battleVfxPresentation';
import { describe, expect, it } from 'vitest';
import { battleUsesSkyVfx, skyTargetPhase, skyTargetTiming, skyVfxProfile } from './battleSkyVfx';
import { createVfxScenarioBoard, createVfxTestAction } from './vfxTestHarness';
import { createSkyCamera, screenToSkyGround } from './battleSkyScene';
import { Vector3 } from 'three';

const board = createVfxScenarioBoard('projectile', 'fire', 'pve');
const action = (category: 'projectile' | 'instant' | 'buff', effect: string, count = 6) => createVfxTestAction(board, category, effect, 1, count);
describe('existing instant presentation policy', () => {
  it('defaults group magic, ice, lightning, arrow rain and healing to instant impacts', () => {
    for (const effect of ['fire', 'frost', 'lighting', 'holy', 'magic', 'arrow']) expect(battleUsesInstantVfx(action('projectile', effect))).toBe(true);
    expect(battleUsesInstantVfx(action('buff', 'heal'))).toBe(true);
    expect(battleUsesInstantVfx(action('instant', 'fire'))).toBe(true);
  });
  it('retains a direct motion for physical swipes and gunfire; single targets remain direct', () => {
    expect(battleUsesInstantVfx(action('instant', 'claw'))).toBe(false);
    expect(battleUsesInstantVfx(action('projectile', 'bullet'))).toBe(false);
    expect(battleUsesInstantVfx(action('projectile', 'fire', 1))).toBe(false);
  });
  it('supports explicit delivery choices without changing targeting or results', () => {
    const instant = createVfxTestAction(board, 'instant', 'claw', 1, 3, { presentation: 'instant' });
    const direct = createVfxTestAction(board, 'instant', 'claw', 1, 3, { presentation: 'direct' });
    expect(battleUsesInstantVfx(instant)).toBe(true); expect(battleUsesInstantVfx(direct)).toBe(false);
    expect(instant.map(event => event.damage)).toEqual(direct.map(event => event.damage));
    expect(instant.map(event => event.defender)).toEqual(direct.map(event => event.defender));
  });
  it('uses distinct geometry profiles for elemental attacks and healing', () => {
    expect(skyVfxProfile(action('projectile', 'fire')[0]).kind).toBe('meteor');
    expect(skyVfxProfile(action('projectile', 'arrow')[0]).kind).toBe('rain');
    expect(skyVfxProfile(action('projectile', 'frost')[0]).kind).toBe('ice');
    expect(skyVfxProfile(action('projectile', 'lighting')[0]).kind).toBe('storm');
    expect(skyVfxProfile(action('buff', 'heal')[0])).toMatchObject({ kind: 'light', support: true });
  });
  it('keeps near-simultaneous impacts bounded for six targets and waits until descent ends', () => {
    const first = skyTargetTiming(0), last = skyTargetTiming(5);
    expect(last.impactMs - first.impactMs).toBeLessThanOrEqual(140);
    expect(skyTargetPhase(first.impactMs - 1, 0).impacted).toBe(false);
    expect(skyTargetPhase(first.impactMs, 0).impacted).toBe(true);
    expect(skyTargetPhase(last.endMs, 5).finished).toBe(true);
  });
});
describe('perspective 3D registration', () => {
  it('maps slot pixels onto a real horizontal world plane and projects back exactly', () => {
    const camera = createSkyCamera(900, 700);
    for (const [x, y] of [[230, 180], [720, 560], [550, 340]]) {
      const ground = screenToSkyGround(camera, x, y, 900, 700)!;
      expect(ground.y).toBeCloseTo(0);
      const screen = ground.clone().project(camera);
      expect((screen.x + 1) * 450).toBeCloseTo(x);
      expect((1 - screen.y) * 350).toBeCloseTo(y);
      const overhead = ground.clone().add(new Vector3(0, 4, 0)).project(camera);
      expect(overhead.y).toBeGreaterThan(screen.y);
    }
    expect(screenToSkyGround(camera, 0, 0, 0, 0)).toBeNull();
  });
  it('re-registers moved slots after a resize and preserves world depth', () => {
    const camera = createSkyCamera(900, 700);
    const front = screenToSkyGround(camera, 500, 540, 900, 700)!;
    const back = screenToSkyGround(camera, 500, 180, 900, 700)!;
    expect(front.z).not.toBeCloseTo(back.z);
    camera.aspect = 600 / 900; camera.updateProjectionMatrix();
    const moved = screenToSkyGround(camera, 420, 280, 600, 900)!.project(camera);
    expect((moved.x + 1) * 300).toBeCloseTo(420);
    expect((1 - moved.y) * 450).toBeCloseTo(280);
  });
});

it('keeps the paused sky prototype inactive even for saved sky choices', () => {
  const saved = action('projectile', 'fire').map(event => ({ ...event, vfxPresentation: 'sky' as const }));
  expect(battleUsesSkyVfx(saved)).toBe(false);
  const presented = battlePresentationEvents(saved);
  expect(presented.every(event => event.vfxPresentation === 'instant')).toBe(true);
});
it('reuses canonical instant recipes without mutating resolved combat events', () => {
  for (const [source, expected] of [['lighting', 'thunder'], ['holy', 'light'], ['void', 'dark'], ['frost', 'frost'], ['fire', 'fire']]) {
    const events = action('projectile', source);
    const original = structuredClone(events);
    const presented = battlePresentationEvents(events);
    expect(presented.every(event => event.typeCatalog === 'instant' && event.typeEffect === expected)).toBe(true);
    expect(presented.map(event => [event.actionId, event.timestamp, event.defender, event.damage, event.mpCostApplied])).toEqual(events.map(event => [event.actionId, event.timestamp, event.defender, event.damage, event.mpCostApplied]));
    expect(events).toEqual(original);
  }
});
