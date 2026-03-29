import { Hono } from "hono";
import { streamChat, estimateTokens, getContextWindowSize, summarizeConversation } from "../lib/llm";
import { getToolDefinitions, executeToolCall } from "../lib/tools/index";
import { generateGroupId } from "../lib/undoManager";
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../lib/nanoid";
import { runtime } from "../runtime";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { getSystemPrompt } from "../lib/systemPrompt";
import { getStyleProfile } from "../lib/styleAnalyzer";
import { mcpClientManager } from "../lib/mcp/clientManager";

const app = new Hono();

type MsgContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

function contentToString(content: MsgContent): string {
  if (typeof content === "string") return content;
  return content.map((b) => b.text || "[image]").join(" ");
}

function estimateFullContextUsage(
  conversation: Array<{ role: string; content: MsgContent }>,
  toolsJson: string
): number {
  const convTokens = estimateTokens(conversation.map((m) => contentToString(m.content)).join("\n"));
  const toolTokens = estimateTokens(toolsJson);
  return convTokens + toolTokens;
}

function compactToolResults(
  conversation: Array<{
    role: string;
    content: MsgContent;
    tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    tool_call_id?: string;
  }>,
  keepRecent: number = 4
): void {
  const toolIndices: number[] = [];
  for (let i = 0; i < conversation.length; i++) {
    if (conversation[i].role === "tool") toolIndices.push(i);
  }
  const toCompact = toolIndices.slice(0, Math.max(0, toolIndices.length - keepRecent));
  for (const idx of toCompact) {
    const msg = conversation[idx];
    if (typeof msg.content !== "string") continue;
    try {
      const parsed = JSON.parse(msg.content);
      msg.content = JSON.stringify({
        success: parsed.success,
        result: parsed.success ? "(completed)" : "(failed)",
      });
    } catch { /* already compact */ }
  }
}

/**
 * Transform messages with attachments into multimodal content blocks.
 * Images become image_url blocks; documents become text blocks with content.
 */
function transformAttachments(
  messages: Array<{ role: string; content: string; attachments?: Array<{ url: string; name: string; type: string }> }>
): Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> {
  return messages.map((msg) => {
    if (!msg.attachments || msg.attachments.length === 0) {
      return { role: msg.role, content: msg.content };
    }

    const contentBlocks: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    // Add text content first
    if (msg.content) {
      contentBlocks.push({ type: "text", text: msg.content });
    }

    for (const att of msg.attachments) {
      if (att.type.startsWith("image/")) {
        // Convert local uploads to base64 data URIs for the LLM
        let imageUrl = att.url;
        const localMatch = att.url.match(/^\/api\/uploads\/(.+)$/);
        if (localMatch) {
          const uploadsDir = resolve(runtime.getDataDir(), "uploads");
          const filePath = resolve(uploadsDir, localMatch[1]);
          if (existsSync(filePath)) {
            try {
              const data = readFileSync(filePath);
              const base64 = Buffer.from(data).toString("base64");
              const ext = localMatch[1].split(".").pop()?.toLowerCase() || "png";
              const mimeMap: Record<string, string> = {
                png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
                gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
              };
              imageUrl = `data:${mimeMap[ext] || "image/png"};base64,${base64}`;
            } catch { /* keep original URL */ }
          }
        }
        contentBlocks.push({ type: "image_url", image_url: { url: imageUrl } });
      } else {
        // For non-image files (PDF, text, etc.), read content and include as text
        const localMatch = att.url.match(/^\/api\/uploads\/(.+)$/);
        if (localMatch) {
          const uploadsDir = resolve(runtime.getDataDir(), "uploads");
          const filePath = resolve(uploadsDir, localMatch[1]);
          if (existsSync(filePath)) {
            try {
              const data = readFileSync(filePath, "utf-8");
              contentBlocks.push({
                type: "text",
                text: `[Attached file: ${att.name}]\n\n${data}`,
              });
            } catch {
              contentBlocks.push({
                type: "text",
                text: `[Attached file: ${att.name} — could not read content]`,
              });
            }
          }
        }
      }
    }

    return { role: msg.role, content: contentBlocks.length === 1 && contentBlocks[0].type === "text" ? contentBlocks[0].text! : contentBlocks };
  });
}

app.post("/chat", async (c) => {
  const body = await c.req.json();
  const { messages: clientMessages, projectId, activeDocumentId, editorContext } = body;

  // Build context
  const [project] = projectId
    ? await db.select().from(schema.projects).where(eq(schema.projects.id, projectId))
    : [null];

  const folders = projectId
    ? await db.select().from(schema.folders).where(eq(schema.folders.projectId, projectId))
    : [];

  const documents = projectId
    ? await db.select().from(schema.documents).where(eq(schema.documents.projectId, projectId))
    : [];

  // Get active document title
  const activeDoc = activeDocumentId
    ? documents.find((d) => d.id === activeDocumentId)
    : null;

  // Load style profile if available
  const styleProfile = projectId ? await getStyleProfile(projectId) : null;

  const systemPrompt = getSystemPrompt({
    projectName: project?.name,
    folders: folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId })),
    documents: documents.map((d) => ({ id: d.id, title: d.title, folderId: d.folderId, wordCount: d.wordCount })),
    activeDocumentId: activeDoc?.id,
    activeDocumentTitle: activeDoc?.title,
    editorContext: editorContext || undefined,
    styleGuide: styleProfile?.guide || undefined,
  });

  const builtInTools = getToolDefinitions();
  const externalTools = mcpClientManager.getAllToolDefinitions();
  const tools = [...builtInTools, ...externalTools];
  const toolsJson = JSON.stringify(tools);

  // Append external tool info to system prompt if any
  let finalSystemPrompt = systemPrompt;
  if (externalTools.length > 0) {
    const toolList = externalTools
      .map((t) => `- ${t.function.name}: ${t.function.description}`)
      .join("\n");
    finalSystemPrompt += `\n\nYou also have access to external tools from connected MCP servers:\n${toolList}\nUse these when the user's request involves external services like image generation. IMPORTANT: When an external tool returns an image URL, you MUST use the download_image tool to download it locally before inserting it into a document. External URLs are often temporary and will break. The download_image tool returns a local URL and ready-to-use markdown syntax.`;
  }

  let consecutiveErrors = 0;

  // Transform messages with attachments into multimodal content blocks
  const transformedMessages = transformAttachments(clientMessages);

  const conversation: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    tool_call_id?: string;
  }> = [
    { role: "system", content: finalSystemPrompt },
    ...transformedMessages,
  ];

  const contextWindow = await getContextWindowSize();
  const totalTokens = estimateFullContextUsage(conversation, toolsJson);
  const threshold = Math.floor(contextWindow * 0.8);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: event, ...data as object })}\n\n`)
        );
      }

      // SSE keepalive: send comment every 2s to prevent idle socket disconnects
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keepalive\n\n")); } catch { /* stream closed */ }
      }, 2000);

      try {
        send("context_status", { used: totalTokens, total: contextWindow });

        if (totalTokens > threshold && clientMessages.length > 4) {
          send("summarizing", {});
          const summary = await summarizeConversation(
            conversation.map((m) => ({ role: m.role, content: m.content }))
          );
          const latestUser = clientMessages[clientMessages.length - 1];
          conversation.length = 0;
          conversation.push(
            { role: "system", content: finalSystemPrompt },
            { role: "system", content: `Previous conversation summary:\n${summary}` },
            { role: "user", content: latestUser.content }
          );
          send("context_summarized", { summary });
        }

        const assistantMsgId = newId();
        send("assistant_msg_id", { id: assistantMsgId });

        // Undo grouping: all tool calls in this chat turn share a batchId
        const undoGroupId = generateGroupId();
        let undoSeq = 0;

        while (true) {

          const midLoopTokens = estimateFullContextUsage(conversation, toolsJson);
          if (midLoopTokens > threshold) {
            compactToolResults(conversation);
            const afterCompact = estimateFullContextUsage(conversation, toolsJson);
            if (afterCompact > threshold) {
              conversation.push({
                role: "system",
                content: "CONTEXT NOTICE: You are running low on context space. Finish your current step and provide a summary of what you've done and what remains.",
              });
            }
            send("context_status", { used: afterCompact, total: contextWindow });
          }

          const llmResponse = await streamChat(conversation as any, tools as any);

          if (!llmResponse.body) {
            send("error", { message: "No response from LLM" });
            break;
          }

          const reader = llmResponse.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let content = "";
          let thinking = "";
          let toolCalls: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }> = [];
          let finishReason = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;
                const reason = parsed.choices?.[0]?.finish_reason;

                if (reason) finishReason = reason;

                if (delta?.content) {
                  content += delta.content;
                  send("content", { text: delta.content });
                }

                if (delta?.reasoning_content || delta?.thinking) {
                  const t = delta.reasoning_content || delta.thinking;
                  thinking += t;
                  send("thinking", { text: t });
                }

                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    while (toolCalls.length <= idx) {
                      toolCalls.push({ id: "", type: "function", function: { name: "", arguments: "" } });
                    }
                    if (tc.id) toolCalls[idx].id = tc.id;
                    if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                    if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                  }
                }
              } catch { /* skip unparseable */ }
            }
          }

          if (finishReason !== "tool_calls" || toolCalls.length === 0) {
            break;
          }

          const assistantMessage: typeof conversation[0] = {
            role: "assistant",
            content: content || "",
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            })),
          };
          conversation.push(assistantMessage);

          for (const tc of toolCalls) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* empty */ }

            // Route to external MCP server or built-in tool
            const result = mcpClientManager.isExternalTool(tc.function.name)
              ? await mcpClientManager.callTool(tc.function.name, args)
              : await executeToolCall(tc.function.name, args, projectId, { groupId: undoGroupId, seq: undoSeq++ });

            send("tool_call_result", {
              toolCallId: tc.id,
              name: tc.function.name,
              args,
              result: result.result,
              success: result.success,
            });

            let resultJson = JSON.stringify(result);
            if (resultJson.length > 20000) {
              resultJson = JSON.stringify({
                success: result.success,
                result: "(result truncated — too large for context window)",
              });
            }

            conversation.push({
              role: "tool",
              content: resultJson,
              tool_call_id: tc.id,
            });

            if (!result.success) {
              consecutiveErrors++;
            } else {
              consecutiveErrors = 0;
            }
          }

          content = "";
          thinking = "";
          toolCalls = [];
        }

        send("done", {});
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        send("error", { message });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

app.post("/chat/summarize", async (c) => {
  const body = await c.req.json();
  const { projectId } = body;

  const rows = await db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.projectId, projectId));

  const messages = rows.map((r) => ({ role: r.role, content: r.content }));
  const summary = await summarizeConversation(messages);
  const messageId = newId();

  await db.delete(schema.chatMessages).where(eq(schema.chatMessages.projectId, projectId));
  await db.insert(schema.chatMessages).values({
    id: messageId,
    projectId,
    role: "system",
    content: summary,
    thinking: null,
    toolCalls: null,
    segments: null,
    createdAt: new Date().toISOString(),
  });

  return c.json({ summary, messageId });
});

export default app;
