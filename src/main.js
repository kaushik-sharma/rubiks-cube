// ---------------------------------------------------------------------------
// Rubik's Cube Simulation — entry point
// Creates the p5 instance (instance mode), wires the modules together, and
// owns the p5 setup/draw lifecycle plus the orbit-style view rotation.
// See src/config.js for tuning constants.
// ---------------------------------------------------------------------------

import { setApp } from "./p5app.js";
import { buildCubies } from "./cube/model.js";
import { updateMoves } from "./cube/moves.js";
import { buildGeometries, drawCube } from "./render/scene.js";
import {
  buildControlsOverlay,
  buildSizeSelector,
  buildSolverPanel,
  handleKeyPressed,
  mouseInCanvas,
  updateSolverPanel,
} from "./ui/controls.js";

// `p5` is the global constructor from the CDN script in index.html.
new p5((p) => {
  setApp(p);

  // View rotation. A "target" the mouse drives, plus a smoothed current value.
  let rotX = -0.5;
  let rotY = -0.6;
  let targetRotX = rotX;
  let targetRotY = rotY;

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL);
    buildGeometries();
    buildCubies();
    buildControlsOverlay();
    buildSizeSelector();
    buildSolverPanel();
  };

  p.draw = () => {
    p.background(50);

    // While dragging, convert mouse movement into view rotation.
    if (p.mouseIsPressed && mouseInCanvas()) {
      targetRotY += (p.mouseX - p.pmouseX) * 0.01;
      targetRotX -= (p.mouseY - p.pmouseY) * 0.01;
    } else {
      // Gentle idle spin so the scene stays lively when untouched.
      targetRotY += 0.0015;
    }
    rotX = p.lerp(rotX, targetRotX, 0.15);
    rotY = p.lerp(rotY, targetRotY, 0.15);

    // Lighting for depth.
    p.ambientLight(150);
    p.directionalLight(255, 255, 255, 0.4, 0.6, -1);

    p.rotateX(rotX);
    p.rotateY(rotY);

    updateMoves();
    drawCube();
    updateSolverPanel();
  };

  p.keyPressed = () => handleKeyPressed();

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };
});
