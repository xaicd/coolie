---
name: deploy-workspace-symlinks
description: server 部署时必须建所有 @paperclipai/* workspace package symlinks 到 server/node_modules/。Use when rsync server + packages 后跑 systemctl restart → 必须先 link 否则 server 启动失败。
---

# Deploy Workspace Symlinks — server 部署必跑

## 1. 老板 2026-09-21 撞过的坑

门神 deploy wave3 时只 rsync 了 server/ + packages/，没建 symlinks：
- server 新代码 import `@paperclipai/templates` 和 `@paperclipai/agents`
- 这些 workspace 包没 symlink 到 `server/node_modules/@paperclipai/`
- server 启动 → Module not found → crash loop → systemd rate limit
- 用了 `systemctl reset-failed` 清限速后**手工**建了两个 symlinks → server 才起得来

## 2. 防坑：deploy 必须有 symlink 步

```bash
ssh tc-coolie-claw bash <<'REMOTE'
set -e
mkdir -p /opt/coolie/server/node_modules/@paperclipai
cd /opt/coolie/server/node_modules/@paperclipai

# 1. workspace packages (root)
for pkg in $(grep -rhoE "from ['\"]@paperclipai/[a-z-]+['\"]" /opt/coolie/server/src --include='*.ts' \
            | sed -E 's|.*@paperclipai/([a-z-]+).*|\1|' | sort -u); do
  if [ -d "/opt/coolie/packages/$pkg" ] && [ ! -e "$pkg" ]; then
    ln -s "../../../packages/$pkg" "$pkg"
    echo "linked $pkg"
  fi
done

# 2. bundled plugins
for plugin in plugin-aigw plugin-chat plugin-governance plugin-llm-wiki plugin-multimodal plugin-npc-factory plugin-ontology plugin-ops-console plugin-workflow plugin-workspace-diff paperclip-plugin-fake-sandbox; do
  if [ -d "/opt/coolie/packages/plugins/$plugin/dist" ] && [ ! -e "$plugin" ]; then
    ln -s "../../../packages/plugins/$plugin" "$plugin"
    echo "linked $plugin"
  fi
done
REMOTE
```

## 3. deploy-tc-coolie-claw.sh 自动跑这步

`scripts/deploy-tc-coolie-claw.sh` 必须含上面 §2 步，不能省。

## 4. 已知 /opt/coolie 不是 git 仓库

- 服务器 `/opt/coolie` 是 rsync-only 部署，没有 git
- 部署时本地 main 的 commit 跟服务器代码**不对应**（git log 报 "not a git repository"）
- 这是 paperclip 上游的部署模型，**不要 init git on server**

## 5. 验证 deploy 后所有 symlinks 都在

```bash
ssh tc-coolie-claw 'ls -la /opt/coolie/server/node_modules/@paperclipai/'
# 期望: agents, templates, db, shared + 10 个 bundled plugin symlink
# 全部 -> ../../../packages/<x>
```

## 6. 服务端 systemd rate limit

部署后用 `sudo systemctl restart coolie` 如果撞：
```
Start request repeated too quickly
```
需要 `sudo systemctl reset-failed coolie` 清限速，再 restart。

## 7. 与 release-flow 协同

`release-flow` §3 (API server 发布) 应引用本 skill，跑 rsync 之后必须跑 §2 symlink 步。