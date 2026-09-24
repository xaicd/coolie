# Coolie h5 web CHANGELOG

Coolie h5 web 镜像（浏览器端，跟 Coolie工坊 App 同 API）版本流水。

> 溯源自 wave37 变更规范补全（2026-09-22）。此前 h5 web 没有 CHANGELOG。

---

## 0.6.3 (2026-09-24)

- BoardChatScreen 删 mock: SEED_MESSAGES / CANNED_REPLY 全删, 改真接口 (coolie.getBoardChatHistory + coolie.streamBoardChat SSE), 未选公司/失败如实显示空态/错误 (boss 25:15 '派' wave64 audit P2)

---

## 0.6.2 (2026-09-21) — commit `c25f21354`

- h5 端 TasksScreen（NewTaskDialog 镜像 + IssuesList 6 视图切换）
- h5 镜像 + 17 字段 ComposeScreen（wave24 / wave26）
- h5 镜像 + 新建任务 modal（wave30）
- h5 端 keyboardShouldPersistTaps（wave29）

---

## 0.5.0 (2026-09-20) — commit `608de91a9`

- 初版 h5 web 镜像（Coolie工坊 App + 浏览器）
