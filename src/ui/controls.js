// ---------------------------------------------------------------------------
// Input & UI overlay
// Keyboard handling and the on-screen controls hint.
// ---------------------------------------------------------------------------

import { P } from "../p5app.js";
import { NOTATION, CUBE_SIZES } from "../config.js";
import { cube, outerLayer } from "../cube/model.js";
import { engine } from "../cube/moves.js";
import { scramble, requestSolve, resetCube, setCubeSize } from "../cube/actions.js";

// Wired to the p5 instance as p.keyPressed in main.js. Returning false lets
// p5 prevent the browser's default key behavior (e.g. Space scrolling).
export function handleKeyPressed() {
  // Rely only on P.key strings (p5 2.x doesn't expose P.ENTER/P.BACKSPACE/
  // P.SHIFT as instance constants). Shift is detected via the key being
  // uppercase, which is how the browser reports e.g. Shift+R as "R".
  const key = P.key || "";
  const k = key.toLowerCase();

  // Number keys switch cube size (3×3 / 4×4 / 5×5).
  if (/^[0-9]$/.test(key) && CUBE_SIZES.includes(Number(key))) {
    selectSize(Number(key));
    return false;
  }

  if (NOTATION[k]) {
    const base = NOTATION[k];
    const prime = key !== k; // uppercase => Shift held
    const dir = prime ? -base.dir : base.dir;
    // `end` picks a face; the layer coordinate scales with the current cube size
    // so R/L/U/D/F/B always turn the outermost layer (M/E/S the middle, odd N).
    const layer = base.end * outerLayer();
    engine.queue.push({ axis: base.axis, layer, dir });
    engine.plan = null; // a manual turn invalidates the displayed solution
    return false;
  }
  if (key === " ") {
    scramble();
    return false;
  }
  if (key === "Enter") {
    requestSolve();
    return false;
  }
  if (key === "Backspace") {
    resetCube();
    return false;
  }
}

// One fixed top-left column that holds the controls hint and the size selector,
// so they stack vertically and share a single positioning context (no separate
// absolute/fixed layers drifting apart on scroll).
let topLeftColumn = null;

// A lightweight HTML overlay listing the controls (kept out of the WebGL scene
// so we don't need to load a font).
export function buildControlsOverlay() {
  topLeftColumn = P.createDiv("");
  topLeftColumn.style("position", "fixed");
  topLeftColumn.style("top", "12px");
  topLeftColumn.style("left", "12px");
  topLeftColumn.style("display", "flex");
  topLeftColumn.style("flex-direction", "column");
  topLeftColumn.style("align-items", "flex-start"); // don't stretch children to full width
  topLeftColumn.style("gap", "8px");
  topLeftColumn.style("pointer-events", "none"); // interactive children opt back in
  topLeftColumn.style("user-select", "none");

  const help = P.createDiv(
    "Drag: rotate view&nbsp;&nbsp;|&nbsp;&nbsp;" +
      "R L U D F B / M E S: turn (Shift = reverse)&nbsp;&nbsp;|&nbsp;&nbsp;" +
      "Space: scramble&nbsp;&nbsp;|&nbsp;&nbsp;Enter: solve (3×3)&nbsp;&nbsp;|&nbsp;&nbsp;" +
      "Backspace: reset&nbsp;&nbsp;|&nbsp;&nbsp;3 / 4 / 5: cube size"
  );
  help.parent(topLeftColumn);
  help.style("color", "#dfe3ec");
  help.style("font", "13px ui-monospace, Menlo, Consolas, monospace");
  help.style("background", "rgba(0,0,0,0.35)");
  help.style("padding", "6px 10px");
  help.style("border-radius", "6px");
  help.style("white-space", "nowrap");
}

// A button group for switching cube size, added as the second row of the
// top-left column. Kept in sync with the number-key shortcuts via selectSize().
let sizeButtons = [];

export function buildSizeSelector() {
  const wrap = P.createDiv("");
  wrap.parent(topLeftColumn);
  wrap.style("display", "flex");
  wrap.style("gap", "6px");
  wrap.style("pointer-events", "auto");

  sizeButtons = [];
  for (const n of CUBE_SIZES) {
    const btn = P.createButton(`${n}×${n}`);
    btn.parent(wrap);
    btn.style("font", "13px ui-monospace, Menlo, Consolas, monospace");
    btn.style("padding", "6px 12px");
    btn.style("border-radius", "6px");
    btn.style("cursor", "pointer");
    btn.mousePressed(() => selectSize(n));
    sizeButtons.push({ n, btn });
  }
  refreshSizeButtons();
}

// Highlight the button matching the current cube size.
function refreshSizeButtons() {
  for (const { n, btn } of sizeButtons) {
    const active = n === cube.size;
    btn.style("background", active ? "rgba(155,231,160,0.25)" : "rgba(0,0,0,0.4)");
    btn.style("color", active ? "#fff" : "#dfe3ec");
    btn.style("border", active ? "1px solid rgba(155,231,160,0.6)" : "1px solid rgba(255,255,255,0.15)");
  }
}

function selectSize(n) {
  setCubeSize(n);
  refreshSizeButtons();
}

// True when the mouse cursor is inside the canvas bounds.
export function mouseInCanvas() {
  return P.mouseX >= 0 && P.mouseX <= P.width && P.mouseY >= 0 && P.mouseY <= P.height;
}

// ---------------------------------------------------------------------------
// Solver display — a terminal-style panel showing the computed solution in
// cube notation, with a cursor advancing through it as the cube solves.
// ---------------------------------------------------------------------------

let solverDiv = null; // container (flex column)
let headerDiv = null; // fixed header (does not scroll)
let bodyDiv = null; // scrolling move list
let lastPlan = null;
let lastDone = -1;
let lastThinking = false;

const LINE_H = 22; // px per move line, for auto-scroll math

const FACE_NAME = { U: "Up", D: "Down", L: "Left", R: "Right", F: "Front", B: "Back" };

// Turn a notation token ("R", "U'") into a human-readable instruction.
function describe(tok) {
  const face = FACE_NAME[tok[0]] || tok[0];
  const dir = tok.endsWith("'") ? "counter-clockwise" : "clockwise";
  return `Turn ${face} ${dir}`;
}

export function buildSolverPanel() {
  // Container: tall, right-anchored, flex column so the header stays put while
  // only the body scrolls.
  solverDiv = P.createDiv("");
  solverDiv.style("position", "fixed");
  solverDiv.style("top", "12px");
  solverDiv.style("right", "12px");
  solverDiv.style("bottom", "12px");
  solverDiv.style("width", "360px");
  solverDiv.style("box-sizing", "border-box");
  solverDiv.style("display", "none");
  solverDiv.style("flex-direction", "column");
  solverDiv.style("overflow", "hidden");
  solverDiv.style("color", "#9be7a0");
  solverDiv.style("font", "13px ui-monospace, Menlo, Consolas, monospace");
  solverDiv.style("line-height", LINE_H + "px");
  solverDiv.style("background", "rgba(0,0,0,0.5)");
  solverDiv.style("border-radius", "8px");
  solverDiv.style("border", "1px solid rgba(155,231,160,0.25)");
  // Pointer events on so the body can be scrolled; the panel only covers the
  // right edge, so the cube can still be dragged elsewhere.
  solverDiv.style("pointer-events", "auto");
  solverDiv.style("user-select", "none");

  // Sticky header (flex item that never scrolls).
  headerDiv = P.createDiv("");
  headerDiv.style("flex", "0 0 auto");
  headerDiv.style("font-weight", "700");
  headerDiv.style("color", "#fff");
  headerDiv.style("padding", "10px 12px");
  headerDiv.style("border-bottom", "1px solid rgba(155,231,160,0.2)");

  // Scrolling move list (takes the remaining height).
  bodyDiv = P.createDiv("");
  bodyDiv.style("flex", "1 1 auto");
  bodyDiv.style("min-height", "0"); // required so a flex child can scroll
  bodyDiv.style("overflow-y", "auto");
  bodyDiv.style("padding", "8px 12px 12px");

  solverDiv.child(headerDiv);
  solverDiv.child(bodyDiv);
}

// Render the solver panel each frame. Cheap: only rebuilds when state changes.
export function updateSolverPanel() {
  if (!solverDiv) return;

  // "computing" state (shown for a frame before the solve runs).
  if (engine.thinking && !engine.plan) {
    if (!lastThinking) {
      solverDiv.style("display", "flex");
      headerDiv.html("// solver");
      bodyDiv.html("computing solution…");
      lastThinking = true;
      lastPlan = null;
      lastDone = -1;
    }
    return;
  }
  lastThinking = false;

  if (!engine.plan) {
    if (lastPlan !== null) {
      solverDiv.style("display", "none");
      lastPlan = null;
      lastDone = -1;
    }
    return;
  }

  // Re-render only when the plan or progress changes.
  if (engine.plan === lastPlan && engine.planDone === lastDone) return;
  lastPlan = engine.plan;
  lastDone = engine.planDone;

  const total = engine.plan.length;
  const done = Math.min(engine.planDone, total);

  const num = (i) => String(i + 1).padStart(3, "0");
  const lines = engine.plan
    .map((tok, i) => {
      const cell =
        `<span style="display:inline-block;width:2.4em;opacity:.5">${num(i)}</span>` +
        `<span style="display:inline-block;width:2.6em;color:#cfe7ff">${tok}</span>` +
        describe(tok);
      if (i < done) return `<div style="opacity:.3">${cell}</div>`;
      if (i === done)
        return `<div style="color:#fff;font-weight:700;background:rgba(155,231,160,0.15)">▸ ${cell}</div>`;
      return `<div>&nbsp;&nbsp;${cell}</div>`;
    })
    .join("");

  solverDiv.style("display", "flex");
  headerDiv.html(done >= total ? `// solved in ${total} moves ✓` : `// solving · ${done}/${total}`);
  bodyDiv.html(lines);

  // Keep the current move in view within the scrolling body.
  bodyDiv.elt.scrollTop = Math.max(0, done * LINE_H - 140);
}
