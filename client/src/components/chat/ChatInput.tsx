import { useState, useRef, useCallback } from "react";
import { api } from "../../api/client";
import type { ChatAttachment } from "../../types";

interface ChatInputProps {
  onSend: (content: string, attachments?: ChatAttachment[]) => void;
  disabled?: boolean;
  onStop?: () => void;
  isStreaming?: boolean;
}

export function ChatInput({ onSend, disabled, onStop, isStreaming }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if ((!input.trim() && attachments.length === 0) || disabled) return;
    onSend(input.trim(), attachments.length > 0 ? attachments : undefined);
    setInput("");
    setAttachments([]);
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
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;
    setUploading(true);
    try {
      const results = await Promise.all(
        fileArr.map(async (file) => {
          const { url } = await api.upload(file);
          return { url, name: file.name, type: file.type } as ChatAttachment;
        })
      );
      setAttachments((prev) => [...prev, ...results]);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      uploadFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) {
        uploadFiles(e.dataTransfer.files);
      }
    },
    [uploadFiles]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const isImage = (type: string) =>
    type.startsWith("image/");

  return (
    <div className="p-3 border-t border-zinc-800" onDrop={handleDrop} onDragOver={handleDragOver}>
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="relative group bg-zinc-800 rounded-md overflow-hidden border border-zinc-700"
            >
              {isImage(att.type) ? (
                <img
                  src={att.url}
                  alt={att.name}
                  className="h-16 w-16 object-cover"
                />
              ) : (
                <div className="h-16 w-16 flex items-center justify-center px-1">
                  <div className="text-center">
                    <div className="text-lg text-zinc-500">
                      {att.type.includes("pdf") ? "PDF" : "DOC"}
                    </div>
                    <div className="text-[8px] text-zinc-600 truncate max-w-[56px]">
                      {att.name}
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={() => removeAttachment(i)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
          {uploading && (
            <div className="h-16 w-16 flex items-center justify-center bg-zinc-800 rounded-md border border-zinc-700">
              <span className="text-[10px] text-zinc-500">...</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 items-end">
        {/* Attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="px-2 py-2 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 shrink-0 disabled:opacity-50"
          title="Attach files (images, PDFs, documents)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
            />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.md,.markdown,.csv,.json,.doc,.docx"
          onChange={handleFileSelect}
          className="hidden"
        />

        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={attachments.length > 0 ? "Add a message about these files..." : "Ask AI to help with your documents..."}
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
            disabled={(!input.trim() && attachments.length === 0) || disabled}
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
