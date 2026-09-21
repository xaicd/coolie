import { create } from "zustand";
import { coolie, type NotificationItem } from "../coolie";

interface NotificationsState {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  /** Company the current feed belongs to, so a switch forces a refetch. */
  companyId: string | null;
  load: (companyId: string, opts?: { silent?: boolean }) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  reset: () => void;
}

function countUnread(items: NotificationItem[]): number {
  return items.filter((item) => !item.read).length;
}

/**
 * 通知中心共享状态。铃铛红点与通知列表读同一份数据: App 顶部在进主界面时
 * 拉一次 `load`, 通知屏进屏再拉一次, 两处都从 `unreadCount` 取角标数字,
 * 避免各屏各拉一次导致红点与列表对不上。
 */
export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  unreadCount: 0,
  loading: false,
  error: null,
  companyId: null,

  load: async (companyId, opts) => {
    if (!opts?.silent) set({ loading: true });
    set({ companyId });
    try {
      const feed = await coolie.listNotifications(companyId);
      set({
        items: feed.notifications,
        unreadCount: feed.unreadCount,
        error: null,
        loading: false,
      });
    } catch (e) {
      set({ error: String((e as Error)?.message ?? e), loading: false });
    }
  },

  markRead: async (id) => {
    const { companyId, items } = get();
    const next = items.map((item) => (item.id === id ? { ...item, read: true } : item));
    // 乐观更新: 点开即时消红点, 服务端写入失败也不回滚(下次 load 会纠正)。
    set({ items: next, unreadCount: countUnread(next) });
    if (!companyId) return;
    try {
      await coolie.markNotificationRead(id, companyId);
    } catch {
      // 已读写入是尽力而为, 失败不打扰用户。
    }
  },

  reset: () => set({ items: [], unreadCount: 0, error: null, companyId: null }),
}));
