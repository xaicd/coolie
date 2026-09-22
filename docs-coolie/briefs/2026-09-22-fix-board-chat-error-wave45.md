# Brief: wave 45 — 修 board-chat 错误透传 + 删 ping 测试评论 + 充值指引 (boss 24:09 OOB '修')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:09 OOB 「修」

老板批准 PM 推荐「激进」方案: 修 board-chat 错误透传 + 充值/换 key + 删 ping 测试评论.

## 1. 已知现状 (wave44 验证)

```
✅ 真因: GLM key 额度空 + board-chat 静默吞错
✅ 链路本身通 (hermes CLI + server + Caddy SSE + systemd PATH)
✅ wave44 报告入档 docs-coolie/HERMES-DIALOG-VERIFY.md
✅ 门神测试留了一条 'ping' 评论 (34f75de5) 在 Board Operations issue
✅ brief 测试脚本字段错 (prompt/stream 字段无效 + 缺 Origin 头 → 400/403 误诊)
```

## 2. 目标

**修 3 处**:

A. 修 `server/src/services/board-chat.ts` 错误透传 — 2 处:
   - `stripCliNoise()`: 不要吞 stdout (目前吞 429 文案)
   - `done` 事件: exitCode != 0 或 fullResponse 为空时, 发 `error` 事件 + 落 board-concierge 评论 (这次老板能看到)

B. 删 `ping` 测试评论 (issue_comments 表 where id=34f75de5)

C. 出 docs-coolie/RECHARGE-GUIDE.md — 老板充值/换 key 步骤

## 3. 任务 (5 步)

### 3.1 修 board-chat.ts 错误透传 (2 处)

读 `server/src/services/board-chat.ts`:

#### 修 1: stripCliNoise 改成白名单 (只丢真正 noise, 429/timeout 都留下)

```ts
// 当前 (估计, 类似)
function stripCliNoise(line: string): string | null {
  if (/^API call failed/.test(line)) return null; // ❌ 吞 429
  return line;
}

// 改成
function stripCliNoise(line: string): string | null {
  // 真噪声只丢这些 (进度提示, 不影响对话)
  if (/^thinking[. ]*$/.test(line)) return null;
  if (/^streaming tool/i.test(line)) return null;
  // 删 /^API call failed/ — 这是错误信息, 必须透传给客户端
  return line;
}
```

#### 修 2: done 事件发 error (fullResponse 空 或 exitCode != 0 时)

```ts
// 当前 (估计)
on("close", (code) => {
  sendSSE("done", { exitCode: code });
});

// 改成
on("close", (code) => {
  if (code !== 0 || !fullResponse.trim()) {
    // 错误: 发 SSE error 事件 + 落 board-concierge 评论 (老板下次能看到)
    const errMsg = stdoutAndErr.trim() || `hermes exited ${code} with no output`;
    sendSSE("error", { message: errMsg, exitCode: code });
    
    // 落评论 (issue_comments 表, author_user_id=board-concierge)
    await saveComment(issueId, {
      authorUserId: "board-concierge",
      body: `[hermes-error] exit=${code}, output: ${errMsg.slice(0, 500)}`,
      createdAt: new Date(),
    });
  } else {
    sendSSE("done", { exitCode: code });
  }
});
```

### 3.2 删 ping 测试评论

```bash
ssh tc-coolie-claw 'sudo -u postgres psql coolie -c "DELETE FROM issue_comments WHERE id = '\''34f75de5'\'';"'
```

(用 PostgreSQL DELETE, 因为评论没真用, 只是测试)

### 3.3 出 docs-coolie/RECHARGE-GUIDE.md

新建 `docs-coolie/RECHARGE-GUIDE.md` — 老板充值/换 key 步骤:

```markdown
# GLM 额度充值指引 (PM 2026-09-22)

## 现状
- 智谱 GLM key 每周/月限额用尽 (429 code 1310, 2026-09-25 17:55:41 重置)
- 备用 zhipu paas key 也 429「余额不足」
- Board chat 100% 失败 (铁证: 24 条评论 100% 是老板自己发的)

## 选项 A: 充值 (智谱 GLM)

1. 登录 https://open.bigmodel.cn/
2. 账号: <boss account>
3. 「个人中心」 → 「账户管理」 → 「充值」
4. GLM-5.3-flash 标准价 ¥0.1/1M tokens (5 角色 agent 平均 1K tokens/对话, ¥0.0001/对话)
5. 充值 ¥100 ≈ 100 万次对话 (够老板用 3 个月)

## 选项 B: 换 key (新 key)

1. 智谱新申请 API key: https://open.bigmodel.cn/usercenter/apikeys
2. 把新 key 写到生产 tc-coolie-claw `/opt/coolie/server/.env` 的 `ZHIPU_API_KEY=`
3. sudo systemctl restart coolie (改完重启)
4. (可选) 跑 `hermes chat --oneshot` 验证

## 选项 C: 换模型 (非 GLM)

GLM 不可用时换其他模型:
- 智谱 GLM-4-Flash (¥0.05/1M tokens, 更便宜)
- 智谱 GLM-Z1-Air (思考模式, 慢但更智能)
- OpenAI GPT-4o-mini (¥0.15/1M tokens, 跨地域)

## 推荐
- **短期 (本周)**: 选项 A 充值 ¥100, 立即恢复 board chat
- **中期**: 选项 B 申请新 key + 多 key 轮换 (避免单 key 限额)
- **长期**: 选项 C 切到更便宜模型 + 加 per-agent budget hard-stop (server 已有 budget-check)

## 备份方案 (board chat 直接调 GLM API, 绕过 hermes)
如 hermes CLI 不可用, server 端可直连 `https://open.bigmodel.cn/api/paas/v4/chat/completions` (HTTP) — 文档: https://open.bigmodel.cn/dev/api

## 待办
- [ ] 老板充值 (选项 A 或 B)
- [ ] 服务器改 .env + restart coolie
- [ ] curl /api/board/chat/stream 验证 ping 通
```

### 3.4 server restart + 真验

```bash
# 1. rsync 修后的 server/src/services/board-chat.ts 到生产
rsync -avz server/src/services/board-chat.ts \
  tc-coolie-claw:/opt/coolie/server/src/services/board-chat.ts

# 2. pnpm --filter @paperclipai/server build (server 编译)
pnpm --filter @paperclipai/server build

# 3. rsync dist 到生产
rsync -avz packages/server/dist/ tc-coolie-claw:/opt/coolie/server/dist/

# 4. restart
ssh tc-coolie-claw 'sudo systemctl restart coolie'

# 5. verify health
curl -fsS https://xrobinai.cn/api/health
ssh tc-coolie-claw 'sudo journalctl -u coolie --since "30s ago" --no-pager | tail -10'

# 6. 真跑 board chat SSE (等老板充值后才会返 200)
curl -X POST "https://xrobinai.cn/api/board/chat/stream" \
  -H "Origin: https://xrobinai.cn" \
  -H "Content-Type: application/json" \
  -d '{"issueId":"<id>","content":"ping"}' \
  --max-time 30 | head -20
```

期望: SSE start → (等老板充值) → chunks → done. 现在可能仍 429 (额度问题), 但修后**错误透传**能看到。

### 3.5 commit + push + 发版 0.5.24 + 上 COS

```bash
git add server/src/services/board-chat.ts scripts/delete-ping-comment.sh docs-coolie/RECHARGE-GUIDE.md
git -c user.email=hermes@nous.local -c user.name='Hermes PM' commit -m "fix(server): board-chat 错误透传 + 删 ping 评论 + 充值指引"
git push origin main

# bump 0.5.23 → 0.5.24 (fix 是真修复, patch bump OK)
bash scripts/release-app.sh 0.5.24 "修 board-chat 静默吞错 + 充值指引"
```

## 4. Constraints

- ❌ DON'T 修 server 上游其他逻辑 (只修 board-chat 错误透传)
- ❌ DON'T 触碰 paperclip 上游 (ui/)
- ❌ DON'T 充值/换 key (这是老板的活, 出指引即可)
- ✅ DO 修 2 处 stripCliNoise + done 事件
- ✅ DO 删 ping 评论
- ✅ DO 出充值指引

## 5. semver + PM-CHECKLIST

- 当前 0.5.23
- 修 bug = patch bump → 0.5.24 ✅
- PM-CHECKLIST 32 项 (J1-J3 commit 强制 + I1 semver): J1 git status clean / J2 commit hash 写 version.json / J3 commit push origin / I1 patch bump (修 bug)

## 6. Done definition

5 步全完 + board-chat 修完 + ping 评论删完 + 充值指引入库 + server deploy + 真验 (错误透传) + commit + push + 发版 0.5.24 + 上 COS:

```
Coolie工坊 0.5.24: https://dls.xrobinai.cn/coolie/app/0.5.24/coolie-release.apk
docs-coolie/RECHARGE-GUIDE.md: 充值/换 key 指引
server: board-chat 错误透传 (修完后任何错误老板能看见)
ping 评论: 删 (34f75de5)
```