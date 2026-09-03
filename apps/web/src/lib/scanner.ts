/**
 * Browser side of scanning: photos in, flattened page images out, pages into one PDF. OpenCV.js is a
 * 13 MB script, so it is shipped as a static asset (not bundled) and loaded only when the first photo
 * arrives; jsPDF is a lazy chunk for the same reason. The image maths itself is in paper.ts.
 */
import type { CV } from "@techstark/opencv-js";
import opencvUrl from "@techstark/opencv-js/dist/opencv.js?url";
import { findPaper, matFromRgba, warpPaper, whiten, type Mat } from "./paper.js";
import { fitOnPage, pageFormat } from "./scan.js";

/** Longest side kept for a page; enough for legible print at letter size without a 4 MB JPEG. */
const PAGE_MAX = 2000;
const JPEG_QUALITY = 0.85;

export type PageMode = "scan" | "color" | "photo";
export interface PageImage {
  dataUrl: string;
  width: number;
  height: number;
}
export interface ScanResult {
  /** The photo as taken (EXIF orientation applied, downscaled). */
  photo: PageImage;
  /** Cropped and flattened, colours kept — same as `photo` when no page was found. */
  color: PageImage;
  /** Cropped, flattened and whitened: the "scan". */
  scan: PageImage;
  /** Whether a page outline was found; false means the whole photo was kept. */
  cropped: boolean;
}

let cvReady: Promise<CV> | undefined;

/** Load OpenCV.js once. The UMD build parks a ready-promise on `globalThis.cv`. */
export function loadCv(): Promise<CV> {
  cvReady ??= new Promise<CV>((resolve, reject) => {
    const g = globalThis as { cv?: CV | PromiseLike<CV> };
    const settle = () => Promise.resolve(g.cv as PromiseLike<CV>).then(resolve, reject);
    if (g.cv) return settle();
    const s = document.createElement("script");
    s.src = opencvUrl;
    s.async = true;
    s.onload = settle;
    s.onerror = () => reject(new Error("Could not load the document scanner (OpenCV.js)"));
    document.head.appendChild(s);
  }).catch((e: unknown) => {
    cvReady = undefined; // let the next attempt retry
    throw e;
  });
  return cvReady;
}

/** Decode a photo with its EXIF rotation applied and shrink it to PAGE_MAX on the long side. */
export async function decodePhoto(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, PAGE_MAX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

function toPageImage(canvas: HTMLCanvasElement): PageImage {
  return { dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY), width: canvas.width, height: canvas.height };
}

function matToPageImage(mat: Mat): PageImage {
  const canvas = document.createElement("canvas");
  canvas.width = mat.cols;
  canvas.height = mat.rows;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(mat.data), mat.cols, mat.rows), 0, 0);
  return toPageImage(canvas);
}

/** One photo → the three renderings a page can be shown as. */
export async function scanPhoto(file: Blob): Promise<ScanResult> {
  const canvas = await decodePhoto(file);
  const photo = toPageImage(canvas);
  const cv = await loadCv();
  const { data, width, height } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
  const src = matFromRgba(cv, data, width, height);
  let page: Mat | null = null;
  let flat: Mat | null = null;
  try {
    const quad = findPaper(cv, src);
    page = quad ? warpPaper(cv, src, quad) : src;
    flat = whiten(cv, page);
    return { photo, color: quad ? matToPageImage(page) : photo, scan: matToPageImage(flat), cropped: Boolean(quad) };
  } finally {
    flat?.delete();
    if (page && page !== src) page.delete();
    src.delete();
  }
}

/** Every page on its own letter-size sheet, oriented like the scan. */
export async function buildPdf(pages: PageImage[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const first = pageFormat(pages[0]?.width ?? 1, pages[0]?.height ?? 1);
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: first.orientation, compress: true });
  pages.forEach((p, i) => {
    const fmt = pageFormat(p.width, p.height);
    if (i > 0) doc.addPage("letter", fmt.orientation);
    const r = fitOnPage(p.width, p.height, fmt.width, fmt.height);
    doc.addImage(p.dataUrl, "JPEG", r.x, r.y, r.width, r.height, undefined, "FAST");
  });
  return doc.output("blob");
}

/** Whether this browser can hand a PDF to another app (Mail, Gmail, Files) through the share sheet. */
export function canShareFiles(): boolean {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [new File([new Uint8Array([37, 80, 68, 70])], "x.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
}

export async function sharePdf(pdf: Blob, filename: string, title: string, text: string): Promise<void> {
  await navigator.share({ files: [new File([pdf], filename, { type: "application/pdf" })], title, text });
}

/** Plain download for browsers without a share sheet (desktop). */
export function downloadPdf(pdf: Blob, filename: string): void {
  const url = URL.createObjectURL(pdf);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
