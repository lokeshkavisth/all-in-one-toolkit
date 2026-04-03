

# AllTools Pro — Online Tool Suite

## Overview
A clean, minimal website (inspired by iLovePDF) where users can access PDF, image, and document tools from one place. Each tool gets its own page with drag-and-drop file upload and clear results.

## Phase 1: Homepage & Navigation (Starting Now)

### Homepage
- **Hero section** with tagline: "All your document & image tools in one place"
- **Tool grid** with icon cards organized by category:
  - 📄 **PDF Tools**: PDF Editor, Compress PDF, JPG/PNG to PDF, eSign & Fill PDF, OCR, Unlock PDF, PDF to Excel
  - 🖼️ **Image Tools**: Resize Image, Crop Image, Remove Background, Passport Photo Maker
- Each card has an icon, title, short description, and distinct category color accent
- Search bar to quickly find tools

### Navigation
- Top navbar with logo, tool categories dropdown, and search
- Footer with links
- Breadcrumb navigation on tool pages

### Shared Tool Page Layout
- Consistent layout for every tool: title, description, file upload zone (drag & drop), processing area, download results
- Reusable `FileUploader` component with drag-and-drop support

## Phase 2: Tools (Built One by One)

Each tool will be implemented incrementally. Client-side JS libraries will handle lighter tasks; Supabase Edge Functions will handle heavier processing (OCR, PDF-to-Excel, etc.).

### Tool List (in build order):
1. **Image Resizer** — Resize images up/down with quality control (client-side canvas)
2. **Image Cropper** — Interactive crop with aspect ratio presets (client-side)
3. **JPG/PNG to PDF** — Convert images to PDF, arrange pages (client-side with jsPDF)
4. **Compress PDF** — Reduce PDF file size (edge function)
5. **PDF Editor** — Basic annotations, text, highlights (client-side with pdf-lib)
6. **eSign & Fill PDF** — Draw/upload signature, fill form fields (client-side with pdf-lib)
7. **OCR** — Extract text from scanned PDFs/images (edge function with OCR API)
8. **Unlock PDF** — Remove password/restrictions (edge function)
9. **PDF to Excel** — Convert PDF tables to Excel (edge function)
10. **Remove Background** — AI background removal (edge function with API)
11. **Passport Photo Maker** — Face detection, crop to passport size, background change (edge function with AI)

## Design
- Clean white background, subtle gray accents
- Each tool category gets a soft color accent (blue for PDF, green for Image)
- Rounded cards with hover effects
- Mobile-responsive grid layout
- Consistent file upload UX across all tools

