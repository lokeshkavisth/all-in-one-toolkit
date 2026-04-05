import { useState, useRef, useCallback, useEffect } from "react";
import { Crop, RotateCw, FlipHorizontal, FlipVertical, Download, RefreshCw, Lock, Unlock } from "lucide-react";
import { ToolPageLayout } from "@/components/ToolPageLayout";
import { FileUploader } from "@/components/FileUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type AspectPreset = "free" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "3:2" | "2:3" | "custom";

const ASPECT_PRESETS: { value: AspectPreset; label: string; ratio: number | null }[] = [
  { value: "free", label: "Free", ratio: null },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
  { value: "3:4", label: "3:4", ratio: 3 / 4 },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "9:16", label: "9:16", ratio: 9 / 16 },
  { value: "3:2", label: "3:2", ratio: 3 / 2 },
  { value: "2:3", label: "2:3", ratio: 2 / 3 },
  { value: "custom", label: "Custom", ratio: null },
];

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

export default function ImageCropper() {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [image, setImage] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropBox>({ x: 0, y: 0, width: 0, height: 0 });
  const [aspect, setAspect] = useState<AspectPreset>("free");
  const [customW, setCustomW] = useState("4");
  const [customH, setCustomH] = useState("3");
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [format, setFormat] = useState("png");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cropStart, setCropStart] = useState<CropBox>({ x: 0, y: 0, width: 0, height: 0 });
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);

  const getAspectRatio = useCallback((): number | null => {
    const preset = ASPECT_PRESETS.find((p) => p.value === aspect);
    if (!preset) return null;
    if (aspect === "custom") {
      const w = parseFloat(customW);
      const h = parseFloat(customH);
      if (w > 0 && h > 0) return w / h;
      return null;
    }
    return preset.ratio;
  }, [aspect, customW, customH]);

  const constrainCrop = useCallback(
    (box: CropBox, maxW: number, maxH: number): CropBox => {
      const ratio = getAspectRatio();
      let { x, y, width, height } = box;
      width = clamp(width, 20, maxW);
      height = clamp(height, 20, maxH);
      if (ratio) {
        if (width / height > ratio) {
          width = height * ratio;
        } else {
          height = width / ratio;
        }
        width = Math.min(width, maxW);
        height = Math.min(height, maxH);
        if (ratio) {
          height = width / ratio;
          if (height > maxH) {
            height = maxH;
            width = height * ratio;
          }
        }
      }
      x = clamp(x, 0, maxW - width);
      y = clamp(y, 0, maxH - height);
      return { x, y, width, height };
    },
    [getAspectRatio]
  );

  const initCrop = useCallback(
    (dw: number, dh: number) => {
      const ratio = getAspectRatio();
      let cw = dw * 0.8;
      let ch = dh * 0.8;
      if (ratio) {
        if (cw / ch > ratio) {
          cw = ch * ratio;
        } else {
          ch = cw / ratio;
        }
      }
      setCrop({
        x: (dw - cw) / 2,
        y: (dh - ch) / 2,
        width: cw,
        height: ch,
      });
    },
    [getAspectRatio]
  );

  const loadImage = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          imgRef.current = img;
          setImage(src);
          setImageSize({ w: img.width, h: img.height });
          setRotation(0);
          setFlipH(false);
          setFlipV(false);
          setCroppedUrl(null);

          // Compute display size after a tick
          requestAnimationFrame(() => {
            if (!containerRef.current) return;
            const maxW = containerRef.current.clientWidth;
            const maxH = 500;
            const scale = Math.min(maxW / img.width, maxH / img.height, 1);
            const dw = img.width * scale;
            const dh = img.height * scale;
            setDisplaySize({ w: dw, h: dh });
            initCrop(dw, dh);
          });
        };
        img.src = src;
      };
      reader.readAsDataURL(files[0]);
    },
    [initCrop]
  );

  // Recalculate crop when aspect changes
  useEffect(() => {
    if (displaySize.w > 0) {
      initCrop(displaySize.w, displaySize.h);
    }
  }, [aspect, customW, customH]);

  const getMousePos = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getMousePos(e);
    setDragging(handle);
    setDragStart(pos);
    setCropStart({ ...crop });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      const pos = getMousePos(e);
      const dx = pos.x - dragStart.x;
      const dy = pos.y - dragStart.y;
      const maxW = displaySize.w;
      const maxH = displaySize.h;

      if (dragging === "move") {
        setCrop(
          constrainCrop(
            {
              x: cropStart.x + dx,
              y: cropStart.y + dy,
              width: cropStart.width,
              height: cropStart.height,
            },
            maxW,
            maxH
          )
        );
      } else {
        let newBox = { ...cropStart };
        if (dragging.includes("e")) newBox.width = cropStart.width + dx;
        if (dragging.includes("w")) {
          newBox.x = cropStart.x + dx;
          newBox.width = cropStart.width - dx;
        }
        if (dragging.includes("s")) newBox.height = cropStart.height + dy;
        if (dragging.includes("n")) {
          newBox.y = cropStart.y + dy;
          newBox.height = cropStart.height - dy;
        }
        setCrop(constrainCrop(newBox, maxW, maxH));
      }
    },
    [dragging, dragStart, cropStart, displaySize, constrainCrop]
  );

  const handleMouseUp = () => setDragging(null);

  const doCrop = useCallback(() => {
    if (!imgRef.current || !canvasRef.current) return;
    const img = imgRef.current;
    const scale = img.width / displaySize.w;
    const sx = crop.x * scale;
    const sy = crop.y * scale;
    const sw = crop.width * scale;
    const sh = crop.height * scale;

    const canvas = canvasRef.current;
    // Handle rotation
    const isRotated = rotation === 90 || rotation === 270;
    const outW = isRotated ? sh : sw;
    const outH = isRotated ? sw : sh;
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, outW, outH);
    ctx.save();
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    if (flipH) ctx.scale(-1, 1);
    if (flipV) ctx.scale(1, -1);
    ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();

    const mime = format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
    const url = canvas.toDataURL(mime, 0.92);
    setCroppedUrl(url);
    toast({ title: "Image cropped!", description: `${Math.round(outW)} × ${Math.round(outH)} px` });
  }, [crop, displaySize, rotation, flipH, flipV, format, toast]);

  const downloadCropped = () => {
    if (!croppedUrl) return;
    const a = document.createElement("a");
    a.href = croppedUrl;
    a.download = `cropped.${format}`;
    a.click();
  };

  const handles = ["nw", "ne", "sw", "se", "n", "s", "e", "w"];

  const handleCursor = (h: string) => {
    const map: Record<string, string> = {
      nw: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", se: "nwse-resize",
      n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
    };
    return map[h] || "move";
  };

  const handlePos = (h: string) => {
    const { x, y, width, height } = crop;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const map: Record<string, { left: number; top: number }> = {
      nw: { left: x, top: y }, ne: { left: x + width, top: y },
      sw: { left: x, top: y + height }, se: { left: x + width, top: y + height },
      n: { left: cx, top: y }, s: { left: cx, top: y + height },
      e: { left: x + width, top: cy }, w: { left: x, top: cy },
    };
    return map[h];
  };

  return (
    <ToolPageLayout
      title="Crop Image"
      description="Crop images with custom or preset aspect ratios"
      icon={Crop}
      category="image"
      categoryLabel="Image Tools"
    >
      {!image ? (
        <FileUploader
          accept="image/*"
          onFilesSelected={loadImage}
          label="Drop your image here"
          description="Supports JPG, PNG, WebP — Max 20MB"
        />
      ) : (
        <div className="space-y-6">
          {/* Controls bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
            {/* Aspect presets */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Aspect Ratio</Label>
              <ToggleGroup
                type="single"
                value={aspect}
                onValueChange={(v) => v && setAspect(v as AspectPreset)}
                className="flex flex-wrap"
              >
                {ASPECT_PRESETS.filter((p) => p.value !== "custom").map((p) => (
                  <ToggleGroupItem
                    key={p.value}
                    value={p.value}
                    className="text-xs px-2.5 py-1 h-8 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {p.label}
                  </ToggleGroupItem>
                ))}
                <ToggleGroupItem
                  value="custom"
                  className="text-xs px-2.5 py-1 h-8 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  Custom
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {aspect === "custom" && (
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                  className="w-16 h-8 text-xs"
                  min={1}
                />
                <span className="text-muted-foreground text-xs">:</span>
                <Input
                  type="number"
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                  className="w-16 h-8 text-xs"
                  min={1}
                />
              </div>
            )}

            <div className="h-8 w-px bg-border mx-1 hidden sm:block" />

            {/* Transform buttons */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                title="Rotate 90°"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={flipH ? "default" : "outline"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setFlipH((f) => !f)}
                title="Flip Horizontal"
              >
                <FlipHorizontal className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={flipV ? "default" : "outline"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setFlipV((f) => !f)}
                title="Flip Vertical"
              >
                <FlipVertical className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="h-8 w-px bg-border mx-1 hidden sm:block" />

            {/* Format */}
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="jpeg">JPEG</SelectItem>
                <SelectItem value="webp">WebP</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1" />

            <Button variant="outline" size="sm" onClick={() => { setImage(null); setCroppedUrl(null); }}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> New Image
            </Button>
          </div>

          {/* Crop area */}
          <div className="rounded-xl border bg-muted/30 p-4 flex justify-center overflow-hidden">
            <div
              ref={containerRef}
              className="relative select-none"
              style={{ width: displaySize.w, height: displaySize.h }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Image */}
              <img
                src={image}
                alt="Source"
                className="block pointer-events-none"
                style={{
                  width: displaySize.w,
                  height: displaySize.h,
                  transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                }}
                draggable={false}
              />

              {/* Dark overlay outside crop */}
              <div className="absolute inset-0 pointer-events-none" style={{
                background: `
                  linear-gradient(to right,
                    rgba(0,0,0,0.5) ${(crop.x / displaySize.w) * 100}%,
                    transparent ${(crop.x / displaySize.w) * 100}%,
                    transparent ${((crop.x + crop.width) / displaySize.w) * 100}%,
                    rgba(0,0,0,0.5) ${((crop.x + crop.width) / displaySize.w) * 100}%
                  )`,
              }} />
              {/* Top overlay */}
              <div className="absolute pointer-events-none bg-black/50" style={{
                left: crop.x, top: 0, width: crop.width, height: crop.y,
              }} />
              {/* Bottom overlay */}
              <div className="absolute pointer-events-none bg-black/50" style={{
                left: crop.x, top: crop.y + crop.height, width: crop.width,
                height: displaySize.h - crop.y - crop.height,
              }} />

              {/* Crop box */}
              <div
                className="absolute border-2 border-primary"
                style={{
                  left: crop.x, top: crop.y, width: crop.width, height: crop.height,
                  cursor: "move",
                }}
                onMouseDown={(e) => handleMouseDown(e, "move")}
              >
                {/* Grid lines */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-primary/30" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-primary/30" />
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-primary/30" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-primary/30" />
                </div>
              </div>

              {/* Resize handles */}
              {handles.map((h) => {
                const pos = handlePos(h);
                return (
                  <div
                    key={h}
                    className="absolute w-3 h-3 bg-primary border-2 border-primary-foreground rounded-sm z-10"
                    style={{
                      left: pos.left - 6,
                      top: pos.top - 6,
                      cursor: handleCursor(h),
                    }}
                    onMouseDown={(e) => handleMouseDown(e, h)}
                  />
                );
              })}

              {/* Size indicator */}
              <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-card px-2 py-0.5 rounded border">
                {Math.round(crop.width * (imageSize.w / displaySize.w))} × {Math.round(crop.height * (imageSize.h / displaySize.h))} px
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-center gap-3">
            <Button onClick={doCrop} size="lg">
              <Crop className="h-4 w-4 mr-2" /> Crop Image
            </Button>
            {croppedUrl && (
              <Button onClick={downloadCropped} variant="outline" size="lg">
                <Download className="h-4 w-4 mr-2" /> Download
              </Button>
            )}
          </div>

          {/* Preview */}
          {croppedUrl && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="font-display font-semibold mb-3">Cropped Result</h3>
              <div className="flex justify-center bg-muted/30 rounded-lg p-4">
                <img src={croppedUrl} alt="Cropped" className="max-w-full max-h-96 rounded" />
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </ToolPageLayout>
  );
}
