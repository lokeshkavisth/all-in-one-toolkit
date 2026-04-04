import { formatBytes, reductionPercent } from "./utils";
import type { CompressionResult } from "./types";

interface Props {
  originalSize: number;
  result: CompressionResult | null;
  bestPossibleSize: number | null;
}

export function CompressorStats({ originalSize, result, bestPossibleSize }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Original" value={formatBytes(originalSize)} />
        <StatCard
          label="Compressed"
          value={result ? formatBytes(result.size) : "—"}
          highlight
        />
        <StatCard
          label="Reduction"
          value={result ? reductionPercent(originalSize, result.size) : "—"}
        />
      </div>

      {bestPossibleSize && !result && (
        <p className="text-xs text-muted-foreground text-center">
          💡 Best possible size without visible quality loss: <span className="font-medium text-foreground">{formatBytes(bestPossibleSize)}</span>
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
