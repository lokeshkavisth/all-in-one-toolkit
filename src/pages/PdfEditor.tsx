import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { FilePen, Upload, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Textbox, type FabricObject } from "fabric";
import { ToolPageLayout } from "@/components/ToolPageLayout";
import { EditorToolbar } from "@/components/pdf-editor/Toolbar";
import { PageSidebar } from "@/components/pdf-editor/PageSidebar";
import { PageCanvas, type PageCanvasHandle } from "@/components/pdf-editor/PageCanvas";
import { SignatureDialog } from "@/components/pdf-editor/SignatureDialog";
import { DEFAULT_CONFIG, type Tool, type ToolConfig } from "@/components/pdf-editor/types";
import {
  buildBlankPage,
  buildImagePage,
  buildPagesFromPdf,
  exportPdf,
  type EditorPage,
} from "@/lib/pdf-editor/pdfDoc";

export default function PdfEditor() {
  const [name, setName] = useState("Untitled");
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("select");
  const [config, setConfigState] = useState<ToolConfig>(DEFAULT_CONFIG);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [sigOpen, setSigOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [, setSelected] = useState<FabricObject | null>(null);

  const originalPdfRef = useRef<Uint8Array | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const canvasRefs = useRef<Map<string, PageCanvasHandle>>(new Map());
  // per-page undo/redo history of serialized states
  const histRef = useRef<Map<string, { stack: string[]; index: number; suppress: boolean }>>(new Map());

  const setConfig = useCallback((patch: Partial<ToolConfig>) => {
    setConfigState((c) => ({ ...c, ...patch }));
  }, []);

  const ensureHist = (id: string) => {
    let h = histRef.current.get(id);
    if (!h) {
      h = { stack: [""], index: 0, suppress: false };
      histRef.current.set(id, h);
    }
    return h;
  };

  // Start blank
  useEffect(() => {
    (async () => {
      const b = await buildBlankPage();
      setPages([b]);
    })();
  }, []);

  const setActiveCanvasRef = (id: string) => (h: PageCanvasHandle | null) => {
    if (h) canvasRefs.current.set(id, h);
    else canvasRefs.current.delete(id);
  };

  const handlePageChange = (id: string, json: string) => {
    setPages((ps) => ps.map((p) => (p.id === id ? { ...p, overlayJson: json } : p)));
    const h = ensureHist(id);
    if (h.suppress) return;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(json);
    h.index = h.stack.length - 1;
    if (h.stack.length > 50) {
      h.stack.shift();
      h.index--;
    }
  };

  const undo = () => {
    const p = pages[activeIndex];
    if (!p) return;
    const h = ensureHist(p.id);
    if (h.index <= 0) return;
    h.index--;
    const json = h.stack[h.index];
    const c = canvasRefs.current.get(p.id)?.getCanvas();
    if (!c) return;
    h.suppress = true;
    if (json) c.loadFromJSON(json).then(() => c.requestRenderAll()).finally(() => (h.suppress = false));
    else {
      c.clear();
      c.requestRenderAll();
      h.suppress = false;
    }
    setPages((ps) => ps.map((pp) => (pp.id === p.id ? { ...pp, overlayJson: json } : pp)));
  };

  const redo = () => {
    const p = pages[activeIndex];
    if (!p) return;
    const h = ensureHist(p.id);
    if (h.index >= h.stack.length - 1) return;
    h.index++;
    const json = h.stack[h.index];
    const c = canvasRefs.current.get(p.id)?.getCanvas();
    if (!c) return;
    h.suppress = true;
    if (json) c.loadFromJSON(json).then(() => c.requestRenderAll()).finally(() => (h.suppress = false));
    else {
      c.clear();
      c.requestRenderAll();
      h.suppress = false;
    }
    setPages((ps) => ps.map((pp) => (pp.id === p.id ? { ...pp, overlayJson: json } : pp)));
  };

  const deleteSelected = () => {
    const p = pages[activeIndex];
    if (!p) return;
    canvasRefs.current.get(p.id)?.deleteSelected();
  };

  const handleImport = async (file: File) => {
    setBusy(true);
    try {
      toast.loading("Loading…", { id: "imp" });
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".pdf")) {
        const buf = await file.arrayBuffer();
        originalPdfRef.current = new Uint8Array(buf);
        const built = await buildPagesFromPdf(buf);
        setPages(built);
        setActiveIndex(0);
        canvasRefs.current.clear();
        histRef.current.clear();
        setName(file.name.replace(/\.pdf$/i, ""));
      } else if (/\.(png|jpe?g|gif|webp|bmp)$/.test(lower)) {
        const pg = await buildImagePage(file);
        originalPdfRef.current = null;
        setPages([pg]);
        setActiveIndex(0);
        canvasRefs.current.clear();
        histRef.current.clear();
        setName(file.name.replace(/\.[^.]+$/, ""));
      } else {
        toast.error("Supported: PDF, PNG, JPG", { id: "imp" });
        return;
      }
      toast.success("Loaded", { id: "imp" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load", { id: "imp" });
    } finally {
      setBusy(false);
    }
  };

  const addBlankPage = async () => {
    const ref = pages[activeIndex];
    const b = await buildBlankPage(ref?.pdfWidth ?? 612, ref?.pdfHeight ?? 792);
    setPages((ps) => [...ps, b]);
    setActiveIndex(pages.length);
  };

  const deletePage = (i: number) => {
    if (pages.length <= 1) {
      toast.error("At least one page is required");
      return;
    }
    setPages((ps) => ps.filter((_, idx) => idx !== i));
    setActiveIndex((a) => Math.max(0, Math.min(a, pages.length - 2)));
  };

  const rotatePage = (i: number) => {
    setPages((ps) =>
      ps.map((p, idx) => {
        if (idx !== i) return p;
        const next = ((p.rotation + 90) % 360) as 0 | 90 | 180 | 270;
        return { ...p, rotation: next };
      }),
    );
  };

  const reorder = (from: number, to: number) => {
    setPages((ps) => {
      const copy = [...ps];
      const [m] = copy.splice(from, 1);
      copy.splice(to, 0, m);
      return copy;
    });
    setActiveIndex(to);
  };

  const onAddImageClick = () => imageInputRef.current?.click();

  const handleImageFile = async (file: File) => {
    const url: string = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    const p = pages[activeIndex];
    if (!p) return;
    await canvasRefs.current.get(p.id)?.addImageFromUrl(url);
    setTool("select");
  };

  const handleSignature = (dataUrl: string) => {
    setSigOpen(false);
    const p = pages[activeIndex];
    if (!p) return;
    void canvasRefs.current.get(p.id)?.addImageFromUrl(dataUrl);
    setTool("select");
  };

  const doFindReplace = (all: boolean) => {
    if (!findText) return;
    let count = 0;
    for (const p of pages) {
      const c = canvasRefs.current.get(p.id)?.getCanvas();
      if (!c) continue;
      const objs = c.getObjects();
      for (const o of objs) {
        if (o instanceof Textbox) {
          const before = o.text ?? "";
          if (!before.includes(findText)) continue;
          const next = all ? before.split(findText).join(replaceText) : before.replace(findText, replaceText);
          if (next !== before) {
            o.set({ text: next });
            count++;
            if (!all) {
              c.requestRenderAll();
              c.fire("object:modified", { target: o });
              toast.success("Replaced 1");
              return;
            }
          }
        }
      }
      c.requestRenderAll();
      c.fire("object:modified", { target: c.getObjects()[0] });
    }
    toast.success(count ? `Replaced ${count}` : "No matches");
  };

  const doExport = async () => {
    if (!pages.length) return;
    setBusy(true);
    try {
      toast.loading("Building PDF…", { id: "exp" });
      const renders = await Promise.all(
        pages.map(async (p) => {
          const overlay = await canvasRefs.current
            .get(p.id)
            ?.renderOverlayPng(p.pdfWidth, p.pdfHeight);
          return { overlayDataUrl: overlay ?? null };
        }),
      );
      const safe = (name || "document").replace(/[^\w.-]+/g, "_");
      await exportPdf(pages, renders, originalPdfRef.current, safe);
      toast.success("Downloaded", { id: "exp" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed", { id: "exp" });
    } finally {
      setBusy(false);
    }
  };

  const activePage = pages[activeIndex];

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, pages]);

  const stats = useMemo(() => ({ pages: pages.length, active: activeIndex + 1 }), [pages, activeIndex]);

  return (
    <ToolPageLayout
      icon={FilePen}
      category="pdf"
      categoryLabel="PDF Tools"
      title="PDF Editor"
      description="Edit PDF files online. Add text, images, signatures, highlights, shapes and whiteout — then download as a flat PDF."
    >
      <Helmet>
        <title>PDF Editor — Edit PDF Online Free | AllTools Pro</title>
        <meta
          name="description"
          content="Free online PDF editor: add text, images, signatures, highlights and shapes. Reorder, rotate and delete pages, then download as PDF."
        />
        <link rel="canonical" href="/tools/pdf-editor" />
      </Helmet>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
          <FileText className="ml-1 h-4 w-4 text-muted-foreground" />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 max-w-xs"
            placeholder="Document name"
          />
          <span className="text-xs text-muted-foreground">
            Page {stats.active} of {stats.pages}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              <Upload className="mr-2 h-4 w-4" /> Open
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
            <input
              ref={imageInputRef}
              type="file"
              hidden
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImageFile(f);
                e.target.value = "";
              }}
            />
            <Button size="sm" onClick={doExport} disabled={busy || !pages.length}>
              <Download className="mr-2 h-4 w-4" /> Download PDF
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          <EditorToolbar
            tool={tool}
            setTool={setTool}
            config={config}
            setConfig={setConfig}
            onAddImage={onAddImageClick}
            onSignature={() => setSigOpen(true)}
            onDelete={deleteSelected}
            onUndo={undo}
            onRedo={redo}
            zoom={zoom}
            setZoom={setZoom}
            findOpen={findOpen}
            setFindOpen={setFindOpen}
            findText={findText}
            setFindText={setFindText}
            replaceText={replaceText}
            setReplaceText={setReplaceText}
            onFindReplace={doFindReplace}
          />

          <div className="flex h-[78vh]">
            <PageSidebar
              pages={pages}
              activeIndex={activeIndex}
              onSelect={setActiveIndex}
              onDelete={deletePage}
              onRotate={rotatePage}
              onInsertBlank={addBlankPage}
              onReorder={reorder}
            />
            <div className="flex-1 overflow-auto bg-muted/40 p-6">
              <div className="flex flex-col items-center gap-6">
                {pages.map((p, i) => (
                  <PageCanvasMount
                    key={p.id}
                    page={p}
                    active={i === activeIndex}
                    tool={tool}
                    config={config}
                    zoom={zoom}
                    onActivate={() => setActiveIndex(i)}
                    onChange={(json) => handlePageChange(p.id, json)}
                    onSelectionChange={setSelected}
                    setRef={setActiveCanvasRef(p.id)}
                  />
                ))}
                {!pages.length && (
                  <div className="rounded-lg border border-dashed p-12 text-sm text-muted-foreground">
                    Loading…
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SignatureDialog open={sigOpen} onClose={() => setSigOpen(false)} onConfirm={handleSignature} />

      {activePage && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Click a tool, then click on the page. Drag corners to resize. Press Delete to remove a selection.
        </p>
      )}
    </ToolPageLayout>
  );
}

function PageCanvasMount({
  setRef,
  ...props
}: React.ComponentProps<typeof PageCanvas> & { setRef: (h: PageCanvasHandle | null) => void }) {
  return (
    <PageCanvas
      ref={(h) => setRef(h)}
      {...props}
    />
  );
}
