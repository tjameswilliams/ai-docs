import type { Editor } from "@tiptap/react";

interface EditorToolbarProps {
  editor: Editor | null;
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  const btn = (label: string, action: () => void, isActive?: boolean) => (
    <button
      onClick={action}
      className={`px-2 py-1 text-xs rounded ${isActive ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900 flex-wrap">
      {btn("B", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {btn("I", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
      {btn("S", () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"))}
      {btn("Code", () => editor.chain().focus().toggleCode().run(), editor.isActive("code"))}

      <div className="w-px h-4 bg-zinc-700 mx-1" />

      {btn("H1", () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 }))}
      {btn("H2", () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
      {btn("H3", () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive("heading", { level: 3 }))}

      <div className="w-px h-4 bg-zinc-700 mx-1" />

      {btn("UL", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
      {btn("OL", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {btn("Task", () => editor.chain().focus().toggleTaskList().run(), editor.isActive("taskList"))}

      <div className="w-px h-4 bg-zinc-700 mx-1" />

      {btn("Quote", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
      {btn("Code Block", () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive("codeBlock"))}
      {btn("HR", () => editor.chain().focus().setHorizontalRule().run())}

      <div className="w-px h-4 bg-zinc-700 mx-1" />

      {btn("Table", () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      {btn("Link", () => {
        const url = prompt("URL:");
        if (url) editor.chain().focus().setLink({ href: url }).run();
      })}
      {btn("Image", () => {
        const url = prompt("Image URL:");
        if (url) editor.chain().focus().setImage({ src: url }).run();
      })}

      <div className="w-px h-4 bg-zinc-700 mx-1" />

      {btn("Math", () => {
        const latex = prompt("LaTeX expression (e.g. E = mc^2):");
        if (latex) {
          editor.chain().focus().insertContent({
            type: "mathInline",
            attrs: { latex },
          }).run();
        }
      })}
      {btn("Math Block", () => {
        const latex = prompt("LaTeX block expression:");
        if (latex) {
          editor.chain().focus().insertContent({
            type: "mathBlock",
            attrs: { latex },
          }).run();
        }
      })}
    </div>
  );
}
