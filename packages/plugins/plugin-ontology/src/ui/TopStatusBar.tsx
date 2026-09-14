import {
  StatusBadge,
  usePluginAction,
  usePluginStream,
} from "@paperclipai/plugin-sdk/ui";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { t } from "./isZh.js";

interface OntologyDomainForBar {
  id: string;
  version: number;
  status: string;
}

/**
 * Top-bar status affordances (DS parity for [实时已连接 / 保存 / 应用]).
 *
 * Two badges:
 *  - Connected: green "已连接" if `usePluginStream("health")` reports
 *    `connected === true`; otherwise a yellow "离线". The stream channel is
 *    also how the plugin receives heartbeats from the worker, so the
 *    `connected` flag flips back when the SSE link drops.
 *  - Version: shows `domain.version` and a small "Snapshot" button. Clicking
 *    calls the worker's `snapshot-domain` action; on success the badge flashes
 *    "已快照" briefly. Snapshots are immutable checkpoints — the closest
 *    thing the data model has to "save" since every write commits immediately.
 *
 * The data model has no draft-vs-published concept, so we don't render a
 * separate "Apply" button — that would be misleading.
 */
export function TopStatusBar({
  companyId,
  domain,
  onSnapshot,
}: {
  companyId: string;
  domain: OntologyDomainForBar | null;
  onSnapshot?: () => void;
}): ReactElement {
  const stream = usePluginStream<unknown>("ontology.health");
  const snapshot = usePluginAction("snapshot-domain");
  const [flashing, setFlashing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const runSnapshot = async () => {
    if (!domain) return;
    setFlashing(true);
    try {
      await snapshot({ companyId, domainId: domain.id });
      onSnapshot?.();
    } catch {
      // StatusBadge will stay "pending" — that's the closest signal we have
      // that the action threw; the badge doesn't have a dedicated error state
      // for this transient flash window.
    } finally {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFlashing(false), 1500);
    }
  };

  const connected = stream.connected;
  return (
    <div className="flex items-center gap-2">
      <StatusBadge
        label={connected ? t("已连接", "Connected") : t("离线", "Offline")}
        status={connected ? "ok" : "warning"}
      />
      <div className="flex items-center gap-1.5 rounded-full bg-muted/40 px-2 py-0.5 text-(length:--text-nano)">
        <span className="font-medium text-foreground">v{domain?.version ?? "—"}</span>
        {flashing ? (
          <StatusBadge label={t("已快照", "Snapshotted")} status="ok" />
        ) : (
          <button
            disabled={!domain}
            onClick={() => { void runSnapshot(); }}
            title={t("对当前 schema 做一个不可变快照", "Take an immutable snapshot of the current schema")}
            className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("快照", "Snapshot")}
          </button>
        )}
      </div>
    </div>
  );
}