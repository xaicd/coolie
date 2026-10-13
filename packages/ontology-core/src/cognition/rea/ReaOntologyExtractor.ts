/**
 * ReaOntologyExtractor — Transpiles REA Reverse Engineering Bundles
 * into Coolie Platform Living Ontology Drafts (RepoDraft).
 *
 * Bridges legacy system decompilation, SQLite schemas, Wakaru JS unminification,
 * and HAR network traffic captures into living Object Types, Action Types,
 * and Link Relations.
 */

import type { RepoDraft, RepoDraftCoverage } from "../AstExtractor.js";
import type { ExtractionKind, SourceStereotype } from "../extractionTypes.js";
import type {
  ReaActionEvidence,
  ReaAnalysisBundle,
  ReaAssetKind,
  ReaClassEvidence,
  ReaRiskItem,
  ReaTableEvidence,
  ReconstructionReadinessReport,
} from "./reaTypes.js";

/** Map REA asset kind to Living Ontology ExtractionKind */
export function mapAssetKindToExtractionKind(kind: ReaAssetKind): ExtractionKind {
  switch (kind) {
    case "apk":
    case "dex":
      return "rea_apk";
    case "sqlite_db":
      return "rea_sqlite";
    case "har_traffic":
      return "rea_network";
    case "electron_asar":
    case "minified_bundle":
      return "rea_bundle";
    case "jar":
    case "war":
    default:
      return "rea_binary";
  }
}

/** Evaluates readiness and generates a reconstruction readiness report if missing */
export function evaluateReadiness(bundle: ReaAnalysisBundle): ReconstructionReadinessReport {
  if (bundle.readiness) {
    return bundle.readiness;
  }

  const risks: ReaRiskItem[] = [];
  const totalClasses = bundle.classes.length;
  const obfuscatedClasses = bundle.classes.filter((c) => c.isObfuscated).length;
  const entities = bundle.classes.filter((c) => c.stereotype === "entity" || c.stereotype === "table");
  const tablesCount = bundle.tables.length;
  const actionsCount = bundle.actions.length;

  let decompilationIntegrity = 1.0;
  if (totalClasses > 0) {
    decompilationIntegrity = Number(((totalClasses - obfuscatedClasses) / totalClasses).toFixed(2));
  }

  if (obfuscatedClasses > 0) {
    const ratio = obfuscatedClasses / (totalClasses || 1);
    risks.push({
      level: ratio > 0.5 ? "high" : "medium",
      category: "obfuscation",
      description: `Detected ${obfuscatedClasses} obfuscated class symbols (${Math.round(ratio * 100)}% of total classes)`,
      affectedSymbols: bundle.classes.filter((c) => c.isObfuscated).map((c) => c.name).slice(0, 10),
    });
  }

  if (tablesCount === 0 && entities.length === 0) {
    risks.push({
      level: "high",
      category: "architectural_erosion",
      description: "No persistent data schemas or domain entities detected in binary/bundle",
    });
  }

  // Calculate overall readiness score (0-100)
  let score = 50; // base
  score += Math.min(25, (entities.length + tablesCount) * 2);
  score += Math.min(15, actionsCount * 1.5);
  score += Math.round(decompilationIntegrity * 10);
  if (obfuscatedClasses > 0) {
    score -= Math.min(20, Math.round((obfuscatedClasses / (totalClasses || 1)) * 30));
  }
  score = Math.max(10, Math.min(100, Math.round(score)));

  // Blueprint recommendation heuristics
  let recommendedBlueprint = "nextjs-fullstack";
  const hasJavaAnnotations = bundle.classes.some((c) =>
    (c.annotations ?? []).some((a) => a.includes("Table") || a.includes("Controller") || a.includes("Service")),
  );
  if (hasJavaAnnotations || bundle.assetKind === "apk" || bundle.assetKind === "jar" || bundle.assetKind === "war") {
    recommendedBlueprint = entities.length > 15 ? "ruoyi-all-next" : "yudao-quad-terminal";
  } else if (bundle.assetKind === "electron_asar") {
    recommendedBlueprint = "yudao-quad-terminal";
  }

  return {
    overallScore: score,
    decompilationIntegrity,
    sourceFileReconstructedRatio: Number((1.0 - (obfuscatedClasses * 0.5) / (totalClasses || 1)).toFixed(2)),
    identifiedEntitiesCount: entities.length,
    identifiedActionsCount: actionsCount,
    identifiedTablesCount: tablesCount,
    callGraphDensity: bundle.callEdges.length,
    risks,
    recommendedBlueprint,
    summary: `Identified ${entities.length + tablesCount} persistent models and ${actionsCount} API/IPC entry points with ${decompilationIntegrity * 100}% deobfuscation clarity.`,
  };
}

export interface ReaExtractionResult {
  draft: RepoDraft;
  readiness: ReconstructionReadinessReport;
  bundleMetadata: {
    bundleId: string;
    targetSystemName: string;
    assetKind: ReaAssetKind;
    sourceDigest: string;
    engineVersion: string;
    analyzedAt: string;
  };
}

/**
 * Main extractor: folds a ReaAnalysisBundle into a living ontology RepoDraft.
 */
export function extractReaBundle(bundle: ReaAnalysisBundle): ReaExtractionResult {
  const extractionKind = mapAssetKindToExtractionKind(bundle.assetKind);
  const readiness = evaluateReadiness(bundle);

  type SeedNode = RepoDraft["seedNodeTypes"][number];
  type SeedRelation = RepoDraft["seedRelationTypes"][number];
  type SeedAction = RepoDraft["seedActions"][number];

  const nodeMap = new Map<string, SeedNode>();
  const relationMap = new Map<string, SeedRelation>();
  const actionMap = new Map<string, SeedAction>();

  const allSourceFiles = new Set<string>();

  // 1. Process Database Tables (SQLite / DDL inspection)
  for (const table of bundle.tables) {
    const typeName = table.tableName;
    const sourceFile = table.sourceFile || `db/${bundle.targetSystemName}.sqlite`;
    allSourceFiles.add(sourceFile);

    const properties: Record<string, { type: string; description?: string; isPrimaryKey?: boolean; isForeignKey?: boolean }> = {};
    const propertyOrder: string[] = [];

    for (const col of table.columns) {
      properties[col.name] = {
        type: col.type.toLowerCase(),
        ...(col.comment ? { description: col.comment } : {}),
        ...(col.isPrimaryKey ? { isPrimaryKey: true } : {}),
      };
      propertyOrder.push(col.name);
    }

    // Mark foreign keys in properties and extract relation edges
    if (table.foreignKeys) {
      for (const fk of table.foreignKeys) {
        if (properties[fk.column]) {
          properties[fk.column].isForeignKey = true;
        }
        const relKey = `${typeName}::references::${fk.targetTable}`;
        relationMap.set(relKey, {
          relationType: "references",
          displayName: `${typeName}.${fk.column} -> ${fk.targetTable}.${fk.targetColumn}`,
          sourceType: typeName,
          targetType: fk.targetTable,
          sourceFiles: [sourceFile],
        });
      }
    }

    nodeMap.set(typeName, {
      typeName,
      displayName: table.comment ? `${typeName} (${table.comment})` : typeName,
      layer: "table",
      sourceFiles: [sourceFile],
      ...(table.comment ? { description: table.comment } : {}),
      properties,
      propertyOrder,
      origin: {
        kind: "rea_sqlite",
        table: typeName,
        stereotype: "table",
        evidenceId: bundle.bundleId,
        sourceDigest: bundle.sourceDigest,
        confidence: 1.0,
      },
    });
  }

  // 2. Process Decompiled / Unbundled Classes & Stores
  for (const cls of bundle.classes) {
    const typeName = cls.name;
    const sourceFile = cls.sourceFile;
    allSourceFiles.add(sourceFile);

    const properties: Record<string, { type: string; description?: string; column?: string }> = {};
    const propertyOrder: string[] = [];

    if (cls.fields) {
      for (const field of cls.fields) {
        properties[field.name] = {
          type: field.type,
          ...(field.comment ? { description: field.comment } : {}),
          ...(field.referencedColumn ? { column: field.referencedColumn } : {}),
        };
        propertyOrder.push(field.name);

        // If field references another class, record relation candidate
        if (field.referencedTable) {
          const relKey = `${typeName}::references::${field.referencedTable}`;
          if (!relationMap.has(relKey)) {
            relationMap.set(relKey, {
              relationType: "references",
              displayName: `${typeName}.${field.name} -> ${field.referencedTable}`,
              sourceType: typeName,
              targetType: field.referencedTable,
              sourceFiles: [sourceFile],
            });
          }
        }
      }
    }

    // Extract Superclass / Interface Inheritance relations
    if (cls.superClass && cls.superClass !== "Object" && cls.superClass !== "Record") {
      const relKey = `${typeName}::extends::${cls.superClass}`;
      relationMap.set(relKey, {
        relationType: "extends",
        displayName: `${typeName} extends ${cls.superClass}`,
        sourceType: typeName,
        targetType: cls.superClass,
        sourceFiles: [sourceFile],
      });
    }

    if (cls.interfaces) {
      for (const itf of cls.interfaces) {
        const relKey = `${typeName}::implements::${itf}`;
        relationMap.set(relKey, {
          relationType: "implements",
          displayName: `${typeName} implements ${itf}`,
          sourceType: typeName,
          targetType: itf,
          sourceFiles: [sourceFile],
        });
      }
    }

    // If node is already registered by a table with same name, merge source file & annotations
    const existing = nodeMap.get(typeName);
    if (existing) {
      existing.sourceFiles = [...new Set([...existing.sourceFiles, sourceFile])];
      if (cls.comment && !existing.description) {
        existing.description = cls.comment;
      }
      if (existing.origin) {
        existing.origin.namespace = cls.package;
        existing.origin.module = cls.module;
      }
    } else {
      const stereotype = (cls.stereotype as SourceStereotype) || "entity";
      nodeMap.set(typeName, {
        typeName,
        displayName: cls.comment ? `${typeName} (${cls.comment})` : typeName,
        layer: stereotype === "controller" ? "controller" : stereotype === "service" ? "service" : "aggregate_root",
        sourceFiles: [sourceFile],
        ...(cls.comment ? { description: cls.comment } : {}),
        ...(propertyOrder.length > 0 ? { properties, propertyOrder } : {}),
        origin: {
          kind: extractionKind,
          namespace: cls.package,
          module: cls.module,
          stereotype,
          evidenceId: bundle.bundleId,
          sourceDigest: bundle.sourceDigest,
          confidence: cls.confidence ?? (cls.isObfuscated ? 0.6 : 0.95),
        },
      });
    }
  }

  // 3. Process Call Edges (Call Graph topological dependencies)
  for (const edge of bundle.callEdges) {
    const relKey = `${edge.caller}::calls::${edge.callee}`;
    if (!relationMap.has(relKey)) {
      relationMap.set(relKey, {
        relationType: "calls",
        displayName: `${edge.caller} calls ${edge.callee} [${edge.callType}]`,
        sourceType: edge.caller,
        targetType: edge.callee,
        sourceFiles: edge.sourceFile ? [edge.sourceFile] : [],
      });
    }
  }

  // 4. Process Actions & Routes (REST API / RPC / IPC / Controllers)
  for (const act of bundle.actions) {
    const key = `${act.httpMethod.toUpperCase()} ${act.routePath || act.name}`;
    const sourceFile = act.sourceFile || "rea-api";
    allSourceFiles.add(sourceFile);

    const cur = actionMap.get(key) ?? {
      name: act.name || key,
      method: act.httpMethod.toUpperCase(),
      path: act.routePath || "",
      sourceFiles: [],
    };
    if (sourceFile && !cur.sourceFiles.includes(sourceFile)) {
      cur.sourceFiles.push(sourceFile);
    }
    actionMap.set(key, cur);

    // If action points to a target entity, establish action -> entity link
    if (act.targetEntity && nodeMap.has(act.targetEntity)) {
      const relKey = `${act.name}::targets::${act.targetEntity}`;
      if (!relationMap.has(relKey)) {
        relationMap.set(relKey, {
          relationType: "targets",
          displayName: `${act.name} operates on ${act.targetEntity}`,
          sourceType: act.name,
          targetType: act.targetEntity,
          sourceFiles: [sourceFile],
        });
      }
    }
  }

  const seedNodeTypes = Array.from(nodeMap.values());
  const seedRelationTypes = Array.from(relationMap.values());
  const seedActions = Array.from(actionMap.values());

  const coverage: RepoDraftCoverage = {
    entityCount: seedNodeTypes.length,
    relationCount: seedRelationTypes.length,
    actionCount: seedActions.length,
    sqlFiles: bundle.tables.length > 0 ? 1 : 0,
    apiFiles: bundle.actions.length > 0 ? 1 : 0,
    fileCount: allSourceFiles.size,
  };

  return {
    draft: {
      seedNodeTypes,
      seedRelationTypes,
      seedActions,
      coverage,
    },
    readiness,
    bundleMetadata: {
      bundleId: bundle.bundleId,
      targetSystemName: bundle.targetSystemName,
      assetKind: bundle.assetKind,
      sourceDigest: bundle.sourceDigest,
      engineVersion: bundle.engineVersion,
      analyzedAt: bundle.analyzedAt,
    },
  };
}
