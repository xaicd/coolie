# wave292 工具链适配预验证 — 2026-10-04 (掌柜批准补丁后)

commit: 05beacd3b `build(expo): wave292 — release 工具链支持 fingerprint 政策 (fingerprint.config.js 统一哈希口径)`
(3 文件: fingerprint.config.js 新增 / runtime-version.mjs / verify-ota-runtime-consistency.mjs)

## 1) fingerprint:generate — PASS
两次运行 exit 0, hash = `59398d8c10ad4c5e23044387b1c9912920e63692` (40hex, 确定性成立)。
与 stock 口径 (bbe11696..., 含版本字段) 不同 → fingerprint.config.js 生效。

## 2) 版本字段排除实证 — PASS
临时 bump version=9.9.9 / versionCode=99999 (未提交) → 复算 hash **不变**
(`59398d8c10ad4c5e23044387b1c9912920e63692`) → 版本字段已排除出哈希口径。
app.json 已还原, git diff 为空 (与 HEAD 逐字节一致)。
推论: 发版 bump 到 0.6.26/626 后 runtimeVersion 仍为本哈希, 「跨 minor OTA」达成。

## 3) verify-ota-runtime-consistency.mjs — PASS (fingerprint 分支)
`--only=app-json` → `[VERIFIED] intent=59398d8c10ad4c5e23044387b1c9912920e63692
(policy=fingerprint → 原生状态哈希)`, exit 0。
全量对照 (exit 1, 预期内): apk 线 FAIL「原生 0.6.25 ≠ 新哈希」= 待 0.6.26 重建对齐;
remote 线 VERIFIED「远端 0.6.25 == 旧 APK 0.6.25」= 现网装机一致, 未受影响。

## 当前状态
工具链就绪, 发版窗口停等掌柜开闸 (T-2 落库后 go):
`AUTO_DEPLOY_EVIDENCE_DIR=$PWD/docs-coolie/evidence/wave292 bash scripts/release-app.sh 0.6.26 "<说明>" --with-server-deploy --with-4-guard`
预期: 新 APK 原生 runtimeVersion == manifest runtimeVersion == 59398d8c10ad4c5e23044387b1c9912920e63692
(前提: 0.6.26 不改原生依赖/插件; 若改, 哈希会变, 以发版时实算为准)。
