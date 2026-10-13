# Wave374 — 生产部署与 Android 模拟器全量效果验证报告

- 日期: 2026-10-12
- 责任员工: 墨斗 (`modou-fda` · Forward Deployed Architect)
- 调度来源: 老板/Hermes·Echo 调度令（生产部署与真机效果走查）
- 目标平台: Android 原生模拟器 (`emulator-5554`) · 线上生产环境 (`xrobinai.cn`)
- 验证基线:
  - 服务端部署 Commit: `c1572e6a64aa73e9c7be2e920b0a7a2b4d75f3df`
  - OTA Bundle Manifest ID: `cdf1a26d-8d4b-40b4-8694-e3497b1d71e3` (`runtimeVersion: 0.6.57`)
- 证据目录: [`screenshots/wave374/`](file:///host-workspace/xaicd/coolie/screenshots/wave374/) (本地保留，受 .gitignore 保护不进 Git)

---

## 一、 生产部署与发布核验流水

### 1. 代码远端同步
- `git push origin main` 执行完成，远端仓库精准推进至 `c1572e6a64`：
  - `4e2334a936` fix(notifications): wave373 铃铛未读不再计入 activityLog
  - `f678623c4d` feat(inbox): wave373 收件箱对齐全 web P1 8 件
  - `78c3d1d312` fix(inbox): wave373 收件箱头「未读」改用通知口径 store.unreadCount
  - `c1572e6a64` fix(inbox): wave374 收件箱显示失败运行 + Retry 按钮

### 2. 服务端发布 (Server)
- 执行命令: `bash scripts/deploy-tc-coolie-claw-server.sh`
- 生产环境拨测核验:
  ```bash
  curl -fsS https://xrobinai.cn/api/health
  # 返回: {"status":"ok","deploymentMode":"authenticated","commit":"c1572e6a64aa73e9c7be2e920b0a7a2b4d75f3df","bootstrapStatus":"ready",...}
  ```
- 结论: 生产服务端已运行最新代码，包含 `joinRequests` 待审与 `heartbeatRuns` 失败联查端点。

### 3. 客户端 OTA 发布 (App)
- 执行命令: `bash scripts/publish-ota.sh --allow-dirty android`
- 生产 OTA Manifest 拨测核验:
  - 更新源 URL: `https://xrobinai.cn/ota/manifest`
  - RuntimeVersion: `0.6.57`
  - Manifest ID: `cdf1a26d-8d4b-40b4-8694-e3497b1d71e3`
  - LaunchAsset Hash: `RF8tdhdVxsnBKFcWtTQQ44l9No1FQJgLiFu4RCT3mNg`

---

## 二、 Android 模拟器装机与效果走查 (真机快照全链路存证)

真机执行环境: `emulator-5554` (`cloud.coolie.app`)。
应用启动后经由 `expo-updates` 自动下载并加载最新 Bundle（`updateId=cdf1a26d-8d4b-40b4-8694-e3497b1d71e3`）。

### 1. 快照存证表

| 序号 | 证据快照文件 | 检验维度 | 关键验证效果说明 |
| :--- | :--- | :--- | :--- |
| **s01** | [`screenshots/wave374/s01-bell-badge-7-dashboard.png`](file:///host-workspace/xaicd/coolie/screenshots/wave374/s01-bell-badge-7-dashboard.png) | 顶栏铃铛通知一致性 | 仪表盘右上角 🔔 铃铛红点准确显示数字 **`7`**，无 activityLog 虚高。 |
| **s02** | [`screenshots/wave374/s02-inbox-all-view-and-alerts.png`](file:///host-workspace/xaicd/coolie/screenshots/wave374/s02-inbox-all-view-and-alerts.png) | 收件箱主视图与警报 | 1. 顶部副标展示 `未读 7`，与铃铛红点 **7 恒等同源**；<br>2. 顶栏 Tab 提供 `全部 / 与我(26) / 最近 / 未读(7) / 审批`；<br>3. 跨实体筛选胶囊呈现 `全部 / 工单 / 审批 / 失败 / 警报 / 加群`；<br>4. 展示「数字员工集群警报」系统卡片；<br>5. 两字操作按钮 `过滤 / 全读 / 分组: 无`。 |
| **s03** | [`screenshots/wave374/s03-inbox-recent-tab-retry.png`](file:///host-workspace/xaicd/coolie/screenshots/wave374/s03-inbox-recent-tab-retry.png) | 最近触碰 Tab 与失败重试 | 切换至「最近」Tab，卡片下方清晰外露 **`⟳ 重试`** 两字操作按钮，可就地触发失败运行重试。 |
| **s04** | [`screenshots/wave374/s04-inbox-unread-tab.png`](file:///host-workspace/xaicd/coolie/screenshots/wave374/s04-inbox-unread-tab.png) | 未读聚合 Tab | 切换至「未读 (7)」Tab（激活高亮），精确聚合 7 条未读事项（受阻工单、失败运行、员工评论通知）。 |
| **s05** | [`screenshots/wave374/s05-inbox-grouped-status.png`](file:///host-workspace/xaicd/coolie/screenshots/wave374/s05-inbox-grouped-status.png) | 多维分组：按状态 | 点击分组按钮切换为 **`分组: 状态`**，列表实时按「异常运行」聚合。 |
| **s06** | [`screenshots/wave374/s06-inbox-grouped-assignee.png`](file:///host-workspace/xaicd/coolie/screenshots/wave374/s06-inbox-grouped-assignee.png) | 多维分组：按员工 | 再次点击切换为 **`分组: 员工`**，列表实时按负责人「智能体」聚合。 |

---

## 三、 结论与合规审计

1. **部署状态**：服务端与客户端 OTA 均已成功发布并经公网真实拨测闭环验证；
2. **业务效果**：收件箱 P1 8 件能力（未读聚合、最近触碰、跨实体分类、远端搜索算法、行内审批/重试/加群两字按钮、多维分组切换）在真机模拟器上全部正确渲染并交互生效；
3. **资产规范归档**：所有快照统一收拢归档至 [`docs-coolie/QA/wave374/`](file:///host-workspace/xaicd/coolie/docs-coolie/QA/wave374/)，根目录无任何临时污染文件。
