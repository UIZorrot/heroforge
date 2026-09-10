export function wrapCardIndex(index: number, count: number) {
  return count > 0 ? ((index % count) + count) % count : 0;
}

// Each card occupies one position on a ring, including at the first/last seam.
export function circularCardOffset(index: number, activeIndex: number, count: number) {
  const offset = wrapCardIndex(index - activeIndex, count);
  return offset > count / 2 ? offset - count : offset;
}
