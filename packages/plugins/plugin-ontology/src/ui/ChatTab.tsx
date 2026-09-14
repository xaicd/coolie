import type { ReactElement } from "react";
import { PlaceholderTab } from "./PlaceholderTab.js";
import { t } from "./isZh.js";

/**
 * 对话 (Dialogue) tab — placeholder until the worker exposes an
 * `ontology.dialogue` event stream. Will eventually show streamed
 * conversation messages between operators / agents about this domain.
 */
export function ChatTab(): ReactElement {
  return (
    <PlaceholderTab
      title={t("对话", "Dialogue")}
      description={t(
        "对话视图占位 — 后续将流式推送来自 ontology worker 的消息。",
        "Dialogue view placeholder — will stream messages from the ontology worker.",
      )}
      futureChannel="ontology.dialogue"
    />
  );
}