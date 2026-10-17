import { z } from "zod";

// ==========================================
// 1. 自动化测试页面级与质量打假 Schema
// ==========================================

export const pageListRoutesSchema = z.object({
  platform: z.enum(["web", "mobile"]).optional().default("web"),
  includeHidden: z.boolean().optional().default(false),
});
export type PageListRoutesInput = z.infer<typeof pageListRoutesSchema>;

export const pageGetActiveStateSchema = z.object({
  sessionId: z.string().optional(),
});
export type PageGetActiveStateInput = z.infer<typeof pageGetActiveStateSchema>;

export const pageInspectElementsSchema = z.object({
  selector: z.string().optional(),
  role: z.string().optional(),
  visibleOnly: z.boolean().optional().default(true),
});
export type PageInspectElementsInput = z.infer<typeof pageInspectElementsSchema>;

export const pageTapSchema = z.object({
  target: z.object({
    text: z.string().optional(),
    testId: z.string().optional(),
    coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
  }),
  expectNavigated: z.boolean().optional().default(false),
  timeoutMs: z.number().optional().default(5000),
});
export type PageTapInput = z.infer<typeof pageTapSchema>;

export const pageTypeSchema = z.object({
  target: z.object({
    testId: z.string().optional(),
    placeholder: z.string().optional(),
    selector: z.string().optional(),
  }),
  text: z.string(),
  clearFirst: z.boolean().optional().default(true),
  delayMs: z.number().optional().default(50),
});
export type PageTypeInput = z.infer<typeof pageTypeSchema>;

export const pageScrollSchema = z.object({
  direction: z.enum(["up", "down", "left", "right"]),
  distancePx: z.number().optional().default(300),
  containerId: z.string().optional(),
});
export type PageScrollInput = z.infer<typeof pageScrollSchema>;

export const qaQuadSnapshotSchema = z.object({
  routeName: z.string(),
  captureDir: z.string().optional().default("evidence/snapshots"),
  annotateState: z.boolean().optional().default(true),
});
export type QaQuadSnapshotInput = z.infer<typeof qaQuadSnapshotSchema>;

export const qaOcclusionAssertSchema = z.object({
  targetId: z.string(),
  safeZones: z.array(z.string()).optional().default(["bottom-navigation-bar", "system-gesture-inset"]),
  viewportWidthDp: z.number().optional().default(320),
});
export type QaOcclusionAssertInput = z.infer<typeof qaOcclusionAssertSchema>;

export const qaTwoLetterAuditSchema = z.object({
  containerSelector: z.string().optional(),
  allowIcons: z.boolean().optional().default(true),
});
export type QaTwoLetterAuditInput = z.infer<typeof qaTwoLetterAuditSchema>;

export const qaDetectBlankScreenSchema = z.object({
  thresholdMs: z.number().optional().default(3000),
  checkMemory: z.boolean().optional().default(true),
});
export type QaDetectBlankScreenInput = z.infer<typeof qaDetectBlankScreenSchema>;


// ==========================================
// 2. 运营驾驶舱与掌上操控 Schema
// ==========================================

export const opsVoiceToProposalSchema = z.object({
  utterance: z.string().min(1),
  channel: z.enum(["mobile", "web", "wechat"]).optional().default("mobile"),
  projectId: z.string().optional(),
});
export type OpsVoiceToProposalInput = z.infer<typeof opsVoiceToProposalSchema>;

export const opsHighlightElementSchema = z.object({
  componentId: z.string(),
  durationMs: z.number().optional().default(3000),
  tooltip: z.string().optional(),
});
export type OpsHighlightElementInput = z.infer<typeof opsHighlightElementSchema>;

export const opsCaptureChartSchema = z.object({
  chartSelector: z.string(),
  title: z.string(),
  outputFormat: z.enum(["png", "webp"]).optional().default("webp"),
});
export type OpsCaptureChartInput = z.infer<typeof opsCaptureChartSchema>;

export const opsModalConfirmSchema = z.object({
  approvalId: z.string(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().optional(),
});
export type OpsModalConfirmInput = z.infer<typeof opsModalConfirmSchema>;

export const opsMetricsTelemetrySchema = z.object({
  companyId: z.string(),
  timeRange: z.enum(["today", "week", "sprint"]).optional().default("today"),
});
export type OpsMetricsTelemetryInput = z.infer<typeof opsMetricsTelemetrySchema>;

export const opsTriggerReconciliationSchema = z.object({
  companyId: z.string(),
  date: z.string(),
  tolerance: z.number().optional().default(0.01),
});
export type OpsTriggerReconciliationInput = z.infer<typeof opsTriggerReconciliationSchema>;

export const opsEmergencyKillswitchSchema = z.object({
  companyId: z.string(),
  action: z.enum(["trigger", "lift"]),
  reason: z.string().min(3),
});
export type OpsEmergencyKillswitchInput = z.infer<typeof opsEmergencyKillswitchSchema>;

export const opsRoutineDispatchSchema = z.object({
  projectId: z.string(),
  routineType: z.string(),
  cronExpr: z.string().optional(),
});
export type OpsRoutineDispatchInput = z.infer<typeof opsRoutineDispatchSchema>;
