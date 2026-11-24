#!/usr/bin/env node
// Builds src/analysis/card-table.js: what programming cards cost a route per
// turn, in register-equivalents (RE), for each card setup (deck, hand size,
// deck cycle, damage cards in the deck).
//
// Card RE is execution risk (user design 2026-11-24): the plan is made for a
// hand the player may not hold. Measured by replaying the golden courses'
// routes turn by turn with the REAL programming deck cycle (draw the hand,
// discard all of it at the end of the turn, reshuffle the discard when the draw
// pile runs short; or a fresh deck every turn for Less Foreshadowing), many
// shuffles per route; per turn the best program from the hand (real movement,
// scored by cost plus registers still to go to the next checkpoint) is compared
// with the planned turn. The mean loss per turn is the setup's base card cost.
// A route that reuses a scarce card (Move 3, U-turn, Back Up, Again, Power Up)
// from the previous turn pays more: measured by forcing last turn's hand to
// hold those cards.
// (Studies 2026-11-24: calibration-output/studies/2026-11-24-card-risk/.)
//
// New variants or expansions: add a setup below and rerun.
// Needs the local golden baseline (golden-output/baseline, `npm run golden record`).
//
// Run: node scripts/build-card-table.mjs            (all setups, ~6-10 min)
//      node scripts/build-card-table.mjs --worker <setup-json> <shard> <shards>   (internal)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const BASELINE = join(ROOT, "golden-output", "baseline");
const SHUFFLES = 40;
const SHARDS = 6;
const SCARCE = ["FORWARD_3", "UTURN", "BACK", "AGAIN", "WAIT"];
const SETUPS = [
  { id: "standard-9", deck: "standard", hand: 9, cycle: "personal", spam: 0 },
  { id: "standard-7", deck: "standard", hand: 7, cycle: "personal", spam: 0 },
  { id: "standard-8", deck: "standard", hand: 8, cycle: "personal", spam: 0 },
  { id: "standard-10", deck: "standard", hand: 10, cycle: "personal", spam: 0 },
  { id: "drift-9", deck: "drift", hand: 9, cycle: "personal", spam: 0 },
  { id: "standard-9-reset", deck: "standard", hand: 9, cycle: "reset", spam: 0 },
  { id: "standard-9-spam2", deck: "standard", hand: 9, cycle: "personal", spam: 2 },
  { id: "standard-9-spam4", deck: "standard", hand: 9, cycle: "personal", spam: 4 },
  { id: "standard-9-repeat", deck: "standard", hand: 9, cycle: "personal", spam: 0, repeat: true }
];

async function worker(setup, shard, shards) {
  console.log = console.warn = console.info = console.debug = () => {};
  const hooks = await import(join(ROOT, "src/generation/calibration-hooks.js"));
  const dr = await import(join(ROOT, "src/generation/dev-replay.js"));
  const { simulateAction } = await import(join(ROOT, "src/analysis/movement.js"));
  const { ACTIONS, REGISTER_TEMPO_COST } = await import(join(ROOT, "src/analysis/constants.js"));
  const { getProgramDeck } = await import(join(ROOT, "src/analysis/program-availability.js"));
  const { getRegisterDistanceToTarget } = await import(join(ROOT, "src/analysis/goal-distance.js"));
  const assets = await hooks.loadCalibrationAssets();
  const ACTION_BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));
  const PER_REG = 8.3; // measured average cost per register still to go (board-aim study)
  let seed = 20261124 + shard * 7919;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rows = [];
  const files = readdirSync(BASELINE).filter((f) => f.endsWith(".json")).sort().filter((_, i) => i % shards === shard);
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(BASELINE, file), "utf8")).raw;
    if (!raw) continue;
    let sc; try { sc = await hooks.hydrateScenarioForTesting(assets, raw); } catch { continue; }
    if (sc.movingTargets || sc.driftDeck) continue;
    const tileMap = sc.goalTileMap;
    const options = { ...dr.getDamageFoundationScenarioOptions(sc), driftDeck: setup.deck === "drift" };
    const deckList = []; for (const [id, n] of getProgramDeck(options).counts) for (let i = 0; i < n; i += 1) deckList.push(id);
    deckList.push("AGAIN"); for (let i = 0; i < setup.spam; i += 1) deckList.push("SPAM");
    const physics = new Map();
    const sim = (st, actionId, reg) => {
      const key = `${st.x},${st.y},${st.facing},${reg},${actionId}`;
      let t = physics.get(key);
      if (t === undefined) { try { t = simulateAction(tileMap, { x: st.x, y: st.y, facing: st.facing }, ACTION_BY_ID.get(actionId), { ...options, registerIndex: reg }); } catch { t = null; } physics.set(key, t); }
      return t;
    };
    const dist = (st, target) => getRegisterDistanceToTarget(tileMap, st, target, options);
    for (const s of (sc.sequence?.firstLeg?.starts ?? []).filter((x) => x.fullCourseRoute).slice(0, 5)) {
      const tr = s.fullCourseRoute.transitions;
      const hits = s.fullCourseRoute.checkpointHits ?? [];
      const turnsN = Math.floor(tr.length / 5);
      const info = [];
      for (let turn = 1; turn <= turnsN; turn += 1) {
        const seg = tr.slice(5 * (turn - 1), 5 * turn);
        const prevSeg = turn > 1 ? tr.slice(5 * (turn - 2), 5 * (turn - 1)) : [];
        const ok = seg.length === 5 && !seg.some((t) => t.rebooted) && seg[0].absoluteAction === 5 * (turn - 1) + 1 && !prevSeg.some((t) => t.rebooted);
        const lastAbs = seg[4]?.absoluteAction;
        const next = ok ? hits.find((h) => h.absoluteAction >= lastAbs) : null;
        if (!ok || !next || hits.some((h) => h.absoluteAction >= seg[0].absoluteAction && h.absoluteAction < lastAbs)) { info.push(null); continue; }
        let st = seg[0].from, cost = 0, prevA = turn > 1 ? prevSeg[4].action : null, good = true;
        for (let reg = 0; reg < 5; reg += 1) {
          const id = seg[reg].programCard === "AGAIN" ? prevA : seg[reg].action;
          const t = sim(st, id, reg);
          if (!t || !t.to || t.rebooted) { good = false; break; }
          cost += REGISTER_TEMPO_COST + (t.hazard || 0) + (t.rebootPenalty || 0); st = t.to; prevA = id;
        }
        const d = good ? dist(st, next.position) : null;
        if (!good || d === null || st.x !== seg[4].to.x || st.y !== seg[4].to.y) { info.push(null); continue; }
        const cards = seg.map((t) => t.programCard);
        info.push({ turn, seg, target: next.position, planValue: cost + d * PER_REG, cards, scarce: cards.filter((c) => SCARCE.includes(c)).length,
          prevA0: turn > 1 ? prevSeg[4].action : null, sum: 0, n: 0 });
      }
      if (!info.some(Boolean)) continue;
      for (let sh = 0; sh < SHUFFLES; sh += 1) {
        let draw = shuffle(deckList.slice()), discard = [];
        for (let turn = 1; turn <= turnsN; turn += 1) {
          let hand;
          if (setup.cycle === "reset") hand = shuffle(deckList.slice()).slice(0, setup.hand);
          else {
            if (draw.length < setup.hand) { hand = draw; draw = shuffle(discard); discard = []; hand = hand.concat(draw.splice(0, setup.hand - hand.length)); }
            else hand = draw.splice(0, setup.hand);
            const nextInfo = setup.repeat ? info[turn] : null;
            if (nextInfo) for (const c of nextInfo.cards.filter((x) => SCARCE.includes(x))) {
              if (hand.includes(c)) continue;
              const at = draw.indexOf(c); if (at < 0) continue;
              const out = hand.findIndex((x) => !SCARCE.includes(x) && !nextInfo.cards.includes(x)); if (out < 0) continue;
              [hand[out], draw[at]] = [draw[at], hand[out]];
            }
            discard.push(...hand);
          }
          const t0 = info[turn - 1];
          if (!t0) continue;
          const counts = new Map(); for (const id of hand) counts.set(id, (counts.get(id) || 0) + 1);
          const usable = hand.filter((c) => c !== "SPAM").length;
          const memo = new Map();
          const best = (st, reg, prevAction) => {
            if (reg === 5) { const dd = dist(st, t0.target); return dd === null ? Infinity : dd * PER_REG; }
            const key = `${st.x},${st.y},${st.facing},${reg},${prevAction},${[...counts.values()].join("")}`;
            const m = memo.get(key); if (m !== undefined) return m;
            let b = Infinity;
            for (const [id, n] of counts) {
              if (n <= 0) continue;
              if (id === "SPAM" && usable >= 5) continue; // SPAM only when short of cards (then clog owns it)
              const actionId = id === "SPAM" ? "WAIT" : id === "AGAIN" ? prevAction : id;
              if (!actionId || !ACTION_BY_ID.has(actionId)) continue;
              const t = sim(st, actionId, reg);
              if (!t || !t.to) continue;
              const step = REGISTER_TEMPO_COST + (t.hazard || 0) + (t.rebootPenalty || 0);
              counts.set(id, n - 1);
              let v;
              if (t.rebooted) { const dd = dist(t.to, t0.target); v = step + (4 - reg) * REGISTER_TEMPO_COST + (dd === null ? Infinity : dd * PER_REG); }
              else if (t.to.x === t0.target.x && t.to.y === t0.target.y) v = step;
              else v = step + best(t.to, reg + 1, actionId);
              counts.set(id, n);
              if (v < b) b = v;
            }
            memo.set(key, b);
            return b;
          };
          const v = best(t0.seg[0].from, 0, t0.prevA0);
          if (!Number.isFinite(v)) continue;
          t0.sum += Math.max(0, v - t0.planValue) / REGISTER_TEMPO_COST; t0.n += 1;
        }
      }
      for (const t of info) if (t && t.n) rows.push({ key: `${file}|${s.index}|${t.turn}`, turn: t.turn, scarce: t.scarce, loss: t.sum / t.n });
    }
  }
  process.stdout.write(JSON.stringify(rows));
}

function runSetup(setup) {
  return Promise.all(Array.from({ length: SHARDS }, (_, shard) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--worker", JSON.stringify(setup), String(shard), String(SHARDS)], { stdio: ["ignore", "pipe", "inherit"] });
    let out = ""; child.stdout.on("data", (d) => { out += d; });
    child.on("close", (code) => (code === 0 ? resolve(JSON.parse(out || "[]")) : reject(new Error(`${setup.id} shard ${shard} exit ${code}`))));
  }))).then((parts) => parts.flat());
}

if (process.argv[2] === "--worker") {
  await worker(JSON.parse(process.argv[3]), Number(process.argv[4]), Number(process.argv[5]));
  process.exit(0);
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const round = (v) => Number(v.toFixed(3));
const results = {};
for (const setup of SETUPS) {
  const started = Date.now();
  results[setup.id] = await runSetup(setup);
  process.stderr.write(`${setup.id}: ${results[setup.id].length} turns, mean loss ${mean(results[setup.id].map((r) => r.loss)).toFixed(3)} RE (${Math.round((Date.now() - started) / 1000)} s)\n`);
}
const base = (id) => round(mean(results[id].map((r) => r.loss)));
// Repeat cost: turns after the first whose own scarce cards last turn's hand held.
const normalByKey = new Map(results["standard-9"].map((r) => [r.key, r]));
const repeatGain = (pick) => {
  const pairs = results["standard-9-repeat"].filter((r) => r.turn > 1 && pick(r.scarce)).map((r) => [normalByKey.get(r.key), r]).filter((p) => p[0]);
  return round(Math.max(0, mean(pairs.map(([n, r]) => r.loss - n.loss))));
};
// Damage cards: extra loss per expected damage card in a 9-card hand.
const inHand = (k) => 9 * k / (20 + k);
const perDamageCard = round(mean([
  (base("standard-9-spam2") - base("standard-9")) / inHand(2),
  (base("standard-9-spam4") - base("standard-9")) / inHand(4)
]));
const table = {
  decks: {
    standard: { personal: { 7: base("standard-7"), 8: base("standard-8"), 9: base("standard-9"), 10: base("standard-10") }, reset: { 9: base("standard-9-reset") } },
    drift: { personal: { 9: base("drift-9") } }
  },
  repeatOneScarce: repeatGain((k) => k === 1),
  repeatTwoOrMoreScarce: repeatGain((k) => k >= 2),
  perDamageCardInHand: perDamageCard,
  scarceCards: SCARCE,
  turns: results["standard-9"].length,
  shuffles: SHUFFLES
};
const out = `// Robo Rally Course Randomizer - generated by scripts/build-card-table.mjs; do not edit by hand.
// Card RE per turn (execution risk) by card setup: base loss per turn for a
// deck, cycle rule and hand size; the extra when a scarce card is reused from
// the previous turn; and the extra per expected damage card in hand.
export const CARD_TABLE = Object.freeze(${JSON.stringify(table)});
`;
writeFileSync(join(ROOT, "src", "analysis", "card-table.js"), out);
console.log(JSON.stringify(table, null, 1));
