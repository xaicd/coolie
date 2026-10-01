# wave238 plan: agy 画原生 App 本体插件 5 屏 ASCII 草图

> 计划日期: 2026-10-01
> 执行人: PM Claude (3.7 Sonnet)
> 状态: ✅ 已完成 / 等老板拍板 → wave239 派大活抄

## 背景

老板原话: "原生本体功能仿 web 本体插件, 做得如何了, 是否要先 agy 画原型"

PM 反讲 c 选项: 先 agy 画原型, 再派大活抄.

## 范围

- 只生成 docs, 不动代码
- 5 屏 ASCII 草图 (60 字符宽 x 40 行高)
- 不动 server / ui / clients/expo
- 不动 wave235 已抄的 5 屏
- 不动 wave237 修的 3 端点

## 5 屏清单

1. `OntologyDomainListScreen` (类型级图谱) — P1
2. `OntologyInstanceGraphScreen` (实例级图谱) — P2
3. `OntologySchemaEditorScreen` (属性编辑) — P1
4. `OntologyGraphWorkbenchScreen` (图谱工作台) — P3
5. `PluginManagerScreen` (插件管理) — P2

## 执行步骤

| 步骤 | 操作 | 结果 |
|---|---|---|
| 1 | 检查 agy 容器 | ✅ `agy-ubuntu-container` running |
| 2 | 准备 5 屏 prompt (~5 KiB) | ✅ `/tmp/agy-prompt.txt` |
| 3 | `docker exec agy-ubuntu-container bash -c "agy -p ..."` | ✅ exit 0, 374 行, 31 KiB |
| 4 | 复制 agy 输出到 `docs-coolie/evidence/wave238/agy-raw-output.md` | ✅ |
| 5 | PM 整理稿: `docs-coolie/prototypes/2026-10-01-app-ontology-5-screens.md` | ✅ |
| 6 | 运行日志: `docs-coolie/evidence/wave238/agy-prototypes.log` | ✅ |
| 7 | QA 自查: `docs-coolie/evidence/wave238/QA-REPORT.md` | ✅ |

## 输出

| 文件 | 用途 |
|---|---|
| `docs-coolie/prototypes/2026-10-01-app-ontology-5-screens.md` | 老板拍板入口 |
| `docs-coolie/evidence/wave238/agy-raw-output.md` | agy 原文 |
| `docs-coolie/evidence/wave238/agy-prototypes.log` | 运行日志 |
| `docs-coolie/evidence/wave238/QA-REPORT.md` | QA 自查报告 |
| `doc/plans/2026-10-01-wave238-app-ontology-prototypes.md` | 本计划 |

## 拍板重点

- 屏 4 (工作台) + 屏 2 (实例图谱)
- 抛弃 `react-native-force-graph` 后改用 Dagre/SVG 确定性分层几何布局
- web 鼠标滚轮 + 键盘快捷键 → 移动端悬浮控制盘 + `react-native-gesture-handler` 双指捏合

## 下一波

wave239 派大活抄代码, 按 P1 → P2 → P3 顺序:
- P1: 屏 1 + 屏 3 (冷启动骨架)
- P2: 屏 2 + 屏 5 (实例 + 插件)
- P3: 屏 4 (工作台攻坚)