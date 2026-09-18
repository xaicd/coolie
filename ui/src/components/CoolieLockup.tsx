import type { SVGProps } from "react";

interface CoolieLockupProps {
  className?: string;
  textClassName?: string;
}

/**
 * Coolie lockup — the paperclip mark (icon-only, no wordmark letters) plus a
 * typeset "Coolie" wordmark. Replaces the upstream PaperclipLockup on
 * customer-facing pages for this fork: the brand asset there baked the
 * "Paperclip" wordmark into SVG paths, which cannot be re-branded by text
 * substitution.
 *
 * The mark keeps the upstream geometry (the last path of the original lockup,
 * cropped to its own bounds). Size the row with a height class on the parent;
 * the mark follows via `size-5`, the wordmark via `textClassName`.
 */
export function CoolieLockup({ className, textClassName }: CoolieLockupProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        role="img"
        aria-label="Coolie"
        focusable="false"
        className="h-5 w-5"
      >
        <path d="M12.53 3.66 4.99 10.83a4.49 4.49 0 0 0 0 6.5 4.76 4.76 0 0 0 6.55 0l7.54-7.17a2.75 2.75 0 0 1 3.79 0 2.59 2.59 0 0 1 0 3.76l-7.54 7.17a2.75 2.75 0 0 1-3.79-3.95l7.54-7.17" />
      </svg>
      <span className={`text-lg font-semibold tracking-tight ${textClassName ?? ""}`}>
        Coolie
      </span>
    </span>
  );
}
