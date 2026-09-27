# Brief: wave 116 — 底部导航栏字号优化 (boss 23:00 OOB)

PM: Jason
Worker: cmd (门神)

## 0. Boss 09-27 23:00 OOB 「底部导航栏字太小了，得优化」

老板真机 0.5.79: 底部 5 栏 Tab (汇览/任务/工坊/资产) 图标下的文字标签太小, 老板手机上看不清。

## 1. 任务 (4 步)

### TASK 1: 现状测量
1. cd ~/workspace/xaicd/coolie
2. 读 clients/expo/src/components/TabBar.tsx (Super-Shell 5 栏底部导航)
3. 找 tab label 的 fontSize 当前值 (大概率 10-11px, iOS/Android 均偏小)
4. 模拟器装 0.5.79 截图现状留证

### TASK 2: 优化字号
1. tab label fontSize 提到 12-13 (参考主流 App: 微信/钉钉 tab 字号约 10pt 但屏幕密度高; 老板手机密度低需更大), 同时适当加大图标 1-2px 和垂直间距, 保证不挤不溢出
2. 保持中央 FAB 不变; 激活态/非激活态颜色对比保持
3. 若 TabBar 用 token (ui/tokens), 走 token 改, 保持 DESIGN.md 一致性 (App 端 tokens 不受 ui/ 网页 token gate 约束, 直接改 App 端值)

### TASK 3: 真验 + 发版
1. 模拟器截图对比 (改前/改后), 5 栏 + 中央 FAB 无溢出无遮挡
2. bump 0.5.80 -> 0.5.81 (versionCode 581) — 注意 wave115 正在跑 0.5.80, 若 0.5.80 已发版则 bump 0.5.81; 若还没发, 与 PM 确认后顺序执行
3. 全套 release (gradle + coscli + version.json + publish-ota)

### TASK 4: commit + push + 报告 (含改前/改后截图)

## 2. Constraints
- ❌ 不用 agy / 不动 PAPERCLIP_API_KEY / DEPLOYMENT_MODE
- ✅ 只改 TabBar 字号/图标/间距, 不动导航结构
- ✅ zsh-safe quotes

## 3. Done
新版本真发版 + 截图对比字号明显变大且布局不坏 + commit push。