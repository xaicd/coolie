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
  markAllRead: () => Promise<void>;
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
        // 数据一致: unreadCount 由服务端为单一可信源 (service-authoritative),
        // 服务端持久化 dismissal table + 内存 readSet, 远比客户端本地 count 准.
        // 客户端仅在 markRead/markAllRead 乐观更新时使用本地 count.
        unreadCount: feed.unreadCount,
        error: null,
        loading: false,
      });
    } catch (e) {
      set({ error: String((e as Error)?.message ?? e), loading: false });
    }
  },

  markRead: async (id) => {
    const { companyId, items, unreadCount } = get();
    // 灵活匹配：id 可以是完整复合 ID (如 "failure:UUID")、raw UUID 或 target.id (如关联的 issueId)
    const matches = (item: NotificationItem) => {
      if (item.id === id) return true;
      if (item.id.includes(":") && item.id.split(":").pop() === id) return true;
      if (item.target?.id === id) return true;
      return false;
    };

    const matchingItems = items.filter(matches);
    const unreadMatches = matchingItems.filter((i) => !i.read);
    // 精准幂等: 若没有匹配到未读条目，直接 return
    if (unreadMatches.length === 0) return;

    // 乐观更新: 匹配项全部置为已读，未读计数精准扣减
    const next = items.map((item) => (matches(item) ? { ...item, read: true } : item));
    const nextUnread = Math.max(0, unreadCount - unreadMatches.length);
    set({ items: next, unreadCount: nextUnread });

    if (!companyId) return;
    try {
      // 向服务端回写已读状态 (优先使用具体通知项 ID，服务端会联动清除)
      const targetIdToSend = unreadMatches[0]?.id || id;
      const result = await coolie.markNotificationRead(targetIdToSend, companyId);
      if (typeof result?.unreadCount === "number") {
        set({ unreadCount: result.unreadCount });
      }
    } catch {
      // 已读写入尽力而为
    }
  },

  markAllRead: async () => {
    const { companyId, items } = get();
    // 乐观更新: 本地立刻清零
    const next = items.map((item) => ({ ...item, read: true }));
    set({ items: next, unreadCount: 0 });
    if (!companyId) return;
    try {
      // 服务端返回最新 unreadCount 作为权威值 (理论上应该是 0)
      const result = await coolie.markAllNotificationsRead(companyId);
      if (typeof result?.unreadCount === "number") {
        set({ unreadCount: result.unreadCount });
      }
    } catch {
      // 尽力而为
    }
  },

  reset: () => set({ items: [], unreadCount: 0, error: null, companyId: null }),
}));
