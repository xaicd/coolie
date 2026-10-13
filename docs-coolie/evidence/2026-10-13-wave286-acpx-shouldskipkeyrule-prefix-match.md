# COOA-143 · ACPX `shouldSkipKeyRule` 前缀匹配 (prefix-match) 加固

- 来源: 📱 微信 (老板直接发话) — Hermes 派发
- 员工: 铁匠 (claude_local)
- 梯次: L2-标准功能 · CMMI 门禁: Phase 4.1 编码
- 日期: 2026-10-13

## 1. 业务阻碍与交付 Outcome

ACPX 会话持久化用 `assertPersistedKeyPolicy` 强制**蛇形命名 (snake_case)** 键校验。
`acpx.session_options.env` 是任意环境变量名 (可能含大写/驼峰) 的 blob，必须豁免该规则。
原实现 `MAP_OBJECT_PATHS.has(joinPath(path))` 是**精确路径匹配**，只能命中恰好位于
record 顶层的 `acpx.session_options.env`；一旦 record 带任意顶层前缀
(如 `wrapper.record.acpx.session_options.env`)，豁免失效 → 合法会话写盘被
`Persisted key policy violation` 拦截。

**Outcome:** 用前缀匹配改写 `shouldSkipKeyRule`，使 `acpx.session_options.env`
在**任意 record 顶层前缀下**都不做 snake_case 键校验，同时不误伤仅共享后缀的同级键
(如 `someacpx...`、`..envX`)。

## 2. 改动

`patches/acpx@0.13.1.patch` — `dist/live-checkpoint-BSIrfgVo.js` 中
`shouldSkipKeyRule` 由精确匹配改为路径段后缀匹配：

```js
function shouldSkipKeyRule(path) {
  const joined = joinPath(path);
  for (const candidate of MAP_OBJECT_PATHS) {
    if (joined === candidate || joined.endsWith(`.${candidate}`)) return true;
  }
  return false;
}
```

`MAP_OBJECT_PATHS` 已在同 patch 内加入 `"acpx.session_options.env"`。

`scripts/acpx-patch-packaging.test.mjs` — 新增防退化守卫
`installed ACPX runtime skips persisted key rules under any record prefix`：
从已安装的 ACPX 运行时 chunk 中抽取 `shouldSkipKeyRule` 并断言精确命中、
带前缀命中、以及后缀边界不误伤。

## 3. Delta 真实验证 (命令结果存证)

### 3.1 patch 打包守卫 (含新增前缀匹配守卫)

```
$ node --test scripts/acpx-patch-packaging.test.mjs
✔ installed ACPX runtime skips persisted key rules under any record prefix (1.04ms)
ℹ tests 17  ℹ pass 17  ℹ fail 0
```

### 3.2 安装态运行时确认

```
$ grep -A4 "function shouldSkipKeyRule" node_modules/.pnpm/acpx@0.13.1_patch_hash=kqz6.../dist/live-checkpoint-*.js
function shouldSkipKeyRule(path) {
	const joined = joinPath(path);
	for (const candidate of MAP_OBJECT_PATHS) {
		if (joined === candidate || joined.endsWith(`.${candidate}`)) return true;
```

### 3.3 packages/adapter-utils vitest 全套 (源码面)

```
$ pnpm exec vitest run --project @paperclipai/adapter-utils --exclude "**/dist/**"
 Test Files  4 failed | 54 passed (58)
      Tests  4 failed | 1245 passed | 11 skipped (1260)
```

4 个失败均为**环境噪声**，与本改动无关 (本改动仅触及 acpx@0.13.1，而 adapter-utils 依赖 acpx@0.12.0)：

| 失败用例 | 根因 |
| --- | --- |
| `git-workspace-sync` 巨量噪声用例 | 满载下 5000ms 默认超时 |
| `github-launcher` 凭据清理用例 | 运行器环境注入的 `PAPERCLIP_API_KEY` 泄漏 |
| `server-utils` runChildProcess 进程组 | 满载下时序抖动 |
| `workspace-restore-merge` 快照用例 | Paperclip 长 TMPDIR → Unix socket 路径 > 104 字节 `EINVAL` |

**洁净环境复跑 (短 TMPDIR + 清空嵌入凭据) 全部通过:**

```
$ env -u PAPERCLIP_API_KEY -u PAPERCLIP_API_URL TMPDIR=/tmp/pp \
    pnpm exec vitest run --project @paperclipai/adapter-utils --exclude "**/dist/**" \
    src/git-workspace-sync.test.ts src/github-launcher.test.ts \
    src/server-utils.test.ts src/workspace-restore-merge.test.ts
 Test Files  4 passed (4)
      Tests  189 passed (189)
```

### 3.4 管局审计

```
$ pnpm check:governance
🎉 全面管局审计全绿通过！ (0 报错)
```

## 4. 入库

- 改动随仓库并发提交流入 `main`：commit `6241d8cce`
  (`feat(i18n): 落地服务端错误码与状态机 i18n 字典并加固 Metro/ACPX 运行时 (COOA-135)`)，
  已 push 至 `origin/main`。
- 落地文件：`patches/acpx@0.13.1.patch`、`scripts/acpx-patch-packaging.test.mjs`。
- 防退化守卫：`scripts/acpx-patch-packaging.test.mjs::installed ACPX runtime skips persisted key rules under any record prefix`。
