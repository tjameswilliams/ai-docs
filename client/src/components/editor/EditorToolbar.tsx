import type { Editor } from "@tiptap/react";
import { IconButton, type IconName } from "../ui";

interface EditorToolbarProps {
  editor: Editor | null;
}

function Divider() {
  return <div className="w-px h-5 mx-1" style={{ background: "#27272a" }} />;
}

interface FormatButton {
  icon: IconName;
  tooltip: string;
  action: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
}

const groups: FormatButton[][] = [
  [
    { icon: "bold", tooltip: "Bold (⌘B)", action: (e) => e.chain().focus().toggleBold().run(), isActive: (e) => e.isActive("bold") },
    { icon: "italic", tooltip: "Italic (⌘I)", action: (e) => e.chain().focus().toggleItalic().run(), isActive: (e) => e.isActive("italic") },
    { icon: "strike", tooltip: "Strikethrough", action: (e) => e.chain().focus().toggleStrike().run(), isActive: (e) => e.isActive("strike") },
    { icon: "code", tooltip: "Inline code", action: (e) => e.chain().focus().toggleCode().run(), isActive: (e) => e.isActive("code") },
  ],
  [
    { icon: "h1", tooltip: "Heading 1", action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), isActive: (e) => e.isActive("heading", { level: 1 }) },
    { icon: "h2", tooltip: "Heading 2", action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), isActive: (e) => e.isActive("heading", { level: 2 }) },
    { icon: "h3", tooltip: "Heading 3", action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), isActive: (e) => e.isActive("heading", { level: 3 }) },
  ],
  [
    { icon: "ul", tooltip: "Bullet list", action: (e) => e.chain().focus().toggleBulletList().run(), isActive: (e) => e.isActive("bulletList") },
    { icon: "ol", tooltip: "Numbered list", action: (e) => e.chain().focus().toggleOrderedList().run(), isActive: (e) => e.isActive("orderedList") },
    { icon: "task", tooltip: "Task list", action: (e) => e.chain().focus().toggleTaskList().run(), isActive: (e) => e.isActive("taskList") },
  ],
  [
    { icon: "quote", tooltip: "Block quote", action: (e) => e.chain().focus().toggleBlockquote().run(), isActive: (e) => e.isActive("blockquote") },
    { icon: "code-block", tooltip: "Code block", action: (e) => e.chain().focus().toggleCodeBlock().run(), isActive: (e) => e.isActive("codeBlock") },
    { icon: "hr", tooltip: "Horizontal rule", action: (e) => e.chain().focus().setHorizontalRule().run() },
  ],
  [
    { icon: "table", tooltip: "Table", action: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { icon: "link", tooltip: "Link", action: (e) => {
      const url = prompt("URL:");
      if (url) e.chain().focus().setLink({ href: url }).run();
    }},
    { icon: "image", tooltip: "Image", action: (e) => {
      const url = prompt("Image URL:");
      if (url) e.chain().focus().setImage({ src: url }).run();
    }},
  ],
  [
    { icon: "math", tooltip: "Inline math", action: (e) => {
      const latex = prompt("LaTeX expression (e.g. E = mc^2):");
      if (latex) {
        e.chain().focus().insertContent({ type: "mathInline", attrs: { latex } }).run();
      }
    }},
    { icon: "math-block", tooltip: "Math block", action: (e) => {
      const latex = prompt("LaTeX block expression:");
      if (latex) {
        e.chain().focus().insertContent({ type: "mathBlock", attrs: { latex } }).run();
      }
    }},
  ],
];

export function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  return (
    <div
      className="flex items-center gap-0.5 px-3 shrink-0 flex-wrap"
      style={{
        height: 44,
        background: "var(--gradient-topbar)",
        borderBottom: "1px solid #27272a",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
      }}
    >
      {groups.map((group, gi) => (
        <div key={gi} className="flex items-center gap-0.5">
          {group.map((b, bi) => (
            <IconButton
              key={bi}
              icon={b.icon}
              size="sm"
              tooltip={b.tooltip}
              active={b.isActive ? b.isActive(editor) : false}
              onClick={() => b.action(editor)}
            />
          ))}
          {gi < groups.length - 1 && <Divider />}
        </div>
      ))}
    </div>
  );
}
