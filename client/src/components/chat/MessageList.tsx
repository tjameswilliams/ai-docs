import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import type { ChatMessage, MessageSegment, ToolCall } from "../../types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Avatar, IconButton, ToolChip, Icon } from "../ui";

interface MessageListProps {
  messages: ChatMessage[];
}

// Group messages by calendar day. Returns [{ date, items }] preserving order.
function groupByDay(messages: ChatMessage[]) {
  const groups: { date: Date; items: ChatMessage[] }[] = [];
  for (const msg of messages) {
    const ts = msg.timestamp || msg.createdAt;
    const date = ts ? new Date(ts) : new Date();
    const last = groups[groups.length - 1];
    if (last && sameDay(last.date, date)) {
      last.items.push(msg);
    } else {
      groups.push({ date, items: [msg] });
    }
  }
  return groups;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(date, today)) return "TODAY";
  if (sameDay(date, yesterday)) return "YESTERDAY";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

function timeLabel(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const isStreaming = useStore((s) => s.isStreaming);
  const settings = useStore((s) => s.settings);
  const retryLastMessage = useStore((s) => s.retryLastMessage);
  const restartFromMessage = useStore((s) => s.restartFromMessage);

  const lastMsg = messages[messages.length - 1];
  const showRetry =
    !isStreaming &&
    messages.length > 0 &&
    lastMsg &&
    (lastMsg.content.startsWith("Error:") || lastMsg.role === "user");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const groups = groupByDay(messages);

  return (
    <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
      {groups.map((group, gi) => (
        <div key={gi} className="space-y-3">
          <DaySeparator date={group.date} />
          {group.items.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLast={gi === groups.length - 1 && idx === group.items.length - 1}
              isStreaming={isStreaming}
              onRestart={restartFromMessage}
              modelTag={settings.model}
            />
          ))}
        </div>
      ))}
      {isStreaming && <StreamingIndicator />}
      {showRetry && (
        <div className="flex justify-center">
          <button
            onClick={retryLastMessage}
            className="text-xs text-blue-400 hover:text-blue-300 px-3 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function DaySeparator({ date }: { date: Date }) {
  return (
    <div className="flex items-center gap-2 my-1">
      <div className="flex-1 h-px" style={{ background: "#1c1c20" }} />
      <span
        className="font-mono"
        style={{ fontSize: 9.5, color: "#52525b", letterSpacing: "0.05em" }}
      >
        {dayLabel(date)} · {timeLabel(date)}
      </span>
      <div className="flex-1 h-px" style={{ background: "#1c1c20" }} />
    </div>
  );
}

function StreamingIndicator() {
  return (
    <div className="flex items-start gap-2">
      <Avatar kind="assistant" size={22} />
      <div
        className="px-3.5 py-2.5 flex items-center gap-1"
        style={{
          borderRadius: "12px 12px 12px 3px",
          background: "linear-gradient(180deg, #1c1c20 0%, #16161a 100%)",
          border: "1px solid #27272a",
        }}
      >
        <span className="ai-bounce-dot" />
        <span className="ai-bounce-dot" style={{ animationDelay: "0.15s" }} />
        <span className="ai-bounce-dot" style={{ animationDelay: "0.3s" }} />
      </div>
    </div>
  );
}

function MessageBubble({ message, isLast, isStreaming, onRestart, modelTag }: {
  message: ChatMessage;
  isLast: boolean;
  isStreaming: boolean;
  onRestart: (id: string) => void;
  modelTag?: string;
}) {
  if (message.role === "system") {
    return (
      <div className="text-[11px] italic px-2.5 py-1.5 rounded" style={{ background: "rgba(28,28,32,0.7)", color: "#71717a", border: "1px solid #27272a" }}>
        <span className="font-medium not-italic" style={{ color: "#a1a1aa" }}>System ·</span> {message.content.slice(0, 240)}
        {message.content.length > 240 ? "…" : ""}
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="group/msg flex items-start gap-2 justify-end">
        <div className="flex flex-col items-end gap-1 max-w-[85%]">
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-end">
              {message.attachments.map((att, i) => (
                <div key={i} className="rounded-md overflow-hidden border border-zinc-700 bg-zinc-800">
                  {att.type.startsWith("image/") ? (
                    <img src={att.url} alt={att.name} className="h-20 max-w-[160px] object-cover" />
                  ) : (
                    <div className="px-2 py-1 text-[10px] text-zinc-400 flex items-center gap-1">
                      <span className="text-zinc-500">{att.type.includes("pdf") ? "PDF" : "DOC"}</span>
                      <span className="truncate max-w-[100px]">{att.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div
            className="px-3.5 py-2.5 whitespace-pre-wrap"
            style={{
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "#dbeafe",
              background: "linear-gradient(180deg, rgba(59,130,246,0.18) 0%, rgba(37,99,235,0.22) 100%)",
              border: "1px solid rgba(59,130,246,0.25)",
              borderRadius: "12px 12px 3px 12px",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 6px rgba(0,0,0,0.2)",
            }}
          >
            {message.content}
          </div>
          {!isStreaming && !isLast && (
            <button
              onClick={() => onRestart(message.id)}
              className="text-[10px] text-blue-400/0 group-hover/msg:text-blue-400/70 hover:!text-blue-300 transition-colors"
            >
              Restart from here
            </button>
          )}
        </div>
        <Avatar kind="user" size={22} initials="TW" className="mt-1" />
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-start gap-2">
      <Avatar kind="assistant" size={22} className="mt-1" />
      <div
        className="flex flex-col gap-1.5 max-w-[88%] px-3.5 py-2.5"
        style={{
          fontSize: 12.5,
          lineHeight: 1.55,
          color: "#e4e4e7",
          background: "linear-gradient(180deg, #1c1c20 0%, #16161a 100%)",
          border: "1px solid #27272a",
          borderRadius: "12px 12px 12px 3px",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 2px 6px rgba(0,0,0,0.2)",
        }}
      >
        {message.segments && message.segments.length > 0 ? (
          message.segments.map((seg, i) => <SegmentView key={i} segment={seg} />)
        ) : (
          <MarkdownContent content={message.content} />
        )}

        {/* Action row */}
        {(message.content || message.segments) && (
          <div
            className="flex items-center gap-0 pt-1.5 mt-1"
            style={{ borderTop: "1px solid rgba(63,63,70,0.5)" }}
          >
            <IconButton
              icon="copy"
              size="sm"
              tooltip="Copy"
              onClick={() => navigator.clipboard.writeText(message.content || "")}
            />
            <IconButton icon="thumbs-up" size="sm" tooltip="Good response" />
            <IconButton icon="thumbs-down" size="sm" tooltip="Bad response" />
            <span className="flex-1" />
            {modelTag && (
              <span
                className="font-mono px-1.5 py-0.5 rounded"
                style={{ fontSize: 9.5, color: "#52525b", background: "rgba(63,63,70,0.4)" }}
              >
                {modelTag}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SegmentView({ segment }: { segment: MessageSegment }) {
  const [open, setOpen] = useState(false);

  if (segment.type === "thinking") {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-300"
          style={{ fontSize: 10.5, color: "#71717a" }}
        >
          <Icon
            name="caret-r"
            size={10}
            className={"transition-transform " + (open ? "rotate-90" : "")}
          />
          <span style={{ fontStyle: "italic" }}>Thought process</span>
        </button>
        {open && (
          <div
            className="mt-1.5 ml-1.5 whitespace-pre-wrap"
            style={{
              borderLeft: "2px solid #3f3f46",
              paddingLeft: 10,
              paddingTop: 2,
              paddingBottom: 2,
              fontSize: 11,
              color: "#a1a1aa",
              lineHeight: 1.55,
              fontStyle: "italic",
            }}
          >
            {segment.content}
          </div>
        )}
      </div>
    );
  }

  if (segment.type === "tool_call" && segment.toolCall) {
    return <ToolCallSegment toolCall={segment.toolCall} />;
  }

  return <MarkdownContent content={segment.content || ""} />;
}

function ToolCallSegment({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const status =
    toolCall.status === "executed"
      ? "done"
      : toolCall.status === "rejected"
      ? "failed"
      : "running";

  // First-line preview of the args, truncated.
  const argSummary = toolCall.arguments
    ? Object.entries(toolCall.arguments)
        .slice(0, 1)
        .map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 32) : JSON.stringify(v).slice(0, 32)}`)
        .join(" ")
    : "";

  return (
    <div>
      <ToolChip
        status={status}
        name={toolCall.name}
        label={argSummary}
        onClick={() => setExpanded(!expanded)}
      />
      {expanded && (
        <div className="mt-1.5 space-y-1.5" style={{ fontSize: 10.5 }}>
          {toolCall.arguments && (
            <div>
              <div style={{ color: "#71717a", fontWeight: 500, marginBottom: 2 }}>Args</div>
              <pre
                className="whitespace-pre-wrap rounded p-2 overflow-x-auto font-mono"
                style={{ background: "rgba(15,15,18,0.7)", color: "#a1a1aa", fontSize: 10.5 }}
              >
                {JSON.stringify(toolCall.arguments, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.result !== undefined && (
            <div>
              <div style={{ color: "#71717a", fontWeight: 500, marginBottom: 2 }}>Result</div>
              <pre
                className="whitespace-pre-wrap rounded p-2 overflow-x-auto font-mono"
                style={{ background: "rgba(15,15,18,0.7)", color: "#a1a1aa", fontSize: 10.5, maxHeight: 200, overflowY: "auto" }}
              >
                {typeof toolCall.result === "string" ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
