// Robo Rally Course Randomizer - small numeric helpers used by generation
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeBias(raw) {
  return Number(clamp(1 + raw, 1, 3).toFixed(2));
}
