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
      title={t("工坊会话", "Workshop")}
      description={t(
        "本体交互已全面并轨至系统顶栏/底栏【工坊】（会话即提案，两字确认即落盘），杜绝本体孤岛会话。请前往工坊发起本体演进与交互。",
        "Ontology interaction is fully integrated into the Workshop (Conversation as Proposal). Please visit Workshop for ontology evolution.",
      )}
      futureChannel="ontology.dialogue"
    />
  );
}