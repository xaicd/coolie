import type { ReactNode } from "react";
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { C } from "../coolie";

/** 全屏滚动页面外壳: 安全区 + 状态栏 + 16px 内边距的滚动容器 */
export function Surface({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: C.bg,
    flex: 1,
    paddingTop:
      Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0,
  },
  scroll: {
    backgroundColor: C.bg,
    flex: 1,
  },
  screen: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
    backgroundColor: C.bg,
  },
});
