// Vertical/diagonal movement and small taps must never change advertisements.
export function horizontalSwipe(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
export function boundedIndex(index, length) {
  return Math.max(0, Math.min(Math.max(0, length - 1), index));
}
