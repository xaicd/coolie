# 多工具上下文接力总线 (Multi-Tool Context Bus) 规范

> **版本**: wave284-spec  
> **日期**: 2026-10-03  
> **设计目标**: 解决 7 工具池跨宿主环境（Mac 宿主机 vs Docker 容器 vs 云端）、跨工种（FDA 墨斗 -> Core SWE 铁匠 -> FDSE 门神 -> PRE-SRE 兑底渊 -> DS 百晓生）在任务接力过程中**上下文断裂、重复交代背景、产物无法自动向下游穿透**的核心痛点。

---

## 1. 核心问题与设计原则

### 1.1 痛点剖析
1. **异构环境断层**：
   - 墨斗（FDA）运行在容器内（Gemini 3.8 / Antigravity），铁匠（Core SWE）运行在 Mac 宿主机（Claude Code / `/opt/homebrew/bin/claude`），兑底渊（PRE-SRE）使用 Copilot / SSH。跨环境导致进程内存无法共享，剪贴板和会话上下文极易遗失。
2. **上游输出与下游输入脱节**：
   - 上游完成方案（Spec）或代码修改（Commit）后，下游启动时不知道上游改了哪些文件、做过什么架构决策、需要补充哪些单元测试或部署配置。
3. **人工传话成本高且失真**：
   - 老板或 PM 往往需要手动复制上一波的 commit hash、文件路径、改动点发给下一个工具，效率低下且易产生理解偏差。

### 1.2 四大设计原则
1. **单一数据底座 (Single Source of Truth)**：
   - 上下文接力状态落盘在共享工作空间目录 `.coolie-local/context-bus/<wave>.json`，任何宿主（Host / Container）均可读写。
2. **前向自动继承 (Zero-Friction Inheritance)**：
   - 下游工具派单时，自动继承上游工具的所有成果（Commit、修改文件列表、Spec 契约、待办清单），自动拼装成「前序交接上下文（Handover Brief）」。
3. **不可变审计链 (Immutable Audit Trail)**：
   - 记录工具演进链（Tool Trace）：`Tool A -> Tool B -> Tool C`，每一步都有明确的执行者、工具、环境、产物与时间戳。
4. **与 CMMI G1-G5 门禁无缝联动**：
   - 上下文总线与 `.coolie-local/evidence-ledger/` 强绑定，上游门禁未满足时，下游接力能清晰识别当前缺少的证据。

---

## 2. 数据结构规范 (`.coolie-local/context-bus/<wave>.json`)

```json
{
  "schemaVersion": 1,
  "wave": "wave284",
  "taskTitle": "通知跳转假 Issue 修复与多工具上下文接力",
  "currentStep": 2,
  "updatedAt": "2026-10-03T08:35:00Z",
  "pipeline": [
    {
      "step": 1,
      "employee": "墨斗",
      "subagentType": "modou-fda",
      "role": "fda",
      "tool": "agy-gemini3.8",
      "hostEnv": "container",
      "receiptId": "20261003T083000Z-wave284-modou-fda",
      "status": "done",
      "commit": null,
      "artifacts": ["docs-coolie/specs/2026-10-03-multi-tool-context-bus.md"],
      "changedFiles": [],
      "gateSatisfied": "G1_FDA",
      "handoverNote": "完成了上下文接力总线 Spec 与数据结构设计，交接给铁匠（Core SWE）编写 scripts/context-bus.sh 与联动改造。"
    }
  ],
  "activeContext": {
    "latestCommit": "4e007bcd45",
    "changedFiles": [],
    "keyArtifacts": ["docs-coolie/specs/2026-10-03-multi-tool-context-bus.md"],
    "nextAction": "铁匠实现 context-bus 脚本与 dispatch 继承逻辑",
    "verificationChecklist": [
      "context-bus.sh push/pull/prompt 功能测试通过",
      "dispatch-local-employee.sh 支持 --inherit-context 自动拼接上游上下文"
    ]
  }
}
```

---

## 3. CLI 工具标准与接口 (`scripts/context-bus.sh`)

1. **初始化波次上下文**：
   ```bash
   bash scripts/context-bus.sh --init <wave> --task "<taskTitle>"
   ```
2. **上游工具完工，记录交接（Push）**：
   ```bash
   bash scripts/context-bus.sh --push \
     --wave <wave> \
     --agent <agent> \
     --tool <tool> \
     --commit <hash> \
     --files "file1,file2" \
     --artifacts "spec1.md" \
     --note "上游交付说明与下游嘱托" \
     --gate <G1_FDA|G2_CoreSWE|G3_FDSE|G4_DS|G5_PRE>
   ```
3. **下游工具查看当前上下文（Pull）**：
   ```bash
   bash scripts/context-bus.sh --pull <wave>
   ```
4. **生成给下游工具的无缝提示词注入块（Prompt Block）**：
   ```bash
   bash scripts/context-bus.sh --prompt <wave> --target-agent <agent>
   ```

---

## 4. 与派单脚本联动 (`scripts/dispatch-local-employee.sh`)

派单脚本新增参数：
- `--inherit-context`：自动读取当前波次的最新 Context Bus，将上游工具的执行结论、产出 commit、修改文件及交接嘱托自动注入到下游工具的 Markdown Prompt 中。
- 派单完成（无论是本地 execute 还是外部 execute 回调）时，自动触发 Context Bus 状态跃迁，完成上下文链路的无缝衔接。
