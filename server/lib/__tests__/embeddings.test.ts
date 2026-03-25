import { describe, test, expect } from "bun:test";
import { cosineSimilarity, chunkDocument } from "../embeddings";

describe("cosineSimilarity", () => {
  test("identical vectors return 1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  test("orthogonal vectors return 0", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });

  test("opposite vectors return -1", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  test("handles arbitrary vectors", () => {
    const a = [0.5, 0.5, 0.5];
    const b = [0.5, 0.5, 0.5];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
  });

  test("handles zero vectors", () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  test("similar vectors have high score", () => {
    const score = cosineSimilarity([1, 2, 3], [1, 2, 3.1]);
    expect(score).toBeGreaterThan(0.99);
  });
});

describe("chunkDocument", () => {
  test("returns single chunk for short content", () => {
    const chunks = chunkDocument("Hello world");
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe("Hello world");
  });

  test("splits by double newlines", () => {
    const content = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
    const chunks = chunkDocument(content);
    // All paragraphs are short, may be merged into one chunk
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // All text should be preserved
    const joined = chunks.join("\n\n");
    expect(joined).toContain("Paragraph one");
    expect(joined).toContain("Paragraph three");
  });

  test("groups small paragraphs together up to target size", () => {
    const short = Array.from({ length: 10 }, (_, i) => `Line ${i}`).join("\n\n");
    const chunks = chunkDocument(short);
    // Short paragraphs should be grouped
    expect(chunks.length).toBeLessThan(10);
  });

  test("splits long content into multiple chunks", () => {
    // Create content longer than target chunk size
    const para = "x".repeat(300);
    const content = `${para}\n\n${para}\n\n${para}`;
    const chunks = chunkDocument(content);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("handles empty content", () => {
    const chunks = chunkDocument("");
    expect(chunks.length).toBe(0);
  });

  test("handles whitespace-only content", () => {
    const chunks = chunkDocument("   \n\n   ");
    expect(chunks.length).toBe(0);
  });
});
