import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { newId } from "./nanoid";

interface EmbeddingConfig {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
}

async function getEmbeddingConfig(): Promise<EmbeddingConfig> {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return {
    apiBaseUrl: map.embeddingApiBaseUrl || map.apiBaseUrl || "http://localhost:11434/v1",
    apiKey: map.embeddingApiKey || map.apiKey || "ollama",
    model: map.embeddingModel || "text-embedding-3-small",
  };
}

async function fetchEmbeddings(texts: string[]): Promise<number[][]> {
  const config = await getEmbeddingConfig();

  const res = await fetch(`${config.apiBaseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: texts,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const sorted = (data.data as Array<{ embedding: number[]; index: number }>)
    .sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

const CHUNK_TARGET_CHARS = 500;

/**
 * Split document content into chunks by paragraphs, targeting ~500 chars each.
 */
export function chunkDocument(content: string): string[] {
  const paragraphs = content.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length > CHUNK_TARGET_CHARS && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Generate embeddings for a document's content.
 * Chunks the content by paragraphs and stores each chunk's embedding.
 */
export async function embedDocument(documentId: string): Promise<number> {
  // Clear existing embeddings
  await db.delete(schema.documentEmbeddings)
    .where(eq(schema.documentEmbeddings.documentId, documentId));

  // Load document
  const [doc] = await db.select().from(schema.documents)
    .where(eq(schema.documents.id, documentId));
  if (!doc || !doc.content) return 0;

  // Chunk content
  const chunks = chunkDocument(doc.content);
  if (chunks.length === 0) return 0;

  // Batch embed
  const BATCH_SIZE = 100;
  const now = new Date().toISOString();
  let stored = 0;

  for (let b = 0; b < chunks.length; b += BATCH_SIZE) {
    const batch = chunks.slice(b, b + BATCH_SIZE);
    const embeddings = await fetchEmbeddings(batch);

    for (let i = 0; i < batch.length; i++) {
      await db.insert(schema.documentEmbeddings).values({
        id: newId(),
        documentId,
        chunkIndex: b + i,
        chunkText: batch[i],
        embedding: JSON.stringify(embeddings[i]),
        createdAt: now,
      });
      stored++;
    }
  }

  return stored;
}

export interface SemanticSearchResult {
  documentId: string;
  documentTitle: string;
  folderId: string | null;
  chunkIndex: number;
  chunkText: string;
  score: number;
}

/**
 * Semantic search across document embeddings for a project.
 */
export async function searchDocumentsSemantic(
  projectId: string,
  query: string,
  opts: { topK?: number } = {}
): Promise<SemanticSearchResult[]> {
  const topK = opts.topK ?? 10;

  // Embed the query
  const [queryEmbedding] = await fetchEmbeddings([query]);

  // Load all project documents
  const documents = await db.select().from(schema.documents)
    .where(eq(schema.documents.projectId, projectId));
  const docMap = new Map(documents.map((d) => [d.id, d]));

  // Load all embeddings for project documents
  const allEmbeddings: Array<typeof schema.documentEmbeddings.$inferSelect> = [];
  for (const doc of documents) {
    const rows = await db.select().from(schema.documentEmbeddings)
      .where(eq(schema.documentEmbeddings.documentId, doc.id));
    allEmbeddings.push(...rows);
  }

  // Score each embedding
  const scored = allEmbeddings.map((e) => {
    const vec = JSON.parse(e.embedding) as number[];
    return {
      entry: e,
      score: cosineSimilarity(queryEmbedding, vec),
    };
  });

  // Sort by score, take top-k
  scored.sort((a, b) => b.score - a.score);
  const topResults = scored.slice(0, topK);

  return topResults.map(({ entry, score }) => {
    const doc = docMap.get(entry.documentId);
    return {
      documentId: entry.documentId,
      documentTitle: doc?.title ?? "Unknown",
      folderId: doc?.folderId ?? null,
      chunkIndex: entry.chunkIndex,
      chunkText: entry.chunkText,
      score,
    };
  });
}
