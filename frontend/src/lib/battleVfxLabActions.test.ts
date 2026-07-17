import { describe, expect, it } from 'vitest';
import { battleVfxLabActions } from './battleVfxLabActions';
import { createVfxTestEvent } from './vfxTestHarness';

describe('battle VFX lab actions', () => {
  it('derives the complete starter action list from gameplay data', () => {
    expect(battleVfxLabActions).toHaveLength(17);
    expect(battleVfxLabActions[0]).toMatchObject({
      label: 'Basic Attack',
      heroName: 'Garran',
      typeCatalog: 'instant',
      typeEffect: 'slash',
    });
  });

  it('builds named skill events without changing their gameplay contract', () => {
    const witchflame = battleVfxLabActions.find((action) => action.label === 'Witchflame Cut');
    const comet = battleVfxLabActions.find((action) => action.label === 'Arcane Comet');

    expect(createVfxTestEvent('action', witchflame?.value ?? '', 1)).toMatchObject({
      skillName: 'Witchflame Cut',
      typeCatalog: 'instant',
      typeEffect: 'fire',
    });
    expect(createVfxTestEvent('action', comet?.value ?? '', 2)).toMatchObject({
      skillName: 'Arcane Comet',
      typeCatalog: 'proj',
      typeEffect: 'magic',
    });
  });
});
