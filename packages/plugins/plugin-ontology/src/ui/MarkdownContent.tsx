/**
 * React wrapper over the markdown parser. The pure walker in
 * `./markdown.ts` is used by vitest; this file is the React renderer
 * used by the cockpit's assistant bubbles. They share the same
 * dispatch logic but have different output types (RenderTree vs
 * ReactNode), so the walker function is duplicated here rather than
 * awkwardly parameterized.
 *
 * Safety: we never call dangerouslySetInnerHTML. Every node in the
 * React tree is an element we constructed from token data, with
 * any user-provided text passed through `escapeHtml()` first.
 */
import { type ReactElement, type ReactNode, useMemo } from "react";
import { Lexer, type Tokens } from "marked";
import { escapeHtml } from "./markdown.js";

const LEXER = new Lexer();

export function MarkdownContent({ source }: { source: string }): ReactElement {
  const elements = useMemo(() => {
    const tokens = LEXER.lex(source) as unknown[];
    return walkBlock(tokens);
  }, [source]);

  return <div className="space-y-2">{elements}</div>;
}

/* ------------------------------------------------------------------ */
/*  Block dispatch — produces ReactNode trees.                          */
/* ------------------------------------------------------------------ */

function walkBlock(tokens: unknown[]): ReactNode[] {
  const out: ReactNode[] = [];
  for (const tok of tokens) {
    if (!tok || typeof tok !== "object") continue;
    const t = tok as { type?: string };
    if (t.type === "space") continue;
    out.push(walkOneBlock(tok as { type: string; [k: string]: unknown }));
  }
  return out;
}

function walkOneBlock(tok: { type: string; [k: string]: unknown }): ReactNode {
  switch (tok.type) {
    case "heading": {
      const h = tok as unknown as Tokens.Heading;
      const children = walkInline(h as { tokens?: unknown[] });
      return renderHeading(h.depth, children);
    }
    case "paragraph": {
      const p = tok as unknown as Tokens.Paragraph;
      return <p className="leading-relaxed">{walkInline(p as { tokens?: unknown[] })}</p>;
    }
    case "code":
      return renderCodeBlock(tok as unknown as Tokens.Code);
    case "table": {
      const t = tok as unknown as Tokens.Table;
      const header = (t.header ?? []).map((cell) => renderCell(cell));
      const rows = (t.rows ?? []).map((row) =>
        row.map((cell) => renderCell(cell)),
      );
      return renderTable(header, rows);
    }
    case "list": {
      const l = tok as unknown as Tokens.List;
      const items = (l.items ?? []).map((item) => {
        const li = item as { tokens?: unknown[] };
        return walkBlock(li.tokens ?? []);
      });
      return renderList(l.ordered, items);
    }
    case "blockquote": {
      const b = tok as { tokens?: unknown[] };
      return (
        <blockquote className="my-2 border-l-4 border-primary/40 bg-muted/30 px-3 py-1 italic">
          {walkBlock(b.tokens ?? [])}
        </blockquote>
      );
    }
    case "hr":
      return <hr className="my-3 border-border" />;
    case "html":
      // Safety: never inject raw HTML from LLM output.
      return null;
    default:
      return <>{escapeHtml((tok.raw as string) ?? "")}</>;
  }
}

function walkInline(parent: { tokens?: unknown[] }): ReactNode[] {
  const tokens = parent.tokens ?? [];
  const out: ReactNode[] = [];
  for (const tok of tokens) {
    if (!tok || typeof tok !== "object") continue;
    out.push(walkOneInline(tok as { type: string; [k: string]: unknown }));
  }
  return out;
}

function walkOneInline(tok: { type: string; [k: string]: unknown }): ReactNode {
  switch (tok.type) {
    case "text":
      return (tok as { text?: string }).text ?? "";
    case "strong": {
      const s = tok as { tokens?: unknown[] };
      return <strong className="font-semibold">{walkInline(s)}</strong>;
    }
    case "em": {
      const e = tok as { tokens?: unknown[] };
      return <em className="italic">{walkInline(e)}</em>;
    }
    case "codespan": {
      const t = tok as { text?: string };
      return (
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-(length:--text-compact)">
          {escapeHtml(t.text ?? "")}
        </code>
      );
    }
    case "link": {
      const l = tok as unknown as Tokens.Link;
      return (
        <a
          href={l.href ?? "#"}
          title={l.title ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          {walkInline(l as { tokens?: unknown[] })}
        </a>
      );
    }
    case "br":
      return <br />;
    case "image": {
      // Render images as text-link placeholder. We never fetch from chat.
      const img = tok as unknown as Tokens.Image;
      return `[${img.text ?? "image"}](${img.href ?? ""})`;
    }
    case "del":
      return escapeHtml((tok.raw as string) ?? "");
    case "escape":
      return (tok as { text?: string }).text ?? "";
    case "html":
      return null;
    case "checkbox": {
      const c = tok as { checked?: boolean };
      return c.checked ? "☑ " : "☐ ";
    }
    default:
      return escapeHtml((tok.raw as string) ?? "");
  }
}

/** Render a table cell — falls back to plain text if tokens are empty. */
function renderCell(cell: unknown): ReactNode {
  const cellObj = cell as { tokens?: unknown[]; text?: string };
  const inline = walkInline(cellObj);
  if (inline.length > 0) return <>{inline}</>;
  return <>{escapeHtml(cellObj.text ?? "")}</>;
}

function renderHeading(depth: number, children: ReactNode): ReactElement {
  const sizes = ["text-xl", "text-lg", "text-base", "text-sm", "text-sm", "text-xs"];
  const size = sizes[Math.min(depth - 1, 5)] ?? "text-sm";
  const cls = `${size} font-semibold mt-3 mb-1`;
  switch (depth) {
    case 1: return <h1 className={cls}>{children}</h1>;
    case 2: return <h2 className={cls}>{children}</h2>;
    case 3: return <h3 className={cls}>{children}</h3>;
    case 4: return <h4 className={cls}>{children}</h4>;
    case 5: return <h5 className={cls}>{children}</h5>;
    case 6: return <h6 className={cls}>{children}</h6>;
    default: return <h6 className={cls}>{children}</h6>;
  }
}

function renderCodeBlock(t: Tokens.Code): ReactElement {
  const lang = t.lang ?? "";
  return (
    <pre className="my-2 overflow-x-auto rounded-md bg-zinc-900 p-3 text-(length:--text-compact) text-zinc-100">
      <code className={lang ? `language-${lang}` : ""}>{escapeHtml(t.text ?? "")}</code>
    </pre>
  );
}

function renderTable(header: ReactNode[], rows: ReactNode[][]): ReactElement {
  return (
    <div className="my-2 overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-(length:--text-compact)">
        <thead className="bg-muted/50">
          <tr>
            {header.map((h, i) => (
              <th key={i} className="border-b border-border px-2 py-1 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="even:bg-muted/20">
              {row.map((cell, ci) => (
                <td key={ci} className="border-b border-border/60 px-2 py-1 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderList(ordered: boolean, items: ReactNode[]): ReactElement {
  const Tag = ordered ? "ol" : "ul";
  const cls = ordered
    ? "my-2 list-decimal pl-6 space-y-1"
    : "my-2 list-disc pl-6 space-y-1";
  return (
    <Tag className={cls}>
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </Tag>
  );
}