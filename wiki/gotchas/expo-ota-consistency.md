# 避坑实录：Expo OTA 7 处版本一致性与运行时对齐

1. **7 处版本源**：app.json, package.json, build.gradle, CHANGELOG, version.json, manifest, git tag 保持严格一致；
2. **OTA 缓存陷阱**：原生 versionCode 优先判定，老版本设备必须附带 bundle hash 防止更新静默丢失。
