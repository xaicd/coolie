import { Alert } from "react-native";

/**
 * Toast helpers — minimal wrapper over Alert.alert.
 *
 * 不引外部 toast 库 (App 端目前用 Alert.alert 统一做法, 跟 TaskDetailScreen、
 * OTA 等保持一致), 但给 wave213 看板拖拽失败回弹一个明确语义入口,
 * 以后想换 toast 库只改这里一处。
 */
export function showSuccessToast(title: string, body?: string): void {
  if (!body) return;
  Alert.alert(title, body);
}

export function showErrorToast(title: string, body: string): void {
  Alert.alert(title, body);
}

export function showInfoToast(title: string, body?: string): void {
  Alert.alert(title, body);
}