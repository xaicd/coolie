---
name: video-to-transcript
description: 把视频/音频下载并转成文字稿——B站需伪装浏览器头过 WAF，Mac 上用 mlx-whisper 走 Apple GPU 批量转写（比 CPU 快约 30 倍），支持断点续跑与自动合并。当用户说「下载这个视频转文字」「B站视频转写」「把这个讲座/课程录音转成文字」「批量转写」「whisper 转写」时使用。
license: MIT
---

# 视频/音频 → 文字稿

把外部音视频变成**可用的文字**。这条链路只管「拿到干净的转写稿」；
稿子的**纠错与教学化重组**归 `$lecture-lesson-plan`，本技能不碰。

## 铁律（先读，违反即返工）

1. **Mac 上不要用 `openai-whisper`。** 它只能走 CPU：实测 15 小时 20 分音频，
   `small` 要 27–31 小时、`medium` 要 46–61 小时。**mlx-whisper 走 Apple GPU，同样量级约 1 小时。**
   这不是优化，是能不能跑完的区别。
2. **B站必须伪装请求头。** B 站 WAF 按 header 指纹拦 `yt-dlp`，裸跑必失败。
   UA 要伪装成 Edge，并补 `Referer` / `Origin` / `Accept-Language`，见 `references/bilibili.md`。
3. **批量转写必须可断点续跑。** 长任务会被打断；脚本按「输出非空则跳过」实现，
   不要改成无条件覆盖——重跑一次就是几小时。
4. **转写完先查幻觉尾句再交付。** whisper 在静音段会凭空生成收尾句（「谢谢大家」「字幕由…提供」）。
   这类句子**看起来通顺、最容易被放过**，但它不在音轨里。检测规则见 `references/whisper-models.md`。
5. **`bili2text` 相关命令必须在 `bili2text/` 目录下执行**——它依赖该处的 `uv` 环境与相对 `./out` 路径。

## 快速开始

两条路径，按「源在哪」选：

### A. 源在 B 站 —— 一条命令下载 + 转写

```bash
cd bili2text                      # 必须在 submodule 里，见铁律 5
../scripts/bili_tx.sh <BV号> <p分集> [model] [输出前缀]

# 例：
../scripts/bili_tx.sh BV1qyWyzeE1E 1 small p1      # 只跑第 1 集
../scripts/bili_tx.sh BV1qyWyzeE1E '' medium all   # 跑全部
```

它先下音频（`.mp3`）再转写（`.txt`）。**已有音频会跳过下载**，所以重跑不会重下。

### B. 源已在本地 —— 只转写

```bash
cd bili2text
../scripts/whisper_mlx_batch.sh [模型] [文件名匹配]

# 例：
../scripts/whisper_mlx_batch.sh                                              # 全部
../scripts/whisper_mlx_batch.sh mlx-community/whisper-large-v3-mlx 'BV1qyWyzeE1E_p1'
```

跑完**自动合并**成 `out/tx/课程笔记.md`（按分集号排序、带标题分隔）。

## 模型怎么选

| 场景 | 模型 | 说明 |
|---|---|---|
| 中文课程/讲座（默认） | `mlx-community/whisper-medium-mlx` | 速度与准确率平衡，15h 量级约 1 小时 |
| 术语多、要最准 | `mlx-community/whisper-large-v3-mlx` | 明显更慢，但专有名词错得少 |
| 只想知道大意 | `mlx-community/whisper-small-mlx` | 最快，错字明显变多 |

转写完**必查**：同音错字（人名/术语）、漏句、幻觉尾句。这三类问题的处理方式不同——
前两类靠术语表替换，第三类**必须删除而不是改写**。详见 `references/whisper-models.md`。

## 产物与交接

```
bili2text/out/*.mp3              下载的音频
bili2text/out/tx/*.txt           单集转写稿
bili2text/out/tx/课程笔记.md      合并稿（按集排序）
bili2text/out/tx/batch_mlx.log   批量日志（含每集耗时）
```

拿到合并稿后：

- **课程类** → 交 `$lecture-lesson-plan` 做纠错 + 教案
- **参考剧/竞品类** → 转写稿是 `$drama-market-research` 的结构分析输入
- 讲义/教案产物**不要**回写进 `bili2text/`（那是 pinned 上游 submodule，改动提交不上去）

`bili2text/out/` 与 `cookies.txt` 已由 `bili2text/.git/info/exclude` 排除，**不会进 git**——
父仓库的 `.gitignore` 对 submodule 内容不生效，这是刻意的。

## 排错

| 现象 | 原因与处理 |
|---|---|
| 下载报 412 / 被拒 | WAF 拦了 header 指纹，检查 UA 与三个附加头 |
| 需要登录才能看的视频 | 要 B 站 cookie，见 `references/bilibili.md` 与 `docs/bili2text-cookie导出教程.md` |
| 转写跑一半崩了 | 直接重跑同一条命令，已完成的会 SKIP |
| 转写稿结尾多一句客套话 | 幻觉尾句，删掉（铁律 4） |
| `找不到 pyproject.toml` | 没在 `bili2text/` 目录下（铁律 5） |
| 想换回 CPU 版 | `scripts/bili2text_batch_tx.sh`，仅在 mlx 不可用时用，见 `references/whisper-models.md` |

## 参考

- `references/bilibili.md` — WAF 绕过细节、cookie 导出、限流与批量策略
- `references/whisper-models.md` — 模型/性能实测、幻觉尾句检测、纠错分工
