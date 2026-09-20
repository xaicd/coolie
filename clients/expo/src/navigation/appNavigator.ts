import { useCallback, useEffect, useReducer } from "react";
import { BackHandler } from "react-native";
import type {
  Issue,
  IssueWorkProduct,
  WorkspaceRuntimeService,
} from "@coolie/api-client";

export type TabKey =
  | "dashboard"
  | "agents"
  | "chat"
  | "tasks"
  | "artifacts"
  | "ontology";

/**
 * 浮层路由的判别联合。
 *
 * 原先 HomeScreen 用四个并列 useState (selected / diffContext / sandboxContext /
 * focusedApprovalId) 各自 early-return, 谁盖住谁只写在渲染顺序里 —— 审计 bug 1 正是
 * "tab 改了但某个浮层还残留, 屏幕上仍是原页面"。改成一个栈以后只有栈顶渲染,
 * "返回"就是出栈, 优先级由数据结构本身保证, 不再靠 if 顺序。
 */
export type TaskRoute =
  | { name: "taskDetail"; issue: Issue }
  | { name: "approvalDetail"; approvalId: string }
  | {
      name: "codeDiff";
      issue?: Issue | null;
      workProduct?: IssueWorkProduct | null;
    }
  | {
      name: "sandbox";
      url?: string | null;
      service?: WorkspaceRuntimeService | null;
      workProduct?: IssueWorkProduct | null;
    };

export interface NavState {
  tab: TabKey;
  stack: TaskRoute[];
}

export type NavAction =
  | { type: "selectTab"; tab: TabKey }
  | { type: "push"; route: TaskRoute }
  | { type: "back" };

const INITIAL_STATE: NavState = { tab: "dashboard", stack: [] };

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case "selectTab":
      // 切底部 tab = 回到根层, 同时清空浮层栈。审计 bug 1: 审批卡点击原先只改 tab,
      // 残留的浮层会让 tab 变了但屏幕不变; 在这里一次性清干净。
      return { tab: action.tab, stack: [] };
    case "push":
      return { ...state, stack: [...state.stack, action.route] };
    case "back":
      return state.stack.length === 0
        ? state
        : { ...state, stack: state.stack.slice(0, -1) };
  }
}

export interface AppNavigator {
  tab: TabKey;
  /** 栈顶路由; 为 null 表示显示当前 tab 的根页面 */
  top: TaskRoute | null;
  canGoBack: boolean;
  selectTab: (tab: TabKey) => void;
  push: (route: TaskRoute) => void;
  back: () => void;
  /** 从任意 tab 打开任务详情: 先切到任务 tab 再压栈, 返回时落回任务列表 */
  openTask: (issue: Issue) => void;
}

export function useAppNavigator(): AppNavigator {
  const [state, dispatch] = useReducer(navReducer, INITIAL_STATE);

  const selectTab = useCallback(
    (tab: TabKey) => dispatch({ type: "selectTab", tab }),
    [],
  );
  const push = useCallback(
    (route: TaskRoute) => dispatch({ type: "push", route }),
    [],
  );
  const back = useCallback(() => dispatch({ type: "back" }), []);
  const openTask = useCallback((issue: Issue) => {
    // 两条 action 在同一次事件里派发, React 18 会合并成一次渲染, 顺序即
    // selectTab 清栈 → push 压入详情。
    dispatch({ type: "selectTab", tab: "tasks" });
    dispatch({ type: "push", route: { name: "taskDetail", issue } });
  }, []);

  const top = state.stack.length > 0 ? state.stack[state.stack.length - 1] : null;

  return {
    tab: state.tab,
    top,
    canGoBack: top !== null,
    selectTab,
    push,
    back,
    openTask,
  };
}

/**
 * Android 硬件返回键: 栈里有浮层时先出栈并吞掉事件; 栈空时返回 false,
 * 事件交回系统 (退出应用), 保持原生行为。
 */
export function usePromptForBack(enabled: boolean, onBack: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [enabled, onBack]);
}
