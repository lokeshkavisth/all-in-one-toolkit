import { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, ListChecks, Quote, Minus,
  Undo2, Redo2, Link2, Image as ImageIcon, Table as TableIcon,
  Heading1, Heading2, Heading3, Subscript as SubIcon, Superscript as SupIcon,
  Highlighter, Type, Palette,
} from "lucide-react";
import { useRef } from "react";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

const FONTS = [
  "Default", "Arial", "Helvetica", "Georgia", "Times New Roman",
  "Courier New", "Verdana", "Tahoma", "Trebuchet MS", "Roboto", "Inter",
];
const SIZES = ["10", "12", "14", "16", "18", "20", "24", "30", "36", "48", "60", "72"];

type Props = { editor: Editor | null };

export function EditorToolbar({ editor }: Props) {
  const imgRef = useRef<HTMLInputElement>(null);
  if (!editor) return null;

  const insertImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => editor.chain().focus().setImage({ src: reader.result as string }).run();
    reader.readAsDataURL(file);
  };

  const btn = (active: boolean) => (active ? "bg-accent text-accent-foreground" : "");

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-1 border-b bg-card/95 backdrop-blur px-3 py-2">
      <Button size="icon" variant="ghost" onClick={() => editor.chain().focus().undo().run()} title="Undo"><Undo2 className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" onClick={() => editor.chain().focus().redo().run()} title="Redo"><Redo2 className="h-4 w-4" /></Button>
      <Separator orientation="vertical" className="h-6 mx-1" />

      <Select
        value={
          editor.isActive("heading", { level: 1 }) ? "h1"
          : editor.isActive("heading", { level: 2 }) ? "h2"
          : editor.isActive("heading", { level: 3 }) ? "h3"
          : "p"
        }
        onValueChange={(v) => {
          if (v === "p") editor.chain().focus().setParagraph().run();
          else editor.chain().focus().toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
        }}
      >
        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="p">Paragraph</SelectItem>
          <SelectItem value="h1">Heading 1</SelectItem>
          <SelectItem value="h2">Heading 2</SelectItem>
          <SelectItem value="h3">Heading 3</SelectItem>
        </SelectContent>
      </Select>

      <Select
        onValueChange={(v) => {
          if (v === "Default") editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(v).run();
        }}
      >
        <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Font" /></SelectTrigger>
        <SelectContent>{FONTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
      </Select>

      <Select
        onValueChange={(v) => {
          // Apply size via inline style on selected text using textStyle mark
          editor.chain().focus().setMark("textStyle", { style: `font-size:${v}px` } as never).run();
        }}
      >
        <SelectTrigger className="h-8 w-20"><SelectValue placeholder="Size" /></SelectTrigger>
        <SelectContent>{SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
      </Select>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Button size="icon" variant="ghost" className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"><Bold className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><Italic className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={btn(editor.isActive("underline"))} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline"><UnderlineIcon className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={btn(editor.isActive("strike"))} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough"><Strikethrough className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={btn(editor.isActive("code"))} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code"><Code className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={btn(editor.isActive("subscript"))} onClick={() => editor.chain().focus().toggleSubscript().run()} title="Subscript"><SubIcon className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={btn(editor.isActive("superscript"))} onClick={() => editor.chain().focus().toggleSuperscript().run()} title="Superscript"><SupIcon className="h-4 w-4" /></Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" title="Text color"><Palette className="h-4 w-4" /></Button>
        </PopoverTrigger>
        <PopoverContent className="w-44">
          <Input type="color" onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} className="h-10 w-full p-1" />
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => editor.chain().focus().unsetColor().run()}>Clear color</Button>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" title="Highlight"><Highlighter className="h-4 w-4" /></Button>
        </PopoverTrigger>
        <PopoverContent className="w-44">
          <Input type="color" defaultValue="#fff59d" onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()} className="h-10 w-full p-1" />
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => editor.chain().focus().unsetHighlight().run()}>Remove highlight</Button>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Button size="icon" variant="ghost" className={btn(editor.isActive({ textAlign: "left" }))} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={btn(editor.isActive({ textAlign: "center" }))} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={btn(editor.isActive({ textAlign: "right" }))} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={btn(editor.isActive({ textAlign: "justify" }))} onClick={() => editor.chain().focus().setTextAlign("justify").run()}><AlignJustify className="h-4 w-4" /></Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Button size="icon" variant="ghost" className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list"><List className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list"><ListOrdered className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={btn(editor.isActive("taskList"))} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Task list"><ListChecks className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className={btn(editor.isActive("blockquote"))} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote"><Quote className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider"><Minus className="h-4 w-4" /></Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Button size="icon" variant="ghost" onClick={() => {
        const url = window.prompt("Enter URL");
        if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url, target: "_blank" }).run();
      }} title="Link"><Link2 className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" onClick={() => imgRef.current?.click()} title="Image"><ImageIcon className="h-4 w-4" /></Button>
      <input ref={imgRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) insertImage(f); e.target.value = ""; }} />

      <Popover>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" title="Table"><TableIcon className="h-4 w-4" /></Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 space-y-2">
          <Button size="sm" className="w-full" variant="outline" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Insert 3×3 table</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().addRowAfter().run()}>+ Row</Button>
            <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Col</Button>
            <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().deleteRow().run()}>− Row</Button>
            <Button size="sm" variant="ghost" onClick={() => editor.chain().focus().deleteColumn().run()}>− Col</Button>
          </div>
          <Button size="sm" variant="destructive" className="w-full" onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
