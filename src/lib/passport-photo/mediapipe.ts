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
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SEGMENTER_MODEL, delegate: "GPU" },
        runningMode: "IMAGE",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
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

/**
 * Replace background of a loaded HTMLImageElement with a solid color.
 * Returns a new data URL (JPEG).
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
  const mask = result.categoryMask;
  if (!mask) throw new Error("Segmentation failed");

  const maskData = mask.getAsUint8Array();
  const mw = mask.width;
  const mh = mask.height;

  // Detect mask polarity by sampling center (likely person) vs corners (likely bg)
  const centerVal = maskData[Math.floor(mh / 2) * mw + Math.floor(mw / 2)];
  const cornerVal =
    (maskData[0] +
      maskData[mw - 1] +
      maskData[(mh - 1) * mw] +
      maskData[mh * mw - 1]) /
    4;
  // If center value < corner value, then lower = person (selfie segmenter default).
  const personIsLow = centerVal < cornerVal;

  // Build a Float32 person-probability map at mask resolution: 1 = person, 0 = bg
  const prob = new Float32Array(mw * mh);
  for (let i = 0; i < prob.length; i++) {
    const v = maskData[i] / 255;
    prob[i] = personIsLow ? 1 - v : v;
  }

  // Edge-refinement params
  const erodeRadius = edgeRefinement < 35 ? 1 : edgeRefinement < 70 ? 2 : 3;
  const featherPasses = edgeRefinement > 75 ? 1 : 2;
  const alphaBase = Math.max(0.1, 0.35 - edgeRefinement * 0.002);
  const alphaDiv  = Math.max(0.08, 0.35 - edgeRefinement * 0.0025);

  // Erode: shrink the mask inward to clip hair/shoulder halos.
  // Higher refinement = larger erosion radius.
  let eroded = new Float32Array(prob);
  for (let pass = 0; pass < erodeRadius; pass++) {
    const src = eroded;
    const dst = new Float32Array(mw * mh);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        let minV = 1;
        for (let dy = -erodeRadius; dy <= erodeRadius; dy++) {
          for (let dx = -erodeRadius; dx <= erodeRadius; dx++) {
            const nx = Math.min(mw - 1, Math.max(0, x + dx));
            const ny = Math.min(mh - 1, Math.max(0, y + dy));
            const v = src[ny * mw + nx];
            if (v < minV) minV = v;
          }
        }
        dst[y * mw + x] = minV;
      }
    }
    eroded = dst;
  }

  // Box-blur (3x3) for soft feather; fewer passes when refinement is high
  const blur = (src: Float32Array): Float32Array => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        let s = 0;
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
            s += src[ny * mw + nx];
            c++;
          }
        }
        out[y * mw + x] = s / c;
      }
    }
    return out;
  };
  let soft = eroded;
  for (let i = 0; i < featherPasses; i++) {
    soft = blur(soft);
  }

  // Draw original
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const px = imageData.data;

  const bg = hexToRgb(bgColor);

  // Bilinear sample + alpha blend (decontaminates edges)
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * (mh - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(mh - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * (mw - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(mw - 1, x0 + 1);
      const wx = fx - x0;
      const a =
        soft[y0 * mw + x0] * (1 - wx) * (1 - wy) +
        soft[y0 * mw + x1] * wx * (1 - wy) +
        soft[y1 * mw + x0] * (1 - wx) * wy +
        soft[y1 * mw + x1] * wx * wy;

      // Steepen the curve a bit so soft fringe pulls toward bg
      const a2 = Math.max(0, Math.min(1, (a - 0.35) / 0.35));

      const i = (y * w + x) * 4;
      px[i] = px[i] * a2 + bg.r * (1 - a2);
      px[i + 1] = px[i + 1] * a2 + bg.g * (1 - a2);
      px[i + 2] = px[i + 2] * a2 + bg.b * (1 - a2);
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
