import { useState, useRef } from "react";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  onStop?: () => void;
  isStreaming?: boolean;
}

export function ChatInput({ onSend, disabled, onStop, isStreaming }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  return (
    <div className="p-3 border-t border-zinc-800">
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask AI to help with your documents..."
          disabled={disabled}
          rows={1}
          className="flex-1 px-3 py-2 text-sm rounded-lg bg-zinc-800 border border-zinc-700 focus:border-blue-500 focus:outline-none resize-none disabled:opacity-50"
        />
        {isStreaming ? (
          <button
            onClick={onStop}
            className="px-3 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white shrink-0"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || disabled}
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
