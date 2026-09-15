/**
 * Pure markdown walker used by the cockpit's assistant bubbles.
 *
 * Separated from React so we can unit-test the walker with a string/
 * tree renderer (no React, no JSDOM) and reuse it later if we ever
 * swap the renderer — e.g. for streaming incremental markdown or a
 * server-side preview path.
 *
 * Safety: the default `html` token handler drops the token rather
 * than inserting raw HTML. We never call dangerouslySetInnerHTML,
 * and the walker walks tokens, not raw markdown, so a payload like
 * `<script>alert(1)</script>` becomes a sequence of inline html +
 * text tokens; the html tokens are dropped at the walker level.
 * (Covered by tests/markdown.spec.ts.)
 */
import { Lexer, type Token, type Tokens } from "marked";

/** Recursive tree shape the renderer produces. Plain-data so tests
 *  can assert against it without React. */
export type RenderTree =
  | { type: "text"; value: string }
  | { type: "element"; tag: string; children: RenderTree[] };

export interface Renderer {
  heading: (t: Tokens.Heading, children: RenderTree[]) => RenderTree;
  paragraph: (children: RenderTree[]) => RenderTree;
  code: (t: Tokens.Code) => RenderTree;
  table: (t: Tokens.Table, header: RenderTree[], rows: RenderTree[][]) => RenderTree;
  list: (t: Tokens.List, items: RenderTree[]) => RenderTree;
  listItem: (children: RenderTree[]) => RenderTree;
  blockquote: (children: RenderTree[]) => RenderTree;
  /** Inline primitives. text() is the leaf for raw text (already escaped
   *  by the renderer if needed). */
  strong: (children: RenderTree[]) => RenderTree;
  em: (children: RenderTree[]) => RenderTree;
  codespan: (t: Tokens.Codespan) => RenderTree;
  link: (t: Tokens.Link, children: RenderTree[]) => RenderTree;
  text: (s: string) => RenderTree;
  br: () => RenderTree;
  hr: () => RenderTree;
  /** Raw HTML is dropped (safety). Renderer must not insert raw HTML
   *  — the contract is "treat this string as untrusted data". */
  html: (raw: string) => RenderTree;
  /** Anything we don't recognize (custom extensions etc.). Defaults
   *  to text-escape. */
  unknown: (raw: string) => RenderTree;
}

/**
 * Lex markdown and walk tokens, dispatching to the supplied renderer.
 * Pure function — no I/O, no globals.
 */
export function renderMarkdown(src: string, r: Renderer): RenderTree[] {
  const tokens = new Lexer().lex(src);
  return walkBlock(tokens, r);
}

/** Walk a top-level (block) token list. Whitespace-only `space` tokens
 *  between blocks are dropped here so the renderer doesn't need to. */
function walkBlock(tokens: Token[], r: Renderer): RenderTree[] {
  return tokens.flatMap((tok) => {
    if (tok.type === "space") return [];
    return [walkOneBlock(tok, r)];
  });
}

function walkOneBlock(tok: Token, r: Renderer): RenderTree {
  switch (tok.type) {
    case "heading":
      return r.heading(tok as Tokens.Heading, walkInline(tok as Tokens.Heading, r));
    case "paragraph":
      return r.paragraph(walkInline(tok as Tokens.Paragraph, r));
    case "code":
      return r.code(tok as Tokens.Code);
    case "table":
      return r.table(
        tok as Tokens.Table,
        ((tok as Tokens.Table).header ?? []).map((cell) => inlineForCell(cell, r)),
        ((tok as Tokens.Table).rows ?? []).map((row) => row.map((cell) => inlineForCell(cell, r))),
      );
    case "list":
      return r.list(
        tok as Tokens.List,
        ((tok as Tokens.List).items ?? []).map((item) =>
          r.listItem(walkBlock(((item as Tokens.ListItem).tokens ?? []) as Token[], r)),
        ),
      );
    case "blockquote":
      return r.blockquote(walkBlock(tok.tokens as Token[], r));
    case "hr":
      return r.hr();
    case "space":
      return r.text("");
    case "html":
      return r.html((tok as Tokens.HTML).raw ?? "");
    default:
      return r.unknown(tok.raw ?? "");
  }
}

/** Resolve a table cell to its inline tokens. Some marked versions
 *  omit `cell.tokens` for plain-text cells, in which case we fall
 *  back to `cell.text` so empty cells never appear in the tree. */
function inlineForCell(
  cell: unknown,
  r: Renderer,
): RenderTree {
  const cellObj = cell as { tokens?: Token[]; text?: string };
  const inline = walkInline(cellObj, r);
  if (inline.length > 0) return r.paragraph(inline);
  const text = cellObj.text ?? "";
  return r.paragraph([r.text(text)]);
}

/** Walk inline tokens inside a block (paragraph/heading/list-item). */
function walkInline(
  parent: { tokens?: Token[] },
  r: Renderer,
): RenderTree[] {
  const tokens = parent.tokens ?? [];
  return tokens.map((tok) => walkOneInline(tok, r));
}

function walkOneInline(tok: Token, r: Renderer): RenderTree {
  switch (tok.type) {
    case "text":
      return r.text((tok as Tokens.Text).text ?? "");
    case "strong":
      return r.strong(walkInline(tok as Tokens.Strong, r));
    case "em":
      return r.em(walkInline(tok as Tokens.Em, r));
    case "codespan":
      return r.codespan(tok as Tokens.Codespan);
    case "link":
      return r.link(tok as Tokens.Link, walkInline(tok as Tokens.Link, r));
    case "br":
      return r.br();
    case "image": {
      // Images aren't useful in chat bubbles — render as a text link.
      const img = tok as Tokens.Image;
      const linkTok: Tokens.Link = {
        type: "link",
        raw: img.raw,
        href: img.href,
        title: img.title,
        text: img.text,
        tokens: [{ type: "text", raw: img.text, text: img.text } as Token],
      };
      return r.link(linkTok, [r.text(img.text ?? "")]);
    }
    case "del":
      // Strike-through — render as escaped text. Future: <s> element.
      return r.unknown(tok.raw ?? "");
    case "escape":
      return r.text((tok as Tokens.Escape).text ?? "");
    case "html":
      return r.html((tok as Tokens.HTML).raw ?? "");
    case "checkbox":
      return r.text((tok as Tokens.Checkbox).checked ? "☑ " : "☐ ");
    default:
      return r.unknown(tok.raw ?? "");
  }
}

/* ------------------------------------------------------------------ */
/*  Test renderer — produces a serializable tree so vitest can pin the  */
/*  walker's shape without bringing in React.                           */
/* ------------------------------------------------------------------ */

/** HTML-escape any untrusted text. Applied at the renderer boundary so
 *  the walker itself never has to think about it. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const treeRenderer: Renderer = {
  heading(t, children) { return { type: "element", tag: `h${t.depth}`, children }; },
  paragraph(children) { return { type: "element", tag: "p", children }; },
  code(t) {
    return {
      type: "element",
      tag: "pre",
      children: [
        { type: "element", tag: "code", children: [{ type: "text", value: escapeHtml(t.text ?? "") }] },
      ],
    };
  },
  table(_t, header, rows) {
    return {
      type: "element",
      tag: "table",
      children: [
        {
          type: "element",
          tag: "thead",
          children: [
            {
              type: "element",
              tag: "tr",
              children: header.map((h) => ({
                type: "element",
                tag: "th",
                children: h.type === "element" ? h.children : [h],
              })),
            },
          ],
        },
        {
          type: "element",
          tag: "tbody",
          children: rows.map((row) => ({
            type: "element",
            tag: "tr",
            children: row.map((cell) => ({
              type: "element",
              tag: "td",
              children: cell.type === "element" ? cell.children : [cell],
            })),
          })),
        },
      ],
    };
  },
  list(t, items) {
    return {
      type: "element",
      tag: t.ordered ? "ol" : "ul",
      children: items.map((it) => ({
        type: "element",
        tag: "li",
        children: it.type === "element" ? it.children : [it],
      })),
    };
  },
  listItem(children) {
    // ListItem's children are wrapped in <li> by list() — return the
    // list-item body so callers can use it directly.
    return { type: "element", tag: "_liwrap", children };
  },
  blockquote(children) { return { type: "element", tag: "blockquote", children }; },
  strong(children) { return { type: "element", tag: "strong", children }; },
  em(children) { return { type: "element", tag: "em", children }; },
  codespan(t) { return { type: "element", tag: "code", children: [{ type: "text", value: escapeHtml(t.text ?? "") }] }; },
  link(t, children) {
    // The href is untrusted; escape for safety.
    return { type: "element", tag: `a href="${escapeHtml(t.href ?? "")}"`, children };
  },
  text(s) { return { type: "text", value: s }; },
  br() { return { type: "element", tag: "br", children: [] }; },
  hr() { return { type: "element", tag: "hr", children: [] }; },
  html(_raw) {
    // Drop — never include raw HTML in the tree.
    return { type: "text", value: "" };
  },
  unknown(raw) { return { type: "text", value: escapeHtml(raw ?? "") }; },
};

/** Convenience: produce a tree for any markdown source. */
export function markdownToTree(src: string): RenderTree[] {
  return renderMarkdown(src, treeRenderer);
}