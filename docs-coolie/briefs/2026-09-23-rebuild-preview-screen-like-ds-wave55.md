# Brief: wave 55 — 重做 PrototypeSandboxScreen 仿 DS PreviewPanel 真设计 (boss '你确定认真学习digitalstaff的预览了吗')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:40 OOB 「你确定认真学习 digitalstaff 的预览了吗, 最新的预览」

老板质疑 wave54 没真学 DS 预览. PM 真查 DS 真值:
- DS PreviewPanel.tsx (~180 行) — 简单轻量, 真预览组件
- DS UnifiedPreviewPanel.tsx (~300 行) — Vibe/Build/Studio 三大功能共享
- DS 关键 UX: 视口切换 (desktop/tablet/mobile) + Refresh + Empty state

**wave54 漏掉**: 没视口切换 + 没 Refresh + 没 Empty state. wave54 加的 SESSION URL + HOST banner 不是 DS 真有的.

## 1. 已知现状 (PM 09-22 真查)

```
DS PreviewPanel.tsx 真值:
✅ 视口切换 (desktop / tablet / mobile, ToggleGroup + lucide-react)
✅ Refresh 按钮 (RefreshCw)
✅ External Link 按钮 (ExternalLink 跳出 OS browser)
✅ iframe 渲染预览 URL (sandbox 属性 allow-scripts + allow-same-origin + allow-forms + allow-popups)
✅ Empty state 「预览未就绪」+ 「完成任务后将显示预览」
✅ 自动 refresh (key state 增量)

DS UnifiedPreviewPanel.tsx 真值:
- 三大功能共享 (Vibe 模式 / Build 模式 / Studio 模式)
- BuildStagesPanel (显示 build 进度)
- PipelineObservabilityPanel (pipeline 监控)
- NoVNCPanel (无 VNC 时降级)
- StarfieldBackground (背景)

Coolie工坊 0.5.32 当前 (wave54):
❌ 视口切换 (没)
❌ Refresh (没)
❌ External Link (没)
⚠️ iframe 有但裸 (没 sandbox 属性)
❌ Empty state (没)
✅ HOST PREVIEW banner (DS 没, 是我们自加)
✅ SESSION URL 三段 (DS 没, 是我们自加)
```

## 2. 目标

**Coolie工坊 0.5.33 App** PrototypeSandboxScreen 重写仿 DS PreviewPanel.tsx 真值:

A. 视口切换: desktop (100%) / tablet (768px) / mobile (375px) (ToggleGroup 3 切换, lucide-react 图标)
B. Refresh 按钮 (RefreshCw)
C. External Link 按钮 (ExternalLink 跳出 OS browser — 修老板之前嫌的「浏览器跳出」)
D. iframe sandbox 属性 (allow-scripts + allow-same-origin + allow-forms + allow-popups)
E. Empty state (「预览未就绪」+ 「完成任务后将显示预览」)
F. 删除 wave54 加的 HOST PREVIEW banner + SESSION URL 三段 (DS 没, 删)
G. 大幅简化 (1219 → ~400 行, 真仿 DS 简洁)

## 3. 任务 (5 步)

### 3.1 看 DS PreviewPanel.tsx 完整 (180 行)

```bash
cat ~/workspace/xaicd/DigitalStaff/frontend/modules/ai-studio/components/ai-studio/ide/PreviewPanel.tsx
```

仿 DS 简洁: state viewport + handleRefresh + handleOpenExternal + iframe.

### 3.2 重写 PrototypeSandboxScreen.tsx (~400 行)

```tsx
// 仿 DS PreviewPanel.tsx 结构
import { Smartphone, Monitor, Tablet, ExternalLink, RefreshCw } from 'lucide-react';
// 用 RN 版本 (没 lucide-react 的话用 @expo/vector-icons: Ionicons)

const viewportSizes = {
  desktop: { width: '100%', icon: Monitor },
  tablet: { width: 768, icon: Tablet },
  mobile: { width: 375, icon: Smartphone },
};

export function PrototypeSandboxScreen({ initialUrl, onBack }) {
  const [previewUrl, setPreviewUrl] = useState(initialUrl);
  const [viewport, setViewport] = useState<desktop|tablet|mobile>('desktop');
  const [isLoading, setIsLoading] = useState(true);
  const [key, setKey] = useState(0);

  const handleRefresh = () => setKey(k => k + 1);
  const handleOpenExternal = () => {
    if (previewUrl) Linking.openURL(previewUrl);  // 跳出 OS browser
  };

  if (!previewUrl) {
    return (
      <EmptyState 
        title="预览未就绪" 
        description="完成任务后将显示预览" 
        icon="🚀"
      />
    );
  }

  return (
    <View>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <ViewportToggle value={viewport} onChange={setViewport} />
        <View style={styles.actions}>
          <Pressable onPress={handleRefresh}><RefreshCw /></Pressable>
          <Pressable onPress={handleOpenExternal}><ExternalLink /></Pressable>
          <Pressable onPress={onBack}>← 返回</Pressable>
        </View>
      </View>
      
      {/* iframe */}
      <View style={[styles.iframeContainer, { width: viewportSizes[viewport].width }]}>
        <WebView
          key={key}
          source={{ uri: previewUrl }}
          // sandbox: react-native-webview 不支持 sandbox 属性, 改用 originWhitelist + cacheEnabled
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
        />
      </View>
    </View>
  );
}
```

### 3.3 删除 wave54 加的 (HOST banner + SESSION URL 三段 + DS 真值无关)

```bash
# 删除 wave54 加的:
git diff clients/expo/src/screens/PrototypeSandboxScreen.tsx | grep -E "^\+" | grep -E "buildSessionPreviewUrl|sessionPreviewUrl|basePreviewUrl|dsSessionUrlBar|SESSION URL"
```

(这些是 wave54 加的, DS 真没有, 删)

### 3.4 bump 0.5.32 → 0.5.33 + 模拟器验证

```bash
1. bump 0.5.32 → 0.5.33 (release-app.sh, J1-J3 gate)
2. Build APK + adb install
3. 验证:
   a. 进 PrototypeSandboxScreen
   b. 看到 viewport 切换 (desktop/tablet/mobile)
   c. 点 Refresh → iframe 重载
   d. 点 ExternalLink → 跳出 OS browser (修老板之前嫌的)
   e. 删 wave54 加的 (HOST banner + SESSION URL 三段)
4. 截图 /tmp/emu-evidence/wave55-0.5.33/
5. commit + push + 发版 0.5.33 + 上 COS:
   https://dls.xrobinai.cn/coolie/app/0.5.33/coolie-release.apk
```

## 4. Constraints

- ❌ DON'T 保留 wave54 加的 (HOST banner + SESSION URL 三段 — DS 真没有, 删)
- ❌ DON'T bump 0.5.33 之外
- ❌ DON'T 触碰 paperclip 上游
- ❌ DON'T 用 lucide-react (用 RN 等价物 @expo/vector-icons Ionicons)
- ✅ DO 仿 DS PreviewPanel.tsx 真值 (180 行简洁)
- ✅ DO 加 viewport / refresh / empty state / external link (DS 4 件)
- ✅ DO 大幅简化 (1219 → ~400 行)

## 5. semver + PM-CHECKLIST

- 当前 0.5.32
- 重做 UI = patch bump → 0.5.33 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

5 步全完 + PrototypeSandboxScreen 重写 ~400 行 (仿 DS) + 删 wave54 冗余 + viewport/refresh/empty state/external link 4 件 + 模拟器验证 + commit + push + 发版 0.5.33 + 上 COS:

```
Coolie工坊 0.5.33: https://dls.xrobinai.cn/coolie/app/0.5.33/coolie-release.apk
任务详情页: 真仿 DS PreviewPanel 简洁版 (viewport + refresh + external link + empty state)
```