export type OutputFormat = "jpeg" | "webp" | "png";
export type CompressionMode = "manual" | "target";

export interface CompressionResult {
  url: string;
  size: number;
  quality: number;
  dimensionReduced: boolean;
  finalWidth: number;
  finalHeight: number;
}
