# wave238 QA Report: agy 画原生 App 本体插件 5 屏 ASCII 草图

## 任务
PM 让 agy (墨斗 FDA) 跑原生 App 本体插件 5 屏 ASCII 草图, 老板拍板 (c 选项先 agy 画原型再派大活抄).

## 范围
- 只生成 docs, 不动代码
- 5 屏: DomainList / InstanceGraph / SchemaEditor / GraphWorkbench / PluginManager
- 60 字符宽 x 40 行高 ASCII 草图

## 执行证据

| 项 | 值 |
|---|---|
| 入口 | `docker exec agy-ubuntu-container bash -c "agy -p ... --output-format text"` |
| agy 路径 (容器内) | `/root/.local/bin/agy` |
| 容器 | `agy-ubuntu-container` (chw717/ai-agy:latest-arm64) |
| 启动时间 | `2026-10-01T01:06:14Z` (UTC) |
| 输出文件 | `/tmp/wave238-prototypes.md` |
| 输出行数 | 374 |
| 输出字节 | 32177 (~31 KiB) |
| 屏数 | 5 (DomainList / InstanceGraph / SchemaEditor / GraphWorkbench / PluginManager) |
| 总结段 | 1 (用户故事 + 优先级 + web vs native + 拍板重点) |
| 退出码 | 0 |

详见 [agy-prototypes.log](agy-prototypes.log).

## 验收对账

- [x] agy 真跑了 — `evidence/wave238/agy-prototypes.log` 含 exit_code 0 + 时间戳 + 行数统计
- [x] 5 屏 ASCII 草图都有 — `grep -c "^  屏 " /tmp/wave238-prototypes.md` → 5
- [x] 每屏有 4 段说明 — 关键组件 / 真名 vs UUID / 5 tab 位置 / 中文标注 (人工 spot check 屏 1-5 全部齐全)
- [x] 总结段 — 用户故事 5 步 + 优先级表 P1/P2/P3 + web vs native 拆分 + 老板拍板重点 (屏 4 + 屏 2)
- [x] 范围守住 — git status 显示本次仅新增 docs, 无 server/ui/clients/expo 改动
- [x] 不动 wave235 已抄 5 屏 — git diff 确认无 clients/expo 改动
- [x] 不动 wave237 修 3 端点 — git diff 确认无 server/src/routes/ 改动

## 输出位置

| 文件 | 用途 |
|---|---|
| `docs-coolie/prototypes/2026-10-01-app-ontology-5-screens.md` | PM 整理稿 (老板拍板入口) |
| `docs-coolie/evidence/wave238/agy-raw-output.md` | agy 原始输出 (31 KiB) |
| `docs-coolie/evidence/wave238/agy-prototypes.log` | 运行日志 (含时间戳 + exit_code) |
| `docs-coolie/evidence/wave238/QA-REPORT.md` | 本文件 |

## 报告给老板

老板, 5 屏 ASCII 草图已由 agy (墨斗 FDA) 画完, 见
[`docs-coolie/prototypes/2026-10-01-app-ontology-5-screens.md`](../../prototypes/2026-10-01-app-ontology-5-screens.md).

5 屏串起来的用户故事: 进入本体 → 浏览 6 类型 → 下钻实例 → 长按编辑字段 → 工作台推演 → 插件管理.

**拍板重点: 屏 4 (工作台) + 屏 2 (实例图谱)**
- 抛弃 `react-native-force-graph` 后, 用 Dagre/SVG 确定性分层几何布局, 节点 View + Bezier/Orthogonal 连线, 60fps 拖拽
- web 鼠标滚轮 + 键盘快捷键 → 移动端悬浮控制盘 + `react-native-gesture-handler` 双指捏合

**PM 派大活优先级:**
- P1 (核心骨架): 屏 1 + 屏 3 — 先定数据模型 + 顶层类型 + CRUD
- P2 (业务下钻): 屏 2 + 屏 5 — 实例拓扑 + 员工真名过滤 + 插件开关
- P3 (重型分析): 屏 4 — 工作台最后攻坚

wave239 将派大活抄代码, 等老板拍板.

## 未跑项

- 无需跑测试 (本次纯 docs)
- 无需跑 typecheck (无代码改动)
- 无需跑 build (本次不构建 APK)
- 不发 APK (PM 在 brief 明确 "不发 APK (纯原型文档)")

## 风险

无技术风险. 唯一关注: 屏 4 (工作台) 的"抛弃 force-graph 后确定性布局"是否满足老板对图谱"漂移感"的偏好,
如果老板仍要物理拖拽, 需重新评估技术选型 (react-native-skia 自绘? d3-force 纯 JS?).