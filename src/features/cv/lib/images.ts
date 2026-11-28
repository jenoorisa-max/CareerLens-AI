// CV page images: resize/compress in the browser (canvas, no library) and a
// quality check that warns about blurry, very small or blank pages. The maths
// is in pure functions so it can be unit-tested; prepareImage() is the
// browser-only part.

/** Long edge after resizing: sharp enough for text, small enough to send. */
export const IMAGE_MAX_EDGE = 1600;
/** Below this long edge, small text is often unreadable. */
export const IMAGE_MIN_EDGE = 900;
/** Laplacian variance below this (on the analysis copy) suggests blur. */
export const BLUR_THRESHOLD = 40;
/** Brightness standard deviation below this suggests an empty page. */
export const BLANK_THRESHOLD = 6;
const ANALYSIS_WIDTH = 640;

export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** RGBA pixels -> brightness (0–255) per pixel. */
export function toGrayscale(rgba: Uint8ClampedArray | Uint8Array, pixels: number): Float32Array {
  const gray = new Float32Array(pixels);
  for (let i = 0; i < pixels; i++) gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  return gray;
}

/**
 * Variance of the Laplacian (a standard sharpness measure): sharp text has
 * strong edges and a high variance, a blurred page a low one.
 */
export function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += v; sumSq += v * v; n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function standardDeviation(gray: Float32Array): number {
  let sum = 0, sumSq = 0;
  for (const v of gray) { sum += v; sumSq += v * v; }
  const mean = sum / gray.length;
  return Math.sqrt(Math.max(0, sumSq / gray.length - mean * mean));
}

export type ImageWarning = "blurry" | "low-resolution" | "blank";

export const IMAGE_WARNING_TEXT: Record<ImageWarning, string> = {
  blurry: "This page looks blurry. Text may not be read correctly — a sharper photo or a screenshot will give better results.",
  "low-resolution": "This image is quite small. Small text may not be readable — use a larger photo or screenshot if you can.",
  blank: "This page looks almost empty. Please check that you selected the right image.",
};

export function assessImage(metrics: { width: number; height: number; sharpness: number; contrast: number }): ImageWarning[] {
  const warnings: ImageWarning[] = [];
  if (metrics.contrast < BLANK_THRESHOLD) return ["blank"];
  if (Math.max(metrics.width, metrics.height) < IMAGE_MIN_EDGE) warnings.push("low-resolution");
  if (metrics.sharpness < BLUR_THRESHOLD) warnings.push("blurry");
  return warnings;
}

/** JPEG quality steps used until the page fits its share of the upload budget. */
export const JPEG_QUALITIES = [0.85, 0.75, 0.65] as const;

export interface PreparedImage {
  /** base64 JPEG without a data: prefix */
  data: string;
  mimeType: "image/jpeg";
  bytes: number;
  width: number;
  height: number;
  warnings: ImageWarning[];
  previewUrl: string;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality)
  );
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Browser only: decodes the photo (EXIF rotation applied), resizes it to at
 * most IMAGE_MAX_EDGE, encodes it as JPEG within `targetBytes`, and measures
 * sharpness/contrast on a small grayscale copy.
 */
export async function prepareImage(file: Blob, targetBytes: number): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const size = fitWithin(bitmap.width, bitmap.height, IMAGE_MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.fillStyle = "#ffffff"; // transparent PNG areas become white, not black
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);

    let blob = await canvasToBlob(canvas, JPEG_QUALITIES[0]);
    for (const q of JPEG_QUALITIES.slice(1)) {
      if (blob.size <= targetBytes) break;
      blob = await canvasToBlob(canvas, q);
    }

    const small = fitWithin(size.width, size.height, ANALYSIS_WIDTH);
    const probe = document.createElement("canvas");
    probe.width = small.width;
    probe.height = small.height;
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    if (!pctx) throw new Error("canvas unavailable");
    pctx.drawImage(canvas, 0, 0, small.width, small.height);
    const gray = toGrayscale(pctx.getImageData(0, 0, small.width, small.height).data, small.width * small.height);

    return {
      data: await blobToBase64(blob),
      mimeType: "image/jpeg",
      bytes: blob.size,
      width: bitmap.width,
      height: bitmap.height,
      warnings: assessImage({ width: bitmap.width, height: bitmap.height, sharpness: laplacianVariance(gray, small.width, small.height), contrast: standardDeviation(gray) }),
      previewUrl: URL.createObjectURL(blob),
    };
  } finally {
    bitmap.close();
  }
}
