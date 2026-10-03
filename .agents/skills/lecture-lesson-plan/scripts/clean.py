#!/usr/bin/env python3
"""
clean.py — 确定性清洗/纠错（不调 LLM）

机器转写稿里有一大批错误是**确定性**的：半角标点、CJK 之间混入空格、
术语表里列明的固定错写。这些用规则做又快又稳，而且不会有幻觉风险。

判定不了的同音错字**一律不动**——留给人工或强模型复核，宁可留错也不改错。

    python3 clean.py --input <逐字稿目录> --out <输出目录> [--only p2]

输出：<out>/<name>.md，逐讲一份；末尾附改动统计。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
SUBS = json.loads((SKILL / "references" / "substitutions.json").read_text(encoding="utf-8"))

# 半角 → 全角标点。不碰数字里的 . 和 / ，不碰范围符 -
PUNCT = {
    ",": "，", "?": "？", "!": "！", ":": "：", ";": "；",
    "(": "（", ")": "）", "。": "。",
}
CJK = r"\u4e00-\u9fff"


def build_rules() -> list[tuple[str, str]]:
    rules: list[tuple[str, str]] = []
    for group in ("people", "fixed_phrases"):
        rules += [(k, v) for k, v in SUBS.get(group, {}).items()]
    # 长的先替换，避免「本科志愿田报」被短规则切碎
    return sorted(rules, key=lambda kv: -len(kv[0]))


RULES = build_rules()


def clean(text: str) -> tuple[str, dict]:
    stat = {"punct": 0, "space": 0, "subs": {}, "dedup": 0}

    # 1) CJK 之间误插的空格
    text, n = re.subn(rf"(?<=[{CJK}])\s+(?=[{CJK}])", "", text)
    stat["space"] = n

    # 2) 半角标点 → 全角（逐字符，只在标点位置）
    out = []
    for ch in text:
        if ch in PUNCT:
            out.append(PUNCT[ch])
            stat["punct"] += 1
        else:
            out.append(ch)
    text = "".join(out)

    # 3) 术语表替换
    for bad, good in RULES:
        if bad in text:
            c = text.count(bad)
            text = text.replace(bad, good)
            stat["subs"][f"{bad}→{good}"] = c

    # 4) 相邻重复词（只处理 2 字词紧邻重复，如「这个这个」）
    text, n = re.subn(rf"([{CJK}]{{2}})\1", r"\1", text)
    stat["dedup"] = n

    # 5) 连续空白收敛
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip(), stat


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only")
    args = ap.parse_args()

    ind, out = Path(args.input).expanduser(), Path(args.out).expanduser()
    files = sorted(p for p in ind.glob("*.txt") if p.stat().st_size > 0)
    if args.only:
        files = [p for p in files if args.only in p.name]
    if not files:
        print(f"❌ {ind} 下没有 .txt", file=sys.stderr)
        return 1

    out.mkdir(parents=True, exist_ok=True)
    agg: dict[str, int] = {}
    total_in = total_out = 0
    rows = []
    for p in files:
        raw = p.read_text(encoding="utf-8", errors="ignore")
        fixed, st = clean(raw)
        (out / f"{p.stem}.md").write_text(fixed, encoding="utf-8")
        total_in += len(raw)
        total_out += len(fixed)
        for k, v in st["subs"].items():
            agg[k] = agg.get(k, 0) + v
        agg["全角标点"] = agg.get("全角标点", 0) + st["punct"]
        agg["CJK空格"] = agg.get("CJK空格", 0) + st["space"]
        agg["重复词"] = agg.get("重复词", 0) + st["dedup"]
        rows.append((p.stem, len(raw), len(fixed)))

    print(f"处理 {len(rows)} 讲　{total_in} 字 → {total_out} 字")
    print("\n改动统计：")
    for k, v in sorted(agg.items(), key=lambda kv: -kv[1]):
        print(f"  {k:<34} {v}")
    print(f"\n输出目录：{out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
