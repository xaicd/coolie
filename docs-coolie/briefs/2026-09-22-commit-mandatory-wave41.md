# Brief: wave 41 — 每个发版必须有 commit (boss 23:59 OOB '每个部署打包最好要有提交, 不然丢版本了')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:59 OOB 「每个部署打包最好要有提交, 不然丢版本了」

老板要求: **每个发版 (APK / OTA / h5) 必须有对应 git commit**, 否则丢版本 (无法回溯/重发).

## 1. 已知现状

```
✅ PM-RELEASE-CHECKLIST.md (29 项 gate)
   - C1-C4: git 与分支
   - F1-F3: 上传与发布
✅ VERSIONING.md (semver)
⚠️ 没明文 "无 commit 不发版" 硬规则
⚠️ 之前 wave26 0.5.15 release commit 跳过了 release-app.sh 4-9 步 = 0.5.15 APK 没真发 (wave27 披露)
⚠️ wave32/36/38 等也没严格对应 commit
```

## 2. 目标

**发版硬规则: 每个发布物 (APK / OTA bundle / h5 dist) 必须有对应 git commit, 否则不发版**:

A. PM-RELEASE-CHECKLIST 加 J 项 (commit 强制要求)
B. release-app.sh 加 sanity check: bump version 前 `git status` 必须干净 (否则 abort)
C. publish-ota.sh / publish-h5.sh 加同样 sanity check
D. release-flow skill 加 "必查 commit" 步骤
E. backfill 之前发版的 commit reference (wave26/27/30/32/34/35/36/38/40) 进 version.json + CHANGELOG

## 3. 任务 (5 步)

### 3.1 PM-RELEASE-CHECKLIST 加 J 项 (commit 强制)

读 `docs-coolie/PM-RELEASE-CHECKLIST.md`, 加:

```markdown
## J. Commit 强制 (3 项) — NEW

- [ ] **J1** 发版前 `git status` 必须干净 (no uncommitted changes, no untracked files in clients/*)
- [ ] **J2** 发版 commit hash 已记录到 `version.json` 的 `commitSha` 字段
- [ ] **J3** 该 commit 在 origin 上 (push done before release-app.sh bump)
```

### 3.2 release-app.sh 加 sanity check

读 `scripts/release-app.sh`, 在 "前置检查" 步骤加:

```bash
# === 1.5 commit 强制检查 (NEW) ===
if [[ -n "$(git status --porcelain | grep -v '^??')" ]]; then
  die "[sanity] git status NOT clean (modified files in tracked). Commit first. Don't ship dirty state."
fi

if [[ -n "$(git status --porcelain clients/ packages/ server/ docs-coolie/ scripts/ 2>/dev/null | grep '^??')" ]]; then
  echo "[warning] untracked files in tracked dirs. Run 'git add' first."
  # 不强制 abort, 但提示
fi

# 记录 commit hash 到 version.json
COMMIT_SHA="$(git rev-parse HEAD)"
# 后续写 version.json 时 + "commitSha": "$COMMIT_SHA"
```

### 3.3 publish-ota.sh / publish-h5.sh 加同样 sanity check

`scripts/publish-ota.sh` (代理 clients/expo/scripts/publish-ota.sh):

```bash
# proxy 之前 sanity check
cd "$REPO_ROOT"
if [[ -n "$(git status --porcelain | grep -v '^??')" ]]; then
  echo "[warning] git status NOT clean (modified files). publish-ota still runs but commit first."
fi
```

`scripts/publish-h5.sh` 加同样.

### 3.4 release-flow skill 加 "必查 commit" 步骤

读 `.agents/skills/release-flow/SKILL.md`, 在 "发版前必跑" 之后加:

```markdown
## 4. commit 强制 (boss 23:59 OOB)

任何发布物 (APK / OTA / h5) 必须有对应 git commit:

```
1. 发版前 git status 干净 (no modified tracked files)
2. commit hash 记入 version.json 的 commitSha 字段
3. commit push 到 origin
4. release-app.sh / publish-ota.sh / publish-h5.sh 在 bump version 前 sanity check
```

违反 (无 commit 发版) = 版本丢失 (无法回溯/重发).

## 5. 之前发版问题 (反思)
- wave26 0.5.15 release commit 只 bump version, 没 typecheck/build APK → APK 没真发
- 老板说 "丢版本" 真实案例
- 修法: 现在每个发版 release-app.sh 第 1.5 步强制 sanity check
```

### 3.5 backfill 之前发版的 commit reference

读 `clients/expo/CHANGELOG.md`, 补 commit hash 到每个发版节 (wave18 0.5.8 → 0.5.18):

```markdown
## 0.5.7 (2026-09-21) — commit `5102f0045`
- 编排按钮组 [🔨 Build 5 步链] [🛤️ Pipeline] [📋 Plan]
- ...
```

读 `clients/expo-paperclip-web/CHANGELOG.md` + `clients/h5/CHANGELOG.md`, 同样 backfill commit hash.

写新脚本 `scripts/backfill-commit-sha.sh` 自动从 git log 找 commit:

```bash
git log --oneline --all | grep -E "release: v0\.[0-9]+\.[0-9]+" | while read sha msg; do
  version=$(echo "$msg" | grep -oE "v0\.[0-9]+\.[0-9]+" | sed 's/v//')
  echo "## ${version} (commit ${sha:0:7})"
done
```

## 4. Constraints

- ❌ DON'T 改 release-app.sh 的现有 sanity check (只加新检查)
- ❌ DON'T 删之前的发版 release (只 backfill commit reference)
- ❌ DON'T 触碰 paperclip 上游
- ✅ DO 加 J 项 gate
- ✅ DO release-app.sh 加 sanity check
- ✅ DO release-flow skill 加必查 commit
- ✅ DO backfill commit hash 到 CHANGELOG

## 5. Done definition

5 步全完 + PM-CHECKLIST J 项 + release-app.sh sanity check + publish-ota.sh / publish-h5.sh sanity check + release-flow skill 加 "必查 commit" + 3 个 CHANGELOG backfill commit hash + commit + push:

```
PM-CHECKLIST:     29 → 32 项 gate (新增 J1-J3)
release-app.sh:   sanity check #1.5 (commit 强制)
publish-ota.sh:   sanity check (warning, 不强制)
publish-h5.sh:    sanity check (warning, 不强制)
release-flow:     §4 commit 强制 (boss 23:59)
3 个 CHANGELOG:    backfill commit hash
```