#!/usr/bin/env python3
"""
batch.py — 课程逐字稿 → 纠错 → 教案

驱动一个 OpenAI 兼容 / ollama 的 LLM 批量处理转写稿。可断点续跑。

    python3 batch.py --input <逐字稿目录> --out <输出目录> [--mode correct|lesson|both]
                     [--only p2] [--model qwen3:8b] [--api http://host:11434]

输出：
    <out>/clean/<name>.md    纠错后的讲义
    <out>/lesson/<name>.md   结构化教案
    <out>/_index.md          目录 + 一句话摘要
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
GLOSSARY = (SKILL / "references" / "glossary.md").read_text(encoding="utf-8")
LESSON_FMT = (SKILL / "references" / "lesson-plan.md").read_text(encoding="utf-8")

DEFAULT_API = "http://100.118.232.61:11434"
DEFAULT_MODEL = "qwen3:8b"
NUM_CTX = 32768   # ComfyUI 停掉后显存够，整篇一讲基本一次装下


def chat(api: str, model: str, system: str, user: str, think: bool = False,
         timeout: int = 3600) -> str:
    """调 ollama /api/chat。

    think=False 很关键：qwen3 是推理模型，默认会先输出一大段思考再给答案，
    同样的任务实测 6.5 tok/s → 88.5 tok/s，快 13 倍；而这类「按规则改错字」
    的任务根本不需要推理，开思考反而容易自作主张删内容。
    """
    body = json.dumps({
        "model": model,
        "stream": False,
        "think": think,
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
        "options": {"num_ctx": NUM_CTX, "temperature": 0.1, "num_predict": 8192},
    }).encode()
    req = urllib.request.Request(f"{api}/api/chat", data=body,
                                headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.loads(r.read())
    return d.get("message", {}).get("content", "").strip()


SYS_CORRECT = f"""你在校对中文课程逐字稿（机器转写稿）。

硬规则，违反任何一条都算失败：
1. **绝对不许删减或新增内容。** 逐句对照原文改，句子数量、信息点、例子、数字全部保留。
   遇到看不懂的乱码，原样保留并标 `【?】`，不要猜、不要省略。
2. 人名统一：张雪芳 / 张雪锋 / 张雪风 → 张雪峰。
3. 固定表述按术语表改。
4. **数字一个都不能改。** 分数、比例、年份、排名即使可疑也照抄。
5. 半角标点改全角中文标点；去掉汉字之间误插的空格；修掉明显病句。
   ⚠️ **补句末标点**：有些转写稿全篇只有逗号、没有一个句号（实测有讲次 4000 字里 0 个「。」），
   那样的稿子读不了。请按语义在句子结束处补上「。」——宁可多补几个，也不要通篇逗号到底。
6. 保留讲者的语气、类比、口头例子。

术语表：
{GLOSSARY}

输出：只输出改后的正文，按原文顺序分段，段间空一行。
不要写任何前言、说明、统计或 markdown 代码块。"""

SYS_LESSON = f"""你是课程设计者。把一份课程讲义压缩成结构化教案。

硬规则，违反任何一条都算失败：
1. **不许编造。** 每一句都要能在讲义里找到出处。看不出出处的，不写。
2. **只搬不算。** 讲义没说的数字一律不出现。**尤其不要统计**「某词出现几次」
   「共几条」这类机器视角的量 —— 那不是讲者的内容。
3. **模板里的 `<……>` 是占位符，绝不能出现在输出里**；也不要把模板里的说明文字
   当成讲义内容抄进去。如果你发现自己在写一句「讲义里好像没说过但听起来合理」的话，
   删掉它。
4. 用讲者的口径写（他说「不要碰」就写「不要碰」，不要润色成「不建议选择」）。
5. 某节没内容就整节省略，不要为凑结构编内容。宁可少四节，不要多一句假的。
6. **长度是硬上限：整篇教案不超过 2500 字。** 这是最容易违反的一条 ——
   写完请自查字数，超了必须删到 2500 字以内再输出。宁可少写四节，不要注水。
   教案是给人快速回顾用的提纲，不是把讲义换个格式再抄一遍。
7. **不要写抬头**（来源 / 模型 / 日期那几行），直接从一级标题开始写。
8. **学习目标必须可观察。** 只用可观察动词：识别/列举/复述/比较/区分/解释/判断/
   计算/举例/规划/评估。**禁用**：理解、了解、掌握、熟悉、认识、体会、培养。
   每条目标只测一件事（检验法：这两半能不能分开打分？能就必须拆成两条），
   且不要把「例如」「比如」写进目标里。
9. **自测题要分层**：回忆层（术语/规则/数字）、应用层（给新情境问怎么做）、
   判断层（分辨容易混的两种情况）。每道题都要闭卷能答，
   不要写成「本节讲了什么」这种空问句。
10. **先抽误解。** 讲者说「很多人以为……其实不是」「大家注意」「不是这样的」的地方，
    单独整理成「常见以为 → 实际上」的对照表——这是本讲最有效的教学抓手。

教案结构（字段说明，不是内容示例）：
{LESSON_FMT}

输出：直接输出 markdown 教案正文，从一级标题开始，不要前言或代码块包裹。"""


SYS_COMPRESS = """把这份教案**压缩**到 2500 字以内（中文字符数）。

规则：
1. 保留全部小标题与每节的核心结论，一条都不能丢。
2. 删掉重复解释、铺陈、同义反复、把一句话拆成三句的注水。
3. **不许新增任何内容。**
4. 小标题层级与名称保持不变。
5. 直接输出压缩后的完整教案 markdown。

注意：模型不会自觉遵守字数上限，所以这一步是硬性返工；请务必真的压到 2500 字以内。"""


SYS_EXTRACT = """你在为一份课程稿做「要点抽取」，供后续压缩成教案。这一步是**压缩**，不是复述。

硬规则：
1. **只抽，不评。** 结论、理由、关键例子、例外、数字。
2. **每条不超过 40 字。整份输出不超过 50 条。** 这是硬上限。
3. **丢掉过程性内容** —— 寒暄、重复解释、绕圈子的话、口语连接词，一律不抽。
4. 例子保留具体信息（分数、学校名、年份、专业名），但一句话讲完。
5. 数字原样抄写。
6. 「但是 / 不过 / 个别情况」是例外，单独列出。
7. **不要统计**「某词出现几次」「共几条」这类机器视角的量。
8. 看不懂的标 `【?】`，不要猜。

输出：markdown 无序列表，每条一行，不要前言。"""


CHUNK_CHARS = 15000  # 一讲约 1.3 万字，基本一块装下，保住跨句上下文


def chunk_text(text: str, limit: int = CHUNK_CHARS) -> list[str]:
    """按句末标点切块。整篇塞一个 context 会爆显存（ComfyUI 占着 16G），
    而且块内断句会破坏改错质量，所以只在句末标点处切。"""
    if len(text) <= limit:
        return [text]
    parts: list[str] = []
    cur = ""
    for seg in re.split(r"(?<=[。！？])", text):
        if len(cur) + len(seg) <= limit:
            cur += seg
        else:
            if cur:
                parts.append(cur)
            cur = seg
    if cur:
        parts.append(cur)
    return parts


def correct_text(api: str, model: str, text: str) -> str:
    """分块纠错，再拼回。

    带一道「句号不许变少」的守卫：实测模型有时会把已有句号合并成逗号
    （p21 从 117 个变 49 个），把稿子越改越难读。逐块比对，退步的块就用原文。
    """
    out = []
    for c in chunk_text(text):
        r = rewrap(chat(api, model, SYS_CORRECT, c))
        if r.count("。") < c.count("。") * 0.9:
            print(f"    ⚠️  该块句号 {c.count('。')} → {r.count('。')}，回退用原文", flush=True)
            r = c
        out.append(r)
    return "\n\n".join(out)


NOTES_MAX = 5000      # 喂给生成步骤的备注上限
LESSON_MIN, LESSON_HARD_MAX = 1500, 3000


def lesson_limit(src: str) -> int:
    """长度上限按**讲义长度**分档，与 references/lesson-plan.md 的长度表一致。

    本语料讲义在 4600–14000 汉字之间浮动，一刀切会让短讲注水、长讲砍内容。
    短讲占比天然偏高——「学习目标 / 关键问题 / 自测题」这几个结构性小节
    不随讲义长度缩水；列表密集的讲（如法学：五院四系九所学校、三种学位）
    压缩率天然更低。实测：7445→2023(27%)、9260→2322(25%)、5723→2382(42%)。
    """
    n = cjk_len(src)
    ratio = 0.45 if n <= 6000 else (0.32 if n <= 9000 else 0.27)
    return max(LESSON_MIN, min(LESSON_HARD_MAX, int(n * ratio)))



def rewrap(text: str, target: int = 300) -> str:
    """把被压成一整行的正文重新分段。

    实测模型有时会把整篇讲义输出成一行（42 讲里有 4 讲中招），
    讲义就没法读了。这里按句末标点重新切段，每段约 target 字。
    """
    lines = [l for l in text.splitlines() if l.strip()]
    if len(lines) > 3 or len(text) < 1500:
        return text                      # 已经有段落结构，不动
    sents = re.split(r"(?<=[。！？])", text.replace("\n", ""))
    out, cur = [], ""
    for s_ in sents:
        cur += s_
        if len(cur) >= target:
            out.append(cur.strip())
            cur = ""
    if cur.strip():
        out.append(cur.strip())
    return "\n\n".join(out)


def cjk_len(s: str) -> int:
    """按纯汉字个数计。用 len() 会把 markdown 标记、标点、空白全算进去，
    实测多算约三成 —— 按 len() 卡上限会把合格的教案误判为超长并反复压缩。"""
    return len(re.findall(r"[\u4e00-\u9fff]", s))


def enforce_length(api: str, model: str, lesson: str, limit: int) -> str:
    """长度硬门。实测模型基本不会自觉遵守字数上限（最夸张的一次
    6679 字的讲义生成了 12151 字的「教案」，比原文还长），
    所以超了就返工压缩，最多压两轮。"""
    for _ in range(2):
        if cjk_len(lesson) <= limit:
            break
        before = cjk_len(lesson)
        lesson = chat(api, model, SYS_COMPRESS, lesson)
        print(f"    压缩 {before} → {cjk_len(lesson)} 字（纯汉字）", flush=True)
    return lesson


def lesson_text(api: str, model: str, clean: str) -> str:
    """整篇太长走 map-reduce：分块抽要点 → 汇总要点一次生成教案。
    直接把十几万字的讲义喂进去既放不下，教案也会散。"""
    # 一定先抽取再生成。直接把整篇讲义喂给 SYS_LESSON 时，模型会「换个格式抄一遍」——
    # 实测 6679 字的讲义能生成出 12151 字的「教案」，比原文还长。
    # 先抽要点（每条≤40字、总≤50条）把输入压下来，输出才会是真正的提纲。
    chunks = chunk_text(clean, 8000)
    notes = "\n\n".join(chat(api, model, SYS_EXTRACT, c) for c in chunks)
    # 备注太长时先递归压缩备注本身。让模型"把 13000 字压到 2500 字"它做不到
    # （实测会把输入原样吐回来 13657→13658），但"把 8000 字备注压成 40 条"能做。
    for _ in range(2):
        if len(notes) <= NOTES_MAX:
            break
        before = len(notes)
        notes = chat(api, model, SYS_EXTRACT, notes)
        print(f"    压缩备注 {before} → {len(notes)} 字", flush=True)
    return enforce_length(api, model, chat(api, model, SYS_LESSON, notes), lesson_limit(clean))


def one(name: str, text: str, api: str, model: str, out: Path, mode: str) -> dict:
    """处理一讲，返回统计"""
    res = {"name": name, "in_chars": len(text)}
    clean_path = out / "clean" / f"{name}.md"
    lesson_path = out / "lesson" / f"{name}.md"

    if mode in ("correct", "both"):
        if clean_path.exists() and clean_path.stat().st_size > 0:
            clean = clean_path.read_text(encoding="utf-8")
            res["clean"] = "skip"
        else:
            clean = rewrap(correct_text(api, model, text))
            clean_path.parent.mkdir(parents=True, exist_ok=True)
            clean_path.write_text(clean, encoding="utf-8")
            res["clean"] = "ok"
    else:
        clean = text

    if mode in ("lesson", "both"):
        if lesson_path.exists() and lesson_path.stat().st_size > 0:
            lesson = lesson_path.read_text(encoding="utf-8")
            res["lesson"] = "skip"
        else:
            body = lesson_text(api, model, clean)
            # 抬头由脚本注入，不让模型写 —— 否则它会自己编日期和模型名
            hdr = (f"> 来源：{name}　模型：{model}　生成：{time.strftime('%Y-%m-%d')}\n"
                   f"> 本稿由机器转写整理，已做错字与表达修复；未经讲者审阅。\n\n")
            lines = body.splitlines()
            if lines and lines[0].startswith("# "):
                lesson = lines[0] + "\n\n" + hdr + "\n".join(lines[1:]).lstrip("\n")
            else:
                lesson = hdr + body
            lesson_path.parent.mkdir(parents=True, exist_ok=True)
            lesson_path.write_text(lesson, encoding="utf-8")
            res["lesson"] = "ok"
    else:
        lesson = ""

    res["clean_chars"] = len(clean)
    res["lesson_chars"] = len(lesson)
    res["marks"] = clean.count("【?】")
    # 一句话摘要：教案的第一个正文行
    first = ""
    for ln in lesson.splitlines():
        s = ln.strip()
        if s and not s.startswith("#") and not s.startswith(">"):
            first = re.sub(r"[*`]", "", s)[:60]
            break
    res["summary"] = first
    return res


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="逐字稿目录")
    ap.add_argument("--out", required=True, help="输出目录")
    ap.add_argument("--mode", default="both", choices=["correct", "lesson", "both"])
    ap.add_argument("--only", help="只处理文件名含此串的讲次")
    ap.add_argument("--api", default=DEFAULT_API)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    ind = Path(args.input).expanduser()
    out = Path(args.out).expanduser()
    files = sorted(p for ext in ("*.txt", "*.md") for p in ind.glob(ext)
                   if p.stat().st_size > 0 and not p.name.startswith("_"))
    if args.only:
        files = [p for p in files if args.only in p.name]
    if args.limit:
        files = files[: args.limit]
    if not files:
        print(f"❌ {ind} 下没找到 .txt", file=sys.stderr)
        return 1

    print(f"共 {len(files)} 讲  mode={args.mode}  model={args.model}")
    stats = []
    for i, p in enumerate(files, 1):
        name = p.stem
        text = p.read_text(encoding="utf-8", errors="ignore").strip()
        t0 = time.time()
        print(f"[{i}/{len(files)}] {name}  ({len(text)} 字) ...", flush=True)
        try:
            r = one(name, text, args.api, args.model, out, args.mode)
            r["secs"] = round(time.time() - t0)
            stats.append(r)
            print(f"    clean={r['clean_chars']}字 lesson={r['lesson_chars']}字 "
                  f"【?】{r['marks']}处  {r['secs']}s")
        except urllib.error.URLError as e:
            print(f"    ❌ 连不上 {args.api}: {e}", file=sys.stderr)
            break
        except Exception as e:
            print(f"    ❌ {type(e).__name__}: {str(e)[:200]}", file=sys.stderr)

    if stats:
        idx = out / "_index.md"
        idx.parent.mkdir(parents=True, exist_ok=True)
        with idx.open("w", encoding="utf-8") as w:
            w.write(f"# 课程教案目录\n\n共 {len(stats)} 讲　模型 {args.model}\n\n")
            w.write("| 讲次 | 教案字数 | 【?】待复核 | 摘要 |\n|---|---|---|---|\n")
            for r in stats:
                w.write(f"| {r['name']} | {r['lesson_chars']} | {r['marks']} "
                        f"| {r.get('summary','')} |\n")
        print(f"\n✅ 目录已写 {idx}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
