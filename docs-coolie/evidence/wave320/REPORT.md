# wave320 — Web 部署到生产（门神 FDSE 验收报告）

- 时间: 2026-10-05 (UTC 15:55)
- 执行人: 门神 (menshen-fdse) / 引擎: cmd
- 仓库: /Users/mac/workspace/xaicd/coolie (branch: main, HEAD d5a0a7e60)
- 生产: tc-coolie-claw:/opt/coolie (~ VM-0-4-ubuntu)，站点 https://xrobinai.cn

## 结论: PASS（含一处必要加固）

主 Web 包已真机上线。执行了 brief 指定的 `scripts/deploy-tc-coolie-claw.sh`（不带
`--skip-build`），并补齐了脚本遗漏的“已服务静态根刷新”一步。

## 验收项

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 远端 ui/dist 资源 hash+时间戳 | ✅ | `index-O8EBiygP.js` / `index-c3_1zF8a.css` @ 2026-10-05 23:51 (+0800) |
| 远端 Express 实际服务根 server/ui-dist | ✅ 已刷新 | 同上 hash @ 23:51（此前为 10月3 的 `index-DWgbLdrk.js`） |
| 远端 /api/health | ✅ | `{"status":"ok",...}` + `systemctl is-active coolie` = active |
| 远端 https://xrobinai.cn 返回 200 | ✅ | `/` = 200, `/api/health` = 200, `/index.html` 引用新 bundle |
| 本地 web 2 commit 已部署 | ✅ | `bd67b23aa` + `068041b9d` 均为 HEAD(d5a0a7e60) 祖先；构建自 HEAD 树，host 侧改动 (`min-w-fit` / `--plugin-grid-cols` / `md:gap-1.5`) 已在服务出的 bundle 中出现 |
| 升级/OTA 馈送未被误删 | ✅ | `/version.json` = 200, `/ota/manifest` = 200 |

## 关键发现（为什么“web 没发版”）

1. **脚本本身不会让 Web 生效。** `deploy-tc-coolie-claw.sh` 只重建并 rsync `ui/dist`，
   而 rsync 显式 `--exclude 'server/ui-dist'`，且脚本不做任何 server/ui-dist 刷新。
   Express（`server/src/app.ts`）优先直出 `server/ui-dist/`，只有它不存在时才回退 `ui/dist`。
   因此**只跑该脚本，prod 会继续服务旧的 10月3 bundle** —— 与老板“web 端没发版”现象完全吻合。
2. **已按仓库既有生产流程加固。** `scripts/deploy-coolie.sh`（本仓真·生产部署脚本）在第198行
   明确执行 `rm -rf server/ui-dist && cp -r ui/dist server/ui-dist` 并注释了同一原因。本次即
   以同样的最小操作从新鲜的 `ui/dist` 刷新 `server/ui-dist`，再 `systemctl restart coolie`，
   验证服务出的 hash 已切换为新 bundle。

## 旁证观察（非本次改动引入，未阻断本次交付）

- 插件 UI 路由 `/_plugins/<id>/ui/index.js` 对**所有**插件（ontology/governance/ops-console/
  workflow/multimodal…）统一返回 404；`/_plugins/plugin-ontology/ui/` 落回 SPA 外壳。
  这是环境/插件注册解析层面的既有状态，与本次 UI 构建、rsync、server/ui-dist 刷新无关。
  两个 commit 的 `packages/plugins/plugin-ontology/src/ui/app.tsx` 属该插件自有 bundle
  （`dist/ui/`，独立于主 Web 包），其 host 侧改动（`ui/src/plugins/bridge-init.ts`）已随主包上线。
  建议单开跟进项：核对插件 UI 目录解析（DEFAULT_LOCAL_PLUGIN_DIR / 包名映射）。

## 范围守规

- 未运行 `release-app.sh`（Android 发版）。
- 未改 `server/` 7 工具池配置，未改 `clients/expo`。
- 未 push `main`。

## 证据文件

- `deploy-web-prod-evidence.txt` — 原始命令输出快照
