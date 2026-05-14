import {
  FilesetResolver,
  ImageSegmenter,
  FaceDetector,
  type Detection,
} from "@mediapipe/tasks-vision";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const SEGMENTER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const FACE_DETECTOR_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";

let segmenterPromise: Promise<ImageSegmenter> | null = null;
let faceDetectorPromise: Promise<FaceDetector> | null = null;

async function getVisionFileset() {
  return FilesetResolver.forVisionTasks(WASM_BASE);
}

export async function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const fileset = await getVisionFileset();
      // Confidence masks give a smooth Float32 probability per pixel,
      // which produces dramatically cleaner edges than the binary
      // category mask (especially around hair).
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SEGMENTER_MODEL, delegate: "GPU" },
        runningMode: "IMAGE",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    })();
  }
  return segmenterPromise;
}

export async function getFaceDetector() {
  if (!faceDetectorPromise) {
    faceDetectorPromise = (async () => {
      const fileset = await getVisionFileset();
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_DETECTOR_MODEL, delegate: "GPU" },
        runningMode: "IMAGE",
      });
    })();
  }
  return faceDetectorPromise;
}

/* ──────────── Fast image-processing helpers ──────────── */

// Separable horizontal/vertical box blur — O(w*h) per pass, vs O(w*h*r²)
// for a naive 2D blur. Two box passes ≈ a Gaussian.
function boxBlurH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const inv = 1 / (r * 2 + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      dst[row + x] = sum * inv;
      const xAdd = Math.min(w - 1, x + r + 1);
      const xSub = Math.max(0, x - r);
      sum += src[row + xAdd] - src[row + xSub];
    }
  }
}

function boxBlurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const inv = 1 / (r * 2 + 1);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += src[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum * inv;
      const yAdd = Math.min(h - 1, y + r + 1);
      const ySub = Math.max(0, y - r);
      sum += src[yAdd * w + x] - src[ySub * w + x];
    }
  }
}

function gaussianBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius < 1) return src;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  boxBlurH(src, tmp, w, h, radius);
  boxBlurV(tmp, out, w, h, radius);
  return out;
}

// Separable min-filter (erosion) — O(w*h*r) total instead of O(w*h*r²).
function erodeSep(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src;
  const tmp = new Float32Array(src.length);
  // horizontal min
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 1;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let i = x0; i <= x1; i++) {
        const v = src[row + i];
        if (v < m) m = v;
      }
      tmp[row + x] = m;
    }
  }
  const out = new Float32Array(src.length);
  // vertical min
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 1;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let i = y0; i <= y1; i++) {
        const v = tmp[i * w + x];
        if (v < m) m = v;
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

/**
 * Replace background of a loaded HTMLImageElement with a solid color.
 * Returns a JPEG data URL.
 *
 * Pipeline (operates on the small mediapipe mask, then upsamples):
 *   1. Read confidence mask (smooth Float32 probability per pixel).
 *   2. Detect polarity (which class is the person).
 *   3. Light Gaussian smoothing of the probability field.
 *   4. Optional erosion to clip halos when edgeRefinement is high.
 *   5. Sigmoid-like remap to crush soft fringe pixels toward 0/1.
 *   6. Bilinear upsample + per-channel composite onto the bg color.
 */
export async function removeBackground(
  img: HTMLImageElement,
  bgColor: string,
  edgeRefinement = 50
): Promise<string> {
  const segmenter = await getSegmenter();
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const result = segmenter.segment(img);
  const masks = result.confidenceMasks;
  if (!masks || !masks.length) throw new Error("Segmentation failed");
  const mask = masks[0];

  const maskData = mask.getAsFloat32Array();
  const mw = mask.width;
  const mh = mask.height;

  // Detect polarity: confidence mask convention varies by model build.
  // Sample center vs corners — whichever is higher is the foreground class.
  const cIdx = Math.floor(mh / 2) * mw + Math.floor(mw / 2);
  const centerVal = maskData[cIdx];
  const cornerVal =
    (maskData[0] +
      maskData[mw - 1] +
      maskData[(mh - 1) * mw] +
      maskData[mh * mw - 1]) /
    4;
  const personIsHigh = centerVal >= cornerVal;

  // Build a person-probability field (1 = person, 0 = bg).
  const prob = new Float32Array(mw * mh);
  if (personIsHigh) {
    for (let i = 0; i < prob.length; i++) prob[i] = maskData[i];
  } else {
    for (let i = 0; i < prob.length; i++) prob[i] = 1 - maskData[i];
  }

  // Edge-refinement parameters.
  // Higher refinement -> stronger erosion + sharper sigmoid.
  const ref = Math.max(0, Math.min(100, edgeRefinement));
  const erodeR = ref < 25 ? 0 : ref < 60 ? 1 : ref < 85 ? 2 : 3;
  // A small Gaussian blur smooths jagged segmenter edges before remap.
  const blurR = ref > 80 ? 1 : 2;
  // Sigmoid steepness — rises with refinement so soft fringe collapses.
  const k = 6 + ref * 0.18; // 6..24
  const t = 0.5; // midpoint

  let field = prob;
  if (erodeR > 0) field = erodeSep(field, mw, mh, erodeR);
  field = gaussianBlur(field, mw, mh, blurR);

  // Sigmoid remap: crushes fringe alpha toward 0 or 1 in one pass.
  const alpha = new Float32Array(mw * mh);
  for (let i = 0; i < alpha.length; i++) {
    const v = 1 / (1 + Math.exp(-k * (field[i] - t)));
    alpha[i] = v;
  }

  // Composite onto the bg color at full image resolution with bilinear sampling.
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const px = imageData.data;
  const bg = hexToRgb(bgColor);

  const sx = (mw - 1) / w;
  const sy = (mh - 1) / h;

  for (let y = 0; y < h; y++) {
    const fy = y * sy;
    const y0 = Math.floor(fy);
    const y1 = Math.min(mh - 1, y0 + 1);
    const wy = fy - y0;
    const row0 = y0 * mw;
    const row1 = y1 * mw;
    for (let x = 0; x < w; x++) {
      const fx = x * sx;
      const x0 = Math.floor(fx);
      const x1 = Math.min(mw - 1, x0 + 1);
      const wx = fx - x0;

      const a =
        alpha[row0 + x0] * (1 - wx) * (1 - wy) +
        alpha[row0 + x1] * wx * (1 - wy) +
        alpha[row1 + x0] * (1 - wx) * wy +
        alpha[row1 + x1] * wx * wy;

      const inv = 1 - a;
      const i = (y * w + x) * 4;
      px[i]     = px[i]     * a + bg.r * inv;
      px[i + 1] = px[i + 1] * a + bg.g * inv;
      px[i + 2] = px[i + 2] * a + bg.b * inv;
      px[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  mask.close();

  return canvas.toDataURL("image/jpeg", 0.95);
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function detectFace(img: HTMLImageElement): Promise<FaceBox | null> {
  const detector = await getFaceDetector();
  const result = detector.detect(img);
  const detections: Detection[] = result.detections || [];
  if (!detections.length) return null;
  // Pick largest face
  let best = detections[0].boundingBox!;
  for (const d of detections) {
    const bb = d.boundingBox!;
    if (bb.width * bb.height > best.width * best.height) best = bb;
  }
  return {
    x: best.originX,
    y: best.originY,
    width: best.width,
    height: best.height,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace("#", "");
  const v =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  const num = parseInt(v, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
