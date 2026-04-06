import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, Download, Plus, Minus, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { ToolPageLayout } from "@/components/ToolPageLayout";
import { FileUploader } from "@/components/FileUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";

/* ──── Passport size presets (w×h in mm) ──── */
interface PhotoPreset {
  id: string;
  label: string;
  wMM: number;
  hMM: number;
}

const PHOTO_PRESETS: PhotoPreset[] = [
  { id: "us", label: "US (2×2 in)", wMM: 50.8, hMM: 50.8 },
  { id: "uk", label: "UK/EU (35×45)", wMM: 35, hMM: 45 },
  { id: "india", label: "India (51×51)", wMM: 51, hMM: 51 },
  { id: "schengen", label: "Schengen (35×45)", wMM: 35, hMM: 45 },
  { id: "canada", label: "Canada (50×70)", wMM: 50, hMM: 70 },
  { id: "china", label: "China (33×48)", wMM: 33, hMM: 48 },
];

/* ──── Page sizes (w×h in mm) ──── */
interface PageSize {
  id: string;
  label: string;
  wMM: number;
  hMM: number;
}

const PAGE_SIZES: PageSize[] = [
  { id: "a4", label: "A4 (210×297 mm)", wMM: 210, hMM: 297 },
  { id: "4x6", label: "4×6 inches", wMM: 101.6, hMM: 152.4 },
  { id: "6x4", label: "6×4 inches", wMM: 152.4, hMM: 101.6 },
];

const GAP_MM = 3;
const MARGIN_MM = 5;
const DPI = 300;
const MM_TO_PX = DPI / 25.4;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export default function PassportPhoto() {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Image state
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 });

  // Crop state — zoom is a multiplier where 1 = fill the crop box
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = fill, 2 = 2× etc.
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [offsetStart, setOffsetStart] = useState({ x: 0, y: 0 });

  // Settings
  const [presetId, setPresetId] = useState("us");
  const [pageSizeId, setPageSizeId] = useState("a4");
  const [quantity, setQuantity] = useState(8);
  const [showCutLines, setShowCutLines] = useState(true);

  // Result
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);
  const [step, setStep] = useState<"crop" | "layout">("crop");

  const preset = PHOTO_PRESETS.find((p) => p.id === presetId)!;
  const pageSize = PAGE_SIZES.find((p) => p.id === pageSizeId)!;

  // Compute how many photos fit per page
  const cols = Math.floor((pageSize.wMM - 2 * MARGIN_MM + GAP_MM) / (preset.wMM + GAP_MM));
  const rows = Math.floor((pageSize.hMM - 2 * MARGIN_MM + GAP_MM) / (preset.hMM + GAP_MM));
  const perPage = cols * rows;
  const totalPages = Math.ceil(quantity / perPage);

  /* ──── Crop viewport dimensions (display) ──── */
  const cropAspect = preset.wMM / preset.hMM;
  const CROP_DISPLAY_H = 340;
  const CROP_DISPLAY_W = CROP_DISPLAY_H * cropAspect;

  // Base scale: the scale at which the image exactly fills the crop viewport
  const baseScale = imageSize.w > 0
    ? Math.max(CROP_DISPLAY_W / imageSize.w, CROP_DISPLAY_H / imageSize.h)
    : 1;
  // Actual pixel scale = baseScale * zoomLevel
  const zoom = baseScale * zoomLevel;

  /* ──── Load image ──── */
  const loadImage = useCallback((files: File[]) => {
    if (!files.length) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        setImageSrc(src);
        setImageSize({ w: img.width, h: img.height });
        setRotation(0);
        setCroppedUrl(null);
        setCroppedBlob(null);
        setStep("crop");
        setZoomLevel(1);
        setOffsetX(0);
        setOffsetY(0);
      };
      img.src = src;
    };
    reader.readAsDataURL(files[0]);
  }, []);

  // Reset position when preset changes
  useEffect(() => {
    if (!imgRef.current) return;
    setZoomLevel(1);
    setOffsetX(0);
    setOffsetY(0);
  }, [presetId]);

  /* ──── Drag to pan ──── */
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setOffsetStart({ x: offsetX, y: offsetY });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      setOffsetX(offsetStart.x + (e.clientX - dragStart.x));
      setOffsetY(offsetStart.y + (e.clientY - dragStart.y));
    },
    [dragging, dragStart, offsetStart]
  );

  const handleMouseUp = () => setDragging(false);

  /* ──── Crop the photo ──── */
  const doCrop = useCallback(() => {
    if (!imgRef.current) return;
    const img = imgRef.current;

    // Output at 300 DPI
    const outW = Math.round(preset.wMM * MM_TO_PX);
    const outH = Math.round(preset.hMM * MM_TO_PX);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;

    // Scale from display coords to output coords
    const scaleToOutput = outW / CROP_DISPLAY_W;
    const drawW = img.width * zoom * scaleToOutput;
    const drawH = img.height * zoom * scaleToOutput;
    const drawX = offsetX * scaleToOutput + (outW - drawW) / 2;
    const drawY = offsetY * scaleToOutput + (outH - drawH) / 2;

    ctx.save();
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-outW / 2, -outH / 2);
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCroppedBlob(blob);
        setCroppedUrl(URL.createObjectURL(blob));
        setStep("layout");
        toast({ title: "Photo cropped!", description: `${outW}×${outH} px at 300 DPI` });
      },
      "image/jpeg",
      0.95
    );
  }, [zoom, offsetX, offsetY, rotation, preset, CROP_DISPLAY_W, CROP_DISPLAY_H, toast]);

  /* ──── Render page preview ──── */
  const renderPagePreview = (pageIndex: number) => {
    const startIdx = pageIndex * perPage;
    const count = Math.min(quantity - startIdx, perPage);
    if (count <= 0) return null;

    // Scale page to fit preview
    const PREVIEW_MAX_W = 360;
    const PREVIEW_MAX_H = 480;
    const pageScale = Math.min(PREVIEW_MAX_W / pageSize.wMM, PREVIEW_MAX_H / pageSize.hMM);
    const pw = pageSize.wMM * pageScale;
    const ph = pageSize.hMM * pageScale;
    const marginS = MARGIN_MM * pageScale;
    const gapS = GAP_MM * pageScale;
    const photoW = preset.wMM * pageScale;
    const photoH = preset.hMM * pageScale;

    // Center the grid
    const gridW = cols * photoW + (cols - 1) * gapS;
    const gridH = rows * photoH + (rows - 1) * gapS;
    const startX = (pw - gridW) / 2;
    const startY = (ph - gridH) / 2;

    const photos = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (photoW + gapS);
      const y = startY + row * (photoH + gapS);
      photos.push(
        <div key={i}>
          {showCutLines && (
            <div
              className="absolute border border-dashed"
              style={{
                left: x - 1,
                top: y - 1,
                width: photoW + 2,
                height: photoH + 2,
                borderColor: "hsl(var(--muted-foreground) / 0.3)",
              }}
            />
          )}
          <img
            src={croppedUrl!}
            alt={`Photo ${i + 1}`}
            className="absolute object-cover"
            style={{ left: x, top: y, width: photoW, height: photoH }}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-2" key={pageIndex}>
        <div
          className="relative bg-white border shadow-sm"
          style={{ width: pw, height: ph }}
        >
          {/* Margin indicator */}
          <div
            className="absolute border border-dashed"
            style={{
              left: marginS,
              top: marginS,
              width: pw - 2 * marginS,
              height: ph - 2 * marginS,
              borderColor: "hsl(var(--muted-foreground) / 0.15)",
            }}
          />
          {photos}
        </div>
        <span className="text-xs text-muted-foreground">
          Page {pageIndex + 1} of {totalPages}
        </span>
      </div>
    );
  };

  /* ──── Download as PDF ──── */
  const downloadPDF = useCallback(async () => {
    if (!croppedBlob) return;
    const { jsPDF } = await import("jspdf");

    const doc = new jsPDF({
      orientation: pageSize.wMM > pageSize.hMM ? "landscape" : "portrait",
      unit: "mm",
      format: [pageSize.wMM, pageSize.hMM],
    });

    const imgDataUrl = croppedUrl!;

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) doc.addPage([pageSize.wMM, pageSize.hMM]);

      const startIdx = page * perPage;
      const count = Math.min(quantity - startIdx, perPage);

      const gridW = cols * preset.wMM + (cols - 1) * GAP_MM;
      const gridH = rows * preset.hMM + (rows - 1) * GAP_MM;
      const startX = (pageSize.wMM - gridW) / 2;
      const startY = (pageSize.hMM - gridH) / 2;

      if (showCutLines) {
        doc.setDrawColor(180);
        doc.setLineWidth(0.1);
      }

      for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (preset.wMM + GAP_MM);
        const y = startY + row * (preset.hMM + GAP_MM);
        doc.addImage(imgDataUrl, "JPEG", x, y, preset.wMM, preset.hMM);
        if (showCutLines) {
          doc.rect(x, y, preset.wMM, preset.hMM);
        }
      }
    }

    doc.save("passport-photos.pdf");
    toast({ title: "PDF downloaded!", description: `${totalPages} page(s) with ${quantity} photos` });
  }, [croppedBlob, croppedUrl, quantity, totalPages, perPage, cols, rows, preset, pageSize, showCutLines, toast]);

  /* ──── Download single cropped photo ──── */
  const downloadSingle = () => {
    if (!croppedUrl) return;
    const a = document.createElement("a");
    a.href = croppedUrl;
    a.download = "passport-photo.jpg";
    a.click();
  };

  /* ──── UI ──── */
  return (
    <ToolPageLayout
      title="Passport Photo Maker"
      description="Create standard passport-size photos and arrange them on printable sheets"
      icon={Camera}
      category="image"
      categoryLabel="Image Tools"
    >
      {!imageSrc ? (
        <FileUploader
          accept="image/*"
          onFilesSelected={loadImage}
          label="Upload your photo"
          description="Supports JPG, PNG, WebP — Max 20MB"
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
          {/* ── LEFT CONTROLS ── */}
          <div className="space-y-4 order-2 lg:order-1">
            {/* Photo Size Preset */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Passport Size
              </Label>
              <ToggleGroup
                type="single"
                value={presetId}
                onValueChange={(v) => {
                  if (v) {
                    setPresetId(v);
                    if (step === "layout") setStep("crop");
                  }
                }}
                className="flex flex-wrap gap-1.5"
              >
                {PHOTO_PRESETS.map((p) => (
                  <ToggleGroupItem
                    key={p.id}
                    value={p.id}
                    className="text-xs px-2.5 py-1 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {p.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                {preset.wMM} × {preset.hMM} mm
              </p>
            </div>

            {step === "crop" ? (
              <>
                {/* Zoom & Rotate */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Adjust Photo
                  </Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
                      <Slider
                        value={[zoomLevel]}
                        onValueChange={([v]) => setZoomLevel(v)}
                        min={0.5}
                        max={4}
                        step={0.01}
                        className="flex-1"
                      />
                      <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">{Math.round(zoomLevel * 100)}% zoom</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                  >
                    <RotateCw className="h-3.5 w-3.5 mr-1.5" />
                    Rotate 90°
                  </Button>
                </div>

                {/* Crop button */}
                <Button onClick={doCrop} className="w-full" size="lg">
                  <Camera className="h-4 w-4 mr-2" /> Crop Photo
                </Button>
              </>
            ) : (
              <>
                {/* Quantity */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Quantity
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(clamp(parseInt(e.target.value) || 1, 1, 100))}
                      className="h-8 w-16 text-center text-sm"
                      min={1}
                      max={100}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setQuantity((q) => Math.min(100, q + 1))}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[4, 6, 8, 12].map((n) => (
                      <Button
                        key={n}
                        variant={quantity === n ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-3 text-xs"
                        onClick={() => setQuantity(n)}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Page Size */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Page Size
                  </Label>
                  <Select value={pageSizeId} onValueChange={setPageSizeId}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Fits {cols}×{rows} = {perPage} photos/page • {totalPages} page(s)
                  </p>
                </div>

                {/* Options */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Options
                  </Label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showCutLines}
                      onChange={(e) => setShowCutLines(e.target.checked)}
                      className="rounded border-input"
                    />
                    Include cut lines
                  </label>
                </div>

                {/* Actions */}
                <div className="space-y-2">
                  <Button onClick={downloadPDF} className="w-full" size="lg">
                    <Download className="h-4 w-4 mr-2" /> Download PDF
                  </Button>
                  <Button onClick={downloadSingle} variant="outline" className="w-full" size="sm">
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Download Single Photo
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                    onClick={() => setStep("crop")}
                  >
                    ← Back to Crop
                  </Button>
                </div>
              </>
            )}

            {/* Upload new */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => {
                setImageSrc(null);
                setCroppedUrl(null);
                setCroppedBlob(null);
              }}
            >
              Upload New Photo
            </Button>
          </div>

          {/* ── RIGHT PREVIEW ── */}
          <div className="space-y-4 order-1 lg:order-2">
            {step === "crop" ? (
              /* Crop preview */
              <div className="rounded-xl border bg-muted/30 p-6 flex flex-col items-center gap-4">
                <p className="text-sm font-medium text-muted-foreground">
                  Drag to reposition • Zoom to adjust
                </p>
                {/* Face guide info */}
                <div className="text-xs text-muted-foreground text-center">
                  Position your face within the oval guide
                </div>
                <div
                  ref={cropContainerRef}
                  className="relative overflow-hidden bg-muted/50 border-2 border-primary/30 rounded-lg cursor-move"
                  style={{ width: CROP_DISPLAY_W, height: CROP_DISPLAY_H }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <img
                    src={imageSrc}
                    alt="Source"
                    className="absolute pointer-events-none"
                    style={{
                      width: imageSize.w * zoom,
                      height: imageSize.h * zoom,
                      left: `calc(50% - ${(imageSize.w * zoom) / 2 - offsetX}px)`,
                      top: `calc(50% - ${(imageSize.h * zoom) / 2 - offsetY}px)`,
                      transform: `rotate(${rotation}deg)`,
                      transformOrigin: "center center",
                    }}
                  />
                  {/* Face oval guide */}
                  <div
                    className="absolute pointer-events-none border-2 border-dashed border-primary/40 rounded-full"
                    style={{
                      width: CROP_DISPLAY_W * 0.45,
                      height: CROP_DISPLAY_H * 0.6,
                      left: "50%",
                      top: "40%",
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                  {/* Rule-of-thirds lines */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute bg-primary/10" style={{ left: "33.33%", top: 0, width: 1, height: "100%" }} />
                    <div className="absolute bg-primary/10" style={{ left: "66.66%", top: 0, width: 1, height: "100%" }} />
                    <div className="absolute bg-primary/10" style={{ left: 0, top: "33.33%", width: "100%", height: 1 }} />
                    <div className="absolute bg-primary/10" style={{ left: 0, top: "66.66%", width: "100%", height: 1 }} />
                  </div>
                </div>
                {/* Info */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Output: {Math.round(preset.wMM * MM_TO_PX)} × {Math.round(preset.hMM * MM_TO_PX)} px</span>
                  <span>300 DPI</span>
                </div>
              </div>
            ) : (
              /* Layout preview */
              <div className="rounded-xl border bg-muted/30 p-6 flex flex-col items-center gap-4 overflow-auto">
                <p className="text-sm font-medium text-muted-foreground">
                  Print Layout Preview
                </p>
                <div className="flex flex-wrap justify-center gap-6">
                  {Array.from({ length: totalPages }, (_, i) => renderPagePreview(i))}
                </div>
                {/* Resolution warning */}
                {imageSize.w < preset.wMM * MM_TO_PX * 0.8 && (
                  <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3 text-center max-w-sm">
                    ⚠️ Your image resolution may be too low for high-quality prints at this passport size.
                  </div>
                )}
              </div>
            )}

            {/* Cropped preview */}
            {croppedUrl && step === "layout" && (
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Cropped Photo
                </p>
                <div className="flex justify-center">
                  <img
                    src={croppedUrl}
                    alt="Cropped passport photo"
                    className="border rounded shadow-sm"
                    style={{ maxHeight: 160 }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </ToolPageLayout>
  );
}
