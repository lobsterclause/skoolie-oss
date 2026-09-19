// @vitest-environment node
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import type { CV } from "@techstark/opencv-js";
import { findPaper, matFromRgba, orderCorners, quadArea, quadSize, warpPaper, whiten, type Mat, type Quad } from "./paper.js";

// The real OpenCV.js build (wasm) runs in Node; loading it once costs ~1s, so the detector is exercised
// on a synthetic photo rather than mocked — a mock would only prove the mock. It is a CommonJS
// module whose export is the ready-promise itself, so it goes through require: an ESM namespace
// would copy `then` and make `await import()` choke on it.
let cv: CV;
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  cv = await (require("@techstark/opencv-js") as PromiseLike<CV>);
}, 30_000);

const W = 640;
const H = 480;
/** A sheet photographed at an angle: white quad on a dark table with a few dark "text" strokes. */
const PAGE: Quad = [
  { x: 120, y: 80 },
  { x: 520, y: 60 },
  { x: 560, y: 420 },
  { x: 90, y: 400 },
];

function photo(): Mat {
  const m = new cv.Mat(H, W, cv.CV_8UC4, new cv.Scalar(70, 72, 75, 255));
  const pts = cv.matFromArray(4, 1, cv.CV_32SC2, PAGE.flatMap((p) => [p.x, p.y]));
  const poly = new cv.MatVector();
  poly.push_back(pts);
  cv.fillPoly(m, poly, new cv.Scalar(245, 243, 238, 255));
  for (let i = 0; i < 6; i++) cv.line(m, new cv.Point(170, 140 + i * 40), new cv.Point(470, 130 + i * 40), new cv.Scalar(20, 20, 20, 255), 4);
  pts.delete();
  poly.delete();
  return m;
}

const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe("orderCorners / quadSize / quadArea", () => {
  it("sorts any order into TL, TR, BR, BL", () => {
    const shuffled = [PAGE[2], PAGE[0], PAGE[3], PAGE[1]];
    expect(orderCorners(shuffled)).toEqual(PAGE);
  });
  it("rejects anything but four points", () => {
    expect(() => orderCorners([PAGE[0], PAGE[1]])).toThrow(/4 points/);
  });
  it("sizes the output by the longer of each pair of sides", () => {
    const { width, height } = quadSize(PAGE);
    expect(width).toBe(Math.round(Math.hypot(470, 20))); // bottom edge is the longer one
    expect(height).toBe(Math.round(Math.hypot(40, 360))); // right edge is the longer one
  });
  it("computes area with the shoelace formula", () => {
    expect(quadArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }])).toBe(50);
  });
});

describe("findPaper", () => {
  it("locates the four corners of an angled page", () => {
    const src = photo();
    try {
      const quad = findPaper(cv, src);
      expect(quad).not.toBeNull();
      for (let i = 0; i < 4; i++) expect(near(quad![i]!, PAGE[i]!, 6), `corner ${i}: ${JSON.stringify(quad![i])}`).toBe(true);
    } finally {
      src.delete();
    }
  });
  it("returns null when nothing page-sized is in frame", () => {
    const src = new cv.Mat(H, W, cv.CV_8UC4, new cv.Scalar(70, 72, 75, 255));
    cv.rectangle(src, new cv.Point(300, 200), new cv.Point(340, 240), new cv.Scalar(245, 245, 245, 255), -1);
    try {
      expect(findPaper(cv, src)).toBeNull();
    } finally {
      src.delete();
    }
  });
  it("works on a large photo by detecting at reduced scale", () => {
    const small = photo();
    const big = new cv.Mat();
    cv.resize(small, big, new cv.Size(W * 4, H * 4), 0, 0, cv.INTER_LINEAR);
    try {
      const quad = findPaper(cv, big);
      expect(quad).not.toBeNull();
      for (let i = 0; i < 4; i++) expect(near(quad![i]!, { x: PAGE[i]!.x * 4, y: PAGE[i]!.y * 4 }, 24)).toBe(true);
    } finally {
      small.delete();
      big.delete();
    }
  });
});

describe("warpPaper / whiten", () => {
  it("flattens the page into an upright, page-sized, bright rectangle with the text still on it", () => {
    const src = photo();
    const out = warpPaper(cv, src, PAGE);
    try {
      const { width, height } = quadSize(PAGE);
      expect([out.cols, out.rows]).toEqual([width, height]);
      const px = (x: number, y: number) => out.ucharPtr(y, x)[0]!;
      expect(px(Math.round(width * 0.5), Math.round(height * 0.05))).toBeGreaterThan(200); // margin is paper
      // Somewhere down the middle column a text stroke must be dark.
      const column = Array.from({ length: height }, (_, y) => px(Math.round(width * 0.5), y));
      expect(Math.min(...column)).toBeLessThan(80);
    } finally {
      src.delete();
      out.delete();
    }
  });
  it("whitens unevenly lit paper and keeps the ink dark", () => {
    const src = photo();
    // A lighting gradient: the right half of the frame is dimmer.
    for (let y = 0; y < H; y++)
      for (let x = W / 2; x < W; x++) {
        const p = src.ucharPtr(y, x);
        p[0] = Math.round(p[0]! * 0.6);
        p[1] = Math.round(p[1]! * 0.6);
        p[2] = Math.round(p[2]! * 0.6);
      }
    const page = warpPaper(cv, src, PAGE);
    const flat = whiten(cv, page);
    try {
      expect(flat.channels()).toBe(4);
      const px = (x: number, y: number) => flat.ucharPtr(y, x)[0]!;
      expect(px(Math.round(page.cols * 0.9), Math.round(page.rows * 0.05))).toBeGreaterThan(235); // dim side now white
      const column = Array.from({ length: page.rows }, (_, y) => px(Math.round(page.cols * 0.5), y));
      expect(Math.min(...column)).toBeLessThan(90);
    } finally {
      src.delete();
      page.delete();
      flat.delete();
    }
  });
  it("builds a Mat from raw RGBA bytes", () => {
    const m = matFromRgba(cv, new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]), 2, 1);
    try {
      expect([m.cols, m.rows, m.channels()]).toEqual([2, 1, 4]);
      expect(Array.from(m.ucharPtr(0, 1))).toEqual([4, 5, 6, 255]);
    } finally {
      m.delete();
    }
  });
});
