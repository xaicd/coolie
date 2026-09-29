import { describe, expect, it } from "vitest";
import type { IssueAttachment } from "@paperclipai/shared";
import { groupHtmlAttachmentsByComment } from "./issue-attachments";

function attachment(overrides: Partial<IssueAttachment>): IssueAttachment {
  return {
    id: "attachment",
    companyId: "company",
    issueId: "issue",
    issueCommentId: null,
    assetId: "asset",
    provider: "local",
    objectKey: "key",
    contentType: "text/plain",
    byteSize: 1,
    originalFilename: null,
    createdByAgentId: null,
    createdByUserId: null,
    createdAt: new Date(0),
    contentPath: "/api/attachments/attachment/content",
    ...overrides,
  } as IssueAttachment;
}

describe("groupHtmlAttachmentsByComment", () => {
  it("groups html attachments under the comment they were bound to", () => {
    const grouped = groupHtmlAttachmentsByComment([
      attachment({ id: "a", issueCommentId: "c1", contentType: "text/html" }),
      attachment({ id: "b", issueCommentId: "c1", contentType: "text/html" }),
      attachment({ id: "c", issueCommentId: "c2", contentType: "text/html" }),
    ]);

    expect([...grouped.keys()].sort()).toEqual(["c1", "c2"]);
    expect(grouped.get("c1")?.map((item) => item.id)).toEqual(["a", "b"]);
    expect(grouped.get("c2")?.map((item) => item.id)).toEqual(["c"]);
  });

  it("drops attachments that are not html", () => {
    const grouped = groupHtmlAttachmentsByComment([
      attachment({ id: "md", issueCommentId: "c1", contentType: "text/markdown" }),
      attachment({ id: "png", issueCommentId: "c1", contentType: "image/png" }),
    ]);

    expect(grouped.size).toBe(0);
  });

  it("keeps an html deliverable whose content type is generic but whose name ends in .html", () => {
    const grouped = groupHtmlAttachmentsByComment([
      attachment({
        id: "h",
        issueCommentId: "c1",
        contentType: "application/octet-stream",
        originalFilename: "board.html",
      }),
    ]);

    expect(grouped.get("c1")?.map((item) => item.id)).toEqual(["h"]);
  });

  it("drops attachments not bound to a comment", () => {
    const grouped = groupHtmlAttachmentsByComment([
      attachment({ id: "orphan", issueCommentId: null, contentType: "text/html" }),
    ]);

    expect(grouped.size).toBe(0);
  });

  it("returns an empty map when there are no attachments", () => {
    expect(groupHtmlAttachmentsByComment([]).size).toBe(0);
  });
});
