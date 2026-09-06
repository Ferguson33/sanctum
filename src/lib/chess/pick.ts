import type { Square } from "./engine";
import type { Side } from "./catalog";
import { FILES, RANKS } from "./engine";

export type Pt = { x: number; y: number };

function solve8(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    [M[i], M[piv]] = [M[piv], M[i]];
    const d = M[i][i];
    if (Math.abs(d) < 1e-12) return Array(8).fill(0);
    for (let c = i; c <= n; c++) M[i][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i];
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map((row) => row[n]);
}

/** Homography mapping `from` points to `to` points (4 each). Row-major 3x3, h22=1. */
function homography(from: Pt[], to: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve8(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function applyH(m: number[], x: number, y: number): Pt {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

export function screenToSquare(
  clientX: number,
  clientY: number,
  corners: { tl: Pt; tr: Pt; br: Pt; bl: Pt },
  orientation: Side,
): Square | null {
  const src = [corners.tl, corners.tr, corners.br, corners.bl];
  const dst: Pt[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const H = homography(src, dst);
  const uv = applyH(H, clientX, clientY);
  if (uv.x < -0.02 || uv.x > 1.02 || uv.y < -0.02 || uv.y > 1.02) return null;
  const u = Math.min(0.999, Math.max(0, uv.x));
  const v = Math.min(0.999, Math.max(0, uv.y));
  const fi = Math.floor(u * 8);
  const ri = Math.floor(v * 8);
  const file = orientation === "w" ? FILES[fi] : FILES[7 - fi];
  const rank = orientation === "w" ? RANKS[7 - ri] : RANKS[ri];
  return `${file}${rank}` as Square;
}
