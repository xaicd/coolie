import type { IssueSpec, IssueSpecTreeNode } from "./types/issue-spec.js";
import type { IssueSpecKind } from "./constants.js";

/** One spec-bearing issue, in the flat shape the tree builder consumes. */
export interface SpecTreeRow {
  issueId: string;
  identifier: string | null;
  title: string;
  status: string;
  specKind: IssueSpecKind;
  spec: IssueSpec;
  parentSpecId: string | null;
}

/**
 * Turn a company's spec-bearing issues into a forest.
 *
 * The chain is expressed by `parentSpecId` (an issue id). A row whose parent is
 * not in the set — an orphan, or a parent in another company — is surfaced as a
 * root rather than dropped, because a spec that cannot be reached reads as if it
 * does not exist. Ordering is deterministic (identifier, then title) so the same
 * data always renders the same tree.
 */
export function buildSpecTree(rows: readonly SpecTreeRow[]): IssueSpecTreeNode[] {
  const nodes = new Map<string, IssueSpecTreeNode>();
  for (const row of rows) {
    nodes.set(row.issueId, {
      issueId: row.issueId,
      identifier: row.identifier,
      title: row.title,
      status: row.status,
      specKind: row.specKind,
      spec: row.spec,
      children: [],
    });
  }

  const roots: IssueSpecTreeNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.issueId);
    if (!node) continue;
    const parent = row.parentSpecId ? nodes.get(row.parentSpecId) : undefined;
    if (parent && parent.issueId !== row.issueId) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (list: IssueSpecTreeNode[]): void => {
    list.sort((a, b) =>
      (a.identifier ?? a.title).localeCompare(b.identifier ?? b.title),
    );
    for (const node of list) sortNodes(node.children);
  };
  sortNodes(roots);
  return roots;
}
