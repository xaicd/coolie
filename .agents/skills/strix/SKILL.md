---
name: strix
description: 用 Strix（开源自主 AI 渗透测试）对自有代码/接口/站点做安全审计与渗透测试，产出带 PoC 的漏洞报告与 SARIF。适用于「安全扫描/代码安全审计/渗透测试/OWASP 检查/PR 安全门禁」等。仅限已授权目标；默认只用本地 CLI 模式（源码不出机），凭据禁落盘。
---

# Strix（AI 渗透测试 / 安全审计，项目本地采纳版）

> 上游：`usestrix/strix`（Apache-2.0，Python + Docker 沙箱）· 文档 https://docs.strix.ai · 机器可读 https://docs.strix.ai/llms.txt
> 本项目采用**项目本地包装**：只在本 `.agents/skills/strix/` 声明用法与红线，不 vendor 上游；上游 9 个 consumer skill 按需拉取。

⚠️ **仅限授权目标**：Strix 会**主动攻击**你指向的目标。只能对**自有或持有书面授权**的系统（如本仓 / 测试环境 `192.144.253.205`）运行；未授权测试在多数司法辖区违法。

---

## 一、两条铁律（本项目强制）

1. **只用本地 CLI 模式**：托管云 `strix cloud` 会把源码**上传到 strix.ai**，与 §0.1 数据边界冲突 → **默认禁用**，需用户逐次明确批准。
2. **凭据禁落盘**（deployment-workflow §2）：
   - `STRIX_LLM` / `LLM_API_KEY` 只经环境变量或密钥库注入，**禁止写入仓库/日志**（注意本仓已有 `.env.test` 真密钥入库的事故，勿重蹈）。
   - Strix 会自动把配置存到 `~/.strix/cli-config.json` —— 该文件按敏感文件对待。
   - `curl -sSL https://strix.ai/install | bash` 属供应链动作，按 `find-skills/` 四步准入评估后再装。

---

## 二、快速开始

```bash
# 前置: Docker 运行中 + 任一 LiteLLM 模型 id + 该 provider 的 key
export STRIX_LLM="openrouter/z-ai/glm-5.3"   # 或 openai/... anthropic/... deepseek/...
export LLM_API_KEY="<从密钥库取, 勿落盘>"

# 本地工作区白盒审计 (headless, 必须 -n)
strix -n -t ./ --scan-mode quick --max-budget 10
```

### 2.1 本项目已内置 LLM 配置（用咱们自己的 MiniMax/GLM，不落盘）

`scripts/security/strix-env.sh` 会自动从本机既有配置取密钥并设好三件套（**不打印、不入仓**）：
MiniMax ← `~/.hermes/.env` 的 `MINIMAX_CN_API_KEY`；GLM ← `~/.claude/settings.json` 的 `env.ANTHROPIC_AUTH_TOKEN`。

| `STRIX_PROVIDER` | `STRIX_LLM` | `LLM_API_BASE` | 2026-09-28 实测 |
|---|---|---|---|
| `minimax`（默认） | `openai/MiniMax-M2` | `https://api.minimaxi.com/v1` | ✅ agentic 可工具调用，真实跑通(740K/2.3K tok, $0.22/12轮) |
| `glm` | `openai/glm-4-flash` | `https://open.bigmodel.cn/api/paas/v4` | ✅ 200（glm-5.3/4.6/4-plus 套餐不含→429）|
| `glm-anthropic` | `anthropic/glm-5.3` | `https://open.bigmodel.cn/api/anthropic` | ✅ 200（同 `~/.claude` 用法）|

用法：`source scripts/security/strix-env.sh`（或直接 `strix-scan.sh`，它会自动 source）；切 provider 加 `STRIX_PROVIDER=glm`。

**提升效果的两个关键**（上游明确）：
- **同时给一个运行中的实例**：`-t ./ -t http://host.docker.internal:3000` → 从"看起来不安全"升级为"已验证可利用"。
- **收窄范围 + 说明信任边界**：`-t ./services/api --max-budget 15 --instruction "多租户: tenantId 来自 JWT; 凡是只按 id 过滤而没按 tenant 过滤的查询都要报"`。租户模型/信任边界/攻击者可控输入是 agent 猜不准的，必须喂。

```bash
# 只审某分支改动 (大仓别整仓)
strix -n -t ./ --scope-mode diff --diff-base origin/main --max-budget 10
```

> 本地路径会**可写**挂进沙箱（agent 能改文件）→ 对干净检出运行。

---

## 三、读结果（`strix_runs/<run>/`）

- `penetration_test_report.md`（先看这个）
- `vulnerabilities/*.md`（每条含 PoC + 修复建议，附 file:line）
- `vulnerabilities.json` / `.csv` · `findings.sarif`（SARIF 2.1.0，可传 GitHub code scanning）
- `run.json`（`status` / `llm_usage.cost`）

**退出码**：`0` 未证明可被利用 · `1` 致命错误 · `2` 发现漏洞。
⚠️ **陷阱**：`0` 只代表"已分析范围内没被证明"，不等于干净；命中 `--max-budget` 硬停会**提前收尾但仍退 0**（`run.json.status="stopped"`）→ 门禁前必须校验 `status=="completed"` 并对比 cost 与 budget。

---

## 四、CI 集成（把门禁补齐）

本仓 `.git/hooks/pre-commit` **曾未安装**导致各门禁形同虚设（见 `pre-commit-environment-check/`）。Strix 可补"PR 安全门禁"：
- 自托管 CLI：GitHub Actions 里 `strix -n -t ./ --scan-mode quick --max-budget 10`，退出码 `2` 卡构建；**另加一步校验 `run.json.status=="completed"` 防"隐式通过"**；SARIF 经 `github/codeql-action/upload-sarif` 上传。
- **已内置** `.github/workflows/strix-security.yml`：PR diff 范围体检 + SARIF + 完成度校验；**opt-in**（仓库变量 `STRIX_CI_ENABLED=true` 才跑，secrets `STRIX_LLM`/`LLM_API_KEY`），避免未配密钥时挡掉所有 PR。
- 需先配仓库 secret `STRIX_LLM` + `LLM_API_KEY`（**由人创建，不要由 agent 代填**）。
- 云端 PR 审查（Option B）会外传源码 → 本仓默认不采用。

---

## 五、与现有能力互补（不要互相替代）

- **密钥扫描**用 gitleaks/trufflehog，**依赖 CVE** 用 SCA；Strix 只补它俩结构上查不到的逻辑/鉴权/注入类漏洞。
- 修复走 `fix-security-vulnerabilities-with-strix` 的姿势：改**根因**（共享的鉴权 helper，而非单个路由），再重跑 Strix 证明 PoC 失效。
- 本仓日常排版/边界守卫仍走 `comprehensive-testing-workflow/` + 各 `check:*` guard；Strix 是**安全维度**的补充。

---

## 六、运行脚本

受约束入口：`scripts/security/strix-scan.sh`（要求已装 `strix` + 显式注入 `STRIX_LLM`/`LLM_API_KEY`，默认本地模式，拒绝云模式，跑完校验 `run.json.status`）。

## 七、上游 9 个 consumer skill（按需拉取，勿盲装）

`npx skills add usestrix/strix` → `penetration-testing-with-strix` / `find-security-vulnerabilities-in-code` / `fix-security-vulnerabilities-with-strix` / `ci-security-scanning-with-strix` / `api-security-testing` / `web-app-penetration-testing` / `owasp-top-10-testing` / `application-security-testing` / `managed-pentesting-with-strix`。
按 `find-skills/` 四步准入：先读真实 SKILL.md、看安全标记与出网、再决定是否落库 + 同步 AGENTS §5.1.5。
