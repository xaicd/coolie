import { SafeAreaView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { C } from "../theme";
import { TabBar, type BarTabKey } from "./TabBar";

/**
 * wave167 — 屏级容器抽象。
 *
 * 之前 App.tsx 的 shell 渲染唯一的 `<TabBar>`, 所有挂在 shellContent 里的屏
 * 「共享」这个底栏。问题: 屏文件层看不到自己的 TabBar / StatusBar 关系, 改
 * 一个屏会牵动整个壳, 也违反 boss 的「APP 底部导航要固定起来 + 每屏自带壳」
 * 硬规矩 (wave138c 巡检)。
 *
 * 现在每屏自带 `<ScreenContainer>`, 在文件内显式声明「我用什么 TabBar +
 * StatusBar」; shell 只管路由 + 数据, 不再自己挂 TabBar。
 *
 * 用法 (屏文件内部):
 *   return (
 *     <ScreenContainer tab={tab} onChange={onChange} onCreate={onCreate}>
 *       <ScrollView>...</ScrollView>
 *     </ScreenContainer>
 *   );
 *
 * nested=true 用于 OrgAssetsScreen 内部 segmented 子层 (OntologyDomainList
 * / Projects / Agents / Artifacts) — 这些屏在 OrgAssetsScreen 的壳里, 不应该
 * 再嵌一层 TabBar (否则双重); 只继承 SafeAreaView + StatusBar。
 */

export interface ScreenContainerProps {
  /** 当前活动 tab —— 来自 App.tsx, 透传给 TabBar 高亮态 */
  tab: BarTabKey;
  /** 切 tab 回调 —— 来自 App.tsx (通常 = resetSubpages + navigateTab) */
  onChange: (key: BarTabKey) => void;
  /** 中央 "+" 点击 —— 来自 App.tsx (通常 = setComposeOpen(true)) */
  onCreate: () => void;
  /** OrgAssetsScreen 内部 segmented 子层用 — 不渲染 TabBar */
  nested?: boolean;
  children: React.ReactNode;
}

export function ScreenContainer({
  tab,
  onChange,
  onCreate,
  nested = false,
  children,
}: ScreenContainerProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.body}>{children}</View>
      {!nested ? <TabBar tab={tab} onChange={onChange} onCreate={onCreate} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  body: {
    flex: 1,
  },
});
