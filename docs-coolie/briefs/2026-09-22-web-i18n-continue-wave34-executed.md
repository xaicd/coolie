# wave34 (executed) — Coolie Web 0.6.4: 底部 5 tab 中文 + i18n 字典 +118 + 修底栏重叠

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes · Worker: cmd · Date: 2026-09-22

Brief: `docs-coolie/briefs/2026-09-22-web-i18n-continue-wave34.md`

## 0. 产物

| | |
| --- | --- |
| versionName | `0.6.4-paperclip-web` |
| versionCode | `4` (was 3) |
| APK size | 66,081,850 bytes (~63.02 MB) |
| SHA-256 | `d41194a849486670fab100f1d3ce67f0d2b6271ebb0e17fba2d8e33bc1b5ef13` |
| COS | `cos://gzbucket/coolie/app/0.6.4-paperclip-web/coolie-release.apk` |
| 直链 | https://dls.xrobinai.cn/coolie/app/0.6.4-paperclip-web/coolie-release.apk |
| 证据目录 | `/tmp/emu-evidence/wave34-0.6.4/` |

## 1. 改了什么 (`clients/expo-paperclip-web/`, 只动壳, 没碰 `ui/`)

- `App.tsx`
  - `I18N_PATCH` 字典: **336 条**(wave34 前 ~218) —— 本轮 **+118**。
  - 新增 `I18N_PATTERNS`(6 条): 运行时拼出来的动态文案，字典的「整段全等」够不到。
    例: `Finished 2d ago` → `2d 前完成`、`12h ago` → `12h 前`、`1 agent` → `1 位员工`。
  - 新增 `I18N_CSS_PATCH`: 把底部导航钉成不透明，修「重叠」(见 §2)。
  - `start()` 加 3 次延时兜底重扫 (300/1000/2500ms)，抹掉真机上的 observer 时间窗 (见 §3)。
- `app.json` / `package.json` / `android/app/build.gradle`: `0.6.2 → 0.6.4`, `versionCode 3 → 4`
  (`android/` 是 gitignore 目录，`app.json` 是事实来源，两个都要同步改)。
- `README.md`: 表里的 versionName / runtimeVersion 对齐到 0.6.4。

未做: 未新加任何 server API；未改 `ui/`(fork-surface 保护目录)；wave33「仿豆包」按 brief §4 串行，未动。

## 2. 底部 tab「重叠」根因 (真复现了)

不是 i18n 问题，是 **light 主题下底栏半透明**:

- `ui/src/components/MobileBottomNav.tsx` 的底色是 `bg-border/50 … dark:bg-muted` ——
  只有 **dark** 主题不透明；web 站默认 **light**，于是 `fixed bottom-0` 的半透明导航条
  下方滚过的正文会**透出来**。
- 模拟器实测 (0.6.2): 导航底下能看见 `构建: 一个演示项目` / `19h ago` / 状态圆点。
  老板截图里的 "View dInboxs" 就是这个 —— 正文短语(`View all runs` / `View details`)
  叠在导航 tab 文案(`Inbox`)上。
- 修法 (壳层, 不改 `ui/`): 注入一条样式 `nav[aria-label="Mobile navigation"]{background-color:var(--muted,#f2f2f2)!important}`。
  修后滚动实测: 底栏不透明，正文不再透出。

## 3. 老板「底部 5 tab 还是英文」——查证结论

**不是字典缺失**:

- COS 上那份 0.6.2 产物里能查到这些词条 (Hermes/UTF-16 存储，按 UTF-16LE 查):
  `首页` ×1、`收件箱` ×1、`智能体` ×5、`新建任务` ×1、`登录` ×3 —— 都在。
- 模拟器装 0.6.2 实测，底部 tab **一直是中文**(首页/任务/新建任务/智能体/收件箱)。
- `/ota/paperclip-web/manifest` 返回 **404**，所以也没有 OTA 覆盖成旧 bundle。

⇒ 判定为**真机上某一帧 observer 回调没赶上挂载**(壳这层复现不了)。按 brief §3 step 3
「check MutationObserver timing」的指向，加了挂载后 3 次延时重扫做兜底(`apply` 幂等，
命中过就不再命中，多跑无副作用)。

同时按老板指定译法改了两处措辞: `Home` 首页 → **仪表盘**、`Agents` 智能体 → **员工**。

## 4. 验证 (模拟器 `coolie-test`, 1080×2400, 真登录 board 账号)

| 文件 | 屏 | 期望 | 实测 |
| --- | --- | --- | --- |
| `01-tab-home-dashboard.png` | 仪表盘 | 页头 + 底栏中文 | `仪表盘` / `查看全部运行` / 底栏 5 tab 中文 ✅ |
| `02-tab-tasks.png` | 任务 | 搜索/分组/时间 | `搜索任务…` `今天` `12h 前` `19h 前` ✅ |
| `03-tab-agents.png` | 员工 | 过滤/计数/动作 | `全部` `新建员工` `1 位员工` `离开` ✅ |
| `04-tab-inbox.png` | 收件箱 | 过滤 tab/分组 | `我的 最近 未读 已阻塞 全部` `搜索收件箱…` `今天` ✅ |
| `05-tab-inbox-scrolled-bleedtest.png` | 收件箱(滚动) | 底栏不透正文 | 底栏不透明，无透出 ✅ |

底栏 5 tab 最终文案: **仪表盘 / 任务 / 新建任务 / 员工 / 收件箱** (老板指定)。
仪表盘卡片: `无关联任务`、`1d 前完成` / `4d 前完成` (原 `No linked task` / `Finished 1d ago`)。

## 5. 需要老板过目的 2 个取舍

1. **Agents = 员工**: 上游 zh-CN bundle 把 `nav.agents` 译作「智能体」，侧栏/页头都会显示
   「智能体」。老板要「员工」，所以补了一条整段替换 `智能体 → 员工` 让**全站统一**成「员工」
   (跟 Coolie工坊 app 的底部 tab 一致)。若想保留「智能体」，删掉 `App.tsx` 里那一条即可。
2. **Inbox 的 `Blocked` = 已阻塞**: 该 tab 过滤的是 **blocked 任务状态**
   (`Inbox.tsx` 的 `statuses: todo / in_progress / in_review / blocked`)，不是「已屏蔽」。

## 6. 未跑

- OTA 发布: 未做。`/ota/paperclip-web/manifest` 是 404，Coolie Web 一直靠装 APK 交付；
  本轮 runtimeVersion 随 appVersion 变成 `0.6.4`，装了新 APK 就自带新 bundle。
- repo 级 typecheck/test/build 未全跑 —— 本次只动 `clients/expo-paperclip-web/`(非 pnpm
  workspace 成员)，跑的是该目录的 `tsc --noEmit` + gradle `assembleRelease`。
