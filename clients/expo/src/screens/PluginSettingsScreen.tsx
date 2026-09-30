import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Company, PluginRecord } from "@coolie/api-client";
import { coolie } from "../coolie";
import { C } from "../theme";
import { RADIUS, SPACING } from "../ui/tokens";
import { AppCard } from "../ui/AppCard";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { ScreenHeader } from "../ui/ScreenHeader";
import { StatusBadge } from "../ui/StatusBadge";

interface PluginSettingsScreenProps {
  company: Company;
  pluginId: string;
  /** 兼容: 直接把整个 PluginRecord 传进来 (避免一次额外 request). */
  initialPlugin?: PluginRecord;
  onBack?: () => void;
  onChanged?: (next: PluginRecord) => void;
}

interface FieldRowProps {
  label: string;
  value: unknown;
  type: "string" | "number" | "boolean" | "select" | "unknown";
  options?: Array<{ value: string; label: string }>;
  description?: string;
  disabled?: boolean;
  onChange: (next: unknown) => void;
}

function FieldRow({ label, value, type, options, description, disabled, onChange }: FieldRowProps) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {description ? <Text style={styles.fieldDesc}>{description}</Text> : null}
      </View>
      <View style={styles.fieldControl}>
        {type === "boolean" ? (
          <Switch
            value={Boolean(value)}
            onValueChange={onChange}
            disabled={disabled}
            trackColor={{ false: C.lineSubtle, true: C.accent }}
            thumbColor={value ? "#FFFFFF" : "#888"}
          />
        ) : type === "select" && options ? (
          <View style={styles.selectRow}>
            {options.map((opt) => {
              const active = String(value ?? "") === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  disabled={disabled}
                  onPress={() => onChange(opt.value)}
                  style={[
                    styles.selectChip,
                    active && styles.selectChipActive,
                    disabled && styles.disabled,
                  ]}
                  hitSlop={4}
                >
                  <Text
                    style={[
                      styles.selectChipText,
                      active && styles.selectChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : type === "number" ? (
          <TextInput
            style={styles.input}
            value={value === undefined || value === null ? "" : String(value)}
            editable={!disabled}
            keyboardType="numeric"
            onChangeText={(text) => {
              const n = Number(text);
              onChange(Number.isFinite(n) ? n : text);
            }}
            placeholderTextColor={C.ink4}
          />
        ) : type === "string" ? (
          <TextInput
            style={styles.input}
            value={value === undefined || value === null ? "" : String(value)}
            editable={!disabled}
            onChangeText={onChange}
            placeholderTextColor={C.ink4}
          />
        ) : (
          <Text style={styles.rawValue} numberOfLines={3}>
            {value === undefined ? "(未设置)" : JSON.stringify(value)}
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * 单插件设置屏 — 抄 web 端 PluginSettings 的核心:
 * 1. 顶部身份区 (id / 版本 / 描述 / 状态)
 * 2. 当前公司级配置 (configJson) 的可编辑表单
 * 3. 保存 → POST /api/plugins/:id/config
 *
 * 设计取舍 (wave235):
 * - App 没有 JSON Schema Form 组件, 这里用启发式推断每个字段类型
 *   (boolean / number / string / enum), 推断不出的就原样显示 + 允许编辑.
 * - 没装的插件提示并提供"启用"快捷入口.
 */
export function PluginSettingsScreen({
  company,
  pluginId,
  initialPlugin,
  onBack,
  onChanged,
}: PluginSettingsScreenProps) {
  const [plugin, setPlugin] = useState<PluginRecord | null>(initialPlugin ?? null);
  const [configJson, setConfigJson] = useState<Record<string, unknown>>({});
  const [originalConfig, setOriginalConfig] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialPlugin);
  const [saving, setSaving] = useState(false);
  const [busyEnable, setBusyEnable] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        initialPlugin ? Promise.resolve(initialPlugin) : coolie.getPlugin(pluginId),
        coolie.getPluginConfig(pluginId, company.id),
      ]);
      setPlugin(p);
      const initial = (c?.configJson ?? {}) as Record<string, unknown>;
      setConfigJson({ ...initial });
      setOriginalConfig({ ...initial });
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [pluginId, company.id, initialPlugin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isDirty = useMemo(
    () => JSON.stringify(configJson) !== JSON.stringify(originalConfig),
    [configJson, originalConfig],
  );

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      await coolie.updatePluginConfig(pluginId, company.id, configJson);
      setOriginalConfig({ ...configJson });
      Alert.alert("已保存", "配置已更新.");
    } catch (e) {
      Alert.alert("保存失败", String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }, [pluginId, company.id, configJson]);

  const onReset = useCallback(() => {
    setConfigJson({ ...originalConfig });
  }, [originalConfig]);

  const onToggleEnable = useCallback(async () => {
    if (!plugin) return;
    setBusyEnable(true);
    try {
      const enabled = plugin.enabled ?? plugin.status === "ready";
      const next = enabled
        ? await coolie.disablePlugin(plugin.id)
        : await coolie.enablePlugin(plugin.id);
      setPlugin(next);
      onChanged?.(next);
    } catch (e) {
      Alert.alert("切换失败", String((e as Error)?.message ?? e));
    } finally {
      setBusyEnable(false);
    }
  }, [plugin, onChanged]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="插件设置" onBack={onBack} />
        <LoadingState text="加载插件信息…" />
      </View>
    );
  }

  if (error && !plugin) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="插件设置" onBack={onBack} />
        <ErrorRetry message={error} onRetry={refresh} />
      </View>
    );
  }

  if (!plugin) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="插件设置" onBack={onBack} />
        <Text style={styles.muted}>没有拿到插件信息.</Text>
      </View>
    );
  }

  const enabled = plugin.enabled ?? plugin.status === "ready";
  const configKeys = Object.keys(configJson);
  const isReady = enabled && plugin.status === "ready";

  return (
    <View style={styles.screen}>
      <ScreenHeader title={plugin.displayName || plugin.pluginKey} onBack={onBack} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <AppCard variant="surface" padding={SPACING.md}>
          <View style={styles.identityRow}>
            <View style={styles.identityTextCol}>
              <Text style={styles.identityKey} numberOfLines={1}>
                {plugin.pluginKey}
              </Text>
              <Text style={styles.identityVersion}>v{plugin.version}</Text>
            </View>
            <StatusBadge
              label={isReady ? "运行中" : enabled ? "已启用" : "已停用"}
              tone={isReady ? "ok" : enabled ? "warn" : "neutral"}
            />
          </View>
          {plugin.description ? (
            <Text style={styles.identityDesc}>{plugin.description}</Text>
          ) : null}

          <View style={styles.identityActions}>
            <Pressable
              onPress={onToggleEnable}
              disabled={busyEnable}
              style={[
                styles.toggleBtn,
                enabled ? styles.toggleBtnOff : styles.toggleBtnOn,
                busyEnable && styles.disabled,
              ]}
              hitSlop={4}
            >
              {busyEnable ? (
                <ActivityIndicator size="small" color={enabled ? C.warn : C.ok} />
              ) : (
                <Ionicons
                  name={enabled ? "power" : "power-outline"}
                  size={14}
                  color={enabled ? C.warn : C.ok}
                />
              )}
              <Text style={[styles.toggleText, { color: enabled ? C.warn : C.ok }]}>
                {busyEnable ? "处理中…" : enabled ? "停用插件" : "启用插件"}
              </Text>
            </Pressable>
          </View>
        </AppCard>

        <Text style={styles.sectionTitle}>公司级配置</Text>
        {configKeys.length === 0 ? (
          <AppCard variant="outline" padding={SPACING.md}>
            <Text style={styles.muted}>
              这个插件没有声明公司级配置. 如需定制参数, 请联系管理员修改插件 manifest.
            </Text>
          </AppCard>
        ) : (
          <AppCard variant="outline" padding={SPACING.md}>
            {configKeys.map((key) => {
              const value = configJson[key];
              const type: FieldRowProps["type"] =
                typeof value === "boolean"
                  ? "boolean"
                  : typeof value === "number"
                    ? "number"
                    : typeof value === "string"
                      ? "string"
                      : "unknown";
              return (
                <FieldRow
                  key={key}
                  label={key}
                  value={value}
                  type={type}
                  disabled={!isReady}
                  onChange={(next) =>
                    setConfigJson((prev) => ({ ...prev, [key]: next }))
                  }
                />
              );
            })}
          </AppCard>
        )}

        <View style={styles.bottomActions}>
          <Pressable
            onPress={onReset}
            disabled={!isDirty || saving}
            style={[styles.btnGhost, (!isDirty || saving) && styles.disabled]}
            hitSlop={4}
          >
            <Text style={styles.btnGhostText}>重置</Text>
          </Pressable>
          <Pressable
            onPress={onSave}
            disabled={!isDirty || saving}
            style={[styles.btnPrimary, (!isDirty || saving) && styles.disabled]}
            hitSlop={4}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.btnPrimaryText}>
                {isDirty ? "保存配置" : "未改动"}
              </Text>
            )}
          </Pressable>
        </View>

        {plugin.lastError ? (
          <AppCard variant="outline" padding={SPACING.md} style={{ borderColor: C.err }}>
            <Text style={styles.errorTitle}>最近错误</Text>
            <Text style={styles.errorLine}>{plugin.lastError}</Text>
          </AppCard>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
    gap: SPACING.md,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  identityTextCol: {
    flex: 1,
    marginRight: 8,
  },
  identityKey: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink,
  },
  identityVersion: {
    fontSize: 11,
    color: C.ink4,
    marginTop: 2,
    fontFamily: "monospace",
  },
  identityDesc: {
    fontSize: 12,
    color: C.ink3,
    marginTop: 8,
    lineHeight: 17,
  },
  identityActions: {
    flexDirection: "row",
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  toggleBtnOn: {
    borderColor: C.ok,
    backgroundColor: "rgba(0, 200, 100, 0.08)",
  },
  toggleBtnOff: {
    borderColor: C.warn,
    backgroundColor: "rgba(255, 170, 0, 0.08)",
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "500",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink2,
    marginTop: SPACING.sm,
    marginBottom: -4,
  },
  fieldRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.lineSubtle,
  },
  fieldHeader: {
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 12,
    color: C.ink2,
    fontFamily: "monospace",
  },
  fieldDesc: {
    fontSize: 11,
    color: C.ink4,
    marginTop: 2,
  },
  fieldControl: {
    paddingLeft: 4,
  },
  selectRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  selectChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
  },
  selectChipActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(0, 200, 255, 0.12)",
  },
  selectChipText: {
    fontSize: 12,
    color: C.ink3,
  },
  selectChipTextActive: {
    color: C.accent,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: C.ink,
    fontSize: 13,
    backgroundColor: C.bg,
  },
  rawValue: {
    fontSize: 12,
    color: C.ink3,
    fontFamily: "monospace",
  },
  bottomActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  btnGhost: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.line,
  },
  btnGhostText: {
    fontSize: 13,
    color: C.ink2,
  },
  btnPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: C.accent,
    minWidth: 100,
    alignItems: "center",
  },
  btnPrimaryText: {
    fontSize: 13,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.4,
  },
  muted: {
    fontSize: 13,
    color: C.ink3,
    lineHeight: 18,
    padding: SPACING.md,
  },
  errorTitle: {
    fontSize: 12,
    color: C.err,
    fontWeight: "600",
    marginBottom: 4,
  },
  errorLine: {
    fontSize: 12,
    color: C.err,
    lineHeight: 17,
  },
});
