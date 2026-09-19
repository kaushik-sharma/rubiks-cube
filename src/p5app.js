// ---------------------------------------------------------------------------
// p5 instance holder
// Keeps a reference to the running p5 instance so render/UI modules can reach
// the p5 API (P.push(), P.translate(), P.HALF_PI, ...) without threading it
// through every function. Set once when the sketch boots in main.js.
// ---------------------------------------------------------------------------

export let P = null;

export function setApp(instance) {
  P = instance;
}
