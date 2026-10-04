// Helpers for the one-clock animations (PaidMoment, JarMoment): a single linear
// millisecond value drives everything, and each element reads its own
// [start, end] slice of it through one of these. Both are worklets.

// 0 -> 1 across `range`, easing out — for things arriving.
export const seg = (ms, range) => {
  'worklet';
  const x = Math.min(1, Math.max(0, (ms - range[0]) / (range[1] - range[0])));
  return 1 - (1 - x) * (1 - x) * (1 - x);
};

// 0 -> 1 across `range`, slow at both ends — for things leaving, so nothing
// starts or stops with a visible edge.
export const soft = (ms, range) => {
  'worklet';
  const x = Math.min(1, Math.max(0, (ms - range[0]) / (range[1] - range[0])));
  return x * x * (3 - 2 * x);
};
