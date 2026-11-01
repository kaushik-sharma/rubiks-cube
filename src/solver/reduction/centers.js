// ---------------------------------------------------------------------------
// NxN reduction — center solving (no p5 dependency)
//
// Center pieces of a color are interchangeable, so "solved" just means every
// face shows its color. Centers are solved FIRST, and corners are solved LAST
// (by the 3×3 solver), so center operations need only preserve the OTHER
// centers — NOT corners. That lets us use short "corner-free" center moves,
// found by enumerating move sequences that disturb only a couple of centers.
//
// Everything runs in PERMUTATION space: each single quarter turn is reduced once
// to a permutation of the center slots, and the search then composes integer
// arrays instead of re-simulating cubies. A beam search composes library ops into
// a short solution (iterated local search is kept as a safety fallback). Only
// forward moves are recorded, so the emitted sequence always reaches the goal.
//
// Odd cubes (5×5) need two things an even cube does not:
//   * their six FACE centers form a rigid frame that no operator can move, so a
//     middle-slice turn in the scramble must be undone up front (normalizeFrame);
//   * nothing at this search depth disturbs fewer than 4 centers, and a beam
//     driven only by such coarse ops always stalls a few centers short — so the
//     library is topped up with fine 3-cycles built from commutators.
// ---------------------------------------------------------------------------

import { applyTurn } from "../cube-model.js";
import { faceOfColor, faceOfDir, solvedCube } from "./model.js";

// How deep to enumerate center operators. Depth 4 yields short (3-4 qtm) ops and
// builds in a fraction of a second (cached per size).
const OP_DEPTH = 4;
// Keep only the shortest ops — a smaller library keeps the beam fast with no
// meaningful loss in solution quality (the beam only ever uses a handful).
const LIB_CAP = 400;
// An operator is useful when it disturbs FEW centers, but how few is achievable
// depends on the size: within OP_DEPTH quarter turns a 4×4 can displace as few as
// 2 centers, while a 5×5 cannot do better than 4 (a slice turn drags 3 centers
// across each of 4 faces, and 4 turns can't narrow that further). So we collect
// everything up to this bound and fill the library from the least-disturbing
// ops upward — a hard-coded window would build an EMPTY library for 5×5.
const MAX_DISTURB = 6;
// Sizes whose cheapest operator still disturbs more than this many centers get a
// commutator-built endgame library (see fineOps).
const FINE_TRIGGER = 2;
const FINE_MOVED = 3; // a fine op is a 2- or 3-cycle of center pieces
const FINE_CAP = 400;

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
  // On an ODD cube the six FACE centers (two zero coordinates) form a rigid
  // frame that only a middle-slice turn can move — and a middle slice displaces
  // 12 centers, far past MAX_DISTURB. We require operators to fix it explicitly
  // rather than relying on that bound, because the beam depends on it:
  // normalizeFrame squares the frame up front, and the library must leave it be.
  const frameIdx = centers.map((c, i) => (c.pos.filter((v) => v === 0).length === 2 ? i : -1)).filter((i) => i >= 0);

  // Every single-layer quarter turn for this size.
  const off = (size - 1) / 2;
  const layers = [];
  for (let i = 0; i < size; i++) layers.push(i - off);
  const singles = [];
  for (const axis of ["x", "y", "z"]) for (const layer of layers) for (const dir of [1, -1]) singles.push({ axis, layer, dir });
  const layerKey = (m) => m.axis + m.layer;

  // Reduce each single turn to its permutation of the center slots (done once,
  // on a positions-only copy of the centers — the rest of the cube is irrelevant
  // here, and a turn permutes the centers in its layer the same either way).
  const movePerm = singles.map((m) => {
    const st = centers.map((c, i) => ({ pos: [...c.pos], stickers: [], id: i }));
    applyTurn(st, m.axis, m.layer, m.dir);
    const p = new Int32Array(NC);
    for (const c of st) p[index.get(c.pos.join(","))] = c.id;
    return p;
  });
  const ident = new Int32Array(NC);
  for (let i = 0; i < NC; i++) ident[i] = i;
  const then = (a, b) => { const o = new Int32Array(NC); for (let j = 0; j < NC; j++) o[j] = a[b[j]]; return o; }; // apply a, then b
  const inverse = (p) => { const o = new Int32Array(NC); for (let j = 0; j < NC; j++) o[p[j]] = j; return o; };
  // Positions left showing the WRONG color (what the beam minimizes) vs. pieces
  // actually moved (what makes an op precise enough for the endgame).
  const disturbed = (p) => { let n = 0; for (let j = 0; j < NC; j++) if (targetFace[p[j]] !== targetFace[j]) n++; return n; };
  const movedCount = (p) => { let n = 0; for (let j = 0; j < NC; j++) if (p[j] !== j) n++; return n; };
  const keepsFrame = (p) => frameIdx.every((j) => p[j] === j);
  const copyMoves = (ops) => ops.map((i) => ({ ...singles[i] }));

  // DFS-enumerate short sequences that disturb few centers, keeping the shortest
  // sequence per distinct center permutation.
  const byPerm = new Map();
  const stack = [];
  const dfs = (depth, cur, prevLayer) => {
    for (let i = 0; i < singles.length; i++) {
      if (layerKey(singles[i]) === prevLayer) continue; // no consecutive turns of one layer
      const perm = then(cur, movePerm[i]);
      stack.push(i);
      const ch = disturbed(perm);
      if (ch >= 2 && ch <= MAX_DISTURB && keepsFrame(perm)) {
        const key = perm.join(",");
        const prev = byPerm.get(key);
        if (!prev || stack.length < prev.ops.length) byPerm.set(key, { ops: stack.slice(), perm, ch });
      }
      if (depth + 1 < OP_DEPTH) dfs(depth + 1, perm, layerKey(singles[i]));
      stack.pop();
    }
  };
  dfs(0, ident, "");

  // Least-disturbing first, then shortest: the beam wants precise, cheap ops.
  const coarse = [...byPerm.values()].sort((a, b) => a.ch - b.ch || a.ops.length - b.ops.length).slice(0, LIB_CAP);
  const lib = coarse.map((o) => ({ moves: copyMoves(o.ops), perm: o.perm }));

  // Commutators A B A' B' that 3-cycle centers: 8 quarter turns, but they move
  // only 2-3 pieces. Coarse ops get the bulk of the centers home cheaply and
  // these finish the job. Even cubes already have 2-center operators and skip
  // this entirely, keeping their tuned move count.
  function fineOps() {
    const A2 = [], A3 = [], B1 = [], B2 = [];
    for (let i = 0; i < singles.length; i++) B1.push({ ops: [i], perm: movePerm[i] });
    for (let i = 0; i < singles.length; i++) {
      for (let j = 0; j < singles.length; j++) {
        if (layerKey(singles[j]) === layerKey(singles[i])) continue;
        const p2 = then(movePerm[i], movePerm[j]);
        A2.push({ ops: [i, j], perm: p2 });
        B2.push({ ops: [i, j], perm: p2 });
        for (let k = 0; k < singles.length; k++) {
          if (layerKey(singles[k]) === layerKey(singles[j])) continue;
          A3.push({ ops: [i, j, k], perm: then(p2, movePerm[k]) });
        }
      }
    }
    for (const b of B1) b.inv = inverse(b.perm);
    for (const b of B2) b.inv = inverse(b.perm);

    const found = new Map();
    // |A|=2,|B|=2 and |A|=3,|B|=1 both give 8-quarter-turn commutators.
    search:
    for (const [As, Bs] of [[A2, B2], [A3, B1]]) {
      for (const A of As) {
        const Ai = inverse(A.perm);
        for (const B of Bs) {
          const perm = then(then(then(A.perm, B.perm), Ai), B.inv);
          const moved = movedCount(perm);
          if (moved < 2 || moved > FINE_MOVED || !keepsFrame(perm)) continue;
          const len = 2 * (A.ops.length + B.ops.length);
          const key = perm.join(",");
          const prev = found.get(key);
          if (prev && prev.len <= len) continue;
          const back = (ops) => [...ops].reverse().map((i) => ({ ...singles[i], dir: -singles[i].dir }));
          found.set(key, { len, perm, moves: [...copyMoves(A.ops), ...copyMoves(B.ops), ...back(A.ops), ...back(B.ops)] });
          if (found.size >= FINE_CAP * 8) break search; // far more than the cap needs
        }
      }
    }
    return [...found.values()].sort((a, b) => a.len - b.len).slice(0, FINE_CAP).map((o) => ({ moves: o.moves, perm: o.perm }));
  }

  const minDisturb = coarse.length ? Math.min(...coarse.map((o) => o.ch)) : Infinity;
  if (coarse.length && minDisturb > FINE_TRIGGER) lib.push(...fineOps());

  const setup = { posOf, targetFace, index, lib, frameIdx };
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

// On an odd cube the six face centers form a rigid frame: no center operator can
// move them (that needs a middle-slice turn, which disturbs 12 centers), yet a
// middle slice in the SCRAMBLE can rotate the frame off the canonical color
// scheme. Left alone, the beam then stalls several centers short — permanently,
// since a face center stuck on the wrong face also strands pieces of its color.
// So we put the frame back first: breadth-first over the three middle slices,
// which generate all 24 frame orientations, giving the shortest fix (<= 3 turns).
// A no-op on even cubes, which have no middle slice and no frame.
function normalizeFrame(state, push, size) {
  if (size % 2 === 0) return true;
  const off = (size - 1) / 2;
  const isFrame = (c) => c.stickers.length === 1 && c.pos.filter((v) => v === 0).length === 2;
  const copy = (st) => st.map((c) => ({ pos: [...c.pos], stickers: [{ dir: [...c.stickers[0].dir], color: c.stickers[0].color }] }));
  const key = (st) => st.map((c) => `${c.pos.join(",")}:${faceOfColor(c.stickers[0].color)}`).sort().join("|");
  // Home when every face center sits on the face matching its own color.
  const home = (st) => st.every((c) => faceOfDir(c.pos.map((v) => v / off)) === faceOfColor(c.stickers[0].color));

  const start = copy(state.filter(isFrame));
  if (home(start)) return true;
  const slices = [];
  for (const axis of ["x", "y", "z"]) for (const dir of [1, -1]) slices.push({ axis, layer: 0, dir });

  const seen = new Set([key(start)]);
  let level = [{ st: start, path: [] }];
  for (let depth = 0; depth < 6 && level.length; depth++) {
    const next = [];
    for (const node of level) {
      for (const m of slices) {
        const st = copy(node.st);
        applyTurn(st, m.axis, m.layer, m.dir);
        const k = key(st);
        if (seen.has(k)) continue;
        seen.add(k);
        const path = [...node.path, m];
        if (home(st)) { for (const mv of path) { applyTurn(state, mv.axis, mv.layer, mv.dir); push(mv); } return true; }
        next.push({ st, path });
      }
    }
    level = next;
  }
  return false;
}

// Solve all centers. Squares up the face-center frame (odd cubes), then finds a
// short op sequence (beam search, with the local search as a safety net), applies
// those ops to `state` and pushes the engine moves. Returns true on success.
export function solveCenters(state, push, size) {
  const s = centerSetup(size);
  if (!s.lib.length) return false; // no usable operators for this size — decline
  if (!normalizeFrame(state, push, size)) return false;
  const vec = readCenters(state, s);
  const total = vec.length;

  const ops = beamCenters(vec, s, total, 150, 60) || ilsCenters(vec, s, total);
  if (!ops) return false;

  for (const i of ops) for (const m of s.lib[i].moves) { applyTurn(state, m.axis, m.layer, m.dir); push(m); }
  return homeCount(readCenters(state, s), s.targetFace) >= total;
}
