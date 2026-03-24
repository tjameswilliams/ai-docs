interface SourceEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export function SourceEditor({ content, onChange }: SourceEditorProps) {
  return (
    <textarea
      value={content}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-full p-4 bg-zinc-950 text-zinc-200 font-mono text-sm resize-none outline-none"
      spellCheck={false}
    />
  );
}
