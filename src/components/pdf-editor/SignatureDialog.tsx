import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (dataUrl: string) => void;
}

export function SignatureDialog({ open, onClose, onConfirm }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    if (!open || !ref.current) return;
    const c = ref.current;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  }, [open]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    last.current = pos(e);
    setEmpty(false);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current || !ref.current) return;
    const ctx = ref.current.getContext("2d")!;
    const p = pos(e);
    ctx.strokeStyle = "#0a3060";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }
  function end() {
    drawing.current = false;
    last.current = null;
  }

  function clear() {
    if (!ref.current) return;
    const ctx = ref.current.getContext("2d")!;
    ctx.clearRect(0, 0, ref.current.width, ref.current.height);
    setEmpty(true);
  }

  function confirm() {
    if (!ref.current) return;
    // Trim transparent margins
    const c = ref.current;
    const ctx = c.getContext("2d")!;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width,
      minY = c.height,
      maxX = 0,
      maxY = 0,
      found = false;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const a = data[(y * c.width + x) * 4 + 3];
        if (a > 10) {
          found = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) {
      onClose();
      return;
    }
    const pad = 8;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const octx = out.getContext("2d")!;
    octx.drawImage(c, minX - pad, minY - pad, w, h, 0, 0, w, h);
    onConfirm(out.toDataURL("image/png"));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Draw your signature</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border bg-white">
          <canvas
            ref={ref}
            width={640}
            height={220}
            className="touch-none w-full"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={clear}>Clear</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={empty}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
