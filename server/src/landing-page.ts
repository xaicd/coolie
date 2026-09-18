import fs from "node:fs";
import { escapeHtmlText } from "./html-escape.js";
import { renderIcpFooterHtml, resolveIcpInfo } from "./icp-footer.js";

/**
 * Public landing page served at `/`.
 *
 * It is deliberately a server-rendered static document rather than a React
 * route: a deployment operating inside mainland China must expose a page that
 * filing reviewers can read without signing in, and a document with no client
 * JavaScript is what crawlers and reviewers actually see. It is opt-in, so an
 * instance that does not set `PAPERCLIP_LANDING_ENABLED` keeps the upstream
 * behaviour of serving the app at `/`.
 *
 * The catalogue of what this deployment has built changes far more often than
 * the layout does, so it lives in `DEFAULT_CONTENT` and an operator can point
 * `PAPERCLIP_LANDING_CONTENT_FILE` at a JSON file to replace it without a
 * rebuild.
 */

const PRODUCT_NAME = "Coolie";
const DEFAULT_SITE_NAME = "小陈的技术分享";
const CONSOLE_ENTRY_PATH = "/auth";

const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

export function isLandingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.PAPERCLIP_LANDING_ENABLED?.trim().toLowerCase();
  return raw !== undefined && TRUTHY_ENV_VALUES.has(raw);
}

export interface LandingCard {
  title: string;
  body: string;
}

export interface CatalogueItem {
  name: string;
  body: string;
  /** Optional outbound link. Only http(s) and site-relative values are rendered. */
  href?: string;
}

export interface CatalogueGroup {
  title: string;
  intro: string;
  href?: string;
  items: CatalogueItem[];
}

export interface LandingStat {
  value: string;
  label: string;
}

export interface LandingContent {
  tagline: string;
  capabilities: LandingCard[];
  catalogue: CatalogueGroup[];
  flow: LandingCard[];
  stats: LandingStat[];
}

const DEFAULT_CONTENT: LandingContent = {
  tagline: "把 AI 智能体当成一支团队来管理的控制台。组织架构、任务编排、预算治理与全链路审计，都在一个界面里。",
  capabilities: [
    {
      title: "多智能体编排",
      body: "给每个智能体设定角色、目标与上下级关系。按心跳唤醒、按任务收敛，谁在做什么一目了然。",
    },
    {
      title: "预算与治理",
      body: "按公司、智能体、项目分别设定预算与审批门槛。触顶自动暂停，配置变更可回滚。",
    },
    {
      title: "全链路审计",
      body: "每一次工具调用与关键决策都留痕，工作产出可回溯核验，随时能回答「这件事为什么这样发生」。",
    },
  ],
  catalogue: [
    {
      title: "开源项目",
      intro: "代码公开发布在 GitHub 组织 xaicd 下。",
      href: "https://github.com/orgs/xaicd/repositories",
      items: [
        {
          name: "coolie",
          body: "AI 智能体团队的控制平面：组织架构、任务编排、预算治理与全链路审计。本平台自身的底座。",
          href: "https://github.com/xaicd/coolie",
        },
        {
          name: "ruoyi-all-next",
          body: "基于 Next.js 15 的企业级全栈管理平台，从 RuoYi-Vue-Pro 全量迁移到 TypeScript 技术栈。",
          href: "https://github.com/xaicd/ruoyi-all-next",
        },
        {
          name: "palantir-agent-workflow-template",
          body: "角色工程与质保工作流模板，提炼自 Palantir Foundry 五大角色体系，可直接迁移到任意全栈项目。",
          href: "https://github.com/xaicd/palantir-agent-workflow-template",
        },
        {
          name: "agy-ubuntu",
          body: "沙盒开发容器：内嵌 Mihomo TUN 全流量隔离，预装 Antigravity CLI，与宿主机网络完全隔离。",
          href: "https://github.com/xaicd/agy-ubuntu",
        },
        {
          name: "ai-360-solutions",
          body: "在 AI Studio 上构建的应用原型。",
          href: "https://github.com/xaicd/ai-360-solutions",
        },
      ],
    },
    {
      title: "插件",
      intro: "在控制平面之上扩展能力，而不必改动内核。",
      items: [
        { name: "Ontology", body: "领域建模：节点与关系类型、图实例，以及基于递归查询的路径与影响面分析。" },
        { name: "Workflow", body: "节点 DAG 的工作流定义与执行，带运行状态机。" },
        { name: "AI Gateway", body: "OpenAI 兼容的模型网关：通道路由、加权随机故障转移、用量追踪。" },
        { name: "LLM Wiki", body: "本地文件驱动的知识库：资料导入、浏览、查询、校验与维护。" },
        { name: "Multimodal", body: "多模态入口：语音转写接入，让语音指令直接进入任务流。" },
        { name: "NPC Factory", body: "角色工厂：角色模板、工作流运行与多维产出登记，含漂移治理。" },
        { name: "Ops Console", body: "运维控制台：一个实例服务多家公司时，一页看清每个客户的状况。" },
        { name: "Workspace Diff", body: "执行工作区的变更视图，产出差异一眼可查。" },
      ],
    },
    {
      title: "智能体适配器",
      intro: "任何能接收心跳的智能体，都可以入职。",
      items: [
        { name: "Claude Code", body: "本地 Claude Code 运行时。" },
        { name: "Codex", body: "本地 Codex 运行时。" },
        { name: "Cursor", body: "本地与云端两种接入方式。" },
        { name: "Gemini / Grok / Kimi", body: "对应厂商的本地运行时。" },
        { name: "OpenCode / Pi", body: "开源编码智能体运行时。" },
        { name: "OpenClaw / Hermes", body: "网关型智能体，经 HTTP 接入。" },
        { name: "Coolie Native", body: "自研 ReAct 编码引擎，作为一等适配器运行。" },
      ],
    },
  ],
  flow: [
    { title: "定义目标", body: "从一句业务目标开始，任务自动挂在目标之下。" },
    { title: "组建团队", body: "给智能体分配角色、职级与汇报线，人机混编。" },
    { title: "审批与预算", body: "关键动作走审批闸门，花费有上限，触顶即停。" },
    { title: "心跳执行", body: "按计划唤醒、自主推进，产出与花费实时可见。" },
    { title: "审计回溯", body: "每次决策与工具调用留痕，可回放到具体时刻。" },
  ],
  stats: [
    { value: "8", label: "第一方插件" },
    { value: "13", label: "智能体适配器" },
    { value: "1", label: "实例可承载多公司" },
  ],
};

const STYLES = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{
  margin:0;background:#08090b;color:#f4f4f5;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif;
  line-height:1.6;-webkit-font-smoothing:antialiased;
}
body::before{
  content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(60rem 30rem at 50% -8%,rgba(56,189,248,.14),transparent 70%),
    radial-gradient(40rem 24rem at 85% 12%,rgba(129,140,248,.09),transparent 70%);
}
.shell{position:relative;z-index:1;max-width:1000px;margin:0 auto;padding:0 24px}
a{color:inherit}
:focus-visible{outline:2px solid #38bdf8;outline-offset:3px;border-radius:6px}

.hero{display:flex;flex-direction:column;justify-content:center;min-height:76vh;padding:96px 0 64px}
.eyebrow{
  display:inline-flex;align-items:center;gap:8px;align-self:flex-start;
  padding:5px 12px;border:1px solid rgba(255,255,255,.12);border-radius:999px;
  font-size:.8125rem;color:#a1a1aa;letter-spacing:.02em;
}
.eyebrow .dot{width:6px;height:6px;border-radius:50%;background:#38bdf8}
h1{margin:28px 0 0;font-size:clamp(2.25rem,5.4vw,3.5rem);font-weight:600;letter-spacing:-.03em;line-height:1.15}
.lead{margin:24px 0 0;max-width:42rem;font-size:1.0625rem;line-height:1.85;color:#a1a1aa}
.actions{display:flex;flex-wrap:wrap;gap:14px;margin-top:40px}
.btn{
  display:inline-flex;align-items:center;justify-content:center;
  padding:13px 24px;border-radius:10px;font-size:.9375rem;font-weight:500;
  text-decoration:none;transition:opacity .15s ease,background-color .15s ease;
}
.btn-primary{background:#fafafa;color:#09090b}
.btn-primary:hover{opacity:.88}
.btn-ghost{border:1px solid rgba(255,255,255,.16);color:#e4e4e7}
.btn-ghost:hover{background:rgba(255,255,255,.05)}

.section{padding:64px 0}
.section-head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.section-head h2{margin:0;font-size:1.5rem;font-weight:600;letter-spacing:-.02em}
.section-head .count{
  font-size:.8125rem;color:#a1a1aa;border:1px solid rgba(255,255,255,.12);
  border-radius:999px;padding:2px 10px;
}
.section p.sub{margin:12px 0 0;color:#a1a1aa;font-size:.9375rem}

.grid{display:grid;gap:18px;margin-top:36px;grid-template-columns:repeat(auto-fit,minmax(248px,1fr))}
.card{padding:26px 24px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
.card h3{margin:0;font-size:1.0625rem;font-weight:600}
.card p{margin:12px 0 0;color:#a1a1aa;font-size:.9375rem;line-height:1.8}
.card .mark{display:block;width:22px;height:2px;margin-bottom:18px;background:#38bdf8;border-radius:2px}

.group{margin-top:48px}
.group:first-of-type{margin-top:36px}
.group h3{margin:0;font-size:1.125rem;font-weight:600}
.group .intro{margin:8px 0 0;color:#a1a1aa;font-size:.9375rem}
.items{display:grid;gap:1px;margin-top:20px;background:rgba(255,255,255,.08);
  border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;
  grid-template-columns:repeat(auto-fit,minmax(272px,1fr))}
.item{padding:20px 22px;background:#0c0e12}
.item .name{font-size:.9375rem;font-weight:600}
.item .name a{color:inherit;text-decoration:none;border-bottom:1px solid rgba(56,189,248,.32)}
.item .name a:hover{border-bottom-color:#38bdf8}
.section-head h3 a{color:inherit;text-decoration:none}
.section-head h3 a:hover{color:#38bdf8}
.item .body{margin:6px 0 0;color:#a1a1aa;font-size:.875rem;line-height:1.75}

.flow{display:grid;gap:18px;margin-top:36px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.step{padding-top:18px;border-top:1px solid rgba(255,255,255,.12)}
.step .n{font-size:.75rem;color:#38bdf8;letter-spacing:.06em}
.step h4{margin:8px 0 0;font-size:1rem;font-weight:600}
.step p{margin:8px 0 0;color:#a1a1aa;font-size:.875rem;line-height:1.75}

.stats{display:grid;gap:18px;margin-top:44px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
.stat{padding:24px 20px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
.stat .v{font-size:2rem;font-weight:600;letter-spacing:-.02em;line-height:1}
.stat .l{margin:10px 0 0;color:#a1a1aa;font-size:.875rem}

.site-foot{margin-top:56px;border-top:1px solid rgba(255,255,255,.08);padding:32px 0 12px}
.site-foot .copy{text-align:center;font-size:.8125rem;color:#71717a;margin:0}

@media (max-width:600px){
  .hero{min-height:auto;padding:72px 0 40px}
  .section{padding:44px 0}
}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *{transition:none!important;animation:none!important}
}
`;

export function resolveSiteName(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.PAPERCLIP_LANDING_SITE_NAME?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_SITE_NAME;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accepts only the shape the renderer can actually use; anything else is ignored. */
function coerceCards(value: unknown): LandingCard[] | null {
  if (!Array.isArray(value)) return null;
  const cards: LandingCard[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) return null;
    const { title, body } = entry;
    if (typeof title !== "string" || typeof body !== "string") return null;
    cards.push({ title, body });
  }
  return cards;
}

/**
 * Operator-supplied content can carry links, so only schemes that cannot
 * execute are accepted. Anything else (a `javascript:` payload, say) is
 * dropped and the entry renders as plain text.
 */
function safeHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

function coerceCatalogueItems(value: unknown): CatalogueItem[] | null {
  if (!Array.isArray(value)) return null;
  const items: CatalogueItem[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) return null;
    const { name, body, href } = entry;
    if (typeof name !== "string" || typeof body !== "string") return null;
    const safe = safeHref(href);
    items.push(safe ? { name, body, href: safe } : { name, body });
  }
  return items;
}

function parseContent(raw: unknown): LandingContent | null {
  if (!isPlainObject(raw)) return null;

  const tagline = typeof raw.tagline === "string" ? raw.tagline : null;
  const capabilities = coerceCards(raw.capabilities);
  const flow = coerceCards(raw.flow);
  if (tagline === null || capabilities === null || flow === null) return null;

  if (!Array.isArray(raw.catalogue)) return null;
  const catalogue: CatalogueGroup[] = [];
  for (const entry of raw.catalogue) {
    if (!isPlainObject(entry)) return null;
    const { title, intro, href, items } = entry;
    if (typeof title !== "string" || typeof intro !== "string") return null;
    const parsedItems = coerceCatalogueItems(items);
    if (parsedItems === null) return null;
    const safe = safeHref(href);
    catalogue.push(safe
      ? { title, intro, href: safe, items: parsedItems }
      : { title, intro, items: parsedItems });
  }

  if (!Array.isArray(raw.stats)) return null;
  const stats: LandingStat[] = [];
  for (const entry of raw.stats) {
    if (!isPlainObject(entry)) return null;
    const { value, label } = entry;
    if (typeof value !== "string" || typeof label !== "string") return null;
    stats.push({ value, label });
  }

  return { tagline, capabilities, catalogue, flow, stats };
}

/**
 * Reads the operator's catalogue file on every render so an edit takes effect
 * without a restart. A missing or malformed file falls back to the built-in
 * catalogue rather than taking the page down.
 */
export function resolveContent(env: NodeJS.ProcessEnv = process.env): LandingContent {
  const file = env.PAPERCLIP_LANDING_CONTENT_FILE?.trim();
  if (!file) return DEFAULT_CONTENT;
  try {
    const parsed = parseContent(JSON.parse(fs.readFileSync(file, "utf-8")));
    return parsed ?? DEFAULT_CONTENT;
  } catch {
    return DEFAULT_CONTENT;
  }
}

function renderCards(cards: LandingCard[]): string {
  return cards
    .map((card) => [
      '        <article class="card">',
      '          <span class="mark"></span>',
      `          <h3>${escapeHtmlText(card.title)}</h3>`,
      `          <p>${escapeHtmlText(card.body)}</p>`,
      "        </article>",
    ].join("\n"))
    .join("\n");
}

function renderCatalogue(groups: CatalogueGroup[]): string {
  return groups
    .map((group) => {
      const items = group.items
        .map((item) => {
          const name = item.href
            ? `<a href="${escapeHtmlText(item.href)}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(item.name)}</a>`
            : escapeHtmlText(item.name);
          return [
            '            <div class="item">',
            `              <div class="name">${name}</div>`,
            `              <p class="body">${escapeHtmlText(item.body)}</p>`,
            "            </div>",
          ].join("\n");
        })
        .join("\n");

      const title = group.href
        ? `<a href="${escapeHtmlText(group.href)}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(group.title)}</a>`
        : escapeHtmlText(group.title);

      return [
        '        <div class="group">',
        '          <div class="section-head">',
        `            <h3>${title}</h3>`,
        `            <span class="count">${group.items.length} 项</span>`,
        "          </div>",
        `          <p class="intro">${escapeHtmlText(group.intro)}</p>`,
        '          <div class="items">',
        items,
        "          </div>",
        "        </div>",
      ].join("\n");
    })
    .join("\n");
}

function renderFlow(steps: LandingCard[]): string {
  return steps
    .map((step, index) => [
      '        <div class="step">',
      `          <span class="n">${String(index + 1).padStart(2, "0")}</span>`,
      `          <h4>${escapeHtmlText(step.title)}</h4>`,
      `          <p>${escapeHtmlText(step.body)}</p>`,
      "        </div>",
    ].join("\n"))
    .join("\n");
}

function renderStats(stats: LandingStat[]): string {
  return stats
    .map((stat) => [
      '        <div class="stat">',
      `          <div class="v">${escapeHtmlText(stat.value)}</div>`,
      `          <p class="l">${escapeHtmlText(stat.label)}</p>`,
      "        </div>",
    ].join("\n"))
    .join("\n");
}

export function renderLandingPage(env: NodeJS.ProcessEnv = process.env): string {
  const siteName = resolveSiteName(env);
  const safeSiteName = escapeHtmlText(siteName);
  const content = resolveContent(env);

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#08090b" />
    <title>${safeSiteName}</title>
    <meta name="description" content="${escapeHtmlText(`${siteName} — ${PRODUCT_NAME} 智能体团队控制台`)}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <style>${STYLES}</style>
  </head>
  <body>
    <div class="shell">
      <main>
        <section class="hero">
          <span class="eyebrow"><span class="dot"></span>${PRODUCT_NAME}</span>
          <h1>${safeSiteName}</h1>
          <p class="lead">${escapeHtmlText(content.tagline)}</p>
          <div class="actions">
            <a class="btn btn-primary" href="${CONSOLE_ENTRY_PATH}">进入控制台</a>
            <a class="btn btn-ghost" href="#catalogue">看看做了什么</a>
          </div>
        </section>

        <section class="section" id="capabilities">
          <div class="section-head"><h2>平台能力</h2></div>
          <div class="grid">
${renderCards(content.capabilities)}
          </div>
        </section>

        <section class="section" id="catalogue">
          <div class="section-head"><h2>已建成的东西</h2></div>
          <p class="sub">不是规划，是已经跑起来的部分。</p>
${renderCatalogue(content.catalogue)}
        </section>

        <section class="section" id="flow">
          <div class="section-head"><h2>怎么运转</h2></div>
          <div class="flow">
${renderFlow(content.flow)}
          </div>
        </section>

        <section class="section" id="stats">
          <div class="section-head"><h2>规模</h2></div>
          <div class="stats">
${renderStats(content.stats)}
          </div>
        </section>
      </main>

      <div class="site-foot">
        <p class="copy">© ${new Date().getFullYear()} ${safeSiteName}</p>
      </div>
    </div>
${renderIcpFooterHtml(resolveIcpInfo(env))}
  </body>
</html>
`;
}
