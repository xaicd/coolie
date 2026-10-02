import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import type {
  Company,
  OntologyDomain,
  OntologyEntityTypeLevel,
  OntologyLevelsResponse,
  OntologyInstanceRow,
  OntologyPropertiesResponse,
} from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { OntologyGraphWorkbenchScreen } from "./OntologyGraphWorkbenchScreen";
import { AppCard } from "../ui/AppCard";
import { RADIUS, SPACING } from "../ui/tokens";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { SectionHeader } from "../ui/SectionHeader";

interface OntologyDomainListScreenProps {
  company: Company;
  whoami?: string;
  onOpenWebOntology?: () => void;
  onOpenSchemaEditor?: (typeId: string, displayName: string) => void;
  onOpenInstanceGraph?: (typeId: string, displayName: string) => void;
}

interface EntityCategoryConfig {
  entityType: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  desc: string;
  color: string;
}

const ENTITY_CATEGORIES: EntityCategoryConfig[] = [
  {
    entityType: "project",
    label: "业务项目",
    icon: "folder-outline",
    desc: "核心业务微服务与研发工程",
    color: "#5E6AD2",
  },
  {
    entityType: "issue",
    label: "任务工单",
    icon: "list-outline",
    desc: "正在流转与协同处理的业务任务",
    color: "#39A275",
  },
  {
    entityType: "work_product",
    label: "交付产物",
    icon: "cube-outline",
    desc: "各阶段产出的交付物与技术工件",
    color: "#E0A030",
  },
  {
    entityType: "agent",
    label: "数字员工",
    icon: "people-outline",
    desc: "参与研发、运维与管理的智能体角色",
    color: "#7A6FD6",
  },
  {
    entityType: "spec",
    label: "系统规范",
    icon: "document-text-outline",
    desc: "业务需求、系统设计与验收规范",
    color: "#4FA1D9",
  },
  {
    entityType: "conversation",
    label: "工坊会话",
    icon: "chatbubbles-outline",
    desc: "工坊会话与多智能体协同记录",
    color: "#C95757",
  },
];

export function OntologyDomainListScreen({
  company,
  whoami = "管理员",
  onOpenWebOntology,
  onOpenSchemaEditor,
  onOpenInstanceGraph,
}: OntologyDomainListScreenProps) {
  // ── 顶部主视图切换: 关系图谱 (默认) vs 实体清单 ──
  const [viewMode, setViewMode] = useState<"graph" | "entities">("graph");

  // ── 业务实体状态: 选中的类型与实例 ──
  const [selectedEntityType, setSelectedEntityType] = useState<EntityCategoryConfig | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<OntologyInstanceRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [levels, setLevels] = useState<OntologyLevelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 域 CRUD modal ──
  const [newDomainModalOpen, setNewDomainModalOpen] = useState(false);
  const [newDomainMode, setNewDomainMode] = useState<"directory" | "manual">("directory");
  const [newDomainDisplayName, setNewDomainDisplayName] = useState("");
  const [newDomainSlug, setNewDomainSlug] = useState("");
  const [newDomainDescription, setNewDomainDescription] = useState("");
  const [newDomainDirectoryPath, setNewDomainDirectoryPath] = useState("");
  const [creatingDomain, setCreatingDomain] = useState(false);
  const [seedingSample, setSeedingSample] = useState(false);

  // ── 实例与属性 ──
  const [instances, setInstances] = useState<OntologyInstanceRow[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [typeProperties, setTypeProperties] = useState<OntologyPropertiesResponse | null>(null);
  const [typePropertiesLoading, setTypePropertiesLoading] = useState(false);

  const companyId = company.id;

  const loadLevels = useCallback(async () => {
    setError(null);
    try {
      const res = await coolie.getOntologyLevels(companyId);
      setLevels(res);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadLevels();
  }, [loadLevels]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadLevels();
  }, [loadLevels]);

  // 加载选定类型的实例列表
  useEffect(() => {
    if (!selectedEntityType) {
      setInstances([]);
      return;
    }
    let cancelled = false;
    setInstancesLoading(true);
    void coolie
      .listOntologyInstances(companyId, {
        entityType: selectedEntityType.entityType,
        limit: 150,
      })
      .then((res) => {
        if (!cancelled) setInstances(res.instances);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(String(e.message ?? e));
      })
      .finally(() => {
        if (!cancelled) setInstancesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEntityType, companyId]);

  // 加载选中实例的属性
  useEffect(() => {
    if (!selectedInstance || !selectedEntityType) {
      setTypeProperties(null);
      return;
    }
    let cancelled = false;
    setTypePropertiesLoading(true);
    void coolie
      .getOntologyTypeProperties(companyId, selectedEntityType.entityType)
      .then((res) => {
        if (!cancelled) setTypeProperties(res);
      })
      .catch(() => {
        if (!cancelled) setTypeProperties(null);
      })
      .finally(() => {
        if (!cancelled) setTypePropertiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedInstance, selectedEntityType, companyId]);

  // 过滤后的实例列表
  const filteredInstances = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return instances;
    return instances.filter(
      (inst) =>
        inst.label.toLowerCase().includes(q) ||
        (inst.ownerLabel && inst.ownerLabel.toLowerCase().includes(q)),
    );
  }, [instances, searchQuery]);

  // 新建域
  const handlePickDirectoryFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: false,
      });
      if (res.canceled) return;
      const asset = res.assets[0];
      if (asset) {
        const path = asset.uri.replace(/^file:\/\//, "");
        const dir = path.substring(0, path.lastIndexOf("/")) || asset.name;
        setNewDomainDirectoryPath(dir);
        if (!newDomainDisplayName) {
          const namePart = asset.name.split(".")[0];
          setNewDomainDisplayName(namePart);
          setNewDomainSlug(namePart.toLowerCase().replace(/[^a-z0-9_-]/g, "_"));
        }
      }
    } catch (e) {
      Alert.alert("选择失败", String((e as Error)?.message ?? e));
    }
  }, [newDomainDisplayName]);

  const handleCreateDomain = useCallback(async () => {
    if (!newDomainDisplayName.trim() || !newDomainSlug.trim()) {
      Alert.alert("请填写完整", "本体域名称与标识为必填项");
      return;
    }
    setCreatingDomain(true);
    try {
      const created = await coolie.createOntologyDomain(companyId, {
        displayName: newDomainDisplayName.trim(),
        slug: newDomainSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
        description: newDomainDescription.trim() || undefined,
        category: newDomainDirectoryPath.trim() ? "legacy-system" : "custom",
      });
      setNewDomainModalOpen(false);
      setNewDomainDisplayName("");
      setNewDomainSlug("");
      setNewDomainDescription("");
      setNewDomainDirectoryPath("");
      await loadLevels();
      Alert.alert(
        "创建成功",
        `业务本体域「${created.display_name || created.displayName || created.slug}」已成功创建`,
      );
    } catch (e) {
      Alert.alert("创建失败", String((e as Error)?.message ?? e));
    } finally {
      setCreatingDomain(false);
    }
  }, [
    companyId,
    newDomainDisplayName,
    newDomainSlug,
    newDomainDescription,
    newDomainDirectoryPath,
    loadLevels,
  ]);

  const handleSeedSample = useCallback(async () => {
    setSeedingSample(true);
    try {
      const report = await coolie.seedSampleDomains(companyId);
      Alert.alert(
        "注入完成",
        `已创建 ${report.created} 个示例域 (跳过 ${report.skipped}, 失败 ${report.failed})`,
      );
      await loadLevels();
    } catch (e) {
      Alert.alert("注入失败", String((e as Error)?.message ?? e));
    } finally {
      setSeedingSample(false);
    }
  }, [companyId, loadLevels]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* 顶部标题与轻量控制行 */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>业务本体</Text>
            <Text style={styles.headerSub}>
              {levels
                ? `${levels.totalNodes} 个实体 · ${levels.totalEdges} 条关系`
                : "加载中…"}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {onOpenWebOntology ? (
              <Pressable
                onPress={onOpenWebOntology}
                hitSlop={8}
                style={styles.iconActionBtn}
                accessibilityLabel="打开 Web 端可视化图谱"
              >
                <Ionicons name="open-outline" size={16} color={C.accent} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={onRefresh}
              hitSlop={8}
              style={styles.iconActionBtn}
              accessibilityLabel="刷新业务本体"
            >
              <Ionicons name="refresh-outline" size={16} color={C.ink3} />
            </Pressable>
            <Pressable
              onPress={() => setNewDomainModalOpen(true)}
              hitSlop={8}
              style={styles.newDomainBtn}
              accessibilityLabel="新建本体域"
            >
              <Ionicons name="add" size={15} color={C.ink} />
              <Text style={styles.newDomainBtnText} numberOfLines={1}>
                新建
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 顶部直观双模式切换 */}
        <View style={styles.viewModeToggleRow}>
          <Pressable
            style={[styles.viewModeBtn, viewMode === "graph" && styles.viewModeBtnActive]}
            onPress={() => setViewMode("graph")}
            hitSlop={4}
          >
            <Ionicons
              name="git-network-outline"
              size={13}
              color={viewMode === "graph" ? C.accent : C.ink3}
            />
            <Text
              style={[
                styles.viewModeBtnText,
                viewMode === "graph" && styles.viewModeBtnTextActive,
              ]}
            >
              🕸️ 关系图谱
            </Text>
          </Pressable>
          <Pressable
            style={[styles.viewModeBtn, viewMode === "entities" && styles.viewModeBtnActive]}
            onPress={() => setViewMode("entities")}
            hitSlop={4}
          >
            <Ionicons
              name="list-outline"
              size={13}
              color={viewMode === "entities" ? C.accent : C.ink3}
            />
            <Text
              style={[
                styles.viewModeBtnText,
                viewMode === "entities" && styles.viewModeBtnTextActive,
              ]}
            >
              📑 业务实体
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 页面主内容区 */}
      {viewMode === "graph" ? (
        <View style={{ flex: 1 }}>
          <OntologyGraphWorkbenchScreen company={company} embedded={true} />
        </View>
      ) : loading ? (
        <LoadingState text="正在加载业务本体…" />
      ) : error ? (
        <ErrorRetry message={error} onRetry={loadLevels} />
      ) : selectedEntityType ? (
        /* 选中实体分类后的实例列表 */
        <View style={{ flex: 1 }}>
          <View style={styles.subListHeader}>
            <Pressable
              style={styles.backBtn}
              onPress={() => {
                setSelectedEntityType(null);
                setSearchQuery("");
              }}
              hitSlop={6}
            >
              <Ionicons name="chevron-back" size={18} color={C.accent} />
              <Text style={styles.backBtnText}>返回实体分类</Text>
            </Pressable>
            <Text style={styles.subListTitle}>
              {selectedEntityType.label} ({filteredInstances.length})
            </Text>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={14} color={C.ink4} />
            <TextInput
              style={styles.searchInput}
              placeholder={`搜索 ${selectedEntityType.label}…`}
              placeholderTextColor={C.ink4}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={6}>
                <Ionicons name="close-circle" size={14} color={C.ink4} />
              </Pressable>
            ) : null}
          </View>

          {instancesLoading ? (
            <LoadingState text={`正在加载 ${selectedEntityType.label} 列表…`} />
          ) : filteredInstances.length === 0 ? (
            <EmptyState
              icon={selectedEntityType.icon}
              title={`暂无 ${selectedEntityType.label}`}
              subtitle={searchQuery ? "未找到匹配的实例" : "当前分类暂无实例数据"}
            />
          ) : (
            <FlatList
              data={filteredInstances}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <AppCard
                  style={styles.instanceCard}
                  onPress={() => setSelectedInstance(item)}
                >
                  <View style={styles.instanceRow}>
                    <View
                      style={[
                        styles.instanceIconBox,
                        { backgroundColor: `${selectedEntityType.color}15`, borderColor: selectedEntityType.color },
                      ]}
                    >
                      <Ionicons
                        name={selectedEntityType.icon}
                        size={16}
                        color={selectedEntityType.color}
                      />
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.instanceLabel} numberOfLines={1}>
                        {item.label}
                      </Text>
                      <Text style={styles.instanceSub} numberOfLines={1}>
                        {item.ownerLabel ? `负责人: ${item.ownerLabel} · ` : ""}ID: {item.id.slice(0, 8)}…
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.ink4} />
                  </View>
                </AppCard>
              )}
            />
          )}
        </View>
      ) : (
        /* 实体分类总览大卡片 */
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
          }
        >
          <SectionHeader
            emphasis
            title="核心业务实体"
            hint="点击查看实体实例与属性字段"
          />

          {ENTITY_CATEGORIES.map((cat) => {
            const count =
              levels?.byEntityType.find((e) => e.entityType === cat.entityType)?.count ?? 0;
            return (
              <AppCard
                key={cat.entityType}
                style={styles.categoryCard}
                onPress={() => setSelectedEntityType(cat)}
              >
                <View style={styles.categoryRow}>
                  <View
                    style={[
                      styles.categoryIconWrap,
                      { backgroundColor: `${cat.color}15`, borderColor: `${cat.color}40` },
                    ]}
                  >
                    <Ionicons name={cat.icon} size={22} color={cat.color} />
                  </View>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <View style={styles.categoryTitleRow}>
                      <Text style={styles.categoryTitle}>{cat.label}</Text>
                      <Pill label={`${count} 实体`} size="sm" tone={count > 0 ? "accent" : "muted"} />
                    </View>
                    <Text style={styles.categoryDesc} numberOfLines={1}>
                      {cat.desc}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.ink4} />
                </View>
              </AppCard>
            );
          })}
        </ScrollView>
      )}

      {/* 实例属性详情抽屉/弹层 */}
      {selectedInstance ? (
        <Modal
          visible={true}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedInstance(null)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setSelectedInstance(null)}
          >
            <Pressable style={styles.detailDrawer} onPress={(e) => e.stopPropagation()}>
              <View style={styles.drawerHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.drawerTitle} numberOfLines={1}>
                    {selectedInstance.label}
                  </Text>
                  <Text style={styles.drawerSub}>
                    类型: {selectedEntityType?.label || selectedInstance.id}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setSelectedInstance(null)}
                  hitSlop={8}
                  style={styles.drawerCloseBtn}
                >
                  <Ionicons name="close" size={20} color={C.ink3} />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 420 }}>
                <View style={styles.metaRow}>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipLabel}>实例 ID</Text>
                    <Text style={styles.metaChipValue} numberOfLines={1}>
                      {selectedInstance.id}
                    </Text>
                  </View>
                  {selectedInstance.ownerLabel ? (
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipLabel}>责任人</Text>
                      <Text style={styles.metaChipValue}>
                        {selectedInstance.ownerLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* 字段属性 */}
                <Text style={styles.sectionTitle}>属性详情</Text>
                {selectedInstance.metadata &&
                Object.keys(selectedInstance.metadata).length > 0 ? (
                  <View style={styles.propsContainer}>
                    {Object.entries(selectedInstance.metadata).map(
                      ([key, val], idx, arr) => (
                        <View
                          key={key}
                          style={[
                            styles.propRow,
                            idx < arr.length - 1 ? styles.propRowBorder : null,
                          ]}
                        >
                          <Text style={styles.propKey}>{key}</Text>
                          <Text style={styles.propVal} numberOfLines={2}>
                            {typeof val === "object" ? JSON.stringify(val) : String(val)}
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                ) : (
                  <Text style={styles.emptyHint}>该实例暂无附加属性键值。</Text>
                )}

                {/* Schema 字段定义 */}
                {typeProperties && typeProperties.properties.length > 0 ? (
                  <>
                    <Text style={[styles.sectionTitle, { marginTop: 16 }]}>类型契约字段</Text>
                    <View style={styles.propsContainer}>
                      {typeProperties.properties.map((p, idx, arr) => (
                        <View
                          key={p.key}
                          style={[
                            styles.propRow,
                            idx < arr.length - 1 ? styles.propRowBorder : null,
                          ]}
                        >
                          <Text style={styles.propKey}>{p.key}</Text>
                          <Pill label={p.type} size="sm" tone="accent" />
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {/* 新建本体模态框 */}
      <NewDomainModal
        visible={newDomainModalOpen}
        onClose={() => setNewDomainModalOpen(false)}
        mode={newDomainMode}
        setMode={setNewDomainMode}
        displayName={newDomainDisplayName}
        setDisplayName={setNewDomainDisplayName}
        slug={newDomainSlug}
        setSlug={setNewDomainSlug}
        description={newDomainDescription}
        setDescription={setNewDomainDescription}
        directoryPath={newDomainDirectoryPath}
        onPickDirectory={handlePickDirectoryFile}
        onSubmit={handleCreateDomain}
        creating={creatingDomain}
      />
    </SafeAreaView>
  );
}

function NewDomainModal({
  visible,
  onClose,
  mode,
  setMode,
  displayName,
  setDisplayName,
  slug,
  setSlug,
  description,
  setDescription,
  directoryPath,
  onPickDirectory,
  onSubmit,
  creating,
}: {
  visible: boolean;
  onClose: () => void;
  mode: "directory" | "manual";
  setMode: (m: "directory" | "manual") => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  slug: string;
  setSlug: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  directoryPath: string;
  onPickDirectory: () => void;
  onSubmit: () => void;
  creating: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>新建业务本体</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={C.ink3} />
            </Pressable>
          </View>

          <View style={styles.modalTabRow}>
            <Pressable
              style={[styles.modalTabBtn, mode === "directory" && styles.modalTabBtnActive]}
              onPress={() => setMode("directory")}
            >
              <Text
                style={[
                  styles.modalTabBtnText,
                  mode === "directory" && styles.modalTabBtnTextActive,
                ]}
              >
                📁 文件夹目录接入
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modalTabBtn, mode === "manual" && styles.modalTabBtnActive]}
              onPress={() => setMode("manual")}
            >
              <Text
                style={[
                  styles.modalTabBtnText,
                  mode === "manual" && styles.modalTabBtnTextActive,
                ]}
              >
                ✏️ 空白手动定义
              </Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            {mode === "directory" ? (
              <View style={styles.dirSelectBox}>
                <Text style={styles.fieldLabel}>代码工程 / 文件夹目录</Text>
                <View style={styles.dirInputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="如 /workspace/orders 或选取工程文件"
                    placeholderTextColor={C.ink4}
                    value={directoryPath}
                    onChangeText={setDisplayName}
                  />
                  <Pressable style={styles.dirBrowseBtn} onPress={onPickDirectory}>
                    <Ionicons name="folder-open-outline" size={16} color={C.ink} />
                    <Text style={styles.dirBrowseText}>选择</Text>
                  </Pressable>
                </View>
                <Text style={styles.fieldTip}>
                  支持 Java/Spring Boot、.proto、SQL DDL、TS/JS 等工程目录。
                </Text>
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>显示名称 *</Text>
              <TextInput
                style={styles.input}
                placeholder="如：订单核心系统、电商交易域"
                placeholderTextColor={C.ink4}
                value={displayName}
                onChangeText={(val) => {
                  setDisplayName(val);
                  if (!slug) setSlug(val.toLowerCase().replace(/[^a-z0-9_-]/g, "_"));
                }}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>标识 (Slug) *</Text>
              <TextInput
                style={styles.input}
                placeholder="如 orders、trading_domain"
                placeholderTextColor={C.ink4}
                value={slug}
                onChangeText={setSlug}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>描述说明</Text>
              <TextInput
                style={[styles.input, { height: 60, textAlignVertical: "top" }]}
                placeholder="简述该本体域包含的核心概念与职责"
                placeholderTextColor={C.ink4}
                value={description}
                onChangeText={setDescription}
                multiline
              />
            </View>
          </ScrollView>

          <View style={styles.modalActions}>
            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={creating}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, creating && styles.submitBtnDisabled]}
              onPress={onSubmit}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>确认创建</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: "600", color: C.ink },
  headerSub: { fontSize: 12, color: C.ink3, marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  newDomainBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    backgroundColor: C.accent,
  },
  newDomainBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  viewModeToggleRow: {
    flexDirection: "row",
    backgroundColor: C.bg,
    borderRadius: RADIUS.pill,
    padding: 2,
    borderWidth: 1,
    borderColor: C.line,
  },
  viewModeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    gap: 4,
  },
  viewModeBtnActive: {
    backgroundColor: C.panel,
  },
  viewModeBtnText: { fontSize: 12, color: C.ink3, fontWeight: "500" },
  viewModeBtnTextActive: { color: C.ink, fontWeight: "600" },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 10,
  },
  categoryCard: {
    borderRadius: RADIUS.md,
    padding: 14,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  categoryIconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  categoryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: C.ink,
  },
  categoryDesc: {
    fontSize: 12,
    color: C.ink3,
  },
  subListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  backBtnText: {
    fontSize: 13,
    color: C.accent,
    fontWeight: "600",
  },
  subListTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: C.panel,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: C.ink,
    padding: 0,
  },
  instanceCard: {
    padding: 12,
    borderRadius: RADIUS.md,
  },
  instanceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  instanceIconBox: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  instanceLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: C.ink,
  },
  instanceSub: {
    fontSize: 11,
    color: C.ink4,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  detailDrawer: {
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  drawerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: C.ink,
  },
  drawerSub: {
    fontSize: 12,
    color: C.ink3,
    marginTop: 2,
  },
  drawerCloseBtn: {
    padding: 4,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  metaChip: {
    flex: 1,
    padding: 8,
    backgroundColor: C.bg,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.line,
  },
  metaChipLabel: {
    fontSize: 10,
    color: C.ink4,
    marginBottom: 2,
  },
  metaChipValue: {
    fontSize: 12,
    color: C.ink2,
    fontWeight: "500",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink2,
    marginBottom: 8,
  },
  propsContainer: {
    backgroundColor: C.bg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 12,
  },
  propRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  propRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  propKey: {
    fontSize: 12,
    color: C.ink3,
    fontFamily: "monospace",
  },
  propVal: {
    fontSize: 12,
    color: C.ink,
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
  emptyHint: {
    fontSize: 12,
    color: C.ink4,
    fontStyle: "italic",
    paddingVertical: 8,
  },
  modalCard: {
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: 16,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: "600", color: C.ink },
  modalTabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  modalTabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.bg,
  },
  modalTabBtnActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
  },
  modalTabBtnText: {
    fontSize: 12,
    color: C.ink3,
  },
  modalTabBtnTextActive: {
    color: C.accent,
    fontWeight: "600",
  },
  dirSelectBox: {
    marginBottom: 12,
  },
  dirInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  dirBrowseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    backgroundColor: C.lineSubtle,
  },
  dirBrowseText: {
    fontSize: 12,
    color: C.ink,
  },
  fieldTip: {
    fontSize: 11,
    color: C.ink4,
    marginTop: 4,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    color: C.ink3,
    marginBottom: 4,
  },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: C.ink,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    alignItems: "center",
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  cancelBtnText: {
    fontSize: 13,
    color: C.ink2,
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    alignItems: "center",
    backgroundColor: C.accent,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 13,
    color: "#FFFFFF",
    fontWeight: "600",
  },
});