# wave242 — chip 文字覆盖 + 5 chip 平铺设计

## 范围

只动 1 文件: `clients/expo/src/screens/PrototypeSandboxScreen.tsx`。

## 真因 (老板截图 img_0ebf5fb2bf2, 09:45 真机)

1. **chip 文字被列表卡片覆盖 (绘制顺序错)**:
   - filterChip 是水平 ScrollView, 列表是垂直 ScrollView, 在 RN 上两者渲染为 sibling,
     视觉上 chip 行叠在列表卡片之上是正常的.
   - 老板真机显示 chip 文字被覆盖 = chip ScrollView 没有显式背景 (透明),
     在某些 Android 渲染路径下 z-index 默认 0, 列表卡片 (z-index 0, 但本身有背景)
     抢占绘制. 修法: chip ScrollView 容器加 `backgroundColor: C.bg` + `zIndex: 1` + `elevation: 2`,
     把 chip 行独立成绘制层.
   - 不用 `stickyHeaderIndices=[0]` (那需要把 chip 塞进同一个垂直 ScrollView,
     与列表 ScrollView 双 scroll 嵌套会打架 — 父级垂直 + 子级水平冲突).
2. **5 chip 平铺占 1/3 屏宽**: chip 高度 42 (wave230) 太大, 5 chip 加 padding/gap
   挤屏. 改回 height 32 + borderRadius 16, chip 更紧凑, 5 chip 横滑自然.

## 改动

只改样式 (1 file, +27 / -15):

| 项 | 旧 (wave230) | 新 (wave242) | 验算 |
|---|---|---|---|
| filterChip.height | 42 | 32 | 1*2 + 6*2 + 18 = 32 ✓ |
| filterChip.paddingVertical | 10 | 6 | 同上 |
| filterChip.borderRadius | 999 | 16 | 圆角小药丸 → 现代紧凑 |
| filterChipText.lineHeight | 22 | 18 | fontSize 12 × 1.5 |
| filterRow.paddingVertical | 10 | 8 | chip 行整体小 4px |
| **filterRowWrap (新)** | n/a | backgroundColor:C.bg + zIndex:1 + elevation:2 | chip 行背景不透明, 独立绘制层 |

保留 (回归确认):
- filterChip.paddingHorizontal: 12 (不变)
- filterChip.gap: 8 (filterRow gap 不变)
- hitSlop: {t:8, b:8, l:8, r:8} (不变)
- includeFontPadding:false (Android 行盒精确 = lineHeight)
- active 状态: `rgba(94,106,210,0.15)` 背景 + `C.accent` 边框 + `C.accent` 文字 (不变)
- chip 5 个 (全部 / 网页 / 图片 / 视频 / 文档) 不变
- chip 之外所有 Pressable / row / EmptyState 完全未改
- versionChip (wave141 加的) 完全未改 (preview 视图用)

## 不动

- 不动 server / ui / 其他屏
- 不动 wave230 已改的 versionChip / hitSlop 算法
- 不动 wave214 / wave230 之前的 commit
- 不动 wave235 / wave237 / wave238 / wave239 / wave240 / wave241 任何文件
- 不动 ScreenContainer

## QA 路径 (老板真机 0.6.11)

1. 老板的 Samsung SM-G9860 装 0.6.11 APK + 拉 OTA bundle.
2. 进任何有 ≥ 9 交付物的任务的 "原型沙箱" (例如 img_0ebf5fb2bf2 那条).
3. 列表 tab → 5 chip 横滑 → 文字完整不被列表卡片覆盖.
4. 切换 filter (例如 "图片 0") → active 状态正确.
5. 0 文件场景: chip 行 + 空状态正常, 间距合理.

## 验收口径

- chip 文字完整, 不再被列表卡片覆盖.
- 5 chip 横滑可滑 (gap 8 + 紧凑高度 32 让总宽 < 屏宽).
- 切 filter 后列表过滤生效.
- chip 选中状态视觉: 紫边 + 浅紫背景 + 加粗 indigo 文字.
- chip 之外行为完全未变 (row 列表、EmptyState、toolbar、preview 视图).

## 风险

- 双 scroll 嵌套没启用 (chip 行 = 水平 ScrollView, 列表 = 垂直 ScrollView, sibling),
  zIndex/elevation 在 Android 上确实会把 chip 行顶上去.
- iOS 上 zIndex 行为有差异, 但列表 (垂直 ScrollView) 在 iOS 上也是 sibling,
  不应该有问题.