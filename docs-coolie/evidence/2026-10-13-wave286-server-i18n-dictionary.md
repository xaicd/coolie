# COOA-145 / COOA-135 · 服务端错误码 / 状态机 / 枚举 i18n 字典落地存证

- **来源**: 【微信·老板·wave286】派兑底渊立即接手 COOA-135
- **责任员工**: 铁匠 (agent `02cab729-c5b7-4a14-9ce9-5a34885c336a`)
- **仓库**: `xaicd/coolie` (Paperclip 上游全量国际化主线 COOA-116 后端子线)
- **CMMI 门禁**: Phase 4.1 编码
- **状态**: 字典落地 + locale-aware 序列化 + 防退化守卫 全部通过

---

## 1. Echo · 业务价值与高管 Outcome

老板/客户在管理后台/接口上看到的服务端错误文案此前是**英文硬编码**（如 `Not found`）。
本次将服务端错误码/状态机/枚举统一纳入双语字典，并通过 `?locale=` / `Accept-Language`
实现 **locale-aware 错误响应**（中文客户端看到中文，英文/未指定客户端保持原英文，零破坏）。

## 2. 交付物（commit 见 Paperclip 工作产物）

| 文件 | 说明 |
|---|---|
| `server/src/i18n/errors.json` | 错误字典 en + zh-CN（13 个 Web 契约共享码 + 11 个服务端专属码） |
| `server/src/i18n/statuses.json` | 状态机/枚举字典 en + zh-CN（任务/run/Agent/审批/例行/活动） |
| `server/src/i18n/index.ts` | `tError/tStatus/tActivity/resolveLocale` 等纯函数 |
| `server/src/services/errors.ts` | 对外契约：`tError/tStatus` + `resolveRequestLocale` + `localizeHttpErrorMessage` |
| `server/src/errors.ts` | `HttpError` 增加可选 `i18nKey` |
| `server/src/middleware/error-handler.ts` | 错误响应序列化器接入 locale-aware 翻译（opt-in） |
| `server/src/i18n/__tests__/{errors,statuses}.test.ts` | 字典双语对齐 + 占位符 + 兜底单测 |
| `server/src/__tests__/error-handler-localization.test.ts` | 真 HTTP（supertest loopback）序列化单测 |
| `scripts/check-server-i18n.mjs` + `check:governance` §21 | 防退化自动化守卫 |

## 3. Delta · 真实验证（真机/真实接口跑通）

### 3.1 单测（vitest，真 HTTP loopback）

```
cd server && pnpm exec vitest run \
  src/i18n/__tests__/errors.test.ts src/i18n/__tests__/statuses.test.ts \
  src/__tests__/error-handler-localization.test.ts \
  src/__tests__/error-handler.test.ts src/__tests__/json-parse-error-handler.test.ts
→ Test Files 5 passed (5) · Tests 40 passed (40)
```
（含既有 `error-handler` / `json-parse-error-handler` 回归用例，证明默认英文行为零回归）

### 3.2 类型检查（生产编译口径）

```
cd server && tsc --noEmit -p tsconfig.json   → exit 0
```
并验证 `tsc` 构建会将 `i18n/*.json` 复制进 `dist/`（ESM `with { type: "json" }` 运行时实测可读）。

### 3.3 真机 HTTP curl（真 express + errorHandler 中间件）

```
$ curl -s http://127.0.0.1:PORT/api/not-found
{"error":"Not found"}                                   # 无 locale → 保持原英文（零破坏）

$ curl -s -H 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8' http://127.0.0.1:PORT/api/not-found
{"error":"未找到资源。","locale":"zh-CN"}               # 中文

$ curl -s 'http://127.0.0.1:PORT/api/auth?locale=zh-CN'
{"error":"您尚未登录。","locale":"zh-CN"}               # ?locale= 生效

$ curl -s -H 'Accept-Language: fr-FR' http://127.0.0.1:PORT/api/not-found
{"error":"Not found"}                                   # 不支持的 locale → 英文兜底
```

### 3.4 Dev 反向传播 · 治理守卫

```
$ pnpm check:governance
... §21 服务端错误码/状态机/枚举 i18n 字典契约防退化守卫 ...
  ✅ R1 字典 en+zh-CN 装载   ✅ R2 错误码双语对称 (24)
  ✅ R3 占位符双语一致       ✅ R4 分组/键/占位符对称
  ✅ R5 四大状态机全集       ✅ R6 与 Web errors 契约逐字 1:1
  ✅ R7 helper + 序列化器接入
🎉 全面管局审计全绿通过！  (exit 0)
```

## 4. 设计要点（零破坏 + 单一真源）

- **Opt-in 本地化**：仅当请求显式携带 `?locale=` 或 `Accept-Language`（且命中受支持 locale）
  才翻译；否则响应体与改造前**逐字节一致**，既有测试与客户端零影响。
- **单一真源**：`errors` 共享词条与 Web 端 `ui/src/i18n/locales/{zh-CN,en}.json` 的 `errors`
  命名空间逐字一致（守卫 R6 固化 1:1 同步）。
- **双语对齐守卫**：错误码/枚举键/`{{占位符}}` 在 en/zh-CN 之间必须对称，防漏译退化。

## 5. 后续（非本工单阻断）

字典与序列化机制已就位；`server/src/**` 中个别自定义 `throw new HttpError(...)` 调用点
可逐步补挂 `i18nKey`（或依赖按 HTTP 状态的通用码兜底）以提升上下文精确度——属可选渐进收敛。
