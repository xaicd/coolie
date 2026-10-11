/**
 * ============================================================================
 * Coolie 声明式活体本体 YAML 规范体系 (Ontology-Driven Development Schema)
 * 融合 GitHub ODD 七模型标准 (M1~M7/MU) 与 Palantir Foundry 核心原语 (Object/Link/Action/Function/Interface)
 * ============================================================================
 */

export interface OntologyManifestYaml {
  model_type: "MANIFEST";
  version: string;
  domain: string;
  project?: string;
  description?: string;
  source_requirements?: string;
  framework?: string;
  model_files: string[];
}

export type AttributeDataType =
  | "String"
  | "Integer"
  | "Decimal"
  | "Boolean"
  | "Date"
  | "DateTime"
  | "DictionaryRef"
  | "AggregateRootRef"
  | "Json"
  | "Text";

export interface AttributeDictionaryRef {
  dictionaryId: string;
  typeCode: string;
}

export interface AttributeAggregateRef {
  targetAggregateId: string;
  targetField?: string;
}

export interface ModelAttribute {
  name: string;
  label: string;
  type: AttributeDataType;
  required?: boolean;
  unique?: boolean;
  description?: string;
  dictionaryRef?: AttributeDictionaryRef;
  aggregateRootRef?: AttributeAggregateRef;
  defaultValue?: string | number | boolean;
}

export interface ModelRelation {
  name: string;
  label?: string;
  targetEntity: string;
  cardinality: "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";
  role?: string;
  description?: string;
}

export interface ModelAggregate {
  id: string;
  name: string;
  alias?: string;
  aggregateType: "AGGREGATE_ROOT" | "CHILD_ENTITY" | "VALUE_OBJECT";
  description?: string;
  lifecycle?: string[];
  tags?: string[];
  attributes: ModelAttribute[];
  relations?: ModelRelation[];
}

export interface M1ObjectModelYaml {
  model_type: "OBJECT";
  version: string;
  domain: string;
  aggregates: ModelAggregate[];
}

export interface ApiContractDef {
  httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  routePath: string;
  summary?: string;
  inputDto?: string;
  outputDto?: string;
}

export interface StatePostCondition {
  field: string;
  setValue: string;
  emitEvent?: string;
}

export interface SyncTriggerDef {
  whenRule?: string;
  invokeBehavior: string;
  targetEntity?: string;
  description?: string;
}

export interface ModelBehavior {
  id: string;
  name: string;
  ownerEntity: string;
  behaviorType: "COMMAND" | "QUERY";
  triggerType: "USER_ACTION" | "SYSTEM_EVENT" | "BATCH_JOB";
  summary?: string;
  apiContract?: ApiContractDef;
  preconditions?: string[];
  postconditions?: StatePostCondition[];
  appliedRules?: string[];
  requiredPermissions?: string[];
  syncTriggers?: SyncTriggerDef[];
  queryReportRef?: string;
}

export interface M2BehaviorModelYaml {
  model_type: "BEHAVIOR";
  version: string;
  domain: string;
  behaviors: ModelBehavior[];
}

export interface ModelRule {
  id: string;
  name: string;
  ruleType: "VALIDATION" | "CALCULATION" | "GATE" | "CROSS_AGGREGATE";
  ownerEntity?: string;
  conditionExpression: string;
  errorMessage?: string;
  description?: string;
  parameters?: Array<{ name: string; type: string; description?: string }>;
}

export interface M3RuleModelYaml {
  model_type: "RULE";
  version: string;
  domain: string;
  rules: ModelRule[];
}

export interface ModelRole {
  id: string;
  name: string;
  code: string;
  roleType?: "INTERNAL" | "EXTERNAL" | "SYSTEM";
  description?: string;
  permissions?: string[];
  dataScope?: "ALL" | "DEPT" | "SELF" | "CUSTOM";
}

export interface ModelPermission {
  id: string;
  name: string;
  code: string;
  resource: string;
  action: string;
  description?: string;
}

export interface M5ActorModelYaml {
  model_type: "ACTOR";
  version: string;
  domain: string;
  roles: ModelRole[];
  permissions?: ModelPermission[];
}

export interface FlowActivity {
  id: string;
  name: string;
  activityType: "USER_TASK" | "SYSTEM_TASK" | "GATEWAY" | "SUB_FLOW_CALL" | "END";
  roleRef?: string;
  behaviorRef?: string;
  ruleRef?: string;
  subFlowRef?: string;
  next?: string[];
}

export interface ModelFlow {
  id: string;
  name: string;
  flowType: "APPROVAL" | "ORCHESTRATION";
  ownerEntity: string;
  startState?: string;
  endStates?: string[];
  activities: FlowActivity[];
}

export interface M6FlowModelYaml {
  model_type: "FLOW";
  version: string;
  domain: string;
  flows: ModelFlow[];
}

export interface ReportDimension {
  field: string;
  label: string;
  sourceEntity: string;
}

export interface ReportMetric {
  field: string;
  label: string;
  aggregation: "SUM" | "COUNT" | "AVG" | "MAX" | "MIN";
  sourceEntity: string;
}

export interface ModelReport {
  id: string;
  name: string;
  behaviorRef: string;
  sourceEntities: string[];
  dimensions?: ReportDimension[];
  metrics?: ReportMetric[];
  filters?: string[];
  defaultSort?: string;
}

export interface M7ReportModelYaml {
  model_type: "REPORT";
  version: string;
  domain: string;
  reports: ModelReport[];
}

export interface UiActionPoint {
  id: string;
  label: string;
  behaviorRef: string;
  style?: "PRIMARY" | "SECONDARY" | "DANGER" | "LINK";
  confirmPrompt?: string;
  isDraftOrSubmit?: boolean;
}

export interface UiViewScreen {
  id: string;
  name: string;
  routePath: string;
  targetEntity: string;
  screenType: "TABLE_LIST" | "FORM_EDIT" | "DETAIL_CARD" | "WORKFLOW_INBOX";
  asciiLayout?: string;
  actionPoints?: UiActionPoint[];
}

export interface MuUiModelYaml {
  model_type: "UI";
  version: string;
  domain: string;
  screens: UiViewScreen[];
}

export interface OntologyYamlBundle {
  manifest?: OntologyManifestYaml;
  objects?: M1ObjectModelYaml;
  behaviors?: M2BehaviorModelYaml;
  rules?: M3RuleModelYaml;
  actors?: M5ActorModelYaml;
  flows?: M6FlowModelYaml;
  reports?: M7ReportModelYaml;
  ui?: MuUiModelYaml;
}
