# Brief: wave 10 — 0.5.2 驾驶舱 App 对齐 Coolie Web 风格

SPEC: `docs-coolie/specs/2026-09-21-app-style-paperclip-web-wave10.md`

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Wave: 10 of N

## 0. Boss 决策 (2026-09-21)

Boss: "参考web做expo" = 0.5.2 驾驶舱 App (cloud.coolie.app / "Coolie工坊") 长成跟 Coolie Web (0.6.1-paperclip-web / cloud.coolie.app.web) 一样。

## 1. 必交付

### 1.1 App.tsx 重构

保留 DashboardScreen/AgentsScreen/ArtifactsScreen/BoardChatScreen/CodeDiffScreen/OntologyDomainListScreen/PrototypeSandboxScreen 等内部屏不重写。

只重写 App.tsx 顶层结构:

```
旧结构:
<SafeAreaView>
  <View style="hero">Coolie + 副标题</View>
  <TabBar (内部 5 Tab: 汇览/员工/工坊/任务/本体)>
</SafeAreaView>

新结构:
<SafeAreaView>
  <AppBar>
    <Pressable>←</Pressable>     ← 左边: 简化, 没 web 后退直接不渲染
    <Text>Coolie工坊</Text>      ← 中间
    <Pressable>[驾驶舱Web]</Pressable>  ← 右边: 跳 coolieweb:// 深链
  </AppBar>
  <TabBar bottom>
    <Tab label="汇览" />
    <Tab label="任务" />
    <Tab label="+" central FAB />  ← 中央新建
    <Tab label="员工" />
    <Tab label="收件箱" />  ← 用 wave8 InboxScreen
  </TabBar>
  {currentScreen}
</SafeAreaView>
```

### 1.2 AppBar 组件

`clients/expo/src/components/AppBar.tsx` (新增):
```tsx
import { useNavigation } from "...";
import { openCoolieWeb } from "...";

export function AppBar({ title }: { title: string }) {
  return (
    <View style={styles.bar}>
      <Text style={styles.title}>{title}</Text>
      <Pressable onPress={openCoolieWeb} style={styles.btn}>
        <Text style={styles.btnText}>驾驶舱Web</Text>
      </Pressable>
    </View>
  );
}
```

style: 高度 56px, bg #0F1011, paddingHorizontal 16, 标题 17pt 700, 按钮 accent #5E6AD2

### 1.3 TabBar 组件

`clients/expo/src/components/TabBar.tsx` (新增):
- 底部 fixed
- 5 Tab: 汇览 / 任务 / + / 员工 / 收件箱
- 中央 "+" 按钮 FAB (Circle)
- 当前 Tab 高亮 (accent 色)

### 1.4 主题色统一

`clients/expo/src/theme.ts` (新增) 或扩展现有 theme:
```ts
export const C = {
  bg: "#08090A",
  panel: "#0F1011",
  surface: "#191A1B",
  ink: "#E6E6E6",
  ink2: "#9BA1A6",
  ink3: "#8A8F98",
  line: "rgba(255,255,255,0.08)",
  accent: "#5E6AD2",
  err: "#EF4444",
};
```

与 0.6.1 Coolie Web 完全一致。

### 1.5 coolieweb 深链

`clients/expo/app.json`:
```json
{
  "expo": {
    "scheme": ["coolie", "coolieweb"]
  }
}
```

`clients/expo/src/utils/openCoolieWeb.ts`:
```ts
import { Linking } from "react-native";
export function openCoolieWeb() {
  Linking.openURL("coolieweb://").catch(() => {
    Alert.alert("未安装 Coolie Web", "请先装 cloud.coolie.app.web (Coolie Web)");
  });
}
```

## 2. 验证 gate

- [ ] 装机 0.5.5 后, 老板手机:
  - 顶部 appBar "Coolie工坊" + [驾驶舱Web] 按钮
  - 底部 tab bar 5 项 (汇览/任务/+/员工/收件箱)
  - 中央 + 按钮跳新建任务屏
  - 点 [驾驶舱Web] 跳 coolieweb:// → 0.6.1 Coolie Web App
- [ ] 主题色一致 (近黑 bg + 紫蓝 accent)
- [ ] 截图证据入 /tmp/emu-evidence/
- [ ] commit + push

## 3. Don't do

- ❌ Don't bump version.json (驾驶舱和 Coolie Web 共享, PM 已警告)
- ❌ Don't touch ChatHome / BuildProgressCard / WorkspaceScreen / 6 P0 屏 (wave8)
- ❌ Don't touch h5 / server
- ❌ Don't touch ui/

## 4. Done definition

App.tsx 重构 + AppBar/TabBar 新增 + 主题色统一 + coolieweb 深链 + 模拟器验证 + commit + push + 给老板装机直链 (0.5.5 APK)。