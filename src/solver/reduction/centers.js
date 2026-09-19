// ---------------------------------------------------------------------------
// NxN reduction — center solving (no p5 dependency)
//
// Center pieces of a color are interchangeable, so "solved" just means every
// face shows its color. Centers are solved FIRST, and corners are solved LAST
// (by the 3×3 solver), so center operations need only preserve the OTHER
// centers — NOT corners. That lets us use short "corner-free" center moves
// (found by enumerating move sequences that permute just 2-3 center pieces),
// which are markedly cheaper than corner-preserving commutators. Each op's
// permutation of center positions is precomputed for fast evaluation; a beam
// search then composes them into a short solution (iterated local search is kept
// as a safety fallback). Only forward moves are recorded, so the emitted
// sequence always genuinely reaches the goal.
// ---------------------------------------------------------------------------

import { applyTurn } from "../cube-model.js";
import { faceOfColor, solvedCube } from "./model.js";

// How deep to enumerate center operators. Depth 4 yields short (3-4 qtm) ops and
// builds in ~3s (cached per size); it drives centers to ~43 qtm on average.
const OP_DEPTH = 4;
// Keep only the shortest ops — a smaller library keeps the beam fast with no
// meaningful loss in solution quality (the beam only ever uses a handful).
const LIB_CAP = 400;

// Per-size setup: the ordered list of center positions, each one's target face,
// and a library of {moves, perm} where perm[j] = index of the center position
// whose piece ends up at position j after the op.
const setupCache = new Map();
function centerSetup(size) {
  if (setupCache.has(size)) return setupCache.get(size);
  const solved = solvedCube(size);
  const centers = solved.filter((c) => c.stickers.length === 1);
  const posOf = centers.map((c) => c.pos.join(","));
  const index = new Map(posOf.map((p, i) => [p, i]));
  const targetFace = centers.map((c) => faceOfColor(c.stickers[0].color)); // solved => on its own face
  const NC = posOf.length;

  // Every single-layer quarter turn for this size.
  const off = (size - 1) / 2;
  const layers = [];
  for (let i = 0; i < size; i++) layers.push(i - off);
  const singles = [];
  for (const axis of ["x", "y", "z"]) for (const layer of layers) for (const dir of [1, -1]) singles.push({ axis, layer, dir });
  const layerKey = (m) => m.axis + m.layer;

  // Tagged working copy of ONLY the center pieces (24 of them, not all 56) — the
  // enumeration cares only about centers, so this makes the one-time build ~2×
  // faster. Each center carries its home index. Moves permute the centers in a
  // turned layer correctly whether or not the other pieces are present.
  const st = centers.map((c, i) => ({ pos: [...c.pos], stickers: [{ dir: [...c.stickers[0].dir], color: c.stickers[0].color, _id: i }] }));
  const changed = () => {
    let n = 0;
    for (const c of st) { const j = index.get(c.pos.join(",")); if (faceOfColor(c.stickers[0].color) !== targetFace[j]) n++; }
    return n;
  };
  const permNow = () => {
    const p = new Array(NC);
    for (const c of st) p[index.get(c.pos.join(","))] = c.stickers[0]._id;
    return p;
  };

  // DFS-enumerate short sequences that move only 2-3 center pieces (the rest
  // preserved), keeping the shortest sequence per distinct center permutation.
  const byPerm = new Map();
  const stack = [];
  const dfs = (depth, prevLayer) => {
    for (const m of singles) {
      if (layerKey(m) === prevLayer) continue; // no consecutive turns of one layer
      applyTurn(st, m.axis, m.layer, m.dir);
      stack.push(m);
      const ch = changed();
      if (ch >= 2 && ch <= 3) {
        const perm = permNow();
        const key = perm.join(",");
        const prev = byPerm.get(key);
        if (!prev || stack.length < prev.moves.length) byPerm.set(key, { moves: stack.map((x) => ({ ...x })), perm });
      }
      if (depth + 1 < OP_DEPTH) dfs(depth + 1, layerKey(m));
      stack.pop();
      applyTurn(st, m.axis, m.layer, -m.dir);
    }
  };
  dfs(0, "");

  const lib = [...byPerm.values()].sort((a, b) => a.moves.length - b.moves.length).slice(0, LIB_CAP);
  const setup = { posOf, targetFace, index, lib };
  setupCache.set(size, setup);
  return setup;
}

// Read the center color-face vector (which face color each center position shows)
// from a live state, ordered to match centerSetup's position order.
function readCenters(state, s) {
  const vec = new Array(s.posOf.length);
  for (const c of state) {
    if (c.stickers.length !== 1) continue;
    vec[s.index.get(c.pos.join(","))] = faceOfColor(c.stickers[0].color);
  }
  return vec;
}
const homeCount = (vec, target) => {
  let n = 0;
  for (let i = 0; i < vec.length; i++) if (vec[i] === target[i]) n++;
  return n;
};
const applyPerm = (vec, perm) => {
  const out = new Array(vec.length);
  for (let j = 0; j < vec.length; j++) out[j] = vec[perm[j]];
  return out;
};

// Beam search for a SHORT center solution: explore the op tree keeping the
// `width` best partial states per ply (ranked by centers-home then move cost),
// returning the op-index list of the first sequence that solves all centers.
// Returns null if it doesn't converge within `plies`.
function beamCenters(vec0, s, total, width, plies) {
  const target = s.targetFace;
  const start = { vec: vec0, moves: 0, cur: homeCount(vec0, target), parent: null, op: -1 };
  if (start.cur >= total) return [];
  const path = (node) => { const ops = []; for (let n = node; n && n.op >= 0; n = n.parent) ops.push(n.op); return ops.reverse(); };
  let frontier = [start];
  for (let ply = 0; ply < plies; ply++) {
    const next = [];
    for (const node of frontier) {
      for (let i = 0; i < s.lib.length; i++) {
        const vec = applyPerm(node.vec, s.lib[i].perm);
        const cur = homeCount(vec, target);
        const child = { vec, moves: node.moves + s.lib[i].moves.length, cur, parent: node, op: i };
        if (cur >= total) return path(child);
        next.push(child);
      }
    }
    next.sort((a, b) => b.cur - a.cur || a.moves - b.moves);
    const seen = new Set();
    frontier = [];
    for (const n of next) {
      const k = n.vec.join("");
      if (seen.has(k)) continue;
      seen.add(k);
      frontier.push(n);
      if (frontier.length >= width) break;
    }
    if (!frontier.length) break;
  }
  return null;
}

// Reliable fallback: iterated local search returning an op-index list (or null).
// Used only if the beam fails, so correctness never depends on the beam.
function ilsCenters(vec0, s, total) {
  const target = s.targetFace;
  let vec = vec0.slice();
  const sol = [];
  const applyOp = (i) => { vec = applyPerm(vec, s.lib[i].perm); sol.push(i); };
  const pick = () => (Math.random() * s.lib.length) | 0;
  let guard = 0;
  while (homeCount(vec, target) < total) {
    if (guard++ > 4000) return null;
    let best = -1, bestDelta = 0;
    const base = homeCount(vec, target);
    for (let i = 0; i < s.lib.length; i++) {
      const d = homeCount(applyPerm(vec, s.lib[i].perm), target) - base;
      if (d > bestDelta) { bestDelta = d; best = i; }
    }
    if (best >= 0) { applyOp(best); continue; }
    applyOp(pick());
    applyOp(pick());
  }
  return sol;
}

// Solve all centers. Finds a short op sequence (beam search, with the local
// search as a safety net), then applies those ops to `state` and pushes the
// engine moves. Returns true on success.
export function solveCenters(state, push, size) {
  const s = centerSetup(size);
  const vec = readCenters(state, s);
  const total = vec.length;

  const ops = beamCenters(vec, s, total, 150, 60) || ilsCenters(vec, s, total);
  if (!ops) return false;

  for (const i of ops) for (const m of s.lib[i].moves) { applyTurn(state, m.axis, m.layer, m.dir); push(m); }
  return homeCount(readCenters(state, s), s.targetFace) >= total;
}
