# wave185 — 登录页 / 输入屏键盘挡输入框 (KeyboardAvoidingView)

> **日期:** 2026-09-30
> **触发:** 老板实测 — 登录页点密码框, 键盘弹起后输入框被盖住, 看不到自己敲了什么 (老板原话「点完密码看不见自己敲了什么」)。
> **范围:** `clients/expo/App.tsx` (`Surface` 壳统一包 KAV) + `clients/expo/src/screens/RegisterScreen.tsx` (5 输入框独立屏, 加 KAV)
> **不动:** 业务逻辑、server、db、ui (web)、已经自带 KAV 的屏 (`TaskDetailScreen` / `SpecEditorScreen` / `BoardChatScreen` / `BuildModeModal` / `CreateProjectSheet` / `CreateTaskModal` / `ChatInput`)

---

## 0. 一句话

App 登录页 / 注册页 / 任何带 `TextInput` 的「整屏表单」被软键盘遮盖输入框 — 修法是在 `App.tsx` 的 `Surface` 公共壳里统一加一层 `KeyboardAvoidingView` (iOS `behavior="padding"`, Android 不指定 `behavior`, 由 ScrollView 自动 `adjustResize`), 然后给唯一绕开 `Surface` 的独立输入屏 `RegisterScreen` 也补一个 KAV。

---

## 1. 真因

老板实测 — 老板手机 (Android emulator) 装 0.6.10 APK, 登录页点密码框:

| 步骤 | 现状 | 问题 |
|---|---|---|
| 1. 打开 App, 落登录页 | 邮箱框可见, 密码框在屏中下 | OK |
| 2. 点密码框, 弹软键盘 | 软键盘弹起, 盖住密码框 + 「登录」按钮 + 「注册新账号」入口 | 老板看不到自己密码输到哪了, 也点不到登录

`SignInScreen` (`App.tsx:600-806`) 外面是 `Surface` (`App.tsx:586-610`), `Surface` 是 `SafeAreaView > ScrollView` 结构, 没有任何键盘避让。iOS 同源 — iOS 没有 Android `adjustResize`, 软键盘弹起时 ScrollView 不让位, 输入框直接被盖。

老板原话: 「点完密码看不见自己敲了什么」。

---

## 2. 设计

### 2.1 修法选择: 在 `Surface` 加 KAV, 不在 `SignInScreen` 单点修

`Surface` (`App.tsx:586`) 是 `App.tsx` 里所有「整屏 + ScrollView」屏的公共壳, 当前 3 处消费:

- `SignInScreen` (登录) — `<Surface>...</Surface>` (L711)
- `CompanyChooserScreen` (登录后选公司) — `<Surface>...</Surface>` (L545)
- `ApprovalDetailScreen` (审批裁决) — `<Surface>...</Surface>` (L1482)

`SignInScreen` / `CompanyChooserScreen` 都有潜在输入框 (登录页有, 选公司页没有但可能有「过滤」)。在 `Surface` 统一加 `KeyboardAvoidingView` 比每个屏各自加更不容易漏 — 老板以后再加「公司选择过滤」「快速备注审批」之类的输入, 也自动免疫。

`RegisterScreen` 是独立屏 (`src/screens/RegisterScreen.tsx`), 它直接 `<SafeAreaView > ScrollView>`, 没走 `Surface` —— 单独补一个 KAV。

### 2.2 平台差异

- **iOS**: `behavior="padding"` 让 ScrollView 内容在键盘弹起时被 padding 顶上去 (iOS 没有 Android `adjustResize` 的等价机制)
- **Android**: `adjustResize` 由 `AndroidManifest.xml` 的 `android:windowSoftInputMode` 控制 (默认就是 `adjustResize`), 不需要 `behavior`。RN 的 ScrollView 会自动调整 `contentInset` 让最后可见的输入框保持可见

Pattern 跟项目里其它 KAV 用法一致 — 见 `TaskDetailScreen.tsx:218-221` / `SpecEditorScreen.tsx:260-263` / `BuildModeModal.tsx:83-86`, 都是 `behavior={Platform.OS === "ios" ? "padding" : undefined}`。

### 2.3 不破坏 `keyboardShouldPersistTaps="handled"`

KAV 是 ScrollView 的外层, 不影响 ScrollView 的 tap 行为 —— 用户点键盘外的区域仍能收起键盘 (老板实测期望行为)。

---

## 3. 改动面

### A. `clients/expo/App.tsx`

```diff
 import {
   ActivityIndicator,
   AppState,
   BackHandler,
+  KeyboardAvoidingView,
   Linking,
   Pressable,
   SafeAreaView,
   ScrollView,
   ...
 } from "react-native";
```

```diff
 function Surface({ children }: { children: React.ReactNode }) {
   return (
     <SafeAreaView style={{ backgroundColor: C.bg, flex: 1, paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 }}>
       <StatusBar style="light" />
+      <KeyboardAvoidingView
+        style={{ flex: 1 }}
+        behavior={Platform.OS === "ios" ? "padding" : undefined}
+      >
         <ScrollView
           style={{ backgroundColor: C.bg, flex: 1 }}
           contentContainerStyle={styles.screen}
           keyboardShouldPersistTaps="handled"
         >
           {children}
         </ScrollView>
+      </KeyboardAvoidingView>
     </SafeAreaView>
   );
 }
```

### B. `clients/expo/src/screens/RegisterScreen.tsx`

注册屏 5 个输入框 (名字 / 公司名 / 邮箱 / 密码 / 确认密码), 走自己的 `SafeAreaView > ScrollView`, 同样补 KAV:

```diff
 import {
   ActivityIndicator,
+  KeyboardAvoidingView,
   Pressable,
   SafeAreaView,
   ScrollView,
   ...
 } from "react-native";
```

```diff
   return (
     <SafeAreaView style={[...]} >
       <StatusBar style="light" />
+      <KeyboardAvoidingView
+        style={{ flex: 1 }}
+        behavior={Platform.OS === "ios" ? "padding" : undefined}
+      >
         <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
           ...
         </ScrollView>
+      </KeyboardAvoidingView>
     </SafeAreaView>
   );
```

---

## 4. 不动

- 不改业务逻辑 (登录 / 注册 / 校验 / Toast 提示全部不变)
- 不动 `RegisterScreen` 的字段顺序、按钮位置、错误提示位置
- 不动 `Surface` 的 `keyboardShouldPersistTaps="handled"` —— 这是用户点键盘外收起键盘的预期行为, 不能丢
- 不动已经自带 KAV 的屏 (它们自己有, 这次没碰)

---

## 5. QA

| 项 | 期望 |
|---|---|
| `pnpm -C clients/expo typecheck` | 0 error |
| `pnpm -r typecheck` (全仓) | 0 error |
| 模拟器装新 APK → 登录页点密码 → 键盘弹起, 密码框 + 「登录」按钮被顶上屏中可见 | ✓ |
| 模拟器装新 APK → 注册屏点「公司名」→ 5 个输入框全部随键盘弹起滚动到可见 | ✓ |
| 模拟器装新 APK → 登录页点完密码, 点键盘外 (比如屏顶 Coolie logo) → 键盘收起 | ✓ (`keyboardShouldPersistTaps` 仍生效) |
| 模拟器装新 APK → 公司选择页 (无输入) → KAV 包了一层无副作用 | ✓ |
| iOS 真机 / 模拟器, 登录页点密码 → padding 抬升, 密码框 + 按钮可见 | ✓ (`behavior="padding"` 自动) |
| 没碰过的屏 (TaskDetailScreen 等) 行为不变 | ✓ (它们的 KAV 是单独的) |

---

## 6. 发版

按 `scripts/release-app.sh` 走历史成熟链路, bump 0.6.10 → **0.6.11**:

1. bump `package.json` / `app.json` (version 0.6.11 / versionCode 611)
2. CHANGELOG 加 v0.6.11 节
3. `pnpm -C clients/expo typecheck` 护栏
4. `pnpm exec expo export --platform android --output-dir dist`
5. `cd android && ./gradlew assembleRelease`
6. coscli 上传到 xrobinai.cn
7. version.json scp 到 prod
8. `publish-ota.sh` 发 OTA bundle
9. 4 护栏 (version.json / ota/manifest / APK HEAD / /api/health)

老板简报写「发版 0.6.4」—— 当前已在 0.6.10, 0.6.4 这个号早被 wave30+ 用过 (见 CHANGELOG), 老板显然是口误/笔误, 实际是「在登录页修完之后再发一版」, 按惯例 bump 到下一个号 0.6.11。

---

## 7. 不动 / 遗留

- **遗留**: `SearchScreen` 输入框固定在顶部 header, 屏底是结果列表 —— 当前结构键盘弹起时输入框不会被盖, 不加 KAV 也没事。但若把搜索结果列表也变成输入过滤 + 自动完成的下拉, 下次补。
- **遗留**: iOS 真机没在本地 QA (老板模拟器是 Android), iOS 表现按 RN 文档理论 (behavior="padding" 自动抬升), 实际靠 App Store TestFlight 验证。
- **不动**: 老板没说改 web (Web 是 WebView 自己处理键盘), 不动 `WebLoginScreen`。