// Checks that every option the variant registry hands to route analysis is
// either passed to route searches by src/analysis/rule-options.js or
// explicitly excluded there. A new variant that fails this check would
// otherwise be silently dropped by the route searches (as Drift Deck was).
import { VARIANT_DEFINITIONS, applyVariantAnalysisOptions, buildVariantBundle } from "../variants.js";
import {
  ROUTE_ECONOMY_RAW_KEYS,
  ROUTE_RULE_BOOLEAN_KEYS,
  ROUTE_RULE_EXCLUDED_KEYS,
  ROUTE_RULE_RAW_KEYS
} from "../src/analysis/rule-options.js";

const covered = new Set([
  ...ROUTE_RULE_RAW_KEYS,
  ...ROUTE_RULE_BOOLEAN_KEYS,
  ...ROUTE_ECONOMY_RAW_KEYS,
  "routeAwareBatteryScoring"
]);
const excluded = new Set(ROUTE_RULE_EXCLUDED_KEYS);
const problems = [];

for (const key of [...covered]) {
  if (excluded.has(key)) problems.push(`${key} is both passed and excluded`);
}

// Every variant switched on, then each one alone, so no key hides behind
// another variant's default.
const bundles = [
  Object.fromEntries(VARIANT_DEFINITIONS.map((variant) => [variant.id, true])),
  ...VARIANT_DEFINITIONS.map((variant) => ({ [variant.id]: true }))
];
const seen = new Set();
for (const active of bundles) {
  const options = applyVariantAnalysisOptions({}, buildVariantBundle(active));
  for (const key of Object.keys(options)) seen.add(key);
}
for (const key of [...seen].sort()) {
  if (!covered.has(key) && !excluded.has(key)) {
    problems.push(`${key}: from the variant registry, but neither passed to route searches nor excluded (src/analysis/rule-options.js)`);
  }
}

if (problems.length) {
  console.error(problems.map((line) => `FAIL ${line}`).join("\n"));
  process.exit(1);
}
console.log(`Rule options: all ${seen.size} variant analysis keys are passed (${covered.size}) or excluded (${excluded.size}).`);
