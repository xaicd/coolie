# Coolie AI 原生商业软件交付工厂控制面平台 · 移动端自建 OTA 增量热更新与版本对齐规范

> **文档代号**: COOA-OPS-OTA-v2.0.0  
> **基线版本**: v2.0.0  
> **制定日期**: 2026-10-17  
> **归属规范**: CMMI 09_operations / .agents/skills/ota-cache-busting / .agents/skills/ota-runtime-version-consistency  

---

## 1. Expo 自建 OTA 热更新架构 (Self-Hosted Expo Updates)

系统采用自建 OTA 协议替代第三方 EAS 服务，保障敏捷修复秒级推送到端：
1. **纯 JS 增量打包**: 原生壳（APK/IPA）保持不变，更新仅包含 JS Bundle 与资源文件；
2. **三方一致性校验**: `app.json` 的 `runtimeVersion`、客户端原生代码版本、生产 Caddy `manifest` 接口返回的版本必须完全一致，否则静默拒绝安装；
3. **哈希防缓存穿透**: 必须携带 `launchAsset.hash` 与 `assets[].hash`，强制设备拉取最新代码。

---

## 2. 常用操作指令 (Operational CLI)

```bash
# 发布纯 JS OTA 增量补丁
bash scripts/publish-ota.sh

# 检查当前线上 manifest 与运行态匹配度
curl -s https://api.coolie.ai/ota/manifest | jq .
```
