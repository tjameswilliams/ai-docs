import { useStore } from "../../store";
import { sendChatMessage, stopStreaming } from "../../lib/chatStream";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { PlanPanel } from "./PlanPanel";
import { Avatar, Icon, IconButton, Pill, SuggestionChip } from "../ui";
import { getSuggestions } from "./suggestions";

function EditorContextBar() {
  const activeDocument = useStore((s) => s.activeDocument);
  const editorContext = useStore((s) => s.editorContext);

  if (!activeDocument) return null;

  const hasSelection = editorContext?.selectedText && editorContext.selectedText.length > 0;
  const heading = editorContext?.headingPath?.length
    ? editorContext.headingPath.join(" › ")
    : null;

  return (
    <div
      className="px-3 py-1.5 flex items-center gap-2 shrink-0"
      style={{
        background: "rgba(15,15,18,0.6)",
        borderBottom: "1px solid #1c1c20",
        fontSize: 10.5,
      }}
    >
      <Icon name="file-text" size={11} className="text-zinc-600 shrink-0" />
      <span className="truncate" style={{ color: "#a1a1aa", maxWidth: 120 }}>
        {activeDocument.title || "Untitled"}
      </span>
      {heading && (
        <>
          <span style={{ color: "#3f3f46" }}>›</span>
          <span className="truncate" style={{ color: "#71717a", maxWidth: 140 }}>{heading}</span>
        </>
      )}
      {editorContext && (
        <span className="font-mono ml-auto" style={{ color: "#52525b" }}>
          ln {editorContext.cursorLine}
        </span>
      )}
      {hasSelection && (
        <Pill tone="info">
          {editorContext!.selectedText.length} chars
        </Pill>
      )}
    </div>
  );
}

function ContextMeter() {
  const contextStatus = useStore((s) => s.contextStatus);
  const isSummarizing = useStore((s) => s.isSummarizing);
  const isStreaming = useStore((s) => s.isStreaming);
  const summarizeChat = useStore((s) => s.summarizeChat);
  const messages = useStore((s) => s.messages);

  if (!contextStatus || messages.length === 0) return null;

  const { used, total } = contextStatus;
  const pct = Math.min((used / total) * 100, 100);
  const barFill =
    pct >= 80
      ? "linear-gradient(90deg, #f87171 0%, #ef4444 100%)"
      : pct >= 60
      ? "linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)"
      : "linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)";
  const glow =
    pct >= 80
      ? "0 0 6px rgba(239,68,68,0.5)"
      : pct >= 60
      ? "0 0 6px rgba(245,158,11,0.5)"
      : "0 0 6px rgba(59,130,246,0.5)";

  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${n}`);

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 shrink-0"
      style={{ borderBottom: "1px solid #1c1c20", background: "var(--gradient-chat-header)" }}
    >
      <Icon name="brain" size={12} className="text-zinc-500 shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-baseline justify-between">
          <span style={{ fontSize: 10, color: "#a1a1aa", fontWeight: 500 }}>Context</span>
          <span className="font-mono" style={{ fontSize: 9.5, color: "#71717a" }}>
            <span style={{ color: "#a1a1aa" }}>{fmt(used)}</span>
            <span> / {fmt(total)}</span>
          </span>
        </div>
        <div
          style={{
            height: 3,
            borderRadius: 9999,
            background: "#27272a",
            boxShadow: "inset 0 1px 0 rgba(0,0,0,0.4)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: barFill,
              borderRadius: 9999,
              boxShadow: glow,
              transition: "width 320ms cubic-bezier(0.2,0,0,1)",
            }}
          />
        </div>
      </div>
      <button
        onClick={summarizeChat}
        disabled={isSummarizing || isStreaming || messages.length < 3}
        className="inline-flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800"
        style={{
          fontSize: 10,
          padding: "3px 8px",
          borderRadius: 4,
          background: "#1c1c20",
          color: "#d4d4d8",
          border: "1px solid #27272a",
        }}
      >
        <Icon name="sparkle" size={10} />
        {isSummarizing ? "…" : "Compact"}
      </button>
    </div>
  );
}

function StarterSuggestions() {
  const project = useStore((s) => s.project);
  const activeDocument = useStore((s) => s.activeDocument);
  const editorContext = useStore((s) => s.editorContext);
  const activePlan = useStore((s) => s.activePlan);
  const messages = useStore((s) => s.messages);

  const suggestions = getSuggestions({
    project,
    activeDocument,
    hasSelection: !!editorContext?.selectedText && editorContext.selectedText.length > 0,
    selectedSnippet: editorContext?.selectedText || "",
    activePlan,
    hasMessages: messages.length > 0,
  });

  if (suggestions.length === 0) return null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
      <Avatar kind="assistant" size={36} />
      <div className="text-center" style={{ fontSize: 12, color: "#a1a1aa", maxWidth: 240 }}>
        Ask the AI to help with your documents — or pick a starting point.
      </div>
      <div className="flex flex-wrap gap-1.5 justify-center max-w-full">
        {suggestions.map((s, i) => (
          <SuggestionChip key={i} icon={s.icon} onClick={() => sendChatMessage(s.prompt)}>
            {s.label}
          </SuggestionChip>
        ))}
      </div>
    </div>
  );
}

export function ChatPane() {
  const project = useStore((s) => s.project);
  const messages = useStore((s) => s.messages);
  const isStreaming = useStore((s) => s.isStreaming);
  const clearMessages = useStore((s) => s.clearMessages);
  const activePlan = useStore((s) => s.activePlan);
  const chatMode = useStore((s) => s.chatMode);
  const settings = useStore((s) => s.settings);
  const isPlan = chatMode === "plan";

  const containerStyle = {
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    background: "var(--gradient-chat)",
    borderLeft: "1px solid #27272a",
  };

  if (!project) {
    return (
      <div style={containerStyle}>
        <div
          className="flex items-center px-3 shrink-0 gap-2"
          style={{ height: 44, borderBottom: "1px solid #27272a", background: "var(--gradient-chat-header)" }}
        >
          <Avatar kind="assistant" size={18} />
          <span style={{ fontSize: 12, fontWeight: 500, color: "#fafafa" }}>Chat</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-zinc-500 text-center">Select a project to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Header — 44px */}
      <div
        className="flex items-center px-3 shrink-0 gap-2"
        style={{
          height: 44,
          borderBottom: "1px solid #27272a",
          background: "var(--gradient-chat-header)",
        }}
      >
        <Avatar kind="assistant" size={18} />
        <span style={{ fontSize: 12, fontWeight: 500, color: "#fafafa" }}>
          {isPlan ? "Plan Mode" : "Chat"}
        </span>
        {settings.model && <Pill tone="neutral" mono>{settings.model}</Pill>}
        {isPlan && <Pill tone="plan">read-only</Pill>}
        <span className="flex-1" />
        {messages.length > 0 && (
          <IconButton
            icon="trash"
            size="sm"
            tooltip="Clear chat history"
            disabled={isStreaming}
            onClick={clearMessages}
          />
        )}
      </div>

      <ContextMeter />

      <EditorContextBar />

      {activePlan && <PlanPanel plan={activePlan} />}

      {messages.length === 0 ? (
        <StarterSuggestions />
      ) : (
        <MessageList messages={messages} />
      )}

      <ChatInput
        onSend={sendChatMessage}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        disabled={isStreaming}
      />
    </div>
  );
}
