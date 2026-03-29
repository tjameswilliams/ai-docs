import { useStore } from "../store";
import { api } from "../api/client";
import type { ChatMessage, ChatAttachment, MessageSegment, ToolCall } from "../types";
import { nanoid } from "nanoid";
import { parseSSEStream } from "./sseParser";

let abortController: AbortController | null = null;

export async function sendChatMessage(content: string, attachments?: ChatAttachment[]) {
  const { getState, setState } = useStore;

  if (getState().isStreaming) return;

  const userMsg: ChatMessage = {
    id: nanoid(),
    role: "user",
    content,
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
    timestamp: new Date().toISOString(),
  };
  setState({ messages: [...getState().messages, userMsg], isStreaming: true });

  const pid = getState().project?.id;
  if (pid) {
    api.saveMessage(pid, {
      id: userMsg.id,
      role: userMsg.role,
      content: userMsg.content,
      createdAt: userMsg.timestamp,
    }).catch((e) => console.error("[chatStream] save user message failed", e));
  }

  const allMessages = [...getState().messages].map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.attachments && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
  }));

  abortController = new AbortController();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: allMessages,
        projectId: getState().project?.id ?? null,
        activeDocumentId: getState().activeDocument?.id ?? null,
        editorContext: getState().editorContext ?? undefined,
      }),
      signal: abortController.signal,
    });

    if (!res.ok) throw new Error(`Chat error: ${res.statusText}`);

    const reader = res.body!.getReader();
    let assistantContent = "";
    let assistantThinking = "";
    const toolCalls: ToolCall[] = [];
    const segments: MessageSegment[] = [];
    let currentSegmentType: "thinking" | "text" | null = null;
    let assistantMsgId = nanoid();

    await parseSSEStream(reader, {
      onEvent: async (parsed) => {
        if (parsed.type === "assistant_msg_id") {
          assistantMsgId = parsed.id as string;
        }

        if (parsed.type === "thinking") {
          assistantThinking += (parsed.content || parsed.text || "");
          if (currentSegmentType === "thinking") {
            segments[segments.length - 1] = { type: "thinking", content: (segments[segments.length - 1] as { content: string }).content + (parsed.content || parsed.text || "") };
          } else {
            segments.push({ type: "thinking", content: (parsed.content || parsed.text || "") as string });
            currentSegmentType = "thinking";
          }
          setState((state: any) => {
            const existing = state.messages.find((m: any) => m.id === assistantMsgId);
            const msgData = { thinking: assistantThinking, segments: [...segments] };
            if (existing) {
              return { messages: state.messages.map((m: any) => m.id === assistantMsgId ? { ...m, ...msgData } : m) };
            }
            return {
              messages: [...state.messages, { id: assistantMsgId, role: "assistant", content: "", ...msgData, timestamp: new Date().toISOString() }],
            };
          });
        }

        if (parsed.type === "content") {
          assistantContent += (parsed.content || parsed.text || "");
          if (currentSegmentType === "text") {
            segments[segments.length - 1] = { type: "text", content: (segments[segments.length - 1] as { content: string }).content + (parsed.content || parsed.text || "") };
          } else {
            segments.push({ type: "text", content: (parsed.content || parsed.text || "") as string });
            currentSegmentType = "text";
          }
          setState((state: any) => {
            const existing = state.messages.find((m: any) => m.id === assistantMsgId);
            const msgData = { content: assistantContent, thinking: assistantThinking || undefined, segments: [...segments] };
            if (existing) {
              return { messages: state.messages.map((m: any) => m.id === assistantMsgId ? { ...m, ...msgData } : m) };
            }
            return {
              messages: [...state.messages, { id: assistantMsgId, role: "assistant", ...msgData, timestamp: new Date().toISOString() }],
            };
          });
        }

        if (parsed.type === "tool_call_result") {
          const tc = parsed;
          const toolCall: ToolCall = {
            id: tc.toolCallId as string,
            name: tc.name as string,
            arguments: tc.args as Record<string, unknown>,
            result: tc.result,
            status: tc.success ? "executed" : "rejected",
          };
          toolCalls.push(toolCall);
          segments.push({ type: "tool_call", toolCall });
          currentSegmentType = null;
          setState((state: any) => ({
            messages: state.messages.map((m: any) =>
              m.id === assistantMsgId ? { ...m, toolCalls: [...toolCalls], segments: [...segments] } : m
            ),
          }));

          // Reload folders and documents when tools succeed
          if (tc.success) {
            await getState().loadFolders();
            await getState().loadDocuments();
            await getState().refreshUndoState();
          }
        }

        if (parsed.type === "context_status") {
          setState({ contextStatus: { used: parsed.used as number, total: parsed.total as number } });
        }

        if (parsed.type === "summarizing") {
          setState({ isSummarizing: true });
        }

        if (parsed.type === "context_summarized") {
          const summary = parsed.summary as string;
          const pid2 = getState().project?.id;
          const summaryMsg: ChatMessage = {
            id: nanoid(),
            role: "system",
            content: summary,
            timestamp: new Date().toISOString(),
          };
          const currentMessages = getState().messages;
          const latestUserMsg = currentMessages[currentMessages.length - 1];
          setState({ messages: [summaryMsg, latestUserMsg], isSummarizing: false });
          if (pid2) {
            api.clearMessages(pid2)
              .then(() =>
                Promise.all([
                  api.saveMessage(pid2, { id: summaryMsg.id, role: summaryMsg.role, content: summaryMsg.content, createdAt: summaryMsg.timestamp }),
                  api.saveMessage(pid2, { id: latestUserMsg.id, role: latestUserMsg.role, content: latestUserMsg.content, createdAt: latestUserMsg.timestamp }),
                ])
              )
              .catch((e) => console.error("[chatStream] save summary failed", e));
          }
        }

        if (parsed.type === "done") {
          setState((state: any) => {
            const existing = state.messages.find((m: any) => m.id === assistantMsgId);
            if (!existing && (assistantContent || assistantThinking || toolCalls.length > 0)) {
              return {
                messages: [
                  ...state.messages,
                  {
                    id: assistantMsgId,
                    role: "assistant",
                    content: assistantContent,
                    thinking: assistantThinking || undefined,
                    toolCalls: toolCalls.length > 0 ? [...toolCalls] : undefined,
                    segments: segments.length > 0 ? [...segments] : undefined,
                    timestamp: new Date().toISOString(),
                  },
                ],
              };
            }
            return {};
          });

          const projId = getState().project?.id;
          if (projId && (assistantContent || assistantThinking || toolCalls.length > 0)) {
            const assistantMsg = getState().messages.find((m: any) => m.id === assistantMsgId);
            if (assistantMsg) {
              api.saveMessage(projId, {
                id: assistantMsg.id,
                role: assistantMsg.role,
                content: assistantMsg.content,
                thinking: assistantMsg.thinking,
                toolCalls: assistantMsg.toolCalls,
                segments: assistantMsg.segments,
                createdAt: assistantMsg.timestamp,
              }).catch((e) => console.error("[chatStream] save assistant message failed", e));
            }
          }

          if (toolCalls.length > 0) {
            await getState().loadFolders();
            await getState().loadDocuments();
          }
        }

        if (parsed.type === "error") {
          console.error("[chat] Server error:", parsed.error || parsed.message);
          setState({
            messages: [
              ...getState().messages,
              { id: nanoid(), role: "assistant", content: `Error: ${parsed.error || parsed.message}`, timestamp: new Date().toISOString() },
            ],
          });
        }
      },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      // User stopped
    } else {
      const err = e instanceof Error ? e : new Error(String(e));
      setState({
        messages: [
          ...getState().messages,
          { id: nanoid(), role: "assistant", content: `Error: ${err.message}`, timestamp: new Date().toISOString() },
        ],
      });
    }
  } finally {
    abortController = null;
    setState({ isStreaming: false });
  }
}

export function stopStreaming() {
  const { getState, setState } = useStore;
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  const msgs = getState().messages;
  const last = msgs[msgs.length - 1];
  if (last && last.role === "assistant") {
    setState({ messages: msgs.slice(0, -1), isStreaming: false });
  } else {
    setState({ isStreaming: false });
  }
}

export function retryLastMessage() {
  const { getState, setState } = useStore;
  if (getState().isStreaming) return;
  const msgs = getState().messages;
  let lastUserIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") { lastUserIdx = i; break; }
  }
  if (lastUserIdx === -1) return;
  const userContent = msgs[lastUserIdx].content;
  setState({ messages: msgs.slice(0, lastUserIdx) });
  sendChatMessage(userContent);
}

export async function restartFromMessage(messageId: string) {
  const { getState, setState } = useStore;
  if (getState().isStreaming) return;
  const msgs = getState().messages;
  const idx = msgs.findIndex((m) => m.id === messageId);
  if (idx === -1 || msgs[idx].role !== "user") return;
  const userContent = msgs[idx].content;
  const trimmed = msgs.slice(0, idx);
  setState({ messages: trimmed });

  // Delete messages after this point on the server
  const pid = getState().project?.id;
  if (pid && idx > 0) {
    api.deleteMessagesAfter(pid, msgs[idx - 1].id).catch(() => {});
  }

  sendChatMessage(userContent);
}
