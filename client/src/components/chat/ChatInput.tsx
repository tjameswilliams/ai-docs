import { useState, useRef, useCallback } from "react";
import { api } from "../../api/client";
import { useStore } from "../../store";
import type { ChatAttachment } from "../../types";
import { Button, IconButton, Kbd } from "../ui";

interface ChatInputProps {
  onSend: (content: string, attachments?: ChatAttachment[]) => void;
  disabled?: boolean;
  onStop?: () => void;
  isStreaming?: boolean;
}

const MAX_CHARS = 4000;

export function ChatInput({ onSend, disabled, onStop, isStreaming }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatMode = useStore((s) => s.chatMode);
  const toggleChatMode = useStore((s) => s.toggleChatMode);
  const setChatMode = useStore((s) => s.setChatMode);

  const isPlan = chatMode === "plan";

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
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      toggleChatMode();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
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

  return (
    <div
      className="p-3 shrink-0 transition-colors"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      style={{
        borderTop: "1px solid #27272a",
        background: "var(--gradient-chat)",
      }}
    >
      {/* Mode toggle row */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="inline-flex items-center"
          style={{
            background: "#0a0a0c",
            border: "1px solid #27272a",
            borderRadius: 5,
            padding: 2,
            boxShadow: "inset 0 1px 0 rgba(0,0,0,0.3)",
          }}
        >
          <button
            onClick={() => setChatMode("chat")}
            className="inline-flex items-center gap-1 transition-all"
            style={{
              padding: "4px 10px",
              borderRadius: 3,
              fontSize: 10.5,
              fontWeight: !isPlan ? 500 : 400,
              color: !isPlan ? "#fafafa" : "#71717a",
              background: !isPlan ? "linear-gradient(180deg, #2d2d33 0%, #232328 100%)" : "transparent",
              border: !isPlan ? "1px solid #3f3f46" : "1px solid transparent",
              boxShadow: !isPlan ? "inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.25)" : "none",
            }}
          >
            Chat
          </button>
          <button
            onClick={() => setChatMode("plan")}
            className="inline-flex items-center gap-1 transition-all"
            style={{
              padding: "4px 10px",
              borderRadius: 3,
              fontSize: 10.5,
              fontWeight: isPlan ? 500 : 400,
              color: isPlan ? "#fde68a" : "#71717a",
              background: isPlan ? "var(--gradient-plan-active)" : "transparent",
              border: isPlan ? "1px solid rgba(217,119,6,0.4)" : "1px solid transparent",
              boxShadow: isPlan ? "inset 0 1px 0 rgba(253,230,138,0.08)" : "none",
            }}
          >
            Plan
          </button>
        </div>
        <span className="flex-1" />
        <Kbd>⇧⇥</Kbd>
        <span style={{ fontSize: 9.5, color: "#52525b" }}>to toggle</span>
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="relative group rounded-md overflow-hidden"
              style={{ background: "#1c1c20", border: "1px solid #27272a" }}
            >
              {att.type.startsWith("image/") ? (
                <img src={att.url} alt={att.name} className="h-16 w-16 object-cover" />
              ) : (
                <div className="h-16 w-16 flex items-center justify-center px-1">
                  <div className="text-center">
                    <div className="text-base text-zinc-500 font-mono">
                      {att.type.includes("pdf") ? "PDF" : "DOC"}
                    </div>
                    <div className="text-[8px] text-zinc-600 truncate max-w-[56px]">{att.name}</div>
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
            <div
              className="h-16 w-16 flex items-center justify-center rounded-md"
              style={{ background: "#1c1c20", border: "1px solid #27272a", fontSize: 10, color: "#71717a" }}
            >
              ...
            </div>
          )}
        </div>
      )}

      {/* Composer bubble */}
      <div
        className="transition-colors"
        style={{
          background: isPlan ? "rgba(120,53,15,0.18)" : "#16161a",
          border: "1px solid",
          borderColor: isPlan ? "rgba(180,83,9,0.5)" : "#27272a",
          borderRadius: 8,
          boxShadow: isPlan
            ? "0 0 0 3px rgba(180,83,9,0.08), inset 0 1px 0 rgba(0,0,0,0.2)"
            : "inset 0 1px 0 rgba(0,0,0,0.2)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            isPlan
              ? "Describe what you want to plan…"
              : attachments.length > 0
              ? "Add a message about these files…"
              : "Ask AI to help with your documents…"
          }
          disabled={disabled}
          rows={2}
          className="w-full resize-none outline-none bg-transparent"
          style={{
            padding: "10px 12px",
            fontSize: 12.5,
            lineHeight: 1.5,
            color: isPlan ? "#fde68a" : "#e4e4e7",
            minHeight: 48,
            maxHeight: 160,
          }}
        />
        {/* Internal toolbar */}
        <div
          className="flex items-center gap-0.5 px-2 py-1.5"
          style={{
            borderTop: "1px solid",
            borderTopColor: isPlan ? "rgba(180,83,9,0.25)" : "#27272a",
          }}
        >
          <IconButton
            icon="attach"
            size="sm"
            tooltip="Attach files"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.markdown,.csv,.json,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />
          <span className="flex-1" />
          <span
            className="font-mono mr-2"
            style={{ fontSize: 9.5, color: input.length > MAX_CHARS ? "#f87171" : "#52525b" }}
          >
            {input.length} / {MAX_CHARS}
          </span>
          {isStreaming ? (
            <Button variant="destructive" size="sm" icon="stop" onClick={onStop}>
              Stop
            </Button>
          ) : (
            <Button
              variant={isPlan ? "plan" : "primary"}
              size="sm"
              icon={isPlan ? "math" : "send"}
              kbd="↵"
              disabled={(!input.trim() && attachments.length === 0) || disabled}
              onClick={handleSubmit}
            >
              {isPlan ? "Plan" : "Send"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
