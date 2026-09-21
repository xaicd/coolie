# Brief: wave 17 — Usage/Cost 页面 + 语音按钮 (Coolie Web → Coolie工坊 App)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-21 "把 web 页面那个搞过来, 然后加语音按钮"

Boss 拍板: 把 Coolie Web 0.6.2 上的 Usage/Cost 页面套到 Coolie工坊 App + 加语音按钮 (PRD #2 看额度 + PRD #1 语音派发延伸).

## 1. 已知现状 (PM 09-21 真查)

```
✅ Coolie Web 0.6.2 有完整 CostAnalysis + Usage 页面 (paperclip 上游 src/pages/Costs.tsx)
✅ Coolie Web 0.6.2 有 DashboardLive (含车效效率 + 失败率)
✅ Coolie工坊 0.5.7 App 当前 5 tab: 汇览/任务/+/员工/收件箱
❌ Coolie工坊 0.5.7 没真正的"看额度"页 (顶部只有用户徽章 + 任务数)
✅ useRecorder 已接通 dispatchVoice (wave14)
✅ BoardChatScreen 已有 mic 按钮 (🎤 语音派发)
```

## 2. 目标

**Coolie工坊 0.5.8 App** 新增 1 个 "额度" tab (放在员工 / 收件箱 之间) — 套壳 Coolie Web Usage/CostAnalysis 页面 + 加语音按钮 (👆 语音查"我这个月花了多少").

## 3. 任务 (5 步)

### 3.1 抄 Coolie Web Usage/Cost 页到 App

读 `ui/src/pages/Costs.tsx` + `ui/src/pages/Costs.production.tsx` + 相关 hook (`useCosts` 等), 把数据请求 + 卡片 UI 移植到 App 端:

新建 `clients/expo/src/screens/CostsScreen.tsx` (镜像 h5 端):

```
- 顶部: 标题 "额度消耗" + 时间范围切换器 (7天/30天/90天)
- 卡片 1: "本月已用" / "本月配额" / 进度条 (%)
- 卡片 2: 按 Adapter 分组 (hermes-gateway / claude-local / dsh / acpx_local 等)
- 卡片 3: 按 Agent 分组 (5 角色: fda / core-swe / pre-sre / fdse / ds)
- 卡片 4: 成本趋势曲线 (最近 30 天)
```

新建 `clients/h5/src/screens/CostsScreen.tsx` (镜像 expo):
- 同样 4 卡片布局
- 用 h5 的 ECharts 或 react-native-svg-charts (App) 画曲线

### 3.2 server 提供 /api/usage 端点

如果 server 没有 `/api/usage` 或 `/api/companies/:id/usage`, 加 1 个:

```ts
// server/src/routes/usage.ts
GET /api/companies/:id/usage?days=30
→ { total: { tokens: 123456, cost: 1.23 }, byAdapter: [...], byAgent: [...], trend: [{date, tokens, cost}, ...] }
```

数据来源:
- 公司 agent_runs 表 (如存在) → 聚合 token + cost
- 公司 adapter_usage 表 (如存在) → 聚合
- 用 `token + cost` 字段 (paperclip 上游应该有)

### 3.3 加语音按钮到 CostsScreen

在 CostsScreen 右上 toolbar 加 mic icon (跟 BoardChatScreen 一样):
- 点 mic → 录音 → POST `/api/multimodal/transcriptions` mode=query → transcribed text
- 转 ChatHome + 创建 issue: "查询 8 月的 token 用量" → ChatHome 派活回答
- 或更直接: 调用 `/api/usage?query=<text>` server 解析意图 → 直接返

**简化**: voice button 直接 dispatch 到 ChatHome 带 transcribed text, 让 ChatHome 派活回答 (复用现有 voice dispatch 链路).

### 3.4 加 tab 到 BottomTabBar

`clients/expo/src/components/BottomTabBar.tsx` 加 1 个 tab:

```
原 5 tab: 汇览 / 任务 / + / 员工 / 收件箱
新 6 tab: 汇览 / 任务 / + / 额度 / 员工 / 收件箱
```

底部 tab 6 排有点挤, 可以把 [+] 中央按钮挪到 "新建" 浮窗 / 或 6 tab 自适应 (让 [额度] 占用 + 后面的位置).

### 3.5 模拟器验证

```bash
# 1. 装 0.5.8 APK (bump from 0.5.7)
# 2. 启动 → 底部 tab 看到 6 个 (含 [额度])
# 3. 点 [额度] → CostsScreen 渲染 4 卡片
# 4. 点 mic → 录音 3s → transcribed text "我这个月花了多少"
# 5. ChatHome 派活回答 (issue 创建 + agent 执行)
# 6. 截图入 /tmp/emu-evidence/wave17-0.5.8/
```

## 4. Constraints

- ❌ DON'T bump 0.5.7 → 0.5.8 (要 bump, 因为新增 tab + 端点 = 新版本)
- ❌ DON'T 重新做整套 Usage (用上游已有的逻辑)
- ❌ DON'T touch paperclip 上游 (ui/) - 只读
- ✅ DO 用上游 src/pages/Costs.tsx 作 reference, 移植到 App + h5
- ✅ DO 加 server /api/usage 端点 (如不存在)

## 5. Don't do

- ❌ Don't 假装 Usage 数据从 0 起步 — 必须真从 server 聚合 (即使空, 显示 "暂无数据" 也行)
- ❌ Don't 把 CostsScreen 做成 modal — 做成 tab 页 (常驻可看)

## 6. Done definition

5 步全完 + 0.5.8 APK 真打包 + 模拟器验证 (装 + 启动 + 进 CostsScreen + 4 卡片渲染 + 录音派活) + commit + push + 发版 + 上 COS + 装机直链给老板.