import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  Canvas,
  Textbox,
  Rect,
  Ellipse,
  Line,
  PencilBrush,
  FabricImage,
  FabricObject,
  type TPointerEvent,
  type TPointerEventInfo,
} from "fabric";
import type { EditorPage } from "@/lib/pdf-editor/pdfDoc";
import type { Tool, ToolConfig } from "./types";

export interface PageCanvasHandle {
  getCanvas: () => Canvas | null;
  serialize: () => string;
  renderOverlayPng: (targetWidth: number, targetHeight: number) => Promise<string | null>;
  addImageFromUrl: (url: string) => Promise<void>;
  deleteSelected: () => void;
  bringForward: () => void;
  sendBackward: () => void;
}

interface Props {
  page: EditorPage;
  active: boolean;
  tool: Tool;
  config: ToolConfig;
  zoom: number;
  onChange: (json: string) => void;
  onActivate: () => void;
  onSelectionChange?: (obj: FabricObject | null) => void;
}

export const PageCanvas = forwardRef<PageCanvasHandle, Props>(function PageCanvas(
  { page, active, tool, config, zoom, onChange, onActivate, onSelectionChange },
  ref,
) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabRef = useRef<Canvas | null>(null);
  const toolRef = useRef<Tool>(tool);
  const cfgRef = useRef<ToolConfig>(config);
  const drawingRef = useRef<{ obj: FabricObject; startX: number; startY: number } | null>(null);

  // Init fabric once per page
  useEffect(() => {
    if (!canvasElRef.current) return;
    const c = new Canvas(canvasElRef.current, {
      width: page.displayWidth,
      height: page.displayHeight,
      backgroundColor: "transparent",
      preserveObjectStacking: true,
      selection: true,
    });
    fabRef.current = c;

    if (page.overlayJson) {
      c.loadFromJSON(page.overlayJson).then(() => c.requestRenderAll());
    }

    const save = () => onChange(JSON.stringify(c.toJSON()));
    c.on("object:modified", save);
    c.on("object:added", save);
    c.on("object:removed", save);
    c.on("path:created", save);

    c.on("selection:created", (e) => onSelectionChange?.(e.selected?.[0] ?? null));
    c.on("selection:updated", (e) => onSelectionChange?.(e.selected?.[0] ?? null));
    c.on("selection:cleared", () => onSelectionChange?.(null));

    c.on("mouse:down", (opt) => {
      onActivate();
      handleMouseDown(opt);
    });
    c.on("mouse:move", handleMouseMove);
    c.on("mouse:up", handleMouseUp);

    return () => {
      c.dispose();
      fabRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  // Sync tool / config / zoom
  useEffect(() => {
    toolRef.current = tool;
    const c = fabRef.current;
    if (!c) return;
    const drawing = tool === "draw" || tool === "highlight";
    if (tool === "draw") {
      c.isDrawingMode = true;
      const brush = new PencilBrush(c);
      brush.color = config.drawColor;
      brush.width = config.strokeWidth;
      c.freeDrawingBrush = brush;
    } else if (tool === "highlight" && false) {
      // we implement highlight via drag rect, not free draw
    } else {
      c.isDrawingMode = false;
    }
    c.selection = tool === "select";
    c.skipTargetFind = tool !== "select";
    c.defaultCursor =
      tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";
    void drawing;
  }, [tool, config.drawColor, config.strokeWidth]);

  useEffect(() => {
    cfgRef.current = config;
  }, [config]);

  useEffect(() => {
    const c = fabRef.current;
    if (!c) return;
    c.setZoom(zoom);
    c.setDimensions({
      width: page.displayWidth * zoom,
      height: page.displayHeight * zoom,
    });
  }, [zoom, page.displayWidth, page.displayHeight]);

  function handleMouseDown(opt: TPointerEventInfo<TPointerEvent>) {
    const c = fabRef.current;
    if (!c) return;
    const t = toolRef.current;
    const cfg = cfgRef.current;
    const p = c.getViewportPoint(opt.e);
    const pt = { x: p.x / c.getZoom(), y: p.y / c.getZoom() };

    if (t === "text") {
      const tb = new Textbox("Type here", {
        left: pt.x,
        top: pt.y,
        width: 200,
        fontSize: cfg.fontSize,
        fontFamily: cfg.fontFamily,
        fontWeight: cfg.fontWeight,
        fontStyle: cfg.fontStyle,
        underline: cfg.underline,
        fill: cfg.fill,
        editable: true,
      });
      c.add(tb);
      c.setActiveObject(tb);
      tb.enterEditing();
      tb.selectAll();
      return;
    }

    if (t === "whiteout" || t === "highlight" || t === "rect") {
      const fill =
        t === "whiteout" ? "#ffffff" : t === "highlight" ? `${cfg.highlightColor}80` : cfg.fill;
      const obj = new Rect({
        left: pt.x,
        top: pt.y,
        width: 1,
        height: 1,
        fill,
        stroke: t === "rect" ? cfg.stroke : undefined,
        strokeWidth: t === "rect" ? cfg.strokeWidth : 0,
        rx: t === "highlight" ? 1 : 0,
        ry: t === "highlight" ? 1 : 0,
      });
      c.add(obj);
      drawingRef.current = { obj, startX: pt.x, startY: pt.y };
      return;
    }

    if (t === "ellipse") {
      const obj = new Ellipse({
        left: pt.x,
        top: pt.y,
        rx: 1,
        ry: 1,
        fill: "transparent",
        stroke: cfg.stroke,
        strokeWidth: cfg.strokeWidth,
      });
      c.add(obj);
      drawingRef.current = { obj, startX: pt.x, startY: pt.y };
      return;
    }

    if (t === "line") {
      const obj = new Line([pt.x, pt.y, pt.x, pt.y], {
        stroke: cfg.stroke,
        strokeWidth: cfg.strokeWidth,
      });
      c.add(obj);
      drawingRef.current = { obj, startX: pt.x, startY: pt.y };
      return;
    }
  }

  function handleMouseMove(opt: TPointerEventInfo<TPointerEvent>) {
    const c = fabRef.current;
    const drag = drawingRef.current;
    if (!c || !drag) return;
    const p = c.getViewportPoint(opt.e);
    const pt = { x: p.x / c.getZoom(), y: p.y / c.getZoom() };
    const { obj, startX, startY } = drag;
    const dx = pt.x - startX;
    const dy = pt.y - startY;

    if (obj instanceof Line) {
      obj.set({ x2: pt.x, y2: pt.y });
    } else if (obj instanceof Ellipse) {
      obj.set({
        rx: Math.abs(dx) / 2,
        ry: Math.abs(dy) / 2,
        left: Math.min(startX, pt.x),
        top: Math.min(startY, pt.y),
      });
    } else if (obj instanceof Rect) {
      obj.set({
        width: Math.abs(dx),
        height: Math.abs(dy),
        left: Math.min(startX, pt.x),
        top: Math.min(startY, pt.y),
      });
    }
    obj.setCoords();
    c.requestRenderAll();
  }

  function handleMouseUp() {
    const c = fabRef.current;
    const drag = drawingRef.current;
    if (!c || !drag) return;
    drawingRef.current = null;
    // Remove zero-size shapes
    const o = drag.obj;
    const w = (o.width ?? 0) * (o.scaleX ?? 1);
    const h = (o.height ?? 0) * (o.scaleY ?? 1);
    if (!(o instanceof Line) && w < 3 && h < 3) {
      c.remove(o);
    } else {
      c.fire("object:modified", { target: o });
    }
  }

  useImperativeHandle(ref, () => ({
    getCanvas: () => fabRef.current,
    serialize: () => (fabRef.current ? JSON.stringify(fabRef.current.toJSON()) : ""),
    async renderOverlayPng(targetWidth, targetHeight) {
      const c = fabRef.current;
      if (!c) return null;
      if (c.getObjects().length === 0) return null;
      const mult = targetWidth / page.displayWidth;
      // toDataURL returns full canvas; bg is transparent so this is overlay only
      const z = c.getZoom();
      c.setZoom(1);
      c.setDimensions({ width: page.displayWidth, height: page.displayHeight });
      const url = c.toDataURL({
        format: "png",
        multiplier: mult,
        width: page.displayWidth,
        height: page.displayHeight,
      });
      c.setZoom(z);
      c.setDimensions({ width: page.displayWidth * z, height: page.displayHeight * z });
      void targetHeight;
      return url;
    },
    async addImageFromUrl(url) {
      const c = fabRef.current;
      if (!c) return;
      const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
      const max = Math.min(page.displayWidth * 0.6, 400);
      const s = Math.min(1, max / (img.width ?? max));
      img.set({ left: 40, top: 40, scaleX: s, scaleY: s });
      c.add(img);
      c.setActiveObject(img);
    },
    deleteSelected() {
      const c = fabRef.current;
      if (!c) return;
      const objs = c.getActiveObjects();
      objs.forEach((o) => c.remove(o));
      c.discardActiveObject();
      c.requestRenderAll();
    },
    bringForward() {
      const c = fabRef.current;
      const o = c?.getActiveObject();
      if (c && o) {
        c.bringObjectForward(o);
        c.requestRenderAll();
      }
    },
    sendBackward() {
      const c = fabRef.current;
      const o = c?.getActiveObject();
      if (c && o) {
        c.sendObjectBackwards(o);
        c.requestRenderAll();
      }
    },
  }));

  return (
    <div
      className={`relative mx-auto bg-white shadow-md transition-shadow ${active ? "ring-2 ring-primary" : ""}`}
      style={{
        width: page.displayWidth * zoom,
        height: page.displayHeight * zoom,
      }}
      onMouseDown={onActivate}
    >
      <img
        src={page.bgDataUrl}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
        draggable={false}
        style={{
          transform: page.rotation ? `rotate(${page.rotation}deg)` : undefined,
        }}
      />
      <canvas ref={canvasElRef} className="absolute inset-0" />
    </div>
  );
});
