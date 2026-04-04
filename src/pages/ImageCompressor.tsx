import { useState, useRef, useCallback, useEffect } from "react";
import { ImageIcon, Download, ZoomIn, ZoomOut } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

type OutputFormat = "jpeg" | "webp" | "png";

interface CompressionResult {
  url: string;
  size: number;
  quality: number;
}

export default function ImageCompressor() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState(0);
  const [quality, setQuality] = useState(80);
  const [format, setFormat] = useState<OutputFormat>("jpeg");
  const [useTargetSize, setUseTargetSize] = useState(false);
  const [targetSizeKB, setTargetSizeKB] = useState(100);
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Load the image once
  const handleFile = useCallback((files: File[]) => {
    if (!files.length) return;
    const f = files[0];
    setFile(f);
    setOriginalSize(f.size);
    setResult(null);
    setEstimatedSize(null);

    const url = URL.createObjectURL(f);
    setPreview(url);

    const img = new Image();
    img.onload = () => { imgRef.current = img; };
    img.src = url;
  }, []);

  // Live estimate when quality/format changes
  useEffect(() => {
    if (!imgRef.current || !canvasRef.current) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const mimeType = `image/${format}`;
    const q = format === "png" ? undefined : quality / 100;
    canvas.toBlob(
      (blob) => {
        if (blob) setEstimatedSize(blob.size);
      },
      mimeType,
      q
    );
  }, [quality, format, file]);

  // Compress with target size (binary search)
  const compressToTarget = useCallback(async () => {
    if (!imgRef.current || !canvasRef.current) return;
    setProcessing(true);
    const img = imgRef.current;
    const canvas = canvasRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const targetBytes = targetSizeKB * 1024;
    const fmt = format === "png" ? "jpeg" : format; // can't quality-compress PNG
    const mimeType = `image/${fmt}`;

    let lo = 1, hi = 100, bestBlob: Blob | null = null, bestQ = 50;

    for (let i = 0; i < 15; i++) {
      const mid = Math.round((lo + hi) / 2);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), mimeType, mid / 100)
      );
      if (!blob) break;
      if (blob.size <= targetBytes) {
        bestBlob = blob;
        bestQ = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    // Final pass at best quality
    if (!bestBlob) {
      bestBlob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), mimeType, 1 / 100)
      );
      bestQ = 1;
    }

    if (bestBlob) {
      if (result?.url) URL.revokeObjectURL(result.url);
      const url = URL.createObjectURL(bestBlob);
      setResult({ url, size: bestBlob.size, quality: bestQ });
      setQuality(bestQ);
      toast({
        title: "Compressed!",
        description: `${formatBytes(bestBlob.size)} at ${bestQ}% quality`,
      });
    }
    setProcessing(false);
  }, [targetSizeKB, format, result]);

  // Compress with manual quality
  const compressManual = useCallback(() => {
    if (!imgRef.current || !canvasRef.current) return;
    setProcessing(true);
    const img = imgRef.current;
    const canvas = canvasRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const mimeType = `image/${format}`;
    const q = format === "png" ? undefined : quality / 100;
    canvas.toBlob(
      (blob) => {
        if (blob) {
          if (result?.url) URL.revokeObjectURL(result.url);
          const url = URL.createObjectURL(blob);
          setResult({ url, size: blob.size, quality });
          toast({
            title: "Compressed!",
            description: `${formatBytes(blob.size)} (${reductionPercent(originalSize, blob.size)} reduction)`,
          });
        }
        setProcessing(false);
      },
      mimeType,
      q
    );
  }, [quality, format, originalSize, result]);

  const compress = useTargetSize ? compressToTarget : compressManual;

  const download = () => {
    if (!result || !file) return;
    const ext = format === "jpeg" ? "jpg" : format;
    const name = file.name.replace(/\.[^.]+$/, "") + `_compressed.${ext}`;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = name;
    a.click();
  };

  return (
    <ToolPageLayout
      title="Image Compressor"
      description="Reduce or increase image file size with quality control"
      icon={ImageIcon}
      category="image"
      categoryLabel="Image Tools"
    >
      {!file ? (
        <FileUploader
          accept="image/*"
          onFilesSelected={handleFile}
          label="Upload an image to compress"
          description="Supports JPG, PNG, WebP — Max 20 MB"
        />
      ) : (
        <div className="space-y-6">
          {/* Preview */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">Preview</p>
              {result && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setComparing(!comparing)}
                >
                  {comparing ? <ZoomOut className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
                  {comparing ? "Hide comparison" : "Compare"}
                </Button>
              )}
            </div>

            {comparing && result ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="bg-secondary/30 rounded-lg p-3 max-h-64 overflow-hidden flex items-center justify-center">
                    <img src={preview!} alt="Original" className="max-h-56 object-contain rounded" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">Original — {formatBytes(originalSize)}</p>
                </div>
                <div className="text-center">
                  <div className="bg-secondary/30 rounded-lg p-3 max-h-64 overflow-hidden flex items-center justify-center">
                    <img src={result.url} alt="Compressed" className="max-h-56 object-contain rounded" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">Compressed — {formatBytes(result.size)}</p>
                </div>
              </div>
            ) : (
              <div className="flex justify-center bg-secondary/30 rounded-lg p-4 max-h-80 overflow-hidden">
                <img
                  src={result?.url || preview!}
                  alt="Preview"
                  className="max-h-72 object-contain rounded"
                />
              </div>
            )}
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Original" value={formatBytes(originalSize)} />
            <StatCard
              label="Estimated"
              value={result ? formatBytes(result.size) : estimatedSize ? formatBytes(estimatedSize) : "—"}
              highlight
            />
            <StatCard
              label="Reduction"
              value={
                result
                  ? reductionPercent(originalSize, result.size)
                  : estimatedSize
                  ? reductionPercent(originalSize, estimatedSize)
                  : "—"
              }
            />
          </div>

          {/* Controls */}
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Quality / Target */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h3 className="font-display font-semibold text-sm">Compression</h3>

              {/* Target size toggle */}
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Target file size</Label>
                <Switch checked={useTargetSize} onCheckedChange={setUseTargetSize} />
              </div>

              {useTargetSize ? (
                <div>
                  <Label className="text-xs text-muted-foreground">Target (KB)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={Math.round(originalSize / 1024)}
                    value={targetSizeKB}
                    onChange={(e) => setTargetSizeKB(Number(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Auto-adjusts quality to hit ≤ {targetSizeKB} KB
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex justify-between">
                    <Label className="text-xs text-muted-foreground">Quality</Label>
                    <span className="text-xs font-medium">{quality}%</span>
                  </div>
                  <Slider
                    min={1}
                    max={100}
                    step={1}
                    value={[quality]}
                    onValueChange={([v]) => setQuality(v)}
                    className="mt-2"
                  />
                  {estimatedSize && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Est. {formatBytes(estimatedSize)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Format */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h3 className="font-display font-semibold text-sm">Output Settings</h3>

              <div>
                <Label className="text-xs text-muted-foreground">Format</Label>
                <Select value={format} onValueChange={(v) => setFormat(v as OutputFormat)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jpeg">JPEG (lossy, smallest)</SelectItem>
                    <SelectItem value="webp">WebP (lossy, efficient)</SelectItem>
                    <SelectItem value="png">PNG (lossless)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="text-xs text-muted-foreground">
                {format === "png"
                  ? "PNG is lossless — file size depends on image content."
                  : format === "webp"
                  ? "WebP offers the best size-to-quality ratio."
                  : "JPEG is widely compatible with good compression."}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={compress} disabled={processing} className="gap-2">
              {processing ? "Compressing…" : "Compress Image"}
            </Button>

            {result && (
              <Button onClick={download} variant="outline" className="gap-2">
                <Download className="h-4 w-4" /> Download
              </Button>
            )}

            <Button
              variant="ghost"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setResult(null);
                setEstimatedSize(null);
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

/* Helpers */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function reductionPercent(original: number, compressed: number): string {
  if (!original) return "0%";
  const pct = ((1 - compressed / original) * 100).toFixed(1);
  return `${pct}%`;
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
