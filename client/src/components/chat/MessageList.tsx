import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import type { ChatMessage, MessageSegment, ToolCall } from "../../types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const isStreaming = useStore((s) => s.isStreaming);
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

  return (
    <div className="flex-1 overflow-auto p-3 space-y-3">
      {messages.map((msg, idx) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isLast={idx === messages.length - 1}
          isStreaming={isStreaming}
          onRestart={restartFromMessage}
        />
      ))}
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

function MessageBubble({ message, isLast, isStreaming, onRestart }: {
  message: ChatMessage;
  isLast: boolean;
  isStreaming: boolean;
  onRestart: (id: string) => void;
}) {
  if (message.role === "system") {
    return (
      <div className="text-xs text-zinc-500 italic px-2 py-1 bg-zinc-800/50 rounded">
        <span className="font-medium">System:</span> {message.content.slice(0, 200)}
        {message.content.length > 200 ? "..." : ""}
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="group/msg flex flex-col items-end">
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex gap-1.5 mb-1 flex-wrap justify-end max-w-[85%]">
            {message.attachments.map((att, i) => (
              <div key={i} className="rounded-md overflow-hidden border border-zinc-700 bg-zinc-800">
                {att.type.startsWith("image/") ? (
                  <img src={att.url} alt={att.name} className="h-20 max-w-[160px] object-cover" />
                ) : (
                  <div className="px-2 py-1 text-[10px] text-zinc-400 flex items-center gap-1">
                    <span className="text-zinc-500">
                      {att.type.includes("pdf") ? "PDF" : "DOC"}
                    </span>
                    <span className="truncate max-w-[100px]">{att.name}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="max-w-[85%] px-3 py-2 rounded-lg bg-blue-600/20 text-sm whitespace-pre-wrap">
          {message.content}
        </div>
        {!isStreaming && !isLast && (
          <button
            onClick={() => onRestart(message.id)}
            className="mt-0.5 text-[10px] text-blue-400/0 group-hover/msg:text-blue-400/70 hover:!text-blue-300 transition-colors"
          >
            Restart from here
          </button>
        )}
      </div>
    );
  }

  // Assistant message with segments
  if (message.segments && message.segments.length > 0) {
    return (
      <div className="max-w-[95%] space-y-1.5">
        {message.segments.map((seg, i) => (
          <SegmentView key={i} segment={seg} />
        ))}
      </div>
    );
  }

  // Simple assistant message
  return (
    <div className="max-w-[95%] px-3 py-2 rounded-lg bg-zinc-800/60 text-sm">
      <MarkdownContent content={message.content} />
    </div>
  );
}

function SegmentView({ segment }: { segment: MessageSegment }) {
  const [collapsed, setCollapsed] = useState(true);

  if (segment.type === "thinking") {
    return (
      <div className="text-xs text-zinc-500 bg-zinc-900/80 rounded-md px-3 py-1.5 border border-zinc-800/60">
        <button onClick={() => setCollapsed(!collapsed)} className="font-medium hover:text-zinc-300 flex items-center gap-1.5">
          <span className="text-[10px]">{collapsed ? "\u25b6" : "\u25bc"}</span>
          <span>Thinking</span>
        </button>
        {!collapsed && (
          <div className="mt-1.5 whitespace-pre-wrap opacity-60 leading-relaxed">{segment.content}</div>
        )}
      </div>
    );
  }

  if (segment.type === "tool_call" && segment.toolCall) {
    return <ToolCallView toolCall={segment.toolCall} />;
  }

  // text segment
  return (
    <div className="px-3 py-2 rounded-lg bg-zinc-800/60 text-sm">
      <MarkdownContent content={segment.content || ""} />
    </div>
  );
}

function ToolCallView({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const isSuccess = toolCall.status === "executed";

  return (
    <div className={`text-xs rounded-md px-3 py-1.5 border ${isSuccess ? "border-green-800/40 bg-green-950/30" : "border-red-800/40 bg-red-950/30"}`}>
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 font-medium hover:text-zinc-200 w-full">
        <span className={isSuccess ? "text-green-500" : "text-red-500"}>{isSuccess ? "+" : "\u00d7"}</span>
        <span className="text-zinc-300">{toolCall.name}</span>
        <span className="text-zinc-600 font-normal ml-auto">{expanded ? "(collapse)" : "(expand)"}</span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 text-[11px]">
          {toolCall.arguments && (
            <div>
              <span className="text-zinc-500 font-medium">Args</span>
              <pre className="mt-0.5 whitespace-pre-wrap text-zinc-400 bg-zinc-900/50 rounded p-2 overflow-x-auto">{JSON.stringify(toolCall.arguments, null, 2)}</pre>
            </div>
          )}
          {toolCall.result !== undefined && (
            <div>
              <span className="text-zinc-500 font-medium">Result</span>
              <pre className="mt-0.5 whitespace-pre-wrap text-zinc-400 bg-zinc-900/50 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">{typeof toolCall.result === "string" ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}</pre>
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
