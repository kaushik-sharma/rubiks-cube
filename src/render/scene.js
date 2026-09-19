// ---------------------------------------------------------------------------
// Scene rendering
// Builds the reusable geometries and draws the cube each frame.
// ---------------------------------------------------------------------------

import { P } from "../p5app.js";
import {
  AXES,
  BODY,
  BODY_DETAIL,
  BODY_RADIUS,
  CUBIE,
  SPACING,
  STICKER,
  STICKER_RADIUS,
} from "../config.js";
import { cube } from "../cube/model.js";
import { engine } from "../cube/moves.js";
import { makeRoundedBox, makeRoundedRect } from "./geometry.js";

const HALF_PI = Math.PI / 2;

let bodyGeo; // reusable rounded-box geometry, instanced per cubie
let stickerGeo; // reusable rounded-rect geometry, instanced per sticker

// Build the geometries shared by every cubie. Called once from setup().
export function buildGeometries() {
  bodyGeo = makeRoundedBox(CUBIE, BODY_RADIUS, BODY_DETAIL);
  stickerGeo = makeRoundedRect(STICKER, STICKER, STICKER_RADIUS, 6);
}

const REF_SIZE = 3; // the size at which the cube renders at 1:1 scale

// Draw every cubie. The cubies in the actively-turning layer get an extra
// rotation about the cube center so the slice animates as a rigid group. The
// whole cube is scaled by REF_SIZE/size so 4×4 and 5×5 stay the same on-screen
// footprint (cubies just get smaller) instead of overflowing the viewport.
export function drawCube() {
  P.noStroke();
  P.push();
  P.scale(REF_SIZE / cube.size);
  const m = engine.current;
  const axisIdx = m ? AXES[m.axis] : -1;
  for (const c of cube.cubies) {
    P.push();
    if (m && c.pos[axisIdx] === m.layer) {
      axisRotate(m.axis, m.angle);
    }
    P.translate(c.pos[0] * SPACING, c.pos[1] * SPACING, c.pos[2] * SPACING);
    drawCubie(c);
    P.pop();
  }
  P.pop();
}

// Draw one cubie: a dark rounded body plus its colored stickers.
function drawCubie(c) {
  P.fill(BODY[0], BODY[1], BODY[2]);
  P.model(bodyGeo);
  for (const s of c.stickers) {
    const [axis, sign] = dirToAxisSign(s.dir);
    sticker(axis, sign, s.color);
  }
}

function axisRotate(axis, angle) {
  if (axis === "x") P.rotateX(angle);
  else if (axis === "y") P.rotateY(angle);
  else P.rotateZ(angle);
}

// Map an axis-aligned unit direction to a face descriptor for sticker().
function dirToAxisSign(d) {
  if (d[0] !== 0) return ["x", d[0]];
  if (d[1] !== 0) return ["y", d[1]];
  return ["z", d[2]];
}

// Draw a single colored sticker just outside the given cubie face.
// `axis` is "x" | "y" | "z" and `sign` (+1/-1) is which side of that axis.
function sticker(axis, sign, col) {
  P.push();
  const d = CUBIE / 2 + 0.6; // nudge the sticker out past the body surface

  if (axis === "x") {
    P.translate(sign * d, 0, 0);
    P.rotateY(HALF_PI * sign);
  } else if (axis === "y") {
    P.translate(0, sign * d, 0);
    P.rotateX(-HALF_PI * sign);
  } else {
    P.translate(0, 0, sign * d);
    if (sign === -1) P.rotateY(Math.PI);
  }

  P.fill(col[0], col[1], col[2]);
  P.model(stickerGeo);
  P.pop();
}
