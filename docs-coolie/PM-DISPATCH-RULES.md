# Coolie PM 派单规则 — 2026-09-20

派单 = 给匠人（门神 / 铁匠 / 墨斗 / 副炉）的施工任务书。模板必须含 7 要素，缺一项门神拒接。

## 1. 简报模板（贴到 `/tmp/cmd-brief-*.md` 或 `docs-coolie/briefs/*.md`）

```
# <一行动词任务标题>

## 背景
<为何做 + 关联 commit / 文档 / 用户场景>

## 目标
<一句话可验收目标>

## 分支
<main / release/x.y / 新建分支名>

## 文件范围（白名单）
- path/to/file1.tsx
- path/to/file2.ts

## 步骤
1. git checkout <branch>
2. cd clients/expo && npx tsc --noEmit -p .
3. grep -rn "<key>" src/ | head -5
4. <fix 描述>

## 验收
- tsc 0 errors
- commit "fix(...): ..."
- output: <APK URL / file list / root cause>

## 规则
- NO PUSH（老板批次推）
- 不动 <其他文件>
- DO NOT 改动 <已知敏感区>

## 参考
- <docs-coolie/briefs/*.md 或 /tmp/cmd-brief-*.md 路径>
```

## 2. 反例（门神会拒）

- ❌ "修一下登录" — 无分支、无文件、无验收
- ❌ "把那个 bug 修了" — 没说哪个 bug、哪个 commit
- ❌ "重要紧急马上修" — 没文件范围就派，门神不知道改哪里
- ❌ 派活时人在 release/0.5.0 但 brief 写「发 0.3.6」 — 版本号与分支错位
- ❌ 简报里写 heredoc 反引号 — zsh 会拆碎，匠人 shell 退出
- ❌ "修一下" + 立刻跑 release-app.sh — 没确认 bug 真存在就发版，门神拒

## 3. 派单决策树（掌柜自查）

```
boss 说任务
  ↓
这活撞哪个分支？  ─ main          ─ release/0.4.0  ─ release/0.5.0  ─ 新分支
  ↓               ↓                ↓                  ↓                  ↓
          OTA 紧急通道         重构收尾         DS 同款 build        大版本
          (仅 bug fix)       (phase A-D)       (build 模式)        (新 spec)
  ↓
文件范围能列白名单吗？ — 不能 → 重写 brief 或拆
  ↓ 能
执行 tsc 验证吗？ — 不能（要沙箱权限） → 派铁匠 claude，给 fallback
  ↓ 能
涉及 release-app.sh 发版吗？ — 不 → 默认派门神
  ↓ 涉及
                → 派门神 max-turns 80+，明写「不审 bug 不发版」
```

## 4. 与匠人的边界

### 掌柜（PM）做
- 写派单简报
- 决定分支 / 文件范围 / 验收标准
- 写 docs-coolie/ 路线图 / 派单规则
- 验收 commit + 决定是否推送

### 匠人做
- 读简报 + 自己 grep 找文件
- 写代码（tsc 必须 0 错误）
- commit（NO PUSH）
- 报 root cause + 文件清单 + APK 链接

### 掌柜**不**做（违反规矩）
- ❌ 替匠人写代码（boss 严肃要求）
- ❌ 替匠人 commit（紧急时例外：build orchestrator 1ad05c8be、PM-ROADMAP.md 是文档不是代码）
- ❌ 派连发活（cmd 撞限速、claude sandbox 拒 commit）

## 5. 频率限制（落 Coolie pacing rules / 0df489620）

| 匠人 | 默认冷却 | 配置位置 |
|---|---|---|
| 门神 cmd | 180s | server/src/config/build-orchestrator.json |
| 铁匠 claude | 30s | 同上 |
| 墨斗 agy | 待定（09-23 恢复）| 同上 |
| 副炉 mm | 30s | 同上 |

**撞限后行为：** BuildProgressCard UI 显示「等待速率限制冷却（剩 X 分 Y 秒）」，匠人自动入队，到 slot 释放。

## 6. 验收 checklist（掌柜自查）

收到匠人完工回报后：

- [ ] commit hash 已确认（`git log --oneline -3`）
- [ ] tsc 0 errors（匠人报）
- [ ] 文件清单在白名单内
- [ ] APK URL（涉及发版时）curl 实测 200
- [ ] version.json 字段对齐
- [ ] OTA manifest runtimeVersion 对齐
- [ ] 没改其他分支（`git diff main..release/0.5.0 --stat` 等）

## 7. 沟通模板

给老板看：

```
⏱️ 进度 #N（H:M 派单/完工）

| 活 | 匠人 | 状态 |
|---|---|---|
| 阶段 A 抽组件库 | 门神 cmd | ✅ 68bb5bba9 |
| 阶段 D 性能 | 铁匠 claude | 🔨 proc_xxx |
| DS 学习 | 门神 cmd | ✅ 343b13b75 |

| 项 | 状态 |
|---|---|
| 0.3.3 OTA | ✅ |
| APK | https://dls.xrobinai.cn/coolie/app/0.3.3/coolie-release.apk |

老板下一步一句话：<选项>
```

## 8. 失败模式（避免重复）

1. **连环派单** — cmd 撞速率限制。修法：每个匠人间隔 ≥3min
2. **brief 含反引号/双引号** — zsh 拆碎，简报失败。修法：用单行 + cat
3. **「修一下」级简报** — 匠人无从下手。修法：7 要素全填
4. **错位发版（main 标 0.3.6 + release/0.5.0 代码）** — 版本号与分支不一致。修法：简报必写 `git checkout <branch>`
5. **没验证就 push** — 错版上线。修法：gate 在「curl + OTA + tsc」全过
6. **老板截图只截了一半** — 匠人不知现场。修法：追问「tab / 之前动作 / 错误原文」