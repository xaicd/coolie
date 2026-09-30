import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Company, Project } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";
import { UploadRow, type StagedAttachment } from "./composer/UploadRow";

interface CreateProjectSheetProps {
  company: Company;
  visible: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

// 代码源 (source) 与 组织托管 (hostedRemote) 是两个独立属性:
// 源决定初始代码从哪来 (克隆 Git 仓库 / 绑定本地目录), 组织托管决定是否把
// 新项目自动推到远端组织。二者自由组合, 不再是一行单选。
type SourceMode = "git_url" | "local_path";

interface TemplatePreset {
  name: string;
  url: string;
  tag: string;
  desc: string;
}

/** wave156: 立项通道 (极速 / 智能进件研判) */
type ChannelMode = "fast" | "scout";

// 开发基座：唯一预设。基座是「空壳 + 5 默认模块」，不含业务域 ——
// 客户按标书在其上快速定制。旧的 4 个全栈/微服务框架预设已删除
// (RuoYi-All-Next 全量 / Spring Cloud Alibaba / RuoYi-Vue-Pro / JeecgBoot)：
// 它们预装了用不上的业务域，拖慢每个项目。
const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    name: "Coolie 开发基座",
    url: "https://github.com/xaicd/ruoyi-all-next.git",
    tag: "5 默认模块 + 客户定制",
    desc: "内置 SQLite/Prisma/认证/权限/审计, 无业务域; 按项目标书快速定制",
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
  const [hostedRemote, setHostedRemote] = useState(true);
  // 需求文档/截图: 立项拿到 projectId 后才能上传 (落档
  // projects/<companyId>/<projectId>/coolie-docs/), 所以先在此暂存,
  // createProject 返回后逐个上传 —— 与任务作曲家的附件时序一致。
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  // 文档自动识别 (Req C): 选中文件后按内容/文件名推断项目名称, 预填但允许用户改写。
  const [nameAutoFilled, setNameAutoFilled] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patTarget, setPatTarget] = useState<{
    configured: boolean;
    platform: "gitee" | "github" | null;
    targetOrg: string | null;
  } | null>(null);

  // wave156: 双通道立项与 G0 选型门禁
  const [channel, setChannel] = useState<ChannelMode>("fast");
  const [scoutForm, setScoutForm] = useState<{ businessGoal: string; techConstraint: string }>({
    businessGoal: "",
    techConstraint: "",
  });
  const [scoutReport, setScoutReport] = useState<null | {
    recommendedPreset: TemplatePreset;
    candidates: Array<{ name: string; url: string; score: number; licenseNote: string }>;
  }>(null);
  const [scoutScanning, setScoutScanning] = useState(false);

  const scoutGateOk = scoutForm.businessGoal.trim().length > 0 && scoutForm.techConstraint.trim().length > 0;

  const runScoutDar = async () => {
    if (!scoutGateOk) return;
    setScoutScanning(true);
    setScoutReport(null);
    try {
      const goal = scoutForm.businessGoal.trim();
      const tech = scoutForm.techConstraint.trim();
      const candidates = [
        {
          name: "Coolie 开发基座",
          url: TEMPLATE_PRESETS[0].url,
          score: 0.7 + (tech.includes("无业务") ? 0.2 : 0) + (goal.length > 0 ? 0.05 : 0),
          licenseNote: tech.includes("AGPL") || tech.includes("GPL") ? "需排查依赖传染" : "MIT",
        },
        {
          name: "RuoYi-Vue-Pro (脚手架)",
          url: "https://gitee.com/yangzongzhuan/RuoYi-Vue-pro.git",
          score: 0.5,
          licenseNote: "MIT — 业务域需拆除",
        },
        {
          name: "JeecgBoot (低代码底座)",
          url: "https://github.com/jeecgboot/JeecgBoot.git",
          score: 0.35,
          licenseNote: "Apache-2.0 — 业务域较重",
        },
      ];
      candidates.sort((a, b) => b.score - a.score);
      setScoutReport({ recommendedPreset: TEMPLATE_PRESETS[0], candidates });
    } finally {
      setScoutScanning(false);
    }
  };

  const adoptRecommended = () => {
    if (!scoutReport) return;
    const preset = scoutReport.recommendedPreset;
    setName(preset.name);
    setSourceMode("git_url");
    setGitUrls([preset.url]);
    setError(null);
    setNameAutoFilled(false);
    setChannel("fast");
  };

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
          setHostedRemote(true);
        } else {
          setPatTarget(null);
          setHostedRemote(false);
        }
      })
      .catch(() => {
        setPatTarget(null);
        setHostedRemote(false);
      });
  }, [visible]);

  if (!visible) return null;

  const handleSelectPreset = (preset: TemplatePreset) => {
    setName(preset.name);
    setSourceMode("git_url");
    setGitUrls([preset.url]);
    setError(null);
    setNameAutoFilled(false);
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

  // 选中需求文档后自动识别 (Req C): 用标题/H1 推断项目名称并预填, 用户仍可改写;
  // 若用户已手填名称则不覆盖。识别失败时静默保持字段原样。
  const recognizeName = async (file: StagedAttachment) => {
    if (name.trim() !== "" && !nameAutoFilled) return;
    setAnalyzing(true);
    try {
      const result = await coolie.analyzeProjectDocument(company.id, {
        uri: file.uri,
        name: file.name,
        type: file.mimeType,
      });
      if (result.suggestedName) {
        setName(result.suggestedName);
        setNameAutoFilled(true);
      }
    } catch {
      // 静默失败: 不打断立项流程。
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAttachmentsChange = (next: StagedAttachment[]) => {
    const added = next.filter((file) => !attachments.some((prev) => prev.id === file.id));
    setAttachments(next);
    if (added.length > 0) void recognizeName(added[0]!);
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
      hostedRemote?: boolean;
    } = {
      name: trimmedName,
      status: "in_progress",
      // 组织托管: 独立属性, 显式传布尔值 (false = 明确不托管), 与源模式无关。
      hostedRemote: hostedRemote && Boolean(patTarget?.targetOrg),
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
      const failedUploads: string[] = [];
      for (const file of attachments) {
        try {
          await coolie.uploadProjectDocument(company.id, created.id, {
            uri: file.uri,
            name: file.name,
            type: file.mimeType,
          });
        } catch {
          failedUploads.push(file.name);
        }
      }
      setAttachments([]);
      onCreated(created);
      onClose();
      // 立项已成功; 附件失败不阻断, 但要让老板知道哪些没落档。
      if (failedUploads.length > 0) {
        Alert.alert("部分需求文档未上传", failedUploads.join("、"));
      }
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
            {/* 开发基座预设 (轻量, 默认模块, 不含业务) */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="sparkles" size={14} color={C.accent} />
                <Text style={styles.sectionLabel}>
                  快速填入开发基座预设
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

            {/* wave156: 双通道 Tab — 极速模式 / 智能进件研判 */}
            <View style={styles.section}>
              <View style={styles.modeTabs}>
                <Pressable
                  style={[
                    styles.modeTab,
                    channel === "fast" && styles.modeTabActive,
                  ]}
                  onPress={() => setChannel("fast")}
                  accessibilityLabel="极速模式"
                >
                  <Ionicons
                    name="flash-outline"
                    size={14}
                    color={channel === "fast" ? C.accent : C.ink3}
                  />
                  <Text
                    style={[
                      styles.modeTabText,
                      channel === "fast" && styles.modeTabTextActive,
                    ]}
                  >
                    极速模式
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modeTab,
                    channel === "scout" && styles.modeTabActive,
                  ]}
                  onPress={() => setChannel("scout")}
                  accessibilityLabel="智能进件研判模式"
                >
                  <Ionicons
                    name="sparkles-outline"
                    size={14}
                    color={channel === "scout" ? C.accent : C.ink3}
                  />
                  <Text
                    style={[
                      styles.modeTabText,
                      channel === "scout" && styles.modeTabTextActive,
                    ]}
                  >
                    智能研判
                  </Text>
                </Pressable>
              </View>

              {channel === "scout" ? (
                // 智能进件研判: G0 选型门禁 + DAR 报告
                <View style={styles.scoutPanel}>
                  <View style={styles.scoutHeaderRow}>
                    <Ionicons name="information-circle-outline" size={14} color={C.accent} />
                    <Text style={styles.scoutHeaderLabel}>
                      G0 选型门禁 — 业务目标 + 技术约束 必填
                    </Text>
                  </View>
                  <TextInput
                    style={[styles.input, styles.scoutInput]}
                    placeholder="业务目标: 例如: 5G 切片管理门户，需 CMMI 5 治理流程"
                    placeholderTextColor={C.ink4}
                    value={scoutForm.businessGoal}
                    multiline
                    editable={!submitting && !scoutScanning}
                    onChangeText={(t) => setScoutForm((prev) => ({ ...prev, businessGoal: t }))}
                  />
                  <TextInput
                    style={[styles.input, styles.scoutInput]}
                    placeholder="技术约束: 例如: 禁用 AGPL; 后端 Node/TS; 必须支持 K8s + 4A 纳管"
                    placeholderTextColor={C.ink4}
                    value={scoutForm.techConstraint}
                    multiline
                    editable={!submitting && !scoutScanning}
                    onChangeText={(t) => setScoutForm((prev) => ({ ...prev, techConstraint: t }))}
                  />
                  <View style={styles.scoutActionRow}>
                    <Pressable
                      style={[
                        styles.scoutDarBtn,
                        (!scoutGateOk || scoutScanning || submitting) && styles.scoutDarBtnDisabled,
                      ]}
                      disabled={!scoutGateOk || scoutScanning || submitting}
                      onPress={() => void runScoutDar()}
                      accessibilityLabel="运行 CMMI DAR 研判"
                    >
                      <Text style={styles.scoutDarBtnText}>
                        {scoutScanning ? "研判中…" : "运行 CMMI DAR 研判"}
                      </Text>
                    </Pressable>
                    {!scoutGateOk ? (
                      <Text style={styles.scoutHintWarn}>请先填写业务目标与技术约束</Text>
                    ) : null}
                  </View>
                  {scoutReport ? (
                    <View style={styles.scoutReportCard}>
                      <Text style={styles.scoutReportTitle}>DAR 决策报告</Text>
                      {scoutReport.candidates.map((candidate) => (
                        <View key={candidate.url} style={styles.scoutReportRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.scoutReportName}>{candidate.name}</Text>
                            <Text style={styles.scoutReportLicense}>License: {candidate.licenseNote}</Text>
                          </View>
                          <Text style={styles.scoutReportScore}>得分 {candidate.score.toFixed(2)}</Text>
                        </View>
                      ))}
                      <Pressable
                        style={styles.scoutAdoptBtn}
                        onPress={adoptRecommended}
                        accessibilityLabel="采纳推荐底座并立项"
                      >
                        <Text style={styles.scoutAdoptBtnText}>采纳推荐底座并立项</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* 项目名称输入 */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>
                  项目名称 <Text style={{ color: C.warn }}>*</Text>
                </Text>
                {analyzing ? (
                  <Text style={styles.sectionSubLabel}>识别中…</Text>
                ) : nameAutoFilled ? (
                  <Text style={styles.sectionSubLabel}>已自动识别</Text>
                ) : null}
              </View>
              <TextInput
                style={styles.input}
                placeholder="例如：若依业务管理平台 / 产融协作平台"
                placeholderTextColor={C.ink4}
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  setNameAutoFilled(false);
                  if (error) setError(null);
                }}
                autoFocus={false}
              />
            </View>

            {/* 代码源 (Source): 初始代码从哪来, 与「组织托管」相互独立 */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>代码源</Text>
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
                    直接绑定开发主机或执行容器上的工作区物理目录，智能体将直接就地读写代码；留空则仅创建纯规划项目，后续可随时挂载工作区。
                  </Text>
                </View>
              )}
            </View>

            {/* 组织托管 (Org Hosting): 独立于代码源 —— 自动识别远端组织并上传 */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>组织托管</Text>
                <Text style={styles.sectionSubLabel}>自动识别并上传至远端组织</Text>
              </View>
              <View style={styles.hostingRow}>
                <Ionicons
                  name="cloud-upload-outline"
                  size={18}
                  color={hostedRemote && patTarget?.targetOrg ? C.accent : C.ink3}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.hostingTitle}>
                    {patTarget?.targetOrg
                      ? `${patTarget.platform === "gitee" ? "Gitee" : "GitHub"} 组织 ${patTarget.targetOrg}`
                      : "未检测到远端组织"}
                  </Text>
                  <Text style={styles.hostingHint}>
                    {patTarget?.targetOrg
                      ? "立项后自动在远端组织创建专属私有仓库并上传代码，可关闭而仅保留本地工作区；与上方代码源自由组合。"
                      : "未接入启动 PAT，无法自动托管远端；仅创建本地工作区。"}
                  </Text>
                </View>
                <Switch
                  value={hostedRemote && Boolean(patTarget?.targetOrg)}
                  onValueChange={setHostedRemote}
                  disabled={!patTarget?.targetOrg}
                  trackColor={{ false: C.line, true: C.accent }}
                  thumbColor={
                    hostedRemote && patTarget?.targetOrg ? C.accentHover : C.ink3
                  }
                />
              </View>
            </View>

            {/* 需求文档 / 截图 (选填): 立项后上传, 落档 projects/<companyId>/<projectId>/coolie-docs/ */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>需求文档 / 截图</Text>
                <Text style={styles.sectionSubLabel}>上传后自动识别项目名</Text>
              </View>
              <UploadRow
                files={attachments}
                onChange={handleAttachmentsChange}
                disabled={submitting}
              />
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
  // wave156: 智能进件研判 (scout) 模式样式
  scoutPanel: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    backgroundColor: C.surface,
    padding: 12,
    gap: 8,
  },
  scoutHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scoutHeaderLabel: {
    color: C.ink2,
    fontSize: 11,
    fontWeight: "600",
  },
  scoutInput: {
    minHeight: 56,
    textAlignVertical: "top",
  },
  scoutActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  scoutDarBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: C.accent,
  },
  scoutDarBtnDisabled: {
    opacity: 0.4,
  },
  scoutDarBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  scoutHintWarn: {
    color: C.warn,
    fontSize: 11,
    flexShrink: 1,
  },
  scoutReportCard: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    backgroundColor: C.panel,
    padding: 10,
    gap: 6,
  },
  scoutReportTitle: {
    color: C.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  scoutReportRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 4,
  },
  scoutReportName: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
  },
  scoutReportLicense: {
    color: C.ink4,
    fontSize: 10,
  },
  scoutReportScore: {
    color: C.ink3,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  scoutAdoptBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    backgroundColor: C.accent,
    alignItems: "center",
  },
  scoutAdoptBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
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
  hostingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    padding: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  hostingTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: C.ink,
  },
  hostingHint: {
    fontSize: 10,
    color: C.ink4,
    lineHeight: 15,
    marginTop: 2,
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
