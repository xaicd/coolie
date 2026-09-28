import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
import { RADIUS, SPACING } from "../ui/tokens";

interface CreateProjectSheetProps {
  company: Company;
  visible: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

type SourceMode = "git_url" | "local_path" | "none";

interface TemplatePreset {
  name: string;
  url: string;
  tag: string;
  desc: string;
}

const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    name: "RuoYi-All-Next",
    url: "https://github.com/xaicd/ruoyi-all-next.git",
    tag: "自有全栈底座",
    desc: "内置 SQLite / Prisma / 3200 端口，支持 APP 内原型沙箱全功能实时预览",
  },
  {
    name: "Spring Cloud Alibaba",
    url: "https://github.com/alibaba/spring-cloud-alibaba.git",
    tag: "微服务治理",
    desc: "阿里系高可用分布式微服务解决方案与中间件底座",
  },
  {
    name: "RuoYi-Vue-Pro",
    url: "https://github.com/YunaiV/ruoyi-vue-pro.git",
    tag: "企业全栈脚手架",
    desc: "基于 Spring Boot + Vue3 的大型企业级多租户业务中后台系统",
  },
  {
    name: "JeecgBoot",
    url: "https://github.com/jeecgboot/JeecgBoot.git",
    tag: "低代码微服务",
    desc: "低代码微服务开发平台，前后端代码生成与业务中台引擎",
  },
];

export function CreateProjectSheet({
  company,
  visible,
  onClose,
  onCreated,
}: CreateProjectSheetProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("git_url");
  const [gitUrls, setGitUrls] = useState<string[]>([""]);
  const [localPath, setLocalPath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patTarget, setPatTarget] = useState<{
    configured: boolean;
    platform: "gitee" | "github" | null;
    targetOrg: string | null;
  } | null>(null);

  useEffect(() => {
    if (!visible) return;
    coolie
      .request<{
        configured: boolean;
        platform: "gitee" | "github" | null;
        targetOrg: string | null;
      }>("GET", "/api/git-pat/target")
      .then((data) => {
        if (data?.configured && data?.targetOrg) {
          setPatTarget(data);
        }
      })
      .catch(() => undefined);
  }, [visible]);

  if (!visible) return null;

  const handleSelectPreset = (preset: TemplatePreset) => {
    setName(preset.name);
    setSourceMode("git_url");
    setGitUrls([preset.url]);
    setError(null);
  };

  const handleGitUrlChange = (index: number, val: string) => {
    setGitUrls((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });

    if (!name.trim()) {
      const clean = val.replace(/\.git$/, "").split("/").filter(Boolean).pop();
      if (clean) setName(clean);
    }
    if (error) setError(null);
  };

  const handleAddGitUrl = () => {
    setGitUrls((prev) => [...prev, ""]);
  };

  const handleRemoveGitUrl = (index: number) => {
    setGitUrls((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const handleLocalPathChange = (val: string) => {
    setLocalPath(val);
    if (!name.trim()) {
      const clean = val.split("/").filter(Boolean).pop();
      if (clean) setName(clean);
    }
    if (error) setError(null);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("请输入项目名称");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload: {
      name: string;
      description?: string;
      status: "in_progress" | "planned";
      repositoryUrls?: string[];
      workspace?: {
        sourceType?: string;
        cwd?: string;
      };
    } = {
      name: trimmedName,
      status: "in_progress",
      ...(description.trim() ? { description: description.trim() } : {}),
    };

    if (sourceMode === "git_url") {
      const validUrls = gitUrls.map((u) => u.trim()).filter(Boolean);
      if (validUrls.length > 0) {
        payload.repositoryUrls = validUrls;
      }
    } else if (sourceMode === "local_path" && localPath.trim()) {
      payload.workspace = {
        sourceType: "local_path",
        cwd: localPath.trim(),
      };
    }

    try {
      const created = await coolie.createProject(company.id, payload);
      onCreated(created);
      onClose();
    } catch (err) {
      setError((err as Error)?.message || "立项失败，请检查网络或配置");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* 点击暗色背景关闭 */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="关闭抽屉"
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheet}
        >
          {/* 顶部固定把手与标题栏 */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>极速立项 · 智能工程中心</Text>
                <Text style={styles.subtitle}>
                  多源工作区 · 开源底座 · 智能体开工
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={styles.closeBtn}
                accessibilityLabel="关闭"
              >
                <Ionicons name="close" size={20} color={C.ink3} />
              </Pressable>
            </View>
          </View>

          {/* 表单主体（自适应高度，超出 maxHeight 可滚动） */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* 常用开源复杂项目底座预设 */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="sparkles" size={14} color={C.accent} />
                <Text style={styles.sectionLabel}>
                  快速填入开源复杂项目预设
                </Text>
              </View>
              <View style={styles.presetGrid}>
                {TEMPLATE_PRESETS.map((preset) => {
                  const isSelected = name === preset.name;
                  return (
                    <Pressable
                      key={preset.name}
                      style={[
                        styles.presetCard,
                        isSelected && styles.presetCardActive,
                      ]}
                      onPress={() => handleSelectPreset(preset)}
                    >
                      <View style={styles.presetCardTop}>
                        <Text
                          style={[
                            styles.presetCardName,
                            isSelected && styles.presetCardNameActive,
                          ]}
                          numberOfLines={1}
                        >
                          {preset.name}
                        </Text>
                        <View
                          style={[
                            styles.presetBadge,
                            isSelected && styles.presetBadgeActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.presetBadgeText,
                              isSelected && styles.presetBadgeTextActive,
                            ]}
                          >
                            {preset.tag}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.presetCardDesc} numberOfLines={2}>
                        {preset.desc}
                      </Text>
                    </Pressable>
                  );
                })}
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

            {/* 代码库源模式 (Source Codebase Mode) */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>代码库源模式</Text>
                <Text style={styles.sectionSubLabel}>任意多源解绑</Text>
              </View>
              <View style={styles.modeTabs}>
                <Pressable
                  style={[
                    styles.modeTab,
                    sourceMode === "git_url" && styles.modeTabActive,
                  ]}
                  onPress={() => setSourceMode("git_url")}
                >
                  <Ionicons
                    name="link-outline"
                    size={14}
                    color={sourceMode === "git_url" ? C.accent : C.ink3}
                  />
                  <Text
                    style={[
                      styles.modeTabText,
                      sourceMode === "git_url" && styles.modeTabTextActive,
                    ]}
                  >
                    Git 仓库地址
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.modeTab,
                    sourceMode === "local_path" && styles.modeTabActive,
                  ]}
                  onPress={() => setSourceMode("local_path")}
                >
                  <Ionicons
                    name="folder-outline"
                    size={14}
                    color={sourceMode === "local_path" ? C.accent : C.ink3}
                  />
                  <Text
                    style={[
                      styles.modeTabText,
                      sourceMode === "local_path" && styles.modeTabTextActive,
                    ]}
                  >
                    本地目录
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.modeTab,
                    sourceMode === "none" && styles.modeTabActive,
                  ]}
                  onPress={() => setSourceMode("none")}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={14}
                    color={sourceMode === "none" ? C.accent : C.ink3}
                  />
                  <Text
                    style={[
                      styles.modeTabText,
                      sourceMode === "none" && styles.modeTabTextActive,
                    ]}
                  >
                    {patTarget?.targetOrg ? `组织托管 (${patTarget.targetOrg})` : "无代码库"}
                  </Text>
                </Pressable>
              </View>

              {/* Git 仓库模式：支持多仓库输入与添加 */}
              {sourceMode === "git_url" && (
                <View style={styles.sourcePanel}>
                  {gitUrls.map((url, index) => (
                    <View key={index} style={styles.gitUrlRow}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        placeholder={
                          index === 0
                            ? "https://gitee.com/... 或 https://gitlab.com/... 或 git@... (SSH)"
                            : "额外仓库地址 (如前端或依赖子模块)"
                        }
                        placeholderTextColor={C.ink4}
                        value={url}
                        onChangeText={(t) => handleGitUrlChange(index, t)}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {gitUrls.length > 1 && (
                        <Pressable
                          style={styles.trashBtn}
                          onPress={() => handleRemoveGitUrl(index)}
                          accessibilityLabel="移除仓库"
                        >
                          <Ionicons name="trash-outline" size={16} color={C.warn} />
                        </Pressable>
                      )}
                    </View>
                  ))}

                  <View style={styles.gitToolsRow}>
                    <Pressable
                      style={styles.addRepoBtn}
                      onPress={handleAddGitUrl}
                    >
                      <Ionicons name="add" size={14} color={C.accent} />
                      <Text style={styles.addRepoBtnText}>添加多仓库 (Multi-Repo)</Text>
                    </Pressable>
                    <Text style={styles.hintText}>
                      支持 Gitee / GitLab / 自建Git / GitHub / SSH
                    </Text>
                  </View>
                </View>
              )}

              {/* 本地目录模式 */}
              {sourceMode === "local_path" && (
                <View style={styles.sourcePanel}>
                  <TextInput
                    style={styles.input}
                    placeholder="/host-workspace/your-project (宿主机或容器物理路径)"
                    placeholderTextColor={C.ink4}
                    value={localPath}
                    onChangeText={handleLocalPathChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={styles.hintText}>
                    直接绑定开发主机或执行容器上的工作区物理目录，智能体将直接就地读写代码。
                  </Text>
                </View>
              )}

              {/* 无代码库 / PAT 默认托管模式 */}
              {sourceMode === "none" && (
                <View style={styles.nonePanel}>
                  <Ionicons
                    name="information-circle-outline"
                    size={16}
                    color={patTarget?.targetOrg ? C.accent : C.ink3}
                  />
                  <Text style={styles.nonePanelText}>
                    {patTarget?.targetOrg
                      ? `已接入启动 PAT：项目将默认托管并自动在 ${patTarget.platform === "gitee" ? "Gitee" : "GitHub"} 组织 [${patTarget.targetOrg}] 下创建专属私有仓库。`
                      : "创建纯规划与任务管理项目，无需预先绑定任何 Git 代码库或本地目录。后续可随时在项目配置中挂载工作区。"}
                  </Text>
                </View>
              )}
            </View>

            {/* 建设目标与项目概述 */}
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

            {/* 错误提示 */}
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={C.warn} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>

          {/* 底部固定操作栏（始终贴底可见，永不被挤跑） */}
          <View style={styles.footer}>
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
              onPress={() => void handleCreate()}
              disabled={!name.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons
                    name="flash-outline"
                    size={16}
                    color="#FFFFFF"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.submitBtnText}>一键立项并开工</Text>
                </>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.line,
  },
  header: {
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.surfaceHover,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    color: C.ink3,
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
    borderRadius: RADIUS.sm,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink2,
  },
  sectionSubLabel: {
    fontSize: 11,
    color: C.ink4,
    marginLeft: "auto",
  },
  presetGrid: {
    gap: 8,
  },
  presetCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    padding: 10,
    gap: 4,
  },
  presetCardActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(59, 130, 246, 0.08)",
  },
  presetCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  presetCardName: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink,
  },
  presetCardNameActive: {
    color: C.accent,
  },
  presetBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  presetBadgeActive: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
  },
  presetBadgeText: {
    fontSize: 10,
    color: C.ink3,
  },
  presetBadgeTextActive: {
    color: C.accent,
    fontWeight: "600",
  },
  presetCardDesc: {
    fontSize: 11,
    color: C.ink4,
    lineHeight: 15,
  },
  input: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: C.ink,
  },
  textArea: {
    height: 68,
    textAlignVertical: "top",
  },
  modeTabs: {
    flexDirection: "row",
    gap: 8,
  },
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  modeTabActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
  },
  modeTabText: {
    fontSize: 11,
    color: C.ink3,
    fontWeight: "500",
  },
  modeTabTextActive: {
    color: C.accent,
    fontWeight: "600",
  },
  sourcePanel: {
    gap: 8,
    marginTop: 2,
  },
  gitUrlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trashBtn: {
    padding: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  gitToolsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  addRepoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.accent,
    backgroundColor: "rgba(59, 130, 246, 0.06)",
  },
  addRepoBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.accent,
  },
  hintText: {
    fontSize: 10,
    color: C.ink4,
    lineHeight: 14,
  },
  nonePanel: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    padding: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  nonePanelText: {
    fontSize: 11,
    color: C.ink3,
    lineHeight: 16,
    flex: 1,
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
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  cancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
  },
  cancelBtnText: {
    fontSize: 13,
    color: C.ink3,
  },
  submitBtn: {
    backgroundColor: C.accent,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: RADIUS.md,
    flexDirection: "row",
    alignItems: "center",
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
