/**
 * 工作空间的 UI 状态 (Tab / 预览地址)
 *
 * 抄 ChatHome 的意图: 左右栏切走之后, 回来还得是原来那个 Tab、原来那个预览地址,
 * 而不是每次重新点一遍。
 *
 * 持久化: web 端直接用 `localStorage` —— zustand persist 的默认存储本就是
 * localStorage, 这里显式 createJSONStorage 只是把"跨刷新保留"写明白。与 expo 端
 * `clients/expo/src/screens/workspace/useWorkspaceStore.ts` 的接口保持一致, 只换
 * 底层存储 (expo 用 expo-file-system, web 用 localStorage)。
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type WorkspaceTab = "conversation" | "preview" | "files" | "terminal";

/** 预览 Tab 的初始地址 = 生产实例 (与 COOLIE_BASE_URL 默认值一致) */
export const DEFAULT_PREVIEW_URL = "https://xrobinai.cn";

export interface WorkspaceTabMeta {
  key: WorkspaceTab;
  label: string;
  /** 图标 (web 端用 emoji/符号, 不引 Ionicons) */
  icon: string;
  hint: string;
}

/** 顶部 4 个 Tab 的展示元数据 (对齐 ChatHome 的 对话/预览/文件/终端) */
export const WORKSPACE_TABS: WorkspaceTabMeta[] = [
  { key: "conversation", label: "对话", icon: "💬", hint: "驾驶舱问答流" },
  { key: "preview", label: "预览", icon: "🌐", hint: "就地加载 URL / 图片" },
  { key: "files", label: "文件", icon: "📁", hint: "workspace 文件树" },
  { key: "terminal", label: "终端", icon: "⌨️", hint: "模拟 shell (stub)" },
];

export interface WorkspaceState {
  activeTab: WorkspaceTab;
  previewUrl: string;
  setTab: (tab: WorkspaceTab) => void;
  setUrl: (url: string) => void;
  /** 复位: 回到对话 Tab + 默认预览地址 */
  reset: () => void;
}

/**
 * 落盘到 localStorage —— web 端进程内可用的持久化, h5 是纯浏览器 SPA,
 * 没有 SSR 场景, localStorage 恒在。
 */
const webStorage = createJSONStorage(() => localStorage);

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeTab: "conversation",
      previewUrl: DEFAULT_PREVIEW_URL,
      setTab: (activeTab) => set({ activeTab }),
      setUrl: (url) => set({ previewUrl: url.trim() || DEFAULT_PREVIEW_URL }),
      reset: () => set({ activeTab: "conversation", previewUrl: DEFAULT_PREVIEW_URL }),
    }),
    {
      name: "coolie.workspace",
      version: 1,
      storage: webStorage,
    },
  ),
);

/** 非 React 上下文 (如事件回调) 里读取当前 Tab */
export function currentWorkspaceTab(): WorkspaceTab {
  return useWorkspaceStore.getState().activeTab;
}
