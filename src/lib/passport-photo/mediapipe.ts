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
  bgColor: string
): Promise<string> {
  const segmenter = await getSegmenter();
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const result = segmenter.segment(img);
  const mask = result.categoryMask;
  if (!mask) throw new Error("Segmentation failed");

  const maskData = mask.getAsUint8Array(); // 0 = background, non-zero = person (selfie segmenter)
  const mw = mask.width;
  const mh = mask.height;

  // Draw original image to canvas
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const px = imageData.data;

  // Parse bg color
  const bg = hexToRgb(bgColor);

  // Mask is mw x mh — map by ratio
  const sx = mw / w;
  const sy = mh / h;

  for (let y = 0; y < h; y++) {
    const my = Math.min(mh - 1, Math.floor(y * sy));
    for (let x = 0; x < w; x++) {
      const mx = Math.min(mw - 1, Math.floor(x * sx));
      const m = maskData[my * mw + mx];
      // Selfie segmenter: 0 = person, 255 = background (or vice versa per model).
      // Empirically for selfie_segmenter.tflite category mask, 0 == background.
      // We'll treat: if value >= 128 -> person (foreground keep), else bg replace.
      // Some builds invert; detect by checking center pixel later if needed.
      const isBackground = m < 128;
      if (isBackground) {
        const i = (y * w + x) * 4;
        px[i] = bg.r;
        px[i + 1] = bg.g;
        px[i + 2] = bg.b;
        px[i + 3] = 255;
      }
    }
  }

  // Heuristic: if the center pixel was treated as background (very unlikely for a portrait),
  // invert the mask interpretation.
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const centerIdx = (cy * w + cx) * 4;
  const centerWasReplaced =
    px[centerIdx] === bg.r &&
    px[centerIdx + 1] === bg.g &&
    px[centerIdx + 2] === bg.b;

  if (centerWasReplaced) {
    // Re-render inverted
    ctx.drawImage(img, 0, 0, w, h);
    const id2 = ctx.getImageData(0, 0, w, h);
    const p2 = id2.data;
    for (let y = 0; y < h; y++) {
      const my = Math.min(mh - 1, Math.floor(y * sy));
      for (let x = 0; x < w; x++) {
        const mx = Math.min(mw - 1, Math.floor(x * sx));
        const m = maskData[my * mw + mx];
        const isBackground = m >= 128; // inverted
        if (isBackground) {
          const i = (y * w + x) * 4;
          p2[i] = bg.r;
          p2[i + 1] = bg.g;
          p2[i + 2] = bg.b;
          p2[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(id2, 0, 0);
  } else {
    ctx.putImageData(imageData, 0, 0);
  }

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
