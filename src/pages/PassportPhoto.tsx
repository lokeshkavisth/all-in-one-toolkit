import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Camera, Download, Plus, Minus, RotateCw, ZoomIn, ZoomOut, Crop, Move, Printer, Sparkles, ScanFace, Loader2, Undo2, Wand2, Sun, Smile, RefreshCw, Ruler, SlidersHorizontal } from "lucide-react";
import { removeBackground, detectFace } from "@/lib/passport-photo/mediapipe";
import {
  autoLighting,
  smoothSkin,
  autoFixTilt,
  buildCSSFilter,
  applySharpness,
  FILTER_PRESETS,
  DEFAULT_ADJUSTMENTS,
  type Adjustments,
} from "@/lib/passport-photo/enhance";
import { ToolPageLayout } from "@/components/ToolPageLayout";
import { FileUploader } from "@/components/FileUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

/* ──── Unit helpers ──── */
type SizeUnit = "inch" | "mm" | "px";

const MM_PER_INCH = 25.4;
const DPI = 300;
const MM_TO_PX = DPI / MM_PER_INCH;

function toMM(value: number, unit: SizeUnit): number {
  switch (unit) {
    case "mm": return value;
    case "inch": return value * MM_PER_INCH;
    case "px": return value / MM_TO_PX;
  }
}

function fromMM(mm: number, unit: SizeUnit): number {
  switch (unit) {
    case "mm": return Math.round(mm * 100) / 100;
    case "inch": return Math.round((mm / MM_PER_INCH) * 1000) / 1000;
    case "px": return Math.round(mm * MM_TO_PX);
  }
}

function unitLabel(unit: SizeUnit): string {
  return unit;
}

/* ──── Passport size presets (w×h in mm) ──── */
interface PhotoPreset {
  id: string;
  label: string;
  wMM: number;
  hMM: number;
}

const PHOTO_PRESETS: PhotoPreset[] = [
  { id: "us", label: "US (2×2 in)", wMM: 50.8, hMM: 50.8 },
  { id: "uk", label: "UK/EU (35×45 mm)", wMM: 35, hMM: 45 },
  { id: "india", label: "India (51×51 mm)", wMM: 51, hMM: 51 },
  { id: "schengen", label: "Schengen (35×45 mm)", wMM: 35, hMM: 45 },
  { id: "canada", label: "Canada (50×70 mm)", wMM: 50, hMM: 70 },
  { id: "china", label: "China (33×48 mm)", wMM: 33, hMM: 48 },
  { id: "japan", label: "Japan (35×45 mm)", wMM: 35, hMM: 45 },
  { id: "australia", label: "Australia (35×45 mm)", wMM: 35, hMM: 45 },
  { id: "emitra", label: "E-Mitra (1.30×1.60 in)", wMM: 1.30 * MM_PER_INCH, hMM: 1.60 * MM_PER_INCH },
  { id: "custom", label: "Custom Size", wMM: 35, hMM: 45 },
];

/* ──── Page sizes (w×h in mm) ──── */
interface PageSize {
  id: string;
  label: string;
  wMM: number;
  hMM: number;
}

const PAGE_SIZES: PageSize[] = [
  { id: "a4", label: "A4 (210×297 mm)", wMM: 210, hMM: 297 },
  { id: "4x6", label: "4×6 inches", wMM: 101.6, hMM: 152.4 },
  { id: "6x4", label: "6×4 inches", wMM: 152.4, hMM: 101.6 },
];

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function isValidHexColor(value: string) {
  return /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value);
}

type CropMode = "pan" | "select";

/* ──── Per-user settings persistence (localStorage) ──── */
const SETTINGS_KEY = "passport-photo.settings.v1";

interface PersistedSettings {
  sizeUnit: SizeUnit;
  presetId: string;
  customW: number;
  customH: number;
  pageSizeId: string;
  quantity: number;
  showCutLines: boolean;
  borderEnabled: boolean;
  borderColor: string;
  borderThicknessPx: number;
  customCols: number;
  customRows: number;
  gapMM: number;
  marginMM: number;
  bgReplaceColor: string;
  edgeRefinement: number;
}

function loadSettings(): Partial<PersistedSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
const SAVED = loadSettings();
const pick = <K extends keyof PersistedSettings>(key: K, fallback: PersistedSettings[K]): PersistedSettings[K] =>
  (SAVED[key] !== undefined ? (SAVED[key] as PersistedSettings[K]) : fallback);


export default function PassportPhoto() {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Unit
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>(pick("sizeUnit", "inch"));

  // Image state
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 });

  // Crop state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [offsetStart, setOffsetStart] = useState({ x: 0, y: 0 });
  const [cropMode, setCropMode] = useState<CropMode>("pan");

  // Manual crop selection state
  const [selectBox, setSelectBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [selectStart, setSelectStart] = useState<{ x: number; y: number } | null>(null);

  // Settings (persisted)
  const [presetId, setPresetId] = useState(pick("presetId", "us"));
  const [customW, setCustomW] = useState(pick("customW", 35));
  const [customH, setCustomH] = useState(pick("customH", 45));
  const [pageSizeId, setPageSizeId] = useState(pick("pageSizeId", "a4"));
  const [quantity, setQuantity] = useState(pick("quantity", 8));
  const [showCutLines, setShowCutLines] = useState(pick("showCutLines", true));

  // Border settings (persisted)
  const [borderEnabled, setBorderEnabled] = useState(pick("borderEnabled", true));
  const [borderColor, setBorderColor] = useState(pick("borderColor", "#000000"));
  const [borderThicknessPx, setBorderThicknessPx] = useState(pick("borderThicknessPx", 3));

  // Layout controls (persisted)
  const [customCols, setCustomCols] = useState(pick("customCols", 5));
  const [customRows, setCustomRows] = useState(pick("customRows", 0));
  const [gapMM, setGapMM] = useState(pick("gapMM", 4));
  const [marginMM, setMarginMM] = useState(pick("marginMM", 5));

  // Result
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);
  const [step, setStep] = useState<"crop" | "layout">("crop");

  // AI features (MediaPipe, runs fully in-browser via WASM)
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [bgRemoved, setBgRemoved] = useState(false);
  const [bgReplaceColor, setBgReplaceColor] = useState(pick("bgReplaceColor", "#FFFFFF"));
  const [edgeRefinement, setEdgeRefinement] = useState(pick("edgeRefinement", 50));
  const [aiBusy, setAiBusy] = useState<null | "bg" | "align" | "tilt" | "light" | "skin">(null);
  const lastAppliedBgSettingsRef = useRef<{
    color: string;
    edgeRefinement: number;
  } | null>(null);

  // Persist settings whenever they change.
  useEffect(() => {
    const settings: PersistedSettings = {
      sizeUnit, presetId, customW, customH, pageSizeId, quantity, showCutLines,
      borderEnabled, borderColor, borderThicknessPx,
      customCols, customRows, gapMM, marginMM,
      bgReplaceColor, edgeRefinement,
    };
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* quota / private mode — ignore */
    }
  }, [
    sizeUnit, presetId, customW, customH, pageSizeId, quantity, showCutLines,
    borderEnabled, borderColor, borderThicknessPx,
    customCols, customRows, gapMM, marginMM,
    bgReplaceColor, edgeRefinement,
  ]);

  // Enhancement / filters
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [sharpness, setSharpness] = useState(0); // 0..100, baked at crop time
  const [activePresetId, setActivePresetId] = useState<string>("original");
  const cssFilter = useMemo(() => buildCSSFilter(adjustments), [adjustments]);

  const presetData = PHOTO_PRESETS.find((p) => p.id === presetId)!;
  const preset = presetId === "custom"
    ? { ...presetData, wMM: toMM(customW, sizeUnit), hMM: toMM(customH, sizeUnit) }
    : presetData;
  const pageSize = PAGE_SIZES.find((p) => p.id === pageSizeId)!;

  // Auto-compute cols/rows based on page size and photo size
  const autoCols = Math.max(1, Math.floor((pageSize.wMM - 2 * marginMM + gapMM) / (preset.wMM + gapMM)));
  const autoRows = Math.max(1, Math.floor((pageSize.hMM - 2 * marginMM + gapMM) / (preset.hMM + gapMM)));
  const cols = customCols > 0 ? customCols : autoCols;
  const rows = customRows > 0 ? customRows : autoRows;
  const perPage = cols * rows;
  const totalPages = Math.ceil(quantity / perPage);

  // Auto-adjust cols/rows when page size changes
  useEffect(() => {
    setCustomCols(0);
    setCustomRows(0);
  }, [pageSizeId]);

  /* ──── Crop viewport dimensions ──── */
  const cropAspect = preset.wMM / preset.hMM;
  const CROP_DISPLAY_MAX = 360;
  let CROP_DISPLAY_W: number, CROP_DISPLAY_H: number;
  if (cropAspect >= 1) {
    CROP_DISPLAY_W = CROP_DISPLAY_MAX;
    CROP_DISPLAY_H = CROP_DISPLAY_MAX / cropAspect;
  } else {
    CROP_DISPLAY_H = CROP_DISPLAY_MAX;
    CROP_DISPLAY_W = CROP_DISPLAY_MAX * cropAspect;
  }

  // Base scale: fit image to cover crop area uniformly
  const baseScale = imageSize.w > 0
    ? Math.max(CROP_DISPLAY_W / imageSize.w, CROP_DISPLAY_H / imageSize.h)
    : 1;
  const zoom = baseScale * zoomLevel;

  /* ──── Load image ──── */
  const loadImage = useCallback((files: File[]) => {
    if (!files.length) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        setImageSrc(src);
        setOriginalImageSrc(src);
        setBgRemoved(false);
        lastAppliedBgSettingsRef.current = null;
        setImageSize({ w: img.width, h: img.height });
        setRotation(0);
        setCroppedUrl(null);
        setCroppedBlob(null);
        setStep("crop");
        setZoomLevel(1);
        setOffsetX(0);
        setOffsetY(0);
        setSelectBox(null);
        setAdjustments(DEFAULT_ADJUSTMENTS);
        setSharpness(0);
        setActivePresetId("original");
      };
      img.src = src;
    };
    reader.readAsDataURL(files[0]);
  }, []);

  /* ──── Helper: load a data URL into imgRef and update preview ──── */
  const swapImage = useCallback((src: string) => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        setImageSrc(src);
        setImageSize({ w: img.width, h: img.height });
        resolve();
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = src;
    });
  }, []);

  /* ──── AI: Remove Background (MediaPipe Image Segmenter) ──── */
  const handleRemoveBackground = useCallback(async (options?: { silent?: boolean }) => {
    if (!imgRef.current || !originalImageSrc) return;
    setAiBusy("bg");
    try {
      // Always start from the original to avoid re-segmenting a flat bg
      const baseImg = new Image();
      await new Promise<void>((res, rej) => {
        baseImg.onload = () => res();
        baseImg.onerror = () => rej(new Error("load failed"));
        baseImg.src = originalImageSrc;
      });
      const newSrc = await removeBackground(baseImg, bgReplaceColor, edgeRefinement);
      await swapImage(newSrc);
      setBgRemoved(true);
      lastAppliedBgSettingsRef.current = {
        color: bgReplaceColor.toUpperCase(),
        edgeRefinement,
      };
      if (!options?.silent) {
        toast({ title: "Background removed", description: "AI segmentation applied" });
      }
    } catch (err) {
      console.error(err);
      toast({
        title: "Background removal failed",
        description: err instanceof Error ? err.message : "Try a different photo",
        variant: "destructive",
      });
    } finally {
      setAiBusy(null);
    }
  }, [originalImageSrc, bgReplaceColor, edgeRefinement, swapImage, toast]);

  /* ──── AI: Restore original photo ──── */
  const handleRestoreOriginal = useCallback(async () => {
    if (!originalImageSrc) return;
    await swapImage(originalImageSrc);
    setBgRemoved(false);
    lastAppliedBgSettingsRef.current = null;
    toast({ title: "Original photo restored" });
  }, [originalImageSrc, swapImage, toast]);

  useEffect(() => {
    if (!bgRemoved || aiBusy !== null || !originalImageSrc || !isValidHexColor(bgReplaceColor)) {
      return;
    }

    const nextColor = bgReplaceColor.toUpperCase();
    const lastApplied = lastAppliedBgSettingsRef.current;

    if (
      lastApplied &&
      lastApplied.color === nextColor &&
      lastApplied.edgeRefinement === edgeRefinement
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void handleRemoveBackground({ silent: true });
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [bgRemoved, aiBusy, originalImageSrc, bgReplaceColor, edgeRefinement, handleRemoveBackground]);

  /* ──── AI: Auto-align face (MediaPipe Face Detector) ──── */
  const handleAutoAlign = useCallback(async () => {
    if (!imgRef.current) return;
    setAiBusy("align");
    try {
      const face = await detectFace(imgRef.current);
      if (!face) {
        toast({
          title: "No face detected",
          description: "Try a clearer, front-facing photo",
          variant: "destructive",
        });
        return;
      }
      // MediaPipe face bbox ≈ eyebrows→chin (~60% of full head). Frame the
      // shot so the face occupies ~34% of the crop height — that leaves
      // visible shoulders below and a small breathing gap above the head.
      const targetFaceFrac = 0.34;
      const targetCenterYFrac = 0.42;

      const desiredZoom = (CROP_DISPLAY_H * targetFaceFrac) / face.height;
      const newZoomLevel = clamp(desiredZoom / baseScale, 0.5, 4);
      const effectiveZoom = baseScale * newZoomLevel;

      const faceCx = face.x + face.width / 2;
      const faceCy = face.y + face.height / 2;

      // imgDisplayX (no offset) = CROP_W/2 - imgW*zoom/2
      // face center display X = imgDisplayX + faceCx*zoom + offsetX
      // want = CROP_W/2  =>  offsetX = imgW*zoom/2 - faceCx*zoom
      const newOffsetX = imageSize.w * effectiveZoom / 2 - faceCx * effectiveZoom;
      const newOffsetY =
        imageSize.h * effectiveZoom / 2 -
        faceCy * effectiveZoom +
        (targetCenterYFrac - 0.5) * CROP_DISPLAY_H;

      setRotation(0);
      setSelectBox(null);
      setCropMode("pan");
      setZoomLevel(newZoomLevel);
      setOffsetX(newOffsetX);
      setOffsetY(newOffsetY);
      toast({ title: "Face aligned", description: "Crop adjusted to passport guidelines" });
    } catch (err) {
      console.error(err);
      toast({
        title: "Face detection failed",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setAiBusy(null);
    }
  }, [imageSize, baseScale, CROP_DISPLAY_H, toast]);

  /* ──── Enhancement handlers ──── */
  const runEnhanceOnImage = useCallback(
    async (
      kind: "tilt" | "light" | "skin",
      processor: (img: HTMLImageElement) => Promise<string | null>
    ) => {
      if (!imgRef.current) return;
      setAiBusy(kind);
      try {
        const result = await processor(imgRef.current);
        if (!result) {
          toast({
            title: kind === "tilt" ? "No tilt detected" : "No changes applied",
            description: kind === "tilt" ? "Your photo already looks level" : "Try a different photo",
          });
          return;
        }
        await swapImage(result);
        // Reset bg-removed cache so re-applying bg re-runs on the new pixels.
        if (bgRemoved) lastAppliedBgSettingsRef.current = null;
        toast({
          title:
            kind === "tilt" ? "Head tilt corrected" :
            kind === "light" ? "Lighting fixed" :
            "Skin smoothed",
        });
      } catch (err) {
        console.error(err);
        toast({
          title: "Enhancement failed",
          description: err instanceof Error ? err.message : "Try again",
          variant: "destructive",
        });
      } finally {
        setAiBusy(null);
      }
    },
    [swapImage, toast, bgRemoved]
  );

  const handleAutoTilt = useCallback(
    () => runEnhanceOnImage("tilt", autoFixTilt),
    [runEnhanceOnImage]
  );
  const handleAutoLighting = useCallback(
    () => runEnhanceOnImage("light", async (img) => autoLighting(img)),
    [runEnhanceOnImage]
  );
  const handleSmoothSkin = useCallback(
    () => runEnhanceOnImage("skin", async (img) => smoothSkin(img, 60)),
    [runEnhanceOnImage]
  );

  const applyPreset = useCallback((id: string) => {
    const preset = FILTER_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setActivePresetId(id);
    setAdjustments(preset.adjustments);
    setSharpness(preset.sharpness ?? 0);
  }, []);

  const resetAdjustments = useCallback(() => {
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setSharpness(0);
    setActivePresetId("original");
  }, []);

  const updateAdjustment = useCallback(<K extends keyof Adjustments>(key: K, value: Adjustments[K]) => {
    setAdjustments((prev) => ({ ...prev, [key]: value }));
    setActivePresetId("");
  }, []);

  useEffect(() => {
    if (!imgRef.current) return;
    setZoomLevel(1);
    setOffsetX(0);
    setOffsetY(0);
    setSelectBox(null);
  }, [presetId, customW, customH]);

  /* ──── Drag to pan ──── */
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = cropContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (cropMode === "select") {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setSelectStart({ x, y });
      setSelectBox({ x, y, w: 0, h: 0 });
      setDragging(true);
    } else {
      setDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setOffsetStart({ x: offsetX, y: offsetY });
    }
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      if (cropMode === "select" && selectStart) {
        const rect = cropContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const x = Math.min(selectStart.x, cx);
        const y = Math.min(selectStart.y, cy);
        const w = Math.abs(cx - selectStart.x);
        const h = Math.abs(cy - selectStart.y);
        setSelectBox({ x, y, w, h });
      } else {
        setOffsetX(offsetStart.x + (e.clientX - dragStart.x));
        setOffsetY(offsetStart.y + (e.clientY - dragStart.y));
      }
    },
    [dragging, cropMode, selectStart, dragStart, offsetStart]
  );

  const handleMouseUp = () => {
    setDragging(false);
    setSelectStart(null);
  };

  /* ──── Mouse wheel zoom ──── */
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setZoomLevel((prev) => {
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      return clamp(prev + delta, 0.5, 4);
    });
  }, []);

  useEffect(() => {
    const el = cropContainerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel, imageSrc]);

  /* ──── Crop the photo ──── */
  const doCrop = useCallback(() => {
    if (!imgRef.current) return;
    const img = imgRef.current;

    const outW = Math.round(preset.wMM * MM_TO_PX);
    const outH = Math.round(preset.hMM * MM_TO_PX);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;
    // Bake brightness/contrast/saturation/warmth as a canvas filter
    // so the cropped output matches the live preview.
    ctx.filter = cssFilter;

    if (selectBox && selectBox.w > 5 && selectBox.h > 5) {
      const imgDisplayW = imageSize.w * zoom;
      const imgDisplayH = imageSize.h * zoom;
      const imgDisplayX = CROP_DISPLAY_W / 2 - imgDisplayW / 2 + offsetX;
      const imgDisplayY = CROP_DISPLAY_H / 2 - imgDisplayH / 2 + offsetY;

      const srcX = (selectBox.x - imgDisplayX) / zoom;
      const srcY = (selectBox.y - imgDisplayY) / zoom;
      const srcW = selectBox.w / zoom;
      const srcH = selectBox.h / zoom;

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
    } else {
      const scaleToOutput = outW / CROP_DISPLAY_W;
      const drawW = imageSize.w * zoom * scaleToOutput;
      const drawH = imageSize.h * zoom * scaleToOutput;
      const drawX = offsetX * scaleToOutput + (outW - drawW) / 2;
      const drawY = offsetY * scaleToOutput + (outH - drawH) / 2;

      ctx.save();
      ctx.translate(outW / 2, outH / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-outW / 2, -outH / 2);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.restore();
    }
    ctx.filter = "none";

    // Apply unsharp-mask sharpness to the baked crop.
    if (sharpness > 0) applySharpness(canvas, sharpness);

    // Draw border if enabled.
    // Use fillRect strips instead of strokeRect for pixel-perfect, fully
    // inside-canvas borders that render identically across Chrome, Safari,
    // Firefox, and Edge (some browsers offset stroke by half a pixel and
    // produce uneven edges, especially after ctx.filter use).
    if (borderEnabled && borderThicknessPx > 0) {
      const t = Math.min(borderThicknessPx, Math.floor(Math.min(outW, outH) / 2));
      ctx.fillStyle = borderColor;
      ctx.fillRect(0, 0, outW, t);                  // top
      ctx.fillRect(0, outH - t, outW, t);           // bottom
      ctx.fillRect(0, 0, t, outH);                  // left
      ctx.fillRect(outW - t, 0, t, outH);           // right
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCroppedBlob(blob);
        setCroppedUrl(URL.createObjectURL(blob));
        setStep("layout");
        toast({ title: "Photo cropped!", description: `${outW}×${outH} px at 300 DPI` });
      },
      "image/jpeg",
      0.95
    );
  }, [zoom, offsetX, offsetY, rotation, preset, imageSize, selectBox, borderEnabled, borderColor, borderThicknessPx, CROP_DISPLAY_W, CROP_DISPLAY_H, cssFilter, sharpness, toast]);

  /* ──── Render page preview ──── */
  const renderPagePreview = (pageIndex: number) => {
    const startIdx = pageIndex * perPage;
    const count = Math.min(quantity - startIdx, perPage);
    if (count <= 0) return null;

    const PREVIEW_MAX_W = 360;
    const PREVIEW_MAX_H = 480;
    const pageScale = Math.min(PREVIEW_MAX_W / pageSize.wMM, PREVIEW_MAX_H / pageSize.hMM);
    const pw = pageSize.wMM * pageScale;
    const ph = pageSize.hMM * pageScale;
    const marginS = marginMM * pageScale;
    const gapS = gapMM * pageScale;
    const photoW = preset.wMM * pageScale;
    const photoH = preset.hMM * pageScale;

    // Start from top-left (margin)
    const startX = marginS;
    const startY = marginS;

    const photos = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (photoW + gapS);
      const y = startY + row * (photoH + gapS);
      photos.push(
        <div key={i}>
          {showCutLines && (
            <div
              className="absolute border border-dashed"
              style={{
                left: x - 1, top: y - 1,
                width: photoW + 2, height: photoH + 2,
                borderColor: "hsl(var(--muted-foreground) / 0.3)",
              }}
            />
          )}
          <img
            src={croppedUrl!}
            alt={`Photo ${i + 1}`}
            className="absolute object-cover"
            style={{ left: x, top: y, width: photoW, height: photoH }}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-2" key={pageIndex}>
        <div className="relative bg-white border shadow-sm" style={{ width: pw, height: ph }}>
          <div
            className="absolute border border-dashed"
            style={{
              left: marginS, top: marginS,
              width: pw - 2 * marginS, height: ph - 2 * marginS,
              borderColor: "hsl(var(--muted-foreground) / 0.15)",
            }}
          />
          {photos}
        </div>
        <span className="text-xs text-muted-foreground">
          Page {pageIndex + 1} of {totalPages}
        </span>
      </div>
    );
  };

  /* ──── Generate PDF (shared between download and print) ──── */
  const generatePDF = useCallback(async () => {
    if (!croppedBlob) return null;
    const { jsPDF } = await import("jspdf");

    const doc = new jsPDF({
      orientation: pageSize.wMM > pageSize.hMM ? "landscape" : "portrait",
      unit: "mm",
      format: [pageSize.wMM, pageSize.hMM],
    });

    const imgDataUrl = croppedUrl!;

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) doc.addPage([pageSize.wMM, pageSize.hMM]);

      const startIdx = page * perPage;
      const count = Math.min(quantity - startIdx, perPage);

      // Start from top-left (margin)
      const startX = marginMM;
      const startY = marginMM;

      if (showCutLines) {
        doc.setDrawColor(180);
        doc.setLineWidth(0.1);
      }

      for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (preset.wMM + gapMM);
        const y = startY + row * (preset.hMM + gapMM);
        doc.addImage(imgDataUrl, "JPEG", x, y, preset.wMM, preset.hMM);
        if (showCutLines) {
          doc.rect(x, y, preset.wMM, preset.hMM);
        }
      }
    }

    return doc;
  }, [croppedBlob, croppedUrl, quantity, totalPages, perPage, cols, rows, preset, pageSize, gapMM, marginMM, showCutLines]);

  /* ──── Download as PDF ──── */
  const downloadPDF = useCallback(async () => {
    const doc = await generatePDF();
    if (!doc) return;
    doc.save("passport-photos.pdf");
    toast({ title: "PDF downloaded!", description: `${totalPages} page(s) with ${quantity} photos` });
  }, [generatePDF, totalPages, quantity, toast]);

  /* ──── Print directly ──── */
  const printPDF = useCallback(async () => {
    const doc = await generatePDF();
    if (!doc) return;
    const pdfBlob = doc.output("blob");
    const blobUrl = URL.createObjectURL(pdfBlob);
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = blobUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(blobUrl);
      }, 1000);
    };
    toast({ title: "Print dialog opened" });
  }, [generatePDF, toast]);

  /* ──── Download single cropped photo ──── */
  const downloadSingle = () => {
    if (!croppedUrl) return;
    const a = document.createElement("a");
    a.href = croppedUrl;
    a.download = "passport-photo.jpg";
    a.click();
  };

  /* ──── UI ──── */
  return (
    <>
      <Helmet>
        <title>Free Passport Photo Maker — Online, In-Browser | AllTools Pro</title>
        <meta
          name="description"
          content="Free online passport photo maker. Auto face alignment, background removal, color presets, and print-ready PDFs in seconds. 100% browser-based, no upload required."
        />
        <link rel="canonical" href="/tools/passport-photo" />
        <meta property="og:title" content="Free Passport Photo Maker — AllTools Pro" />
        <meta property="og:description" content="Create print-ready passport photos online. Auto-align, background remove, and download in seconds." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="/tools/passport-photo" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Passport Photo Maker",
          applicationCategory: "PhotographyApplication",
          operatingSystem: "Any (Web Browser)",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        })}</script>
      </Helmet>
      <ToolPageLayout
        title="Passport Photo Maker"
        description="Create standard passport-size photos and arrange them on printable sheets"
        icon={Camera}
        category="image"
        categoryLabel="Image Tools"
      >
      {!imageSrc ? (
        <FileUploader
          accept="image/*"
          onFilesSelected={loadImage}
          label="Upload your photo"
          description="Supports JPG, PNG, WebP — Max 20MB"
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
          {/* ── LEFT CONTROLS ── */}
          <div className="space-y-4 order-2 lg:order-1 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto pr-1">
            {/* Unit Selector */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Unit
              </Label>
              <Select value={sizeUnit} onValueChange={(v) => setSizeUnit(v as SizeUnit)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inch">Inches</SelectItem>
                  <SelectItem value="mm">Millimeters</SelectItem>
                  <SelectItem value="px">Pixels</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Passport Size - Dropdown */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Passport Size
              </Label>
              <Select
                value={presetId}
                onValueChange={(v) => {
                  setPresetId(v);
                  if (step === "layout") setStep("crop");
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select passport size" />
                </SelectTrigger>
                <SelectContent>
                  {PHOTO_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {presetId === "custom" && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Width ({unitLabel(sizeUnit)})</Label>
                    <Input
                      type="number"
                      value={customW}
                      onChange={(e) => setCustomW(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                      className="h-8 text-sm mt-1"
                      step={sizeUnit === "px" ? 1 : 0.01}
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Height ({unitLabel(sizeUnit)})</Label>
                    <Input
                      type="number"
                      value={customH}
                      onChange={(e) => setCustomH(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                      className="h-8 text-sm mt-1"
                      step={sizeUnit === "px" ? 1 : 0.01}
                    />
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {fromMM(preset.wMM, sizeUnit)} × {fromMM(preset.hMM, sizeUnit)} {unitLabel(sizeUnit)}
              </p>
            </div>

            {step === "crop" ? (
              <>
                <Tabs defaultValue="crop" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 h-9">
                    <TabsTrigger value="crop" className="text-xs"><Crop className="h-3.5 w-3.5 mr-1" />Crop</TabsTrigger>
                    <TabsTrigger value="enhance" className="text-xs"><SlidersHorizontal className="h-3.5 w-3.5 mr-1" />Enhance</TabsTrigger>
                    <TabsTrigger value="ai" className="text-xs"><Sparkles className="h-3.5 w-3.5 mr-1" />AI</TabsTrigger>
                  </TabsList>

                  {/* ── CROP TAB: Mode + Adjust + Border ── */}
                  <TabsContent value="crop" className="space-y-3 mt-3">
                {/* Crop Mode Toggle */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Crop Mode
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      variant={cropMode === "pan" ? "default" : "outline"}
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => { setCropMode("pan"); setSelectBox(null); }}
                    >
                      <Move className="h-3.5 w-3.5 mr-1" /> Pan & Zoom
                    </Button>
                    <Button
                      variant={cropMode === "select" ? "default" : "outline"}
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => setCropMode("select")}
                    >
                      <Crop className="h-3.5 w-3.5 mr-1" /> Manual Select
                    </Button>
                  </div>
                  {cropMode === "select" && (
                    <p className="text-xs text-muted-foreground">
                      Draw a rectangle on the image to select crop area
                    </p>
                  )}
                </div>

                {/* Zoom & Rotate */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Adjust Photo
                  </Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
                      <Slider
                        value={[zoomLevel]}
                        onValueChange={([v]) => setZoomLevel(v)}
                        min={0.5}
                        max={4}
                        step={0.01}
                        className="flex-1"
                      />
                      <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">{Math.round(zoomLevel * 100)}% zoom</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                  >
                    <RotateCw className="h-3.5 w-3.5 mr-1.5" />
                    Rotate 90°
                  </Button>
                </div>

                {/* Border */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Photo Border
                    </Label>
                    <Switch checked={borderEnabled} onCheckedChange={setBorderEnabled} />
                  </div>
                  {borderEnabled && (
                    <div className="space-y-2">
                      <div className="flex gap-2 items-center">
                        <Label className="text-xs text-muted-foreground w-16">Color</Label>
                        <input
                          type="color"
                          value={borderColor}
                          onChange={(e) => setBorderColor(e.target.value)}
                          className="h-8 w-10 rounded border cursor-pointer"
                        />
                        <Input
                          value={borderColor}
                          onChange={(e) => setBorderColor(e.target.value)}
                          className="h-8 text-xs flex-1"
                        />
                      </div>
                      <div className="flex gap-2 items-center">
                        <Label className="text-xs text-muted-foreground w-16">Width</Label>
                        <Input
                          type="number"
                          value={borderThicknessPx}
                          onChange={(e) => setBorderThicknessPx(clamp(parseInt(e.target.value) || 0, 0, 50))}
                          className="h-8 text-sm flex-1"
                          min={0}
                          max={50}
                        />
                        <span className="text-xs text-muted-foreground">px</span>
                      </div>
                    </div>
                  )}
                </div>
                  </TabsContent>

                  {/* ── ENHANCE TAB: One-Tap + Filters + Adjustments ── */}
                  <TabsContent value="enhance" className="space-y-3 mt-3">
                {/* Enhance: one-tap fixes */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Wand2 className="h-3.5 w-3.5 text-primary" />
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        One-Tap Enhance
                      </Label>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={handleRestoreOriginal}
                      disabled={aiBusy !== null || !originalImageSrc}
                      title="Restore the originally uploaded photo"
                    >
                      <Undo2 className="h-3 w-3 mr-1" /> Reset
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={handleAutoTilt}
                      disabled={aiBusy !== null}
                    >
                      {aiBusy === "tilt" ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <ScanFace className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Auto Fix Head Tilt
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={handleAutoLighting}
                      disabled={aiBusy !== null}
                    >
                      {aiBusy === "light" ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Sun className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Auto Lighting Fix
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={handleSmoothSkin}
                      disabled={aiBusy !== null}
                    >
                      {aiBusy === "skin" ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Smile className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Smooth Skin
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Each fix bakes into the photo. Tap Reset to restore the original upload.
                  </p>
                </div>

                {/* Filter presets */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Filters
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {FILTER_PRESETS.map((p) => (
                      <Button
                        key={p.id}
                        variant={activePresetId === p.id ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => applyPreset(p.id)}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Manual adjustments */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Adjustments
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={resetAdjustments}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" /> Reset
                    </Button>
                  </div>
                  {([
                    { key: "brightness", label: "Brightness", min: 0, max: 200, base: 100, suffix: "%" },
                    { key: "contrast",   label: "Contrast",   min: 0, max: 200, base: 100, suffix: "%" },
                    { key: "saturation", label: "Saturation", min: 0, max: 200, base: 100, suffix: "%" },
                    { key: "warmth",     label: "Warmth",     min: -100, max: 100, base: 0, suffix: "" },
                  ] as const).map((s) => (
                    <div className="space-y-1.5" key={s.key}>
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] text-muted-foreground">{s.label}</Label>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {adjustments[s.key] - s.base > 0 ? "+" : ""}
                          {adjustments[s.key] - s.base}{s.suffix}
                        </span>
                      </div>
                      <Slider
                        value={[adjustments[s.key]]}
                        onValueChange={([v]) => updateAdjustment(s.key, v)}
                        min={s.min}
                        max={s.max}
                        step={1}
                      />
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] text-muted-foreground">Sharpness</Label>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{sharpness}%</span>
                    </div>
                    <Slider
                      value={[sharpness]}
                      onValueChange={([v]) => { setSharpness(v); setActivePresetId(""); }}
                      min={0}
                      max={100}
                      step={1}
                    />
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Sharpness is applied to the final cropped photo.
                    </p>
                  </div>
                </div>
                  </TabsContent>

                  {/* ── AI TAB: Auto Align + Background Remove ── */}
                  <TabsContent value="ai" className="space-y-3 mt-3">
                {/* AI Tools (MediaPipe) */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      AI Tools
                    </Label>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleAutoAlign}
                    disabled={aiBusy !== null}
                  >
                    {aiBusy === "align" ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <ScanFace className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Auto Align Face
                  </Button>

                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs text-muted-foreground">Background Replace</Label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={bgReplaceColor}
                        onChange={(e) => setBgReplaceColor(e.target.value)}
                        className="h-8 w-10 rounded border cursor-pointer"
                      />
                      <Input
                        value={bgReplaceColor}
                        onChange={(e) => setBgReplaceColor(e.target.value)}
                        className="h-8 text-xs flex-1"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {["#FFFFFF", "#E6F0FA", "#D6E4F0", "#FF0000", "#F5F5F5"].map((c) => (
                        <button
                          key={c}
                          onClick={() => setBgReplaceColor(c)}
                          className="h-6 w-6 rounded border"
                          style={{ background: c }}
                          aria-label={`Use ${c}`}
                        />
                      ))}
                    </div>
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-muted-foreground">Edge Refinement</Label>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{edgeRefinement}%</span>
                      </div>
                      <Slider
                        value={[edgeRefinement]}
                        onValueChange={([v]) => setEdgeRefinement(v)}
                        min={0}
                        max={100}
                        step={1}
                      />
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        Boost to sharpen edges around hair & shoulders. Lower for softer blending.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => void handleRemoveBackground()}
                      disabled={aiBusy !== null}
                    >
                      {aiBusy === "bg" ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {bgRemoved ? "Re-apply Background" : "Remove Background"}
                    </Button>
                    {bgRemoved && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs h-7"
                        onClick={handleRestoreOriginal}
                        disabled={aiBusy !== null}
                      >
                        <Undo2 className="h-3 w-3 mr-1" /> Restore Original
                      </Button>
                    )}
                  </div>

                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Powered by MediaPipe — runs entirely in your browser. First use downloads ~5MB models.
                  </p>
                </div>
                  </TabsContent>
                </Tabs>

                {/* Crop button */}
                <Button onClick={doCrop} className="w-full" size="lg">
                  <Camera className="h-4 w-4 mr-2" /> Crop Photo
                </Button>
              </>
            ) : (
              <>
                {/* Quantity */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Quantity
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      type="number" value={quantity}
                      onChange={(e) => setQuantity(clamp(parseInt(e.target.value) || 1, 1, 100))}
                      className="h-8 w-16 text-center text-sm" min={1} max={100}
                    />
                    <Button variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => setQuantity((q) => Math.min(100, q + 1))}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[4, 6, 8, 12].map((n) => (
                      <Button key={n} variant={quantity === n ? "default" : "outline"}
                        size="sm" className="h-7 px-3 text-xs" onClick={() => setQuantity(n)}>
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Page Size */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Page Size
                  </Label>
                  <Select value={pageSizeId} onValueChange={setPageSizeId}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Fits {cols}×{rows} = {perPage} photos/page • {totalPages} page(s)
                  </p>
                </div>

                {/* Layout Controls */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Layout Controls
                  </Label>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Columns</Label>
                      <Input
                        type="number" value={customCols || ""}
                        placeholder="Auto"
                        onChange={(e) => setCustomCols(clamp(parseInt(e.target.value) || 0, 0, 20))}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Rows</Label>
                      <Input
                        type="number" value={customRows || ""}
                        placeholder="Auto"
                        onChange={(e) => setCustomRows(clamp(parseInt(e.target.value) || 0, 0, 20))}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 items-center">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Gap between photos</Label>
                    <Input
                      type="number"
                      value={gapMM}
                      onChange={(e) => setGapMM(clamp(parseFloat(e.target.value) || 0, 0, 30))}
                      className="h-8 text-sm w-20"
                      min={0} max={30} step={0.5}
                    />
                    <span className="text-xs text-muted-foreground">mm</span>
                  </div>

                  <div className="flex gap-2 items-center">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Page margin</Label>
                    <Input
                      type="number"
                      value={marginMM}
                      onChange={(e) => setMarginMM(clamp(parseFloat(e.target.value) || 0, 0, 50))}
                      className="h-8 text-sm w-20"
                      min={0} max={50} step={0.5}
                    />
                    <span className="text-xs text-muted-foreground">mm</span>
                  </div>

                  {(customCols > 0 || customRows > 0) && (
                    <Button variant="ghost" size="sm" className="w-full text-xs h-7"
                      onClick={() => { setCustomCols(0); setCustomRows(0); }}>
                      Reset to Auto Layout
                    </Button>
                  )}
                </div>

                {/* Options */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Options
                  </Label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox" checked={showCutLines}
                      onChange={(e) => setShowCutLines(e.target.checked)}
                      className="rounded border-input"
                    />
                    Include cut lines
                  </label>
                </div>

                {/* Actions */}
                <div className="space-y-2">
                  <Button onClick={downloadPDF} className="w-full" size="lg">
                    <Download className="h-4 w-4 mr-2" /> Download PDF
                  </Button>
                  <Button onClick={printPDF} variant="outline" className="w-full" size="lg">
                    <Printer className="h-4 w-4 mr-2" /> Print
                  </Button>
                  <Button onClick={downloadSingle} variant="outline" className="w-full" size="sm">
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Download Single Photo
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full text-muted-foreground"
                    onClick={() => setStep("crop")}>
                    ← Back to Crop
                  </Button>
                </div>
              </>
            )}

            {/* Upload new */}
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground"
              onClick={() => { setImageSrc(null); setCroppedUrl(null); setCroppedBlob(null); }}>
              Upload New Photo
            </Button>
          </div>

          {/* ── RIGHT PREVIEW ── */}
          <div className="space-y-4 order-1 lg:order-2">
            {step === "crop" ? (
              <div className="rounded-xl border bg-muted/30 p-6 flex flex-col items-center gap-4">
                <p className="text-sm font-medium text-muted-foreground">
                  {cropMode === "pan" ? "Drag to reposition • Scroll to zoom" : "Draw a rectangle to select crop area"}
                </p>
                <div className="text-xs text-muted-foreground text-center">
                  Position your face within the oval guide
                </div>
                <div
                  ref={cropContainerRef}
                  className="relative overflow-hidden bg-muted/50 border-2 border-primary/30 rounded-lg"
                  style={{
                    width: CROP_DISPLAY_W,
                    height: CROP_DISPLAY_H,
                    cursor: cropMode === "pan" ? "move" : "crosshair",
                  }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <img
                    src={imageSrc}
                    alt="Source"
                    className="absolute pointer-events-none"
                    style={{
                      width: imageSize.w * zoom,
                      height: imageSize.h * zoom,
                      left: `calc(50% - ${(imageSize.w * zoom) / 2 - offsetX}px)`,
                      top: `calc(50% - ${(imageSize.h * zoom) / 2 - offsetY}px)`,
                      transform: `rotate(${rotation}deg)`,
                      transformOrigin: "center center",
                      maxWidth: "none",
                      filter: cssFilter,
                    }}
                  />
                  {/* Face oval guide */}
                  <div
                    className="absolute pointer-events-none border-2 border-dashed border-primary/40 rounded-full"
                    style={{
                      width: CROP_DISPLAY_W * 0.45,
                      height: CROP_DISPLAY_H * 0.6,
                      left: "50%", top: "40%",
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                  {/* Selection box overlay */}
                  {selectBox && selectBox.w > 0 && selectBox.h > 0 && (
                    <div
                      className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
                      style={{
                        left: selectBox.x, top: selectBox.y,
                        width: selectBox.w, height: selectBox.h,
                      }}
                    />
                  )}
                  {/* Rule-of-thirds */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute bg-primary/10" style={{ left: "33.33%", top: 0, width: 1, height: "100%" }} />
                    <div className="absolute bg-primary/10" style={{ left: "66.66%", top: 0, width: 1, height: "100%" }} />
                    <div className="absolute bg-primary/10" style={{ left: 0, top: "33.33%", width: "100%", height: 1 }} />
                    <div className="absolute bg-primary/10" style={{ left: 0, top: "66.66%", width: "100%", height: 1 }} />
                  </div>
                </div>
                {/* Border preview indicator */}
                {borderEnabled && (
                  <p className="text-xs text-muted-foreground">
                    Border: {borderThicknessPx}px {borderColor}
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Output: {Math.round(preset.wMM * MM_TO_PX)} × {Math.round(preset.hMM * MM_TO_PX)} px</span>
                  <span>300 DPI</span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border bg-muted/30 p-6 flex flex-col items-center gap-4 overflow-auto">
                <p className="text-sm font-medium text-muted-foreground">Print Layout Preview</p>
                <div className="flex flex-wrap justify-center gap-6">
                  {Array.from({ length: totalPages }, (_, i) => renderPagePreview(i))}
                </div>
                {imageSize.w < preset.wMM * MM_TO_PX * 0.8 && (
                  <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3 text-center max-w-sm">
                    ⚠️ Your image resolution may be too low for high-quality prints at this passport size.
                  </div>
                )}
              </div>
            )}

            {croppedUrl && step === "layout" && (
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Cropped Photo
                </p>
                <div className="flex justify-center">
                  <img src={croppedUrl} alt="Cropped passport photo" className="border rounded shadow-sm" style={{ maxHeight: 160 }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </ToolPageLayout>
  );
}
