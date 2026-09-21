# ChatHome 是默认，plugin-chat 是 opt-in

日期:2026-09-21(wave 6)。老板拍板:「咱们默认开启自己的 chathome」,以及「plugin-chat 不如咱们的 chathome 吧」。

一页说清四件事:**默认走什么**、**plugin-chat 怎么还留着**、**为什么替换**、**怎么临时启用**。

## 1. 默认:Coolie fork 走 ChatHome

自托管(Coolie 自己的部署)启动时的默认聊天面就是 **ChatHome**。Boot 日志会给出一行明确的确认:

```
[chat] using ChatHome (Coolie fork) — plugin-chat disabled by default. Set COOLIE_USE_PLUGIN_CHAT=true to enable.
```

看到这行 = 走的是 ChatHome,没有加载 plugin-chat。

## 2. plugin-chat 是 opt-in(env var)

plugin-chat 没有被删除,只是**默认不装**。要临时启用,设一个环境变量:

```sh
COOLIE_USE_PLUGIN_CHAT=true pnpm dev
```

此时 boot 日志变成:

```
[chat] plugin-chat enabled via COOLIE_USE_PLUGIN_CHAT=true (Coolie fork).
```

判定很窄:**只有字面量 `true`**(大小写不敏感、去首尾空格)才算开启;`1` / `yes` / 空值都仍然走 ChatHome。

### 实现位置

- `server/src/services/bundled-plugins.ts`
  - `USE_PLUGIN_CHAT_ENV_VAR` —— 环境变量名常量
  - `isPluginChatEnabled(env)` —— 判定
  - `resolveSelfHostedAutoInstallKeys(env)` —— 自托管启动实际使用的自动安装列表,开启时等于 `SELF_HOSTED_AUTO_INSTALL_KEYS`,否则从中去掉 `chat`
- `server/src/app.ts` —— 用上面的解析结果替代原来的 `SELF_HOSTED_AUTO_INSTALL_KEYS`,并打印那行 boot 日志
- `scripts/fork-surface.json` —— 两个上游文件都已登记(带 reason),属于有意分歧

**只影响自托管。** 托管实例(有 `PAPERCLIP_MANAGED_CONFIG`)的安装列表来自控制面,不走这里,行为不变。

## 3. 历史:为什么 plugin-chat 可以退场

plugin-chat 是早期迁移(在「重叠审计」纪律之前)造的插件。它当初的能力清单是:

- `chat` / `mvp` / `vibe` / `build` / `office` 几种模式(paperclip 的抽象概念)
- `database.namespace.migrate` —— 想有自己的一套 DB
- `plugin.state.read/write` —— 自己的 key-value 状态
- `api.routes.register` —— 自己注册 HTTP 路由

一句话:它想做一个**平行的会话系统**。而 Coolie fork 今天用的是别的:

| plugin-chat 的意图 | 今天谁覆盖 |
| --- | --- |
| chat / mvp / vibe 对话 | **ChatHome** —— `server/src/routes/board-chat.ts`(SSE)+ `clients/expo/src/components/board-inline/`、`clients/h5/src/components/board-inline/`(tagParser / 预览 / 工作空间) |
| build / office 模式 | **ChatHome 的 build 面** + `server/src/services/build-orchestrator.ts` |
| 自带的 DB / state / 路由 | Coolie 的 server 路由与本体能力,不需要插件自带一套 —— `packages/ontology-core/src/mcp/` |
| 「该谁干活、谁能不能否」 | **5 角色** (`packages/agents/role-templates/`:core-swe / ds / fdse / fda / pre-sre) + **DS veto**(go/no-go 门) |

也就是说 plugin-chat 的设计意图已被 ChatHome + 5 角色 + DS veto **全面覆盖**,且 Coolie 走的是「复用宿主、不另起平行库」那条纪律。

补充事实(与 wave 5 brief 一致):plugin-chat 的**源码早在 `9e0c62b50`「chore(plugins): retire plugin-chat」就被移出 git**(README/src/manifest/store/worker/tsconfig 全删,历史留在 git 里)。此后本地与生产上留下的只是 `dist/` + `node_modules/` 构建产物,没有 `package.json`,启动时会报 `Missing package.json`。

## 4. 目录现状:`_deprecated/`

```
packages/plugins/_deprecated/plugin-chat/   # 只剩 dist/ + node_modules/(构建产物)
```

- 从 `packages/plugins/plugin-chat/` 移到 `packages/plugins/_deprecated/plugin-chat/`。
- 这一步是**文件系统移动,不是 `git mv`**:该目录里没有任何被 git 跟踪的文件(`build` 产物在 `.gitignore` 里),`git mv` 会报 `source directory is empty`。所以「历史保留」靠的是 `9e0c62b50` 那次提交,不是这次移动。
- 目录保留(不删)的原因:极少数老用户/参考实现可能还在用它的 `dist`,按 wave5/wave6 的约束「不删 plugin-chat 代码」。
- 目录**不在 pnpm workspace 的包列表里**(`packages/plugins/*` 只匹配一层,且它没有 `package.json`),不会参与构建。

## 5. 怎么验证

```sh
# 1. 默认:不带 env 启动,应看到 ChatHome 那行,且没有 Missing package.json 报错
pnpm dev

# 2. opt-in:带上 env,应看到 enabled 那行
COOLIE_USE_PLUGIN_CHAT=true pnpm dev

# 3. 单测
pnpm vitest run server/src/__tests__/bundled-plugins.test.ts
```

## 6. 边界

- 不改 `clients/expo/` `clients/h5/` `ui/`(已发布)。
- 不删 plugin-chat 代码;不从 workspace 移除它。
- 不动其它插件。
- 后续若真要彻底删掉 `_deprecated/plugin-chat` 这份构建产物,先确认没有引用点,再单独派单。
