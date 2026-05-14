import { getFaceDetector } from "./mediapipe";

/* ─────────────── Adjustment helpers ─────────────── */

export interface Adjustments {
  brightness: number; // 0..200 (100 = none)
  contrast: number;   // 0..200
  saturation: number; // 0..200
  warmth: number;     // -100..100 (sepia / cool)
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
};

/**
 * Build a CSS filter string used both for live <img> preview and
 * canvas ctx.filter when baking the crop.
 */
export function buildCSSFilter(a: Adjustments): string {
  const parts: string[] = [
    `brightness(${a.brightness}%)`,
    `contrast(${a.contrast}%)`,
    `saturate(${a.saturation}%)`,
  ];
  if (a.warmth > 0) {
    // Warm: light sepia + slight hue toward red.
    parts.push(`sepia(${(a.warmth / 100) * 0.4})`);
  } else if (a.warmth < 0) {
    // Cool: hue rotate toward blue.
    parts.push(`hue-rotate(${(a.warmth / 100) * -20}deg)`);
  }
  return parts.join(" ");
}

/* ─────────────── Filter presets ─────────────── */

export interface FilterPreset {
  id: string;
  label: string;
  adjustments: Adjustments;
  sharpness?: number; // 0..100 baked separately when cropping
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: "original", label: "Original", adjustments: DEFAULT_ADJUSTMENTS },
  { id: "bright",   label: "Bright",   adjustments: { brightness: 112, contrast: 105, saturation: 105, warmth: 5 } },
  { id: "vivid",    label: "Vivid",    adjustments: { brightness: 105, contrast: 115, saturation: 135, warmth: 0 }, sharpness: 25 },
  { id: "warm",     label: "Warm",     adjustments: { brightness: 105, contrast: 105, saturation: 110, warmth: 35 } },
  { id: "cool",     label: "Cool",     adjustments: { brightness: 102, contrast: 105, saturation: 105, warmth: -30 } },
  { id: "soft",     label: "Soft",     adjustments: { brightness: 108, contrast: 92, saturation: 95, warmth: 8 } },
  { id: "studio",   label: "Studio",   adjustments: { brightness: 108, contrast: 110, saturation: 102, warmth: 5 }, sharpness: 35 },
  { id: "bw",       label: "B&W",      adjustments: { brightness: 108, contrast: 115, saturation: 0, warmth: 0 } },
];

/* ─────────────── Auto lighting (auto-levels) ─────────────── */

/**
 * Apply auto white-balance + histogram stretching for cleaner exposure.
 * Returns a new JPEG data URL.
 */
export async function autoLighting(img: HTMLImageElement): Promise<string> {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Build a luma histogram, clip 0.5% tails, then stretch.
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const y = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    hist[Math.min(255, y | 0)]++;
  }
  const total = (px.length / 4);
  const clip = total * 0.005;
  let sum = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { sum += hist[i]; if (sum > clip) { lo = i; break; } }
  sum = 0;
  for (let i = 255; i >= 0; i--) { sum += hist[i]; if (sum > clip) { hi = i; break; } }
  if (hi - lo < 32) { lo = 0; hi = 255; }
  const scale = 255 / (hi - lo);

  // Gray-world white balance: nudge each channel so means align.
  let rs = 0, gs = 0, bs = 0;
  for (let i = 0; i < px.length; i += 4) { rs += px[i]; gs += px[i + 1]; bs += px[i + 2]; }
  const n = total;
  const rm = rs / n, gm = gs / n, bm = bs / n;
  const avg = (rm + gm + bm) / 3;
  const rGain = avg / Math.max(1, rm);
  const gGain = avg / Math.max(1, gm);
  const bGain = avg / Math.max(1, bm);
  // Limit gain to avoid color shifts that look unnatural.
  const cap = (v: number) => Math.max(0.85, Math.min(1.15, v));
  const rG = cap(rGain), gG = cap(gGain), bG = cap(bGain);

  for (let i = 0; i < px.length; i += 4) {
    const r = (px[i]     - lo) * scale * rG;
    const g = (px[i + 1] - lo) * scale * gG;
    const b = (px[i + 2] - lo) * scale * bG;
    px[i]     = r < 0 ? 0 : r > 255 ? 255 : r;
    px[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    px[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }

  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.95);
}

/* ─────────────── Skin smoothing (light bilateral-ish) ─────────────── */

/**
 * Smooth skin tones by blending a softly blurred copy back in only on
 * pixels whose color falls in a generous skin range. Strength 0..100.
 */
export async function smoothSkin(
  img: HTMLImageElement,
  strength = 50
): Promise<string> {
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // 1. Original
  const c1 = document.createElement("canvas");
  c1.width = w; c1.height = h;
  const ctx1 = c1.getContext("2d")!;
  ctx1.drawImage(img, 0, 0);
  const orig = ctx1.getImageData(0, 0, w, h).data;

  // 2. Blurred copy (CSS blur via canvas filter — fast, hardware accelerated)
  const c2 = document.createElement("canvas");
  c2.width = w; c2.height = h;
  const ctx2 = c2.getContext("2d")!;
  const blurR = Math.max(1, Math.round(Math.min(w, h) * 0.004));
  ctx2.filter = `blur(${blurR}px)`;
  ctx2.drawImage(img, 0, 0);
  ctx2.filter = "none";
  const blurred = ctx2.getImageData(0, 0, w, h).data;

  const out = ctx1.getImageData(0, 0, w, h);
  const px = out.data;
  const mix = Math.max(0, Math.min(1, strength / 100)) * 0.85;

  for (let i = 0; i < px.length; i += 4) {
    const r = orig[i], g = orig[i + 1], b = orig[i + 2];
    // Generous skin-tone test (works across tones).
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const isSkin =
      r > 60 && g > 30 && b > 15 &&
      r > b && r >= g - 15 &&
      max - min > 10 && max - min < 130;
    if (isSkin) {
      px[i]     = r * (1 - mix) + blurred[i]     * mix;
      px[i + 1] = g * (1 - mix) + blurred[i + 1] * mix;
      px[i + 2] = b * (1 - mix) + blurred[i + 2] * mix;
    }
  }
  ctx1.putImageData(out, 0, 0);
  return c1.toDataURL("image/jpeg", 0.95);
}

/* ─────────────── Auto tilt fix (rotate so eyes are level) ─────────────── */

/**
 * Detects the face and uses the eye keypoints to compute the head tilt
 * angle, then returns a rotated JPEG data URL with the eye line horizontal.
 * Returns null if no face / keypoints are found.
 */
export async function autoFixTilt(img: HTMLImageElement): Promise<string | null> {
  const detector = await getFaceDetector();
  const result = detector.detect(img);
  const det = result.detections?.[0];
  if (!det || !det.keypoints || det.keypoints.length < 2) return null;
  // BlazeFace keypoint order: 0 = right eye, 1 = left eye (mirrored from viewer).
  const k0 = det.keypoints[0];
  const k1 = det.keypoints[1];
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const dx = (k1.x - k0.x) * w;
  const dy = (k1.y - k0.y) * h;
  const angle = Math.atan2(dy, dx); // radians
  const deg = (angle * 180) / Math.PI;
  // If essentially level, no-op.
  if (Math.abs(deg) < 0.5) return null;
  return rotateImage(img, -deg);
}

/** Rotate an image by `deg` degrees, expanding canvas to fit. */
export async function rotateImage(img: HTMLImageElement, deg: number): Promise<string> {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const newW = Math.round(w * cos + h * sin);
  const newH = Math.round(w * sin + h * cos);
  const canvas = document.createElement("canvas");
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas.toDataURL("image/jpeg", 0.95);
}

/* ─────────────── Unsharp mask (sharpness) ─────────────── */

/**
 * Apply unsharp mask in-place on the given canvas. amount 0..100.
 * Operates on the full canvas — call once after drawing the cropped photo.
 */
export function applySharpness(canvas: HTMLCanvasElement, amount: number) {
  if (amount <= 0) return;
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  const src = ctx.getImageData(0, 0, w, h);
  const data = src.data;

  // Build a blurred copy via a second canvas with CSS blur filter.
  const blurC = document.createElement("canvas");
  blurC.width = w; blurC.height = h;
  const blurCtx = blurC.getContext("2d")!;
  blurCtx.filter = "blur(1.2px)";
  blurCtx.drawImage(canvas, 0, 0);
  const blurred = blurCtx.getImageData(0, 0, w, h).data;

  const k = amount / 50; // 0..2
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c] + (data[i + c] - blurred[i + c]) * k;
      data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  ctx.putImageData(src, 0, 0);
}
