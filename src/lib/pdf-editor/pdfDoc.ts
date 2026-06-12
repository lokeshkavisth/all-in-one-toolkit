import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument, degrees } from "pdf-lib";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export type PageSource = "pdf" | "blank" | "image";

export interface EditorPage {
  id: string;
  source: PageSource;
  // index into the originalPdfBytes document, if source === "pdf"
  pdfPageIndex?: number;
  rotation: 0 | 90 | 180 | 270;
  // display dimensions in CSS px
  displayWidth: number;
  displayHeight: number;
  // export dimensions in PDF points
  pdfWidth: number;
  pdfHeight: number;
  bgDataUrl: string; // rendered page bitmap for display
  overlayJson?: string; // fabric serialized state
  // for image-source pages — bytes used at export
  imageBytes?: Uint8Array;
  imageMime?: "image/png" | "image/jpeg";
}

const uid = () => Math.random().toString(36).slice(2, 10);

const DISPLAY_WIDTH = 850; // px for the on-screen page

export async function buildPagesFromPdf(bytes: ArrayBuffer): Promise<EditorPage[]> {
  const data = new Uint8Array(bytes);
  const pdf = await pdfjsLib.getDocument({ data: data.slice() }).promise;
  const pages: EditorPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = (DISPLAY_WIDTH / baseViewport.width) * 2; // 2x for crispness
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas } as Parameters<typeof page.render>[0]).promise;
    pages.push({
      id: uid(),
      source: "pdf",
      pdfPageIndex: i - 1,
      rotation: 0,
      displayWidth: DISPLAY_WIDTH,
      displayHeight: Math.round((baseViewport.height / baseViewport.width) * DISPLAY_WIDTH),
      pdfWidth: baseViewport.width,
      pdfHeight: baseViewport.height,
      bgDataUrl: canvas.toDataURL("image/jpeg", 0.85),
    });
  }
  return pages;
}

export async function buildBlankPage(width = 612, height = 792): Promise<EditorPage> {
  const dispW = DISPLAY_WIDTH;
  const dispH = Math.round((height / width) * dispW);
  const c = document.createElement("canvas");
  c.width = dispW * 2;
  c.height = dispH * 2;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  return {
    id: uid(),
    source: "blank",
    rotation: 0,
    displayWidth: dispW,
    displayHeight: dispH,
    pdfWidth: width,
    pdfHeight: height,
    bgDataUrl: c.toDataURL("image/jpeg", 0.85),
  };
}

export async function buildImagePage(file: File): Promise<EditorPage> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(new Blob([buf as BlobPart]));
  });
  const { w, h } = await new Promise<{ w: number; h: number }>((res, rej) => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = rej;
    im.src = dataUrl;
  });
  const dispW = DISPLAY_WIDTH;
  const dispH = Math.round((h / w) * dispW);
  const mime: "image/png" | "image/jpeg" = file.type === "image/png" ? "image/png" : "image/jpeg";
  return {
    id: uid(),
    source: "image",
    rotation: 0,
    displayWidth: dispW,
    displayHeight: dispH,
    pdfWidth: w,
    pdfHeight: h,
    bgDataUrl: dataUrl,
    imageBytes: buf,
    imageMime: mime,
  };
}

/**
 * Build the final PDF.
 * `pageRenders` provides, for each page in order, the overlay PNG data URL
 * sized to (pdfWidth x pdfHeight). The function flattens overlays on top of
 * the original PDF pages (preserves selectable text on unedited pages).
 */
export async function exportPdf(
  pages: EditorPage[],
  pageRenders: Array<{ overlayDataUrl: string | null }>,
  originalPdfBytes: Uint8Array | null,
  filename: string,
): Promise<void> {
  const out = await PDFDocument.create();
  let srcDoc: PDFDocument | null = null;
  if (originalPdfBytes) {
    srcDoc = await PDFDocument.load(originalPdfBytes);
  }

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const overlay = pageRenders[i]?.overlayDataUrl ?? null;
    let page;

    if (p.source === "pdf" && srcDoc && p.pdfPageIndex !== undefined) {
      const [copied] = await out.copyPages(srcDoc, [p.pdfPageIndex]);
      page = out.addPage(copied);
    } else if (p.source === "image" && p.imageBytes) {
      page = out.addPage([p.pdfWidth, p.pdfHeight]);
      const img =
        p.imageMime === "image/png"
          ? await out.embedPng(p.imageBytes)
          : await out.embedJpg(p.imageBytes);
      page.drawImage(img, { x: 0, y: 0, width: p.pdfWidth, height: p.pdfHeight });
    } else {
      page = out.addPage([p.pdfWidth, p.pdfHeight]);
    }

    if (overlay) {
      const png = await out.embedPng(overlay);
      page.drawImage(png, { x: 0, y: 0, width: p.pdfWidth, height: p.pdfHeight });
    }

    if (p.rotation) page.setRotation(degrees(p.rotation));
  }

  const bytes = await out.save();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
