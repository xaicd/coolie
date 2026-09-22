import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { BoardChatScreen, type WorkspaceCompany } from "./screens/BoardChatScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { OntologyScreen } from "./screens/OntologyScreen";
import { TasksScreen } from "./screens/TasksScreen";
import { PipelinesScreen } from "./screens/PipelinesScreen";
import { PlansScreen } from "./screens/PlansScreen";
import { WhatsNewScreen } from "./screens/WhatsNewScreen";

/**
 * Coolie H5 (PC web) shell — ChatHome 预览 + 看额度 + 本体驱动。
 *
 * 布局对齐 app 端:
 * - 顶部一条 nav: 工坊 / 看额度 / 本体驱动 (用 hash 路由, 刷新不丢当前页)
 * - 工坊页 = BoardChatScreen (对话流 + 内嵌预览)
 *
 * spec §5: 本波不做登录鉴权 —— 默认已登录, 用一个本地 stub company, 不接后端 SSE。
 * 看额度 / 本体驱动两屏**真的**打后端 (`/api/companies` 等, 见 vite proxy),
 * 未登录时如实报错, 不假装有数据。
 */

/** 本地 stub: 本波不接登录/公司选择, 先固定一个占位主体 (工坊页用) */
const STUB_COMPANY: WorkspaceCompany = { id: "local-stub", name: "Coolie (local stub)" };

type TabKey = "chat" | "tasks" | "pipelines" | "plans" | "quota" | "ontology" | "whats-new";

const NAV_ITEMS: Array<{ key: TabKey; label: string; icon: string; hash: string }> = [
  { key: "chat", label: "工坊", icon: "💬", hash: "#/chat" },
  { key: "tasks", label: "任务", icon: "☰", hash: "#/tasks" },
  { key: "pipelines", label: "管线", icon: "🛤️", hash: "#/pipelines" },
  { key: "plans", label: "计划", icon: "📋", hash: "#/plans" },
  { key: "quota", label: "看额度", icon: "💰", hash: "#/quota" },
  { key: "ontology", label: "本体驱动", icon: "🧩", hash: "#/ontology" },
  { key: "whats-new", label: "更新", icon: "🎉", hash: "#/whats-new" },
];

/** 从 location.hash 解析当前 Tab (默认工坊) */
function tabFromHash(hash: string): TabKey {
  const found = NAV_ITEMS.find((item) => item.hash === hash);
  return found ? found.key : "chat";
}

export function App() {
  const [tab, setTab] = useState<TabKey>(() =>
    typeof window === "undefined" ? "chat" : tabFromHash(window.location.hash),
  );

  // hash 变化 (浏览器前进/后退 / 手动改地址) → 同步 Tab
  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // 首次进入没有 hash 时补一个, 免得刷新回到根
  useEffect(() => {
    if (!window.location.hash) window.location.hash = "#/chat";
  }, []);

  const selectTab = useCallback((key: TabKey) => {
    const item = NAV_ITEMS.find((i) => i.key === key);
    if (item) window.location.hash = item.hash;
    setTab(key);
  }, []);

  // What's New 页的「我知道了」/「查看演示」→ 都回工坊。
  const goToChat = useCallback(() => {
    window.location.hash = "#/chat";
    setTab("chat");
  }, []);

  return (
    <div style={styles.app}>
      <style>{GLOBAL_CSS}</style>

      {/* 顶部导航 */}
      <nav style={styles.nav} aria-label="主导航">
        <span style={styles.brand}>Coolie</span>
        <div style={styles.navItems}>
          {NAV_ITEMS.map((item) => {
            const active = item.key === tab;
            return (
              <button
                key={item.key}
                type="button"
                aria-current={active ? "page" : undefined}
                style={{ ...styles.navBtn, ...(active ? styles.navBtnActive : null) }}
                onClick={() => selectTab(item.key)}
              >
                <span aria-hidden>{item.icon}</span>
                <span style={{ ...styles.navLabel, ...(active ? styles.navLabelActive : null) }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* 内容区 */}
      <main style={styles.main}>
        {tab === "chat" ? (
          <BoardChatScreen company={STUB_COMPANY} whoami="掌柜" />
        ) : null}
        {tab === "tasks" ? (
          <TasksScreen
            style={{ flex: 1, overflowY: "auto" }}
            onOpenBuild={() => selectTab("chat")}
            onOpenPipelines={() => selectTab("pipelines")}
            onOpenPlans={() => selectTab("plans")}
          />
        ) : null}
        {tab === "pipelines" ? <PipelinesScreen style={{ flex: 1, overflowY: "auto" }} /> : null}
        {tab === "plans" ? <PlansScreen style={{ flex: 1, overflowY: "auto" }} /> : null}
        {tab === "quota" ? <DashboardScreen /> : null}
        {tab === "ontology" ? <OntologyScreen /> : null}
        {tab === "whats-new" ? (
          <WhatsNewScreen onClose={goToChat} onViewDemo={goToChat} />
        ) : null}
      </main>

    </div>
  );
}

/** 让 #root 撑满视口 (index.html 只给了一个裸 div) */
const GLOBAL_CSS = `
html, body, #root { height: 100%; }
body { margin: 0; background: #08090A; }
`;

const styles: Record<string, CSSProperties> = {
  app: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    fontFamily: "system-ui, -apple-system, sans-serif",
    background: "#08090A",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "8px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    flex: "0 0 auto",
  },
  brand: { color: "#F7F8F8", fontSize: 14, fontWeight: 700, letterSpacing: "-0.2px" },
  navItems: { display: "flex", alignItems: "center", gap: 6 },
  navBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    cursor: "pointer",
  },
  navBtnActive: { background: "rgba(94,106,210,0.14)", borderColor: "#5E6AD2" },
  navLabel: { color: "#8A8F98", fontSize: 13, fontWeight: 500 },
  navLabelActive: { color: "#7170FF" },
  main: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
};

export default App;
