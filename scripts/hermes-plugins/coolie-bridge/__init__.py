"""coolie-bridge — Hermes Gateway plugin bridging QQ/WeChat to Coolie-dev Control Plane.

Ensures:
1. Single Brain: Inbound QQ/WeChat turns are delegated directly to Coolie-dev BoardChat.
2. Complete Traceability: Conversation turns and proposals are recorded as workshop issue comments.
3. No Split-Brain: Hermes Gateway avoids running separate rogue subagents or raw shell tools.
4. Fail-Open Resilience: If Coolie-dev is unreachable, fails open so standard turn can proceed.
5. Zero Dependencies: Uses standard library urllib.request + asyncio.to_thread, 100% self-contained.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.request
import urllib.error
from typing import Any, Dict, Optional

logger = logging.getLogger("hermes.plugins.coolie_bridge")

COOLIE_API_URL = os.environ.get("COOLIE_API_URL", "http://127.0.0.1:3100")
STREAM_TIMEOUT_SECONDS = float(os.environ.get("COOLIE_STREAM_TIMEOUT", "600.0"))
COOLIE_COMPANY_ID = os.environ.get("COOLIE_COMPANY_ID", "").strip() or None
COOLIE_PROJECT_ID = os.environ.get("COOLIE_PROJECT_ID", "").strip() or None
COOLIE_CONVERSATION_ID = os.environ.get("COOLIE_CONVERSATION_ID", "").strip() or None
COOLIE_API_KEY = (os.environ.get("COOLIE_API_KEY") or os.environ.get("PAPERCLIP_API_KEY") or "").strip() or None


def _sync_stream_coolie(endpoint: str, headers: dict[str, str], payload: dict[str, Any], timeout: float) -> Optional[str]:
    body_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(endpoint, data=body_bytes, headers=headers, method="POST")

    chunks: list[str] = []
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                logger.warning("[coolie-bridge] Coolie-dev returned HTTP %s", resp.status)
                return None

            for line_bytes in resp:
                line = line_bytes.decode("utf-8", errors="replace").strip()
                if not line.startswith("data:"):
                    continue
                data_str = line[5:].strip()
                if not data_str:
                    continue
                try:
                    data = json.loads(data_str)
                except Exception:
                    continue

                event_type = data.get("type")
                if event_type == "chunk":
                    t = data.get("text", "")
                    if t:
                        chunks.append(t)
                elif event_type == "done":
                    break
                elif event_type == "error":
                    err_msg = data.get("error") or data.get("message") or "Unknown error"
                    logger.warning("[coolie-bridge] SSE error event: %s", err_msg)
                    if not chunks:
                        return f"⚠️ [Coolie-dev] 对话处理异常: {err_msg}"
                    break
    except urllib.error.HTTPError as exc:
        err_body = ""
        try:
            err_body = exc.read().decode("utf-8", errors="replace")[:200]
        except Exception:
            pass
        logger.warning("[coolie-bridge] HTTP %s from Coolie-dev at %s: %s", exc.code, endpoint, err_body)
        return None
    except Exception as exc:
        logger.warning("[coolie-bridge] Failed to communicate with Coolie-dev at %s: %s", endpoint, exc)
        return None

    full_reply = "".join(chunks).strip()
    return full_reply if full_reply else None


async def _stream_coolie_board_chat(text: str, platform: str, session_key: str) -> Optional[str]:
    """Posts user message to Coolie-dev /api/board/chat/stream and aggregates the SSE reply."""
    endpoint = f"{COOLIE_API_URL.rstrip('/')}/api/board/chat/stream"
    headers = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "x-coolie-ingress": "hermes-gateway",
        "x-coolie-client": "hermes-bridge",
        "User-Agent": f"Hermes-Gateway-Bridge/1.0 ({platform})",
    }
    if COOLIE_API_KEY:
        headers["x-paperclip-api-key"] = COOLIE_API_KEY

    payload: dict[str, Any] = {
        "message": text,
    }
    if COOLIE_COMPANY_ID:
        payload["companyId"] = COOLIE_COMPANY_ID
    if COOLIE_PROJECT_ID:
        payload["projectId"] = COOLIE_PROJECT_ID
    if COOLIE_CONVERSATION_ID:
        payload["conversationId"] = COOLIE_CONVERSATION_ID

    return await asyncio.to_thread(_sync_stream_coolie, endpoint, headers, payload, STREAM_TIMEOUT_SECONDS)


def _find_active_adapter(platform_str: str) -> Any:
    """Finds the active platform adapter in the running Hermes Gateway process."""
    try:
        import gc
        for obj in gc.get_objects():
            if type(obj).__name__ == "GatewayRunner":
                adapters = getattr(obj, "adapters", {})
                for p, adapter in adapters.items():
                    p_name = getattr(p, "value", str(p)).lower()
                    if p_name == platform_str.lower() or platform_str.lower() in p_name:
                        return adapter
    except Exception:
        pass
    return None


async def on_post_gateway_admission(
    session_key: str = "",
    platform: str = "",
    source: Any = None,
    message_id: str = "",
    text: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Hook callback invoked by Hermes gateway for every admitted inbound message."""
    # 动态开关检测：若显式设置 COOLIE_BRIDGE_DISABLED=1 则直接跳过
    if os.environ.get("COOLIE_BRIDGE_DISABLED") in ("1", "true", "TRUE"):
        return {"action": "ignored"}

    clean_text = (text or "").strip()
    if not clean_text:
        return {"action": "ignored"}

    # 过滤 slash 命令（以 / 开头的命令由网关自身处理，如 /help, /reset 等）
    if clean_text.startswith("/"):
        return {"action": "ignored"}

    logger.info(
        "[coolie-bridge] Intercepting %s message for session %s (len: %d) -> delegating to Coolie-dev",
        platform, session_key, len(clean_text)
    )

    # 启动即时打字指示器 (Typing Indicator Loop): 在等待 Coolie-dev 回复期间持续提示“正在输入...”，消除等候空白
    chat_id = None
    if isinstance(source, dict):
        chat_id = source.get("chat_id")
    elif hasattr(source, "chat_id"):
        chat_id = getattr(source, "chat_id")

    adapter = _find_active_adapter(platform) if chat_id else None
    typing_task = None
    if adapter and hasattr(adapter, "send_typing"):
        async def _keep_typing():
            while True:
                try:
                    await adapter.send_typing(chat_id)
                except Exception:
                    pass
                await asyncio.sleep(4.0)

        typing_task = asyncio.create_task(_keep_typing())

    try:
        reply = await _stream_coolie_board_chat(clean_text, platform, session_key)
    finally:
        if typing_task:
            typing_task.cancel()

    if reply:
        logger.info("[coolie-bridge] Successfully handled message via Coolie-dev (reply len: %d)", len(reply))
        return {
            "action": "handled",
            "reply": reply,
        }

    logger.warning("[coolie-bridge] Coolie-dev produced no reply; falling open to default agent turn")
    return {"action": "ignored"}


def register(ctx: Any) -> None:
    """Entry point required by Hermes plugin system."""
    ctx.register_hook("post_gateway_admission", on_post_gateway_admission)
    logger.info("[coolie-bridge] Hermes Gateway Coolie-dev Bridge plugin registered successfully")
