---
name: livekit-integration-design
description: 大眼蛙直播分步集成 LiveKit 备用通道方案（保留 SRS 主路不破坏）。覆盖 4 阶段：Phase 1 token 服务 + 客户端 SDK（备用通道）→ Phase 2 LiveKit Egress → SRS 验证 → Phase 3 数字员工 agent → Phase 4 主路评估。含 OpenAI Realtime API 集成 + LiveKit Agents framework。触发场景：「LiveKit 集成」「AI agent 直播」「数字员工实时互动」「OpenAI Realtime」「WebRTC SFU 集成」「直播升级」。
---

# 大眼蛙直播 LiveKit 集成方案 v1.0（分步推进）

> 2026-09-28 设计。LiveFeed 抖音风上线 (tag v0.1.106) 后，AI 支持升级路径。
> 核心原则：分步推进 / 保留 SRS 主路不破坏 / 备用通道并行验证。

## 0. 设计原则（4 大铁律）

| # | 原则 | 含义 |
|---|---|---|
| 1 | **保留 SRS 主路不破坏** | 当前 SRS 流服务器 (qloapps-srs ossrs/srs:6) 跑得好，不动 |
| 2 | **分步推进** | 4 阶段渐进，每阶段独立可回滚 |
| 3 | **LiveKit 备用通道并行** | LiveKit + SRS 共存，验证后逐步切换 |
| 4 | **客户端可选** | mobile-web 客户端 SDK 可选加载（不影响 SRS 路径）|

## 1. 架构现状 vs 目标

### 1.1 当前架构（SRS 主路）

```
商户推流 → RTMP → SRS (192.144.253.205:1935) → HLS/FLV → 用户
                                ↓
                            客户端 HTTP（评论/礼物/加购）→ 后端
```

**特点**：
- 单向直播（推→分发）
- 延迟 1-5 秒（HLS）
- 互动延迟高（HLS 用户评论要等下一个切片）
- 无 AI agent 集成

### 1.2 目标架构（SRS + LiveKit 双层）

```
数字员工 / 商户推流
       ↓ RTMP (ingress)
 LiveKit Server (WebRTC SFU)
       ↓ WebRTC 房间
   ┌─────────────────────┐
   │ 主播 + Agent + 用户 │
   │ (双向互动 <300ms) │
   └─────────────────────┘
       ↓ LiveKit Egress RTMP SRS (现有, 不动)
       ↓ HLS 切片
   CDN 分发 (用户)
```

**特点**：
- SRS 主路不变（HLS/FLV 分发）
- LiveKit 房间层（双向 WebRTC + AI agent）
- LiveKit Egress → SRS（自动把房间画面推到现有 SRS）
- 数字员工（AI agent）实时互动
- 主路/备用通道切换灵活

## 2. 4 阶段路线图

### Phase 1: LiveKit Token 服务 + 客户端 SDK（备用通道）— 本周

**目标**: 加 LiveKit Token API route + mobile-web 客户端 SDK 接入（**不替换 SRS，只加备用通道**）

**任务**:
- [ ] 添加 `src/app/api/live/livekit/token/route.ts` —— POST /api/live/livekit/token
  - 用 `livekit-server-sdk` 包
  - 鉴权复用现有 `auth()` + RBAC（参考 `src/app/api/live/state/route.ts`）
  - 生成 AccessToken + VideoGrant
  - 返回 { serverUrl, participantToken, roomName, participantIdentity }
- [ ] 添加 `livekit-client` + `@livekit/components-react` 到 mobile-web `package.json`
- [ ] mobile-web `live/[id]/page.tsx` 加 `<LiveKitRoom>` 组件（可选加载）
  - 通过 feature flag / cookie 控制是否启用 LiveKit
  - 默认走 SRS 路径（不变）
- [ ] `.env` 加 `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` + `LIVEKIT_URL`
- [ ] LiveKit Cloud 账号注册（免费 tier 50GB/月）

**验证**:
- curl `/api/live/livekit/token` 返 token
- 客户端加载 `<LiveKitRoom>` 后能看到主播 + 互动（跟 SRS 一样）
- 不启用 LiveKit 时只走 SRS（无变化）

**风险**: 低（新增独立通道，不影响 SRS）
**回滚**: 删 token route + client SDK 引用即可

### Phase 2: LiveKit Egress → SRS（备用通道跑通）— 下月

**目标**: LiveKit 房间画面自动推到 SRS（验证双层架构）

**任务**:
- [ ] LiveKit Cloud 配置 RTMP egress → SRS（`rtmp://192.144.253.205:1935/live/xxx`）
- [ ] mobile-web 客户端触发「开始直播」时自动创建 LiveKit room + 配置 egress
- [ ] SRS HLS 切片正常（验证现有 CDN 不变）
- [ ] 监控 bandwidth（LiveKit Cloud 100GB free 后按 $0.02/participant-min 计费）

**验证**:
- 数字员工 agent 推 LiveKit → 自动转 SRS → 用户看到 HLS 流
- SRS 录制落盘正常
- 延迟 < 1 秒（vs SRS 单独 5 秒）

**风险**: 中（LiveKit Egress 配置 + 计费）
**回滚**: 关闭 egress，恢复纯 SRS

### Phase 3: 数字员工 agent 进 LiveKit 房间互动 — 季度

**目标**: 大眼蛙数字员工用 LiveKit Agents framework 进房间互动

**任务**:
- [ ] 写 `livekit-agents/` 服务（独立 Python 服务，不在大眼蛙 Next.js 里）
  - 用 `livekit-agents[openai,deepgram,cartesia]` plugin
  - STT: Deepgram Nova-3 / OpenAI Whisper
  - LLM: OpenAI GPT-4.1-mini / Claude Sonnet
  - TTS: Cartesia Sonic-3 / ElevenLabs
- [ ] 数字员工 agent 进 LiveKit 房间，自动回复弹幕（参考 ai_test_sheng 数字员工方案）
- [ ] 商家可授权数字员工代播（选品 + 自动 TTS 话术 + 互动）
- [ ] 监控 agent 互动质量（延迟、相关性、满意度）

**验证**:
- 数字员工 agent 自动回复用户弹幕（<2 秒延迟）
- 商家选品自动挂车 + TTS 播报
- 用户满意度 > 80%

**风险**: 中（AI 成本 + 模型选型 + 业务对齐）
**回滚**: 关闭数字员工 agent，回退到人工主播 + 弹幕

### Phase 4: 主路评估（SRS → LiveKit 切换决策）— 半年

**目标**: 基于 Phase 1-3 数据评估主路切换 ROI

**评估指标**:
- [ ] 互动延迟（P50 / P95 / P99）
- [ ] AI agent 自动互动率（%）
- [ ] 直播转化率（观看 → 加购 → 成交）
- [ ] 综合成本（CDN + LiveKit + AI 模型）
- [ ] 数字员工 ROI（人力成本 vs AI 替代率）

**决策**:
- ✅ ROI 高 → 全量切 LiveKit 主路（SRS 退化为离线录制）
- ⚠️ ROI 中 → 保留双路（SRS 主 + LiveKit 备用，按业务路由）
- ❌ ROI 低 → 保留 SRS 主路不变（LiveKit 退化为数字员工实验）

## 3. 实现路径

### 3.1 Phase 1 Token 服务模板

`src/app/api/live/livekit/token/route.ts`:

```ts
import { AccessToken } from "livekit-server-sdk"
import { auth } from "@/modules/platform/public/server/auth"
import { apiResponse, parseBody } from "@/modules/platform/public/server/api-response"
import { withLogging } from "@/modules/platform/public/server/http/with-logging"
import { handleRouteError } from "@/modules/platform/public/server/http/route-handler"
import { z } from "zod"

const tokenSchema = z.object({
  room: z.string().min(1).max(100),
  identity: z.string().min(1).max(100),
  name: z.string().optional(),
})

export const POST = withLogging(async (req: Request) => {
  try {
    // 1. 鉴权（参考 live/state/route.ts 模式）
    const session = await auth()
    if (!session?.user) {
      return apiResponse({ success: false, error: "请先登录" }, { status: 401 })
    }

    // 2. 验证 + 解析 body
    const body = tokenSchema.parse(await parseBody(req))

    // 3. 生成 LiveKit AccessToken
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      {
        identity: body.identity,
        name: body.name || session.user.name,
        // TTL: 1 小时
        ttl: 60 * 60,
      }
    )
    at.addGrant({
      room: body.room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
    })

    // 4. 返回
    return apiResponse({
      success: true,
      data: {
        serverUrl: process.env.LIVEKIT_URL || "wss://your-project.livekit.cloud",
        participantToken: await at.toJwt(),
        roomName: body.room,
        participantIdentity: body.identity,
      },
    })
  } catch (e) {
    return handleRouteError(e)
  }
})
```

### 3.2 mobile-web 客户端 LiveKitRoom 组件

`src/modules/video-live/frontend/components/public/LiveKitRoom.tsx`:

```tsx
"use client"

import { Room, RoomEvent, Track } from "livekit-client"
import { useEffect, useRef, useState } from "react"

interface LiveKitRoomProps {
  roomId: string
  enabled: boolean  // feature flag: 默认 false, 走 SRS 路径
}

/**
 * LiveKit 备用通道组件
 * - 默认 disabled, 客户端走 SRS HLS (现有路径, 不变)
 * - enabled=true 时: 调 /api/live/livekit/token → 连接 LiveKit 房间 → 双向互动
 * - 通过 cookie `livekit_rollout` 控制（小流量灰度）
 */
export function LiveKitRoom({ roomId, enabled }: LiveKitRoomProps) {
  const [connected, setConnected] = useState(false)
  const roomRef = useRef<Room | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    ;(async () => {
      // 1. 取 token
      const tokenRes = await fetch("/api/live/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: roomId,
          identity: `user-${Date.now()}`,
        }),
      })
      const tokenData = await tokenRes.json()
      if (cancelled) return

      // 2. 连接 LiveKit 房间
      const room = new Room()
      roomRef.current = room
      await room.connect(tokenData.data.serverUrl, tokenData.data.participantToken)

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video && videoRef.current) {
          track.attach(videoRef.current)
          setConnected(true)
        }
      })

      // 3. 启用麦克风（用户主动调用）
      // await room.localParticipant.enableCameraAndMicrophone()
    })()

    return () => {
      cancelled = true
      roomRef.current?.disconnect()
    }
  }, [roomId, enabled])

  if (!enabled) return null

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-cover"
      style={{ display: connected ? "block" : "none" }}
    />
  )
}
```

### 3.3 Feature Flag 灰度（保留 SRS 主路）

`src/modules/video-live/frontend/components/public/LiveFeed.tsx` 集成:

```tsx
import { LiveKitRoom } from "./LiveKitRoom"
import { useFeatureFlag } from "@/modules/shared/frontend/hooks/use-feature-flag"

export function RoomCard({ room, ... }) {
  const useLiveKit = useFeatureFlag("live.rollout.livekit")  // 默认 false

  return (
    <div ...>
      {/* 现有 SRS 路径（不变）*/}
      <SRSVideoPlayer coverImage={room.coverImage} />
      
      {/* LiveKit 备用通道（仅灰度用户启用）*/}
      {useLiveKit && <LiveKitRoom roomId={room.id} enabled={true} />}
    </div>
  )
}
```

## 4. 风险与门禁

| 风险 | 缓解 |
|---|---|
| LiveKit Cloud 计费超支 | 监控 bandwidth + 用量告警 + 小流量灰度 |
| 客户端 SDK 大小增加 | 异步加载 + tree-shaking + 5KB gzip |
| Token 安全泄露 | TTL 1 小时 + room 权限精确控制 |
| Egress 配置错误 | 干跑（无主播）验证 SRS 接收 |
| 数字员工 AI 成本失控 | 限速 + 用户级别 budget + 监控 |

## 5. 当前进度

| Phase | 状态 | 完成日期 |
|---|---|---|
| Phase 1: Token 服务 + 客户端 SDK | 待启动 | - |
| Phase 2: Egress → SRS 验证 | 待启动 | - |
| Phase 3: 数字员工 agent | 待启动 | - |
| Phase 4: 主路评估 | 待启动 | - |

## 6. 验收

**Phase 1 完成标志**:
- POST /api/live/livekit/token 返 200 + token
- mobile-web 加载 <LiveKitRoom> 后能加入房间
- 不启用时跟 SRS 行为一致（无副作用）
- curl 测试 + agent-device 真机验证

**Phase 2 完成标志**:
- 数字员工 agent 推 LiveKit → 自动转 SRS → HLS 可拉
- SRS 录制落盘 + 用户能看 HLS 流
- 延迟 < 1 秒

**Phase 3 完成标志**:
- 数字员工 agent 进 LiveKit 房间自动回复弹幕
- 商家授权数字员工代播 + 选品 + TTS
- 用户满意度 > 80%

**Phase 4 完成标志**:
- ROI 评估报告 + 决策（切换 / 双路 / 保留）

## 7. 维护者

- skill 维护: 大眼蛙技术部
- 关联 Skill: `deployment-workflow`, `digital-employee-operations`, `live-e2e-validation`, `app-agent-device-combo-validation`
- 文档位置: `.agents/skills/livekit-integration-design/SKILL.md`

## 8. 标签

- v0.1.106 — 当前 LiveFeed 抖音风 + live-e2e-validation skill（不含 LiveKit）
- 下一 tag: v0.1.107 — Phase 1 LiveKit token 服务 + 客户端 SDK（备用通道）