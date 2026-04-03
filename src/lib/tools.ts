import {
  FileText, FileDown, FileUp, FilePen, FileSignature, ScanSearch,
  Unlock, FileSpreadsheet, ImageIcon, Crop, Eraser, Camera,
  type LucideIcon,
} from "lucide-react";

export type ToolCategory = "pdf" | "image";

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: ToolCategory;
  path: string;
}

export const tools: Tool[] = [
  {
    id: "pdf-editor",
    name: "PDF Editor",
    description: "Edit, annotate, and modify PDF documents with ease",
    icon: FilePen,
    category: "pdf",
    path: "/tools/pdf-editor",
  },
  {
    id: "compress-pdf",
    name: "Compress PDF",
    description: "Reduce PDF file size while maintaining quality",
    icon: FileDown,
    category: "pdf",
    path: "/tools/compress-pdf",
  },
  {
    id: "jpg-to-pdf",
    name: "JPG/PNG to PDF",
    description: "Convert images to PDF documents instantly",
    icon: FileUp,
    category: "pdf",
    path: "/tools/jpg-to-pdf",
  },
  {
    id: "esign-pdf",
    name: "eSign & Fill PDF",
    description: "Add signatures and fill out PDF forms digitally",
    icon: FileSignature,
    category: "pdf",
    path: "/tools/esign-pdf",
  },
  {
    id: "ocr",
    name: "OCR",
    description: "Extract searchable text from scanned documents",
    icon: ScanSearch,
    category: "pdf",
    path: "/tools/ocr",
  },
  {
    id: "unlock-pdf",
    name: "Unlock PDF",
    description: "Remove passwords and restrictions from PDFs",
    icon: Unlock,
    category: "pdf",
    path: "/tools/unlock-pdf",
  },
  {
    id: "pdf-to-excel",
    name: "PDF to Excel",
    description: "Convert PDF tables into editable Excel spreadsheets",
    icon: FileSpreadsheet,
    category: "pdf",
    path: "/tools/pdf-to-excel",
  },
  {
    id: "resize-image",
    name: "Resize Image",
    description: "Increase or reduce image dimensions with quality control",
    icon: ImageIcon,
    category: "image",
    path: "/tools/resize-image",
  },
  {
    id: "crop-image",
    name: "Crop Image",
    description: "Crop images with custom or preset aspect ratios",
    icon: Crop,
    category: "image",
    path: "/tools/crop-image",
  },
  {
    id: "remove-background",
    name: "Remove Background",
    description: "Automatically remove image backgrounds with AI",
    icon: Eraser,
    category: "image",
    path: "/tools/remove-background",
  },
  {
    id: "passport-photo",
    name: "Passport Photo Maker",
    description: "Create standard passport-size photos instantly",
    icon: Camera,
    category: "image",
    path: "/tools/passport-photo",
  },
];

export const pdfTools = tools.filter((t) => t.category === "pdf");
export const imageTools = tools.filter((t) => t.category === "image");

export const categories = [
  { id: "pdf" as const, label: "PDF Tools", tools: pdfTools },
  { id: "image" as const, label: "Image Tools", tools: imageTools },
];
