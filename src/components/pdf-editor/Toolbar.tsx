import {
  MousePointer2,
  Type,
  Image as ImageIcon,
  PenTool,
  Highlighter,
  Eraser,
  Pencil,
  Square,
  Circle as CircleIcon,
  Minus,
  Trash2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Tool, ToolConfig } from "./types";

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  config: ToolConfig;
  setConfig: (patch: Partial<ToolConfig>) => void;
  onAddImage: () => void;
  onSignature: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  setZoom: (z: number) => void;
  findOpen: boolean;
  setFindOpen: (b: boolean) => void;
  findText: string;
  setFindText: (s: string) => void;
  replaceText: string;
  setReplaceText: (s: string) => void;
  onFindReplace: (all: boolean) => void;
}

const tools: Array<{ id: Tool; icon: typeof Type; label: string }> = [
  { id: "select", icon: MousePointer2, label: "Select" },
  { id: "text", icon: Type, label: "Text" },
  { id: "image", icon: ImageIcon, label: "Image" },
  { id: "signature", icon: PenTool, label: "Signature" },
  { id: "whiteout", icon: Eraser, label: "Whiteout" },
  { id: "highlight", icon: Highlighter, label: "Highlight" },
  { id: "draw", icon: Pencil, label: "Draw" },
  { id: "rect", icon: Square, label: "Rectangle" },
  { id: "ellipse", icon: CircleIcon, label: "Ellipse" },
  { id: "line", icon: Minus, label: "Line" },
];

export function EditorToolbar(p: Props) {
  const isShape = ["rect", "ellipse", "line", "draw"].includes(p.tool);
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-wrap items-center gap-1 border-b bg-card px-2 py-1.5">
        {tools.map((t) => (
          <Tooltip key={t.id}>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={p.tool === t.id ? "default" : "ghost"}
                className="h-8 w-8"
                onClick={() => {
                  if (t.id === "image") p.onAddImage();
                  else if (t.id === "signature") p.onSignature();
                  else p.setTool(t.id);
                }}
              >
                <t.icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t.label}</TooltipContent>
          </Tooltip>
        ))}

        <Separator orientation="vertical" className="mx-1 h-6" />

        {p.tool === "text" && (
          <>
            <Input
              type="number"
              value={p.config.fontSize}
              onChange={(e) => p.setConfig({ fontSize: Number(e.target.value) || 16 })}
              className="h-8 w-16"
              min={6}
              max={120}
            />
            <input
              type="color"
              value={p.config.fill}
              onChange={(e) => p.setConfig({ fill: e.target.value })}
              className="h-8 w-8 cursor-pointer rounded border"
              title="Text color"
            />
            <Button
              size="sm"
              variant={p.config.fontWeight === "bold" ? "default" : "ghost"}
              onClick={() =>
                p.setConfig({ fontWeight: p.config.fontWeight === "bold" ? "normal" : "bold" })
              }
              className="h-8 w-8 px-0 font-bold"
            >
              B
            </Button>
            <Button
              size="sm"
              variant={p.config.fontStyle === "italic" ? "default" : "ghost"}
              onClick={() =>
                p.setConfig({ fontStyle: p.config.fontStyle === "italic" ? "normal" : "italic" })
              }
              className="h-8 w-8 px-0 italic"
            >
              I
            </Button>
            <Button
              size="sm"
              variant={p.config.underline ? "default" : "ghost"}
              onClick={() => p.setConfig({ underline: !p.config.underline })}
              className="h-8 w-8 px-0 underline"
            >
              U
            </Button>
          </>
        )}

        {p.tool === "highlight" && (
          <input
            type="color"
            value={p.config.highlightColor}
            onChange={(e) => p.setConfig({ highlightColor: e.target.value })}
            className="h-8 w-8 cursor-pointer rounded border"
            title="Highlight color"
          />
        )}

        {isShape && (
          <>
            <input
              type="color"
              value={p.tool === "draw" ? p.config.drawColor : p.config.stroke}
              onChange={(e) =>
                p.tool === "draw"
                  ? p.setConfig({ drawColor: e.target.value })
                  : p.setConfig({ stroke: e.target.value })
              }
              className="h-8 w-8 cursor-pointer rounded border"
              title="Color"
            />
            <Input
              type="number"
              value={p.config.strokeWidth}
              onChange={(e) => p.setConfig({ strokeWidth: Number(e.target.value) || 1 })}
              className="h-8 w-16"
              min={1}
              max={40}
              title="Stroke width"
            />
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => p.setFindOpen(!p.findOpen)}>
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Find &amp; replace</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={p.onUndo}>
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={p.onRedo}>
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={p.onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete selected</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => p.setZoom(Math.max(0.4, p.zoom - 0.1))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums">{Math.round(p.zoom * 100)}%</span>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => p.setZoom(Math.min(2.5, p.zoom + 0.1))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {p.findOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
          <Input
            value={p.findText}
            onChange={(e) => p.setFindText(e.target.value)}
            placeholder="Find"
            className="h-8 w-48"
          />
          <Input
            value={p.replaceText}
            onChange={(e) => p.setReplaceText(e.target.value)}
            placeholder="Replace"
            className="h-8 w-48"
          />
          <Button size="sm" variant="outline" onClick={() => p.onFindReplace(false)}>Replace</Button>
          <Button size="sm" onClick={() => p.onFindReplace(true)}>Replace all</Button>
          <span className="text-xs text-muted-foreground">
            Only edits text you added in the editor — not the original PDF text.
          </span>
        </div>
      )}
    </TooltipProvider>
  );
}
