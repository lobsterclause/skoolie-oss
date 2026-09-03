/**
 * Document detection and flattening on top of OpenCV.js. Pure functions over `cv` and `Mat`s so the
 * same code runs in the browser (page photos) and in Node (tests on synthetic images); nothing here
 * touches a canvas. The approach is the classic one (also used by jscanify): edges → largest
 * quadrilateral contour → perspective warp, then a lighting-normalised grayscale for a "scan" look.
 */
import type { CV } from "@techstark/opencv-js";

export type Mat = InstanceType<CV["Mat"]>;
export interface Pt {
  x: number;
  y: number;
}
/** Corners in reading order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt];

/** Longest side the detector works at; photos are downscaled for detection and warped at full size. */
const DETECT_MAX = 900;
/** A candidate smaller than this share of the frame is a sticker or a shadow, not the page. */
const MIN_AREA_SHARE = 0.12;

/** Sort four arbitrary points into TL, TR, BR, BL (screen coordinates, y grows downwards). */
export function orderCorners(pts: readonly Pt[]): Quad {
  if (pts.length !== 4) throw new Error(`orderCorners needs 4 points, got ${pts.length}`);
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = bySum[0]!;
  const br = bySum[3]!;
  const rest = pts.filter((p) => p !== tl && p !== br);
  const [a, b] = rest as [Pt, Pt];
  // Of the two remaining, the one further right (x - y larger) is top-right.
  return a.x - a.y > b.x - b.y ? [tl, a, br, b] : [tl, b, br, a];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Output size for a flattened quad: the longer of each pair of opposite sides, in source pixels. */
export function quadSize(q: Quad): { width: number; height: number } {
  const [tl, tr, br, bl] = q;
  return { width: Math.max(1, Math.round(Math.max(dist(tl, tr), dist(bl, br)))), height: Math.max(1, Math.round(Math.max(dist(tl, bl), dist(tr, br)))) };
}

/** Shoelace area of a quad; used to reject degenerate detections. */
export function quadArea(q: Quad): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/**
 * Find the sheet of paper in an RGBA image. Returns its corners in full-resolution coordinates, or
 * null when nothing page-like fills enough of the frame (the caller then keeps the whole photo).
 */
export function findPaper(cv: CV, src: Mat): Quad | null {
  const scale = Math.min(1, DETECT_MAX / Math.max(src.cols, src.rows));
  const small = new cv.Mat();
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    if (scale < 1) cv.resize(src, small, new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale)), 0, 0, cv.INTER_AREA);
    else src.copyTo(small);
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    cv.Canny(gray, edges, 50, 150);
    // Closing the outline lets a slightly broken edge (glare, a finger) still form one contour.
    cv.dilate(edges, edges, kernel);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const frameArea = small.cols * small.rows;
    const ranked: { i: number; area: number }[] = [];
    for (let i = 0; i < contours.size(); i++) ranked.push({ i, area: cv.contourArea(contours.get(i)) });
    ranked.sort((a, b) => b.area - a.area);

    const unscale = (p: Pt): Pt => ({ x: p.x / scale, y: p.y / scale });
    for (const { i, area } of ranked.slice(0, 5)) {
      if (area < frameArea * MIN_AREA_SHARE) break;
      const contour = contours.get(i);
      const quad = approxQuad(cv, contour) ?? extremeQuad(cv, contour);
      if (quad && quadArea(quad) >= frameArea * MIN_AREA_SHARE) return quad.map(unscale) as Quad;
    }
    return null;
  } finally {
    small.delete();
    gray.delete();
    edges.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
  }
}

/** Polygon simplification: a page seen from anywhere is a convex quad once tiny wiggles are dropped. */
function approxQuad(cv: CV, contour: Mat): Quad | null {
  const approx = new cv.Mat();
  try {
    cv.approxPolyDP(contour, approx, 0.02 * cv.arcLength(contour, true), true);
    if (approx.rows !== 4 || !cv.isContourConvex(approx)) return null;
    const d = approx.data32S;
    return orderCorners([0, 1, 2, 3].map((k) => ({ x: d[k * 2]!, y: d[k * 2 + 1]! })));
  } finally {
    approx.delete();
  }
}

/**
 * Fallback for a contour that did not simplify to four vertices (curled corner, a hand in frame):
 * the point furthest from the centre in each quadrant of the minimum-area rectangle.
 */
function extremeQuad(cv: CV, contour: Mat): Quad | null {
  const { center } = cv.minAreaRect(contour);
  const best: (Pt & { d: number })[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0, d: -1 }));
  const d = contour.data32S;
  for (let k = 0; k < contour.rows; k++) {
    const x = d[k * 2]!;
    const y = d[k * 2 + 1]!;
    const q = (x < center.x ? 0 : 1) + (y < center.y ? 0 : 2); // 0 TL, 1 TR, 2 BL, 3 BR
    const dd = (x - center.x) ** 2 + (y - center.y) ** 2;
    if (dd > best[q]!.d) best[q] = { x, y, d: dd };
  }
  if (best.some((b) => b.d < 0)) return null;
  return orderCorners(best.map(({ x, y }) => ({ x, y })));
}

/** Warp the quad in `src` (RGBA) into an upright rectangle. Returns a new Mat the caller must delete. */
export function warpPaper(cv: CV, src: Mat, quad: Quad): Mat {
  const { width, height } = quadSize(quad);
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap((p) => [p.x, p.y]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);
  const m = cv.getPerspectiveTransform(from, to);
  const dst = new cv.Mat();
  try {
    cv.warpPerspective(src, dst, m, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
    return dst;
  } finally {
    from.delete();
    to.delete();
    m.delete();
  }
}

/**
 * The "scan" look: grayscale with uneven lighting divided out, so the paper reads as white and the
 * ink stays dark, without binarising (handwriting and stamps keep their shading). RGBA in, RGBA out.
 */
export function whiten(cv: CV, src: Mat): Mat {
  const gray = new cv.Mat();
  const bg = new cv.Mat();
  const flat = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9));
  const dst = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    // Background estimate: dilate swallows the text, the blur smooths what is left into the page's lighting.
    cv.dilate(gray, bg, kernel);
    cv.medianBlur(bg, bg, 21);
    cv.divide(gray, bg, flat, 255, -1);
    cv.cvtColor(flat, dst, cv.COLOR_GRAY2RGBA);
    return dst;
  } finally {
    gray.delete();
    bg.delete();
    flat.delete();
    kernel.delete();
  }
}

/** An RGBA Mat from raw pixels (an ImageData's buffer, or a test fixture). Caller deletes. */
export function matFromRgba(cv: CV, data: ArrayLike<number>, width: number, height: number): Mat {
  const m = new cv.Mat(height, width, cv.CV_8UC4);
  m.data.set(data);
  return m;
}
