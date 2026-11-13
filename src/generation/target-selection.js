// Robo Rally Course Randomizer - several difficulty / length bands picked at once
//
// The player may pick any set of difficulty bands and any set of length bands.
// The saved preference keeps one string per axis: "any" (nothing picked), one
// band id ("hard", as before) or a comma list in band order ("moderate,hard").
//
// Generation resolves the pick into two things (resolveTargetSelection):
//   - preferences[axis]: one concrete band drawn from the pick. Heuristics tuned
//     by level (checkpoint weights, overlays, start prices...) read this, as they
//     do for "Any".
//   - preferences[`${axis}Targets`]: the picked bands, set only when two or more
//     are picked. Acceptance and guidance hold the course to any of them.
//
// Checks that judge a value against the request use the picked band nearest to
// that value (getNearestTargetBand). With one band picked that is always the band
// itself, so single picks behave exactly as before.

export const TARGET_BAND_ORDER = Object.freeze({
  difficulty: Object.freeze(["easy", "moderate", "hard", "brutal"]),
  length: Object.freeze(["short", "moderate", "long", "epic"])
});

export function parseTargetSelection(value, axis) {
  const order = TARGET_BAND_ORDER[axis] ?? [];
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  const picked = new Set(raw.map((entry) => String(entry).trim()).filter(Boolean));
  return order.filter((band) => picked.has(band));
}

export function formatTargetSelection(bands, axis) {
  const parsed = parseTargetSelection(bands, axis);
  return parsed.length ? parsed.join(",") : "any";
}

export function isMultiTargetSelection(value, axis) {
  return parseTargetSelection(value, axis).length > 1;
}

// Bands the course is held to on this axis; null when the axis only steers
// construction ("Any") or has no target.
export function getRequestedTargetBands(preferences = {}, axis) {
  const guidanceOnly = axis === "difficulty"
    ? preferences.targetGuidanceOnlyDifficulty
    : preferences.targetGuidanceOnlyLength;
  if (guidanceOnly) return null;
  const targets = preferences[`${axis}Targets`];
  if (Array.isArray(targets) && targets.length > 1) return [...targets];
  const single = preferences[axis];
  return single && single !== "any" ? [single] : null;
}

function distanceToBand(value, band) {
  const [low, high] = band;
  if (value < low) return low - value;
  if (value >= high) return value - high;
  return 0;
}

// The picked band nearest to `value` (inside one = distance 0). Falls back to the
// concrete preference when there is no multi pick or no finite value, so callers
// can use it wherever they used preferences[axis].
export function getNearestTargetBand(preferences = {}, axis, value, thresholds) {
  const targets = preferences[`${axis}Targets`];
  if (!Array.isArray(targets) || targets.length < 2) return preferences[axis];
  const number = Number(value);
  if (!Number.isFinite(number)) return preferences[axis];
  let best = null;
  let bestDistance = Infinity;
  for (const band of targets) {
    if (!thresholds?.[band]) continue;
    const distance = distanceToBand(number, thresholds[band]);
    if (distance < bestDistance) {
      best = band;
      bestDistance = distance;
    }
  }
  return best ?? preferences[axis];
}

// Same as getNearestTargetBand on the log scale the guidance model works in.
export function getNearestTargetBandForLog(preferences = {}, axis, logValue, thresholds) {
  const targets = preferences[`${axis}Targets`];
  if (!Array.isArray(targets) || targets.length < 2) return preferences[axis];
  const number = Number(logValue);
  if (!Number.isFinite(number)) return preferences[axis];
  const toLog = (value) => (value > 0 ? Math.log(value) : -Infinity);
  let best = null;
  let bestDistance = Infinity;
  for (const band of targets) {
    if (!thresholds?.[band]) continue;
    const [low, high] = thresholds[band];
    const distance = distanceToBand(number, [toLog(low), Number.isFinite(high) ? Math.log(high) : Infinity]);
    if (distance < bestDistance) {
      best = band;
      bestDistance = distance;
    }
  }
  return best ?? preferences[axis];
}

// Turns the player's pick into generation preferences. `draw(pool)` picks the
// concrete band ("Any" keeps its own pool rules in the caller).
export function resolveTargetSelection(preferences = {}, axis, draw) {
  const picked = parseTargetSelection(preferences[axis], axis);
  if (picked.length < 2) return null;
  return { concrete: draw(picked), targets: picked };
}

// Early-abort checks (gross mismatch) with several picked bands: a course is
// stopped only when it is far off every picked band on an axis. `check` is the
// single-band check; setting an axis to "any" switches that axis off there.
export function checkAgainstEveryPickedBand(check, metrics, preferences = {}) {
  const difficultyTargets = preferences.difficultyTargets?.length > 1 ? preferences.difficultyTargets : null;
  const lengthTargets = preferences.lengthTargets?.length > 1 ? preferences.lengthTargets : null;
  if (!difficultyTargets && !lengthTargets) return check(metrics, preferences);
  const base = { ...preferences, difficultyTargets: undefined, lengthTargets: undefined };
  const axisResult = (axis, bands) => {
    const other = axis === "difficulty" ? "length" : "difficulty";
    const results = bands.map((band) => check(metrics, { ...base, [axis]: band, [other]: "any" }));
    return results.every((result) => result?.abort) ? results[0] : null;
  };
  const difficultyAbort = axisResult("difficulty", difficultyTargets ?? [preferences.difficulty]);
  if (difficultyAbort) return difficultyAbort;
  const lengthAbort = axisResult("length", lengthTargets ?? [preferences.length]);
  if (lengthAbort) return lengthAbort;
  return check(metrics, { ...base, difficulty: "any", length: "any" });
}
