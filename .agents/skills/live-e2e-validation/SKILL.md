---
name: live-e2e-validation
description: 大眼蛙直播全功能业务验证方案 —— 数字员工 / 运营员工 / 商户 / C 端 4 角色 × 5 阶段（推流链路 / 商户 App E2E / 数字员工端到端 / 真人压测 / 实时数据验证）。包含 FFmpeg 推 RTMP + ffprobe 拉流验证 + Patrol Flutter E2E + k6 并发压测 + ai_test_sheng AI 测试 8 阶段方案。触发场景：「直播验证」「推流测试」「数字员工直播」「直播端到端」「E2E 直播」「FFmpeg RTMP」「SRS 验证」。
---

# 大眼蛙直播全功能业务验证方案 v1.0

> 2026-09-28 设计。LiveFeed 抖音风格上线 (tag v0.1.105) 后的全链路验证方案。
> 覆盖数字员工 / 运营员工 / 商户 / C 端 4 角色 × 5 阶段。

## 0. 设计原则（5 大铁律）

| # | 原则 | 含义 |
|---|---|---|
| 1 | **真链路验证** | 用 FFmpeg 真实推流 / ffprobe 真实拉流 —— 不 mock 媒体数据 |
| 2 | **数字员工优先** | 数字员工跑业务流 + 自动验证 —— 减少人工 |
| 3 | **三层角色映射** | 数字员工 / 运营员工 / 商户 / C 端 —— 各有不同工具链 |
| 4 | **5 阶段渐进** | 推流链路 → 商户 E2E → 数字员工 → 真人压测 → 实时数据 |
| 5 | **全开源工具** | FFmpeg / ffprobe / Patrol / k6 / ai_test_sheng / TikTool Live SDK —— 不依赖闭源 |

## 1. 角色 × 工具矩阵

| 角色 | 主要业务流 | 开源工具链 |
|---|---|---|
| **数字员工** | 自动开播 + 选品 + 互动 + 数据 | ai_test_sheng (MIT) + FFmpeg + ZEGO 数字人 SDK |
| **运营员工** | 直播审核 + 数据验证 + 异常处理 | Playwright + Patrol + e2e spec |
| **商户** | 创建直播 + 推流 + 互动 | agent-device + OBS Studio + Patrol |
| **C 端** | 观看 + 弹幕 + 加购 | agent-device + 真机 |

## 2. 5 阶段路线图

### Phase 1: 推流链路验证（数字员工 + 运营）— 立即做

**目标**: 验证 SRS 接收 RTMP + HLS/FLV 拉流可播 + 录制落盘 + 并发压测

**工具链**:
- **FFmpeg**（LGPL）— RTMP 推流客户端
- **ffprobe** — 拉流验证（关键帧 / 时长 / 编码）
- **MediaMTX**（MIT）— 备选流服务器（零依赖，~20MB 镜像）
- **k6**（AGPL）— WebSocket 弹幕 + HTTP 拉流并发压测
- **SRS**（MIT）— 已部署 tc-robin-claw，1935 RTMP / 8080 HTTP

**验证点**:
- [x] FFmpeg 推 RTMP 到 SRS（`rtmp://192.144.253.205:1935/live/verify-stream`）
- [x] SRS HLS 切片生成（10s 切片）
- [x] SRS FLV 流可拉（`http://192.144.253.205:8080/live/verify-stream.flv`）
- [x] SRS 录制落盘（`/var/lib/srs/records/`）
- [x] ffprobe 校验：codec / width / height / duration / bitrate
- [x] 1000+ 并发拉流（k6 压测）

**脚本**: `scripts/verify-live-pipeline.sh` — 见 §4.1

### Phase 2: 商户 App E2E（Patrol）— 本周

**工具**:
- **Patrol 4.x**（MIT）— Flutter E2E + native automator
- **agent-device**（已有，CLI/MCP）— 真机 WebView 自动化
- **integration_test** — Flutter 官方包

**场景**:
- [ ] 登录 → 创建直播 → 选品 → 开播 → 推流成功 → 弹幕
- [ ] native permission 弹窗（Patrol 优势，XCUITest/UIAutomator 桥接）
- [ ] deep link 冷启动（商户创建直播间 deep link）
- [ ] 推送通知（直播开始提醒）
- [ ] IAP 沙箱购买（礼物打赏）

### Phase 3: 数字员工端到端（ai_test_sheng）— 下月

**工具**:
- **ai_test_sheng**（MIT）— AI 测试 8 阶段（需求分析→页面探索→用例设计→评审→执行→报告→优化→脚本生成）
- **LLM agent** — 自然语言指令 → 自动执行
- **Playwright MCP** — 真实浏览器驱动

**场景**:
- [ ] 数字员工自动创建直播 + 选品
- [ ] 数字员工自动审核直播
- [ ] 数字员工自动回复用户
- [ ] 数字员工自动结算

### Phase 4: 真人压测（k6）— 长期

**工具**:
- **k6** — WebSocket 弹幕压测
- **Locust** — HTTP 拉流压测

**场景**:
- [ ] 1000+ 并发进直播间
- [ ] 10000+ 弹幕/秒
- [ ] 直播间切换延迟 P95 < 200ms

### Phase 5: 实时数据验证（TikTool Live SDK）— 长期

**工具**:
- **TikTool Live SDK**（MIT）— 实时 WebSocket 数据 API
- **SRS 测试模式** — 模拟拉流客户端

**场景**:
- [ ] 实时数据流（房间状态 / 观众数 / 礼物 / 弹幕）
- [ ] 数字员工 auto-respond 实时弹幕
- [ ] 数据采集自动化（OSS / ClickHouse）

## 3. 验证场景与数据模型

### 3.1 房间模型

```
LiveRoom
  ├ id (cuid)
  ├ tenantId
  ├ title (string)
  ├ streamerName
  ├ streamerAvatar
  ├ type (PLATFORM/MERCHANT/SELF_PROVIDED)
  ├ category (GOVT/OFFICIAL/MERCHANT)
  ├ status (DRAFT/PENDING/READY/LIVE/ENDED/BANNED)
  ├ viewerCount
  ├ playUrl / playUrlType (FLV/HLS/WebRTC)
  ├ streamUrl (RTMP ingest URL)
  ├ coverImage
  ├ orgName
  ├ auditStatus (NONE/PENDING/APPROVED/REJECTED)
  └ products[] (商品挂车)
```

### 3.2 状态机

```
DRAFT → PENDING → READY → LIVE → ENDED
                          ↓
                       BANNED
```

## 4. 实现路径

### 4.1 Phase 1 推流验证脚本

`scripts/verify-live-pipeline.sh`:

```bash
#!/bin/bash
# 大眼蛙直播推流链路验证 (SRS + FFmpeg + ffprobe + k6)
# 用法: bash scripts/verify-live-pipeline.sh

set -e

# 1. FFmpeg 推 RTMP 到 SRS（用 test 视频循环）
ffmpeg -re -stream_loop -1 -i /tmp/test-video.mp4 \
  -c copy -f flv rtmp://192.144.253.205:1935/live/verify-stream &
FFMPEG_PID=$!
sleep 5

# 2. ffprobe 校验 FLV 拉流
echo "=== FLV 流验证 ==="
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,width,height,duration \
  -of json http://192.144.253.205:8080/live/verify-stream.flv

# 3. 校验 HLS 切片
echo "=== HLS 切片验证 ==="
curl -I http://192.144.253.205:8080/live/verify-stream.m3u8

# 4. 校验 SRS 录制文件落盘
echo "=== SRS 录制文件验证 ==="
ssh tc-robin-claw 'ls -lh /var/lib/srs/records/'

# 5. k6 并发拉流测试
echo "=== k6 并发拉流压测 ==="
k6 run --vus 50 --duration 30s scripts/k6-hls-pull.js

# 6. 清理
kill $FFMPEG_PID 2>/dev/null
echo "✅ 验证完成"
```

### 4.2 Phase 2 Patrol Flutter 测试模板

`scripts/merchant-live-e2e.dart`:

```dart
import 'package:patrol/patrol.dart';
import 'package:myapp/main.dart' as app;

void main() {
  patrolTest('商户创建直播 + 推流 + 互动', ($) async {
    // 1. 启动 app
    await $.pumpWidgetAndSettle(app.MyApp());

    // 2. 登录（用 demo 账号 13900001111）
    await $('登录').tap();
    await $.native.enterTextOnNativeDialog('13900001111');
    await $.pumpAndSettle();

    // 3. 进商户工作台 → 创建直播
    await $('创建直播').tap();
    await $('直播标题').enterText('测试直播 E2E');
    await $('提交').tap();

    // 4. 选品 + 推流配置
    await $('关联商品').tap();
    await $('确认').tap();
    await $('开始推流').tap();

    // 5. native 权限弹窗（Patrol 优势）
    await $.native.grantPermissionWhenInUse();
    await $.pumpAndSettle();

    // 6. 验证推流成功
    expect($('直播中'), findsOneWidget);
    expect($('观众数: 1'), findsOneWidget);

    // 7. 发弹幕测试
    await $('说点什么...').enterText('E2E 测试弹幕');
    await $('发送').tap();
    expect($('E2E 测试弹幕'), findsOneWidget);
  });
}
```

### 4.3 Phase 3 数字员工端到端

数字员工自动跑业务 + 自动验证:

```yaml
# ai_test_sheng 配置
project: wenlv-live-e2e
phases:
  - requirement_analysis: 自然语言需求 → 拆解功能点
  - page_exploration: Playwright MCP 浏览器截图 + 元素定位
  - test_design: 等价类 + 边界值 + 场景流程
  - test_review: 3 轮评审（覆盖/质量/冗余）
  - test_execution: Playwright 执行 + PASS/FAIL/BUG/BLOCKED
  - report: HTML 报告 + 遗漏分析
  - optimization: 用例精简 + 回归集推荐
  - script_gen: test_*.py 可执行脚本
```

数字员工场景:

1. **自动开播**: 数字员工用 OBS Studio + 选好的商品自动开播
2. **自动互动**: LLM 监听弹幕 + 自动回复（参考 TikTool Live SDK）
3. **自动审核**: 数字员工模拟登录运营后台 + 自动审核直播
4. **自动结算**: 数字员工跑结算脚本 + 验证金额

## 5. 风险与门禁

| 风险 | 缓解 |
|---|---|
| FFmpeg 推流失败 | 用 -re (real-time pacing) + -c copy (避免 CPU 转码) |
| SRS 录制满 | 监控 /var/lib/srs/records/ 容量 + 定期归档 |
| 1000+ 并发弹幕 WS fail | k6 提前压测 + 提前扩容 redis |
| 数字员工自动跑错业务 | 人工 review 边界 + Phase 3 先沙箱测试 |
| Patrol 真机 flaky | CI 设备矩阵 + 测试结果截图存证 |

## 6. 与现有技能集成

| 相关 Skill | 集成方式 |
|---|---|
| `deployment-workflow/` | 推流验证脚本走 `tc-robin-claw` 测试环境（已部署 SRS） |
| `comprehensive-testing-workflow/` | e2e spec (Playwright + 真机) + 增量更新测试 |
| `app-agent-device-combo-validation/` | 详情页 + 直播列表 + 加入连线 button 验证 |
| `digital-employee-operations/` | 数字员工业务接管 + 自动验证 |
| `docker-compose-env-discipline/` | 推流验证环境变量（RTMP URL / 流密钥） |

## 7. 当前进度

| Phase | 状态 | 完成日期 |
|---|---|---|
| Phase 1: 推流链路验证 | 待启动 | - |
| Phase 2: 商户 App E2E (Patrol) | 待启动 | - |
| Phase 3: 数字员工端到端 | 待启动 | - |
| Phase 4: 真人压测 | 待启动 | - |
| Phase 5: 实时数据验证 | 待启动 | - |

## 8. 验收

**Phase 1 完成标志**:
- FFmpeg 推流脚本 (scripts/verify-live-pipeline.sh) 入库 + 跑通
- SRS HLS/FLV 流可拉 + ffprobe 校验通过
- 录制文件落盘确认
- k6 1000+ 并发测试通过

**Phase 2 完成标志**:
- Patrol 测试模板 (scripts/merchant-live-e2e.dart) 入库
- CI 跑通商户创建直播 → 选品 → 推流 → 互动 全流程
- native permission 弹窗自动通过
- deep link 冷启动验证

**全方案完成标志**:
- 5 阶段全部跑通
- 数字员工自动跑业务流可重复执行
- 真人压测性能达标
- 实时数据采集自动化

## 9. 标签

- v0.1.105 — LiveFeed 抖音风格直播 tab 列表页 + 详情页 + 加入连线 button + basePath 404 修复
- 当前 master HEAD: b703e380

## 10. 维护

- skill 维护者: 大眼蛙技术部
- 关联 SOP: deployment-workflow, comprehensive-testing-workflow, digital-employee-operations
- 文档位置: .agents/skills/live-e2e-validation/SKILL.md