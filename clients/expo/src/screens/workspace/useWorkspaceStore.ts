/**
 * 工作空间的 UI 状态 (Tab / 预览地址)
 *
 * 抄 ChatHome 的意图: 左右栏切走之后, 回来还得是原来那个 Tab、原来那个预览地址,
 * 而不是每次重新点一遍。web 端用 Context/Zustand 存; RN 端用 Zustand + 落盘。
 *
 * 持久化: 未安装 @react-native-async-storage/async-storage, 改用本机已有的
 * expo-file-system 写一个 AsyncStorage 形状的适配器 (getItem/setItem/removeItem),
 * 交给 zustand persist 中间件 —— 语义与 AsyncStorage 一致, 不引新原生依赖。
 */

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import * as FS from "expo-file-system";

export type WorkspaceTab = "conversation" | "preview" | "files" | "terminal";

/** 预览 Tab 的初始地址 = 生产实例 (与 COOLIE_BASE_URL 默认值一致) */
export const DEFAULT_PREVIEW_URL = "https://xrobinai.cn";

export interface WorkspaceTabMeta {
  key: WorkspaceTab;
  label: string;
  /** Ionicons 名 */
  icon: string;
  hint: string;
}

/** 顶部 4 个 Tab 的展示元数据 (对齐 ChatHome 的 对话/预览/文件/终端) */
export const WORKSPACE_TABS: WorkspaceTabMeta[] = [
  { key: "conversation", label: "对话", icon: "chatbubbles-outline", hint: "驾驶舱问答流" },
  { key: "preview", label: "预览", icon: "globe-outline", hint: "就地加载 URL / 图片" },
  { key: "files", label: "文件", icon: "folder-outline", hint: "workspace 文件树" },
  { key: "terminal", label: "终端", icon: "terminal-outline", hint: "模拟 shell (stub)" },
];

export interface WorkspaceState {
  activeTab: WorkspaceTab;
  previewUrl: string;
  setTab: (tab: WorkspaceTab) => void;
  setUrl: (url: string) => void;
  /** 复位: 回到对话 Tab + 默认预览地址 */
  reset: () => void;
}

const STORE_FILE = `${FS.documentDirectory ?? ""}coolie.workspace.json`;

/**
 * AsyncStorage 形状的文件适配器。
 * 任何一次读写失败都静默降级为内存态 —— 持久化是锦上添花, 不能因为它崩掉整屏。
 */
const fileStorage: StateStorage = {
  async getItem() {
    if (!STORE_FILE) return null;
    try {
      const info = await FS.getInfoAsync(STORE_FILE);
      if (!info.exists) return null;
      return await FS.readAsStringAsync(STORE_FILE);
    } catch {
      return null;
    }
  },
  async setItem(_name, value) {
    if (!STORE_FILE) return;
    try {
      await FS.writeAsStringAsync(STORE_FILE, value);
    } catch {
      // 忽略: 磁盘不可写时保持内存态
    }
  },
  async removeItem() {
    if (!STORE_FILE) return;
    try {
      await FS.deleteAsync(STORE_FILE, { idempotent: true });
    } catch {
      // 忽略
    }
  },
};

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
      storage: createJSONStorage(() => fileStorage),
    },
  ),
);

/** 非 React 上下文 (如事件回调) 里读取当前 Tab */
export function currentWorkspaceTab(): WorkspaceTab {
  return useWorkspaceStore.getState().activeTab;
}
