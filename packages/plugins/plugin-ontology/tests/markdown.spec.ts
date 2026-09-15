/**
 * Markdown walker smoke tests — pin the tree shape that the JSX
 * renderer will mirror in `MarkdownContent.tsx`. No React in here.
 */
import { describe, expect, it } from "vitest";
import { markdownToTree, type RenderTree } from "../src/ui/markdown.js";

function flattenText(tree: RenderTree[]): string {
  return tree
    .map((node) => {
      if (!node) return "";
      if (node.type === "text") return node.value;
      if (!node.children) return "";
      return flattenText(node.children);
    })
    .join("");
}

function findByTag(tree: RenderTree[], tag: string): RenderTree[] {
  const out: RenderTree[] = [];
  for (const node of tree) {
    if (node.type === "element" && node.tag === tag) out.push(node);
    else if (node.type === "element") out.push(...findByTag(node.children, tag));
  }
  return out;
}

function hasTag(tree: RenderTree[], tag: string): boolean {
  return findByTag(tree, tag).length > 0;
}

describe("markdownToTree — headings & paragraphs", () => {
  it("emits one h1 + one p in order for '# Hi\\n\\nWorld'", () => {
    const tree = markdownToTree("# Hi\n\nWorld");
    expect(tree).toHaveLength(2);
    const h = tree[0];
    const p = tree[1];
    if (!h || !p) throw new Error("expected h and p");
    expect(h.type).toBe("element");
    expect(p.type).toBe("element");
    if (h.type === "element") expect(h.tag).toBe("h1");
    if (p.type === "element") expect(p.tag).toBe("p");
    expect(flattenText(tree)).toBe("HiWorld");
  });

  it("respects heading depth 1..6", () => {
    const src = "# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6";
    const tree = markdownToTree(src);
    const headings = findByTag(tree, "h1")
      .concat(findByTag(tree, "h2"))
      .concat(findByTag(tree, "h3"))
      .concat(findByTag(tree, "h4"))
      .concat(findByTag(tree, "h5"))
      .concat(findByTag(tree, "h6"));
    expect(headings).toHaveLength(6);
    const tags = headings.map((n) => (n as { tag: string }).tag);
    expect(tags).toEqual(["h1", "h2", "h3", "h4", "h5", "h6"]);
  });
});

describe("markdownToTree — tables", () => {
  it("parses a 1-header × 1-row table with thead + tbody", () => {
    const tree = markdownToTree("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(tree).toHaveLength(1);
    const t = tree[0];
    if (!t || t.type !== "element") throw new Error("expected element");
    expect(t.tag).toBe("table");
    expect(t.children).toHaveLength(2); // thead + tbody
    const thead = t.children[0];
    const tbody = t.children[1];
    if (!thead || !tbody) throw new Error("expected thead+tbody");
    if (thead.type === "element") expect(thead.tag).toBe("thead");
    if (tbody.type === "element") expect(tbody.tag).toBe("tbody");
    if (thead.type === "element") expect(thead.children).toHaveLength(1);
    if (tbody.type === "element") expect(tbody.children).toHaveLength(1);
  });

  it("renders cell content as td/th children, not as text", () => {
    const tree = markdownToTree("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(flattenText(tree)).toBe("ab12");
    expect(hasTag(tree, "th")).toBe(true);
    expect(hasTag(tree, "td")).toBe(true);
  });
});

describe("markdownToTree — fenced code", () => {
  it("renders ``` blocks inside <pre><code> verbatim, no inline re-parsing", () => {
    const tree = markdownToTree("```js\nconst x = 1 < 2;\n```");
    expect(tree).toHaveLength(1);
    const pre = tree[0];
    if (!pre || pre.type !== "element") throw new Error("expected element");
    expect(pre.tag).toBe("pre");
    const code = pre.children[0];
    if (!code || code.type !== "element") throw new Error("expected code element");
    expect(code.tag).toBe("code");
    const textNode = code.children[0];
    if (!textNode || textNode.type !== "text") throw new Error("expected text node");
    // The original `1 < 2` — make sure the walker did NOT lex the inner
    // `<` as a tag opener (escapeHtml turns it into &lt; in the text node).
    expect(textNode.value).toContain("const x = 1 &lt; 2;");
  });

  it("escapes HTML inside code text (no script injection)", () => {
    const tree = markdownToTree("```\n<script>alert(1)</script>\n```");
    const flat = flattenText(tree);
    expect(flat).toContain("&lt;script&gt;");
    expect(flat).not.toContain("<script>");
    expect(hasTag(tree, "script")).toBe(false);
  });
});

describe("markdownToTree — lists", () => {
  it("renders a bullet list as ul with two li children", () => {
    const tree = markdownToTree("* a\n* b");
    expect(tree).toHaveLength(1);
    const ul = tree[0];
    if (!ul || ul.type !== "element") throw new Error("expected element");
    expect(ul.tag).toBe("ul");
    expect(ul.children).toHaveLength(2);
    for (const c of ul.children) {
      if (c.type !== "element") throw new Error("expected element");
      expect(c.tag).toBe("li");
    }
    expect(flattenText(tree)).toBe("ab");
  });

  it("renders an ordered list with <ol>", () => {
    const tree = markdownToTree("1. one\n2. two");
    expect(tree).toHaveLength(1);
    const ol = tree[0];
    if (!ol || ol.type !== "element") throw new Error("expected element");
    expect(ol.tag).toBe("ol");
  });
});

describe("markdownToTree — safety", () => {
  it("drops <script> tags entirely — only the inner text survives, never the tags", () => {
    const tree = markdownToTree("hello <script>alert(1)</script>");
    const flat = flattenText(tree);
    // The script tags themselves are dropped (html tokens → "" in treeRenderer).
    // The script tag must NOT appear as text or as an element anywhere.
    expect(flat).not.toContain("<script>");
    expect(flat).not.toContain("</script>");
    expect(hasTag(tree, "script")).toBe(false);
    // The non-tag content ("alert(1)") is still visible as plain text — the
    // tags are what we needed to neutralize, not the payload string.
    expect(flat).toContain("hello alert(1)");
  });

  it("drops inline <em> tags but preserves inner text", () => {
    const tree = markdownToTree("hello <em>raw</em> world");
    // `<em>` is parsed as an inline html token (not a markdown em),
    // so it should be dropped, and "raw" should survive as plain text.
    expect(hasTag(tree, "em")).toBe(false);
    expect(flattenText(tree)).toContain("hello raw world");
  });
});

describe("markdownToTree — inline formatting", () => {
  it("renders **strong** as <strong> and *em* as <em>", () => {
    const tree = markdownToTree("**bold** and *italic*");
    expect(hasTag(tree, "strong")).toBe(true);
    expect(hasTag(tree, "em")).toBe(true);
    expect(flattenText(tree)).toBe("bold and italic");
  });

  it("renders `code` as <code>", () => {
    const tree = markdownToTree("use `foo.bar()` here");
    expect(hasTag(tree, "code")).toBe(true);
    expect(flattenText(tree)).toContain("foo.bar()");
  });
});