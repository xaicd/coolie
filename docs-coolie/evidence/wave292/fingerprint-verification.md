# wave292 C-2 — @expo/fingerprint 实证验证 (2026-10-04, 铁匠贰号)

环境: expo 52.0.49 / expo-updates 0.27.5 / @expo/fingerprint 0.11.11 / node v24.20.0

## 测试脚本 (对仓库 clients/expo 只读计算, 未改任何仓库文件)

`/tmp/wave292-fp-test.js` — 调 @expo/fingerprint createFingerprintAsync 两次:

- A: 库默认 skip (等同 expo-updates createFingerprintAsync 的现行为)
- B: sourceSkips = ExpoConfigVersions(1) | ExpoConfigRuntimeVersionIfString(2)

## 输出

```
A (stock, no skips)     hash = 19bbc3b1449632482daff7957c853436621e9550
B (ExpoConfigVersions)  hash = 9a6b6b9dc85203f6c67e9b017b68e81e92727090
A != B (version fields affect hash): true
A sources mention "0.6.25": true
B sources mention "0.6.25": false
A sources mention "fingerprint" policy: true
A deterministic (A == A2): true
B source types: {"file":71,"dir":34,"contents":5}
```

## 结论

1. 哈希机制在本仓库可计算且确定性成立 (A == A2)。
2. **版本字段默认参与哈希** (A 源里含 "0.6.25")。即: 直接采用 stock 指纹口径,
   每次发版 bump 版本号都会改变 runtimeVersion, 老板「装一次 0.6.26 之后 v0.6.x
   全走 OTA」的目标落空, 「经常要手装」问题原样复发。
3. 加 `SourceSkips.ExpoConfigVersions` 后版本字段退出哈希 (B 源里无 "0.6.25")。
   这就是 wave292 正确口径 —— 必须经 `clients/expo/fingerprint.config.js`
   (@expo/fingerprint 的 normalizeOptionsAsync 自动加载, 见 Options.js:
   `loadConfigAsync → ...config`) 声明, 或在计算调用处显式传参。
4. fingerprint 哈希源不含应用 JS 源码 (只有 autolinking/原生依赖/app.json 配置/
   原生目录/patch 等, 见 Sourcer.js getHashSourcesAsync) — 纯 JS 变更不会改变
   runtimeVersion, 与 fingerprint 政策语义一致。
5. stock 哈希值 (本仓当前状态): bbe11696fbcd8274e5381bfdd5dde169e4570b32
   (`npx expo-updates fingerprint:generate --platform android`, exit 0, 110 sources,
   见 fingerprint-generate-stock-skips.json)。加 fingerprint.config.js 后该值会变,
   但此后跨版本 bump 保持稳定。
