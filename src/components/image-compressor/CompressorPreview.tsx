import { useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "./utils";
import type { CompressionResult } from "./types";

interface Props {
  preview: string;
  result: CompressionResult | null;
  originalSize: number;
}

export function CompressorPreview({ preview, result, originalSize }: Props) {
  const [comparing, setComparing] = useState(false);

  return (
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
            {comparing ? "Hide comparison" : "Before / After"}
          </Button>
        )}
      </div>

      {comparing && result ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="bg-secondary/30 rounded-lg p-3 max-h-64 overflow-hidden flex items-center justify-center">
              <img src={preview} alt="Original" className="max-h-56 object-contain rounded" />
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
            src={result?.url || preview}
            alt="Preview"
            className="max-h-72 object-contain rounded"
          />
        </div>
      )}
    </div>
  );
}
