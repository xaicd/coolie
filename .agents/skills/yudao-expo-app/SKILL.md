---
name: yudao-expo-app
description: Yudao-Quad-Terminal 原生移动端 (Expo SDK 52 / React Native 0.76) 深度研发与发布法典。指导数字员工掌握 Monorepo 跨包解析 (Metro)、硬件级加密存储 (SecureStore)、生物识别鉴权、6 寸屏极简对称 UI、局部一跳因果卡片流、以及自建 OTA 热更新防缓存陷阱与 7 处版本一致性守卫。
---

# Yudao-Expo-App 原生移动端深度研发与发版法典

> **最高法典契约**：Expo 原生客户端是触达企业高管、现场巡检与掌柜决策的高保真终端。必须做到**60/120fps 原生手势帧率、硬件安全芯片加密防嗅探、极简 6 寸屏单手可达**。严禁在客户端明文使用 `AsyncStorage` 存放核心 JWT 凭证，严禁打断移动端 LIFO 导航调用栈，自建 OTA 发版必须执行 7 处版本一致性守卫。

---

## §1 Metro Monorepo 跨包解析拓扑与配置

在 PNPM Workspace 架构下，`apps/app` 引用 `@yudao-quad-terminal/shared-types` 或 `packages/api-client` 时，Metro 默认只会查找当前目录。必须通过 `metro.config.js` 配置跨包监控：

```javascript
// apps/app/metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. 监控 Monorepo 根目录 (跨包实时 HMR)
config.watchFolders = [workspaceRoot];

// 2. 双重解析搜索路径：优先当前包 node_modules，其次 Monorepo 根 node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules')
];

// 3. 避免符号链接在 PNPM 软链下发生重复依赖解析报错
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

---

## §2 真实可运行完整业务页面范式 (以地址管理与硬件鉴权为例)

### 1. 硬件级凭证加密存储与生物识别 (`src/utils/security.ts`)
```typescript
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const TOKEN_KEY = 'yudao_auth_secure_token';

/** 保存 Token 到 iOS Keychain / Android KeyStore */
export async function saveSecureToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
}

/** 读取加密 Token */
export async function getSecureToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

/** 生物识别硬件校验 (FaceID / 指纹) */
export async function authenticateWithBiometrics(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !isEnrolled) return true; // 设备不支持则放行至普通密码

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: '请验证面容或指纹以解锁系统',
    cancelLabel: '取消'
  });
  return result.success;
}
```

### 2. 6 寸屏原生列表页面 (`src/screens/AddressListScreen.tsx`)
```tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiRequest } from '../utils/api';

interface AddressItem {
  id: number;
  name: string;
  mobile: string;
  detailAddress: string;
  defaultStatus: boolean;
}

export const AddressListScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<AddressItem[]>([]);

  const fetchAddressList = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<AddressItem[]>('/app-api/member/address/list');
      setList(res.data || []);
    } catch (err: any) {
      Alert.alert('提示', err.message || '加载地址失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchAddressList();
    });
    return unsubscribe;
  }, [navigation]);

  const renderItem = ({ item }: { item: AddressItem }) => (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.mobile}>{item.mobile}</Text>
        {item.defaultStatus && (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>默认</Text>
          </View>
        )}
      </View>
      <Text style={styles.addressText}>{item.detailAddress}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 80 }]}>
      {loading ? (
        <ActivityIndicator size="large" color="#1890ff" style={styles.loader} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>暂无收货地址</Text>
            </View>
          }
        />
      )}

      {/* 底部固定两字按钮 */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('AddressEdit')}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>新增</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  loader: { flex: 1, justifyContent: 'center' },
  listContent: { padding: 16 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
  mobile: { fontSize: 14, color: '#666666', marginLeft: 12 },
  defaultBadge: {
    backgroundColor: '#fff1f0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8
  },
  defaultBadgeText: { color: '#f5222d', fontSize: 10, fontWeight: '600' },
  addressText: { fontSize: 14, color: '#333333', marginTop: 8, lineHeight: 20 },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#999999', fontSize: 14 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0'
  },
  primaryButton: {
    backgroundColor: '#1890ff',
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center'
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' }
});
```

---

## §3 深入源码：三大原生端避坑指南 (Gotchas)

### 1. 自建 OTA 发版中的“缓存命中黑洞” (`launchAsset.key`)
- **现象**：线上发了纯 JS OTA 补丁，老板的手机也弹了“更新下载完成”，但重启 App 后界面依然是老版本；
- **根因**：Expo Updates 原生下载器在检查更新时，如果远端 `manifest.json` 中 `launchAsset.key` 字符串未随代码变化，客户端会认为该 Bundle 已在本地文件系统缓存中存在，从而直接跳过解压并继续复用旧 Bundle；
- **正确姿势**：在发版脚本 `publish-ota.sh` 中，`launchAsset.key` 必须用当前 bundle 文件的 SHA256 动态生成：
  ```bash
  BUNDLE_HASH=$(sha256sum ./dist/bundles/android.js | cut -d' ' -f1)
  sed -i "s/\"key\": \".*\"/\"key\": \"bundle-${BUNDLE_HASH}\"/" ./dist/manifest.json
  ```

### 2. Caddy / Nginx SPA 路由回退陷阱
- **现象**：客户端 `logcat` 抛错 `Failed to construct manifest from response: Unexpected '<'`；
- **根因**：线上 Caddy 配置了 `try_files {path} /index.html`，当客户端请求 `/ota/manifest` 时，如果服务端路径缺失或未配置反代，Caddy 会把 index.html (HTML) 作为响应兜底吐回，导致 Expo 客户端在 JSON 解析时因遇到 `<!DOCTYPE html>` 直接崩溃；
- **正确姿势**：生产 Caddyfile 中必须对 `/ota/*` 路径强制指定 `Content-Type: application/json` 并禁止 SPA fallback。

### 3. 7 处版本一致性守卫 (Version Consistency)
在打正式 APK 前，运行统一一致性检测脚本：
```bash
bash scripts/VERSION-CONSISTENCY-CHECK.sh
```
必须保证以下 7 处版本号分毫不差完全对齐：
- `apps/app/app.json` (`expo.version`)
- `apps/app/package.json` (`version`)
- `apps/app/android/app/build.gradle` (`versionName`)
- `CHANGELOG.md`
- `ui/dist/version.json`
- `docs/07_release/release-notes.md`
- Git Tag (如 `v1.0.0`)
