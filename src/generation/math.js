// Robo Rally Course Randomizer - small numeric helpers used by generation
import { clamp } from "../shared/math.js";

export function normalizeBias(raw) {
  return Number(clamp(1 + raw, 1, 3).toFixed(2));
}

export function getCombinationCount(n, k, cap = 50001) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= k; index += 1) {
    value = (value * (n - k + index)) / index;
    if (value >= cap) return cap;
  }
  return Math.round(value);
}
