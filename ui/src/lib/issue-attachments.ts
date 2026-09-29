import type { IssueAttachment } from "@paperclipai/shared";
import { isMarkdownAttachmentContent } from "@paperclipai/shared";
import { isImageLikeOutput, isVideoLikeOutput } from "./issue-output";

type AttachmentPathLike = {
  contentPath: string;
  openPath?: string;
  downloadPath?: string;
};

function normalizedContentType(attachment: Pick<IssueAttachment, "contentType">) {
  return attachment.contentType.toLowerCase().split(";")[0]?.trim() ?? "";
}

export function attachmentFilename(attachment: Pick<IssueAttachment, "id" | "originalFilename">) {
  return attachment.originalFilename ?? attachment.id;
}

export function attachmentOpenPath(attachment: AttachmentPathLike) {
  return attachment.openPath ?? attachment.contentPath;
}

export function attachmentDownloadPath(attachment: AttachmentPathLike) {
  return attachment.downloadPath ?? `${attachment.contentPath}?download=1`;
}

export function isImageAttachment(attachment: Pick<IssueAttachment, "contentType"> & Partial<Pick<IssueAttachment, "originalFilename">>) {
  const type = normalizedContentType(attachment);
  return isImageLikeOutput(type, attachment.originalFilename) && !/^image\/hei[cf](?:-sequence)?$/.test(type);
}

export function isVideoAttachment(
  attachment: Pick<IssueAttachment, "contentType" | "originalFilename">,
) {
  return isVideoLikeOutput(attachment.contentType, attachment.originalFilename);
}

export function isMarkdownAttachment(
  attachment: Pick<IssueAttachment, "contentType" | "originalFilename">,
) {
  return isMarkdownAttachmentContent(attachment);
}

/**
 * An HTML deliverable (prototype sandbox, dashboard, static report). The server
 * serves these `text/html` with an inline disposition and a sandbox CSP, so the
 * UI can render them in an iframe instead of offering a download. Uploads often
 * arrive with a generic binary content type, so the filename is checked too.
 */
export function isHtmlAttachment(
  attachment: Pick<IssueAttachment, "contentType" | "originalFilename">,
) {
  const type = normalizedContentType(attachment);
  if (type === "text/html" || type === "application/xhtml+xml" || type === "application/html") {
    return true;
  }
  if (type !== "" && type !== "application/octet-stream" && type !== "binary/octet-stream") {
    return false;
  }
  const name = (attachment.originalFilename ?? "").toLowerCase();
  return name.endsWith(".html") || name.endsWith(".htm");
}
