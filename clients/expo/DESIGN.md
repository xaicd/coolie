# Coolie App(Expo)UI 设计规范 — Linear 设计系统移植

> 适用范围:`clients/expo/` 全部界面。本规范基于 Linear 设计系统(顶级 dev-tool 视觉语言)定制,替代现有深蓝配色方案。
> 原则:**深色原生、极简精密、信息密度靠亮度分层、单一品牌色**。老板拍板:对标 Linear。

## 1. 色彩令牌(dark theme 唯一主题)

```ts
// 单一来源 src/theme.ts (wave10: 与 Coolie Web / clients/expo-paperclip-web 对齐);
// src/coolie.ts 只做 re-export, 屏/组件一律 `import { C } from "../theme"`。
export const C = {
  // 背景三层(亮度阶梯 = 海拔)
  bg:      "#08090A",  // 页面最底(marketing black)
  panel:   "#0F1011",  // AppBar/TabBar/侧栏
  surface: "#191A1B",  // 卡片/浮层
  surfaceHover: "#28282C",
  // 文字四级
  ink:    "#E6E6E6",   // 主文字(不是纯白!)
  ink2:   "#9BA1A6",   // 次文字
  ink3:   "#8A8F98",   // 占位/元数据
  ink4:   "#62666D",   // 时间戳/禁用
  // 品牌色(全 App 唯一彩色,只用于 CTA/激活/选中)
  brand:     "#5E6AD2", // 按钮底/品牌标记
  accent:    "#5E6AD2", // 链接/激活态(与 Coolie Web 一致)
  accentHover:"#828FFF",
  // 状态(仅状态指示)
  ok:   "#27A644",
  done: "#10B981",
  warn: "#F59E0B",
  err:  "#EF4444",
  // 边框(半透明白,不用实色深边)
  line:      "rgba(255,255,255,0.08)",
  lineSubtle:"rgba(255,255,255,0.05)",
} as const;
```

**红线**:品牌紫蓝(#5E6AD2)是唯一彩色,禁止装饰性滥用;禁止纯白 #FFF 文字;禁止实色深色边框(深底上用半透明白);状态色只出现在状态点/徽标。

## 2. 字体(RN 无 Inter Variable 就用系统字重近似)

- iOS:`SF Pro`(系统),Android:`Roboto`——RN 默认即可,不自定义 fontFamily
- 权重三档:`400`(正文)/`"500"`(强调,近似 Linear 的 510)/`"600"`(标题,近似 590,**禁 700**)
- 字号阶梯:标题 20 / 小标题 17 / 正文 15 / 次文 13 / 徽标 11
- 标题 letterSpacing:-0.4;正文 0;数字/等宽(tabularNum)

## 3. 组件规范

### 按钮
- 主按钮:bg `#5E6AD2`,文字 `#FFF`,radius 8,padding 12×16,weight "500"
- 幽灵按钮:bg `rgba(255,255,255,0.02)`,border `line`,文字 `#E2E4E7`,radius 8
- 危险按钮:bg `#EF4444`@10% + border err@30% + 文字 err
- 禁用:opacity 0.4(不换色)

### 卡片(六指标卡、agent 行、issue 行)
- bg `rgba(255,255,255,0.02)`(半透明,不用实色!)
- border 1px `line`(0.08),radius 12
- 按压态:bg 升到 `rgba(255,255,255,0.05)`
- 海拔靠背景亮度:0.02 → 0.04 → 0.05,**不用 RN Shadow 深影**

### 状态点(agent 呼吸灯)
- 圆点 8px:活跃 `#27A644` / 空闲 `#8A8F98` / 异常 `#EF4444`
- 活跃呼吸:外圈 ok@20% 动画扩散

### 徽标/胶囊(状态、优先级)
- radius 999,bg `rgba(255,255,255,0.05)`,border `line`,文字 ink2,字重 "500",字号 11
- 优先级色点在胶囊内前缀:P0 `#EF4444` P1 `#F59E0B` P2 `#8A8F98`

### 输入框
- bg `rgba(255,255,255,0.02)`,border `line`,radius 8,padding 12×14,文字 ink2,placeholder ink3

## 4. 布局

- 间距阶梯:4/8/12/16/24/32(8px 网格)
- 页面左右 padding 16,卡片间距 12,区块间距 24
- DashboardScreen:指标卡 2 列网格(数字 24px weight "600" tabularNum + 标题 11px ink3),顶部公司选择器胶囊
- 列表(agents/issues):行高 56,左侧头像圆 32,右侧 chevron ink4
- 安全区:SafeAreaView 全局

## 5. 交互细节

- 刷新:下拉 RefreshControl tintColor accent
- 加载骨架:卡片形状 bg `rgba(255,255,255,0.03)` 微脉冲
- 空状态:居中图标 ink4 + 一行 ink3 文案,禁红色报错样
- 触觉:关键操作(iPad审批/熔断)iOS `UIImpactFeedbackStyle.medium`

## 6. Diff 查看器配色(Top2 顺带)

- 新增行:bg `#27A644`@8%,行号/文字偏 `#6EE7A0`
- 删除行:bg `#EF4444`@8%,文字偏 `#FCA5A5`
- 文件头:等宽字重 "500",折叠 chevron

## 7. 验收

- 全 App 无第 1 节之外的色值(状态色仅状态场景)
- 深色一致性:三档背景清晰可辨
- 数字全部 tabularNum,列表对齐
- 禁用态/空态/加载态全覆盖,无裸文本 Loading
