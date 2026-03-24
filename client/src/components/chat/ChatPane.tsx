import { useStore } from "../../store";
import { sendChatMessage, stopStreaming } from "../../lib/chatStream";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

const STARTER_SUGGESTIONS = [
  "Create a new document called 'Getting Started'",
  "What documents are in this project?",
  "Help me outline a blog post about AI",
  "Create a folder structure for a book",
];

function EditorContextBar() {
  const activeDocument = useStore((s) => s.activeDocument);
  const editorContext = useStore((s) => s.editorContext);

  if (!activeDocument) return null;

  const hasSelection = editorContext?.selectedText && editorContext.selectedText.length > 0;
  const heading = editorContext?.headingPath?.length
    ? editorContext.headingPath.join(" > ")
    : null;

  return (
    <div className="px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/50 text-[11px] text-zinc-500 flex items-center gap-2 shrink-0">
      <span className="text-zinc-600">Context:</span>
      <span className="text-zinc-400 truncate">{activeDocument.title}</span>
      {heading && (
        <>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-500 truncate">{heading}</span>
        </>
      )}
      {editorContext && (
        <span className="text-zinc-600">ln {editorContext.cursorLine}</span>
      )}
      {hasSelection && (
        <span className="ml-auto shrink-0 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">
          {editorContext!.selectedText.length > 40
            ? `"${editorContext!.selectedText.slice(0, 40)}..."`
            : `"${editorContext!.selectedText}"`}
        </span>
      )}
    </div>
  );
}

function ContextUsageBar() {
  const contextStatus = useStore((s) => s.contextStatus);
  const isSummarizing = useStore((s) => s.isSummarizing);
  const isStreaming = useStore((s) => s.isStreaming);
  const summarizeChat = useStore((s) => s.summarizeChat);
  const messages = useStore((s) => s.messages);

  if (!contextStatus || messages.length === 0) return null;

  const { used, total } = contextStatus;
  const pct = Math.min((used / total) * 100, 100);
  const barColor =
    pct >= 80 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-blue-500";
  const textColor =
    pct >= 80 ? "text-red-400" : pct >= 60 ? "text-amber-400" : "text-zinc-500";

  return (
    <div className="px-3 py-1.5 border-b border-zinc-800/50 flex items-center gap-2">
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-[10px] tabular-nums shrink-0 ${textColor}`}>
          {Math.round(pct)}%
        </span>
      </div>
      <button
        onClick={summarizeChat}
        disabled={isSummarizing || isStreaming || messages.length < 3}
        className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        title="Summarize conversation to free up context"
      >
        {isSummarizing ? "Summarizing..." : "Summarize"}
      </button>
    </div>
  );
}

export function ChatPane() {
  const project = useStore((s) => s.project);
  const messages = useStore((s) => s.messages);
  const isStreaming = useStore((s) => s.isStreaming);
  const clearMessages = useStore((s) => s.clearMessages);

  if (!project) {
    return (
      <div className="h-full flex flex-col">
        <div className="h-10 flex items-center px-3 border-b border-zinc-800 shrink-0">
          <span className="text-xs font-medium text-zinc-400">Chat</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-zinc-500 text-center">Select a project to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-10 flex items-center px-3 border-b border-zinc-800 shrink-0">
        <span className="text-xs font-medium text-zinc-400">Chat</span>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            disabled={isStreaming}
            className="ml-auto text-[10px] px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Clear chat history"
          >
            Clear
          </button>
        )}
      </div>

      {/* Context usage bar with summarize */}
      <ContextUsageBar />

      {/* Editor context bar */}
      <EditorContextBar />

      {/* Messages or starter suggestions */}
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-2">
          <p className="text-xs text-zinc-500 mb-2">Try asking:</p>
          {STARTER_SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => sendChatMessage(s)}
              className="w-full text-left px-3 py-2 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        <MessageList messages={messages} />
      )}

      {/* Input */}
      <ChatInput
        onSend={sendChatMessage}
        onStop={stopStreaming}
        isStreaming={isStreaming}
        disabled={isStreaming}
      />
    </div>
  );
}
