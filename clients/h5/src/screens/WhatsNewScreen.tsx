/**
 * What's New (PC web) —— 与 app 端 clients/expo/src/screens/WhatsNewScreen.tsx 同构。
 *
 * 为什么要 PC 也有一份：装机自检是移动端概念，但「版本更新说明」是两端共有的
 * 产品面。而且它是唯一能在浏览器里被 agent-device 真实回放驱动的界面 ——
 * RN 端没有 react-native-web 构建，跑不了 web 回放，所以装机闭环的行为验证
 * 落在这里（replays/whats-new.ad）。
 *
 * wave89 起优先读服务端 /api/release-notes（server 从 clients/expo/CHANGELOG.md
 * 抽版本节），拉不到时回退到下面的本地常量 —— 所以回放/离线仍有稳定锚点，
 * 文案里的 "ChatHome" 是 e2e 回放的锚点，改动请同步 replays/whats-new.ad。
 */

import { useEffect, useState, type CSSProperties } from "react";

/** 与最近发版对应的版本号（远端不可用时的兜底展示） */
export const H5_RELEASE_VERSION = "0.5.23";

/** 本版功能点（兜底） */
export const H5_RELEASE_FEATURES = [
  "工坊 (ChatHome) 收编对话：智能识别 build / plan / pipeline + Quick chip + 流式回复",
  "砍掉「工作空间」四 Tab 屏：对话 / 预览 / 文件 / 终端 是抄来的骨架，整屏删除",
  "5 角色智能体：需求 / 设计 / 编码 / 测试 / 发布",
  "装机自检：核对 APK 版本与 OTA 运行时版本",
] as const;

/** /api/release-notes 响应（公开只读, 见 server/src/routes/release-notes.ts） */
interface RemoteReleaseNotes {
  version: string;
  title: string;
  bullets: string[];
}

/** 拉远端版本说明；失败返回 null，调用方用本地常量兜底。 */
function fetchRemoteNotes(version: string): Promise<RemoteReleaseNotes | null> {
  return fetch(`/api/release-notes?version=${encodeURIComponent(version)}`, {
    headers: { Accept: "application/json" },
  })
    .then((res) => (res.ok ? (res.json() as Promise<RemoteReleaseNotes>) : null))
    .catch(() => null);
}

export interface WhatsNewScreenProps {
  /** 「我知道了」：收起本页 */
  onClose: () => void;
  /** 「查看演示」：回到工坊 (ChatHome) */
  onViewDemo: () => void;
}

export function WhatsNewScreen({ onClose, onViewDemo }: WhatsNewScreenProps) {
  // 优先远端（server 从 CHANGELOG 抽节, wave89），拉不到先渲染本地兜底，
  // 远端回来后 setState 刷新 —— 屏幕永远有内容，不白屏。
  const [remote, setRemote] = useState<RemoteReleaseNotes | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchRemoteNotes(H5_RELEASE_VERSION).then((data) => {
      if (!cancelled && data && Array.isArray(data.bullets) && data.bullets.length > 0) {
        setRemote(data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const version = remote?.version ?? H5_RELEASE_VERSION;
  const features = remote?.bullets ?? H5_RELEASE_FEATURES;

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.badge}>Coolie {version}</div>
        <h1 style={styles.title}>What's New · {version}</h1>
        <p style={styles.subtitle}>{remote?.title || "ChatHome 收编 + 砍掉工作空间 + 5 角色员工"}</p>

        <ul style={styles.list}>
          {features.map((feature) => (
            <li key={feature} style={styles.item}>
              <span style={styles.tick} aria-hidden>
                ✓
              </span>
              {feature}
            </li>
          ))}
        </ul>

        <div style={styles.actions}>
          <button
            type="button"
            style={styles.secondary}
            aria-label="查看演示"
            onClick={onViewDemo}
          >
            查看演示
          </button>
          <button
            type="button"
            style={styles.primary}
            aria-label="我知道了"
            onClick={onClose}
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background: "#08090A",
  },
  card: {
    width: "min(92vw, 520px)",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  badge: {
    alignSelf: "flex-start",
    color: "#7170FF",
    fontSize: 13,
    fontWeight: 600,
    background: "rgba(94,106,210,0.14)",
    border: "1px solid #5E6AD2",
    borderRadius: 999,
    padding: "3px 12px",
  },
  title: {
    margin: 0,
    color: "#F7F8F8",
    fontSize: 22,
    fontWeight: 600,
    letterSpacing: "-0.4px",
  },
  subtitle: {
    margin: 0,
    color: "#8A8F98",
    fontSize: 14,
  },
  list: {
    margin: "8px 0 0",
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  item: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    color: "#D0D6E0",
    fontSize: 14,
    lineHeight: "21px",
  },
  tick: {
    color: "#7170FF",
    fontWeight: 600,
  },
  actions: {
    display: "flex",
    gap: 8,
    marginTop: 12,
  },
  primary: {
    flex: 1,
    background: "#5E6AD2",
    color: "#FFFFFF",
    border: "1px solid #5E6AD2",
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  secondary: {
    flex: 1,
    background: "rgba(255,255,255,0.02)",
    color: "#7170FF",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 15,
    fontWeight: 500,
    cursor: "pointer",
  },
};

export default WhatsNewScreen;
