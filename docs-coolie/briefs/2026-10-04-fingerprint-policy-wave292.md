# Brief: wave292 — runtimeVersion 政策 appVersion → fingerprint (老板永远不再手装 APK)

**Wave**: wave292
**Date**: 2026-10-04 00:30 CST
**PM**: Hermes (hermes-pm)
**触发**: 老板 10-04 原话「我 app 没有提示升级，总要解决的，为啥经常这样」→ 「B. 改 appVersion → fingerprint 政策」

---

## A. 项目核心信息 (5 秒读完)

| 项 | 值 |
|---|---|
| 项目 | Coolie (paperclip fork) |
| 仓库 | `/Users/mac/workspace/xaicd/coolie` |
| 主分支 | `main` (HEAD `8fdecf24c`) |
| 真值源 | `docs-coolie/EMPLOYEE-OBJECTS.md` + `TOOLS.md` |

---

## B. 背景 / 真因 (PM FDA 视角)

### B.1 老板「经常这样」的真因
- **runtimeVersion policy = `appVersion`** —— OTA 只能跟同一 minor 版本号增量
- **0.6.10 → 0.6.25 = 不同 runtimeVersion** → OTA manifest 拒绝 → 用户必须手装新 APK
- **每次 minor 升级都要手装** —— 老板之前手装过 v0.6.24 + v0.6.25 = 2 次

### B.2 修法 (B 方案)
- 改 `app.json` `expo.runtimeVersion.policy` 从 `appVersion` → `fingerprint`
- **fingerprint 政策**：runtimeVersion 由 native binary 内容 hash 决定，**同一 native binary 跨任意 JS 版本都能 OTA**
- **效果**：老板装一次 v0.6.26，**以后所有 v0.6.x.x OTA 自动拉**

### B.3 一次性代价
- 老板需**装一次 v0.6.26**（fingerpint 不同，必须重建
- 装完之后**所有后续 v0.6.27 / 0.6.28 都走 OTA**，不再手装

---

## C. 目标 (Scope) — 3 件套

| ID | 内容 | 责任人 | 工具 | 优先级 |
|---|---|---|---|---|
| C-1 | 改 `clients/expo/app.json` `expo.runtimeVersion.policy` 从 `appVersion` → `fingerprint` | 铁匠贰号 | claude-mm | 🔴 P0 |
| C-2 | 验证 expo-updates fingerprint 政策兼容 (查 docs.expo.dev/versions/latest/sdk/updates/) | 铁匠贰号 | claude-mm | 🔴 P0 |
| C-3 | **发 v0.6.26**（带 fingerprint 政策）+ coscli + server deploy + 4 护栏 + tag push | 铁匠贰号 | claude-mm | 🔴 P0 |

---

## D. 不要做 (Out of Scope)

- **不动** server / scripts / wave285-291 commit
- **不动** 7 工具池 / AGENT_ROLES enum / dispatch / context-bus
- **不动** 现有 v0.6.24 / v0.6.25 tag
- **不动** 墨斗 wave290-proto 原型实现（没在 v0.6.25 里）

---

## E. 验收 (Acceptance)

### E.1 修改 (C-1)
- `clients/expo/app.json` `expo.runtimeVersion.policy` = `"fingerprint"`
- 4 源版本号 (`app.json.version` / `app.json.android.versionCode` / `package.json.version` / `app/build.gradle` versionName + versionCode) 不变 (v0.6.26 bump)

### E.2 Expo Updates 兼容 (C-2)
- Expo SDK 版本支持 fingerprint（默认 SDK 50+ 支持，调研确认）
- 本机 dev 跑通 `npx expo install expo-updates` 不报错

### E.3 发版 (C-3)
- `bash scripts/release-app.sh 0.6.26 "..." --with-server-deploy --with-4-guard` 全绿
- 远端 OTA manifest runtimeVersion 是 **fingerprint hash**（如 `5a4b3c2d1e...`）
- tag v0.6.26 推 origin
- 4 护栏: version.json / ota/manifest / apk-head / api/health 全 PASS

---

## F. 派工 (Dispatch)

| 员工 | 任务 | 工具 | brief |
|---|---|---|---|
| **铁匠贰号 (Forge II)** `forge-ii-core-swe` | C-1 + C-2 + C-3 全跑 | claude-mm | 本 brief |

---

## G. 不要顺手改

- 不动 7 工具池配置
- 不动 AGENT_ROLES enum / ROLE_MAPPING
- 不动 sub-agent `.md` 中的「排他约束」

---

## H. QA (门禁)

- G1 FDA: 不需要（不发 spec）
- G2 Core SWE: 铁匠贰号 code + 发版, `pnpm -r typecheck` 0 errors
- G5 PRE-SRE: release-app.sh 4 护栏全绿 + tag push origin
- **不发 APK 让老消费者** —— 老板装 v0.6.26 后，OTA 自动拉后续

---

## I. 一次性老板动作

**装一次 v0.6.26 APK**（最后一次性，之后 OTA）：
```
https://dls.xrobinai.cn/coolie/app/0.6.26/coolie-release.apk
```

装完之后所有 v0.6.27/0.6.28 都自动 OTA 拉，无需手装。

---

## J. PM 反讲 (Compact)

```
【compact ·00:30 ·wave292】
老板: 改 appVersion → fingerprint 政策, 永远不再手装
派: 铁匠贰号 wave292 (claude-mm) 一次性改 + 发 v0.6.26
理由: 每次 minor 升级都手装 = 老板长期痛点, fingerprint 政策让 OTA 跨 minor 自动拉
不动: v0.6.25 tag / server / wave290-proto / dispatch
老板动作: 装一次 v0.6.26 APK (最后一次性)
```