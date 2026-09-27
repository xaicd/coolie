import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Company, Project } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { Sheet } from "../ui/Sheet";
import { RADIUS, SPACING } from "../ui/tokens";

interface CreateProjectSheetProps {
  company: Company;
  visible: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

type TemplateKind = "ruoyi" | "empty" | "custom";

const QUICK_PRESETS = [
  { label: "若依业务系统", name: "若依业务管理平台", desc: "基于 ruoyi-all-next 的现代化多租户中后台业务系统" },
  { label: "国信产融智能体", name: "国信产融智能体应用", desc: "财报核验、风控排查、尽调分析一体化产融协同平台" },
  { label: "智能问数中台", name: "企业级 ChatBI 问数", desc: "融合业务本体图谱的高保真数据对话与决策推理中枢" },
];

export function CreateProjectSheet({
  company,
  visible,
  onClose,
  onCreated,
}: CreateProjectSheetProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<TemplateKind>("ruoyi");
  const [customRepoUrl, setCustomRepoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  const handleSelectPreset = (preset: (typeof QUICK_PRESETS)[0]) => {
    setName(preset.name);
    setDescription(preset.desc);
    setError(null);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("请输入项目名称");
      return;
    }

    setSubmitting(true);
    setError(null);

    let workspace:
      | { name: string; repoUrl: string; branch: string }
      | undefined;

    if (template === "ruoyi") {
      workspace = {
        name: "ruoyi-all-next-workspace",
        repoUrl: "https://github.com/xaicd/ruoyi-all-next.git",
        branch: "main",
      };
    } else if (template === "custom" && customRepoUrl.trim()) {
      workspace = {
        name: `${trimmedName.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}-workspace`,
        repoUrl: customRepoUrl.trim(),
        branch: "main",
      };
    }

    try {
      const created = await coolie.createProject(company.id, {
        name: trimmedName,
        description: description.trim() || undefined,
        status: "in_progress",
        workspace,
      });
      onCreated(created);
      onClose();
    } catch (err) {
      setError((err as Error)?.message || "立项失败，请检查网络或配置");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet onClose={onClose} title="极速立项 · 智能工程中心" maxHeight={620}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* 快捷立项模板标签 */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>快捷立项预设</Text>
            <View style={styles.presetRow}>
              {QUICK_PRESETS.map((p) => (
                <Pressable
                  key={p.label}
                  style={[
                    styles.presetChip,
                    name === p.name && styles.presetChipActive,
                  ]}
                  onPress={() => handleSelectPreset(p)}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      name === p.name && styles.presetChipTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* 项目名称输入 */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              项目名称 <Text style={{ color: C.warn }}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="例如：若依业务管理平台 / 产融协作平台"
              placeholderTextColor={C.ink4}
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (error) setError(null);
              }}
              autoFocus={false}
            />
          </View>

          {/* 建设目标与描述 */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>建设目标与项目概述</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="简要说明本项目的交付目标、核心功能与智能体职责..."
              placeholderTextColor={C.ink4}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* 代码库与沙箱挂载方式 */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>代码库与原型沙箱工作区</Text>
            <View style={styles.templateOptions}>
              <Pressable
                style={[
                  styles.templateCard,
                  template === "ruoyi" && styles.templateCardActive,
                ]}
                onPress={() => setTemplate("ruoyi")}
              >
                <View style={styles.templateHeader}>
                  <Ionicons
                    name="logo-github"
                    size={16}
                    color={template === "ruoyi" ? C.accent : C.ink2}
                  />
                  <Text
                    style={[
                      styles.templateTitle,
                      template === "ruoyi" && styles.templateTitleActive,
                    ]}
                  >
                    若依全栈 Next (ruoyi-all-next)
                  </Text>
                  <View style={styles.recommendedBadge}>
                    <Text style={styles.recommendedBadgeText}>推荐</Text>
                  </View>
                </View>
                <Text style={styles.templateDesc}>
                  内置 SQLite / Prisma / 3200 端口开箱即用，支持 APP 内原型沙箱全功能实时预览
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.templateCard,
                  template === "empty" && styles.templateCardActive,
                ]}
                onPress={() => setTemplate("empty")}
              >
                <View style={styles.templateHeader}>
                  <Ionicons
                    name="folder-outline"
                    size={16}
                    color={template === "empty" ? C.accent : C.ink2}
                  />
                  <Text
                    style={[
                      styles.templateTitle,
                      template === "empty" && styles.templateTitleActive,
                    ]}
                  >
                    纯管理型项目（暂不关联代码）
                  </Text>
                </View>
                <Text style={styles.templateDesc}>
                  仅通过 6 人编制智能体开展文档撰写、RTM 需求追溯与业务推演
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.templateCard,
                  template === "custom" && styles.templateCardActive,
                ]}
                onPress={() => setTemplate("custom")}
              >
                <View style={styles.templateHeader}>
                  <Ionicons
                    name="git-branch-outline"
                    size={16}
                    color={template === "custom" ? C.accent : C.ink2}
                  />
                  <Text
                    style={[
                      styles.templateTitle,
                      template === "custom" && styles.templateTitleActive,
                    ]}
                  >
                    自定义 Git 代码仓库
                  </Text>
                </View>
                <Text style={styles.templateDesc}>
                  挂载自有私有 Git 或开源仓库地址，由研发智能体自动检出
                </Text>
              </Pressable>
            </View>

            {template === "custom" && (
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                placeholder="https://github.com/org/repo.git"
                placeholderTextColor={C.ink4}
                value={customRepoUrl}
                onChangeText={setCustomRepoUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          </View>

          {/* 错误提示 */}
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={C.warn} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* 底部按钮 */}
          <View style={styles.footerRow}>
            <Pressable
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.cancelBtnText}>取消</Text>
            </Pressable>

            <Pressable
              style={[
                styles.submitBtn,
                (!name.trim() || submitting) && styles.submitBtnDisabled,
              ]}
              onPress={handleCreate}
              disabled={!name.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="flash-outline" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.submitBtnText}>一键立项并开工</Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 16,
  },
  section: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink2,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetChip: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  presetChipActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
  },
  presetChipText: {
    fontSize: 12,
    color: C.ink3,
  },
  presetChipTextActive: {
    color: C.accent,
    fontWeight: "600",
  },
  input: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: C.ink,
  },
  textArea: {
    height: 72,
    textAlignVertical: "top",
  },
  templateOptions: {
    gap: 8,
  },
  templateCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    padding: 10,
    gap: 4,
  },
  templateCardActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(59, 130, 246, 0.06)",
  },
  templateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  templateTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink2,
    flex: 1,
  },
  templateTitleActive: {
    color: C.accent,
  },
  recommendedBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recommendedBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#10b981",
  },
  templateDesc: {
    fontSize: 11,
    color: C.ink4,
    lineHeight: 15,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    padding: 8,
    borderRadius: RADIUS.sm,
  },
  errorText: {
    fontSize: 12,
    color: C.warn,
    flex: 1,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
  },
  cancelBtnText: {
    fontSize: 14,
    color: C.ink3,
  },
  submitBtn: {
    backgroundColor: C.accent,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: RADIUS.md,
    flexDirection: "row",
    alignItems: "center",
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
