// ---------------------------------------------------------------------------
// Kociemba two-phase solver — cubie-level model (no p5 dependency)
//
// A faithful port of Herbert Kociemba's cube representation: 8 corners and 12
// edges, each with a permutation and an orientation. This is the algebraic core
// the coordinate tables and the two-phase search are built on.
//
// Corner ids:  URF UFL ULB UBR DFR DLF DBL DRB  (0..7)
// Edge ids:    UR UF UL UB DR DF DL DB FR FL BL BR  (0..11)
//
// The facelet model uses the standard layout (U on top, F in front):
//   indices  U:0..8  R:9..17  F:18..26  D:27..35  L:36..44  B:45..53
// each face numbered row-major as seen from outside. The cornerFacelet /
// edgeFacelet / *Color tables below encode that layout; everything else is
// derived from them, so the whole solver is internally consistent.
// ---------------------------------------------------------------------------

// --- facelet <-> cubie tables (standard Kociemba definitions) ----------------

// The 3 facelet indices touched by each corner, ordered so index 0 is the
// U/D-colored facelet in the solved cube.
const cornerFacelet = [
  [8, 9, 20], // URF: U9 R1 F3
  [6, 18, 38], // UFL: U7 F1 L3
  [0, 36, 47], // ULB: U1 L1 B3
  [2, 45, 11], // UBR: U3 B1 R3
  [29, 26, 15], // DFR: D3 F9 R7
  [27, 44, 24], // DLF: D1 L9 F7
  [33, 53, 42], // DBL: D7 B9 L7
  [35, 17, 51], // DRB: D9 R9 B7
];

// The 2 facelet indices touched by each edge.
const edgeFacelet = [
  [5, 10], // UR: U6 R2
  [7, 19], // UF: U8 F2
  [3, 37], // UL: U4 L2
  [1, 46], // UB: U2 B2
  [32, 16], // DR: D6 R8
  [28, 25], // DF: D2 F8
  [30, 43], // DL: D4 L8
  [34, 52], // DB: D8 B8
  [23, 12], // FR: F6 R4
  [21, 41], // FL: F4 L6
  [50, 39], // BL: B6 L4
  [48, 14], // BR: B4 R6
];

// The face letters of each corner/edge in solved order (matches cornerFacelet /
// edgeFacelet ordering). Letter 0 of every corner is its U or D facelet.
const cornerColor = [
  ["U", "R", "F"], ["U", "F", "L"], ["U", "L", "B"], ["U", "B", "R"],
  ["D", "F", "R"], ["D", "L", "F"], ["D", "B", "L"], ["D", "R", "B"],
];
const edgeColor = [
  ["U", "R"], ["U", "F"], ["U", "L"], ["U", "B"],
  ["D", "R"], ["D", "F"], ["D", "L"], ["D", "B"],
  ["F", "R"], ["F", "L"], ["B", "L"], ["B", "R"],
];

// --- small array helpers -----------------------------------------------------

function rotateLeft(arr, l, r) {
  const tmp = arr[l];
  for (let i = l; i < r; i++) arr[i] = arr[i + 1];
  arr[r] = tmp;
}
function rotateRight(arr, l, r) {
  const tmp = arr[r];
  for (let i = r; i > l; i--) arr[i] = arr[i - 1];
  arr[l] = tmp;
}
// Binomial coefficient C(n, k).
export function Cnk(n, k) {
  if (n < 0 || k < 0 || k > n) return 0;
  if (k > n - k) k = n - k;
  let s = 1;
  for (let i = n, j = 1; j <= k; i--, j++) s = (s * i) / j;
  return Math.round(s);
}

// --- CubieCube ---------------------------------------------------------------

export class CubieCube {
  constructor(cp, co, ep, eo) {
    this.cp = cp ? cp.slice() : [0, 1, 2, 3, 4, 5, 6, 7];
    this.co = co ? co.slice() : [0, 0, 0, 0, 0, 0, 0, 0];
    this.ep = ep ? ep.slice() : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    this.eo = eo ? eo.slice() : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }

  // this := this * b  (apply move-cube b after the current state).
  cornerMultiply(b) {
    const cP = new Array(8), cO = new Array(8);
    for (let c = 0; c < 8; c++) {
      cP[c] = this.cp[b.cp[c]];
      cO[c] = (this.co[b.cp[c]] + b.co[c]) % 3;
    }
    this.cp = cP;
    this.co = cO;
  }
  edgeMultiply(b) {
    const eP = new Array(12), eO = new Array(12);
    for (let e = 0; e < 12; e++) {
      eP[e] = this.ep[b.ep[e]];
      eO[e] = (this.eo[b.ep[e]] + b.eo[e]) % 2;
    }
    this.ep = eP;
    this.eo = eO;
  }

  // ---- phase-1 coordinates --------------------------------------------------

  // Corner orientation, 0..2186.
  getTwist() {
    let ret = 0;
    for (let i = 0; i < 7; i++) ret = 3 * ret + this.co[i];
    return ret;
  }
  setTwist(twist) {
    let parity = 0;
    for (let i = 6; i >= 0; i--) {
      parity += this.co[i] = twist % 3;
      twist = Math.floor(twist / 3);
    }
    this.co[7] = ((3 - (parity % 3)) % 3 + 3) % 3;
  }

  // Edge orientation, 0..2047.
  getFlip() {
    let ret = 0;
    for (let i = 0; i < 11; i++) ret = 2 * ret + this.eo[i];
    return ret;
  }
  setFlip(flip) {
    let parity = 0;
    for (let i = 10; i >= 0; i--) {
      parity += this.eo[i] = flip % 2;
      flip = Math.floor(flip / 2);
    }
    this.eo[11] = (2 - (parity % 2)) % 2;
  }

  // Permutation parity of corners (== edge parity for a valid cube).
  cornerParity() {
    let s = 0;
    for (let i = 7; i >= 1; i--) for (let j = i - 1; j >= 0; j--) if (this.cp[j] > this.cp[i]) s++;
    return s % 2;
  }
  edgeParity() {
    let s = 0;
    for (let i = 11; i >= 1; i--) for (let j = i - 1; j >= 0; j--) if (this.ep[j] > this.ep[i]) s++;
    return s % 2;
  }

  // Location + permutation of the 4 UD-slice edges (FR,FL,BL,BR = 8..11), 0..11879.
  // The high part (/24) is the location coordinate used by phase 1.
  getFRtoBR() {
    let a = 0, x = 0;
    const edge4 = [0, 0, 0, 0];
    for (let j = 11; j >= 0; j--) {
      if (this.ep[j] >= 8 && this.ep[j] <= 11) {
        a += Cnk(11 - j, x + 1);
        edge4[3 - x] = this.ep[j];
        x++;
      }
    }
    let b = 0;
    for (let j = 3; j > 0; j--) {
      let k = 0;
      while (edge4[j] !== j + 8) {
        rotateLeft(edge4, 0, j);
        k++;
      }
      b = (j + 1) * b + k;
    }
    return 24 * a + b;
  }
  setFRtoBR(idx) {
    const sliceEdge = [8, 9, 10, 11];
    const otherEdge = [0, 1, 2, 3, 4, 5, 6, 7];
    let b = idx % 24, a = Math.floor(idx / 24);
    for (let e = 0; e < 12; e++) this.ep[e] = -1;
    for (let j = 1; j < 4; j++) {
      let k = b % (j + 1);
      b = Math.floor(b / (j + 1));
      while (k-- > 0) rotateRight(sliceEdge, 0, j);
    }
    let x = 3;
    for (let j = 0; j < 12; j++) {
      if (a - Cnk(11 - j, x + 1) >= 0) {
        this.ep[j] = sliceEdge[3 - x];
        a -= Cnk(11 - j, x + 1);
        x--;
      }
    }
    x = 0;
    for (let j = 0; j < 12; j++) if (this.ep[j] === -1) this.ep[j] = otherEdge[x++];
  }

  // ---- phase-2 coordinates --------------------------------------------------

  // Permutation of the 6 corners URF..DLF (0..5), 0..20159.
  getURFtoDLF() {
    let a = 0, x = 0;
    const corner6 = [0, 0, 0, 0, 0, 0];
    for (let j = 0; j < 8; j++) {
      if (this.cp[j] <= 5) {
        a += Cnk(j, x + 1);
        corner6[x] = this.cp[j];
        x++;
      }
    }
    let b = 0;
    for (let j = 5; j > 0; j--) {
      let k = 0;
      while (corner6[j] !== j) {
        rotateLeft(corner6, 0, j);
        k++;
      }
      b = (j + 1) * b + k;
    }
    return 720 * a + b;
  }
  setURFtoDLF(idx) {
    const corner6 = [0, 1, 2, 3, 4, 5];
    const otherCorner = [6, 7];
    let b = idx % 720, a = Math.floor(idx / 720);
    for (let i = 0; i < 8; i++) this.cp[i] = -1;
    for (let j = 1; j < 6; j++) {
      let k = b % (j + 1);
      b = Math.floor(b / (j + 1));
      while (k-- > 0) rotateRight(corner6, 0, j);
    }
    let x = 5;
    for (let j = 7; j >= 0; j--) {
      if (a - Cnk(j, x + 1) >= 0) {
        this.cp[j] = corner6[x];
        a -= Cnk(j, x + 1);
        x--;
      }
    }
    x = 0;
    for (let j = 0; j < 8; j++) if (this.cp[j] === -1) this.cp[j] = otherCorner[x++];
  }

  // Permutation of the 6 edges UR..DF (0..5). Full range; phase-2 values < 20160.
  getURtoDF() {
    let a = 0, x = 0;
    const edge6 = [0, 0, 0, 0, 0, 0];
    for (let j = 0; j < 12; j++) {
      if (this.ep[j] <= 5) {
        a += Cnk(j, x + 1);
        edge6[x] = this.ep[j];
        x++;
      }
    }
    let b = 0;
    for (let j = 5; j > 0; j--) {
      let k = 0;
      while (edge6[j] !== j) {
        rotateLeft(edge6, 0, j);
        k++;
      }
      b = (j + 1) * b + k;
    }
    return 720 * a + b;
  }
  setURtoDF(idx) {
    const edge6 = [0, 1, 2, 3, 4, 5];
    const otherEdge = [6, 7, 8, 9, 10, 11];
    let b = idx % 720, a = Math.floor(idx / 720);
    for (let e = 0; e < 12; e++) this.ep[e] = -1;
    for (let j = 1; j < 6; j++) {
      let k = b % (j + 1);
      b = Math.floor(b / (j + 1));
      while (k-- > 0) rotateRight(edge6, 0, j);
    }
    let x = 5;
    for (let j = 11; j >= 0; j--) {
      if (a - Cnk(j, x + 1) >= 0) {
        this.ep[j] = edge6[x];
        a -= Cnk(j, x + 1);
        x--;
      }
    }
    x = 0;
    for (let j = 0; j < 12; j++) if (this.ep[j] === -1) this.ep[j] = otherEdge[x++];
  }

  // Permutation of the 3 edges UR,UF,UL (0..2), used through phase 1.
  getURtoUL() {
    let a = 0, x = 0;
    const edge3 = [0, 0, 0];
    for (let j = 0; j < 12; j++) {
      if (this.ep[j] <= 2) {
        a += Cnk(j, x + 1);
        edge3[x] = this.ep[j];
        x++;
      }
    }
    let b = 0;
    for (let j = 2; j > 0; j--) {
      let k = 0;
      while (edge3[j] !== j) {
        rotateLeft(edge3, 0, j);
        k++;
      }
      b = (j + 1) * b + k;
    }
    return 6 * a + b;
  }
  setURtoUL(idx) {
    const edge3 = [0, 1, 2];
    let b = idx % 6, a = Math.floor(idx / 6);
    for (let e = 0; e < 12; e++) this.ep[e] = 11; // sentinel (BR) for the merge
    for (let j = 1; j < 3; j++) {
      let k = b % (j + 1);
      b = Math.floor(b / (j + 1));
      while (k-- > 0) rotateRight(edge3, 0, j);
    }
    let x = 2;
    for (let j = 11; j >= 0; j--) {
      if (a - Cnk(j, x + 1) >= 0) {
        this.ep[j] = edge3[x];
        a -= Cnk(j, x + 1);
        x--;
      }
    }
  }

  // Permutation of the 3 edges UB,DR,DF (3..5), used through phase 1.
  getUBtoDF() {
    let a = 0, x = 0;
    const edge3 = [0, 0, 0];
    for (let j = 0; j < 12; j++) {
      if (this.ep[j] >= 3 && this.ep[j] <= 5) {
        a += Cnk(j, x + 1);
        edge3[x] = this.ep[j];
        x++;
      }
    }
    let b = 0;
    for (let j = 2; j > 0; j--) {
      let k = 0;
      while (edge3[j] !== 3 + j) {
        rotateLeft(edge3, 0, j);
        k++;
      }
      b = (j + 1) * b + k;
    }
    return 6 * a + b;
  }
  setUBtoDF(idx) {
    const edge3 = [3, 4, 5];
    let b = idx % 6, a = Math.floor(idx / 6);
    for (let e = 0; e < 12; e++) this.ep[e] = 11; // sentinel (BR) for the merge
    for (let j = 1; j < 3; j++) {
      let k = b % (j + 1);
      b = Math.floor(b / (j + 1));
      while (k-- > 0) rotateRight(edge3, 0, j);
    }
    let x = 2;
    for (let j = 11; j >= 0; j--) {
      if (a - Cnk(j, x + 1) >= 0) {
        this.ep[j] = edge3[x];
        a -= Cnk(j, x + 1);
        x--;
      }
    }
  }
}

// Merge a URtoUL coordinate and a UBtoDF coordinate (both with their 3 edges in
// the U/D layer, i.e. < 336) into the combined URtoDF coordinate. Returns -1 if
// the two placements collide (an impossible combination).
export function mergeURtoDF(idx1, idx2) {
  const a = new CubieCube();
  const b = new CubieCube();
  a.setURtoUL(idx1);
  b.setUBtoDF(idx2);
  for (let i = 0; i < 8; i++) {
    if (a.ep[i] !== 11) {
      if (b.ep[i] !== 11) return -1; // both occupied -> impossible combination
      // a keeps its edge
    } else {
      a.ep[i] = b.ep[i]; // a empty -> take b's edge
    }
  }
  return a.getURtoDF();
}

// --- basic move cubes --------------------------------------------------------
// Standard Kociemba definitions. Move axis order: U R F D L B (0..5).
const M = (cp, co, ep, eo) => new CubieCube(cp, co, ep, eo);
export const moveCubes = [
  M([3, 0, 1, 2, 4, 5, 6, 7], [0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), // U
  M([4, 1, 2, 0, 7, 5, 6, 3], [2, 0, 0, 1, 1, 0, 0, 2],
    [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), // R
  M([1, 5, 2, 3, 0, 4, 6, 7], [1, 2, 0, 0, 2, 1, 0, 0],
    [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0]), // F
  M([0, 1, 2, 3, 5, 6, 7, 4], [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), // D
  M([0, 2, 6, 3, 4, 1, 5, 7], [0, 1, 2, 0, 0, 2, 1, 0],
    [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), // L
  M([0, 1, 3, 7, 4, 5, 2, 6], [0, 0, 1, 2, 0, 0, 2, 1],
    [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1]), // B
];

// --- facelet conversion ------------------------------------------------------

// Build a CubieCube from a 54-char facelet string (chars from "URFDLB").
export function toCubieCube(f) {
  const cc = new CubieCube();
  const col = (i) => f[i];
  for (let i = 0; i < 8; i++) {
    let ori = 0;
    for (; ori < 3; ori++) {
      const c = col(cornerFacelet[i][ori]);
      if (c === "U" || c === "D") break;
    }
    const col1 = col(cornerFacelet[i][(ori + 1) % 3]);
    const col2 = col(cornerFacelet[i][(ori + 2) % 3]);
    for (let j = 0; j < 8; j++) {
      if (col1 === cornerColor[j][1] && col2 === cornerColor[j][2]) {
        cc.cp[i] = j;
        cc.co[i] = ori % 3;
        break;
      }
    }
  }
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 12; j++) {
      const a = col(edgeFacelet[i][0]);
      const b = col(edgeFacelet[i][1]);
      if (a === edgeColor[j][0] && b === edgeColor[j][1]) {
        cc.ep[i] = j;
        cc.eo[i] = 0;
        break;
      }
      if (a === edgeColor[j][1] && b === edgeColor[j][0]) {
        cc.ep[i] = j;
        cc.eo[i] = 1;
        break;
      }
    }
  }
  return cc;
}

// Render a CubieCube to a 54-char facelet string.
export function toFaceletString(cc) {
  const f = new Array(54);
  const centers = ["U", "R", "F", "D", "L", "B"];
  for (let i = 0; i < 6; i++) f[i * 9 + 4] = centers[i];
  for (let i = 0; i < 8; i++) {
    const j = cc.cp[i], ori = cc.co[i];
    for (let n = 0; n < 3; n++) f[cornerFacelet[i][(n + ori) % 3]] = cornerColor[j][n];
  }
  for (let i = 0; i < 12; i++) {
    const j = cc.ep[i], ori = cc.eo[i];
    for (let n = 0; n < 2; n++) f[edgeFacelet[i][(n + ori) % 2]] = edgeColor[j][n];
  }
  return f.join("");
}

// Validate a cube: 0 if solvable, negative code otherwise.
export function verify(cc) {
  const edgeCount = new Array(12).fill(0);
  for (let e = 0; e < 12; e++) edgeCount[cc.ep[e]]++;
  for (let i = 0; i < 12; i++) if (edgeCount[i] !== 1) return -2;

  let s = 0;
  for (let i = 0; i < 12; i++) s += cc.eo[i];
  if (s % 2 !== 0) return -3;

  const cornerCount = new Array(8).fill(0);
  for (let c = 0; c < 8; c++) cornerCount[cc.cp[c]]++;
  for (let i = 0; i < 8; i++) if (cornerCount[i] !== 1) return -4;

  s = 0;
  for (let i = 0; i < 8; i++) s += cc.co[i];
  if (s % 3 !== 0) return -5;

  if (cc.edgeParity() !== cc.cornerParity()) return -6;
  return 0;
}
