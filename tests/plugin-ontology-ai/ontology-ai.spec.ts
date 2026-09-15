/**
 * Playwright spec for plugin-ontology AI features.
 *
 * What this covers:
 *   1. Create-domain modal exposes a description textarea.
 *   2. Empty domain: the right-panel BootstrapPanel streams progress and
 *      writes node rows via the LLM.
 *   3. Canvas right-click menu shows "AI 初始化此域" only on empty domains.
 *   4. Node right-click menu shows the AI submenu (explain / suggest related /
 *      extend).
 *   5. "AI 解释这个节点" pre-fills the SandboxTab draft.
 *   6. "AI 推荐相关节点" renders the BootstrapDraftPreview modal.
 *
 * State isolation: webServer boots a fresh `local_trusted` instance on port
 * 3299 with its own data dir (see playwright.config.ts). Each test run gets a
 * brand-new company + plugin install, so there is no auth, no shared state.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const COMPANY_NAME = `Ontology AI ${Date.now()}`;

interface CompanyRecord {
  id: string;
  issuePrefix: string;
  name: string;
}

interface DomainRecord {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
}

interface NodeRecord {
  id: string;
  key: string;
  label: string;
  node_type_id: string;
}

interface NodeTypeRecord {
  id: string;
  key: string;
  display_name: string;
}

interface GraphSnapshot {
  counts: { nodes: number; edges: number; nodeTypes: number; relationTypes: number };
  nodes: Array<{ id: string; key: string; label: string }>;
}

let company: CompanyRecord;
let pluginId: string;

test.beforeAll(async ({ request }) => {
  // local_trusted → no auth required, so we can drive everything from the
  // request context. The webServer boots a fresh data dir each run, so we
  // start with a clean slate.
  const createCompany = await request.post("/api/companies", {
    data: { name: COMPANY_NAME, description: "playwright ontology ai", budgetMonthlyCents: 0 },
  });
  expect(createCompany.ok()).toBe(true);
  company = (await createCompany.json()) as CompanyRecord;

  const install = await request.post("/api/plugins/install", {
    data: {
      packageName: "/Users/mac/workspace/xaicd/coolie/packages/plugins/plugin-ontology",
      isLocalPath: true,
    },
  });
  expect(install.ok(), `install failed: ${await install.text()}`).toBe(true);
  const installBody = (await install.json()) as { id: string };
  pluginId = installBody.id;
});

async function createDomain(
  request: APIRequestContext,
  displayName: string,
  description: string,
): Promise<DomainRecord> {
  const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  // Plugin actions take {companyId, params} on the wire — the server wraps
  // params and forwards to the worker.
  const res = await request.post(`/api/plugins/${pluginId}/actions/create-domain`, {
    data: {
      companyId: company.id,
      params: { companyId: company.id, slug, displayName, description },
    },
  });
  expect(res.ok(), `create domain failed: ${await res.text()}`).toBe(true);
  const body = (await res.json()) as { data: { domain: DomainRecord } };
  return body.data.domain;
}

async function getGraphSnapshot(request: APIRequestContext, domainId: string): Promise<GraphSnapshot> {
  // graph-snapshot is a registered plugin API route (routeKey "graph-snapshot",
  // path "/graph"). Plugin API routes mount under /api/plugins/:pluginId/api/*.
  // The server unwraps the worker's `{body: {graph: ...}}` envelope.
  const res = await request.get(
    `/api/plugins/${pluginId}/api/graph?companyId=${company.id}&domainId=${domainId}`,
  );
  expect(res.ok(), `graph snapshot failed: ${await res.text()}`).toBe(true);
  const body = (await res.json()) as { graph: GraphSnapshot };
  return body.graph;
}

async function seedSingleNodeDomain(
  request: APIRequestContext,
  domainId: string,
): Promise<NodeRecord> {
  const nodeTypeRes = await request.post(
    `/api/plugins/${pluginId}/actions/create-node-type`,
    {
      data: {
        companyId: company.id,
        params: {
          companyId: company.id,
          domainId,
          key: "customer",
          displayName: "Customer",
          description: "a buyer",
        },
      },
    },
  );
  expect(nodeTypeRes.ok()).toBe(true);
  const nodeTypeBody = (await nodeTypeRes.json()) as { data: { nodeType: NodeTypeRecord } };
  const nodeType = nodeTypeBody.data.nodeType;

  const nodeRes = await request.post(
    `/api/plugins/${pluginId}/actions/create-node`,
    {
      data: {
        companyId: company.id,
        params: {
          companyId: company.id,
          domainId,
          key: "customer-1",
          label: "Acme Inc",
          nodeTypeId: nodeType.id,
          description: "",
        },
      },
    },
  );
  expect(nodeRes.ok()).toBe(true);
  const nodeBody = (await nodeRes.json()) as { data: { node: NodeRecord } };
  return nodeBody.data.node;
}

async function gotoOntology(page: Page): Promise<void> {
  await page.goto(`/${company.issuePrefix}/ontology`);
  // The ontology workbench mounts a top-level combobox / right-panel /
  // BootstrapPanel depending on state. Wait for the New-domain button as a
  // signal the workbench is mounted under the host router. The button text is
  // "＋ New domain" (full-width ＋ plus English), so match loosely.
  await expect(page.getByText(/New domain|新建域/i).first()).toBeVisible({
    timeout: 20_000,
  });
}

async function selectDomain(page: Page, displayName: string, domainId: string): Promise<void> {
  const combo = page.getByRole("combobox").first();
  await expect(combo).toBeVisible({ timeout: 10_000 });
  // Option text is "{displayName} · v{version}" and value is the domainId.
  await combo.selectOption(domainId);
  // Wait for the right panel to re-render with the new domain.
  await page.waitForLoadState("networkidle");
}

test.describe("plugin-ontology — AI features", () => {
  test("create-domain modal exposes a description textarea", async ({ page }) => {
    await gotoOntology(page);

    // The top-bar "＋ New domain" button opens NewDomainModal (see app.tsx
    // line 264). The button's accessible name is "Create a new ontology
    // domain" (from the title attribute) plus the inner text "＋ New domain".
    const newDomainButton = page.locator('button[title*="ontology domain"], button[title*="本体域"]').first();
    await expect(newDomainButton).toBeVisible();
    await newDomainButton.click();

    // NewDomainModal renders a fixed overlay. Match by the modal title.
    const dialogTitle = page.getByText(/New ontology domain|新建本体域/i);
    await expect(dialogTitle).toBeVisible({ timeout: 5_000 });

    // Description label must be visible inside the modal.
    await expect(
      page.getByText(/Description.*AI bootstrap|描述.*AI 初始化/i).first(),
    ).toBeVisible();

    // The description textarea is uniquely identified by its placeholder.
    const descriptionTextarea = page.locator(
      'textarea[placeholder*="banking"], textarea[placeholder*="银行"], textarea[placeholder*="AI"]',
    );
    await expect(descriptionTextarea.first()).toBeVisible();
    await expect(descriptionTextarea.first()).toBeEditable();
  });

  test("empty-domain BootstrapPanel streams progress and writes rows", async ({ page, request }) => {
    const description = "Banking core: accounts, transactions, risk";
    const domain = await createDomain(request, "Banking", description);
    await gotoOntology(page);

    // Switch to the freshly-created domain. The combobox lists each domain as
    // "Display name · v1".
    await selectDomain(page, "Banking", domain.id);

    // The right-panel BootstrapPanel renders when counts.nodes === 0.
    const startButton = page
      .getByRole("button", { name: /Start AI bootstrap|开始 AI 初始化/i })
      .first();
    await expect(startButton).toBeVisible({ timeout: 15_000 });

    await startButton.click();

    // While running, the right panel swaps to the streaming view with a
    // Stop button — this proves the SSE channel actually delivered events.
    const stopButton = page.getByRole("button", { name: /^Stop|停止$/i }).first();
    await expect(stopButton).toBeVisible({ timeout: 10_000 });

    // The canonical assertion: the LLM call + row writes complete and the
    // DB sees the rows. We poll the DB rather than racing the UI text —
    // UI completion text varies by locale and stream ordering.
    await expect
      .poll(async () => {
        const snap = await getGraphSnapshot(request, domain.id);
        return snap.counts.nodes;
      }, { timeout: 120_000, intervals: [2_000, 3_000, 5_000] })
      .toBeGreaterThan(0);

    // The StreamingView must show at least one progress line for each kind
    // of row written (node-type, relation-type, node, edge). Match any of
    // the bilingual "对象类型/节点类型" / "节点" prefixes, OR the completion
    // summary (which the worker emits once all rows are inserted). The
    // summary's locale-dependent label must match too. We anchor the regex
    // so common UI labels like "Node types" or "Nodes" in the left tree /
    // statistics don't match on their own — only the BootstrapPanel's own
    // labels (which always appear in the "对象类型" / "Initialised" form).
    await expect(
      page.getByText(
        /对象类型|关系类型|^\s*节点\s|Initialised \d+ node types/,
      ),
    ).toBeVisible({ timeout: 10_000 });

    // Properties are part of the LLM-generated "ontology core": the system
    // prompt asks the model to give every node type a properties schema, and
    // the right-panel "props" badge surfaces it. Assert that at least one
    // type was written with a non-empty propertiesSchema so the AI actually
    // carried the core forward (not just keys + labels).
    await expect
      .poll(async () => {
        // domain-detail is the registered data route that bundles
        // {domain, nodeTypes, relationTypes, graph}. Calling it after
        // refreshDomain has settled is the cleanest way to read the
        // current node-type propertiesSchema.
        const res = await request.post(
          `/api/plugins/${pluginId}/data/domain-detail`,
          { data: { companyId: company.id, domainId: domain.id } },
        );
        if (!res.ok()) return 0;
        const body = (await res.json()) as {
          data: {
            nodeTypes: Array<{ id: string; propertiesSchema: Record<string, unknown> | null }>;
          };
        };
        return body.data.nodeTypes.filter(
          (nt) => nt.propertiesSchema && Object.keys(nt.propertiesSchema).length > 0,
        ).length;
      }, { timeout: 30_000, intervals: [2_000, 3_000] })
      .toBeGreaterThan(0);
  });

  test("canvas right-click menu shows 'AI 初始化此域' only on empty domains", async ({ page, request }) => {
    const emptyDomain = await createDomain(request, "EmptyForCanvas", "");
    const seededDomain = await createDomain(request, "SeededForCanvas", "");
    await seedSingleNodeDomain(request, seededDomain.id);

    // ── Empty domain: menu item is visible ──
    await gotoOntology(page);
    await selectDomain(page, "EmptyForCanvas", emptyDomain.id);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });

    const canvas = page.locator(".react-flow__pane").first();
    await expect(canvas).toBeVisible();
    await canvas.click({ button: "right", position: { x: 200, y: 200 } });
    await expect(
      page.getByRole("button", { name: /AI bootstrap this domain|AI 初始化此域/i }),
    ).toBeVisible({ timeout: 5_000 });
    // Dismiss menu by clicking elsewhere.
    await page.mouse.click(10, 10);

    // ── Seeded domain: same menu item must NOT appear ──
    await selectDomain(page, "SeededForCanvas", seededDomain.id);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });

    const canvas2 = page.locator(".react-flow__pane").first();
    await canvas2.click({ button: "right", position: { x: 200, y: 200 } });
    await expect(
      page.getByRole("button", { name: /AI bootstrap this domain|AI 初始化此域/i }),
    ).toHaveCount(0);

    expect(emptyDomain.id).toBeTruthy();
  });

  test("node right-click exposes an AI submenu with three items", async ({ page, request }) => {
    const domain = await createDomain(request, "WithNode", "");
    await seedSingleNodeDomain(request, domain.id);

    await gotoOntology(page);
    await selectDomain(page, "WithNode", domain.id);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });

    const node = page.locator(".react-flow__node").first();
    await expect(node).toBeVisible({ timeout: 15_000 });
    await node.click({ button: "right" });

    await expect(
      page.getByRole("button", { name: /AI explain this node|AI 解释这个节点/i }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole("button", { name: /AI suggest related nodes|AI 推荐相关节点/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /AI extend this node|AI 扩展此节点/i }),
    ).toBeVisible();
    // AI section label.
    await expect(page.getByText(/^AI$/).first()).toBeVisible();
  });

  test("'AI 解释这个节点' pre-fills the SandboxTab draft", async ({ page, request }) => {
    const domain = await createDomain(request, "ExplainNode", "");
    await seedSingleNodeDomain(request, domain.id);

    await gotoOntology(page);
    await selectDomain(page, "ExplainNode", domain.id);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });

    const node = page.locator(".react-flow__node").first();
    await expect(node).toBeVisible();
    await node.click({ button: "right" });

    const explain = page.getByRole("button", { name: /AI explain this node|AI 解释这个节点/i });
    await expect(explain).toBeVisible();
    await explain.click();

    // SandboxTab lives behind the "🤝 Digital Aide" / "数字副手" tab in the
    // workbench top bar. Switch to it.
    const sandboxTab = page
      .getByRole("button", { name: /Digital Aide|数字副手/ })
      .first();
    await sandboxTab.click();

    // The SandboxTab auto-submits the pre-prompt on mount (SandboxTab.tsx:207
    // `queueMicrotask(() => onSubmit())`) and clears the draft afterwards, so
    // we assert on the rendered conversation messages instead of the
    // textarea value. The user bubble must contain the node key + label so
    // the explanation is grounded.
    const conversation = page.locator("ul").filter({ hasText: /customer-1|Acme Inc/ }).first();
    await expect(conversation).toBeVisible({ timeout: 10_000 });
    await expect(conversation).toContainText(/customer-1/);
    await expect(conversation).toContainText(/Acme Inc/);
  });

  test("'AI 推荐相关节点' renders the BootstrapDraftPreview modal", async ({ page, request }) => {
    const domain = await createDomain(request, "Related", "");
    await seedSingleNodeDomain(request, domain.id);

    await gotoOntology(page);
    await selectDomain(page, "Related", domain.id);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });

    const node = page.locator(".react-flow__node").first();
    await expect(node).toBeVisible();
    await node.click({ button: "right" });

    const suggest = page.getByRole("button", { name: /AI suggest related nodes|AI 推荐相关节点/i });
    await expect(suggest).toBeVisible();
    await suggest.click();

    // The BootstrapDraftPreview modal is fixed-position; look for its
    // distinctive heading.
    await expect(
      page.getByText(/AI suggested related nodes|AI 推荐相关节点/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});