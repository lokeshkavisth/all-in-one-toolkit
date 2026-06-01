import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
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
import { toast } from "sonner";
import { ToolPageLayout } from "@/components/ToolPageLayout";
import { EditorToolbar } from "@/components/pdf-editor/Toolbar";
import { importFile } from "@/lib/pdf-editor/import";
import { exportDocx, exportHtml, exportPdf, exportPng, exportTxt } from "@/lib/pdf-editor/export";

const STORAGE_KEY = "pdf-editor.doc.v1";

export default function PdfEditor() {
  const [name, setName] = useState("Untitled");
  const pageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
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
        const { html, name: n } = JSON.parse(saved);
        if (html) editor.commands.setContent(html);
        if (n) setName(n);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Autosave
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ html: editor.getHTML(), name }));
      } catch { /* ignore */ }
    };
    editor.on("update", handler);
    return () => { editor.off("update", handler); };
  }, [editor, name]);

  const handleImport = async (file: File) => {
    if (!editor) return;
    try {
      toast.loading("Importing…", { id: "import" });
      const { html, name: n } = await importFile(file);
      editor.commands.setContent(html || "<p></p>");
      setName(n);
      toast.success("Imported", { id: "import" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed", { id: "import" });
    }
  };

  const doExport = async (kind: "pdf" | "docx" | "html" | "txt" | "png") => {
    if (!editor) return;
    const safe = (name || "document").replace(/[^\w.-]+/g, "_");
    try {
      toast.loading(`Exporting ${kind.toUpperCase()}…`, { id: "exp" });
      const html = editor.getHTML();
      if (kind === "pdf") await exportPdf(pageRef.current!, safe);
      else if (kind === "docx") await exportDocx(html, safe);
      else if (kind === "html") await exportHtml(html, safe);
      else if (kind === "txt") await exportTxt(html, safe);
      else if (kind === "png") await exportPng(pageRef.current!, safe);
      toast.success("Downloaded", { id: "exp" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed", { id: "exp" });
    }
  };

  const wordCount = useMemo(() => {
    if (!editor) return 0;
    return editor.getText().trim().split(/\s+/).filter(Boolean).length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.state.doc]);

  return (
    <ToolPageLayout
      icon={FileText}
      iconColor="text-blue-600"
      iconBg="bg-blue-100"
      title="PDF Editor"
      description="Import PDF, DOCX, or images, edit like a word processor, and export to PDF, DOCX, HTML, TXT, or PNG."
    >
      <Helmet>
        <title>PDF Editor — Edit PDF, DOCX & Images Online | AllTools Pro</title>
        <meta name="description" content="Free online PDF editor. Import PDF, DOCX, JPG, PNG. Edit text, add images and tables, format like MS Word. Export to PDF, DOCX, HTML, TXT, PNG." />
        <link rel="canonical" href="/tools/pdf-editor" />
      </Helmet>

      <div className="space-y-4">
        {/* File bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 max-w-xs"
            placeholder="Document name"
          />
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

        {/* Editor surface */}
        <div className="rounded-lg border bg-muted/30 overflow-hidden">
          <EditorToolbar editor={editor} />
          <div className="overflow-auto p-6 max-h-[78vh]">
            <div
              ref={pageRef}
              className="mx-auto shadow-md rounded-sm bg-card"
              style={{ width: "min(816px, 100%)" /* ~8.5in @ 96dpi */ }}
            >
              <EditorContent editor={editor} />
            </div>
          </div>
          <div className="flex items-center justify-between border-t bg-card px-4 py-2 text-xs text-muted-foreground">
            <span>{wordCount} words</span>
            <span>Autosaved locally</span>
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
