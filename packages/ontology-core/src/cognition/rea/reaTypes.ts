/**
 * REA (Reverse Engineering Automation) Contract & Evidence Types
 *
 * Ground truth data shapes produced by reverse-engineering legacy binaries,
 * mobile APKs/DEX, electron ASAR bundles, minified web dists, SQLite databases,
 * and network capture traffic.
 *
 * Integrated into Coolie Platform Living Ontology as part of the
 * Brownfield Systems Onboarding & Reconstruction pipeline.
 */

export type ReaAssetKind =
  | "apk"
  | "dex"
  | "jar"
  | "war"
  | "electron_asar"
  | "sqlite_db"
  | "minified_bundle"
  | "har_traffic";

export type ReaStereotype =
  | "entity"
  | "dto"
  | "controller"
  | "service"
  | "repository"
  | "enum"
  | "table"
  | "store";

export interface ReaFieldEvidence {
  name: string;
  type: string;
  rawType?: string;
  annotations?: string[];
  comment?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  referencedTable?: string;
  referencedColumn?: string;
}

export interface ReaMethodEvidence {
  name: string;
  returnType: string;
  parameters?: Array<{ name: string; type: string }>;
  annotations?: string[];
  callees?: string[];
}

export interface ReaClassEvidence {
  name: string;
  qualifiedName: string;
  package?: string;
  module?: string;
  sourceFile: string;
  stereotype: ReaStereotype;
  annotations?: string[];
  superClass?: string;
  interfaces?: string[];
  fields?: ReaFieldEvidence[];
  methods?: ReaMethodEvidence[];
  comment?: string;
  isObfuscated?: boolean;
  confidence?: number;
}

export interface ReaColumnEvidence {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
  defaultValue?: string;
  comment?: string;
}

export interface ReaForeignKeyEvidence {
  column: string;
  targetTable: string;
  targetColumn: string;
}

export interface ReaTableEvidence {
  tableName: string;
  sourceFile?: string;
  columns: ReaColumnEvidence[];
  foreignKeys?: ReaForeignKeyEvidence[];
  comment?: string;
  rowCountEstimate?: number;
}

export interface ReaActionEvidence {
  name: string;
  httpMethod: string;
  routePath: string;
  targetEntity?: string;
  controllerClass?: string;
  handlerMethod?: string;
  requestType?: string;
  responseType?: string;
  sourceFile?: string;
  comment?: string;
  confidence?: number;
}

export interface ReaCallEdge {
  caller: string;
  callee: string;
  callType: "method_call" | "http_request" | "db_query" | "event_emit" | "ipc_invoke";
  sourceFile?: string;
}

export interface ReaRiskItem {
  level: "low" | "medium" | "high" | "critical";
  category: "obfuscation" | "missing_dependency" | "crypto_hardcode" | "native_binding" | "architectural_erosion";
  description: string;
  affectedSymbols?: string[];
}

export interface ReconstructionReadinessReport {
  overallScore: number; // 0 - 100
  decompilationIntegrity: number; // 0.0 - 1.0
  sourceFileReconstructedRatio: number; // 0.0 - 1.0
  identifiedEntitiesCount: number;
  identifiedActionsCount: number;
  identifiedTablesCount: number;
  callGraphDensity: number;
  risks: ReaRiskItem[];
  recommendedBlueprint: string; // e.g., "ruoyi-all-next", "yudao-quad-terminal", "nextjs-fullstack"
  summary: string;
}

export interface ReaAnalysisBundle {
  bundleId: string;
  targetSystemName: string;
  assetKind: ReaAssetKind;
  sourceDigest: string; // SHA-256 of analyzed asset
  engineVersion: string; // e.g. "rea-v6.4.0"
  analyzedAt: string; // ISO 8601
  classes: ReaClassEvidence[];
  tables: ReaTableEvidence[];
  actions: ReaActionEvidence[];
  callEdges: ReaCallEdge[];
  readiness?: ReconstructionReadinessReport;
}
