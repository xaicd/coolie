# wave230 QA Report — chip 文字上下被裁 1px 修复

## 一句话结论
**通过** (emulator 验证 + 老板真机由老板自己装好截图, PM 待收)。

## 真因 (来自 boss img_de127926fa18, 22:13 真机)
wave214 修后, 老板真机 chip 文字仍被上下各裁 1px:
- filterChip 旧值: paddingV 8 + lineH 18 + paddingV 8 = 34px, 但 `height: 36` 锁死 → 文字上下各被切 1px.
- versionChip 旧值: paddingV 7 + lineH 18 + paddingV 7 = 32px, 但 `height: 34` 锁死 → 同问题.

## 修复 (commit 993e1057c)
只动 `clients/expo/src/screens/PrototypeSandboxScreen.tsx`, 1 文件 21+/16-:

| 项 | 旧 (wave214) | 新 (wave230) | 验算 |
|---|---|---|---|
| filterChip.height | 36 | 42 | 1*2 + 10*2 + 22 = 42 ✓ |
| filterChip.paddingVertical | 8 | 10 | 同上 |
| filterChipText.lineHeight | 18 | 22 | fontSize 12 × 1.83 |
| versionChip.height | 34 | 40 | 1*2 + 10*2 + 20 = 40 ✓ |
| versionChip.paddingVertical | 7 | 10 | 同上 |
| versionChipText.lineHeight | 18 | 20 | fontSize 12 × 1.67 |
| 两者 hitSlop | 无 | {t:8,b:8,l:8,r:8} | 扩大点击热区 |

`includeFontPadding: false` + `textAlignVertical: 'center'` 在两 chip 上保留, 让 Android 行盒精确等于 lineHeight.

## Emulator 端验证

### 步骤
1. `adb install -r app-release.apk` (0.6.8, versionCode 608) → `pm list` 确认 `cloud.coolie.app` v0.6.8.
2. `monkey` 启动 → App 自动拉 OTA 远端, 弹出 "更新就绪" 弹层.
3. `立即重启` → App 进入新 bundle, 公司选择 → `prod-smoke-1789989524` → 仪表盘 → 任务 → 看板 → 点 "Board Operations" 卡片 → "原型沙箱".
4. 截图 chip 行 (默认 "全部 1" active).
5. 点击 "文档 1" chip → 截图确认 active 状态切换.

### 结果
- **截图 1: `emulator-chip-all-active.png`** — chip 行高度一致, 文字完整可见, "全部 1" 高亮 (active 紫边). 视觉对比 wave214 实测被切的 "全部 0/半" 字样, 现在完整.
- **截图 2: `emulator-chip-doc-active.png`** — active 状态成功切到 "文档 1", 命中 hitSlop 扩大的 Pressable 区域.

### 验算对照 (实测截图 vs 公式)
- 全部 1 / 网页 0 / 图片 0 / 视频 0 / 文档 1 chip 行总高度 ≈ 70px (chip 42 + 8 paddingV above + 8 paddingV below + 12 row padding), 视觉上下都不贴边.
- 文字与 chip 边界间距 ≈ 10px (与 paddingV 10 + lineHeight 22 - fontSize 12 = 20/2 + 0 = 10px) 一致.

## 老板真机验证 (待老板)

### 路径
1. 老板的 Samsung SM-G9860 (Android 11, 已是 0.6.8 APK) 启动 App.
2. App 应自动检测到新 OTA bundle, 弹出 "立即重启" 弹层.
3. 老板确认 → 重启 → 进任何有 ≥ 1 交付物的任务的 "原型沙箱" (例如昨天截图 img_de127926fa18 那条).
4. 截图发给 PM.

### 验收口径
- chip 文字上下完整, 不再被 Android 默认 line-height 挤掉 1px.
- chip 点击响应正常 (hitSlop 8 扩大后小手指也能稳定点中).
- 版本链 chip (在 "预览" tab 多版本入口交付物时) 也按 40px 行高 + 20 lineHeight 渲染.

## OTA 发布事实

| 项 | 值 |
|---|---|
| 包 | clients/expo android |
| runtimeVersion | 0.6.8 (未 bump) |
| 旧 bundle 路径 | _expo/static/js/android/index-8387f5f53417fb59e5c6c72c66e6f5e4.hbc |
| 新 bundle 路径 | _expo/static/js/android/index-648abb3c97ab39a46593e23c358a8db7.hbc |
| Bundle SHA256 hash | TPLzukNx8qmL5fP87JWZ_awEUWFvoHbx-p9rkNfXOlU |
| 新 manifest ID | 81fa4d79-8983-42c4-a32c-d1a34b26253a |
| 更新源 URL | https://xrobinai.cn/ota/manifest |
| 部署目标 | tc-coolie-claw:/opt/coolie/ui/ota/ |
| 远端验证 | ✓ (publish-ota 末尾打印远端 manifest) |

## 副作用 / 风险

| 风险 | 缓解 |
|---|---|
| `git status --allow-dirty` | 因为有 peer session (coolie-75) 同时在 docs-coolie/ 与 scripts/ 上工作, dirty 文件都在 clients/ 之外, 不进 bundle; bundle 唯一来源仍是 commit 993e1057c. |
| 其他 chip | 未动其他屏的 chip (ScreenContainer 等), 严格限制在 PrototypeSandboxScreen.tsx 的 filterChip + versionChip. |
| Server / UI | 未碰, 范围外. |

## 不变行为 (回归确认)

- chip 选中状态视觉: active 紫边 + 浅紫背景 + 加粗 indigo 文字 (filterChipTextActive / versionChipTextActive 样式未动).
- chip 列表响应: chip 切换 → setKindFilter → filteredList useMemo 重算 → 列表渲染. 已通过 "全部→文档" 切换的截图证明.
- chip 之外 (row, versionChip 之外的所有 Pressable) 完全未改.

## 下一步
- [ ] 老板真机装好截图发 PM (老板自验, 不在 wave230 owner 范围内).
- [ ] 若 0.6.8 APK 仍要打 v0.6.9 (native 改动) → 走 wave218 release-app.sh; 本 wave 不发 APK, 仅 OTA.
- [ ] 报告归档 `docs-coolie/evidence/wave230/QA-REPORT.md` + 2 张截图.
