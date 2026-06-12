export type Tool =
  | "select"
  | "text"
  | "image"
  | "signature"
  | "whiteout"
  | "highlight"
  | "draw"
  | "rect"
  | "ellipse"
  | "line";

export interface ToolConfig {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  underline: boolean;
  highlightColor: string;
  drawColor: string;
}

export const DEFAULT_CONFIG: ToolConfig = {
  fill: "#111111",
  stroke: "#111111",
  strokeWidth: 2,
  fontSize: 16,
  fontFamily: "Helvetica",
  fontWeight: "normal",
  fontStyle: "normal",
  underline: false,
  highlightColor: "#ffeb3b",
  drawColor: "#e53935",
};
