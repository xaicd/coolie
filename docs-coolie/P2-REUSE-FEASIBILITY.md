# P2 复用可行性核实(省 token 结论)

> 目的:在写任何引擎代码前,先核实 coolie 现成的编码引擎 adapter 能否直接满足需求,
> 判断"还要不要自研 native 引擎、要写多少",避免重复造轮子浪费 token。
> **结论:绝大部分可直接复用,几乎无需自研引擎。接国内模型是"改配置"而非"写代码"。**

---

## 1. coolie 现成的编码引擎 adapter(开箱即用)

`packages/adapters/` 下已内置一批成熟的真实编码引擎:
- `codex_local`(OpenAI Codex,ACP)、`claude_local`(Claude Code)、`gemini_local`、`grok_local`
- `opencode_local`(默认模型都是 `openrouter/deepseek/...`,生态已含国内模型)
- **`kimi_local`(月之暗面 Kimi,国内模型,已内置)** — `@moonshot-ai/kimi-code`,含 K2.7/K3
- `cursor_local`/`cursor_cloud`、`hermes`、`openclaw_gateway`、`paperclip_runner`(ACP runtime)

→ 这些就是你原系统"native 引擎"要做的事(ReAct 循环/工具调用/编码),**别人已经写好且在跑**。

## 2. 接国内模型:靠环境变量,几乎零代码

证据:
- `packages/adapter-utils/src/billing.ts` 的 `inferOpenAiCompatibleBiller` 靠 `OPENAI_BASE_URL` / `OPENAI_API_BASE` / `OPENROUTER_API_KEY` 判定 OpenAI 兼容端点。
- `codex-local` 用 `apiBaseUrl` 注入自定义端点,支持 `openrouter` 等兼容 biller。

→ DeepSeek / Qwen(通义)/ 智谱 / Kimi 等国内模型大多提供 **OpenAI 兼容 API**,因此:
- **接入方式 = 配 `OPENAI_BASE_URL` + `OPENAI_API_KEY`(或 OpenRouter)= 配置,不是写代码。**
- Kimi 更是已有专属 adapter `kimi_local`,直接可选。

## 3. 那到底还要不要自研 `coolie_native`?

| 你原系统的能力 | coolie 现状 | 结论 |
|---|---|---|
| ReAct 编码循环 / 工具调用 / 补丁合并 | 现成 adapter 已有 | **复用,不自研** |
| 接国内模型(DeepSeek/Qwen/Kimi…) | OpenAI 兼容端点 + kimi_local | **配置即可** |
| 多 agent 群策群力讨论 | 需编排层(见 P2/P4 规划) | 少量新开发(编排层,非引擎) |
| 本体工具 / Schema 逆向 / 信创专属 | coolie 无 | 作为 plugin/工具**薄接入**(量小) |

→ **`coolie_native` 骨架保留作"差异化能力的挂载点",但不重写一个完整引擎。** 真正要写的只有你相对现成引擎**多出来的那一小块**(本体工具等),且优先包开源库,不重造。

## 4. 省 token 的推进路径(取代"全量重写引擎")

1. **先复用**:给 agent 选一个现成 adapter(如 `kimi_local` 或配了国内端点的 `codex_local`/`opencode_local`),接 coolie 的模型配置,跑通"agent 用真实引擎完成一个小任务"。——**配置为主,几乎不产代码。**
2. **再差异化**:仅当某能力现成引擎确实没有(本体/信创工具),才在 `coolie_native` 或 plugin 里薄薄写那一块。
3. **群策群力**:走 P2+ 讨论编排层(建在 issue 评论/@唤醒/交互上),这是"编排"不是"引擎",量可控。

## 5. 结论一句话

**不需要全量重写引擎。** coolie + 其开源 adapter 生态已覆盖你 native 引擎 ~90% 的能力(含国内模型,靠配置接入);只需为那 ~10% 差异化能力做薄接入。这既省 token,又天然合规(复用 MIT 开源 + 自己只写差异化,不 copy 旧代码)。

---
*本文件为核实记录,未改动 coolie 核心代码。*
