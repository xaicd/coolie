# Coolie AI 原生商业软件交付工厂控制面平台 · 生产部署与割接标准作业程序 (System Deployment SOP)

> **文档代号**: COOA-SOP-v2.0.0  
> **基线版本**: v2.0.0  
> **生效日期**: 2026-10-17  
> **归属规范**: CMMI 07_release (TRANS) / .agents/skills/sre-release-and-deploy / .agents/skills/deploy-workspace-symlinks  

---

## 1. 割接前环境指纹与不可变版本核验 (Pre-Deployment Fingerprint)

1. **版本号一致性守卫**: 部署前必须执行版本一致性脚本，确保 7 处版本源严格对齐：
   ```bash
   bash scripts/VERSION-CONSISTENCY-CHECK.sh
   ```
2. **构建物签名核验**: 确保要上线的 Commit 已经通过本地 25 道预提交门禁并生成对应 Git Tag：
   ```bash
   node scripts/pre-commit-check.mjs
   git verify-commit HEAD
   ```

---

## 2. 生产服务端部署操作步骤 (Production Server Deployment)

生产服务运行于 `tc-coolie-claw` (Ubuntu 24.04, `62.234.59.180`)，服务由 `systemd` 托管：

### 2.1 安全代码同步 (Rsync with Excludes)
从开发机/发布节点向生产服务器同步编译制品，**严禁使用带 `--delete` 的裸 rsync**，避免抹掉生产 `version.json` 与运行态状态数据：
```bash
rsync -avz --exclude 'node_modules' \
          --exclude 'data/' \
          --exclude '.git' \
          --exclude 'dist/version.json' \
          ./server/ ./packages/ ubuntu@62.234.59.180:/root/workspace/coolie/
```

### 2.2 工作区软链接建立 (Workspace Packages Symlinks)
由于采用 PNPM Monorepo，服务端启动依赖 `@paperclipai/*` 内部包软链接，更新代码后必须先建立软链：
```bash
ssh tc-coolie-claw 'bash /root/workspace/coolie/scripts/ensure-workspace-symlinks.sh'
```

### 2.3 数据库安全迁移与服务优雅重启
```bash
ssh tc-coolie-claw 'cd /root/workspace/coolie && pnpm db:migrate'
ssh tc-coolie-claw 'sudo systemctl restart coolie.service'
```

---

## 3. 生产发布后健康拨测与业务验证 (Post-Deployment Health Probe)

1. **健康检查端点探测**:
   ```bash
   curl -f -s https://api.coolie.ai/api/health | jq .
   # 预期输出: {"status":"ok","version":"v2.0.0"}
   ```
2. **系统服务运行日志核查**:
   ```bash
   ssh tc-coolie-claw 'journalctl -u coolie.service -n 50 --no-pager'
   ```
3. **交付主线例行保活验证**:
   确认 `coolie-dev-loop-supervisor.mjs` 正常发起第一轮心跳打点。
