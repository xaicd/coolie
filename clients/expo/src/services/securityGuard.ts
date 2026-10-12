/**
 * securityGuard.ts — 原生防破壳与应用自保护 (RASP) TypeScript 运行时服务
 * 
 * 桥接底层 Kotlin 原生看门狗 (AppSecurityGuard)，
 * 为前端业务提供环境可信度量、反篡改检测、反动态注入、反调试与反抓包能力。
 */

import { NativeModules, Platform, Alert, BackHandler } from "react-native";

export interface SecurityPosture {
  isSignatureValid: boolean;
  isDebuggerAttached: boolean;
  isInjectionDetected: boolean;
  isRooted: boolean;
  isProxyOrVpnActive: boolean;
  isEmulator: boolean;
  signatureHash: string;
  activeThreats: string[];
  isSecure: boolean;
}

const { SecurityGuard } = NativeModules;

/**
 * 执行一次全量安全态势扫描
 */
export async function getSecurityPosture(): Promise<SecurityPosture> {
  if (Platform.OS !== "android" || !SecurityGuard) {
    // 非 Android 或模拟/Web 环境安全回退
    return {
      isSignatureValid: true,
      isDebuggerAttached: false,
      isInjectionDetected: false,
      isRooted: false,
      isProxyOrVpnActive: false,
      isEmulator: false,
      signatureHash: "PLATFORM_BYPASS",
      activeThreats: [],
      isSecure: true,
    };
  }

  try {
    const report: SecurityPosture = await SecurityGuard.getSecurityPosture();
    return report;
  } catch (err) {
    console.warn("[SecurityGuard] 获取安全态势异常:", err);
    return {
      isSignatureValid: false,
      isDebuggerAttached: false,
      isInjectionDetected: false,
      isRooted: false,
      isProxyOrVpnActive: false,
      isEmulator: false,
      signatureHash: "ERROR",
      activeThreats: ["INSPECT_FAILED"],
      isSecure: false,
    };
  }
}

/**
 * 在应用入口执行启动安全守卫检查
 * 若发现严重篡改（如二次打包重签名），弹出阻断警告并退出
 */
export async function performStartupSecurityAudit(): Promise<boolean> {
  if (Platform.OS !== "android" || !SecurityGuard) return true;

  try {
    const posture = await getSecurityPosture();

    if (__DEV__) {
      console.log("🛡️ [SecurityGuard] 运行态安全检查报告:", {
        threats: posture.activeThreats,
        sig: posture.signatureHash,
        secure: posture.isSecure,
      });
      return true;
    }

    // 生产模式下的致命威胁阻断
    if (posture.activeThreats.includes("TAMPERED_SIGNATURE")) {
      Alert.alert(
        "安全警报",
        "检测到客户端安装包已被非法篡改（二次打包或破壳攻击），为保护企业数据资产，应用将立即关闭。",
        [
          {
            text: "确定",
            onPress: () => {
              if (SecurityGuard.triggerSelfDestruct) {
                SecurityGuard.triggerSelfDestruct();
              } else {
                BackHandler.exitApp();
              }
            },
          },
        ],
        { cancelable: false }
      );
      return false;
    }

    if (posture.activeThreats.includes("DYNAMIC_INJECTION_DETECTED")) {
      Alert.alert(
        "高危威胁警告",
        "检测到系统内存中存在 Frida/Xposed 恶意注入模块，敏感功能已锁定。",
        [{ text: "了解", style: "destructive" }]
      );
      return false;
    }

    return posture.isSecure;
  } catch (err) {
    console.error("[SecurityGuard] 启动自检失败:", err);
    return true;
  }
}
