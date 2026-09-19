// ---------------------------------------------------------------------------
// Geometry builders
// Pure helpers that construct reusable p5.Geometry shapes. No cube state here.
// ---------------------------------------------------------------------------

import { P } from "../p5app.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Build a rounded box (cube with filleted edges/corners). A subdivided cube is
// generated and each vertex is projected onto the rounded-box surface. Exact
// analytic normals are supplied so lighting reads correctly.
export function makeRoundedBox(size, radius, detail) {
  const h = size / 2;
  const r = Math.min(radius, h);
  const step = (2 * h) / detail;

  // Each face maps grid coords (u, v) to a 3D point on the cube surface.
  const faces = [
    (u, v) => [h, u, v], // +x
    (u, v) => [-h, u, v], // -x
    (u, v) => [u, h, v], // +y
    (u, v) => [u, -h, v], // -y
    (u, v) => [u, v, h], // +z
    (u, v) => [u, v, -h], // -z
  ];

  // Push a point onto the rounded surface and emit it with its true normal.
  const emit = (pt) => {
    const lim = h - r;
    const cx = clamp(pt[0], -lim, lim);
    const cy = clamp(pt[1], -lim, lim);
    const cz = clamp(pt[2], -lim, lim);
    let nx = pt[0] - cx;
    let ny = pt[1] - cy;
    let nz = pt[2] - cz;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    P.normal(nx, ny, nz);
    P.vertex(cx + nx * r, cy + ny * r, cz + nz * r);
  };

  return P.buildGeometry(() => {
    P.beginShape(P.TRIANGLES);
    for (const face of faces) {
      for (let iu = 0; iu < detail; iu++) {
        for (let iv = 0; iv < detail; iv++) {
          const u0 = -h + iu * step;
          const u1 = u0 + step;
          const v0 = -h + iv * step;
          const v1 = v0 + step;
          const a = face(u0, v0);
          const b = face(u1, v0);
          const c = face(u1, v1);
          const d = face(u0, v1);
          emit(a);
          emit(b);
          emit(c);
          emit(a);
          emit(c);
          emit(d);
        }
      }
    }
    P.endShape();
  });
}

// Build a flat rounded rectangle in the XY plane (facing +z), as a triangle
// fan from the center out to an arc-sampled perimeter.
export function makeRoundedRect(w, h, radius, cornerSteps) {
  const hw = w / 2;
  const hh = h / 2;
  const r = Math.min(radius, hw, hh);
  const HALF_PI = Math.PI / 2;

  // Centers of the four corner arcs, swept counter-clockwise.
  const corners = [
    { cx: hw - r, cy: hh - r, a0: 0, a1: HALF_PI },
    { cx: -hw + r, cy: hh - r, a0: HALF_PI, a1: Math.PI },
    { cx: -hw + r, cy: -hh + r, a0: Math.PI, a1: Math.PI + HALF_PI },
    { cx: hw - r, cy: -hh + r, a0: Math.PI + HALF_PI, a1: 2 * Math.PI },
  ];

  const pts = [];
  for (const c of corners) {
    for (let s = 0; s <= cornerSteps; s++) {
      const a = c.a0 + (c.a1 - c.a0) * (s / cornerSteps);
      pts.push([c.cx + Math.cos(a) * r, c.cy + Math.sin(a) * r]);
    }
  }

  return P.buildGeometry(() => {
    P.normal(0, 0, 1);
    P.beginShape(P.TRIANGLES);
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      P.vertex(0, 0, 0);
      P.vertex(p0[0], p0[1], 0);
      P.vertex(p1[0], p1[1], 0);
    }
    P.endShape();
  });
}
