import { db, schema } from "../db/client";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

const isBun = typeof globalThis.Bun !== "undefined";

type MessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: MessageContent;
  tool_calls?: ToolCallRequest[];
  tool_call_id?: string;
}

interface ToolCallRequest {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface LLMConfig {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
}

export async function getLLMConfig(): Promise<LLMConfig> {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return {
    apiBaseUrl: map.apiBaseUrl || "http://localhost:11434/v1",
    apiKey: map.apiKey || "ollama",
    model: map.model || "llama3.2",
    temperature: parseFloat(map.temperature || "0.7"),
    maxOutputTokens: parseInt(map.maxOutputTokens || "16384"),
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function getContextWindowSize(): Promise<number> {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  if (map.contextWindow) {
    const val = parseInt(map.contextWindow);
    if (val > 0) return val;
  }

  if (map.maxTokens) {
    const val = parseInt(map.maxTokens);
    if (val > 8192) return val;
  }

  return 128000;
}

export async function summarizeConversation(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const conversationText = messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n\n");

  const result = await chatCompletion([
    {
      role: "system",
      content: `You are a conversation summarizer. Produce a concise summary of the following conversation that captures:
- Key document operations performed (documents created, edited, organized, etc.)
- Documents and folders created or modified with their names and IDs if mentioned
- User preferences for writing style and document organization
- Current project state and what was being worked on
- Any planned next steps

Format as a brief but complete summary that would let someone continue the conversation seamlessly. Keep it under 500 words.`,
    },
    {
      role: "user",
      content: conversationText,
    },
  ]);

  return (
    result?.choices?.[0]?.message?.content ||
    "Previous conversation was summarized but details could not be extracted."
  );
}

// ── Shared request builder ──

function buildRequestBody(
  config: LLMConfig,
  messages: ChatMessage[],
  tools: any[] | undefined,
  stream: boolean
): string {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxOutputTokens,
    stream,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }
  return JSON.stringify(body);
}

// ── Bun-native fetch with retry ──

async function fetchLLM(
  config: LLMConfig,
  payload: string,
  stream: boolean
): Promise<Response> {
  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${config.apiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          Connection: "keep-alive",
        },
        body: payload,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`LLM API error ${res.status}: ${errorText}`);
      }

      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isSocketError =
        lastError.message.includes("socket hang up") ||
        lastError.message.includes("ECONNRESET") ||
        lastError.message.includes("fetch failed") ||
        lastError.message.includes("terminated");

      if (isSocketError && attempt < MAX_RETRIES) {
        console.warn(`[llm] Socket error on attempt ${attempt + 1}, retrying in 500ms: ${lastError.message}`);
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError!;
}

// ── Node.js http request (for Electron/Node) with retry ──

async function nodeRequestStream(
  config: LLMConfig,
  payload: string
): Promise<Response> {
  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await _nodeRequestStreamOnce(config, payload);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isSocketError =
        lastError.message.includes("socket hang up") ||
        lastError.message.includes("ECONNRESET") ||
        lastError.message.includes("EPIPE");

      if (isSocketError && attempt < MAX_RETRIES) {
        console.warn(`[llm] Socket error on attempt ${attempt + 1}, retrying in 500ms: ${lastError.message}`);
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError!;
}

function _nodeRequestStreamOnce(
  config: LLMConfig,
  payload: string
): Promise<Response> {
  const url = new URL(`${config.apiBaseUrl}/chat/completions`);
  const isHttps = url.protocol === "https:";
  const requestFn = isHttps ? httpsRequest : httpRequest;

  return new Promise<Response>((resolve, reject) => {
    const req = requestFn(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.socket?.setTimeout(0);
        res.socket?.setKeepAlive(true, 5000);

        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          let errorBody = "";
          res.on("data", (chunk: Buffer) => (errorBody += chunk));
          res.on("end", () =>
            reject(new Error(`LLM API error ${res.statusCode}: ${errorBody}`))
          );
          return;
        }

        const webStream = Readable.toWeb(res as unknown as Readable);
        resolve(
          new Response(webStream as ReadableStream, {
            status: res.statusCode || 200,
          })
        );
      }
    );

    req.on("error", reject);
    req.on("socket", (socket) => {
      socket.setTimeout(0);
      socket.setKeepAlive(true, 5000);
    });

    req.write(payload);
    req.end();
  });
}

function nodeRequestJson(
  config: LLMConfig,
  payload: string
): Promise<any> {
  const url = new URL(`${config.apiBaseUrl}/chat/completions`);
  const isHttps = url.protocol === "https:";
  const requestFn = isHttps ? httpsRequest : httpRequest;

  return new Promise<any>((resolve, reject) => {
    const req = requestFn(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.socket?.setTimeout(0);
        res.socket?.setKeepAlive(true, 5000);

        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            reject(new Error(`LLM API error ${res.statusCode}: ${data}`));
          } else {
            try { resolve(JSON.parse(data)); }
            catch { reject(new Error(`Invalid JSON from LLM: ${data.slice(0, 200)}`)); }
          }
        });
      }
    );

    req.on("error", reject);
    req.on("socket", (socket) => {
      socket.setTimeout(0);
      socket.setKeepAlive(true, 5000);
    });

    req.write(payload);
    req.end();
  });
}

// ── Public API ──

export async function streamChat(
  messages: ChatMessage[],
  tools?: any[]
): Promise<Response> {
  const config = await getLLMConfig();
  const payload = buildRequestBody(config, messages, tools, true);

  if (isBun) {
    return fetchLLM(config, payload, true);
  }
  return nodeRequestStream(config, payload);
}

export async function chatCompletion(
  messages: ChatMessage[],
  tools?: any[]
) {
  const config = await getLLMConfig();
  const payload = buildRequestBody(config, messages, tools, false);

  if (isBun) {
    const res = await fetchLLM(config, payload, false);
    return res.json();
  }
  return nodeRequestJson(config, payload);
}
