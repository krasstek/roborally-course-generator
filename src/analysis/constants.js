// Robo Rally Course Randomizer - core constants of the route analysis model
export const DIRS = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 }
};

export const OPPOSITE = {
  N: "S",
  E: "W",
  S: "N",
  W: "E"
};

export const ACTIONS = [
  { id: "WAIT", type: "wait" },
  { id: "FORWARD", type: "move", relative: "forward" },
  { id: "FORWARD_2", type: "move", relative: "forward", steps: 2 },
  { id: "FORWARD_3", type: "move", relative: "forward", steps: 3 },
  { id: "BACK", type: "move", relative: "back" },
  { id: "LEFT", type: "turn", rotation: "ccw" },
  { id: "RIGHT", type: "turn", rotation: "cw" },
  { id: "UTURN", type: "turn", rotation: "uturn" }
];

export const ROTATION_ORDER = ["N", "E", "S", "W"];
export const EDGE_BEHAVIOR = "pit";
export const REBOOT_DAMAGE_PENALTY = 8;
export const MORE_DEADLY_REBOOT_DAMAGE_PENALTY = 12;
export const REGISTER_TEMPO_COST = 6.4;
export const REBOOT_AVERAGE_LOST_REGISTERS = 2;
// v49bf ownership: a reboot's skipped registers are factual lost tempo.
// The former fixed +3 "discontinuity" surcharge mixed cognitive difficulty into
// route cost. Mental burden is now owned by post-build mental RE, so the legacy
// discontinuity premium remains only as an explicit zero-valued diagnostic.
export const REBOOT_DISCONTINUITY_PENALTY = 0;
export const REGISTER_COUNT = 5;
// Expected auto-kill exposure uses the same underlying reboot consequence for
// pits, edges, crushers and trapdoors. Recovery location then determines
// whether that threat is merely lethal, additionally loses course progress,
// or (for token-based recovery only) can sometimes be exploited as mobility.
export const AUTO_KILL_SETBACK_TEMPO_PER_STEP = REGISTER_TEMPO_COST * 0.5;
export const AUTO_KILL_PRESSURE_SETBACK_WEIGHT = 0.08;
export const PROGRAM_CARD_COUNTS = new Map([
  ["FORWARD", 4],
  ["FORWARD_2", 3],
  ["FORWARD_3", 1],
  ["RIGHT", 4],
  ["LEFT", 4],
  ["UTURN", 1],
  ["BACK", 1],
  ["WAIT", 1]
]);
export const PROGRAM_CARD_IDS = Object.freeze([...PROGRAM_CARD_COUNTS.keys()]);
export const AGAIN_CARD_COUNT = 1;

// v49by PROVISIONAL card-scarcity adaptability calibration.
//
// Exact hypergeometric probability remains the mathematical model of whether a
// PARTICULAR desired program can be realized from the abstract rolling deck
// state. The scarcity normalization remains:
//
//   rawScarcityRE = max(0, P(four-copy baseline) / P(program) - 1)
//
// That definition gives exactly 0 extra RE to an ordinary four-copy baseline.
// v49by does NOT alter the hypergeometric probability or natural/Again legality.
//
// The course analyzer is not a literal deck/discard simulator, though, and it
// undervalues information/adaptation available to a real player: the player sees
// the actual hand and can often choose a different comparably good program rather
// than needing one exact preselected sequence. The rolling two-turn depletion
// state is also deliberately simplified rather than a literal deck-order model.
//
// Therefore v49by tests a SIMPLE LINEAR compression of only EXTRA scarcity:
//
//   practicalCardRE = rawScarcityRE * 0.70
//
// 0.70 is deliberately provisional, not a fitted truth. Keep this factor easy to
// inspect/remove/change. Never replace exact hypergeometry with card-category
// surcharges, and never add an independent Repeat/Again RE surcharge: repeat
// availability is already the exact union of legal natural/Again realizations.
export const PROGRAM_CARD_SCARCITY_ADAPTABILITY_FACTOR = 0.70;

// v49ek programming-variant ownership. Probability mechanics and the mapping
// from probability -> practical card RE are deliberately separate.
//
// Normal play retains the provisional alpha=0.70 abstraction discount.
// Less Foreshadowing resets the programming deck at every turn boundary, so the
// previous-turn depletion state is not carried and the ordinary omitted-state
// discount is removed (base alpha=1.0). Shared Deck deliberately does NOT model
// a fictitious enlarged per-player deck or cross-robot hands; instead its omitted
// shared-state uncertainty raises alpha with player count. This increment is
// intentionally uncapped so Less Foreshadowing + Shared Deck can exceed 1.0.
// Factory Rejects changes only the actual hand size used by hypergeometry.
export const SHARED_DECK_ALPHA_INCREMENT_PER_ADDITIONAL_PLAYER = 0.05;
