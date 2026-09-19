// ---------------------------------------------------------------------------
// Configuration & constants
// Shared tuning values, the color scheme, and the move-notation table.
// ---------------------------------------------------------------------------

// Geometry
export const CUBIE = 80; // edge length of a single small cube
export const GAP = 1; // space between adjacent cubies
export const SPACING = CUBIE + GAP; // distance between cubie centers

export const BODY_RADIUS = 5; // corner/edge rounding of the cubie body
export const BODY_DETAIL = 14; // subdivision per face (higher = smoother)
export const BODY = [20, 22, 28]; // plastic body color (dark)

// Sticker fits inside the cubie's flat face region (face minus the rounding).
// The factor controls the dark border thickness (closer to 1 = thinner border).
export const STICKER = (CUBIE - 2 * BODY_RADIUS) * 0.98;
export const STICKER_RADIUS = 6; // corner rounding of the colored sticker

// Standard Rubik's color scheme.
// Note: in p5 WEBGL, +y points DOWN, so the "up" face sits on -y.
export const COLORS = {
  right: [183, 18, 52], // red
  left: [255, 88, 0], // orange
  up: [245, 245, 245], // white
  down: [255, 213, 0], // yellow
  front: [0, 155, 72], // green
  back: [0, 70, 173], // blue
};

// Supported cube dimensions. The solver currently handles 3×3 only; 4×4/5×5 are
// fully renderable, turnable, and scrambleable.
export const CUBE_SIZES = [3, 4, 5];

// Turn / move model
export const AXES = { x: 0, y: 1, z: 2 }; // axis name -> index into [x,y,z]
export const TURN_STEP = 0.2; // radians advanced per frame during a turn
export const SCRAMBLE_MOVES = 40; // number of random turns per scramble

// Face notation -> which slice turns and in which direction.
// `end` selects the slice along `axis`: +1 = outer positive face, -1 = outer
// negative face, 0 = middle slice. The actual layer coordinate is end * the
// outer-layer coordinate, computed from the current cube size (so R always turns
// the rightmost layer whatever N is). `dir` (+1/-1) is a quarter turn; Shift
// inverts it for prime (counter-clockwise) moves.
export const NOTATION = {
  r: { axis: "x", end: 1, dir: 1 },
  l: { axis: "x", end: -1, dir: -1 },
  u: { axis: "y", end: -1, dir: 1 },
  d: { axis: "y", end: 1, dir: -1 },
  f: { axis: "z", end: 1, dir: 1 },
  b: { axis: "z", end: -1, dir: -1 },
  // Middle slices (layer 0, odd cubes only). Each follows an adjacent face:
  m: { axis: "x", end: 0, dir: -1 }, // follows L
  e: { axis: "y", end: 0, dir: -1 }, // follows D
  s: { axis: "z", end: 0, dir: 1 }, // follows F
};
