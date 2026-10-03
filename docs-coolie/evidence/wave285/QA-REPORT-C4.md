# QA-REPORT-C4 — 原生任务页性能真机走查验收 (wave285-C4 / COOA-16)

**状态**: ⏸ **走查未收口 — 执行路径等待拍板** (本报告先落已验事实与执行方案;「性能基准/功能走查」两项结论在装机走查执行后补齐)
**日期**: 2026-10-03 (起草) · **角色**: 门神 / FDSE (`menshen-fdse`)
**仓库**: `/Users/mac/workspace/xaicd/coolie` · main `5200c74ab` · C-1 修复 `d4620810e`
**上轮报告**: `docs-coolie/evidence/wave286/QA-REPORT.md` (代码形状/构建/数据层 3 项 PASS, 真机帧率 BLOCKED, 6 阻断点已定位)

## 0. 结论 (当前快照)

| # | 判据 (工单验收清单) | 结论 | 依据 |
|---|---|---|---|
| 0 | main 上有含 wave285 的可用 APK 产物 | ✅ **已证实** (本轮新证据, 推翻「产物缺失」担忧) | §1 |
| 1 | 性能基准 60fps @ 200 任务 / 5 项目 | ⏳ 未执行 (等路径拍板) | §3 |
| 2 | 虚拟化回归保护 | ⏳ 未执行 (随 §1 装机走查) | §3 |
| 3 | 功能保留清单零回退 | ⏳ 未执行 (同上) | §3 |
| 4 | 错误态/空态下拉刷新 | ⏳ 未执行 (同上) | §3 |

## 1. 产物完整性核实 ✅ (本轮新增证据)

1. **线上在售 APK 就是修复后构建**。本地对 main HEAD (`5200c74ab`) 全新
   `./gradlew assembleRelease -x lint --no-daemon` 产物与下载服务器
   `https://dls.xrobinai.cn/coolie/app/0.6.23/coolie-release.apk` 逐字节一致:

   ```
   9e725185843faf360a6f465e94cbef3f0061d82977ca56cb6aa78ca699ea35b9  server-0623.apk
   9e725185843faf360a6f465e94cbef3f0061d82977ca56cb6aa78ca699ea35b9  本地 main HEAD 构建 app-release.apk
   ```

   APK `Last-Modified: 10:44 +0800` 早于 commit `d4620810e` (15:38 +0800) 曾像
   「旧包」—— 实为**先构建后提交**的时间错觉; 字节级一致证明服务器产物与
   wave285 修复后的 main 同源。
2. **bundle 标记核验**: APK 内嵌 `assets/index.android.bundle` 含
   `stickySectionHeadersEnabled` ×1 (wave285 前该 prop 在 `clients/expo` 仅存在于
   注释/`UnifiedDiffViewer` 不相关用法; 提交后唯一真实使用点即 `IssuesList`
   分组视图), 及 `getItemLayout` / `removeClippedSubviews` / `initialNumToRender`
   — wave285 虚拟化代码在包内。
3. **待验风险 (OTA)**: prod 在 10:44:52 发布了 OTA manifest
   (runtimeVersion `0.6.23`, launchAsset `index-3530b071….hbc`, 5,049,855 B)。
   App 冷启会拉 OTA **覆盖内嵌 bundle** (上轮报告阻断点 #5 实测)。
   **OTA bundle 是否同样含 wave285 尚未验证** —— 若为旧 JS, 老板真机上实际
   运行的仍是改造前代码, 优化形同未发布。此项为对 prod 的只读核验
   (下载该 .hbc + 同标记 grep), 因 prod 访问需拍板而挂起 (§3)。

## 2. 走查执行方案 (就绪, 等拍板)

双 AVD (`coolie-test` android-34 / `coolie-api28` android-28) 均可启动
(上轮实测 `coolie-test` 冷启 31s)。上轮 6 条阻断点的解法已全部明确:

| 阻断点 (上轮 §5.2) | 解法 | 状态 |
|---|---|---|
| 1. 无实体设备 | 工单口径即「双模拟器装机」, AVD 是被认可的替代 | 就绪 |
| 2. release 禁明文 HTTP | 本地路径才需要: QA-only manifest 覆盖 (networkSecurityConfig 仅放行 10.0.2.2/127.0.0.1), 不改产品 JS | 就绪 (仅本地路径) |
| 3. dev 实例拒 hostname | `npx paperclipai allowed-hostname 10.0.2.2` 或 `adb reverse tcp:3100 tcp:3100` | 就绪 (仅本地路径) |
| 4. dev 无 Better Auth 登录 | 代码核实: `server/src/app.ts:632` betterAuthHandler 仅 prod 注入; 本地无法邮箱登录。本地路径需依赖 App 对 local 隐式会话的放行, 未证实 | **风险项** |
| 5. prod OTA 覆盖内嵌 bundle | prod 路径下 OTA **就是**被测对象 (真实发货链路); 本地路径用 radio-off + adb reverse 规避 | 就绪 |
| 6. 无 200 任务数据集 | 造数: 5 项目 × 40 任务, 脚本 `tests/perf/native/perf-dataset.mjs` (本地/prod 双后端参数化) | 脚本就绪 |

采帧方案: `tests/perf/native/measure-fps.sh`
(`dumpsys gfxinfo cloud.coolie.app reset` → 脚本化 `input swipe` 匀速滚动列表/分组视图 →
回收 jankyFrames / percentile 分帧数据; 每视图 3 轮取中位)。

### 待拍板: 数据后端与登录路径 (阻塞 §1 走查执行)

- **A. prod 路径 (保真度最高)**: 装 prod-targeted release APK → App 拉 prod OTA
  (真实发货 JS) → 老板账号登录 → 新建 `perf-smoke-<ts>` 测试公司
  (prod 已有 `prod-smoke-*` 先例, 不碰 `xrobinai` 真实公司) → 造 200 任务 → 走查。
  ⚠️ 涉及: 老板账号登录 prod + prod 写入测试数据。**上一轮心跳对 prod 的只读
  核实操作被用户拦下, 本路径需显式批准后才执行。**
- **B. 本地路径 (零 prod 接触)**: dev-targeted release APK + QA-only manifest 覆盖
  + allowed-hostname/adb reverse + 本地造 200 任务 → 走查。
  ⚠️ 风险: 阻断点 #4 (本地无邮箱登录) 未证实可绕过; 若 App 强制登录页则此路径不通。
- **C. 人肉真机走查**: 门神出走查清单 + 判读帧数据, 老板/同学在真机执行。
- **D. 本轮仅出受限结论**: 已验项落盘, 真机项判 BLOCKED 收口 (上轮做法延续)。

## 3. 走查清单执行记录 (待补)

_装机走查执行后逐项回填: PASS/FAIL + 实测帧率/掉帧数据 + 截图路径
(`screenshots/wave285/`, 本地留档不入 git)。缺陷按 qa-humanlike-e2e 铁律
发现即建缺陷任务 (严重度 + 截图 + 复现步骤), 本报告只做索引。_

- [ ] 1. 性能基准: 列表视图 60fps @ 200 任务 —
- [ ] 1. 性能基准: 分组视图 60fps @ 5 项目分组 —
- [ ] 1. 下拉刷新全程流畅 —
- [ ] 2. 虚拟化回归: 无外层 ScrollView 布局异常; sticky 节头吸顶、行不透出 —
- [ ] 3. 功能保留: 今日+进行中/全部、三视图、状态/指派/项目/排序/主线筛选、搜索、浮动审批、FAB 新建、长按聚焦下钻、看板拖拽 —
- [ ] 4. 错误态/空态下拉刷新可用 —

## 4. 环境留痕 (本轮实跑)

```
shasum -a 256  # server-0623.apk == 本地 main HEAD 构建 (见 §1)
unzip -p app-release.apk assets/index.android.bundle | grep -c stickySectionHeadersEnabled  # 1
git -C /Users/mac/workspace/xaicd/coolie log --oneline -1  # 5200c74ab (main)
```

*门神 (FDSE) · wave285-C4 · 2026-10-03*
