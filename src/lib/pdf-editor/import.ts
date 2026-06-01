import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export type ImportResult = { html: string; name: string };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function importPdf(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Group by approximate Y to recover lines
    const items = content.items as Array<{ str: string; transform: number[]; hasEOL?: boolean }>;
    const lines: { y: number; text: string }[] = [];
    let curY: number | null = null;
    let curText = "";
    for (const it of items) {
      const y = Math.round(it.transform[5]);
      if (curY === null) curY = y;
      if (Math.abs(y - curY) > 2) {
        lines.push({ y: curY, text: curText });
        curText = "";
        curY = y;
      }
      curText += it.str;
      if (it.hasEOL) {
        lines.push({ y: curY, text: curText });
        curText = "";
        curY = null;
      }
    }
    if (curText) lines.push({ y: curY ?? 0, text: curText });
    const pageHtml = lines
      .map((l) => l.text.trim())
      .filter(Boolean)
      .map((t) => `<p>${escapeHtml(t)}</p>`)
      .join("");
    out.push(pageHtml || "<p></p>");
    if (i < pdf.numPages) out.push('<p style="page-break-after: always"></p>');
  }
  return out.join("");
}

async function importDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const res = await mammoth.convertToHtml(
    { arrayBuffer: buf },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1",
        "p[style-name='Heading 2'] => h2",
        "p[style-name='Heading 3'] => h3",
        "p[style-name='Title'] => h1",
      ],
    } as never,
  );
  return res.value;
}

async function importImage(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  return `<p><img src="${dataUrl}" alt="${escapeHtml(file.name)}" /></p>`;
}

async function importText(file: File): Promise<string> {
  const text = await file.text();
  return text
    .split(/\r?\n/)
    .map((l) => `<p>${escapeHtml(l) || "<br/>"}</p>`)
    .join("");
}

export async function importFile(file: File): Promise<ImportResult> {
  const name = file.name;
  const lower = name.toLowerCase();
  let html = "";
  if (lower.endsWith(".pdf")) html = await importPdf(file);
  else if (lower.endsWith(".docx")) html = await importDocx(file);
  else if (lower.endsWith(".doc")) {
    throw new Error("Legacy .doc files are not supported in-browser. Please save as .docx and try again.");
  } else if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)) html = await importImage(file);
  else if (/\.(txt|md|html?|rtf)$/.test(lower)) html = await importText(file);
  else html = await importText(file);
  return { html, name: name.replace(/\.[^.]+$/, "") };
}
