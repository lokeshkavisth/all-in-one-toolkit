import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { asBlob } from "html-docx-js-typescript";

const wrapHtml = (body: string, title: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;font-size:12pt;line-height:1.5;color:#111}
h1{font-size:24pt}h2{font-size:18pt}h3{font-size:14pt}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px}
img{max-width:100%}blockquote{border-left:3px solid #ccc;padding-left:12px;color:#555}
code{font-family:Consolas,monospace;background:#f4f4f4;padding:1px 4px;border-radius:3px}
</style></head><body>${body}</body></html>`;

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportHtml(html: string, name: string) {
  const blob = new Blob([wrapHtml(html, name)], { type: "text/html" });
  download(blob, `${name}.html`);
}

export async function exportTxt(html: string, name: string) {
  const div = document.createElement("div");
  div.innerHTML = html;
  const text = div.innerText;
  download(new Blob([text], { type: "text/plain" }), `${name}.txt`);
}

export async function exportDocx(html: string, name: string) {
  const blob = await asBlob(wrapHtml(html, name));
  download(blob as Blob, `${name}.docx`);
}

export async function exportPdf(element: HTMLElement, name: string) {
  // High-fidelity: rasterize the editor DOM and paginate into a Letter PDF
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    windowWidth: element.scrollWidth,
  });
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const imgW = pageW - margin * 2;
  const ratio = imgW / canvas.width;
  const fullH = canvas.height * ratio;
  const pageContentH = pageH - margin * 2;

  if (fullH <= pageContentH) {
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, imgW, fullH);
  } else {
    const slicePx = Math.floor(pageContentH / ratio);
    let y = 0;
    let first = true;
    while (y < canvas.height) {
      const h = Math.min(slicePx, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = h;
      const ctx = slice.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (!first) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, imgW, h * ratio);
      first = false;
      y += h;
    }
  }
  pdf.save(`${name}.pdf`);
}

export async function exportPng(element: HTMLElement, name: string) {
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: "#ffffff" });
  canvas.toBlob((b) => b && download(b, `${name}.png`), "image/png");
}
