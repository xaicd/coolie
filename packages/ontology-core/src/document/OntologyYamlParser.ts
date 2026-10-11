/**
 * ============================================================================
 * Coolie 声明式活体本体 YAML 解析器与多格式转换器 (Ontology YAML Parser & Transpiler)
 * ============================================================================
 */

import yaml from "js-yaml";


import type {
  OntologyYamlBundle,
  OntologyManifestYaml,
  M1ObjectModelYaml,
  M2BehaviorModelYaml,
  M3RuleModelYaml,
  M5ActorModelYaml,
  M6FlowModelYaml,
  M7ReportModelYaml,
  MuUiModelYaml,
  ModelAggregate,
  ModelAttribute,
} from "./OntologyYamlTypes.js";
import {
  DOCUMENT_FORMAT,
  type OntologyDocument,
  type DocumentObjectType,
  type DocumentProperty,
  type DocumentRelationType,
  type DocumentPropertyType,
} from "./OntologyDocument.js";

export function parseYamlText<T = unknown>(yamlStr: string): T {
  return yaml.load(yamlStr) as T;
}

export function dumpYamlText(data: unknown): string {
  return yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });
}

/**
 * 将多份 YAML 文件对象装配成单一内聚的 OntologyYamlBundle
 */
export function parseOntologyYamlBundle(files: Record<string, string>): OntologyYamlBundle {
  const bundle: OntologyYamlBundle = {};

  for (const [filename, content] of Object.entries(files)) {
    if (!content || !content.trim()) continue;

    let parsed: any;
    try {
      parsed = yaml.load(content);
    } catch (err: any) {
      throw new Error(`YAML 解析语法错误 [${filename}]: ${err.message}`);
    }

    if (!parsed || typeof parsed !== "object") continue;

    const modelType = parsed.model_type || detectModelTypeFromFilename(filename);

    switch (modelType) {
      case "MANIFEST":
        bundle.manifest = parsed as OntologyManifestYaml;
        break;
      case "OBJECT":
        bundle.objects = parsed as M1ObjectModelYaml;
        break;
      case "BEHAVIOR":
        bundle.behaviors = parsed as M2BehaviorModelYaml;
        break;
      case "RULE":
        bundle.rules = parsed as M3RuleModelYaml;
        break;
      case "ACTOR":
        bundle.actors = parsed as M5ActorModelYaml;
        break;
      case "FLOW":
        bundle.flows = parsed as M6FlowModelYaml;
        break;
      case "REPORT":
        bundle.reports = parsed as M7ReportModelYaml;
        break;
      case "UI":
        bundle.ui = parsed as MuUiModelYaml;
        break;
      default:
        // 允许额外未识别模型暂存
        break;
    }
  }

  return bundle;
}

function detectModelTypeFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.includes("manifest")) return "MANIFEST";
  if (lower.includes("m1") || lower.includes("object")) return "OBJECT";
  if (lower.includes("m2") || lower.includes("behavior")) return "BEHAVIOR";
  if (lower.includes("m3") || lower.includes("rule")) return "RULE";
  if (lower.includes("m5") || lower.includes("actor") || lower.includes("role")) return "ACTOR";
  if (lower.includes("m6") || lower.includes("flow")) return "FLOW";
  if (lower.includes("m7") || lower.includes("report")) return "REPORT";
  if (lower.includes("mu") || lower.includes("ui")) return "UI";
  return null;
}

function mapAttributeTypeToDocType(type: string): DocumentPropertyType {
  switch (type) {
    case "Integer":
    case "Decimal":
      return "number";
    case "Boolean":
      return "boolean";
    case "String":
    case "Date":
    case "DateTime":
    case "DictionaryRef":
    case "AggregateRootRef":
    case "Json":
    case "Text":
    default:
      return "string";
  }
}

/**
 * 将声明式 YAML Bundle 编译为 Paperclip 控制面标准 OntologyDocument
 */
export function yamlBundleToOntologyDocument(bundle: OntologyYamlBundle): OntologyDocument {
  const objectTypes: DocumentObjectType[] = [];
  const relationTypes: DocumentRelationType[] = [];

  const domain = bundle.manifest?.domain || bundle.objects?.domain || "default-domain";

  for (const agg of bundle.objects?.aggregates ?? []) {
    const properties: DocumentProperty[] = agg.attributes.map((attr) => ({
      name: attr.name,
      type: mapAttributeTypeToDocType(attr.type),
      description: attr.label ? `${attr.label}${attr.description ? ` - ${attr.description}` : ""}` : attr.description,
      isIdentifier: attr.name === "id" || attr.unique === true,
      format: attr.type === "Date" ? "date" : attr.type === "DateTime" ? "date-time" : undefined,
    }));

    // 若声明了生命周期，注入内置 status 属性与枚举
    if (agg.lifecycle && agg.lifecycle.length > 0) {
      const existingStatus = properties.find((p) => p.name === "status");
      if (existingStatus) {
        existingStatus.enum = agg.lifecycle;
      } else {
        properties.push({
          name: "status",
          type: "string",
          description: "业务生命周期状态",
          enum: agg.lifecycle,
        });
      }
    }

    objectTypes.push({
      key: agg.alias || agg.id,
      displayName: agg.name,
      description: agg.description,
      properties,
      orderSource: "declared",
    });

    // 转换关系
    for (const rel of agg.relations ?? []) {
      relationTypes.push({
        key: `${agg.alias || agg.id}_${rel.name}`,
        displayName: rel.label || rel.name,
        description: rel.description,
        cardinality: rel.cardinality,
        sourceNodeTypeKey: agg.alias || agg.id,
        targetNodeTypeKey: rel.targetEntity,
      });
    }
  }

  return {
    format: DOCUMENT_FORMAT,
    name: domain,
    description: bundle.manifest?.description || `${domain} 活体本体模型`,
    exportedAt: new Date().toISOString(),
    source: {
      domainSlug: bundle.manifest?.domain,
      origin: "yaml-suite",
    },
    objectTypes,
    relationTypes,
  };

}

/**
 * 根据 YAML 模型自动编译生成高质量 Mermaid 拓扑图 (ER 图与状态机图)
 */
export function yamlBundleToMermaid(bundle: OntologyYamlBundle): {
  erDiagram: string;
  stateDiagrams: Record<string, string>;
} {
  const erLines: string[] = ["erDiagram"];

  for (const agg of bundle.objects?.aggregates ?? []) {
    const entityKey = (agg.alias || agg.id).replace(/-/g, "_");
    erLines.push(`    ${entityKey} {`);
    for (const attr of agg.attributes) {
      const attrType = mapAttributeTypeToDocType(attr.type);
      erLines.push(`        ${attrType} ${attr.name} "${attr.label || attr.name}"`);
    }
    erLines.push(`    }`);

    for (const rel of agg.relations ?? []) {
      const targetKey = rel.targetEntity.replace(/-/g, "_");
      let relOp = "||--o{";
      if (rel.cardinality === "one_to_one") relOp = "||--||";
      if (rel.cardinality === "many_to_many") relOp = "}o--o{";
      erLines.push(`    ${entityKey} ${relOp} ${targetKey} : "${rel.label || rel.name}"`);
    }
  }

  // 状态机图生成
  const stateDiagrams: Record<string, string> = {};
  const behaviors = bundle.behaviors?.behaviors ?? [];

  for (const agg of bundle.objects?.aggregates ?? []) {
    if (!agg.lifecycle || agg.lifecycle.length === 0) continue;
    const aggKey = agg.alias || agg.id;
    const lines: string[] = ["stateDiagram-v2", "    [*] --> " + agg.lifecycle[0]];

    // 搜索针对该实体的所有状态变更行为
    for (const b of behaviors) {
      if (b.ownerEntity === agg.id || b.ownerEntity === agg.alias) {
        for (const post of b.postconditions ?? []) {
          if (post.field.toLowerCase().includes("status")) {
            lines.push(`    note right of ${post.setValue}: 触发动词: ${b.name}`);
          }
        }
      }
    }

    stateDiagrams[aggKey] = lines.join("\n");
  }

  return {
    erDiagram: erLines.join("\n"),
    stateDiagrams,
  };
}
