---
name: hyperframes
description: 用 HTML + GSAP 可 seek 时间线合成并渲染视频（课程课件视频、商品/直播宣传短视频、口播、字幕、幻灯片、动效）。适用于「把网页/模板/课程讲义做成视频」「批量渲染短视频」「给口播加字幕/整片」。前置 Node≥22 + FFmpeg，且必须关闭遥测/公共反馈 egress。
---

# HyperFrames（HTML → 视频合成，项目本地采纳版）

> 上游：`heygen-com/hyperframes`（HeyGen，53K★）· 采用版本 **0.8.79** · 官方文档 https://hyperframes.heygen.com
> 本项目采用**项目本地包装**：只在本仓库 `.agents/skills/hyperframes/` 下声明用法与红线，**不 vendor 整个框架**、**不允许 CLI 把技能散落到全局 agent 目录**。

---

## 一、用途与适用场景

HyperFrames 把**一个 HTML 文件**（DOM 用 `data-*` 声明时间轴、GSAP 时间线可 seek）渲染成视频。适用：

- 研学教育数字员工：课程课件视频 / 讲师口播 + 章节字幕
- 特产/民宿/菜园：品牌化商品短视频、产品发布视频
- 通用：动效、幻灯片 deck、music-to-video

**先复用已有能力**（AGENTS §1）：`course-commerce-generation/`（PPTX/PDF/MP4，python+ffmpeg 直编）优先；HyperFrames 只在需要「HTML 模板驱动的品牌化视频 / 可批量的数据驱动渲染」时引入，避免平行实现。

---

## 二、环境前置（本机现状，2026-09-27 已验证）

| 依赖 | 状态 | 说明 |
| :--- | :--- | :--- |
| Node ≥ 22 | ✅ v26 | — |
| **FFmpeg + FFprobe** | ✅ 已装 | `~/.local/bin/ffmpeg` `~/.local/bin/ffprobe`（静态 7.0.2，免 sudo，软链到 `~/.local/ffmpeg-static/`）|
| Chrome | ✅ system | `/usr/bin/google-chrome` |
| 遥测 | ✅ 已关 | `npx hyperframes telemetry disable`（写 `~/.hyperframes/config.json`）|
| whisper/TTS/BGM | ✗ optional | 需要时再按需装 |

**渲染前自检**：`npx hyperframes@0.8.79 doctor --json`（必需项须全 ✓；optional 的 ✗ 不阻塞）。

---

## 三、标准工作流

```bash
npx -y hyperframes@0.8.79 init <project>        # 脚手架（非 TTY 自动 centered blank）
cd <project>
npx hyperframes catalog --query "<英文动作描述>"  # 先查现成动效原语（本地检索，零出网）
npx hyperframes lint                             # 首轮与结构变更后
npx hyperframes check                             # 终检：lint + runtime/layout/contrast/seek
npx hyperframes preview --background              # 出审片 URL，人审后再渲染
npx hyperframes render --quality draft|lools|delivery --output out.mp4
ffprobe -v error -show_format -show_streams out.mp4   # 校验时长/编码
```

坑（实测）：脚手架空 GSAP 时间线会导致 `check` 报 `Timeline did not advance under seek` —— 必须给合成加真实 seek-safe 动画（非 autoplay）。

---

## 三·B 本项目落地：教育数字员工「课程宣传片」

已内置可复用模板 `scripts/digital-employee/video/course-promo/`（政府蓝 + token 注入 + 15s 时间线）与生成器 `scripts/digital-employee/shared/course-video-generator.ts`，并接入 `operate-education.ts`。

```bash
# 教育数字员工产出真实课程宣传片 + 上传 + 尽力挂载 (需测试环境)
APP_ENVIRONMENT=test E2E_BASE_URL=http://192.144.253.205:80 DIGITAL_EMPLOYEE_VIDEO=1 \
  npm run digital-employee:education
```

链路：读真实课程 → `buildCourseVideoInput` 归一化 → `renderCoursePromoVideo`（复制模板到 tmp + 注入 JSON + `hyperframes render`）→ `uploadBusinessVideo`（`/api/upload` category=VIDEO）→ 尽力 PATCH 课程 `videoUrls`。
（已在本地验证渲染：真实课程形态数据产出 1920×1080 / h264 / 30fps / 15s mp4。）
已知边界：`/api/merchant/courses/{id}` 的 GET/PATCH 需 `COURSE_CATALOG_MANAGE`，商户子账号会 403（lessons §14）—— 脚本降级为 SKIP 并回传可用 URL。

---

## 四、红线（强制）

- ❌ **禁止遥测/公共上报**：保持 `telemetry disable`；不要用 `--file-issue`（会把复现发布到公共 URL）；渲染成功后的 feedback 一律跳过。
- ⚠️ **全局副本现状（保留）**：`init`/`skills update` 会把技能拷进 `~/.claude` `~/.cursor` `~/.agents` `~/.commandcode` `~/.copilot` `~/.hermes` `~/.kiro` `~/.trae` 等全局目录，令**所有**会话（含 Hermes）默认获得 hyperframes。本机当前**保留**这些副本（2026-09-27 用户决定，不清理）；**项目权威始终是本 `.agents/skills/hyperframes/`**，如需收敛再手动清理。
- ❌ **凭据禁落盘**（deployment-workflow §2）：云端渲染需 HeyGen 账号，token 只走远端 env，禁写入仓库/日志。
- ❌ **版本必须 pin**：统一 `hyperframes@0.8.79`，避免 pinned 项目静默漂移。
- ⚠️ **资产 egress**：合成里的 CDN 外链（如 jsdelivr 的 GSAP）在渲染时会外拉，涉及客户素材时先本地化。

---

## 五、采纳记录

- 2026-09-27：完成受限 spike（`check` 全绿 + `render` 产出 1920×1080/h264/30fps/10s mp4，ffprobe 校验通过），决定**项目本地采纳**，清理 init 造成的全局副作用。
- 未 vendor 框架本体；domain 子技能由 CLI 按需拉取，禁止长期驻留全局目录。
