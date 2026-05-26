import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Eraser, Download, RefreshCw, Upload, Loader2, Image as ImageIcon } from "lucide-react";
import { ToolPageLayout } from "@/components/ToolPageLayout";
import { FileUploader } from "@/components/FileUploader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { extractForegroundCanvas } from "@/lib/passport-photo/mediapipe";

type BgMode = "transparent" | "color" | "image";
type ExportFormat = "png" | "jpeg" | "webp";

const COLOR_PRESETS = [
  "#ffffff", "#000000", "#f5f5f5",
  "#2563eb", "#16a34a", "#dc2626",
  "#facc15", "#ec4899", "#0ea5e9",
];

const STORAGE_KEY = "remove-bg.settings.v1";

interface Persisted {
  bgMode: BgMode;
  bgColor: string;
  edgeRefinement: number;
  format: ExportFormat;
  scale: number;
}

const DEFAULTS: Persisted = {
  bgMode: "transparent",
  bgColor: "#ffffff",
  edgeRefinement: 65,
  format: "png",
  scale: 1,
};

function loadSettings(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export default function RemoveBackground() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Persisted>(() => loadSettings());
  const [originalSrc, setOriginalSrc] = useState<string | null>(null);
  const [originalDims, setOriginalDims] = useState<{ w: number; h: number } | null>(null);
  const [fgCanvas, setFgCanvas] = useState<HTMLCanvasElement | null>(null);
  const [bgImageSrc, setBgImageSrc] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string>("image");

  // Persist settings
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings]);

  const update = <K extends keyof Persisted>(k: K, v: Persisted[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  const handleFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const file = files[0];
    setFileName(file.name.replace(/\.[^.]+$/, "") || "image");
    const dataUrl = await fileToDataUrl(file);
    setOriginalSrc(dataUrl);
    setFgCanvas(null);
    setPreviewUrl(null);
    const img = await loadImage(dataUrl);
    setOriginalDims({ w: img.naturalWidth, h: img.naturalHeight });
    // auto-process
    runRemoval(img);
  }, [settings.edgeRefinement]);

  const runRemoval = useCallback(async (imgArg?: HTMLImageElement) => {
    if (!originalSrc && !imgArg) return;
    setBusy(true);
    try {
      const img = imgArg ?? await loadImage(originalSrc!);
      const canvas = await extractForegroundCanvas(img, settings.edgeRefinement);
      setFgCanvas(canvas);
    } catch (e) {
      console.error(e);
      toast({ title: "Background removal failed", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [originalSrc, settings.edgeRefinement, toast]);

  // Re-run when edge refinement changes (debounced)
  useEffect(() => {
    if (!originalSrc) return;
    const t = setTimeout(() => { runRemoval(); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.edgeRefinement]);

  // Build preview composite whenever fg or bg options change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!fgCanvas) { setPreviewUrl(null); return; }
      const url = await composite(fgCanvas, settings, bgImageSrc, 1);
      if (!cancelled) setPreviewUrl(url);
    })();
    return () => { cancelled = true; };
  }, [fgCanvas, settings.bgMode, settings.bgColor, bgImageSrc]);

  const handleBgImage = (files: FileList | null) => {
    if (!files || !files[0]) return;
    const reader = new FileReader();
    reader.onload = () => setBgImageSrc(String(reader.result));
    reader.readAsDataURL(files[0]);
  };

  const handleDownload = async () => {
    if (!fgCanvas) return;
    setBusy(true);
    try {
      const mime = settings.format === "png" ? "image/png"
        : settings.format === "webp" ? "image/webp" : "image/jpeg";
      const ext = settings.format === "jpeg" ? "jpg" : settings.format;
      // Force PNG for transparent so alpha is preserved
      const effective = settings.bgMode === "transparent" && settings.format === "jpeg"
        ? { ...settings, format: "png" as const }
        : settings;
      const url = await composite(fgCanvas, effective, bgImageSrc, settings.scale, effective.format === "png" ? "image/png" : effective.format === "webp" ? "image/webp" : "image/jpeg");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}-no-bg.${effective.format === "jpeg" ? "jpg" : effective.format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Export failed", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setOriginalSrc(null);
    setOriginalDims(null);
    setFgCanvas(null);
    setPreviewUrl(null);
    setBgImageSrc(null);
  };

  const outputDims = useMemo(() => {
    if (!originalDims) return null;
    return {
      w: Math.round(originalDims.w * settings.scale),
      h: Math.round(originalDims.h * settings.scale),
    };
  }, [originalDims, settings.scale]);

  return (
    <>
      <Helmet>
        <title>Remove Image Background Online — Free HD AI Background Remover</title>
        <meta
          name="description"
          content="Remove or replace image backgrounds instantly with AI. Download HD or original-quality PNG, JPG, or WebP. 100% free, runs in your browser — no upload required."
        />
        <link rel="canonical" href="/tools/remove-background" />
        <meta property="og:title" content="AI Background Remover — Free, HD, In-Browser" />
        <meta property="og:description" content="Erase or swap photo backgrounds with AI in seconds. Download up to 2x resolution. Private and free." />
      </Helmet>

      <ToolPageLayout
        title="Remove Background"
        description="AI background remover — erase or replace backgrounds and download in HD."
        icon={Eraser}
        category="image"
        categoryLabel="Image Tools"
      >
        {!originalSrc ? (
          <FileUploader
            accept="image/*"
            onFilesSelected={handleFiles}
            label="Drop an image or click to upload"
            description="PNG, JPG or WebP up to 20MB"
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-[320px_1fr]">
            {/* Controls */}
            <div className="space-y-5">
              <Tabs value={settings.bgMode} onValueChange={(v) => update("bgMode", v as BgMode)}>
                <Label className="mb-2 block">Background</Label>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="transparent">None</TabsTrigger>
                  <TabsTrigger value="color">Color</TabsTrigger>
                  <TabsTrigger value="image">Image</TabsTrigger>
                </TabsList>

                <TabsContent value="transparent">
                  <p className="text-sm text-muted-foreground">
                    Transparent PNG output — perfect for designs and overlays.
                  </p>
                </TabsContent>

                <TabsContent value="color" className="space-y-3">
                  <div className="grid grid-cols-9 gap-2">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        onClick={() => update("bgColor", c)}
                        className="h-7 w-7 rounded-md border border-border ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:ring-2 data-[active=true]:ring-primary"
                        data-active={settings.bgColor === c}
                        style={{ background: c }}
                        aria-label={`Pick ${c}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.bgColor}
                      onChange={(e) => update("bgColor", e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent"
                    />
                    <input
                      type="text"
                      value={settings.bgColor}
                      onChange={(e) => update("bgColor", e.target.value)}
                      className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="image" className="space-y-3">
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-sm hover:bg-secondary/50">
                    <Upload className="h-4 w-4" />
                    {bgImageSrc ? "Replace background image" : "Upload background image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleBgImage(e.target.files)}
                    />
                  </label>
                  {bgImageSrc && (
                    <div className="overflow-hidden rounded-md border">
                      <img src={bgImageSrc} alt="Background preview" className="h-24 w-full object-cover" />
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Edge refinement</Label>
                  <span className="text-xs text-muted-foreground">{settings.edgeRefinement}</span>
                </div>
                <Slider
                  value={[settings.edgeRefinement]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([v]) => update("edgeRefinement", v)}
                />
                <p className="text-xs text-muted-foreground">
                  Higher values clean up halos around hair and shoulders.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Output quality</Label>
                <Select value={String(settings.scale)} onValueChange={(v) => update("scale", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Original (HD)</SelectItem>
                    <SelectItem value="1.5">1.5× upscale</SelectItem>
                    <SelectItem value="2">2× upscale (Ultra HD)</SelectItem>
                    <SelectItem value="0.75">75% (smaller file)</SelectItem>
                    <SelectItem value="0.5">50% (web)</SelectItem>
                  </SelectContent>
                </Select>
                {outputDims && (
                  <p className="text-xs text-muted-foreground">
                    Output: {outputDims.w} × {outputDims.h} px
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={settings.format} onValueChange={(v) => update("format", v as ExportFormat)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="png">PNG (supports transparency)</SelectItem>
                    <SelectItem value="jpeg">JPG (smaller)</SelectItem>
                    <SelectItem value="webp">WebP (modern, smallest)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <Button onClick={handleDownload} disabled={!fgCanvas || busy} className="w-full">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download
                </Button>
                <Button onClick={handleReset} variant="outline" className="w-full">
                  <RefreshCw className="h-4 w-4" /> New image
                </Button>
              </div>
            </div>

            {/* Preview */}
            <div className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-xl border bg-[conic-gradient(at_50%_50%,#f1f1f1_25%,#fafafa_0_50%,#f1f1f1_0_75%,#fafafa_0)] bg-[length:24px_24px]">
              {busy && !previewUrl && (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-sm">Removing background…</span>
                </div>
              )}
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Result preview"
                  className="max-h-[70vh] max-w-full object-contain"
                />
              )}
              {!previewUrl && !busy && (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageIcon className="h-6 w-6" />
                  <span className="text-sm">Preview will appear here</span>
                </div>
              )}
              {busy && previewUrl && (
                <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-background/90 px-3 py-1 text-xs shadow">
                  <Loader2 className="h-3 w-3 animate-spin" /> Updating
                </div>
              )}
            </div>
          </div>
        )}
      </ToolPageLayout>
    </>
  );
}

/* ────────── Helpers ────────── */

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function composite(
  fg: HTMLCanvasElement,
  settings: Persisted,
  bgImageSrc: string | null,
  scale: number,
  mime: string = settings.format === "png" ? "image/png" : settings.format === "webp" ? "image/webp" : "image/jpeg",
): Promise<string> {
  const w = Math.round(fg.width * scale);
  const h = Math.round(fg.height * scale);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (settings.bgMode === "color") {
    ctx.fillStyle = settings.bgColor;
    ctx.fillRect(0, 0, w, h);
  } else if (settings.bgMode === "image" && bgImageSrc) {
    const bgImg = await loadImage(bgImageSrc);
    // cover
    const ratio = Math.max(w / bgImg.naturalWidth, h / bgImg.naturalHeight);
    const bw = bgImg.naturalWidth * ratio;
    const bh = bgImg.naturalHeight * ratio;
    ctx.drawImage(bgImg, (w - bw) / 2, (h - bh) / 2, bw, bh);
  } else if (settings.bgMode === "image" && !bgImageSrc) {
    // no bg uploaded yet — leave transparent
  }
  // If transparent, leave canvas alpha 0

  ctx.drawImage(fg, 0, 0, w, h);

  if (mime === "image/jpeg" || mime === "image/webp") {
    return out.toDataURL(mime, 0.95);
  }
  return out.toDataURL("image/png");
}
