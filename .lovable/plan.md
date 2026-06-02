# Improve Import Fidelity in PDF Editor

Current import strips most layout: PDFs become plain `<p>` text by Y-grouping, DOCX uses default mammoth conversion, images become a single `<img>` tag inside the editor.

Goal: keep documents looking like the original after import, and turn images into editable "pages" the user can annotate and re-export.

## 1. PDF import — preserve layout

Switch from "extract text only" to a layout-preserving render.

**Approach A (default): Page-as-background + text overlay (editable)**
- Render each PDF page with `pdfjs-dist` to a high-DPI canvas → embed as a full-page background image inside a fixed-size "page" container (Letter/A4 dimensions matching the original page).
- On top, place the extracted text runs as absolutely-positioned editable `<span>`s using their real x/y, font size, and font family from `pdfjs` text content `transform` + `styles`.
- Result: visually identical to the source, but every text run is editable in place. Tables, columns, headers/footers, images all stay.

**Approach B (fallback toggle): Pure image pages**
- Render each page to an image, drop into the editor as one image per page. Best fidelity, but text is not directly editable (only annotated). Useful for scanned PDFs.

Add a small dialog on import asking: "Editable text overlay (recommended)" vs "Image pages (exact look, annotate only)". Default = A.

## 2. DOCX import — preserve formatting

Replace minimal `mammoth.convertToHtml` with a richer pipeline:
- Pass `mammoth` a fuller `styleMap` (headings 1–6, Title, Subtitle, Quote, ListParagraph, code) and `includeDefaultStyleMap: true`.
- Use `convertToHtml` with `convertImage: mammoth.images.imgElement` to inline embedded images as base64.
- Inject the mammoth-generated CSS classes plus default Word-like spacing into the editor's prose styles so paragraph spacing, lists, tables, and images match the source.

## 3. Image import — convert to editable PDF-like page

Today: a raw `<img>` in the flow.

New behavior:
- Wrap each imported image in a Letter-sized "page" `<div>` (same container used for PDF pages) with the image as the background, sized to fit.
- Insert an empty editable text layer on top so the user can type annotations, add shapes via the existing toolbar, draw signatures, etc.
- Multiple images → multiple pages separated by page-break markers.
- Export already rasterizes the editor DOM via `html2canvas` + `jsPDF`, so these "image pages" round-trip cleanly to PDF.

## 4. Editor surface changes

- Introduce a `.doc-page` CSS class (8.5"×11" or A4, fixed width, shadow, page break after) and render imported pages inside it instead of free-flowing prose. Typed documents still work — they keep using the existing single page wrapper.
- Add `position: relative` so absolute-positioned text runs from PDF import sit correctly over the page background.
- Update export pagination in `src/lib/pdf-editor/export.ts` to slice on `.doc-page` boundaries when present (cleaner page breaks than the current pixel slicer).

## 5. Files to change

- `src/lib/pdf-editor/import.ts` — new `importPdf` (render + overlay), richer `importDocx`, new image→page wrapper.
- `src/pages/PdfEditor.tsx` — import-mode dialog (overlay vs image), page container styles.
- `src/lib/pdf-editor/export.ts` — page-aware pagination when `.doc-page` elements exist.
- `src/index.css` (or a scoped style block) — `.doc-page` styling.

## Out of scope (v1 of this change)

- Editing the PDF page background itself (replacing logos, redrawing tables) — overlay only edits text.
- True reflow when a text run grows past its original box; oversized edits will visually overlap until the user adjusts.
- OCR for scanned PDFs (Approach B will be annotate-only for those).

Confirm and I'll build it, or tell me to drop the import-mode dialog and just always use the editable overlay.
