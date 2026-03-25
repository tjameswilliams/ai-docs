import { describe, test, expect } from "bun:test";
import { mathMarkdownToHtml, mathHtmlToMarkdown } from "../mathMarkdown";

describe("mathMarkdownToHtml", () => {
  describe("inline math", () => {
    test("converts $...$ to span tags", () => {
      const result = mathMarkdownToHtml("Formula $E=mc^2$ here");
      expect(result).toContain('data-type="math-inline"');
      expect(result).toContain('latex="E=mc^2"');
      expect(result).toContain("Formula");
      expect(result).toContain("here");
    });

    test("handles multiple inline math in one line", () => {
      const result = mathMarkdownToHtml("$a$ and $b$");
      expect(result.match(/data-type="math-inline"/g)?.length).toBe(2);
    });

    test("does not match $$ as inline", () => {
      const result = mathMarkdownToHtml("$$x^2$$");
      expect(result).not.toContain('data-type="math-inline"');
    });

    test("handles escaped dollar signs", () => {
      const result = mathMarkdownToHtml("costs \\$5");
      expect(result).not.toContain('data-type="math-inline"');
    });

    test("does not match $ preceded by alphanumeric", () => {
      const result = mathMarkdownToHtml("costs5$");
      expect(result).not.toContain('data-type="math-inline"');
    });

    test("handles complex LaTeX with braces", () => {
      const result = mathMarkdownToHtml("$\\mathbb{R}^{d \\times d}$");
      expect(result).toContain('data-type="math-inline"');
      // The entire expression should be one tag
      expect(result.match(/data-type="math-inline"/g)?.length).toBe(1);
    });
  });

  describe("block math", () => {
    test("converts multi-line $$...$$ to div tags", () => {
      const result = mathMarkdownToHtml("$$\nx^2\n$$");
      expect(result).toContain('data-type="math-block"');
      expect(result).toContain("x^2");
    });

    test("converts single-line $$...$$ to div tags", () => {
      const result = mathMarkdownToHtml("$$x^2 + y^2$$");
      expect(result).toContain('data-type="math-block"');
    });

    test("handles multi-line block math", () => {
      const result = mathMarkdownToHtml("$$\na = b\nc = d\n$$");
      expect(result).toContain('data-type="math-block"');
      expect(result).toContain("a = b");
    });
  });

  describe("mixed content", () => {
    test("preserves non-math text", () => {
      const result = mathMarkdownToHtml("Normal text here");
      expect(result).toBe("Normal text here");
    });

    test("handles math alongside markdown", () => {
      const result = mathMarkdownToHtml("**Bold** and $x$ here");
      expect(result).toContain("**Bold**");
      expect(result).toContain('data-type="math-inline"');
    });
  });
});

describe("mathHtmlToMarkdown", () => {
  test("converts inline math spans back to $...$", () => {
    const html = 'text <span data-type="math-inline" latex="E=mc^2"></span> more';
    expect(mathHtmlToMarkdown(html)).toBe("text $E=mc^2$ more");
  });

  test("converts block math divs back to $$...$$", () => {
    const html = '<div data-type="math-block" latex="x^2"></div>';
    const result = mathHtmlToMarkdown(html);
    expect(result).toContain("$$");
    expect(result).toContain("x^2");
  });

  test("handles escaped HTML entities in latex attr", () => {
    const html = '<span data-type="math-inline" latex="a &lt; b"></span>';
    expect(mathHtmlToMarkdown(html)).toContain("$a < b$");
  });
});

describe("roundtrip", () => {
  test("inline math survives roundtrip", () => {
    const original = "Text $E=mc^2$ end";
    const html = mathMarkdownToHtml(original);
    const back = mathHtmlToMarkdown(html);
    expect(back).toBe(original);
  });

  test("block math survives roundtrip structurally", () => {
    const original = "$$\nx^2\n$$";
    const html = mathMarkdownToHtml(original);
    const back = mathHtmlToMarkdown(html);
    expect(back).toContain("$$");
    expect(back).toContain("x^2");
  });
});
