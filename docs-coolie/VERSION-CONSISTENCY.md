# Version Consistency — 7 个版本号源必须一致

> wave265 老板原话: 「版本号码要一致」
>
> PM 反讲: 历史 tag 漏推 (v0.6.5 / v0.6.8 / v0.6.10 / v0.6.13 / v0.6.14 /
> v0.6.15 / v0.6.19), 各源版本号散乱 (tracked app.json 0.6.19 vs 本地
> version.json 0.6.8 vs OTA manifest 502), 发版无 tag, 回溯困难.

## 1. 7 个版本号源 (契约)

发版后这 7 处必须互相对齐 — 任一处不一致即视为发版未完成:

| # | 位置 | 字段 | 谁管 |
|---|---|---|---|
| 1 | `clients/expo/app.json` | `expo.version` + `expo.android.versionCode` | `release-app.sh [2/9]` |
| 2 | `clients/expo/package.json` | `version` | `release-app.sh [2/9]` |
| 3 | `clients/expo/android/app/build.gradle` | `versionName` + `versionCode` | `release-app.sh [2/9]` |
| 4 | `clients/expo/CHANGELOG.md` | 顶部首个 `## v...` 节 | `release-app.sh [3/9]` |
| 5 | 远端 `https://xrobinai.cn/version.json` | `version` + `versionCode` (+ `commitSha`) | `release-app.sh [8/9]` |
| 6 | 远端 `https://xrobinai.cn/ota/manifest` | `runtimeVersion` | `release-app.sh [9/9]` |
| 7 | git tag | `v<version>` | `release-app.sh [12/12]` (wave265 新增) |

versionCode 公式: `major*10000 + minor*100 + patch` (0.6.19 → 619, 0.6.5 → 605).

## 2. 检查脚本

`scripts/VERSION-CONSISTENCY-CHECK.sh` 校验这 7 处是否一致.

```sh
# 默认从 app.json 读期望版本
bash scripts/VERSION-CONSISTENCY-CHECK.sh

# 显式传期望版本 (CI 友好)
bash scripts/VERSION-CONSISTENCY-CHECK.sh 0.6.19

# 离线 / CI 不查远端
SKIP_REMOTE=1 bash scripts/VERSION-CONSISTENCY-CHECK.sh 0.6.19
```

退出码:
- `0` — 7 处全一致 (远端 5/6 网络不可达时仅警告不阻断)
- `1` — 有不一致项, 报告印到 stderr

## 3. CI 集成 (建议位置)

`docs-coolie/VERSION-CONSISTENCY.md` 这一段是建议, 实际 CI 接入由运维决定:

```yaml
# 伪码 — 接入到现有 CI (e.g. .github/workflows/coolie-version.yml)
- name: 校验版本号一致性
  run: SKIP_REMOTE=1 bash scripts/VERSION-CONSISTENCY-CHECK.sh
```

`SKIP_REMOTE=1` 是因为 CI 通常无远端访问, 且发版前远端可能还没上线. 真实远端对齐
在 `--with-4-guard` 后由 `auto-deploy.sh` 的 4 护栏兜底.

## 4. 纪律 (PM commit + tag 规范)

1. **每次发版必打 tag** — `release-app.sh [12/12]` 自动打 `v<version>` 并推 origin.
   失败仅警告不阻断, 因为 APK / OTA 已经发出, 回滚代价 >> 补打 tag.
   补打方式: `git tag -a v<version> -m "..." <release-commit> && git push origin v<version>`.

2. **tag 指向「发版完成」的 commit** — 即 `release: v<version> — ...` 这一笔
   (含 `chore(release): version.json ...` step), 不是后续 docs commit. 例:
   - v0.6.19 → `37e6b3d77` (wave258 feat, 不是 92796a123 docs(wave262))
   - v0.6.14 → `5d98de409` (wave251 fix, 也是 wave252 release-app.sh 的发版 commit)
   - v0.6.5  → `fe68cdb5f` (chore(release): server 0.6.5)

3. **不发版不 bump 版本号** — 例: wave152 / wave245 / wave261 都不是发版, 即使
   涉及大重构也不动 `app.json.version`. (wave261 wave261 commit b4486190a 是个
   反例 — 它顺手 bump 了 0.6.14 → 0.6.19, 老板当场没发现, 0.6.18 永远空号.)

4. **跳号要写理由** — 例: 0.6.15 → 0.6.19 跳 0.6.18 是「避 wave264 并发 commit
   撞车」; 这种跳号写进 RELEASE-HISTORY.md 那个版本的节开头.

5. **不存在 0.6.17** — 跳 0.6.17 是因为先跳了 0.6.18; 不要给 0.6.17 打 tag.

## 5. 历史 tag (wave265 一次性补推)

| Tag | Commit | Source |
|---|---|---|
| v0.6.5 | `fe68cdb5f` | chore(release): server 0.6.5 — wave215 routes deploy (fix board/chat 404) |
| v0.6.8 | `a1a7a9139` | release: v0.6.8 — 集成 4 波 push 修法 (wave156/164/213/216) |
| v0.6.10 | `2a3038b53` | feat(expo+server): wave239 — 5 屏一起抄 + APK 0.6.10 |
| v0.6.13 | `1b0018c10` | fix(expo-sandbox): wave242 — chip 行加 backgroundColor + zIndex |
| v0.6.14 | `5d98de409` | fix(expo): wave251 — chip 去重 (3 层 → 1 层) |
| v0.6.15 | `6ae154449` | refactor(expo): wave254 — TasksScreen 拆分去卡死 |
| v0.6.19 | `37e6b3d77` | feat(dispatch-skill-matcher): wave258 — CMMI 30 skill 派活精准浮层 |

不动 v0.5.97 / v0.6.0 / v0.6.2 (已存在); 不打 v0.6.17 (从未发版).

## 6. QA 留痕

`bash scripts/VERSION-CONSISTENCY-CHECK.sh 2>&1 | tee docs-coolie/evidence/wave<latest>/VERSION-CHECK.log`

证据放 `docs-coolie/evidence/wave<latest>/`. 见
`docs-coolie/evidence/wave265/QA-REPORT.md`.

## 7. 关联

- `scripts/release-app.sh` — 发版脚本 ([12/12] 是 wave265 新增的 tag step)
- `docs-coolie/RELEASE-HISTORY.md` — 每个版本详细流水
- `scripts/lib/auto-deploy.sh` — 4 护栏 (version.json / ota/manifest / APK / /api/health)
- `doc/plans/2026-10-01-wave265-tags.md` — 本波计划
