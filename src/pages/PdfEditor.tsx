import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
const FontSizeTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.fontSize || null,
        renderHTML: (attrs: { fontSize?: string }) =>
          attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {},
      },
    };
  },
});
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import FontFamily from "@tiptap/extension-font-family";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { FileText, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ToolPageLayout } from "@/components/ToolPageLayout";
import { EditorToolbar } from "@/components/pdf-editor/Toolbar";
import { importFile, type ImportMode } from "@/lib/pdf-editor/import";
import { exportDocx, exportHtml, exportPdf, exportPng, exportTxt } from "@/lib/pdf-editor/export";

const STORAGE_KEY = "pdf-editor.doc.v2";

type Surface = "tiptap" | "imported";

export default function PdfEditor() {
  const [name, setName] = useState("Untitled");
  const [surface, setSurface] = useState<Surface>("tiptap");
  const [importedHtml, setImportedHtml] = useState<string>("");
  const pageRef = useRef<HTMLDivElement>(null);
  const importedRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pending import dialog (only for PDFs)
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingMode, setPendingMode] = useState<ImportMode>("overlay");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      FontSizeTextStyle,
      Color,
      FontFamily.configure({ types: ["textStyle"] }),
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
      TaskList, TaskItem.configure({ nested: true }),
      Subscript, Superscript,
    ],
    content: "<h1>Start writing…</h1><p>Import a PDF, DOCX, image, or text file — or just type here.</p>",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[1000px] px-16 py-20 bg-card text-foreground",
      },
    },
  });

  // Restore last document
  useEffect(() => {
    if (!editor) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.surface === "imported" && parsed.html) {
          setImportedHtml(parsed.html);
          setSurface("imported");
        } else if (parsed.html) {
          editor.commands.setContent(parsed.html);
        }
        if (parsed.name) setName(parsed.name);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Autosave (tiptap)
  useEffect(() => {
    if (!editor || surface !== "tiptap") return;
    const handler = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          surface: "tiptap", html: editor.getHTML(), name,
        }));
      } catch { /* ignore */ }
    };
    editor.on("update", handler);
    return () => { editor.off("update", handler); };
  }, [editor, name, surface]);

  // Autosave (imported) — debounced via input events on the contenteditable
  useEffect(() => {
    if (surface !== "imported") return;
    const el = importedRef.current;
    if (!el) return;
    let t: number | undefined;
    const handler = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            surface: "imported", html: el.innerHTML, name,
          }));
        } catch { /* ignore */ }
      }, 400);
    };
    el.addEventListener("input", handler);
    return () => { el.removeEventListener("input", handler); window.clearTimeout(t); };
  }, [surface, importedHtml, name]);

  const runImport = async (file: File, mode: ImportMode) => {
    try {
      toast.loading("Importing…", { id: "import" });
      const { html, name: n } = await importFile(file, mode);
      const lower = file.name.toLowerCase();
      const layoutPreserving =
        lower.endsWith(".pdf") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower);
      if (layoutPreserving) {
        setImportedHtml(html);
        setSurface("imported");
      } else {
        setSurface("tiptap");
        editor?.commands.setContent(html || "<p></p>");
      }
      setName(n);
      toast.success("Imported", { id: "import" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed", { id: "import" });
    }
  };

  const handleImport = async (file: File) => {
    if (file.name.toLowerCase().endsWith(".pdf")) {
      setPendingFile(file);
      setPendingMode("overlay");
      return;
    }
    await runImport(file, "overlay");
  };

  const doExport = async (kind: "pdf" | "docx" | "html" | "txt" | "png") => {
    const surfaceEl = surface === "tiptap" ? pageRef.current! : importedRef.current!;
    const html = surface === "tiptap" ? (editor?.getHTML() ?? "") : (importedRef.current?.innerHTML ?? "");
    const safe = (name || "document").replace(/[^\w.-]+/g, "_");
    try {
      toast.loading(`Exporting ${kind.toUpperCase()}…`, { id: "exp" });
      if (kind === "pdf") await exportPdf(surfaceEl, safe);
      else if (kind === "docx") await exportDocx(html, safe);
      else if (kind === "html") await exportHtml(html, safe);
      else if (kind === "txt") await exportTxt(html, safe);
      else if (kind === "png") await exportPng(surfaceEl, safe);
      toast.success("Downloaded", { id: "exp" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed", { id: "exp" });
    }
  };

  const wordCount = useMemo(() => {
    if (surface === "imported") {
      const txt = importedRef.current?.innerText ?? "";
      return txt.trim().split(/\s+/).filter(Boolean).length;
    }
    if (!editor) return 0;
    return editor.getText().trim().split(/\s+/).filter(Boolean).length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.state.doc, surface, importedHtml]);

  return (
    <ToolPageLayout
      icon={FileText}
      category="pdf"
      categoryLabel="PDF Tools"
      title="PDF Editor"
      description="Import PDF, DOCX, or images, edit like a word processor, and export to PDF, DOCX, HTML, TXT, or PNG."
    >
      <Helmet>
        <title>PDF Editor — Edit PDF, DOCX & Images Online | AllTools Pro</title>
        <meta name="description" content="Free online PDF editor. Import PDF, DOCX, JPG, PNG. Edit text, add images and tables, format like MS Word. Export to PDF, DOCX, HTML, TXT, PNG." />
        <link rel="canonical" href="/tools/pdf-editor" />
      </Helmet>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 max-w-xs"
            placeholder="Document name"
          />
          {surface === "imported" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSurface("tiptap"); setImportedHtml(""); }}
              title="Switch back to the rich-text editor"
            >
              New blank doc
            </Button>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Import
            </Button>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".pdf,.docx,.txt,.md,.html,.htm,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm"><Download className="mr-2 h-4 w-4" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => doExport("pdf")}>Download as PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("docx")}>Download as DOCX (Word)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("html")}>Download as HTML</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("txt")}>Download as TXT</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("png")}>Download as PNG</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 overflow-hidden">
          {surface === "tiptap" ? (
            <EditorToolbar editor={editor} />
          ) : (
            <div className="border-b bg-card px-4 py-2 text-xs text-muted-foreground">
              Imported document — click any text to edit. Layout is preserved from the original.
            </div>
          )}
          <div className="overflow-auto p-6 max-h-[78vh]">
            {surface === "tiptap" ? (
              <div
                ref={pageRef}
                className="mx-auto shadow-md rounded-sm bg-card"
                style={{ width: "min(816px, 100%)" }}
              >
                <EditorContent editor={editor} />
              </div>
            ) : (
              <div
                ref={importedRef}
                className="mx-auto"
                style={{ width: "min(816px, 100%)" }}
                contentEditable
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: importedHtml }}
              />
            )}
          </div>
          <div className="flex items-center justify-between border-t bg-card px-4 py-2 text-xs text-muted-foreground">
            <span>{wordCount} words</span>
            <span>Autosaved locally</span>
          </div>
        </div>
      </div>

      <Dialog open={!!pendingFile} onOpenChange={(o) => !o && setPendingFile(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import PDF</DialogTitle>
            <DialogDescription>
              Choose how to import — keep the original look in both modes.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={pendingMode} onValueChange={(v) => setPendingMode(v as ImportMode)} className="gap-3">
            <div className="flex items-start gap-3 rounded-md border p-3">
              <RadioGroupItem value="overlay" id="m-overlay" className="mt-1" />
              <Label htmlFor="m-overlay" className="flex-1 cursor-pointer font-normal">
                <div className="font-medium">Editable text overlay (recommended)</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Original page as background with every text run editable in place. Best for digital PDFs.
                </div>
              </Label>
            </div>
            <div className="flex items-start gap-3 rounded-md border p-3">
              <RadioGroupItem value="image" id="m-image" className="mt-1" />
              <Label htmlFor="m-image" className="flex-1 cursor-pointer font-normal">
                <div className="font-medium">Image pages (exact look, annotate only)</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Pixel-perfect copy. Add text and shapes on top, but original text is not selectable. Best for scanned PDFs.
                </div>
              </Label>
            </div>
          </RadioGroup>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingFile(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                const f = pendingFile;
                setPendingFile(null);
                if (f) await runImport(f, pendingMode);
              }}
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToolPageLayout>
  );
}
