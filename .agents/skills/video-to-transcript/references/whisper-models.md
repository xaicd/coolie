# 转写引擎选择与转写稿质量

## 为什么必须用 mlx-whisper

`bili2text` 自带的是 `openai-whisper` + torch。在 Apple Silicon 上 **torch 不走 GPU（MPS 对 whisper 支持不完整），实际跑在 CPU 上**。

实测对比（15 小时 20 分音频，M2 Max）：

| 引擎 | 模型 | 预计耗时 |
|---|---|---|
| openai-whisper（CPU） | small | 27–31 小时 |
| openai-whisper（CPU） | medium | 46–61 小时 |
| **mlx-whisper（Apple GPU）** | medium | **约 1 小时** |

差距是 30 倍量级，且 CPU 路线长到不实用。**默认走 mlx。**

`scripts/bili2text_batch_tx.sh` 保留了 CPU 路线，仅在 mlx 装不起来时用。

## mlx 环境

自动准备，无需手工：

```
venv: $HOME/.cache/manju-whisper/venv      （可用 MANJU_WHISPER_VENV 覆盖）
首次运行会 uv venv --python 3.11 + uv pip install mlx-whisper
```

`mlx_whisper` 会把结果按 `basename` 写到 `--output-dir` 下，脚本随后把它 `mv` 成 `out/tx/<name>.txt`。
中途产物在 `out/tx/_raw/`，**不要把它当最终产物**。

## 断点续跑的实现

```bash
if [ -s "$txt" ]; then
  echo "[$i/$TOTAL] SKIP (已存在) $base"; continue
fi
```

非空即跳过。日志 `out/tx/batch_mlx.log` 里每集都有 `OK <秒数> <集名> (<字数>)`，
可以用它核对是否有某集字数异常（异常少 = 转写失败但没报错）。

## 转写稿的三类问题，处理方式不同

### 1. 同音错字 —— 术语表替换

人名、专业术语、机构名最容易错（「民法典」→「民发点」、「司法部」→「私法部」）。
**建一份替换表批量处理**，不要逐条手改。`$lecture-lesson-plan` 里已有
`references/glossary.md` 与 `references/substitutions.json` 可复用。

### 2. 漏句 / 串词 —— 需要回听

whisper 在语速快或多人重叠时会整段丢。判断方法：**上下文语义断裂**。
这类**不能靠猜补**——补错了比缺一句更糟，必要时回听原音频。

### 3. 幻觉尾句 —— 必须删除

whisper 在**静音段**会凭空生成收尾语，典型形态：

- 「谢谢大家」「感谢观看」「我们下期再见」
- 「字幕由 XXX 提供」「请不吝点赞订阅」
- 「（完）」「本集结束」这类总结句

**危险性在于它读起来通顺、位置又正好在结尾，最容易被当成正文放过。**
但它不在音轨里。

检测规则：

- 位置在**最后 1–2 句**
- 内容与全文主题**无关**（客套、订阅、字幕声明）
- 语气**突然收束**（前文还在讲细节，突然总结）

处理是**删除**，不是改写——它对应的不是被压掉的真实语音，没有「原意」可还原。

## 交付前的自检

对每一份转写稿：

1. 字数是否与音频时长匹配（中文正常语速约 200–260 字/分钟）
2. 结尾 1–2 句是否为幻觉尾句
3. 人名/术语是否一致（同一人前后译法不能飘）
4. 有无明显语义断裂段（漏句）
