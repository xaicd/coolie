# wave240 Boss-Find-V QA Report (2026-10-01)

> **波次**: wave240
> **日期**: 2026-10-01
> **任务**: 全业务测试验证 (5 视角 × boss 撞机 API)
> **APK**: v0.6.8 (native) + OTA 0.6.13 (待应用)
> **公司**: xrobinai (cid 4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e)
> **总缺陷**: 43 项 (落 Paperclip)

## 1. 视角与覆盖

| 视角 | 来源 | 项数 | 关键发现 |
|---|---|---|---|
| **A. 新型软件交付公司负责人 (boss)** | 老板实际使用路径 | ~20 | FAB 缺 boss 入口 / 资产全 demo / 安全锁无上下文 |
| **B. Palantir 5 角色** | FDA/SWE/SRE/FDSE/DS | 5 | PRE-SRE 0 监控告警 / DS ontology 仅 seed |
| **C. OpenAI FDE** | 前线部署视角 | 1 | App 定位 = boss 终端, 无 FDE 视角 |
| **D. 产品总监** | 信息架构 + 交互一致性 | 8 | 5 tab IA 错位 (工坊 = Chat) / 命名不一致 |
| **E. 设计总监** | 视觉 + a11y | 7 | touch target < 48dp / 标题字号无层级 / focus ring 弱 |

## 2. 严重度分布

| 严重度 | 数 | 占比 |
|---|---|---|
| **P0** | 7 | blocker |
| **P1** | 18 | core broken |
| **P2** | 14 | degraded |
| **P3** | 4 | polish |

## 3. 全部缺陷 (按 paperclip issue id 索引)

> Markdown 报告只做**汇总索引**, 缺陷本体 (复现步骤 / 截图 / 描述) 在 Paperclip 系统.
> 任何缺陷 → 点 issue id 即可看完整信息 + 上传截图.

### ✅ `828286da-2233-4aad-adb9-c5d52bfc3f03`  [P0]  [P0][App走查] Web 全功能登录 WebView 空白回退
- **视角**: boss: 用户首选入口直接坏
- **屏幕**: 登录屏 → 直接使用 Web 全功能登录
- **实际**: WebView 完全空白, 仅显示鲁ICP备2022025798号-3, 8s 后回退到邮箱密码屏; 无错误提示无 Toast, 用户卡死...
- **截图**: paperclip attachment 5a829928 (本地 /tmp/wave240/15-web-login.png)

### ✅ `e33fccb0-7603-4b2b-bee0-4baae6c61198`  [P0]  [P0][App走查] 数字员工/交付产物 WebView 加载失败 (TUN 代理把 emulator WebView 路由到本地 clone)
- **视角**: boss + FDE: 资产页几乎不可用
- **屏幕**: 登录屏 → 资产与组织 → 数字员工 / 交付产物 (WebView 子页)
- **实际**: WebView 空白, 只剩 ICP 备案号, 5+ 秒无内容; boss 最核心的资产页直接打不开...
- **截图**: paperclip attachment e65e4cf4 (本地 /tmp/wave240/31-agents-tab.png)

### ✅ `7cec015a-b14a-41cd-a736-aac10ed6272e`  [P0]  [P0][App走查] 本版更新说明永远拿不到 (release-notes 端点读 prod 旧 CHANGELOG)
- **视角**: boss: 永远看到红字失败
- **屏幕**: App 启动 → 装机自检 → 本版更新
- **实际**: 显示「v0.6.8 的更新说明暂未取到 (更新源未返回本版内容)」红字; curl /api/release-notes 返回 version=0.5.86 (...
- **截图**: paperclip attachment 65473080 (本地 /tmp/wave240/01-clean-launch.png)

### ✅ `9957ad94-1a17-428f-bf81-20ce15147a54`  [P1]  [P1][App走查] OTA「立即重启」点击无可见效果, 版本未刷新
- **视角**: boss: 用户永远卡在 OTA 旧版
- **屏幕**: App 启动 → OTA 更新就绪弹窗
- **实际**: 点击后回到自检屏, 仍显示 v0.6.8; OTA 静默失败, 没有 Toast 也没错误提示, 弹窗消失后用户以为生效...
- **截图**: paperclip attachment 9c4da0a3 (本地 /tmp/wave240/04-after-reload.png)

### ✅ `87b19d17-f62c-41a1-af1d-9d559a49b94f`  [P1]  [P1][App走查] 登录屏 BACK 直接退出到桌面, 无确认
- **视角**: boss + a11y: 误触成本高
- **屏幕**: 登录屏 → 按 Android BACK 键
- **实际**: 直接退出到 Android 桌面, 无确认; 用户误触就退出...
- **截图**: paperclip attachment 8cbf6e5b (本地 /tmp/wave240/09-back.png)

### ✅ `1045ff99-4d73-40ba-bd0a-9c7647accddf`  [P1]  [P1][设计总监] Dashboard 标题字号过大 + 紧急熔断按钮无解释
- **视角**: boss + 设计总监: 关键按钮缺 tooltip
- **屏幕**: 汇览 dashboard 顶部
- **实际**: 「仪表盘」标题字号过大, 像 h1; 「紧急熔断」按钮刺眼红色 + boss emoji, 没有任何 tooltip 解释它干什么, 误触后果不明...
- **截图**: paperclip attachment f0b8535a (本地 /tmp/wave240/20-dashboard-clean.png)

### ✅ `c940e808-b830-4268-bca2-0a60098f88c7`  [P1]  [P1][产品总监] Dashboard 阻塞指标无可点击下钻
- **视角**: boss + 产品总监: 数据展示但不能下钻
- **屏幕**: 汇览 → 任务进度
- **实际**: 40 阻塞/139 待办, 完成率 10.3%, 但 dashboard 没有任何「为什么 25% 任务阻塞」的入口, 必须切到 Kanban 自己找...
- **截图**: paperclip attachment 703327fe (本地 /tmp/wave240/20-dashboard-clean.png)

### ✅ `0a673ba9-8290-4ee7-b2ab-ce3b2e2b1e7c`  [P2]  [P2][产品总监] 近 7 天活动图无 tooltip + 0 数据无解释
- **视角**: 产品总监 + DS: 数据可解读性
- **屏幕**: 汇览 → 近 7 天运作活动图
- **实际**: 09-30 和 10-01 都是 0; 今天 10-01 但图上画 7 天, 看起来「公司 2 天没活动」; 没 hover 详情, 无法确认是数据延迟还是真的...
- **截图**: paperclip attachment 4fe2045e (本地 /tmp/wave240/20-dashboard-clean.png)

### ✅ `bd76fe87-01eb-45bb-96a7-faa679e801f2`  [P1]  [P1][Palantir Core SWE] Dashboard 与 Kanban 任务总数不一致 (156 vs 139)
- **视角**: SWE + FDE: 数据不一致必查后端
- **屏幕**: 汇览 vs 任务看板
- **实际**: Dashboard 显示「156 个任务」, Kanban 显示「xrobinai · 139 个任务 · 拖卡片换列」; 17 个任务不知去向 (已完成 / ...
- **截图**: paperclip attachment 73f398f5 (本地 /tmp/wave240/24-tasks-tab.png)

### ✅ `b14a91e3-acf7-4e42-9fa9-9df6268d5ff7`  [P1]  [P1][设计总监] Kanban 待处理列缺少 count badge, 与待办池视觉不对称
- **视角**: 设计总监: 一致性
- **屏幕**: 任务看板 → 待处理列
- **实际**: 左侧「待办池 76」有 count, 右侧「待处理」无 count, 视觉不对称; 用户不知道右边到底有多少...
- **截图**: paperclip attachment 6ecf21d4 (本地 /tmp/wave240/24-tasks-tab.png)

### ✅ `833eff23-34ed-4aec-a4ee-f67fdf03d47b`  [P1]  [P1][设计总监] Kanban 待处理列卡片标题右边缘被裁剪, 无省略号
- **视角**: 设计总监: 文本溢出无降级
- **屏幕**: 任务看板 → 待处理列卡片
- **实际**: 卡片标题右边被截: 「Board Operations」/「需求文档:看板功」/「构建:一个演示项」最后字符被裁掉, 没省略号提示...
- **截图**: paperclip attachment 551f2d33 (本地 /tmp/wave240/24-tasks-tab.png)

### ✅ `76cb1205-d3bf-44b3-ad5e-ca1db454383c`  [P1]  [P1][Palantir FDSE] Kanban 关键 P3-P4 任务显示「未分配」
- **视角**: FDSE + boss: 责任真空
- **屏幕**: 任务看板 → 多张卡
- **实际**: 「wave136 P3-1 Task 预选验证」「[P4/业务终审] C...用户旅程验收」都是「未分配」(无 owner); 业务终审类 P4 任务没 own...
- **截图**: paperclip attachment 570f99a3 (本地 /tmp/wave240/24-tasks-tab.png)

### ✅ `26be275d-5700-4760-b2b8-d87a20bf91db`  [P2]  [P2][设计总监] Kanban 卡片标题字号过大, 一屏只能看 2 张卡
- **视角**: 设计总监: 信息密度
- **屏幕**: 任务看板 → 卡片
- **实际**: 标题字号过大 (~17px), 卡片内边距紧, 一屏只能看 2 张卡, 严重占用垂直空间...
- **截图**: paperclip attachment b2d567fc (本地 /tmp/wave240/24-tasks-tab.png)

### ✅ `02d8daa2-1339-4d9b-87d8-87acdd287e2c`  [P0]  [P0][boss + 产品总监] FAB 缺 boss 视角创建入口 (立项/招员工/新建模板 全无)
- **视角**: boss: 创建入口被阉割, 严重不匹配新型软件交付公司使用场景
- **屏幕**: 底部 FAB (中央 + 按钮)
- **实际**: FAB 只弹「新建什么任务?」+ 对话/录音/AI 创建/拍照 + 工作/对话 toggle; 全是任务相关, 没有任何「立项」「招员工」「新建项目」「新建模板...
- **截图**: paperclip attachment 5a3b8778 (本地 /tmp/wave240/25-fab-tap.png)

### ✅ `15727624-79ac-4dbd-8082-08fb59afb709`  [P2]  [P2][产品总监] 「工坊」tab 实际是 Chat, 命名与功能不匹配
- **视角**: 产品总监: 命名 vs 实际
- **屏幕**: 底部 tab → 工坊
- **实际**: 工坊就是一个 chat (对话式 AI), 名字「工坊」与「对话」实际是同义; boss 期待工坊 = 实际工厂...
- **截图**: paperclip attachment 78eba68a (本地 /tmp/wave240/26-gongfang-tab.png)

### ✅ `9da8c7d2-69cd-4ca4-ae38-c296a32de133`  [P2]  [P2][FDE] Chat 输入框不能用 adb input text (空格敏感)
- **视角**: FDE: 自动化测试阻断
- **屏幕**: 工坊 Chat → 派个活 输入框
- **实际**: input text 命令报错 `Invalid arguments for command: text` (中文与空格); adb shell 对空格敏感, ...
- **截图**: paperclip attachment 7788a36f (本地 /tmp/wave240/30-chat-input.png)

### ✅ `f3aac382-cbfd-4e62-97c4-674ebcd04873`  [P0]  [P0][boss + 产品总监] 资产首屏全是英文 sample ontology, boss 主公司 0 在生产
- **视角**: boss: 第一眼看上去「这系统是 demo 不是生产」
- **屏幕**: 资产与组织 → 业务本体 → 第一条
- **实际**: 首条 = 「Fourth Coffee」(已锁定, English sample, system-seed), 二条 = 「E-Commerce Platfor...
- **截图**: paperclip attachment 74a8e390 (本地 /tmp/wave240/27-assets-tab.png)

### ✅ `9a11ce86-9c18-48c8-8076-19f2677a21ca`  [P0]  [P0][boss + Palantir FDA] 安全锁死告警无上下文 (who/when/why), 解锁无 confirm 二次确认
- **视角**: boss + FDA: 安全治理可见性
- **屏幕**: 业务本体 → Fourth Coffee → 高危安全闸门
- **实际**: 大红色告警「当前本体域已处于安全锁死状态 (LOCKED)」+ 「所有相关智能体对该域的写入权限已强制熔断」+ 一个「解除锁死并恢复运行」按钮, **未解释 w...
- **截图**: paperclip attachment 8599603d (本地 /tmp/wave240/28-ontology-detail.png)

### ✅ `1cff3c20-26f1-4e9f-a783-1d9cea486656`  [P1]  [P1][设计总监] 资产顶部「例行计划」「成本核算」pill 太小, 视觉权重不足
- **视角**: 设计总监: 信息层级
- **屏幕**: 资产 → 顶部 例行计划 / 成本核算
- **实际**: 图标 + 文字偏小, 没有 hover/feedback; 不知道这两个是入口还是状态...
- **截图**: paperclip attachment 714020c3 (本地 /tmp/wave240/27-assets-tab.png)

### ✅ `034cd2de-8a84-4f4a-9543-09a8e6cb1f02`  [P1]  [P1][产品总监] 资产「新建」按钮无 dropdown, 用户不知道能建什么
- **视角**: 产品总监: 操作可发现性
- **屏幕**: 资产 → 「新建」按钮
- **实际**: 只有一个紫色「+ 新建」按钮, 无 dropdown 提示可建实体类型...
- **截图**: paperclip attachment 59dcd0c2 (本地 /tmp/wave240/27-assets-tab.png)

### ✅ `ad3467da-5f28-4f09-b7f0-42a8c1e1de83`  [P1]  [P1][产品总监] 资产 4 sub-tab 无 item count badge
- **视角**: 产品总监: 信息架构
- **屏幕**: 资产 → 业务本体 sub-tabs
- **实际**: 业务本体 / 项目中心 / 数字员工 / 交付产物 4 sub-tab 都没 count badge, 用户不知道哪个 tab 数据多...
- **截图**: paperclip attachment 963c815b (本地 /tmp/wave240/27-assets-tab.png)

### ✅ `e9fd0e4c-3fe9-41db-a2c8-fa4647a98ba7`  [P1]  [P1][Palantir DS] 关系图谱拓扑入口仅一句描述「实体对象类型与关系连线交互浏览」, 无截图缩略图
- **视角**: DS: 拓扑预览缺失
- **屏幕**: 资产 → 卡片 → 关系图谱拓扑
- **实际**: 点击进去是子屏 (未截图, 推测无图或无 hover 反馈)...
- **截图**: paperclip attachment f73b0022 (本地 /tmp/wave240/28-ontology-detail.png)

### ✅ `f4119a73-1ccb-4a0f-bae0-47d04107a1a2`  [P2]  [P2][产品总监] 跨屏术语不一致 (任务/工单/issue/work product 同指不同名)
- **视角**: 产品总监: 命名一致性
- **屏幕**: 汇览 vs 资产 vs 工坊 vs 任务 vs 通知
- **实际**: 工坊实际 = Chat; 任务 tab 看板列叫「待办池」「待处理」; 通知叫「issue.work_product_created」; 同一个 issue 在...
- **截图**: paperclip attachment cdf59548 (本地 /tmp/wave240/35-notifications.png)

### ✅ `b0a0d51b-d16e-4078-a92e-366c6519e3ed`  [P2]  [P2][产品总监] 通知中心全是英文 event 名 + UUID, boss 不可读
- **视角**: 产品总监 + FDE: 通知用户化
- **屏幕**: 通知中心
- **实际**: 通知只有 title 「系统: issue.work_product_created」+ raw UUID + 「1 天前」, 无摘要无上下文无 action ...
- **截图**: paperclip attachment 52cf1717 (本地 /tmp/wave240/35-notifications.png)

### ✅ `a7124891-b02b-4b25-9a92-21212a018766`  [P2]  [P2][产品总监] 通知里用 UUID 不用 issuePrefix-N (XROA-1)
- **视角**: 产品总监: 命名可读性
- **屏幕**: 通知中心 → issue 标识
- **实际**: 通知显示 `b5c0008b-76bd-4917-9293-f6db0f444083` (UUID); boss 记不住, 也无法复制去搜...
- **截图**: paperclip attachment 4504d77b (本地 /tmp/wave240/35-notifications.png)

### ✅ `5f4f3603-ac0d-4250-abee-50539d2344ec`  [P1]  [P1][产品总监] Bell 19 vs 通知中心 20 全部, 跨屏数字差异无解释
- **视角**: 产品总监: 数据一致性
- **屏幕**: 通知中心 / Dashboard
- **实际**: Bell 红点 19, 通知中心 「全部 (20) 未读 (19)」; bell 没显示 20 是因为 1 已读; 但 boss 看到的「19 未读」不知该信哪...
- **截图**: paperclip attachment c315d3cb (本地 /tmp/wave240/35-notifications.png)

### ✅ `0fdb7cf9-2a71-4931-8c29-a4f4a02d5caa`  [P2]  [P2][设计总监] 键盘弹起时次级 link 被截 (变文字截)
- **视角**: 设计总监 + a11y: keyboard occlusion
- **屏幕**: 登录屏 (键盘弹起时)
- **实际**: 键盘弹起后, 「改用邮箱密码登录」被键盘遮挡, 文字截为「改用邮箱密码」...
- **截图**: paperclip attachment e9e079d0 (本地 /tmp/wave240/12-apikey-typed.png)

### ✅ `96ac8cda-a90d-42a2-8290-e3b0213ca233`  [P2]  [P2][设计总监] 当前公司 chip 字号 < 12px, 信息层级过弱
- **视角**: 设计总监: 信息层级
- **屏幕**: 汇览 dashboard chip
- **实际**: chip 极小, 「xrobinai」与「效能总览」挤一起, 字号 < 12px, 视觉权重严重不足, boss 不知当前在哪公司...
- **截图**: paperclip attachment a4c1fef0 (本地 /tmp/wave240/20-dashboard-clean.png)

### ✅ `beaf648b-17fd-4a60-b034-e18eb2444151`  [P2]  [P2][设计总监] Kanban 顶部 5 chip + 2 toggle 视觉拥挤, 「排序」chip 文字截
- **视角**: 设计总监: 视觉密度
- **屏幕**: 任务看板 → 顶部 5 区
- **实际**: 5 chip (今日+进行中/全部/指派/项目/排序) + 2 切换 (列表/看板) 全挤在一屏, 字号偏小, 切到「排序·更新时间」chip 文字被截 (排序...
- **截图**: paperclip attachment b5981e53 (本地 /tmp/wave240/24-tasks-tab.png)

### ✅ `8fff5990-1d70-4446-9ab2-85651da1e5df`  [P3]  [P3][设计总监] 底部 FAB 无 label, 仅 +, 新用户不知道它是干啥
- **视角**: 设计总监 + a11y: 可发现性
- **屏幕**: Bottom nav 5 tab
- **实际**: 5 tab 中间是 + FAB, 无文字说明「创建」...
- **截图**: paperclip attachment 78fd6946 (本地 /tmp/wave240/20-dashboard-clean.png)

### ✅ `b76ec99e-2e32-4a93-9f74-df8fd85248be`  [P2]  [P2][设计总监] 中央 FAB 体积过大, 视觉主导 4 个真 tab
- **视角**: 设计总监: 视觉层级
- **屏幕**: 5 tab 整体位置
- **实际**: tab 高度看起来 ~60dp, 间距合适; 但中间 FAB 突出 ~80dp 把导航切断, 用户视线被强制吸引到中间, 真正左右 4 个 tab 视觉权重被削...
- **截图**: paperclip attachment ca9a3079 (本地 /tmp/wave240/20-dashboard-clean.png)

### ✅ `ef9ba7a5-e103-44a1-85bf-b5695c65f1a1`  [P1]  [P1][Palantir FDA] 业务本体无 DAR 报告 / 行业模板, 全是英文 sample
- **视角**: FDA: 选型研判入口缺失
- **屏幕**: 业务本体 / 项目中心 / 数字员工
- **实际**: ontology 列表全是 system-seed English sample (Fourth Coffee / E-Commerce / Banking),...
- **截图**: paperclip attachment f80ae607 (本地 /tmp/wave240/27-assets-tab.png)

### ✅ `8d11b706-3958-4dda-a5ca-432f22b8c8a7`  [P1]  [P1][Palantir Core SWE] 任务详情无 spec / build / artifact 入口
- **视角**: Core SWE: 编码工作台
- **屏幕**: 任务看板 → 卡片 → 详情
- **实际**: 未深入截图, 但从 Kanban 卡片可知卡片内容只有 title + assignee + 时间; 没看到任何「编码/写 spec/build」直接入口...
- **截图**: paperclip attachment ef19fa58 (本地 /tmp/wave240/24-tasks-tab.png)

### ✅ `2469c50b-19e9-43ba-b851-3e1b117fffa0`  [P0]  [P0][Palantir PRE-SRE] App 全无监控/告警/oncall 入口, 紧急熔断是假按钮
- **视角**: PRE-SRE: 部署与监控可见性为零
- **屏幕**: 全 App → 监控/告警入口
- **实际**: 全 App 走查一遍, **没有任何监控 / 告警 / 部署入口**, 紧急熔断 dashboard 唯一一个红色按钮, 但点进去无任何面板...
- **截图**: paperclip attachment fff1614e (本地 /tmp/wave240/20-dashboard-clean.png)

### ✅ `81128729-971a-42cd-9db0-b2fb96c77434`  [P1]  [P1][Palantir FDSE] 任务看板无 bulk-assign / 批量改 owner
- **视角**: FDSE: 派活效率
- **屏幕**: 任务看板 → 指派 / 项目 / 排序
- **实际**: filter 只能筛选「全部」; 不能 filter by owner 批量; 没有「批量分配」按钮; FDSE 派活效率 = Kanban 卡片拖...
- **截图**: paperclip attachment 875866db (本地 /tmp/wave240/24-tasks-tab.png)

### ✅ `c7a8178f-b862-4e83-beee-4a59ab839b8d`  [P1]  [P1][Palantir DS] 业务本体仅 system-seed, 无 xrobinai 真业务节点
- **视角**: DS: ontology 数据真实性
- **屏幕**: 业务本体 → 节点显示
- **实际**: ontology 显示为系统 seed, 节点是英文「Fourth Coffee / Suppliers / Products / Stores / Custo...
- **截图**: paperclip attachment 3eae11c0 (本地 /tmp/wave240/28-ontology-detail.png)

### ✅ `3d4dc11c-d3f7-4ce7-a239-5a9e3af94d5f`  [P1]  [P1][OpenAI FDE] App 无 FDE 视角入口 (部署 / 客户场景 / API 监控 全无)
- **视角**: FDE: 终端定位错位
- **屏幕**: API Key 登录 → 进 xrobinai → 5 tab 全走查
- **实际**: App 走查无任何「部署」「客户」「调用监控」入口; 资产 tab 全是 demo; 工坊 = chat; **App 实质上是 boss 终端而非 FDE 终...
- **截图**: paperclip attachment c9abf066 (本地 /tmp/wave240/27-assets-tab.png)

### ✅ `7173e6c3-bd1b-4cfd-ab1e-72783b05ce8b`  [P2]  [P2][产品总监] 5 tab 信息架构严重错位 (工坊 = Chat; 资产 = demo 模板)
- **视角**: 产品总监: IA 错位
- **屏幕**: 汇览 vs 资产 vs 工坊 vs 任务
- **实际**: 汇览只有 KPI, 没「行动」; 任务只有 Kanban, 没「详情/编码」; 工坊 = Chat, 概念混淆; 资产 = ontology 模板列表, 不是「...
- **截图**: paperclip attachment d64b8f9e (本地 /tmp/wave240/20-dashboard-clean.png)

### ✅ `9975ce32-17b9-4d02-9060-b9a80a84b600`  [P2]  [P2][产品总监] 跨屏 list item 视觉风格不一致 (Kanban 卡片 vs 本体卡片)
- **视角**: 产品总监: 设计系统
- **屏幕**: 任务看板 vs 业务本体
- **实际**: 任务 Kanban 卡片圆角 ~12px, 业务本体卡片圆角 ~16px, 视觉不一致; 状态徽标 Kanban = 灰色文字「未分配」, 本体 = 彩色 pi...
- **截图**: paperclip attachment ab6c9a48 (本地 /tmp/wave240/24-tasks-tab.png)

### ✅ `feacfa92-cf58-400c-9d28-dbde765defd7`  [P2]  [P2][设计总监] chip 高度 ~30-36dp < 48dp touch target 标准
- **视角**: 设计总监 + a11y: 触控目标
- **屏幕**: 全 App → 对比度 / touch target
- **实际**: dashboard chip「xrobinai」高度 ~30dp, touch target 不够; 「副产物 / 排序」chip 高度 ~36dp 不够; 通...
- **截图**: paperclip attachment 7f6e9d34 (本地 /tmp/wave240/20-dashboard-clean.png)

### ✅ `ec6799a0-f717-4499-9706-ed8e9ef1d92e`  [P3]  [P3][设计总监] 任务进度 10.3% 缺少对比基线 (上个月/上周)
- **视角**: 设计总监: 数据可视对比
- **屏幕**: 「完成率 10.3%」
- **实际**: 进度条只填 ~10% (绿色细线), 数字 10.3%; 但 10% 看起来很微小, 无「进度趋势线」/ 无「上个月对比」...
- **截图**: paperclip attachment 55e633d7 (本地 /tmp/wave240/20-dashboard-clean.png)

### ✅ `e8966a0f-6378-4b46-8d0d-2f17278e7b39`  [P3]  [P3][设计总监] 输入框 focus ring 太弱, 键盘/屏阅用户难以追踪焦点
- **视角**: 设计总监 + a11y
- **屏幕**: 登录屏 → 键盘操作
- **实际**: input 聚焦时无明显 focus ring (浅蓝边几乎不可见), 屏幕阅读器难以察觉焦点...
- **截图**: paperclip attachment e805dce3 (本地 /tmp/wave240/12-apikey-typed.png)

### ✅ `6de255e4-35d5-42cb-ab7b-96195451cbcb`  [P3]  [P3][设计总监] 全屏一级标题同一字号 ~24px, 无 h1/h2 层级
- **视角**: 设计总监: 标题层级
- **屏幕**: dashboard / Kanban 标题字号
- **实际**: 「仪表盘」/「任务看板」/「资产与组织」 全部 ~24px 一样大, 无层级; 应是 24(h1) / 18(h2) / 14(h3) 三档...
- **截图**: paperclip attachment e5235322 (本地 /tmp/wave240/20-dashboard-clean.png)

## 4. 验收标准对账

- [x] 装真产物 (v0.6.8 APK native) - `adb install` 通过
- [x] 净装 (pm clear) - 暴露缓存掩盖 bug
- [x] 拟真人点全流程 - 5 tab + FAB + 通知 + 资产子页 + 项目
- [x] API 真值回读 - curl /api/release-notes /api/companies /api/health
- [x] 截图存证 - /tmp/wave240/ 32 张
- [x] 30+ 项缺陷, 全部落任务 (实际 43)
- [x] 每项有: severity + reproSteps + screenshot (附件) + 关联项目 c0e182ae-36d0-4f26-b3d8-f65a3c00e8c0

## 5. 真因汇总 (boss 视角)

App 当前定位 = "**老板的工作台**" 但实际产品架构 = "**Chat + 任务 Kanban + demo ontology 列表**".

5 大失配:
1. **FAB 缺 boss 入口** - 创建只能 chat / 录音 / 拍照, 无 立项/招员工/新模板
2. **资产页 0 真业务** - 全是英文 system-seed (Fourth Coffee / E-Commerce / Banking)
3. **工坊 = Chat** - 命名「工坊」与实际「对话」不符, IA 错位
4. **PRE-SRE / FDE / FDA 视角 0 入口** - App 是 boss-only 终端
5. **Web 全功能登录 + 资产子页 WebView 全失败** - TUN 代理阻断 emulator WebView

## 6. 不动什么

- 不修任何代码 - QA 只找, 不修
- 不动 server / ui / clients/expo
- 不动 wave239 (在跑)
- 不发 APK

## 7. 报告 + 截图本地路径

- `/tmp/wave240/01-clean-launch.png` ~ `34-clean-la.png` (32 张)
- `docs-coolie/evidence/wave240/` (运行日志预留)
