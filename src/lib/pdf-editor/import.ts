import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export type ImportMode = "overlay" | "image";
export type ImportResult = { html: string; name: string };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PAGE_CSS_WIDTH = 816; // px (~8.5in @ 96dpi). Page heights scale per-page from PDF aspect.

async function renderPdfPageToDataUrl(
  page: pdfjsLib.PDFPageProxy,
  scale: number,
): Promise<{ dataUrl: string; viewport: pdfjsLib.PageViewport }> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), viewport };
}

async function importPdf(file: File, mode: ImportMode): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const parts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // Base viewport at scale 1 for coordinate math
    const base = page.getViewport({ scale: 1 });
    // Render image at 2x for crispness
    const { dataUrl } = await renderPdfPageToDataUrl(page, 2);

    const pageW = PAGE_CSS_WIDTH;
    const pageH = Math.round((base.height / base.width) * pageW);
    const scale = pageW / base.width;

    let overlayHtml = "";
    if (mode === "overlay") {
      const content = await page.getTextContent();
      const items = content.items as Array<{
        str: string;
        transform: number[];
        width: number;
        height: number;
        fontName?: string;
      }>;
      const spans: string[] = [];
      for (const it of items) {
        const text = it.str;
        if (!text) continue;
        // PDF transform: [a,b,c,d,e,f]; e,f = position with origin bottom-left
        const a = it.transform[0];
        const d = it.transform[3];
        const e = it.transform[4];
        const f = it.transform[5];
        const fontSize = Math.hypot(it.transform[2], d) || Math.abs(d) || it.height || 10;
        const x = e * scale;
        const y = (base.height - f) * scale - fontSize * scale * 0.85;
        const fs = fontSize * scale;
        // Horizontal scale to fit original width
        const measuredW = it.width * scale;
        const styleParts = [
          `left:${x.toFixed(2)}px`,
          `top:${y.toFixed(2)}px`,
          `font-size:${fs.toFixed(2)}px`,
          `font-family:${/serif/i.test(it.fontName || "") ? "Georgia,serif" : "Helvetica,Arial,sans-serif"}`,
        ];
        if (a < 0) styleParts.push(`transform:scaleX(-1)`);
        if (measuredW > 0) styleParts.push(`min-width:${measuredW.toFixed(2)}px`);
        spans.push(
          `<span data-pdf-text contenteditable="true" style="${styleParts.join(";")}">${escapeHtml(text)}</span>`,
        );
      }
      overlayHtml = `<div class="doc-text-layer" contenteditable="false">${spans.join("")}</div>`;
    }

    parts.push(
      `<div class="doc-page" data-page="${i}" style="width:${pageW}px;height:${pageH}px;background-image:url('${dataUrl}')">${overlayHtml}</div>`,
    );
  }
  return parts.join("");
}

async function importDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const res = await mammoth.convertToHtml(
    { arrayBuffer: buf },
    {
      styleMap: [
        "p[style-name='Title'] => h1.docx-title",
        "p[style-name='Subtitle'] => h2.docx-subtitle",
        "p[style-name='Heading 1'] => h1",
        "p[style-name='Heading 2'] => h2",
        "p[style-name='Heading 3'] => h3",
        "p[style-name='Heading 4'] => h4",
        "p[style-name='Heading 5'] => h5",
        "p[style-name='Heading 6'] => h6",
        "p[style-name='Quote'] => blockquote",
        "p[style-name='Intense Quote'] => blockquote.intense",
        "p[style-name='List Paragraph'] => p.list-paragraph",
        "r[style-name='Code'] => code",
      ],
      includeDefaultStyleMap: true,
      convertImage: mammoth.images.imgElement((image) =>
        image.read("base64").then((data) => ({ src: `data:${image.contentType};base64,${data}` })),
      ),
    } as never,
  );
  // Wrap in a doc-page so it visually reads as a Word-style page
  return `<div class="doc-page doc-docx-page" style="min-height:11in;padding:1in">${res.value}</div>`;
}

async function readImageAsDataUrl(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new globalThis.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
  return { dataUrl, width, height };
}

async function importImage(file: File): Promise<string> {
  const { dataUrl, width, height } = await readImageAsDataUrl(file);
  const pageW = PAGE_CSS_WIDTH;
  const pageH = Math.round((height / width) * pageW);
  // Image as background, editable overlay so the user can type/annotate over it
  return `<div class="doc-page doc-image-page" style="width:${pageW}px;height:${pageH}px;background-image:url('${dataUrl}')"><div class="doc-text-layer" contenteditable="true"></div></div>`;
}

async function importText(file: File): Promise<string> {
  const text = await file.text();
  const body = text
    .split(/\r?\n/)
    .map((l) => `<p>${escapeHtml(l) || "<br/>"}</p>`)
    .join("");
  return `<div class="doc-page" style="min-height:11in;padding:1in">${body}</div>`;
}

export async function importFile(file: File, mode: ImportMode = "overlay"): Promise<ImportResult> {
  const name = file.name;
  const lower = name.toLowerCase();
  let html = "";
  if (lower.endsWith(".pdf")) html = await importPdf(file, mode);
  else if (lower.endsWith(".docx")) html = await importDocx(file);
  else if (lower.endsWith(".doc"))
    throw new Error("Legacy .doc files are not supported in-browser. Please save as .docx and try again.");
  else if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)) html = await importImage(file);
  else if (/\.(txt|md|html?|rtf)$/.test(lower)) html = await importText(file);
  else html = await importText(file);
  return { html, name: name.replace(/\.[^.]+$/, "") };
}
