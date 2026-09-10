import { describe, expect, it } from 'vitest';
import { circularCardOffset, wrapCardIndex } from './cardCarousel';

describe('card carousel ring', () => {
  it('wraps arrows across both ends, including small collections', () => {
    expect(wrapCardIndex(-1, 8)).toBe(7);
    expect(wrapCardIndex(8, 8)).toBe(0);
    expect(wrapCardIndex(-1, 1)).toBe(0);
    expect(wrapCardIndex(1, 0)).toBe(0);
  });

  it('centers the active card and puts the last card immediately to its left', () => {
    expect(Array.from({ length: 8 }, (_, i) => circularCardOffset(i, 0, 8))).toEqual([0, 1, 2, 3, 4, -3, -2, -1]);
    expect(circularCardOffset(0, 7, 8)).toBe(1);
    expect(circularCardOffset(7, 7, 8)).toBe(0);
  });

  it('assigns unique positions for odd/even counts and reaches every card beyond a page', () => {
    for (const count of [1, 2, 3, 8, 25, 500]) {
      const visited = new Set<number>();
      for (let active = 0; active < count; active++) {
        visited.add(wrapCardIndex(active + 1, count));
        const positions = Array.from({ length: count }, (_, i) => circularCardOffset(i, active, count));
        expect(new Set(positions).size).toBe(count);
        expect(positions[active]).toBe(0);
        expect(positions.every((offset) => Math.abs(offset) <= Math.ceil(count / 2))).toBe(true);
      }
      expect(visited.size).toBe(count);
    }
  });
});
