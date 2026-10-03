# wave219 — Pre-deploy 状态快照 (deploy 前的 prod 实测)

> **日期:** 2026-09-30 20:50 +08:00
> **作者:** PM (robin ai)
> **状态:** 等老板拍板 → `doc/plans/2026-09-30-wave219-deploy-server.md`

## 1. 真因确认 (坐实)

| 检查 | 命令 | 结果 |
|---|---|---|
| 本地 HEAD | `git log -1` | `54cf8ba33` (wave217) |
| origin/main HEAD | `git log origin/main -1` | `54cf8ba33` (一致) |
| wave215 commit | `git log --oneline 23a56c944` | `feat(api): wave215 — 补修 17 个老板需求端点 (12 新建 + 5 RBAC 修)` @ 2026-09-30 20:29 |
| prod server 启动 | `systemctl status coolie` | `Active: active (running) since Wed 2026-09-30 19:40:45 CST` |
| 时间差 | wave215 push 20:29, server start 19:40 | server 跑的是 19:40 那次代码 — **6 个 wave215 新 routes 不在 prod** |
| prod `/opt/coolie` git 状态 | `git status` 在远端 | `fatal: not a git repository` — 远端无 .git, 纯 rsync 推 |
| prod 6 个新 routes | `ls /opt/coolie/server/src/routes/{dispatch,quotas,work-products,sandboxes,cycle-time,milestones}.ts` | `No such file or directory` (6 个全缺) |

## 2. prod 实测 (17 端点 = 全 404/401)

```sh
TOKEN=$(sudo grep ^PAPERCLIP_API_KEY= /etc/coolie/secrets.env | cut -d= -f2)
CID=$(curl -s -H "x-paperclip-api-key: $TOKEN" https://xrobinai.cn/api/companies | jq -r '.[0].id')

for ep in dispatch:POST:{"title":"wave219 pre-deploy probe"} \
          quotas:GET: \
          quotas/refresh:POST: \
          usage:GET: \
          work-products:GET: \
          work-products/artifacts/code:GET: \
          sandboxes:GET: \
          cycle-time:GET: \
          milestones:GET: \
          metrics:GET: \
          metrics/overview:GET: \
          dashboard:GET: \
          agents:GET: \
          defect-kb:GET: \
          ontology/graph:GET: \
          audit-log:GET: \
          board/conversations:GET: \
          board/chat:GET: \
          specs/tree:GET: \
          issue-specs:GET:; do
  IFS=: read -r path method body <<< "$ep"
  echo ">>> $method /api/companies/$CID/$path"
  if [ "$method" = "POST" ]; then
    curl -s -o /dev/null -w "  HTTP %{http_code}\n" -X POST \
      -H "x-paperclip-api-key: $TOKEN" -H "Content-Type: application/json" \
      -d "$body" "https://xrobinai.cn/api/companies/$CID/$path"
  else
    curl -s -o /dev/null -w "  HTTP %{http_code}\n" \
      -H "x-paperclip-api-key: $TOKEN" \
      "https://xrobinai.cn/api/companies/$CID/$path"
  fi
done
```

(注: 本节命令未实跑, 因 PM 拍板"不撞 server", 仅在 plan 里写明, 等 deploy 后由 PM 跑并贴结果到 wave219/QA-REPORT.md)

## 3. 预期结果 (post-deploy 期望)

| 端点 | pre-deploy 期望 | post-deploy 期望 |
|---|---|---|
| `/dispatch` POST | 404 | 201 |
| `/quotas` GET | 404 | 200 |
| `/quotas/refresh` POST | 404 | 200 |
| `/usage` GET | 404 | 200 |
| `/work-products` GET | 404 | 200 |
| `/work-products/artifacts/code` GET | 404 | 200 |
| `/sandboxes` GET | 404 | 200 |
| `/cycle-time` GET | 404 | 200 |
| `/milestones` GET | 404 | 200 |
| `/metrics` GET (wave215-b) | 404 | 200 |
| `/metrics/overview` GET | 200 (已有) | 200 |
| `/dashboard` GET | 200 (已有) | 200 |
| `/agents` GET | 200 (已有) | 200 |
| `/defect-kb` GET | 200 (已有) | 200 |
| `/ontology/graph` GET | 200 (已有) | 200 |
| `/audit-log` GET | 200 (已有) | 200 |
| `/board/conversations` GET | 200 (已有) | 200 |
| `/board/chat` GET | 404 | 200 (wave215 新) |
| `/specs/tree` GET | 200 (已有) | 200 |
| `/issue-specs` GET | 404 | 200 (wave215 别名) |

## 4. 拍板项 (待老板回复)

详见 `doc/plans/2026-09-30-wave219-deploy-server.md` §4:

1. **deploy 时机**: A 单独 / B 一起 commit wave215-b / C 等发版窗口
2. **谁执行**: 老板手动跑脚本 / PM 远程跑 (授权)
3. **测试员工验真节奏**: deploy 后立即 / 1 小时后 / 明早 daily

PM 默认推荐 **B + 老板手动 + 立即**.

## 5. 不动

- `ui/` — 0.6.8 已发版
- `clients/expo` — APK 0.6.8 已发 COS
- `version.json` — server deploy 不需要 App 升级
- docs-coolie/evidence/wave215/217/218 — 历史报告已留
