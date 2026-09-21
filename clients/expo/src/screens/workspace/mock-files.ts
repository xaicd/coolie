/**
 * workspace 文件树 mock 数据
 *
 * 第二波铁匠会接 GET /api/companies/<id>/workspace/files; 本波先给一份 ≥5 层
 * 嵌套的静态树, 让 FilesTab 的折叠/缩进/点开预览按真实数据形状先跑通。
 * 形状刻意对齐 workspace-as-company 骨架: templates/workspace-skel/{specs,docs,cli}。
 */

export type MockNodeKind = "directory" | "file";

export interface MockFileNode {
  name: string;
  /** 目录为 null; 文件给出内容, 供终端 `cat` 与预览使用 */
  content?: string;
  language?: string;
  children?: MockFileNode[];
}

export interface FlatFileNode {
  /** 全路径, 作为 key 与终端 `cat` 的入参 */
  path: string;
  name: string;
  kind: MockNodeKind;
  /** 0 = 根层 */
  depth: number;
  /** 目录才有: 是否展开 */
  expanded?: boolean;
  /** 文件才有: 语言标签 */
  language?: string;
}

/**
 * 根系 workspace 骨架。嵌套层数:
 * templates(1) / workspace-skel(2) / specs(3) / billing(4) / v1(5) / schema.md(6)
 */
export const MOCK_FILE_TREE: MockFileNode[] = [
  {
    name: "templates",
    children: [
      {
        name: "workspace-skel",
        children: [
          {
            name: "specs",
            children: [
              {
                name: "billing",
                children: [
                  {
                    name: "v1",
                    children: [
                      {
                        name: "schema.md",
                        language: "markdown",
                        content:
                          "# 计费域 v1\n\n- invoice: 账单\n- subscription: 订阅\n- usage_meter: 用量计量\n",
                      },
                      {
                        name: "acceptance.md",
                        language: "markdown",
                        content:
                          "# 验收\n\n1. 能按用量出账\n2. 订阅变更即时生效\n",
                      },
                    ],
                  },
                ],
              },
              { name: ".gitkeep", language: "text", content: "" },
            ],
          },
          {
            name: "docs",
            children: [
              {
                name: "architecture.md",
                language: "markdown",
                content:
                  "# 架构\n\n5 角色: fdse / fda / ds / pre-sre / core-swe。\n",
              },
            ],
          },
          {
            name: "cli",
            children: [
              {
                name: "core-swe.sh",
                language: "bash",
                content: "#!/usr/bin/env bash\nset -euo pipefail\necho 'core-swe online'\n",
              },
              {
                name: "pre-sre.sh",
                language: "bash",
                content: "#!/usr/bin/env bash\nset -euo pipefail\necho 'pre-sre online'\n",
              },
            ],
          },
          {
            name: "models.yaml",
            language: "yaml",
            content: "roles:\n  - fdse\n  - fda\n  - ds\n  - pre-sre\n  - core-swe\n",
          },
          {
            name: "README.md",
            language: "markdown",
            content: "# workspace-skel\n\n一份最小可跑的 workspace 骨架。\n",
          },
        ],
      },
    ],
  },
  {
    name: "README.md",
    language: "markdown",
    content: "# Workspace\n\n这是当前公司的 workspace 根目录 (mock)。\n",
  },
];

/** 带全路径的扁平化结果, 供 FlatList 直接消费 */
export function flattenTree(
  nodes: MockFileNode[],
  expanded: ReadonlySet<string>,
  prefix = "",
  depth = 0,
): FlatFileNode[] {
  const out: FlatFileNode[] = [];
  for (const node of nodes) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    const isDir = Array.isArray(node.children);
    out.push({
      path,
      name: node.name,
      kind: isDir ? "directory" : "file",
      depth,
      expanded: isDir ? expanded.has(path) : undefined,
      language: node.language,
    });
    if (isDir && expanded.has(path)) {
      out.push(...flattenTree(node.children ?? [], expanded, path, depth + 1));
    }
  }
  return out;
}

/** 默认展开的目录路径: 让首屏就能看到 5 层嵌套, 不用手点 5 下 */
export function defaultExpandedPaths(): Set<string> {
  return new Set(["templates", "templates/workspace-skel", "templates/workspace-skel/specs"]);
}

/** 按全路径找文件内容 (终端 `cat` 用) */
export function findFileByPath(path: string): MockFileNode | null {
  const segments = path.split("/").filter(Boolean);
  let cursor: MockFileNode | undefined;
  let level: MockFileNode[] = MOCK_FILE_TREE;
  for (const segment of segments) {
    cursor = level.find((n) => n.name === segment);
    if (!cursor) return null;
    level = cursor.children ?? [];
  }
  return cursor && !cursor.children ? cursor : null;
}

/** 文件全路径列表 (终端 `ls` 与补全提示用) */
export function allFilePaths(): string[] {
  return flattenTree(
    MOCK_FILE_TREE,
    new Set(collectDirPaths(MOCK_FILE_TREE)),
  )
    .filter((n) => n.kind === "file")
    .map((n) => n.path);
}

function collectDirPaths(nodes: MockFileNode[], prefix = ""): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (Array.isArray(node.children)) {
      out.push(path);
      out.push(...collectDirPaths(node.children, path));
    }
  }
  return out;
}
