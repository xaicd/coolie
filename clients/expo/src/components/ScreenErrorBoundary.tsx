import React, { Component, type ReactNode } from "react";
import { View, StyleSheet, Text } from "react-native";
import { C } from "../coolie";
import { ErrorRetry } from "../ui/ErrorRetry";

export interface ScreenErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 屏幕/Tab 级错误护栏组件 (ScreenErrorBoundary)
 * 捕获子组件渲染期致命异常，防止任何单一 Tab 崩溃导致原生应用退出闪退。
 */
export class ScreenErrorBoundary extends Component<ScreenErrorBoundaryProps, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ScreenErrorBoundary] 捕获渲染致命异常:", error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <ErrorRetry
            variant="card"
            title={this.props.fallbackTitle ?? "页面加载异常"}
            message={this.state.error?.message ?? "组件渲染发生未知错误，点击重试恢复"}
            onRetry={this.reset}
          />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
