# WAVE157 — 开发基座（5 默认模块, 不含业务）+ API Key/实例目标修 · QA 报告

- 日期: 2026-09-30
- 波次: wave157
- 纪律: 未动 CMMI / spec-driven / ontology / 审计（wave152–155 已完成）；未改
  `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`；未启停 dev 进程；未用 `eas build`；
  未新增业务域（bpm/pay/mall/crm/erp/wms/mes/im）。
- 本波版本: **v0.6.2**（App 发版；含 wave153 客户端改动 + 本波基座/API Key 修）。

> **诚实标注（先读）：**
> 1. **B 的根因与 brief 描述不符** —— brief 说「模拟器 App（0.5.96）走的是 127.0.0.1:3100 dev
>    instance」。**实测**：模拟器上装的是 **0.6.0（versionCode 600）**，其 APK 内联的实例地址是
>    **`https://xrobinai.cn`（生产）**，不是 dev（见 `installed-apk-base-url.txt`）。所以那次 401
>    是「**app 打生产、但填的 key 不是生产 key**」，而不是「app 打了 dev」。
> 2. **「模拟器 → dev」目前仍被 dev 实例自己挡住**：模拟器能到 `10.0.2.2:3100`，但 dev 实例的
>    **私网主机名白名单**对 `Host: 10.0.2.2:3100` 回 **403**（`localhost` / `127.0.0.1` 回 200）。
>    要让模拟器真正登录 dev，需 `npx paperclipai allowed-hostname 10.0.2.2` 并重启 dev ——
>    本波按纪律**未启停 dev**，故只交付代码 + 把这个前提写清楚。
> 3. **未做**：模拟器上用新构建真跑一次登录（装的是旧包 0.6.0；本环境无 dev board key，
>    且新包需重新构建安装）。凡未跑的都直说，不假装。

---

## 0. 结论速览

| 件 | 需求 | 结论 | 证据 |
|---|---|---|---|
| **A1** | workspace-skel 重写为开发基座（5 默认模块, 无业务） | ✅ 完成 | §2 + `templates/workspace-skel/` |
| **A2** | `scripts/new-company.sh` 改拉轻量底座 `coolie-base-1.0` | ✅ 完成 | §3 |
| **A3** | `CreateProjectSheet.tsx` 4 预设 → 1 个（+ Web 同步） | ✅ 完成 | §4 |
| **A4** | workspace-template spec 同步 + 对比表 + 定制指南 | ✅ 完成 | §5 |
| **B** | `coolie.ts` 加 serverUrl 切换 + `detectAndSetApiBaseUrl()` | ✅ 代码完成并验证分支；⚠️ 模拟器登录未跑 | §6 |

---

## 1. 真值方法

- 所有 curl / adb 原始输出留在 `docs-coolie/evidence/wave157/`（`curl/*.txt|json`）。
- `detectApiBaseUrl()` 的 4 个分支用 **esbuild 打包真实源码 + node harness 实跑**，
  非「看代码推断」（`curl/instance-target-runs.txt`，4/4 pass）。
- 模拟器为正在运行的 `emulator-5556`（AVD `coolie-api28`）。

---

## 2. A1 — workspace-skel 重写为「开发基座」（5 默认模块）

**改动**（`templates/workspace-skel/`）:

- 新增 `modules/{system,infra,member,audit,api}/README.md` 5 个默认模块骨架：
  system（用户/角色/权限/菜单/字典）、infra（文件存储/代码生成/通知/定时任务）、
  member（会员体系）、audit（审计日志）、api（OpenAPI 文档）。
- 新增 `docs/ARCHITECTURE.md`（含「5 默认模块 vs 15 全栈域」对比表 + 按标书定制开发
  playbook + 扩展点）、`docs/README.md`。
- `README.md` 重写为「开发基座（空壳 + 5 默认模块, 不含业务域）」。
- `cli/{fda,core-swe,pre-sre,fdse,ds}.sh` 重写为**骨架**（空 `dispatch()` 函数 + TODO）。
- **删除** `.gitmodules`（ruoyi-all-next 子模块）、`scripts/import-ruoyi.sh`、
  `docs/.gitkeep`：**不留任何业务域兼容层**（boss 拍板「只搞默认模块」）。
- `scripts/bootstrap.sh` 改为校验「5 角色 + 5 默认模块」，不再做 submodule init。

**不预装的业务域（真删）**：bpm / pay / report / mp / mall / crm / erp / wms / mes / im。

**验证**：`find templates/workspace-skel -type f` 见树；`bash -n` 全部 shell 通过（§7）。

```
templates/workspace-skel/
├── README.md
├── models.yaml
├── docs/{README.md,ARCHITECTURE.md}
├── modules/{README.md,system/,infra/,member/,audit/,api/}
├── cli/{fda,core-swe,pre-sre,fdse,ds}.sh
├── scripts/bootstrap.sh
├── specs/.gitkeep
└── .agents/skills/.gitkeep
```

---

## 3. A2 — `new-company.sh` 改拉轻量底座

- 旧的「`git submodule add ruoyi-all-next`」步骤替换为**可选**拉取轻量底座：
  `git clone --depth 1 --branch "$BASE_TAG" "$BASE_REPO" coolie-base`。
- 默认 `COOLIE_BASE_REPO=https://github.com/xaicd/ruoyi-all-next.git`、
  `COOLIE_BASE_TAG=coolie-base-1.0`（均可用环境变量覆盖）。
- 拉不到（网络不可达 / tag 未就绪）**不阻断立项**，基座骨架本身已可用。
- 步骤编号修正为 `[1/5]…[5/5]`（原 `[1/4]/[2/4]` 与后续 `[3/5]…` 不一致）。

> 前置（诚实）：`coolie-base-1.0` **tag 需由拥有 `xaicd/ruoyi-all-next` 推送权限的一方创建**。
> 本波无法创建/推送该 tag（另一个仓、且属公开推送）。tag 不存在时脚本按「可选」跳过。

**验证**：`bash -n scripts/new-company.sh` 通过；残留 `ruoyi` 引用仅为「历史说明」与
「轻量底座仓库 URL」两处（`grep` 见 §7）。

---

## 4. A3 — 模板预设 4 → 1（App + Web）

- `clients/expo/src/components/CreateProjectSheet.tsx`：`TEMPLATE_PRESETS` 由 4 项改为 1 项：
  - name `Coolie 开发基座` / tag `5 默认模块 + 客户定制`（替代「全栈」）/
    desc `内置 SQLite/Prisma/认证/权限/审计, 无业务域; 按项目标书快速定制`。
  - **删除** RuoYi-All-Next / Spring Cloud Alibaba / RuoYi-Vue-Pro / JeecgBoot 4 个按钮。
  - 分区标题 `快速填入开源复杂项目预设` → `快速填入开发基座预设`。
- **同时改了 Web 面** `ui/src/components/NewProjectDialog.tsx` 的**同一份预设列表**——
  brief 只点了 App 文件，但 boss 明令「不要用 Spring Cloud Alibaba / RuoYi-Vue-Pro /
  JeecgBoot」，若只改 App，Web 端仍会列出这 3 个被禁框架（两处必然漂移）。故两处一致。
  **若认为 Web 不该动，可单独回退该文件，不影响 App。**

**验证**：`clients/expo` `tsc --noEmit` exit 0；`ui` `tsc --noEmit` exit 0；
`pnpm check:token-gates` 4 关全 CLEAN（§7）。

---

## 5. A4 — workspace-template spec 同步

`docs-coolie/specs/2026-09-21-coolie-workspace-template.md`:

- 顶部加**修订块**（2026-09-30, wave157）声明现行决定：15 域 → 5 默认模块、不含业务。
- §1.4 / §3.1 / §3.5 / §5 / §6 / §7 就地改为 5 默认模块口径（§3.5 原「ruoyi-all-next 预装」
  改为「开发基座预装」）。
- 新增 §10「5 默认模块 vs 15 全栈域」对比表（含「为什么这样选」）。
- 新增 §11「按标书定制开发」playbook。

---

## 6. B — 实例目标切换 + `detectAndSetApiBaseUrl()`

### 6.1 代码

- 新增**纯、无依赖**模块 `clients/expo/src/instanceTarget.ts`：基座地址决策从这里出
  （`PROD_INSTANCE_BASE_URL` / `DEV_INSTANCE_BASE_URL` / `detectApiBaseUrl()` / `originOf()`）。
  抽出的理由：这是「决定意义」的逻辑，且要能**单独实跑**（否则只能看代码）。
- `clients/expo/src/coolie.ts`：从上面 re-export（既有 6+ 处 `COOLIE_BASE_URL` 调用点不变）；
  `CoolieClient.setApiBaseUrl()` 运行时改实例地址（baseUrl + origin 同步）；
  新增 `detectAndSetApiBaseUrl()`。
- 优先级：`EXPO_PUBLIC_COOLIE_BASE_URL`（显式全量覆盖）> `EXPO_PUBLIC_COOLIE_USE_DEV_INSTANCE=1`
  （dev，`EXPO_PUBLIC_COOLIE_DEV_BASE_URL` 可改地址）> **生产（默认不变）**。
- dev 默认地址 `http://10.0.2.2:3100`（Android 模拟器对宿主 `127.0.0.1` 的别名）；
  iOS 模拟器可用 `EXPO_PUBLIC_COOLIE_DEV_BASE_URL=http://localhost:3100` 覆盖。

### 6.2 实测（`curl/instance-target-runs.txt`，4/4 pass）

| 环境变量 | 结果 |
|---|---|
| 无 | `https://xrobinai.cn`（默认不变） |
| `USE_DEV_INSTANCE=1` | `http://10.0.2.2:3100` |
| `USE_DEV_INSTANCE=1` + `DEV_BASE_URL=http://localhost:3100` | `http://localhost:3100` |
| `BASE_URL=http://192.168.3.85:3100`（+use-dev） | `http://192.168.3.85:3100`（显式覆盖胜出） |

### 6.3 两个实例确实不同（`curl/dev-health.json` / `prod-health.json`）

| | dev `localhost:3100` | prod `xrobinai.cn` |
|---|---|---|
| deploymentMode | `local_trusted` | `authenticated` |
| deploymentExposure | `private` | `public` |
| localAiLoginSupported | `true` | `false` |

→ 两者是**不同部署**，各自有各自的 board key；一把 key 打另一个实例会被拒。

### 6.4 模拟器实测（`curl/emulator.txt`, `installed-apk-base-url.txt`）

- 模拟器 `emulator-5556`（AVD `coolie-api28`），已装 `cloud.coolie.app` **0.6.0 / code 600**。
- `adb reverse --list` 空（无反向隧道）。
- `ping 10.0.2.2` 通（0% 丢包）→ 模拟器可达宿主。
- 模拟器打 `http://10.0.2.2:3100/api/health` → dev 实例回 **403**
  `"This hostname is not allowed for this Paperclip instance…"`。
- 装好的 APK 内联地址 = `https://xrobinai.cn`（**生产**），无 `10.0.2.2`/`127.0.0.1` 字样。

**结论 / 前提**：要让模拟器真正用 dev 登录，需二选一（均属 dev 实例配置，本波未做）：
1. `npx paperclipai allowed-hostname 10.0.2.2` 且**重启 dev**（白名单在启动时读入）；或
2. 用 `EXPO_PUBLIC_COOLIE_DEV_BASE_URL=http://localhost:3100` + `adb reverse tcp:3100 tcp:3100`
   （`localhost` 已在白名单内）。

### 6.5 未做（诚实）

模拟器上用**新构建**真跑一次 dev 登录 —— 未做。原因：装的包是改动前的 0.6.0；本环境无
dev board key；且需重新 `gradle` 构建 + 安装 + 驱动 UI。故本节只到「代码分支已验证 + 可达性/
白名单障碍已实测」，不宣称登录跑通。

---

## 7. 验证命令与结果

```
clients/expo: npx tsc --noEmit            → exit 0
ui:           npx tsc --noEmit            → exit 0
root:         pnpm check:token-gates      → 4 关全 CLEAN
shell:        bash -n  new-company.sh / bootstrap.sh / cli/*.sh → 全 OK
logic:        esbuild+node harness, detectApiBaseUrl 4 分支 → 4/4 pass
```

---

## 8. 交付物 / 边界

- 本波**未**发新业务域、**未**动 CMMI/spec-driven/ontology/审计、**未**启停 dev。
- A3 额外同步了 Web 端预设（理由见 §4）；如需最小化可单独回退。
- `coolie-base-1.0` tag 需有推送权限的一方创建（§3）。
- 模拟器登录 dev 的 dev 端前提（hostname 白名单）已写明（§6.4），由运维/老板决定是否
  在 dev 上加白名单并重启。
