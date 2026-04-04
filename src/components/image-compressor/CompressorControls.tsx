import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CompressionMode, OutputFormat } from "./types";

const TARGET_PRESETS = [20, 50, 100, 200, 500];

interface Props {
  mode: CompressionMode;
  setMode: (m: CompressionMode) => void;
  quality: number;
  setQuality: (q: number) => void;
  targetSizeKB: number;
  setTargetSizeKB: (s: number) => void;
  originalSize: number;
  precisionMode: boolean;
  setPrecisionMode: (p: boolean) => void;
  format: OutputFormat;
  setFormat: (f: OutputFormat) => void;
  qualityWarning: boolean;
}

export function CompressorControls({
  mode, setMode, quality, setQuality,
  targetSizeKB, setTargetSizeKB, originalSize,
  precisionMode, setPrecisionMode,
  format, setFormat, qualityWarning,
}: Props) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {/* Compression mode */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="font-display font-semibold text-sm">Compression</h3>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <Button
            variant={mode === "manual" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("manual")}
            className="flex-1 text-xs"
          >
            Manual Quality
          </Button>
          <Button
            variant={mode === "target" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("target")}
            className="flex-1 text-xs"
          >
            Target Size
          </Button>
        </div>

        {mode === "target" ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Target size (KB)</Label>
              <Input
                type="number"
                min={1}
                max={Math.round(originalSize / 1024)}
                value={targetSizeKB}
                onChange={(e) => setTargetSizeKB(Number(e.target.value))}
                className="mt-1"
              />
            </div>

            {/* Quick presets */}
            <div className="flex flex-wrap gap-2">
              {TARGET_PRESETS.filter(p => p < originalSize / 1024).map((p) => (
                <Button
                  key={p}
                  variant={targetSizeKB === p ? "default" : "outline"}
                  size="sm"
                  className="text-xs px-3 h-7"
                  onClick={() => setTargetSizeKB(p)}
                >
                  {p} KB
                </Button>
              ))}
            </div>

            {/* Precision toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">Exact size mode</Label>
                <p className="text-xs text-muted-foreground">Slower but more accurate</p>
              </div>
              <Switch checked={precisionMode} onCheckedChange={setPrecisionMode} />
            </div>

            {qualityWarning && (
              <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-2.5">
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  Very small target — image quality may be significantly reduced
                </p>
              </div>
            )}
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
            ? "PNG is lossless — quality slider has no effect."
            : format === "webp"
            ? "WebP offers the best size-to-quality ratio."
            : "JPEG is widely compatible with good compression."}
        </p>
      </div>
    </div>
  );
}
