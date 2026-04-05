import { useState, useRef, useCallback, useEffect } from "react";
import { Crop, RotateCw, FlipHorizontal, FlipVertical, Download, RefreshCw } from "lucide-react";
import { ToolPageLayout } from "@/components/ToolPageLayout";
import { FileUploader } from "@/components/FileUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [pixelW, setPixelW] = useState("");
  const [pixelH, setPixelH] = useState("");

  const applyCropPixels = useCallback(() => {
    const pw = parseInt(pixelW);
    const ph = parseInt(pixelH);
    if (!pw || !ph || pw <= 0 || ph <= 0 || displaySize.w === 0) return;
    const scaleX = displaySize.w / imageSize.w;
    const scaleY = displaySize.h / imageSize.h;
    const dw = clamp(pw * scaleX, 20, displaySize.w);
    const dh = clamp(ph * scaleY, 20, displaySize.h);
    setCrop(prev => ({
      x: clamp(prev.x, 0, displaySize.w - dw),
      y: clamp(prev.y, 0, displaySize.h - dh),
      width: dw,
      height: dh,
    }));
    setAspect("free");
  }, [pixelW, pixelH, displaySize, imageSize]);

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
        if (cw / ch > ratio) cw = ch * ratio;
        else ch = cw / ratio;
      }
      setCrop({ x: (dw - cw) / 2, y: (dh - ch) / 2, width: cw, height: ch });
    },
    [getAspectRatio]
  );

  const computeDisplay = useCallback(() => {
    if (!containerRef.current || !imgRef.current) return;
    const img = imgRef.current;
    const maxW = containerRef.current.clientWidth;
    const maxH = 500;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const dw = img.width * scale;
    const dh = img.height * scale;
    setDisplaySize({ w: dw, h: dh });
    return { dw, dh };
  }, []);

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
          requestAnimationFrame(() => {
            const dims = computeDisplay();
            if (dims) initCrop(dims.dw, dims.dh);
          });
        };
        img.src = src;
      };
      reader.readAsDataURL(files[0]);
    },
    [initCrop, computeDisplay]
  );

  useEffect(() => {
    if (displaySize.w > 0) initCrop(displaySize.w, displaySize.h);
  }, [aspect, customW, customH]);

  // Recompute display on window resize
  useEffect(() => {
    const handler = () => {
      if (!imgRef.current) return;
      const dims = computeDisplay();
      if (dims) initCrop(dims.dw, dims.dh);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [computeDisplay, initCrop]);

  const getMousePos = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
    setDragStart(getMousePos(e));
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
        setCrop(constrainCrop({ x: cropStart.x + dx, y: cropStart.y + dy, width: cropStart.width, height: cropStart.height }, maxW, maxH));
      } else {
        let newBox = { ...cropStart };
        if (dragging.includes("e")) newBox.width = cropStart.width + dx;
        if (dragging.includes("w")) { newBox.x = cropStart.x + dx; newBox.width = cropStart.width - dx; }
        if (dragging.includes("s")) newBox.height = cropStart.height + dy;
        if (dragging.includes("n")) { newBox.y = cropStart.y + dy; newBox.height = cropStart.height - dy; }
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
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* LEFT: Controls */}
          <div className="space-y-5 order-2 lg:order-1">
            {/* Aspect Ratio */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aspect Ratio</Label>
              <ToggleGroup
                type="single"
                value={aspect}
                onValueChange={(v) => v && setAspect(v as AspectPreset)}
                className="flex flex-wrap gap-1.5"
              >
                {ASPECT_PRESETS.filter((p) => p.value !== "custom").map((p) => (
                  <ToggleGroupItem
                    key={p.value}
                    value={p.value}
                    className="text-xs px-2.5 py-1 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {p.label}
                  </ToggleGroupItem>
                ))}
                <ToggleGroupItem
                  value="custom"
                  className="text-xs px-2.5 py-1 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  Custom
                </ToggleGroupItem>
              </ToggleGroup>

              {aspect === "custom" && (
                <div className="flex items-center gap-1.5 pt-1">
                  <Input type="number" value={customW} onChange={(e) => setCustomW(e.target.value)} className="w-16 h-8 text-xs" min={1} />
                  <span className="text-muted-foreground text-xs">:</span>
                  <Input type="number" value={customH} onChange={(e) => setCustomH(e.target.value)} className="w-16 h-8 text-xs" min={1} />
                </div>
              )}
            </div>

            {/* Transform */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transform</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate 90°">
                  <RotateCw className="h-4 w-4" />
                </Button>
                <Button variant={flipH ? "default" : "outline"} size="icon" className="h-9 w-9" onClick={() => setFlipH((f) => !f)} title="Flip Horizontal">
                  <FlipHorizontal className="h-4 w-4" />
                </Button>
                <Button variant={flipV ? "default" : "outline"} size="icon" className="h-9 w-9" onClick={() => setFlipV((f) => !f)} title="Flip Vertical">
                  <FlipVertical className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Rotation: {rotation}° {flipH && "• Flipped H"} {flipV && "• Flipped V"}
              </p>
            </div>

            {/* Output Format */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Output Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="jpeg">JPEG</SelectItem>
                  <SelectItem value="webp">WebP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Crop Size & Custom Pixels */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Crop Size</Label>
              <p className="text-sm font-medium">
                {Math.round(crop.width * (imageSize.w / displaySize.w))} × {Math.round(crop.height * (imageSize.h / displaySize.h))} px
              </p>
              <p className="text-xs text-muted-foreground">
                Original: {imageSize.w} × {imageSize.h} px
              </p>
              <div className="border-t pt-3 space-y-2">
                <Label className="text-xs text-muted-foreground">Set exact size (pixels)</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    placeholder="Width"
                    value={pixelW}
                    onChange={(e) => setPixelW(e.target.value)}
                    className="h-8 text-xs"
                    min={1}
                    max={imageSize.w}
                  />
                  <span className="text-muted-foreground text-xs">×</span>
                  <Input
                    type="number"
                    placeholder="Height"
                    value={pixelH}
                    onChange={(e) => setPixelH(e.target.value)}
                    className="h-8 text-xs"
                    min={1}
                    max={imageSize.h}
                  />
                  <Button variant="secondary" size="sm" className="h-8 px-3 text-xs shrink-0" onClick={applyCropPixels}>
                    Apply
                  </Button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <Button onClick={doCrop} className="w-full" size="lg">
                <Crop className="h-4 w-4 mr-2" /> Crop Image
              </Button>
              {croppedUrl && (
                <Button onClick={downloadCropped} variant="outline" className="w-full" size="lg">
                  <Download className="h-4 w-4 mr-2" /> Download
                </Button>
              )}
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => { setImage(null); setCroppedUrl(null); }}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Upload New Image
              </Button>
            </div>
          </div>

          {/* RIGHT: Preview */}
          <div className="space-y-4 order-1 lg:order-2">
            {/* Crop area */}
            <div className="rounded-xl border bg-muted/30 p-4 flex justify-center overflow-hidden">
              <div
                ref={containerRef}
                className="relative select-none"
                style={{ width: displaySize.w || "100%", height: displaySize.h || "auto" }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  src={image}
                  alt="Source"
                  className="block pointer-events-none"
                  style={{
                    width: displaySize.w || "100%",
                    height: displaySize.h || "auto",
                    transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                  }}
                  draggable={false}
                />

                {/* Dark overlay outside crop */}
                <div className="absolute inset-0 pointer-events-none" style={{
                  background: `linear-gradient(to right,
                    rgba(0,0,0,0.5) ${(crop.x / displaySize.w) * 100}%,
                    transparent ${(crop.x / displaySize.w) * 100}%,
                    transparent ${((crop.x + crop.width) / displaySize.w) * 100}%,
                    rgba(0,0,0,0.5) ${((crop.x + crop.width) / displaySize.w) * 100}%)`,
                }} />
                <div className="absolute pointer-events-none bg-black/50" style={{ left: crop.x, top: 0, width: crop.width, height: crop.y }} />
                <div className="absolute pointer-events-none bg-black/50" style={{ left: crop.x, top: crop.y + crop.height, width: crop.width, height: displaySize.h - crop.y - crop.height }} />

                {/* Crop box */}
                <div
                  className="absolute border-2 border-primary"
                  style={{ left: crop.x, top: crop.y, width: crop.width, height: crop.height, cursor: "move" }}
                  onMouseDown={(e) => handleMouseDown(e, "move")}
                >
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
                      style={{ left: pos.left - 6, top: pos.top - 6, cursor: handleCursor(h) }}
                      onMouseDown={(e) => handleMouseDown(e, h)}
                    />
                  );
                })}
              </div>
            </div>

            {/* Cropped result */}
            {croppedUrl && (
              <div className="rounded-xl border bg-card p-4">
                <h3 className="font-display font-semibold mb-3">Cropped Result</h3>
                <div className="flex justify-center bg-muted/30 rounded-lg p-4">
                  <img src={croppedUrl} alt="Cropped" className="max-w-full max-h-72 rounded" />
                </div>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </ToolPageLayout>
  );
}
