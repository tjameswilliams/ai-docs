import { describe, test, expect } from "bun:test";
import { markdownToHtml } from "../pdf";

describe("markdownToHtml", () => {
  describe("headings", () => {
    test("h1", () => {
      expect(markdownToHtml("# Hello")).toContain("<h1>Hello</h1>");
    });
    test("h2", () => {
      expect(markdownToHtml("## World")).toContain("<h2>World</h2>");
    });
    test("h3", () => {
      expect(markdownToHtml("### Sub")).toContain("<h3>Sub</h3>");
    });
  });

  describe("paragraphs", () => {
    test("plain text becomes paragraph", () => {
      expect(markdownToHtml("Hello world")).toContain("<p>Hello world</p>");
    });
  });

  describe("inline formatting", () => {
    test("bold with **", () => {
      expect(markdownToHtml("**bold**")).toContain("<strong>bold</strong>");
    });
    test("italic with *", () => {
      expect(markdownToHtml("*italic*")).toContain("<em>italic</em>");
    });
    test("bold italic with ***", () => {
      const html = markdownToHtml("***both***");
      expect(html).toContain("<strong><em>both</em></strong>");
    });
    test("strikethrough", () => {
      expect(markdownToHtml("~~struck~~")).toContain("<del>struck</del>");
    });
    test("inline code", () => {
      expect(markdownToHtml("`code`")).toContain("<code>code</code>");
    });
  });

  describe("links and images", () => {
    test("link", () => {
      const html = markdownToHtml("[text](https://example.com)");
      expect(html).toContain('<a href="https://example.com">text</a>');
    });
    test("image", () => {
      const html = markdownToHtml("![alt](img.png)");
      expect(html).toContain('<img src="img.png" alt="alt"');
    });
  });

  describe("lists", () => {
    test("unordered list", () => {
      const html = markdownToHtml("- item one\n- item two");
      expect(html).toContain("<ul>");
      expect(html).toContain("<li>item one</li>");
      expect(html).toContain("<li>item two</li>");
      expect(html).toContain("</ul>");
    });
    test("ordered list", () => {
      const html = markdownToHtml("1. first\n2. second");
      expect(html).toContain("<ol>");
      expect(html).toContain("<li>first</li>");
    });
    test("task list", () => {
      const html = markdownToHtml("- [x] done\n- [ ] todo");
      expect(html).toContain('checked');
      expect(html).toContain("done");
      expect(html).toContain("todo");
    });
  });

  describe("code blocks", () => {
    test("fenced code block", () => {
      const html = markdownToHtml("```js\nconsole.log('hi');\n```");
      expect(html).toContain("<pre>");
      expect(html).toContain("<code");
      expect(html).toContain("console.log");
    });
    test("escapes HTML in code blocks", () => {
      const html = markdownToHtml("```\n<script>alert('xss')</script>\n```");
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });
  });

  describe("blockquotes", () => {
    test("blockquote", () => {
      const html = markdownToHtml("> quoted text");
      expect(html).toContain("<blockquote>");
      expect(html).toContain("quoted text");
    });
  });

  describe("horizontal rule", () => {
    test("---", () => {
      expect(markdownToHtml("---")).toContain("<hr");
    });
    test("***", () => {
      expect(markdownToHtml("***")).toContain("<hr");
    });
  });

  describe("tables", () => {
    test("simple table", () => {
      const md = "| A | B |\n|---|---|\n| 1 | 2 |";
      const html = markdownToHtml(md);
      expect(html).toContain("<table>");
      expect(html).toContain("<th>A</th>");
      expect(html).toContain("<td>1</td>");
    });
  });

  describe("math", () => {
    test("inline math $...$", () => {
      const html = markdownToHtml("Formula $E=mc^2$ here");
      expect(html).toContain("katex");
    });
    test("block math $$...$$", () => {
      const html = markdownToHtml("$$\nx^2 + y^2 = z^2\n$$");
      expect(html).toContain("math-block");
      expect(html).toContain("katex");
    });
  });

  describe("empty input", () => {
    test("empty string", () => {
      expect(markdownToHtml("")).toBe("");
    });
  });
});
