# Brief: 学习 DigitalStaff「对话里嵌预览/编辑」并产出学习报告（不写代码）

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Wave: 0 of N — **纯学习。**

## 0. 不要做的事

- ❌ 不写 Coolie 任何代码
- ❌ 不派给门神写组件
- ❌ 不创建任何新 .tsx/.ts 文件在 Coolie 主仓

## 1. 唯一任务

**读完** DigitalStaff 的 5 个文件 + 3 个 steering 文档 + 1 个 spec 流程，写一份**学习报告**到：

```
docs-coolie/DS-LEARN-board-inline.md
```

报告必须含 5 节：

### 1.1 ChatHome.tsx（4928 行 web 端）的对话驱动方式

- 找它的「消息气泡渲染」逻辑在文件哪几行
- 它用什么方式把 PreviewPanel / EnhancedCodeBlock 嵌入消息流
- 它的流式协议（SSE？WebSocket？轮询？）是什么
- 在 RN 上**能直接搬什么** vs **必须重写什么**

### 1.2 EnhancedCodeBlock.tsx（274 行）的代码块能力

- 它支持哪些操作（复制/下载/编辑/全屏/格式化）
- 用什么高亮库
- 它怎么切到「编辑模式」
- **行号是怎么渲的**

### 1.3 IDEIframe.tsx（414 行）的 iframe 嵌入

- 它嵌入什么（VSCode monaco？Theia？自研？）
- 跨域、token、session 怎么传
- **在 react-native-webview 上能不能跑**（老板说 app 原生不咋地，那 IDEIframe 抄不抄**我等你判定**）

### 1.4 PreviewPanel.tsx（100 行）的预览面板

- 怎么决定展示 iframe / 图片 / 视频
- URL 来源（服务端推？客户端拼？）
- 加载/失败处理

### 1.5 CodeMirror 在 DigitalStaff 哪里出现过

- `grep -rn "CodeMirror\|monaco" ~/workspace/xaicd/digitalstaff/frontend 2>/dev/null` 看一下
- 如果没用过 CM，老板说的「用 codemirror」= **新引** 还是 **复用某处**

### 1.6 .kiro 流程

读：
- `~/.kiro/steering/development-rules.md`
- `~/.kiro/steering/README.md`
- `.kiro/specs/native-agent-team-chat/{requirements,design,tasks}.md`（Kiro 三件套范本）

总结：**DigitalStaff 用 .kiro spec 流程怎么走**，Coolie 是否要复用。

## 2. 文件参考

```bash
~/workspace/xaicd/digitalstaff/
├── frontend/modules/ai-studio/
│   ├── pages/ChatHome.tsx                                    (4928 行)
│   ├── components/chat/EnhancedCodeBlock.tsx                 (274 行)
│   ├── components/ide/IDEIframe.tsx                          (414 行)
│   └── components/ai-studio/ide/
│       ├── PreviewPanel.tsx                                 (100 行)
│       └── IDEPanel.tsx                                     (72 行)
└── .kiro/
    ├── steering/{README,development-rules,database-model-rules,flutter-app-sync-rules}.md
    └── specs/native-agent-team-chat/{requirements,design,tasks}.md
```

## 3. 报告模板

`docs-coolie/DS-LEARN-board-inline.md` 结构：

```
# 学 DigitalStaff — Board Inline 预览 + 编辑

## 0. 我读的 5 文件 + 3 steering + 1 spec 摘要
## 1. ChatHome.tsx — 对话驱动
## 2. EnhancedCodeBlock.tsx — 代码块
## 3. IDEIframe.tsx — iframe 嵌入（**RN 上能不能抄，PM 拍板**）
## 4. PreviewPanel.tsx — 预览面板
## 5. CodeMirror 在 DS 哪里用 / 老板意图判定
## 6. .kiro spec 流程 — Coolie 是否复用
## 7. 学完后的真正方案（PM 给的，不是我自己拍）
   - 哪些抄
   - 哪些重写
   - 哪些不抄
## 8. 派活计划（最多 3 波，每波 ≤ 30 turns）
```

## 4. 约束

- 报告字数 ≥ 800 字
- 报告每节必须引文件 + 行号
- 引号代码片段 ≤ 30 行/段（不全抄）
- 报告必须含一句「**老板说'app 原生的功能不咋地'，但说'抄 chathome 也行'，**怎么调和**」的判断

## 5. 验收

- 报告 commit + push 到 main
- `wc -l docs-coolie/DS-LEARN-board-inline.md` ≥ 100
- `git log --oneline -1`

## 6. 完成定义

报告入库。**不动其它任何文件**。下一步是 PM（掌柜）看完报告再派活。