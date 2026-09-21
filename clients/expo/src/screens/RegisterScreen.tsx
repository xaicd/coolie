import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import type { SessionUser } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { ScreenHeader } from "../ui/ScreenHeader";

/**
 * 自助注册屏。
 *
 * 账号 + 首个公司一次性建好: 服务端 `POST /api/auth/register` 经 Better Auth
 * 建号并顺带建首个公司, 响应已带会话 cookie, 因此注册成功即登录成功 —— 这里
 * 直接把返回的 user 交给上层, 由 App 切换到主界面。
 */
export function RegisterScreen({
  onRegistered,
  onBack,
}: {
  onRegistered: (user: SessionUser) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = useMemo(
    () =>
      name.trim().length > 0 &&
      email.trim().length > 0 &&
      password.length >= 6 &&
      confirm === password &&
      companyName.trim().length > 0,
    [name, email, password, confirm, companyName],
  );

  const submit = useCallback(async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await coolie.register({
        name: name.trim(),
        email: email.trim(),
        password,
        companyName: companyName.trim(),
      });
      onRegistered(result.user);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [ready, busy, name, email, password, companyName, onRegistered]);

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 },
      ]}
    >
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader onBack={onBack} backLabel="登录" />

        <View style={styles.hero}>
          <Text style={styles.brand}>创建账号</Text>
          <Text style={styles.tagline}>注册后自动为你建好第一个公司，直接进驾驶舱</Text>
        </View>

        <Text style={styles.fieldLabel}>你的名字</Text>
        <TextInput
          style={styles.input}
          placeholder="如: 掌柜"
          placeholderTextColor={C.ink3}
          value={name}
          onChangeText={setName}
          autoCapitalize="none"
        />

        <Text style={styles.fieldLabel}>公司名</Text>
        <TextInput
          style={styles.input}
          placeholder="如: Coolie 工坊"
          placeholderTextColor={C.ink3}
          value={companyName}
          onChangeText={setCompanyName}
        />

        <Text style={styles.fieldLabel}>邮箱</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={C.ink3}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.fieldLabel}>密码</Text>
        <TextInput
          style={styles.input}
          placeholder="至少 6 位"
          placeholderTextColor={C.ink3}
          secureTextEntry
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
        />

        <Text style={styles.fieldLabel}>确认密码</Text>
        <TextInput
          style={styles.input}
          placeholder="再输一次"
          placeholderTextColor={C.ink3}
          secureTextEntry
          textContentType="newPassword"
          value={confirm}
          onChangeText={setConfirm}
        />

        {mismatch ? <Text style={styles.error}>两次输入的密码不一致</Text> : null}
        {error !== null ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.btnPrimary, (!ready || busy) && styles.btnDisabled]}
          disabled={!ready || busy}
          onPress={submit}
        >
          {busy ? (
            <ActivityIndicator size="small" color={C.ink} />
          ) : (
            <Text style={styles.btnPrimaryText}>注册并进入</Text>
          )}
        </Pressable>

        <Pressable onPress={onBack} style={styles.linkWrapper}>
          <Text style={styles.link}>已有账号？返回登录</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  hero: { marginTop: 12, marginBottom: 4, gap: 6 },
  brand: { color: C.ink, fontSize: 26, fontWeight: "600", letterSpacing: -0.4 },
  tagline: { color: C.ink3, fontSize: 13, lineHeight: 18 },
  fieldLabel: { color: C.ink3, fontSize: 12, marginTop: 4 },
  input: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: C.ink,
  },
  error: { color: C.err, fontSize: 13, fontWeight: "500" },
  btnPrimary: {
    marginTop: 8,
    backgroundColor: C.brand,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: C.ink, fontWeight: "600", fontSize: 15 },
  btnDisabled: { opacity: 0.4 },
  linkWrapper: { paddingVertical: 10, alignItems: "center" },
  link: { color: C.accent, fontWeight: "500", fontSize: 13 },
});
