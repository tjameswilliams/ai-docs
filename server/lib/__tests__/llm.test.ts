import { describe, test, expect } from "bun:test";
import { estimateTokens } from "../llm";

describe("estimateTokens", () => {
  test("estimates ~1 token per 4 characters", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  test("rounds up for partial tokens", () => {
    expect(estimateTokens("abc")).toBe(1); // 3/4 = 0.75, ceil = 1
    expect(estimateTokens("abcde")).toBe(2); // 5/4 = 1.25, ceil = 2
  });

  test("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  test("handles long strings", () => {
    const longText = "x".repeat(10000);
    expect(estimateTokens(longText)).toBe(2500);
  });

  test("handles unicode characters", () => {
    // Unicode chars take more bytes but estimateTokens uses string length
    const result = estimateTokens("héllo wörld");
    expect(result).toBeGreaterThan(0);
  });
});
