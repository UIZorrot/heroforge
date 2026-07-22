import { describe, expect, it } from 'vitest';
import {
  BATTLE_BUFF_DISPLAY,
  BATTLE_BUFF_PRIORITY,
  activeBattleBuffKeys,
  battleBuffKeyForName,
  dominantBattleBuffKey,
} from './battleBuffDisplay';
import { canonicalBattleBuffNames } from './battleVfxCatalog';

describe('battle buff display config', () => {
  it('covers exactly the canonical buff roster with a complete visual recipe', () => {
    expect(Object.keys(BATTLE_BUFF_DISPLAY).sort()).toEqual([...canonicalBattleBuffNames].sort());
    for (const key of canonicalBattleBuffNames) {
      const display = BATTLE_BUFF_DISPLAY[key];
      expect(display.key).toBe(key);
      expect(display.label.length).toBeGreaterThan(0);
      expect(display.gradeClass.length).toBeGreaterThan(0);
      expect(display.behavior.length).toBeGreaterThan(0);
      for (const channel of [display.palette.core, display.palette.hot, display.palette.dark, display.palette.text]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(0xffffff);
      }
    }
  });

  it('marks only frozen and stun as card-controlling buffs', () => {
    const controlKeys = canonicalBattleBuffNames.filter((key) => BATTLE_BUFF_DISPLAY[key].control);
    expect(controlKeys.sort()).toEqual(['frozen', 'stun']);
    for (const key of controlKeys) {
      expect(BATTLE_BUFF_DISPLAY[key].artClass).toBeDefined();
    }
  });

  it('keeps heal on a warm gold palette instead of emerald', () => {
    const { core, hot } = BATTLE_BUFF_DISPLAY.heal.palette;
    // Warm gold reads red-dominant with a green second channel, never green-dominant.
    expect((core >> 16) & 0xff).toBeGreaterThan((core >> 8) & 0xff);
    expect((core >> 8) & 0xff).toBeGreaterThan(core & 0xff);
    expect((hot >> 16) & 0xff).toBeGreaterThan(hot & 0xff);
  });

  it('resolves legacy buff names through the merged aliases', () => {
    expect(battleBuffKeyForName('weakness')).toBe('curse');
    expect(battleBuffKeyForName('vulnerable')).toBe('curse');
    expect(battleBuffKeyForName('corrupt')).toBe('curse');
    expect(battleBuffKeyForName('bless')).toBe('pray');
    expect(battleBuffKeyForName('haste')).toBe('pray');
    expect(battleBuffKeyForName(' Burn ')).toBe('burn');
    expect(battleBuffKeyForName('not-a-buff')).toBeUndefined();
  });

  it('orders active buffs by priority with the dominant buff first', () => {
    expect(activeBattleBuffKeys(['pray', 'poison', 'stun', 'poison'])).toEqual(['stun', 'poison', 'pray']);
    expect(dominantBattleBuffKey(['heal', 'burn'])).toBe('burn');
    expect(dominantBattleBuffKey(['heal', 'pray'])).toBe('heal');
    expect(dominantBattleBuffKey(['unknown-status'])).toBeUndefined();
    expect(BATTLE_BUFF_PRIORITY).toEqual(['frozen', 'stun', 'burn', 'poison', 'wound', 'curse', 'heal', 'pray']);
  });
});
