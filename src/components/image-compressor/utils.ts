export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function reductionPercent(original: number, compressed: number): string {
  if (!original) return "0%";
  const pct = ((1 - compressed / original) * 100).toFixed(1);
  return `${pct}%`;
}
