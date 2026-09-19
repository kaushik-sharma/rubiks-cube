// ---------------------------------------------------------------------------
// Move engine (no p5 dependency)
// Queues moves, animates the active turn frame by frame, and commits the
// finished turn into the model. Driven once per frame by updateMoves().
// ---------------------------------------------------------------------------

import { AXES, TURN_STEP } from "../config.js";
import { cube, applyQuarterTurn } from "./model.js";
import { computeSolution } from "../solver/solve.js";
import { FACE_TURN } from "../solver/cube-model.js";

const QUARTER_TURN = Math.PI / 2;

// Maps an (axis, sign-of-layer) to the face on that side + the direction that
// counts as a plain (unprimed) turn, for displaying solutions.
const REV = {};
for (const [face, t] of Object.entries(FACE_TURN)) {
  REV[`${t.axis}:${Math.sign(t.layer)}`] = { face, dir: t.dir };
}

// Convert an engine (single-layer) move to cube notation. Depth counts inward
// from the near face: depth 1 is the outer face ("R"), deeper inner slices get a
// numeric prefix ("2R"), matching the solver's move parser. e.g. {x,1.5,1}->"R",
// {x,0.5,1}->"2R" on a 4×4; {x,1,1}->"R" on a 3×3.
export function notation(m) {
  const r = REV[`${m.axis}:${Math.sign(m.layer)}`];
  if (!r) return "?";
  const off = (cube.size - 1) / 2;
  const depth = Math.round(off - Math.abs(m.layer) + 1);
  const prefix = depth > 1 ? String(depth) : "";
  return prefix + r.face + (m.dir === r.dir ? "" : "'");
}

// Shared, mutable move-engine state. Mutated in place (never reassigned) so it
// can be imported and updated from other modules.
export const engine = {
  queue: [], // pending moves waiting to animate
  current: null, // the move being animated right now
  log: [], // recorded moves, replayed in reverse to solve
  solveRequested: false, // solve once all pending moves finish
  thinking: false, // computing a solution (shown for one frame before the work)
  plan: null, // solution as notation tokens, for the solver display
  planDone: 0, // how many plan moves have finished animating
};

// Drive the animation each frame: finalize a completed move, pull the next one
// from the queue, and advance the current turn.
export function updateMoves() {
  if (engine.current && engine.current.done) {
    finalizeMove();
  }

  // Once everything pending has resolved, fulfill a queued solve request. Show
  // the "computing" state for one frame first, so the display can paint it
  // before the (possibly table-building) solve runs.
  if (engine.solveRequested && !engine.current && engine.queue.length === 0) {
    if (!engine.thinking) {
      engine.thinking = true;
    } else {
      enqueueSolve();
      engine.solveRequested = false;
      engine.thinking = false;
    }
  }

  if (!engine.current && engine.queue.length > 0) {
    startMove(engine.queue.shift());
  }

  if (engine.current) {
    engine.current.angle += engine.current.step;
    if (Math.abs(engine.current.angle) >= QUARTER_TURN) {
      engine.current.angle = engine.current.dir * QUARTER_TURN; // land on 90°
      engine.current.done = true; // commit next frame (no visual snap)
    }
  }
}

function startMove(m) {
  engine.current = {
    axis: m.axis,
    layer: m.layer,
    dir: m.dir,
    record: m.record !== false,
    angle: 0,
    step: m.dir * TURN_STEP,
    done: false,
  };
}

// Commit the finished turn into the model: rotate the position and every
// sticker direction of each cubie in the affected slice by a quarter turn.
function finalizeMove() {
  const m = engine.current;
  const axisIdx = AXES[m.axis];
  for (const c of cube.cubies) {
    if (c.pos[axisIdx] === m.layer) {
      c.pos = applyQuarterTurn(c.pos, m.axis, m.dir);
      for (const s of c.stickers) {
        s.dir = applyQuarterTurn(s.dir, m.axis, m.dir);
      }
    }
  }
  if (m.record) engine.log.push({ axis: m.axis, layer: m.layer, dir: m.dir });
  else if (engine.plan) engine.planDone += 1; // a solution move just finished
  engine.current = null;
}

// Compute a real algorithmic solution for the current cube and queue it. If the
// solver can't honestly solve the state, nothing is queued (it never fakes).
function enqueueSolve() {
  const solution = computeSolution();
  engine.log.length = 0;
  if (!solution || solution.length === 0) {
    engine.plan = null;
    return;
  }
  engine.plan = solution.map(notation);
  engine.planDone = 0;
  for (const m of solution) {
    engine.queue.push({ axis: m.axis, layer: m.layer, dir: m.dir, record: false });
  }
}
