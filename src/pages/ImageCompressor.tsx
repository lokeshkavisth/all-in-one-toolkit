import { useState, useRef, useCallback } from "react";
import { ImageIcon, Download, RotateCw } from "lucide-react";
import { ToolPageLayout } from "@/components/ToolPageLayout";
import { FileUploader } from "@/components/FileUploader";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { CompressorControls } from "@/components/image-compressor/CompressorControls";
import { CompressorPreview } from "@/components/image-compressor/CompressorPreview";
import { CompressorStats } from "@/components/image-compressor/CompressorStats";
import { ResultFeedback } from "@/components/image-compressor/ResultFeedback";
import { formatBytes } from "@/components/image-compressor/utils";
import type { CompressionResult, CompressionMode, OutputFormat } from "@/components/image-compressor/types";

export default function ImageCompressor() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState(0);
  const [quality, setQuality] = useState(80);
  const [format, setFormat] = useState<OutputFormat>("jpeg");
  const [targetSizeKB, setTargetSizeKB] = useState(100);
  const [mode, setMode] = useState<CompressionMode>("manual");
  const [precisionMode, setPrecisionMode] = useState(false);
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [bestPossibleSize, setBestPossibleSize] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const handleFile = useCallback((files: File[]) => {
    if (!files.length) return;
    const f = files[0];
    setFile(f);
    setOriginalSize(f.size);
    setResult(null);
    setBestPossibleSize(null);

    const url = URL.createObjectURL(f);
    setPreview(url);

    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // Calculate best possible size (quality 60, no visible loss)
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => { if (blob) setBestPossibleSize(blob.size); },
          "image/jpeg",
          0.6
        );
      }
    };
    img.src = url;
  }, []);

  const compressImage = useCallback(async (retryHarder = false) => {
    if (!imgRef.current || !canvasRef.current) return;
    setProcessing(true);

    const img = imgRef.current;
    const canvas = canvasRef.current;
    let scale = 1;

    if (retryHarder && result) {
      // Reduce dimensions by 20% for retry
      scale = 0.8;
    }

    const fmt: OutputFormat = format === "png" ? "jpeg" : format;
    const mimeType = `image/${fmt}`;

    if (mode === "manual") {
      // Simple manual compression
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const q = quality / 100;
      canvas.toBlob(
        (blob) => {
          if (blob) {
            if (result?.url) URL.revokeObjectURL(result.url);
            const url = URL.createObjectURL(blob);
            setResult({ url, size: blob.size, quality, dimensionReduced: scale < 1, finalWidth: canvas.width, finalHeight: canvas.height });
            toast({ title: "Compressed!", description: `${formatBytes(blob.size)}` });
          }
          setProcessing(false);
        },
        mimeType,
        q
      );
      return;
    }

    // Target size mode — iterative compression
    const targetBytes = targetSizeKB * 1024;
    const step = precisionMode ? 1 : 5;
    const maxIterations = precisionMode ? 100 : 20;

    let currentScale = scale;
    let bestBlob: Blob | null = null;
    let bestQ = 1;
    let dimensionReduced = false;

    // Try quality reduction first
    for (let q = 95; q >= 1; q -= step) {
      canvas.width = Math.round(img.naturalWidth * currentScale);
      canvas.height = Math.round(img.naturalHeight * currentScale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), mimeType, q / 100)
      );

      if (!blob) continue;

      if (blob.size <= targetBytes) {
        bestBlob = blob;
        bestQ = q;
        break;
      }

      // Keep last attempt
      bestBlob = blob;
      bestQ = q;
    }

    // Fallback: reduce dimensions if quality alone wasn't enough
    if (bestBlob && bestBlob.size > targetBytes) {
      dimensionReduced = true;
      for (let s = 0.9; s >= 0.1; s -= 0.1) {
        canvas.width = Math.round(img.naturalWidth * s);
        canvas.height = Math.round(img.naturalHeight * s);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob((b) => res(b), mimeType, bestQ / 100)
        );

        if (blob && blob.size <= targetBytes) {
          bestBlob = blob;
          currentScale = s;
          break;
        }
        if (blob) {
          bestBlob = blob;
          currentScale = s;
        }
      }
    }

    if (bestBlob) {
      if (result?.url) URL.revokeObjectURL(result.url);
      const url = URL.createObjectURL(bestBlob);
      setResult({
        url,
        size: bestBlob.size,
        quality: bestQ,
        dimensionReduced,
        finalWidth: canvas.width,
        finalHeight: canvas.height,
      });
      setQuality(bestQ);
      toast({ title: "Compressed!", description: `${formatBytes(bestBlob.size)} at ${bestQ}% quality` });
    }
    setProcessing(false);
  }, [format, mode, quality, targetSizeKB, precisionMode, result]);

  const download = () => {
    if (!result || !file) return;
    const ext = format === "jpeg" ? "jpg" : format;
    const name = file.name.replace(/\.[^.]+$/, "") + `_compressed.${ext}`;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = name;
    a.click();
  };

  const reset = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setResult(null);
    setBestPossibleSize(null);
  };

  const qualityWarning = mode === "target" && targetSizeKB < 30;

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
          <CompressorPreview
            preview={preview!}
            result={result}
            originalSize={originalSize}
          />

          <CompressorStats
            originalSize={originalSize}
            result={result}
            bestPossibleSize={bestPossibleSize}
          />

          {result && mode === "target" && (
            <ResultFeedback result={result} targetSizeKB={targetSizeKB} />
          )}

          <CompressorControls
            mode={mode}
            setMode={setMode}
            quality={quality}
            setQuality={setQuality}
            targetSizeKB={targetSizeKB}
            setTargetSizeKB={setTargetSizeKB}
            originalSize={originalSize}
            precisionMode={precisionMode}
            setPrecisionMode={setPrecisionMode}
            format={format}
            setFormat={setFormat}
            qualityWarning={qualityWarning}
          />

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => compressImage(false)} disabled={processing} className="gap-2">
              {processing ? "Compressing…" : "Compress Image"}
            </Button>

            {result && (
              <>
                <Button onClick={download} variant="outline" className="gap-2">
                  <Download className="h-4 w-4" /> Download
                </Button>
                <Button onClick={() => compressImage(true)} variant="outline" className="gap-2">
                  <RotateCw className="h-4 w-4" /> Try Harder
                </Button>
              </>
            )}

            <Button variant="ghost" onClick={reset}>
              Upload Another
            </Button>
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </ToolPageLayout>
  );
}
