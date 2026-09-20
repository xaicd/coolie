import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Company } from "@coolie/api-client";
import {
  C,
  classifyToken,
  credentialCompanies,
  saveAuthToken,
  signInWithEmail,
  type Credential,
} from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { AppCard } from "../ui/AppCard";
import { Surface } from "../ui/Surface";

export function whoamiFor(credential: Credential): string {
  if (credential.kind === "agent") return `${credential.identity.name} · 智能体`;
  if (credential.kind === "board") return "管理密钥";
  return credential.user.name ?? credential.user.email ?? "已登录";
}

export function SignInScreen({
  onSignedIn,
}: {
  onSignedIn: (credential: Credential) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [useToken, setUseToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (useToken) {
        const candidate = token.trim();
        const credential = await classifyToken(candidate);
        await saveAuthToken(candidate);
        onSignedIn(credential);
      } else {
        const user = await signInWithEmail({ email: email.trim(), password });
        onSignedIn({ kind: "session", user });
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [useToken, token, email, password, onSignedIn]);

  const ready = useToken
    ? token.trim().length > 0
    : email.trim().length > 0 && password.length > 0;

  return (
    <Surface>
      <View style={styles.hero}>
        <Text style={styles.brandBig}>Coolie</Text>
        <Text style={styles.tagline}>把 AI 智能体当成一支团队来管理</Text>
      </View>

      {useToken ? (
        <>
          <Text style={styles.muted}>
            粘贴智能体 API Key 或管理 Key，应用会自动识别类型。
          </Text>
          <TextInput
            style={styles.input}
            placeholder="API Key"
            placeholderTextColor={C.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            value={token}
            onChangeText={setToken}
          />
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="邮箱"
            placeholderTextColor={C.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="密码"
            placeholderTextColor={C.ink3}
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
          />
        </>
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.btnPrimary, (!ready || busy) && styles.btnDisabled]}
        disabled={!ready || busy}
        onPress={submit}
      >
        <Text style={styles.btnPrimaryText}>
          {busy ? "验证中…" : useToken ? "连接" : "登录"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          setUseToken(!useToken);
          setError(null);
        }}
        style={styles.linkWrapper}
      >
        <Text style={styles.link}>
          {useToken ? "改用邮箱密码登录" : "改用 API Key 登录"}
        </Text>
      </Pressable>
    </Surface>
  );
}

/**
 * 解析要进入的公司: 只有一个就自动进入，多个让用户选，零公司给出解释。
 *
 * 渲染 HomeScreen 的职责通过 `renderHome` 交回调用方, 避免本模块反过来 import App.tsx。
 */
export function CompanyGate({
  credential,
  onSignOut,
  renderHome,
}: {
  credential: Credential;
  onSignOut: () => void;
  renderHome: (company: Company, whoami: string) => ReactNode;
}) {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Company | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = await credentialCompanies(credential);
        setCompanies(list);
        if (list.length === 1) setChosen(list[0]);
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
        setCompanies([]);
      }
    })();
  }, [credential]);

  if (chosen) {
    return <>{renderHome(chosen, whoamiFor(credential))}</>;
  }

  return (
    <Surface>
      <View style={styles.rowBetween}>
        <Text style={styles.h1}>Coolie</Text>
        <Pressable onPress={onSignOut} hitSlop={12} style={styles.btnGhost}>
          <Text style={styles.btnGhostText}>退出</Text>
        </Pressable>
      </View>

      {companies === null ? (
        <ActivityIndicator color={C.accent} style={styles.companyLoader} />
      ) : error !== null ? (
        <Text style={styles.error}>{error}</Text>
      ) : companies.length === 0 ? (
        <Text style={styles.muted}>
          {whoamiFor(credential)} 还不是任何公司的成员。请管理员在后台把账号加入公司。
        </Text>
      ) : (
        <>
          <Text style={styles.muted}>选择要进入的公司</Text>
          {companies.map((company) => (
            <AppCard
              key={company.id}
              onPress={() => setChosen(company)}
              row
              padding={16}
              style={styles.cardBetween}
            >
              <View style={styles.rowAlignCenterGap}>
                <StatusDot status="ok" size={6} />
                <Text style={styles.cardBtnTitle}>{company.name}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </AppCard>
          ))}
        </>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    gap: 8,
    marginVertical: 32,
  },
  brandBig: {
    fontSize: 32,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.4,
  },
  tagline: {
    fontSize: 13,
    color: C.ink3,
    fontWeight: "400",
  },
  h1: {
    fontSize: 20,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.4,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  rowAlignCenterGap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  // 幽灵按钮 (DESIGN.md 第3节: bg 0.02, border line, text ink2, radius 8)
  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostText: {
    color: C.ink2,
    fontWeight: "500",
    fontSize: 13,
  },
  muted: {
    color: C.ink3,
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
  error: {
    color: C.err,
    fontSize: 13,
    fontWeight: "500",
  },
  // 输入框 (DESIGN.md 第3节: bg 0.02, border line, radius 8, padding 12×14, text ink, placeholder ink3)
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
  // 主按钮 (DESIGN.md 第3节: bg #5E6AD2, text ink, radius 8, padding 12×16, weight 500)
  btnPrimary: {
    backgroundColor: C.brand,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    color: C.ink,
    fontWeight: "500",
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  linkWrapper: {
    paddingVertical: 8,
    alignItems: "center",
  },
  link: {
    color: C.accent,
    fontWeight: "500",
    fontSize: 13,
  },
  cardBetween: {
    justifyContent: "space-between",
  },
  cardBtnTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "500",
  },
  chevron: {
    color: C.ink4,
    fontSize: 16,
    fontWeight: "400",
  },
  companyLoader: {
    marginTop: 24,
  },
});
