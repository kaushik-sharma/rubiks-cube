// ---------------------------------------------------------------------------
// NxN reduction — edge PAIRING (no p5 dependency)
//
// Reduction only needs the two wings of each edge MERGED into a dedge (matching
// colors, side by side); their final placement is left to the 3×3 solver. That
// is a far easier goal than fully placing wings: it is reachable by the
// even-permutation commutator library alone (no parity wall — parity surfaces
// later, at the 3×3 stage, where fixed algorithms handle it).
//
// Speed comes from a precomputed permutation model, exactly like centers.js:
// each library op's effect is baked into a permutation over the 48 wing FACELET
// slots (position + outward face), so scoring a candidate is an O(48) vector
// permute + compare — no cloning, no re-simulating turns. The chosen op is then
// applied once to the real state (and pushed). An iterated local search on the
// "paired dedge count" objective converges in a few dozen moves.
// ---------------------------------------------------------------------------

import { applyTurn } from "../cube-model.js";
import { parseAlg } from "./moves.js";
import { faceOfColor, faceOfDir, solvedCube } from "./model.js";

const FID = { U: 0, D: 1, R: 2, L: 3, F: 4, B: 5 };
const colorId = (color) => FID[faceOfColor(color)];

const clone = (s) => s.map((c) => ({ pos: [...c.pos], stickers: c.stickers.map((x) => ({ dir: [...x.dir], color: x.color })) }));
const run = (s, ms) => { for (const m of ms) applyTurn(s, m.axis, m.layer, m.dir); };
const wingSig = (c) => c.stickers.map((s) => `${faceOfDir(s.dir)}:${s.color.join(",")}`).sort().join("|");

const TOK = [];
for (const b of ["R", "L", "U", "D", "F", "B", "Rw", "Lw", "Uw", "Dw", "Fw", "Bw", "2R", "2L", "2U", "2D", "2F", "2B"]) for (const s of ["", "'"]) TOK.push(b + s);
const invt = (t) => (t.endsWith("2") ? t : t.endsWith("'") ? t.slice(0, -1) : t + "'");
const invseq = (a) => a.split(" ").reverse().map(invt).join(" ");

// Per-size setup: the 48-slot model, a library of {moves, perm} wing 3-cycles
// (centre/corner preserving), and the 12 edges as slot-index groups for scoring.
const setupCache = new Map();
function edgeSetup(size) {
  if (setupCache.has(size)) return setupCache.get(size);
  const solved = solvedCube(size);
  const wings = solved.filter((c) => c.stickers.length === 2);
  const solvedSig = new Map(wings.map((c) => [c.pos.join(","), wingSig(c)]));

  // slot index: (wing position, outward face) -> 0..NSLOT-1
  const slotIdx = new Map();
  let k = 0;
  for (const c of wings) for (const s of c.stickers) slotIdx.set(c.pos.join(",") + "|" + faceOfDir(s.dir), k++);
  const NSLOT = slotIdx.size;

  // 12 physical edges, each as its two wings' [faceA-slot, faceB-slot] pairs.
  const edgeMap = new Map();
  for (const c of wings) {
    const faces = c.stickers.map((s) => faceOfDir(s.dir)).sort();
    const id = faces.join("");
    const entry = [slotIdx.get(c.pos.join(",") + "|" + faces[0]), slotIdx.get(c.pos.join(",") + "|" + faces[1])];
    if (!edgeMap.has(id)) edgeMap.set(id, []);
    edgeMap.get(id).push(entry);
  }
  const edges = [...edgeMap.values()];

  const centersUniform = (st) => { for (const c of st) if (c.stickers.length === 1 && faceOfColor(c.stickers[0].color) !== faceOfDir(c.stickers[0].dir)) return false; return true; };
  const cornerKey = (st) => st.filter((c) => c.stickers.length === 3).map((c) => `${c.pos.join(",")}:${c.stickers.map((s) => s.dir.join("")).join("|")}`).sort().join(";");
  const solvedCorners = cornerKey(solved);

  // Wing 3-cycle commutators [A,B] preserving centers and corners (as edges.js
  // originally derived them), now paired with their slot permutation.
  const As = [];
  for (const X of TOK) for (const Y of TOK) if (X !== invt(Y)) As.push(`${X} ${Y} ${invt(X)}`);
  const Bs = [];
  for (const Z of TOK) Bs.push(Z);
  for (const Z of TOK) for (const W of TOK) if (Z !== invt(W)) Bs.push(`${Z} ${W}`);

  const lib = [];
  const seen = new Set();
  for (const A of As) {
    const Ai = invseq(A);
    for (const B of Bs) {
      const moves = parseAlg(`${A} ${B} ${Ai} ${invseq(B)}`, size);
      const st = clone(solved);
      run(st, moves);
      if (!centersUniform(st) || cornerKey(st) !== solvedCorners) continue;
      let moved = 0;
      for (const c of st) if (c.stickers.length === 2 && wingSig(c) !== solvedSig.get(c.pos.join(","))) moved++;
      if (moved === 0 || moved > 3) continue;
      const key = st.filter((c) => c.stickers.length === 2).map((c) => `${c.pos.join(",")}:${wingSig(c)}`).sort().join(";");
      if (seen.has(key)) continue;
      seen.add(key);
      // slot permutation: perm[newSlot] = slot the facelet came from.
      const tagged = clone(solved);
      for (const c of tagged) for (const s of c.stickers) s._sid = slotIdx.get(c.pos.join(",") + "|" + faceOfDir(s.dir));
      run(tagged, moves);
      const perm = new Array(NSLOT);
      for (const c of tagged) if (c.stickers.length === 2) for (const s of c.stickers) perm[slotIdx.get(c.pos.join(",") + "|" + faceOfDir(s.dir))] = s._sid;
      lib.push({ moves, perm });
      if (lib.length >= 240) break;
    }
    if (lib.length >= 240) break;
  }

  const setup = { slotIdx, NSLOT, edges, lib };
  setupCache.set(size, setup);
  return setup;
}

function readVec(state, s) {
  const v = new Array(s.NSLOT);
  for (const c of state) if (c.stickers.length === 2) for (const st of c.stickers) v[s.slotIdx.get(c.pos.join(",") + "|" + faceOfDir(st.dir))] = colorId(st.color);
  return v;
}
const applyPerm = (v, p, n) => { const o = new Array(n); for (let j = 0; j < n; j++) o[j] = v[p[j]]; return o; };
function pairedCount(v, edges) {
  let n = 0;
  for (const [[a1, b1], [a2, b2]] of edges) if (v[a1] === v[a2] && v[b1] === v[b2]) n++;
  return n;
}

// Beam search for a SHORT pairing sequence on the slot vector. Explores the
// lib-op tree keeping the `width` best partial states each ply (ranked by pairs
// then move cost), and returns the op-index list of the first sequence that
// reaches full pairing — typically ~7 ops / ~56 engine moves, vs ~19 ops for a
// plain local search. Returns null if it doesn't converge within `plies`.
function beamPair(vec0, s, total, width, plies) {
  const start = { vec: vec0, moves: 0, cur: pairedCount(vec0, s.edges), parent: null, op: -1 };
  if (start.cur >= total) return [];
  let frontier = [start];
  const path = (node) => { const ops = []; for (let n = node; n && n.op >= 0; n = n.parent) ops.push(n.op); return ops.reverse(); };
  for (let ply = 0; ply < plies; ply++) {
    const next = [];
    for (const node of frontier) {
      for (let i = 0; i < s.lib.length; i++) {
        const vec = applyPerm(node.vec, s.lib[i].perm, s.NSLOT);
        const cur = pairedCount(vec, s.edges);
        const child = { vec, moves: node.moves + s.lib[i].moves.length, cur, parent: node, op: i };
        if (cur >= total) return path(child);
        next.push(child);
      }
    }
    next.sort((a, b) => b.cur - a.cur || a.moves - b.moves);
    const seen = new Set();
    frontier = [];
    for (const n of next) {
      const k = n.vec.join(",");
      if (seen.has(k)) continue;
      seen.add(k);
      frontier.push(n);
      if (frontier.length >= width) break;
    }
    if (!frontier.length) break;
  }
  return null;
}

// Reliable fallback: iterated local search on the slot vector, returning the
// op-index list of the best sequence found (or null). Used only if the beam
// fails to converge (rare), so correctness never depends on the beam.
function ilsPair(vec0, s, total) {
  let vec = vec0.slice(), cur = pairedCount(vec, s.edges);
  const sol = [];
  const applyOp = (i) => { vec = applyPerm(vec, s.lib[i].perm, s.NSLOT); sol.push(i); cur = pairedCount(vec, s.edges); };
  let best = { vec: vec.slice(), cur, len: 0 };
  const snapshot = () => { best = { vec: vec.slice(), cur, len: sol.length }; };
  const restore = () => { vec = best.vec.slice(); cur = best.cur; sol.length = best.len; };
  const hillclimb = () => { for (;;) { let bi = -1, bd = 0; for (let i = 0; i < s.lib.length; i++) { const d = pairedCount(applyPerm(vec, s.lib[i].perm, s.NSLOT), s.edges) - cur; if (d > bd) { bd = d; bi = i; } } if (bi < 0) return; applyOp(bi); } };
  hillclimb();
  if (cur > best.cur) snapshot();
  let guard = 0, sinceImprove = 0;
  while (cur < total && guard++ < 4000) {
    restore();
    const kick = 2 + Math.min(8, (sinceImprove / 6) | 0);
    for (let i = 0; i < kick; i++) applyOp((Math.random() * s.lib.length) | 0);
    hillclimb();
    if (cur > best.cur) { snapshot(); sinceImprove = 0; } else sinceImprove++;
  }
  restore();
  return cur >= total ? sol : null;
}

// Pair every edge into a dedge. Finds a short op sequence (beam search, with the
// local search as a safety net), then applies those ops to `state` and pushes
// the engine moves. Returns { paired: boolean, count }. Does not disturb centers.
export function pairEdges(state, push, size) {
  const s = edgeSetup(size);
  const total = s.edges.length; // 12 for 4×4
  const vec = readVec(state, s);

  const ops = beamPair(vec, s, total, 120, 30) || ilsPair(vec, s, total);
  if (!ops) return { paired: false, count: pairedCount(vec, s.edges) };

  for (const i of ops) for (const m of s.lib[i].moves) { applyTurn(state, m.axis, m.layer, m.dir); push(m); }
  return { paired: pairedCount(readVec(state, s), s.edges) >= total, count: total };
}
