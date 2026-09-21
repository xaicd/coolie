# Brief: 紧急 — OTA 真修复 (Caddy 兜底 + 重建 OTA bundle)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. 真问题 (PM 2026-09-21 模拟器验证发现)

模拟器装 0.5.5 + 0.6.2 验证:
- ✅ WhatsNewScreen 显示 v0.5.5 + 「OTA 已启用」+ runtime 0.5.5
- ❌ 但 logcat: `Failed to construct manifest from response` (org.json.JSON.typeMismatch)
- 根因: OTA manifest URL (`https://xrobinai.cn/ota/manifest`) 返回 HTML (Caddy 兜底到 Coolie Web SPA) → expo-updates JSON parse 失败 → fallback 到 APK embedded bundle

**更深层根因 (SSH server 验):**
- `/opt/coolie/ui/ota/` 目录整个不存在
- `publish-ota.sh` 跑过但 bundle 被删 / 没真发布
- 即使 Caddy 兜底修了, manifest 也会指向不存在 bundle

**WhatsNewScreen 自检「OTA 已启用」是误报**:
- expo-updates 检查 URL reachable + HTTP 200
- 但实际响应 HTML, 没检查 content-type / JSON 解析
- self-check logic 没看 logcat

## 1. Boss 09-21 问「触发更新」立刻暴露

## 2. 任务

### 2.1 修 Caddy 兜底 (生产 server)

`/etc/caddy/Caddyfile` 加:
```
handle /ota/* {
    root * /opt/coolie/ui/ota
    file_server
}
handle /ota/manifest {
    root * /opt/coolie/ui/ota
    rewrite * /manifest
    file_server
}
```

不要 `reverse_proxy`, 让 Caddy 直接 file_server ota 目录.

但 2.1 仅当 ota 目录真存在才生效. 先做 2.2.

### 2.2 重建 OTA bundle + 上生产

```bash
# 1. 模拟器验证: cp 0.5.5 APK embedded bundle 到 /tmp/build/embedded.hbc
# 2. 在本地 build 一次新 bundle (有 ChatHome 5 + i18n + 5 P0 屏)
pnpm --filter @coolie/expo export --platform android
# 3. 上传到生产 ota 目录
ssh tc-coolie-claw 'mkdir -p /opt/coolie/ui/ota/_expo/static/js/android'
rsync -avz $REPO_ROOT/clients/expo/dist/_expo/static/js/android/ \
  tc-coolie-claw:/opt/coolie/ui/ota/_expo/static/js/android/
# 4. 写 manifest
# 5. Caddy 兜底修
```

### 2.3 自检逻辑要严 (客户端)

`clients/expo/src/screens/WhatsNewScreen.tsx` 里 OTA 状态检查:
- 不能只看 HTTP 200
- 要看 content-type = application/json
- 要尝试 JSON parse manifest
- 失败时显示「OTA 未启用, 当前用 APK 内嵌版本」

### 2.4 写经验教训 skill

`.agents/skills/ota-caddy-fallback-trap/SKILL.md`:
- expoupdates 通过 HTTPS manifest URL 检查
- Caddy 默认 SPA fallback 让所有 GET 都返 HTML
- 必须 Caddy 加特例: ota/* 不走 reverse_proxy

## 3. Constraints

- DO NOT bump version
- DO NOT touch clients/expo/ (驾驶舱) / clients/expo-paperclip-web/ (Coolie Web) 的产品功能
- Caddyfile 修改要重启 Caddy (`systemctl restart caddy`) — 要老板批准
- 必须真验证: 模拟器装 0.5.5 → logcat 看到「Updates state change: Idle」无 error → OTA 真工作

## 4. Verification

- [ ] server `/opt/coolie/ui/ota/` 存在且有 bundle + manifest
- [ ] Caddyfile 不再让 /ota/manifest 兜底到 SPA
- [ ] 模拟器 0.5.5 装机 → logcat 无 `Failed to construct manifest` error
- [ ] 模拟器 0.5.5 装机 → WhatsNewScreen 显示「OTA 拉了新 bundle 0.5.5」
- [ ] 装 0.5.5 后改成 0.5.6 (发新版) → 模拟器装 0.5.5 启动 → 拉到 0.5.6 bundle

## 5. Done definition

Caddy 修 + OTA bundle 真发布 + 模拟器 logcat 验证 + skill 入库 + commit + push + 装机直链不变。