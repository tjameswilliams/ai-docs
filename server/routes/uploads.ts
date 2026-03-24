import { Hono } from "hono";
import { newId } from "../lib/nanoid";
import { runtime } from "../runtime";
import { resolve } from "path";
import { existsSync, mkdirSync } from "fs";

const app = new Hono();

function getUploadsDir(): string {
  const dir = resolve(runtime.getDataDir(), "uploads");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

app.post("/uploads", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;

  if (!file || typeof file === "string") {
    return c.json({ error: "No file provided" }, 400);
  }

  const ext = file.name?.split(".").pop() || "bin";
  const storedName = `${newId()}.${ext}`;
  const filePath = resolve(getUploadsDir(), storedName);

  const arrayBuffer = await file.arrayBuffer();
  await runtime.writeFile(filePath, arrayBuffer);

  return c.json({ url: `/api/uploads/${storedName}`, name: file.name });
});

// Download an image from a URL and store locally
app.post("/uploads/download", async (c) => {
  const body = await c.req.json();
  const url = body.url as string;
  if (!url) return c.json({ error: "URL required" }, 400);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return c.json({ error: `Failed to download: HTTP ${res.status}` }, 400);
    }

    const contentType = res.headers.get("content-type") || "";
    // Determine extension from content-type or URL
    let ext = "png";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
    else if (contentType.includes("gif")) ext = "gif";
    else if (contentType.includes("webp")) ext = "webp";
    else if (contentType.includes("svg")) ext = "svg";
    else if (contentType.includes("png")) ext = "png";
    else {
      // Try from URL
      const urlExt = url.split("?")[0].split(".").pop()?.toLowerCase();
      if (urlExt && ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(urlExt)) {
        ext = urlExt === "jpeg" ? "jpg" : urlExt;
      }
    }

    const storedName = `${newId()}.${ext}`;
    const filePath = resolve(getUploadsDir(), storedName);
    const arrayBuffer = await res.arrayBuffer();
    await runtime.writeFile(filePath, arrayBuffer);

    const localUrl = `/api/uploads/${storedName}`;
    return c.json({
      url: localUrl,
      originalUrl: url,
      filename: storedName,
      size: arrayBuffer.byteLength,
      contentType: contentType || `image/${ext}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Download failed: ${message}` }, 400);
  }
});

app.get("/uploads/:filename", async (c) => {
  const filename = c.req.param("filename");
  const filePath = resolve(getUploadsDir(), filename);

  if (!(await runtime.fileExists(filePath))) {
    return c.json({ error: "File not found" }, 404);
  }

  const buffer = await runtime.readFileBuffer(filePath);
  const mimeType = runtime.getMimeType(filePath);

  return new Response(buffer, {
    headers: { "Content-Type": mimeType },
  });
});

export default app;
