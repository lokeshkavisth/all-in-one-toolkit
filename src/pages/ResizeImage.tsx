import { useState, useRef, useCallback } from "react";
import { ImageIcon, Download, Lock, Unlock, RotateCcw } from "lucide-react";
import { ToolPageLayout } from "@/components/ToolPageLayout";
import { FileUploader } from "@/components/FileUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

const PRESETS = [
  { label: "Custom", width: 0, height: 0 },
  { label: "HD (1280×720)", width: 1280, height: 720 },
  { label: "Full HD (1920×1080)", width: 1920, height: 1080 },
  { label: "4K (3840×2160)", width: 3840, height: 2160 },
  { label: "Instagram Post (1080×1080)", width: 1080, height: 1080 },
  { label: "Instagram Story (1080×1920)", width: 1080, height: 1920 },
  { label: "Facebook Cover (820×312)", width: 820, height: 312 },
  { label: "Twitter Header (1500×500)", width: 1500, height: 500 },
  { label: "YouTube Thumbnail (1280×720)", width: 1280, height: 720 },
  { label: "Favicon (64×64)", width: 64, height: 64 },
];

type OutputFormat = "png" | "jpeg" | "webp";

export default function ResizeImage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [origWidth, setOrigWidth] = useState(0);
  const [origHeight, setOrigHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [quality, setQuality] = useState(90);
  const [format, setFormat] = useState<OutputFormat>("png");
  const [resizedUrl, setResizedUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const aspectRatio = origWidth / origHeight || 1;

  const handleFile = useCallback((files: File[]) => {
    if (!files.length) return;
    const f = files[0];
    setFile(f);
    setResizedUrl(null);

    const url = URL.createObjectURL(f);
    setPreview(url);

    const img = new Image();
    img.onload = () => {
      setOrigWidth(img.naturalWidth);
      setOrigHeight(img.naturalHeight);
      setWidth(img.naturalWidth);
      setHeight(img.naturalHeight);
    };
    img.src = url;
  }, []);

  const updateWidth = (w: number) => {
    setWidth(w);
    if (lockAspect && origHeight) {
      setHeight(Math.round(w / aspectRatio));
    }
  };

  const updateHeight = (h: number) => {
    setHeight(h);
    if (lockAspect && origWidth) {
      setWidth(Math.round(h * aspectRatio));
    }
  };

  const applyPreset = (preset: string) => {
    const p = PRESETS.find((pr) => pr.label === preset);
    if (!p || p.width === 0) return;
    setLockAspect(false);
    setWidth(p.width);
    setHeight(p.height);
  };

  const resetDimensions = () => {
    setWidth(origWidth);
    setHeight(origHeight);
    setLockAspect(true);
    setResizedUrl(null);
  };

  const resize = useCallback(() => {
    if (!file || !preview || width <= 0 || height <= 0) return;
    setProcessing(true);

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current!;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = `image/${format}`;
      const q = format === "png" ? undefined : quality / 100;
      canvas.toBlob(
        (blob) => {
          if (blob) {
            if (resizedUrl) URL.revokeObjectURL(resizedUrl);
            setResizedUrl(URL.createObjectURL(blob));
            toast({
              title: "Image resized!",
              description: `New size: ${width}×${height} (${(blob.size / 1024).toFixed(1)} KB)`,
            });
          }
          setProcessing(false);
        },
        mimeType,
        q
      );
    };
    img.src = preview;
  }, [file, preview, width, height, format, quality, resizedUrl]);

  const download = () => {
    if (!resizedUrl || !file) return;
    const ext = format;
    const name = file.name.replace(/\.[^.]+$/, "") + `_resized.${ext}`;
    const a = document.createElement("a");
    a.href = resizedUrl;
    a.download = name;
    a.click();
  };

  return (
    <ToolPageLayout
      title="Resize Image"
      description="Increase or reduce image dimensions with quality control"
      icon={ImageIcon}
      category="image"
      categoryLabel="Image Tools"
    >
      {!file ? (
        <FileUploader
          accept="image/*"
          onFilesSelected={handleFile}
          label="Upload an image to resize"
          description="Supports JPG, PNG, WebP — Max 20 MB"
        />
      ) : (
        <div className="space-y-6">
          {/* Preview */}
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm font-medium mb-2 text-muted-foreground">Preview</p>
            <div className="flex justify-center bg-secondary/30 rounded-lg p-4 max-h-80 overflow-hidden">
              <img
                src={resizedUrl || preview!}
                alt="Preview"
                className="max-h-72 object-contain rounded"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Original: {origWidth}×{origHeight}
            </p>
          </div>

          {/* Controls */}
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Dimensions */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h3 className="font-display font-semibold text-sm">Dimensions</h3>

              {/* Preset */}
              <div>
                <Label className="text-xs text-muted-foreground">Preset</Label>
                <Select onValueChange={applyPreset}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Custom" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => (
                      <SelectItem key={p.label} value={p.label}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Width / Height */}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label htmlFor="width" className="text-xs text-muted-foreground">
                    Width (px)
                  </Label>
                  <Input
                    id="width"
                    type="number"
                    min={1}
                    max={10000}
                    value={width}
                    onChange={(e) => updateWidth(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 mb-0.5"
                  onClick={() => setLockAspect(!lockAspect)}
                  title={lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
                >
                  {lockAspect ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Unlock className="h-4 w-4" />
                  )}
                </Button>

                <div className="flex-1">
                  <Label htmlFor="height" className="text-xs text-muted-foreground">
                    Height (px)
                  </Label>
                  <Input
                    id="height"
                    type="number"
                    min={1}
                    max={10000}
                    value={height}
                    onChange={(e) => updateHeight(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              </div>

              <Button variant="ghost" size="sm" onClick={resetDimensions} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            </div>

            {/* Quality & Format */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h3 className="font-display font-semibold text-sm">Output Settings</h3>

              <div>
                <Label className="text-xs text-muted-foreground">Format</Label>
                <Select value={format} onValueChange={(v) => setFormat(v as OutputFormat)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="jpeg">JPEG</SelectItem>
                    <SelectItem value="webp">WebP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {format !== "png" && (
                <div>
                  <div className="flex justify-between">
                    <Label className="text-xs text-muted-foreground">Quality</Label>
                    <span className="text-xs font-medium">{quality}%</span>
                  </div>
                  <Slider
                    min={10}
                    max={100}
                    step={1}
                    value={[quality]}
                    onValueChange={([v]) => setQuality(v)}
                    className="mt-2"
                  />
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {format === "png"
                  ? "PNG is lossless — no quality setting needed."
                  : "Lower quality = smaller file size."}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={resize} disabled={processing} className="gap-2">
              {processing ? "Resizing…" : "Resize Image"}
            </Button>

            {resizedUrl && (
              <Button onClick={download} variant="outline" className="gap-2">
                <Download className="h-4 w-4" /> Download
              </Button>
            )}

            <Button
              variant="ghost"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setResizedUrl(null);
              }}
            >
              Upload Another
            </Button>
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </ToolPageLayout>
  );
}
