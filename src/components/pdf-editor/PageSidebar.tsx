import { Plus, Trash2, RotateCw, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EditorPage } from "@/lib/pdf-editor/pdfDoc";

interface Props {
  pages: EditorPage[];
  activeIndex: number;
  onSelect: (i: number) => void;
  onDelete: (i: number) => void;
  onRotate: (i: number) => void;
  onInsertBlank: () => void;
  onReorder: (from: number, to: number) => void;
}

export function PageSidebar({
  pages,
  activeIndex,
  onSelect,
  onDelete,
  onRotate,
  onInsertBlank,
  onReorder,
}: Props) {
  return (
    <aside className="flex w-44 shrink-0 flex-col border-r bg-card">
      <div className="border-b p-2">
        <Button size="sm" variant="outline" className="w-full" onClick={onInsertBlank}>
          <Plus className="mr-2 h-4 w-4" /> Blank page
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {pages.map((p, i) => (
          <div
            key={p.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const from = Number(e.dataTransfer.getData("text/plain"));
              if (!Number.isNaN(from) && from !== i) onReorder(from, i);
            }}
            className={`group relative cursor-pointer rounded-md border bg-background p-1.5 transition-shadow hover:shadow ${
              i === activeIndex ? "border-primary ring-1 ring-primary" : "border-border"
            }`}
            onClick={() => onSelect(i)}
          >
            <div className="relative overflow-hidden rounded bg-muted">
              <img
                src={p.bgDataUrl}
                alt={`Page ${i + 1}`}
                className="block w-full"
                style={{ transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <GripVertical className="h-3 w-3" /> {i + 1}
              </span>
              <span className="flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                <button
                  className="rounded p-0.5 hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRotate(i);
                  }}
                  title="Rotate 90°"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
                <button
                  className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(i);
                  }}
                  title="Delete page"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
