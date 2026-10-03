#!/usr/bin/env python3
"""把多文件 slide deck 合成单个 HTML —— 供 PPTX 导出用。

为什么需要这一步：PPTX 导出（pptx_from_rendered.py）读的是渲染后的坐标，
它要的是**一个** HTML 里的连续页；多文件 deck 每页是独立 HTML，
直接逐页导会得到一堆只有一页的 pptx。

做法：按文件名排序，把每页的 <body> 内容抄进一个 <section class="page">，
页间加 page-break；共享样式（deck.css）内联进来，页内私有的 <style> 也保留。

用法：
    python3 combine_deck.py slides -o deck-pptx-source.html
    python3 combine_deck.py slides -o out.html --css deck.css --title "法学 · 课件"

依赖：仅标准库。
"""
import argparse
import html
import pathlib
import re
import sys

PAGE_W, PAGE_H = 1920, 1080


def read(p: pathlib.Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def extract_body(doc: str) -> str:
    """取 <body> 内容；没有 body 标签就退回全文。"""
    m = re.search(r"<body[^>]*>(.*)</body>", doc, re.S | re.I)
    return m.group(1) if m else doc


def tag_as_slide(body: str, name: str) -> str:
    """把页单位标成 <div class="stage" data-slide="...">。

    ⚠️ 不要额外套一层 <section class="page">。pptx_from_rendered.py 的默认选择器是
    `.slide, .s, section` —— `.s` 这个类名太常见（本站的 .stats .s 就是），
    套 section 会把页面里的 .s 子元素也识别成独立页，
    12 页的 deck 会导成 16 页。直接标在 .stage 上并配合 --selector .stage 才稳。
    """
    stem = pathlib.Path(name).stem
    m = re.search(r"<div\s+class=\"([^\"]*)\"", body)
    if m and "stage" in m.group(1):
        return body[:m.start()] + f'<div class="{m.group(1)}" data-slide="{stem}"' + body[m.end():]
    # 没有 .stage 的页：包一层，至少保证 --selector .stage 能匹配到
    return f'<div class="stage" data-slide="{stem}">{body}</div>'


def extract_styles(doc: str) -> list:
    """取页内 <style> 块（共享样式之外的私有样式）。"""
    return re.findall(r"<style[^>]*>(.*?)</style>", doc, re.S | re.I)


def resolve_css(slides_dir: pathlib.Path, css_arg):
    """找共享样式：显式指定 > deck.css > ../deck.css。"""
    if css_arg:
        p = pathlib.Path(css_arg)
        if not p.is_absolute():
            p = slides_dir / p
        return p if p.exists() else None
    for cand in (slides_dir / "deck.css", slides_dir.parent / "deck.css"):
        if cand.exists():
            return cand
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("slides", help="每页 HTML 所在目录")
    ap.add_argument("-o", "--out", required=True, help="输出的单文件 HTML")
    ap.add_argument("--css", help="共享样式路径（默认自动找 deck.css）")
    ap.add_argument("--title", default="Deck", help="<title>")
    args = ap.parse_args()

    slides_dir = pathlib.Path(args.slides).resolve()
    if not slides_dir.is_dir():
        print(f"目录不存在: {slides_dir}", file=sys.stderr)
        return 1

    files = sorted(p for p in slides_dir.glob("*.html"))
    if not files:
        print(f"{slides_dir} 里没有 .html", file=sys.stderr)
        return 1

    css_path = resolve_css(slides_dir, args.css)
    shared_css = read(css_path) if css_path else ""

    parts = [
        '<!doctype html>',
        '<html lang="zh-CN"><head><meta charset="UTF-8">',
        f"<title>{html.escape(args.title)}（PPTX 源）</title>",
        "<style>",
        shared_css,
        "\n/* --- 合成器注入：页与页之间留白，便于人眼核对 --- */",
        ".stage{margin:0 0 48px;page-break-after:always;break-after:page;}",
        ".stage:last-child{page-break-after:auto;break-after:auto;margin-bottom:0;}",
        "</style>",
    ]

    seen_styles = set()
    for f in files:
        doc = read(f)
        for st in extract_styles(doc):
            key = st.strip()
            if key and key not in seen_styles and key != shared_css.strip():
                seen_styles.add(key)
                parts.append(f"<style>{st}</style>")

    parts.append("</head><body>")
    for f in files:
        parts.append(tag_as_slide(extract_body(read(f)).strip(), f.name))

    parts.append("</body></html>")

    out = pathlib.Path(args.out)
    out.write_text("\n".join(parts), encoding="utf-8")
    kb = out.stat().st_size / 1024
    print(f"✓ {out}  ({kb:.0f} KB, {len(files)} 页)")
    if not css_path:
        print("  ⚠️  没找到共享样式，页面可能没样式 —— 用 --css 指定", file=sys.stderr)
    else:
        print(f"  共享样式: {css_path}")
    print(f"  → 导出 PPTX 时务必带 --selector .stage：")
    print(f"     python3 pptx_from_rendered.py {out} -o <名>.pptx --selector .stage")
    return 0


if __name__ == "__main__":
    sys.exit(main())
