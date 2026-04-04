import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { formatBytes } from "./utils";
import type { CompressionResult } from "./types";

interface Props {
  result: CompressionResult;
  targetSizeKB: number;
}

export function ResultFeedback({ result, targetSizeKB }: Props) {
  const targetBytes = targetSizeKB * 1024;
  const ratio = result.size / targetBytes;
  const isMatch = ratio <= 1;
  const isClose = ratio <= 1.1;

  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${
      isMatch ? "border-green-500/30 bg-green-500/5" : isClose ? "border-yellow-500/30 bg-yellow-500/5" : "border-destructive/30 bg-destructive/5"
    }`}>
      {isMatch ? (
        <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
      ) : isClose ? (
        <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {isMatch ? "✅ Target reached!" : isClose ? "⚠️ Slightly above target" : "⚠️ Above target — try \"Try Harder\""}
        </p>
        <p className="text-xs text-muted-foreground">
          Final: {formatBytes(result.size)} · Target: {targetSizeKB} KB · Quality: {result.quality}%
        </p>
        {result.dimensionReduced && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" /> Resolution reduced to {result.finalWidth}×{result.finalHeight} to reach target size
          </p>
        )}
      </div>
    </div>
  );
}
