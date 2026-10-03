# wave272 QA 报告 — 7 工具池真配 + 墨斗画原型

> **老板原话** (2026-10-02):
> 1. "agy-gemini3.8 与 claude-mm, claude-glm, cmd, copilot, Hermes, kiro-cli 一样都是工具"
> 2. "谁负责原型" → "a" = 墨斗 (FDA 匠人) 用 agy-gemini3.8
>
> **3 文件交付** (push 前置检查已过):
> - `docs-coolie/TOOLS.md` (新增, 7 工具池说明)
> - `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` (§10.2 改 + §11 新增)
> - `scripts/which-tool.sh` (新增, PM 选工具 CLI)

---

## 1. 文档完整性

### 1.1 docs-coolie/TOOLS.md ✅

- ✅ §1 6 老板团队表 (Hermes / 墨斗 / 铁匠 / 铁匠贰号 / 门神 / 兑底渊 / 百晓生, 7 人)
- ✅ §2 7 工具池表 (agy-gemini3.8 / claude-mm / claude-glm / cmd / copilot / Hermes / kiro-cli)
- ✅ §3 6 老板团队 × 7 工具池 真配矩阵 (wave272 拍板)
- ✅ §4 PM 派活工具池 SOP (含派活模板)
- ✅ §5 与其他文档的关系 (不动约束)
- ✅ §6 出处 + 变更摘要 (走完整)

### 1.2 docs-coolie/CMMI-EMPLOYEE-MAPPING.md ✅

- ✅ §10.2 工具列同步 wave272 真配 (kiro-cli / agy-gemini3.8 / claude-glm / claude-mm / cmd / copilot)
- ✅ §11 整章新增 (7 工具池 + 画原型模板 + 变更与不动 + 出处)
- ✅ 旧章节 (§1-§10) 内容不动

### 1.3 scripts/which-tool.sh ✅

- ✅ `--help` 帮助 (`scripts/which-tool.sh --help`)
- ✅ 7 工具池列表 (`scripts/which-tool.sh`)
- ✅ 单工具查询 (`scripts/which-tool.sh agy-gemini3.8`)
- ✅ 单员工查询 (`scripts/which-tool.sh 墨斗`)
- ✅ CLI 可执行性检查 (`scripts/which-tool.sh check`)
- ✅ 已 chmod +x, 可直接跑

---

## 2. 6 老板团队工具配真表 (wave272 拍板)

| 员工 | 默认工具 | 兜底工具 | 备注 |
|---|---|---|---|
| **Hermes (PM)** | **kiro-cli** | - | PM 调度 / 验收 / 报告 (wave272 拍板, 老板原话 "Hermes 也是工具") |
| **墨斗 (FDA)** | **agy-gemini3.8** | cmd (紧急) | 画原型 / 选型 / 研判 / 文档 (老板原话 "谁负责原型 → a = 墨斗 用 agy-gemini3.8") |
| **铁匠 (Core SWE)** | **claude-glm** | claude-mm (= 铁匠贰号) | 代码开发主力 (wave272 恢复 wave234 之前状态, 老板原话) |
| **铁匠贰号 (Core SWE 副)** | **claude-mm** | - | 铁匠兜底, wave272 命名 (同 `core-swe` 角色换工具, 不是新增员工) |
| **门神 (FDSE)** | **cmd (`@commandcode/ai`)** | - | 跑命令 / 派活 / 自动化 (wave229 沿用, wave272 拍板) |
| **兑底渊 (PRE-SRE)** | **copilot** | claude-mm (按量) | 部署 / 运维 / 监控 / 应急 (wave272 拍板, 替换 wave236 cmd) |
| **百晓生 (DS)** | claude-mm | claude-glm (老板备用) | 责任重大 (wave227 沿用, 工具不变) |

---

## 3. scripts/which-tool.sh 跑通测试

### 3.1 列全表

```
$ bash scripts/which-tool.sh

═══ 7 工具池 (wave272 拍板) ═══
#   工具          默认员工                   状态       可执行 (which)
----------------------------------------------------------------
1.  agy-gemini3.8   墨斗 (FDA)                   ✅ 主线   (未安装)
2.  claude-mm       铁匠贰号 (Core SWE 副)    ✅ 主线   (未安装)
3.  claude-glm      铁匠 (Core SWE)              ✅ 主线   (未安装)
4.  cmd             门神 (FDSE)                  ✅ 主线   /opt/homebrew/bin/cmd
5.  copilot         兑底渊 (PRE-SRE)            ⚠️ 限制 /opt/homebrew/bin/copilot
6.  Hermes          Hermes (PM, 人即工具)      ✅ 主线   /Users/mac/.local/bin/hermes
7.  kiro-cli        Hermes (PM 工具)             ✅ 主线   /Users/mac/.local/bin/kiro-cli

═══ 6 老板团队 × 7 工具池 真配矩阵 (wave272) ═══
员工       默认工具    兜底工具
----------------------------------------
Hermes       kiro-cli        -
墨斗       agy-gemini3.8   cmd
铁匠       claude-glm      claude-mm
铁匠贰号 claude-mm       -
门神       cmd             -
兑底渊    copilot         claude-mm
百晓生    claude-mm       claude-glm
```

### 3.2 工具查询

```
$ bash scripts/which-tool.sh agy-gemini3.8
工具: agy-gemini3.8
  默认员工: 墨斗 (FDA)
  状态: ✅ 主线
```

### 3.3 员工查询

```
$ bash scripts/which-tool.sh 墨斗
员工: 墨斗
  默认工具: agy-gemini3.8
  兜底工具: cmd
```

### 3.4 可执行性

```
$ bash scripts/which-tool.sh check
== 7 工具 CLI 可执行性 (which) ==
  ❌ agy-gemini3.8   (未安装)
  ❌ claude-mm       (未安装)
  ❌ claude-glm      (未安装)
  ✅ cmd             /opt/homebrew/bin/cmd
  ✅ copilot         /opt/homebrew/bin/copilot
  ✅ Hermes          /Users/mac/.local/bin/Hermes
  ✅ kiro-cli        /Users/mac/.local/bin/kiro-cli
通过: 4 / 7
```

注: agy-gemini3.8 / claude-mm / claude-glm 不走 CLI, 走 API/SDK 调用 (按量付费),
不是 PATH 二进制; `check` 仅检查 PATH 二进制存在性, 这是预期结果 (API 工具没有 PATH).

---

## 4. 发版检查

### 4.1 push 前置

- [x] 不发 APK (纯文档 + 脚本)
- [x] push 3 文件 (`TOOLS.md` + `CMMI-EMPLOYEE-MAPPING.md` + `which-tool.sh`)
- [x] 不动 server (无 server 改动)
- [x] 不动 App (无 App 改动)
- [x] 不动 v0.6.20 tag
- [x] 不动 wave270/271 (纯审计, 已发版)
- [x] 不动 wave254/258/261/262/264/266 (已发版)

### 4.2 fork-surface 同步

> 本波仅 ADDS 文档 (`TOOLS.md`) + 改 1 文档 (`CMMI-EMPLOYEE-MAPPING.md` §10.2 + 新增 §11) + 新增 1 脚本
> (`scripts/which-tool.sh`). 不动 server / App / 任何已发版的 wave.
>
> `scripts/which-tool.sh` 是仓库版的服务 (PM 选工具 CLI), 不需要进 fork-surface 清单 (本波不动外部脚本,
> 仅在 `scripts/` 下新增一个本地 CLI).

### 4.3 不动约束

- ✅ `TEAM-MAPPING.md` (wave225/wave234/wave236) — 不动
- ✅ `TOOL-USAGE.md` (wave228 MCP 装载) — 不动
- ✅ `ROLE_MAPPING` / `AGENT_ROLES` — 不动 (5 角色不变)
- ✅ `server/src/services/agent-assign.ts` — 不动
- ✅ §1 5 阶段 × 25 任务表 (CMMI 主员工不变) — 不动
- ✅ `wave234` / `wave236` 章节(历史) — 内容不动, 标 ✅ wave272 反向引用为 "工具切换前置 wave"

---

## 5. 7 工具 × 6 老板团队 一一映射验证

| 工具 | 6 老板团队真配 (wave272) | 之前 wave | 备注 |
|---|---|---|---|
| **agy-gemini3.8** | 墨斗 (主线, 画原型) | wave236 agy 沿用 | 老板原话 "谁负责原型 → a = 墨斗 用 agy-gemini3.8" |
| **claude-mm** | 铁匠贰号 (主线, 兜底) + 百晓生备用 | wave234 起百晓生主线 | wave272 铁匠贰号 = claude-mm 命名 |
| **claude-glm** | 铁匠 (主线, 代码开发主力) + 百晓生备用 | wave234 退出铁匠主线 | wave272 恢复 claude-glm (老板原话) |
| **cmd** | 门神 (主线, 自动化) | wave229 沿用 | wave272 拍板门神 = cmd (老板不亲自跑) |
| **copilot** | 兑底渊 (主线, 部署/运维) | wave234 百晓生限 | wave272 拍板兑底渊 = copilot (替换 wave236 cmd) |
| **Hermes** | Hermes (PM, 人即工具) | (新增) | wave272 老板原话 "Hermes 也是工具" |
| **kiro-cli** | Hermes (PM 调度工具) | (新增) | wave272 老板原话 7 工具之一 |

每工具都映射到默认员工 (除百晓生 2 工具共用), 不空缺.

---

## 6. 总结

- ✅ 文档完整 (`docs-coolie/TOOLS.md`)
- ✅ 6 老板团队工具配真表 (CMMI §11.2)
- ✅ `scripts/which-tool.sh` 跑通 (列全表 / 工具查询 / 员工查询 / 可执行性)
- ✅ 不动约束全保 (server / App / 已发版 wave / 算法层)
- ✅ 7 工具池 + 6 老板团队 一一映射验证通过

**本波质量: A** (老板拍板 7 工具池独立成文档, PM 派活工具有 SOP + CLI 工具)

**下一步**:
- 老板拍板后, PM 用 wave272 模板派画原型活 ("墨斗, 用 agy-gemini3.8 画原型")
- 墨斗 agy 真跑画原型 → 输出 `docs-coolie/prototypes/<YYYY-MM-DD>-<slug>.md` → 上传 Paperclip artifact

---

## 7. 出处

- 老板原话: brief wave272 (2026-10-02, 3 条)
  1. "agy-gemini3.8 与 claude-mm, claude-glm, cmd, copilot, Hermes, kiro-cli 一样都是工具"
  2. "谁负责原型" → "a" = 墨斗 (FDA 匠人) 用 agy-gemini3.8
- 上游: `TEAM-MAPPING.md` (wave225 + wave236); `CMMI-EMPLOYEE-MAPPING.md` (wave222 + wave234 + wave236 + wave258)
- 工具池文档: `docs-coolie/TOOLS.md` (本波新增)
- 选工具 CLI: `scripts/which-tool.sh` (本波新增, bash, 无依赖)