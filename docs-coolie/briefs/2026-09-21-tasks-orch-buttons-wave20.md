# Brief: wave 20 — 修 wave18 A 方案 (TasksScreen 顶部 3 按钮组)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-21 22:45 OOB 「修」

Boss 撞 wave18 已发 0.5.8 但 **A 方案 (TasksScreen 顶部 3 按钮组) 实际不在代码里** (门神 wave19 披露). 必须修.

## 1. 已知现状 (门神 wave18 披露 + wave19 复测)

```
✅ wave18 已发 Coolie工坊 0.5.8
❌ TasksScreen 顶部 3 按钮组 [🔨 Build 5步链] [🛤️ Pipeline] [📋 Plan] 不在代码里
✅ B 方案 (BoardChatScreen 智能识别 build/pipeline/plan/pr/chat) 真在 0.5.9
⚠️ 当前 A 方案只在 wave18 brief 3.6 写, 门神 wave18 实施时漏了
```

## 2. 目标

**Coolie工坊 0.5.10 App** TasksScreen 顶部真加 3 按钮组 (跟 brief 3.6 一致):

```
┌────────────────────────────────────────────┐
│ [🔨 Build 5 步链] [🛤️ Pipeline] [📋 Plan]   │
└────────────────────────────────────────────┘
```

每个按钮行为 (跟 brief 3.6.1/3.6.2/3.6.3 一致).

## 3. 任务 (6 步)

### 3.1 找 TasksScreen

读 `clients/expo/src/screens/TasksScreen.tsx` (wave18 新建, 含 IssuesList + Search + 创建按钮).

**真看是不是真在 code 里 (门神 wave19 说"not in the code")**.

### 3.2 在 TasksScreen 顶部加按钮组

```tsx
{/* 编排按钮组 (boss 'app工坊要有这些功能的合适入口') */}
<View style={styles.orchestrationRow}>
  <Pressable
    style={[styles.orchBtn, { borderColor: C.accent }]}
    onPress={() => setShowBuildModal(true)}
  >
    <Text style={styles.orchEmoji}>🔨</Text>
    <Text style={styles.orchLabel}>Build 5 步链</Text>
  </Pressable>
  <Pressable
    style={[styles.orchBtn, { borderColor: C.accent }]}
    onPress={() => navigation.navigate('Pipelines')}
  >
    <Text style={styles.orchEmoji}>🛤️</Text>
    <Text style={styles.orchLabel}>Pipeline</Text>
  </Pressable>
  <Pressable
    style={[styles.orchBtn, { borderColor: C.accent }]}
    onPress={() => navigation.navigate('Plans')}
  >
    <Text style={styles.orchEmoji}>📋</Text>
    <Text style={styles.orchLabel}>Plan</Text>
  </Pressable>
</View>
```

3 个按钮平分顶部宽度 (33.33% each), padding 12px, 紫蓝 accent 边框, emoji + 文字.

### 3.3 Build 5 步链按钮 → BuildModeModal

新建 `clients/expo/src/components/BuildModeModal.tsx`:
- 复用 BoardChatScreen 的 build trigger 形态
- 用户填 "build xxx"
- POST `/api/board/build/start` (server build-orchestrator.ts 已有)
- 弹 BuildProgressCard

### 3.4 Pipeline 按钮 → PipelinesScreen 列表

新建 `clients/expo/src/screens/PipelinesScreen.tsx`:
- 列公司所有 pipelines (`GET /api/pipelines?companyId=X` — paperclip 上游已有, 只要 GET, 不要 POST)
- 每条: 名称 + 阶段数 + 当前状态 (Active/Draft/Archived)
- 顶部 [+] → 跳 Coolie Web `/pipelines/new` (webview / Linking.openURL)
- 点 pipeline → 跳 Coolie Web `/pipelines/:id` (webview)

(注: 创建 pipeline 用 Coolie Web 上游 UI — paperclip 上游有完整 PipelineEditor, 不重发明)

### 3.5 Plan 按钮 → PlansScreen 列表

新建 `clients/expo/src/screens/PlansScreen.tsx`:
- 列当前公司所有 in-progress plan documents
- GET `/api/issues?companyId=X&tags=plan` (or 别的 filter)
- 每条: 标题 + 状态 (Approved/Pending/Rejected)
- 点 plan → 进 PlanDetail (用现有 TaskDetailScreen 重用, 或新建)

### 3.6 镜像到 h5 + 路由

新建 `clients/h5/src/screens/PipelinesScreen.tsx` + `PlansScreen.tsx` (镜像).

App.tsx 加路由:

```
/pipelines → PipelinesScreen
/plans → PlansScreen
```

(PlanDetail 复用 TaskDetailScreen, PipelineDetail 跳 Coolie Web)

## 4. 模拟器验证

```
1. bump 0.5.9 → 0.5.10 (release-app.sh runtimeVersion drift fix from wave16)
2. Build APK + adb install + 启动
3. 进 [任务] tab → 顶部看到 3 按钮组 (真可见, 不空)
4. 点 [🔨 Build 5 步链] → BuildModeModal 弹出 → 填 "build 测试" → BuildProgressCard
5. 点 [🛤️ Pipeline] → PipelinesScreen → 看到列表 (即使空, 显示 '暂无 pipeline')
6. 点 [📋 Plan] → PlansScreen → 看到 plan 列表
7. 截图 /tmp/emu-evidence/wave20-0.5.10/
```

## 5. Constraints

- ❌ DON'T 触碰 paperclip 上游 (ui/)
- ❌ DON'T bump 0.5.9 → 0.5.10 之外的版本
- ✅ DO 让 A 方案真在 code 里 (这次必真)
- ✅ DO 复用 wave19 智能识别的 server 端点

## 6. Done definition

6 步全完 + 0.5.10 APK 装机 + 模拟器验证 3 按钮可见 + 各自响应 + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.10: https://dls.xrobinai.cn/coolie/app/0.5.10/coolie-release.apk
```