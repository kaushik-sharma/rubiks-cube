// ---------------------------------------------------------------------------
// NxN reduction — edge PAIRING (no p5 dependency)
//
// Reduction only needs each edge's pieces MERGED so the whole edge shows one
// color pair; their final placement is left to the 3×3 solver. On a 4×4 that
// means the two wings of an edge matching each other. On a 5×5 it means both
// wings matching the MIDGE between them (a "tredge"), which is strictly harder:
// a midge pins the orientation, where two interchangeable wings do not.
//
// Everything runs in PERMUTATION space (as in centers.js): each single quarter
// turn is reduced once to a permutation of the edge / center / corner sticker
// slots, and the search composes integer arrays instead of re-simulating cubies.
// The library is built from commutators A B A' B' that keep every corner fixed
// and only ever permute centers WITHIN a face (centers are already solved when
// pairing runs, so such an op leaves them solved), while disturbing at most
// 3 edge pieces. A beam search on the "solid edges" objective composes them.
//
// ODD cubes need one thing more. Every commutator is an EVEN permutation, so no
// library op can swap the two wings of a tredge — and that is exactly the
// residual pairing gets stuck on (without it the beam stalls at 10-11/12
// forever, whatever the beam width or library size). The fix is the known parity
// algorithms: they are not commutators, so they can be odd. OLL swaps one
// tredge's two wings; PLL exchanges the wing pairs of two tredges. Both are
// added along with outer-turn conjugates, which apply the same fix at any edge
// location. Even cubes reach 12/12 without them and skip them.
// ---------------------------------------------------------------------------

import { applyTurn } from "../cube-model.js";
import { parseAlg } from "./moves.js";
import { faceOfColor, faceOfDir, solvedCube } from "./model.js";

const FID = { U: 0, D: 1, R: 2, L: 3, F: 4, B: 5 };
const colorId = (color) => FID[faceOfColor(color)];

// The commutator enumeration yields ~770 distinct ops on 4×4 and ~1270 on 5×5;
// keeping them all costs little at build time and gives the beam its coverage.
const LIB_CAP = 1500;
const BEAM_WIDTH = 120;
const BEAM_PLIES = 40;
// A stalled beam is retried from a small random kick rather than ground out by a
// local search — with a library this size a hill-climb step is far too slow.
const RETRIES = 4;

// Parity algorithms in inner-slice (`2R`/`2L`) notation, which is what moves.js
// expects and which lands on the wing slice for both 4×4 and 5×5. Verified on
// both sizes to leave every center and corner untouched.
const OLL_PARITY = "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2";
const PLL_PARITY = "2R2 U2 F2 2R2 F2 U2 2R2";

// Per-size setup: the edge slot model, the edge locations to be made solid, and
// the operator library as {moves, perm} with perm[j] = the slot whose sticker
// ends up at slot j.
const setupCache = new Map();
function edgeSetup(size) {
  if (setupCache.has(size)) return setupCache.get(size);
  const solved = solvedCube(size);

  // One slot per sticker, for each piece class we have to track.
  const slotModel = (pred) => {
    const list = solved.filter(pred);
    const idx = new Map();
    let n = 0;
    for (const c of list) for (const s of c.stickers) idx.set(c.pos.join(",") + "|" + faceOfDir(s.dir), n++);
    return { list, idx, N: n };
  };
  const E = slotModel((c) => c.stickers.length === 2); // wings, plus midges on odd cubes
  const C = slotModel((c) => c.stickers.length === 1);
  const K = slotModel((c) => c.stickers.length === 3);

  // The face each center slot shows when solved. Requiring an operator to keep
  // every center slot's face is what makes it safe to run after centers.
  const centerFace = new Array(C.N);
  for (const c of C.list) for (const s of c.stickers) centerFace[C.idx.get(c.pos.join(",") + "|" + faceOfDir(s.dir))] = faceOfColor(s.color);

  // The 12 edge LOCATIONS, each listing its pieces as [slotA, slotB] with the
  // location's two faces in sorted order — 2 pieces per location on a 4×4, 3 on
  // a 5×5. An edge is solid when all its pieces show the same pair.
  const groupMap = new Map();
  for (const c of E.list) {
    const faces = c.stickers.map((s) => faceOfDir(s.dir)).sort();
    const id = faces.join("");
    if (!groupMap.has(id)) groupMap.set(id, []);
    groupMap.get(id).push([E.idx.get(c.pos.join(",") + "|" + faces[0]), E.idx.get(c.pos.join(",") + "|" + faces[1])]);
  }
  const groups = [...groupMap.values()];

  // Every single-layer quarter turn, reduced to a permutation per slot model.
  const off = (size - 1) / 2;
  const singles = [];
  for (const axis of ["x", "y", "z"]) for (let i = 0; i < size; i++) for (const dir of [1, -1]) singles.push({ axis, layer: i - off, dir });
  const layerKey = (m) => m.axis + m.layer;
  const permOfSeq = (model, moves) => {
    const st = model.list.map((c) => ({ pos: [...c.pos], stickers: c.stickers.map((s) => ({ dir: [...s.dir], color: s.color })) }));
    const src = [];
    for (const c of st) for (const s of c.stickers) src.push(model.idx.get(c.pos.join(",") + "|" + faceOfDir(s.dir)));
    for (const m of moves) applyTurn(st, m.axis, m.layer, m.dir);
    const p = new Int32Array(model.N);
    let t = 0;
    for (const c of st) for (const s of c.stickers) p[model.idx.get(c.pos.join(",") + "|" + faceOfDir(s.dir))] = src[t++];
    return p;
  };
  const eP = singles.map((m) => permOfSeq(E, [m]));
  const cP = singles.map((m) => permOfSeq(C, [m]));
  const kP = singles.map((m) => permOfSeq(K, [m]));
  const compose = (a, b, n) => { const o = new Int32Array(n); for (let j = 0; j < n; j++) o[j] = a[b[j]]; return o; }; // apply a, then b
  const inverse = (p, n) => { const o = new Int32Array(n); for (let j = 0; j < n; j++) o[p[j]] = j; return o; };
  const ident = (n) => { const o = new Int32Array(n); for (let j = 0; j < n; j++) o[j] = j; return o; };
  const centersKept = (p) => { for (let j = 0; j < C.N; j++) if (centerFace[p[j]] !== centerFace[j]) return false; return true; };
  const cornersKept = (p) => { for (let j = 0; j < K.N; j++) if (p[j] !== j) return false; return true; };
  const edgeSlotsMoved = (p) => { let n = 0; for (let j = 0; j < E.N; j++) if (p[j] !== j) n++; return n; };

  // Commutator halves, each carrying its permutation in all three models.
  const half = (ops) => ({
    ops,
    e: ops.reduce((a, i) => compose(a, eP[i], E.N), ident(E.N)),
    c: ops.reduce((a, i) => compose(a, cP[i], C.N), ident(C.N)),
    k: ops.reduce((a, i) => compose(a, kP[i], K.N), ident(K.N)),
  });
  const A2 = [], A3 = [], B1 = [], B2 = [];
  for (let i = 0; i < singles.length; i++) B1.push(half([i]));
  for (let i = 0; i < singles.length; i++) {
    for (let j = 0; j < singles.length; j++) {
      if (layerKey(singles[j]) === layerKey(singles[i])) continue;
      const h = half([i, j]);
      A2.push(h); B2.push(h);
      for (let k = 0; k < singles.length; k++) {
        if (layerKey(singles[k]) === layerKey(singles[j])) continue;
        A3.push(half([i, j, k]));
      }
    }
  }
  for (const b of B1) { b.ci = inverse(b.c, C.N); b.ki = inverse(b.k, K.N); b.ei = inverse(b.e, E.N); }
  for (const b of B2) { b.ci = inverse(b.c, C.N); b.ki = inverse(b.k, K.N); b.ei = inverse(b.e, E.N); }

  // Enumerate [A,B] = A B A' B'. The center test runs first because it rejects
  // more than 90% of candidates, and the edge permutation is only built for the
  // few that survive.
  const found = new Map();
  for (const [As, Bs] of [[A2, B1], [A2, B2], [A3, B1]]) {
    for (const A of As) {
      const aci = inverse(A.c, C.N), aki = inverse(A.k, K.N), aei = inverse(A.e, E.N);
      for (const B of Bs) {
        if (!centersKept(compose(compose(compose(A.c, B.c, C.N), aci, C.N), B.ci, C.N))) continue;
        if (!cornersKept(compose(compose(compose(A.k, B.k, K.N), aki, K.N), B.ki, K.N))) continue;
        const perm = compose(compose(compose(A.e, B.e, E.N), aei, E.N), B.ei, E.N);
        const slots = edgeSlotsMoved(perm);
        if (slots < 2 || slots > 6) continue; // at most a 3-cycle of edge pieces
        const len = 2 * (A.ops.length + B.ops.length);
        const key = perm.join(",");
        const prev = found.get(key);
        if (prev && prev.len <= len) continue;
        const back = (ops) => [...ops].reverse().map((i) => ({ ...singles[i], dir: -singles[i].dir }));
        const fwd = (ops) => ops.map((i) => ({ ...singles[i] }));
        found.set(key, { len, perm, moves: [...fwd(A.ops), ...fwd(B.ops), ...back(A.ops), ...back(B.ops)] });
      }
    }
  }
  const lib = [...found.values()].sort((a, b) => a.len - b.len).slice(0, LIB_CAP).map((o) => ({ moves: o.moves, perm: o.perm }));

  // Odd cubes: add the (non-commutator, so possibly ODD) parity algorithms, plus
  // the shortest outer-turn conjugate reaching each distinct variant, so the fix
  // is available at every edge location. Outer turns map whole edges around and
  // keep centers uniform by themselves, so conjugating by them is always safe.
  if (size % 2 === 1) {
    const outer = [];
    for (const axis of ["x", "y", "z"]) for (const layer of [-off, off]) for (const dir of [1, -1]) outer.push({ axis, layer, dir });
    for (const alg of [OLL_PARITY, PLL_PARITY]) {
      const moves = parseAlg(alg, size);
      const perm = permOfSeq(E, moves);
      lib.push({ moves, perm });
      const seen = new Set([perm.join(",")]);
      let level = [[]];
      for (let depth = 0; depth < 3; depth++) {
        const next = [];
        for (const S of level) {
          for (const m of outer) {
            const T = [...S, m];
            const pS = permOfSeq(E, T);
            const conj = compose(compose(pS, perm, E.N), inverse(pS, E.N), E.N);
            const key = conj.join(",");
            if (seen.has(key)) continue;
            seen.add(key);
            const back = [...T].reverse().map((x) => ({ ...x, dir: -x.dir }));
            lib.push({ moves: [...T, ...moves, ...back], perm: conj });
            next.push(T);
          }
        }
        level = next;
      }
    }
  }

  const setup = { E, groups, lib };
  setupCache.set(size, setup);
  return setup;
}

// Read the color showing at each edge sticker slot.
function readVec(state, s) {
  const v = new Array(s.E.N);
  for (const c of state) {
    if (c.stickers.length !== 2) continue;
    for (const st of c.stickers) v[s.E.idx.get(c.pos.join(",") + "|" + faceOfDir(st.dir))] = colorId(st.color);
  }
  return v;
}
const applyPerm = (v, p, n) => { const o = new Array(n); for (let j = 0; j < n; j++) o[j] = v[p[j]]; return o; };

// How many edge locations are solid: every piece there showing the same pair.
function solidCount(v, groups) {
  let n = 0;
  outer: for (const g of groups) {
    const a0 = v[g[0][0]], b0 = v[g[0][1]];
    for (let i = 1; i < g.length; i++) if (v[g[i][0]] !== a0 || v[g[i][1]] !== b0) continue outer;
    n++;
  }
  return n;
}

// Beam search for a SHORT pairing sequence on the slot vector: keep the `width`
// best partial states each ply (ranked by solid edges, then move cost) and
// return the op-index list of the first sequence that makes every edge solid.
// Returns null if it doesn't converge within `plies`.
function beamPair(vec0, s, total, width, plies) {
  const start = { vec: vec0, moves: 0, cur: solidCount(vec0, s.groups), parent: null, op: -1 };
  if (start.cur >= total) return [];
  const path = (node) => { const ops = []; for (let n = node; n && n.op >= 0; n = n.parent) ops.push(n.op); return ops.reverse(); };
  let frontier = [start];
  for (let ply = 0; ply < plies; ply++) {
    const next = [];
    for (const node of frontier) {
      for (let i = 0; i < s.lib.length; i++) {
        const vec = applyPerm(node.vec, s.lib[i].perm, s.E.N);
        const cur = solidCount(vec, s.groups);
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

// Pair every edge. Finds a short op sequence (beam search, retried from a small
// random kick if it stalls), then applies those ops to `state` and pushes the
// engine moves. Returns { paired, count }. Leaves centers and corners untouched.
export function pairEdges(state, push, size) {
  const s = edgeSetup(size);
  const total = s.groups.length; // 12 on every size
  const vec = readVec(state, s);
  if (!s.lib.length) return { paired: false, count: solidCount(vec, s.groups) };

  let ops = beamPair(vec, s, total, BEAM_WIDTH, BEAM_PLIES);
  for (let attempt = 0; !ops && attempt < RETRIES; attempt++) {
    const prefix = [];
    let kicked = vec;
    for (let i = 0, kick = 1 + (attempt % 3); i < kick; i++) {
      const j = (Math.random() * s.lib.length) | 0;
      prefix.push(j);
      kicked = applyPerm(kicked, s.lib[j].perm, s.E.N);
    }
    const rest = beamPair(kicked, s, total, BEAM_WIDTH, BEAM_PLIES);
    if (rest) ops = [...prefix, ...rest];
  }
  if (!ops) return { paired: false, count: solidCount(vec, s.groups) };

  for (const i of ops) for (const m of s.lib[i].moves) { applyTurn(state, m.axis, m.layer, m.dir); push(m); }
  return { paired: solidCount(readVec(state, s), s.groups) >= total, count: total };
}
