import type { IssueAttachment } from "@paperclipai/shared";
import { cn } from "@/lib/utils";
import { attachmentFilename, attachmentOpenPath } from "@/lib/issue-attachments";

/**
 * Inline, sandboxed preview of an HTML attachment.
 *
 * The server serves html attachments under a sandbox CSP; repeating the `sandbox`
 * attribute here keeps the embedded document on an opaque origin even when the frame is
 * embedded without that header. Extracted from the attachments section so the board chat
 * renders html the same way rather than carrying a second copy of the frame.
 */
export function SandboxedHtmlAttachment({
  attachment,
  className,
}: {
  attachment: IssueAttachment;
  className?: string;
}) {
  const filename = attachmentFilename(attachment);
  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-background", className)}>
      <iframe
        title={`Preview of ${filename}`}
        src={attachmentOpenPath(attachment)}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        loading="lazy"
        className="h-(--sz-320px) w-full"
      />
    </div>
  );
}
