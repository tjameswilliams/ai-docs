import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { db, schema } from "../../db/client";

export const webToolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description:
        "Search the web for information. Returns a list of results with titles, URLs, and snippets. Use this to research topics, find facts, statistics, sources, or discover relevant content for writing.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          num_results: {
            type: "number",
            description: "Number of results to return (default: 8, max: 20)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fetch_webpage",
      description:
        "Fetch and extract the main readable content from a web page. Returns the article text, title, and byline. Use this after web_search to read the full content of a promising result, or to load any URL the user provides.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to fetch",
          },
          max_length: {
            type: "number",
            description:
              "Maximum character length of returned content (default: 15000). Use a smaller value for quick summaries, larger for deep research.",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "download_image",
      description:
        "Download an image from a URL or local file path and store it in the app's uploads directory. Returns a local URL that can be used in markdown image syntax. ALWAYS use this tool when you receive an image URL or file path from an external tool (like image generators) before inserting it into a document — external URLs may expire and local paths won't be accessible in the editor.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Image URL to download",
          },
          alt_text: {
            type: "string",
            description: "Alt text for the image (optional)",
          },
        },
        required: ["url"],
      },
    },
  },
];

// ── Search config ──

interface SearchConfig {
  provider: "brave" | "duckduckgo" | "google";
  apiKey: string;
}

async function getSearchConfig(): Promise<SearchConfig> {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  // Check for Brave Search API key (preferred — no CAPTCHA issues)
  if (map.braveSearchApiKey) {
    return { provider: "brave", apiKey: map.braveSearchApiKey };
  }

  // Check for Google Custom Search
  if (map.googleSearchApiKey && map.googleSearchCx) {
    return { provider: "google", apiKey: map.googleSearchApiKey };
  }

  // Fallback to DuckDuckGo (may hit CAPTCHA under heavy use)
  return { provider: "duckduckgo", apiKey: "" };
}

// ── Search Result Type ──

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ── Brave Search (recommended — free tier: 2000 queries/month) ──

async function braveSearch(
  query: string,
  numResults: number,
  apiKey: string
): Promise<SearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${numResults}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brave Search error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const webResults = data.web?.results || [];

  return webResults.slice(0, numResults).map((r: any) => ({
    title: r.title || "",
    url: r.url || "",
    snippet: r.description || "",
  }));
}

// ── Google Custom Search ──

async function googleSearch(
  query: string,
  numResults: number
): Promise<SearchResult[]> {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  const apiKey = map.googleSearchApiKey;
  const cx = map.googleSearchCx;
  if (!apiKey || !cx) throw new Error("Google Search API key or CX not configured");

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${Math.min(numResults, 10)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Search error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return (data.items || []).map((item: any) => ({
    title: item.title || "",
    url: item.link || "",
    snippet: item.snippet || "",
  }));
}

// ── DuckDuckGo HTML (fallback — may CAPTCHA under heavy use) ──

async function duckDuckGoSearch(
  query: string,
  numResults: number
): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`Search failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();

  // Detect CAPTCHA/bot challenge
  if (html.includes("anomaly-modal") || html.includes("anomaly.js") || res.status === 202) {
    throw new Error(
      "DuckDuckGo is rate-limiting this IP (CAPTCHA challenge). Configure a Brave Search API key in Settings for reliable web search (free at https://brave.com/search/api/)."
    );
  }

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const results: SearchResult[] = [];
  const links = doc.querySelectorAll(".result__a");

  for (const link of links) {
    if (results.length >= numResults) break;

    const titleEl = link as HTMLAnchorElement;
    const title = titleEl.textContent?.trim() || "";
    let href = titleEl.getAttribute("href") || "";

    // DuckDuckGo wraps URLs in a redirect — extract the actual URL
    if (href.includes("uddg=")) {
      try {
        const parsed = new URL(href, "https://duckduckgo.com");
        href = decodeURIComponent(parsed.searchParams.get("uddg") || href);
      } catch {
        // keep original href
      }
    }

    // Get snippet from sibling element
    const resultNode = titleEl.closest(".result");
    const snippetEl = resultNode?.querySelector(".result__snippet");
    const snippet = snippetEl?.textContent?.trim() || "";

    if (title && href && !href.startsWith("/") && !href.startsWith("javascript")) {
      results.push({ title, url: href, snippet });
    }
  }

  return results;
}

// ── Unified search dispatcher ──

async function webSearch(
  query: string,
  numResults: number
): Promise<SearchResult[]> {
  const config = await getSearchConfig();

  switch (config.provider) {
    case "brave":
      return braveSearch(query, numResults, config.apiKey);
    case "google":
      return googleSearch(query, numResults);
    case "duckduckgo":
      return duckDuckGoSearch(query, numResults);
  }
}

// ── Web Page Fetcher with Readability ──

interface PageContent {
  title: string;
  byline: string | null;
  content: string;
  excerpt: string | null;
  url: string;
  wordCount: number;
}

async function fetchAndExtract(
  url: string,
  maxLength: number
): Promise<PageContent> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      throw new Error(
        `Not an HTML page (content-type: ${contentType}). Use this tool only for web pages.`
      );
    }

    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    // Try Readability first for clean extraction
    const reader = new Readability(doc);
    const article = reader.parse();

    let text: string;
    let title: string;
    let byline: string | null = null;
    let excerpt: string | null = null;

    if (article && article.textContent && article.textContent.length > 100) {
      text = article.textContent;
      title = article.title || doc.title || url;
      byline = article.byline;
      excerpt = article.excerpt;
    } else {
      // Fallback: extract text from body, stripping nav/header/footer/script
      const tagsToRemove = [
        "script",
        "style",
        "nav",
        "header",
        "footer",
        "aside",
        "iframe",
        "noscript",
      ];
      for (const tag of tagsToRemove) {
        doc.querySelectorAll(tag).forEach((el) => el.remove());
      }
      text = doc.body?.textContent || "";
      title = doc.title || url;
    }

    // Clean up whitespace
    text = text
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();

    // Truncate if needed
    if (text.length > maxLength) {
      text = text.slice(0, maxLength) + "\n\n[Content truncated at " + maxLength + " characters]";
    }

    const wordCount = text.split(/\s+/).filter(Boolean).length;

    return { title, byline, content: text, excerpt, url, wordCount };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Tool Executor ──

export async function executeWebTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; result: unknown }> {
  switch (name) {
    case "web_search": {
      const query = args.query as string;
      const numResults = Math.min((args.num_results as number) || 8, 20);

      const results = await webSearch(query, numResults);

      return {
        success: true,
        result: {
          query,
          resultCount: results.length,
          results: results.map((r, i) => ({
            rank: i + 1,
            title: r.title,
            url: r.url,
            snippet: r.snippet,
          })),
        },
      };
    }

    case "fetch_webpage": {
      const url = args.url as string;
      const maxLength = (args.max_length as number) || 15000;

      const page = await fetchAndExtract(url, maxLength);

      return {
        success: true,
        result: {
          title: page.title,
          byline: page.byline,
          url: page.url,
          wordCount: page.wordCount,
          excerpt: page.excerpt,
          content: page.content,
        },
      };
    }

    case "download_image": {
      const imageUrl = args.url as string;
      const altText = (args.alt_text as string) || "";

      const { resolve } = await import("path");
      const { existsSync, mkdirSync, copyFileSync, readFileSync } = await import("fs");
      const { runtime } = await import("../../runtime");
      const { newId } = await import("../nanoid");

      const uploadsDir = resolve(runtime.getDataDir(), "uploads");
      if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

      // Detect if this is a local file path (not a URL)
      const isLocalPath = !imageUrl.startsWith("http://") && !imageUrl.startsWith("https://") && !imageUrl.startsWith("data:");

      try {
        let ext = "png";
        let storedName: string;
        let filePath: string;
        let sizeBytes: number;

        if (isLocalPath) {
          // Local file — copy it to uploads
          const sourcePath = imageUrl.startsWith("file://") ? imageUrl.slice(7) : imageUrl;

          if (!existsSync(sourcePath)) {
            return { success: false, result: `Local file not found: ${sourcePath}` };
          }

          // Determine extension from source filename
          const sourceExt = sourcePath.split(".").pop()?.toLowerCase();
          if (sourceExt && ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff"].includes(sourceExt)) {
            ext = sourceExt === "jpeg" ? "jpg" : sourceExt;
          }

          storedName = `${newId()}.${ext}`;
          filePath = resolve(uploadsDir, storedName);
          copyFileSync(sourcePath, filePath);
          sizeBytes = readFileSync(filePath).length;
        } else {
          // Remote URL — fetch and save
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          try {
            const res = await fetch(imageUrl, {
              signal: controller.signal,
              headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
              },
              redirect: "follow",
            });
            clearTimeout(timeout);

            if (!res.ok) {
              return { success: false, result: `Failed to download image: HTTP ${res.status}` };
            }

            const contentType = res.headers.get("content-type") || "";
            if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
            else if (contentType.includes("gif")) ext = "gif";
            else if (contentType.includes("webp")) ext = "webp";
            else if (contentType.includes("svg")) ext = "svg";
            else if (contentType.includes("png")) ext = "png";

            storedName = `${newId()}.${ext}`;
            filePath = resolve(uploadsDir, storedName);
            const arrayBuffer = await res.arrayBuffer();
            await runtime.writeFile(filePath, arrayBuffer);
            sizeBytes = arrayBuffer.byteLength;
          } catch (err) {
            clearTimeout(timeout);
            throw err;
          }
        }

        const localUrl = `/api/uploads/${storedName}`;
        const markdown = altText ? `![${altText}](${localUrl})` : `![image](${localUrl})`;

        return {
          success: true,
          result: {
            localUrl,
            markdown,
            originalUrl: imageUrl,
            filename: storedName,
            sizeBytes,
            message: `Image stored locally. Use this markdown to embed it: ${markdown}`,
          },
        };
      } catch (err) {
        return { success: false, result: `Download failed: ${(err as Error).message}` };
      }
    }

    default:
      return { success: false, result: `Unknown web tool: ${name}` };
  }
}
