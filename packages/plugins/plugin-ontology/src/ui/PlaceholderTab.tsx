import type { ReactElement } from "react";
import { t } from "./isZh.js";

/**
 * Honest placeholder card for views that are stubbed on the UI side and
 * don't yet have a backend. The card surfaces what the view will *do* so
 * the operator knows it's a planned feature, not a forgotten tab.
 *
 * `futureChannel` is the planned usePluginStream channel that will feed this
 * view from the worker once it lands.
 */
export function PlaceholderTab({
  title,
  description,
  futureChannel,
}: {
  title: string;
  description: string;
  futureChannel?: string;
}): ReactElement {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-[min(28rem,calc(100%-2rem))] rounded-xl border border-dashed border-border bg-card/60 p-5 text-center">
        <div className="mb-2 text-(length:--text-base) font-semibold">{title}</div>
        <div className="text-(length:--text-compact) text-muted-foreground">{description}</div>
        {futureChannel && (
          <div className="mt-3 rounded-md border border-border bg-background px-2 py-1 text-(length:--text-nano) text-muted-foreground">
            <span className="mr-1 text-foreground/60">{t("未来通道", "Future channel")}:</span>
            <code className="font-mono text-foreground">{futureChannel}</code>
          </div>
        )}
      </div>
    </div>
  );
}