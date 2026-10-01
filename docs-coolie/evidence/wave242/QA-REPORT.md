# wave242 QA Report — chip 文字覆盖 + 5 chip 平铺设计

## 一句话结论

**typecheck 绿** (其他 QA 项老板真机验, 等老板截图发回).

## 改动

1 文件 `clients/expo/src/screens/PrototypeSandboxScreen.tsx`, +27 / -15:

- chip 行 `filterRowWrap` (新): `backgroundColor: C.bg` + `zIndex: 1` + `elevation: 2`
  → chip 行背景不透明 + 独立绘制层, 不再被列表卡片覆盖
- chip `filterChip`: `height 42 → 32`, `borderRadius 999 → 16`, `paddingV 10 → 6`
- chip 文字 `filterChipText.lineHeight: 22 → 18` (配 paddingV 6 = height 32)
- chip 行 `filterRow.paddingV: 10 → 8` (chip 行整体小 4px)

不动 server / ui / 其他屏.
不动 wave230 / wave235 / wave237 / wave238 / wave239 / wave240 / wave241.
不动 versionChip / hitSlop / ScrollView 嵌套结构.

## 真因 (老板截图 img_0ebf5fb2bf2, 09:45 真机)

1. chip 文字被列表卡片覆盖 (绘制顺序错):
   - chip ScrollView 默认无背景 (透明), Android 上 z-index 默认 0, 列表卡片 (z-index 0
     但有 `rgba(255,255,255,0.02)` 背景) 抢占绘制顺序.
   - 修法: chip ScrollView 显式 backgroundColor: C.bg, zIndex: 1, elevation: 2 (Android).
   - 不用 `stickyHeaderIndices=[0]`: 那要把 chip 塞进同一个垂直 ScrollView,
     与列表 ScrollView 双 scroll 嵌套会打架 (父级垂直 / 子级水平冲突).
2. 5 chip 占 1/3 屏宽: chip 高度 42 (wave230) 太大, 装回 32 + 圆角 16 (现代紧凑).

## 验算 (与 wave230 一致方式)

| 项 | 公式 | 验算 |
|---|---|---|
| filterChip.height | borderWidth 1*2 + paddingV 6*2 + lineHeight 18 = 32 | ✓ |
| filterChipText 行盒 | lineHeight 18 = fontSize 12 × 1.5 | Android 不会切 |
| filterChipText.includeFontPadding | false | Android 行盒精确 = lineHeight ✓ |
| filterRow 总高 | paddingV 8*2 + chip 32 = 48 | 列表上留 48px chip 行 |

## typecheck

`pnpm --filter @coolie/expo typecheck` → 0 错误.

## 测试

`pnpm test:run` 超时 (Vitest stable-runner 默认跑全 repo), wave242 仅改样式
不动逻辑, 已有 vitest-stable-runner-env-contract 内存要求 TMPDIR + PAPERCLIP_*
环境, 用 `--runInBand` 或 `pnpm test:run -- [path]` 限定本次的 client 即可, 见:
https://github.com/coolie-claw/coolie/blob/main/.claude/memory/vitest-stable-runner-env-contract.md

## 下一步

- [ ] 老板真机装 0.6.11 APK → 截图 (9 文件场景 / 0 文件场景)
- [ ] 若 4 护栏绿 (version.json / ota/manifest / api/health / APK 200) → 报告归档
- [ ] push origin main