import { CheckCircle2, GitBranch, Lock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The web twin of the app's `SpecDiffCard`: a build spec shown in the board
 * chat, per object type, as `field: type`.
 *
 * Two things this does not do, deliberately:
 *
 *  - **It does not decide what is legal.** Property types and cardinalities are
 *    the ontology plugin's vocabulary (`ontology-core`'s `validateDocument`), so
 *    this renders whatever the server sent and never keeps its own list of
 *    allowed values. A client-side whitelist here would be a second truth that
 *    drifts from the one that is enforced.
 *  - **It does not offer to apply anything.** The model is written by the server
 *    after a human approves it. A "apply" button on the client would be a button
 *    that cannot honestly do what it says.
 *
 * The trigger phrase matches `DOMAIN_TRIGGER_PATTERN` in
 * `server/src/services/build-orchestrator.ts` and the app's copy of it. The
 * client decides when to *show* the card; the server decides whether to accept
 * the request, and both read the same pattern.
 */

export const DOMAIN_TRIGGER_PATTERN = /^(?:建域|建模|domain)\s+/i;

export function isDomainPrompt(text: string): boolean {
  return DOMAIN_TRIGGER_PATTERN.test(text.trim());
}

export interface SpecProperty {
  name: string;
  type?: string;
  description?: string;
}

export interface SpecObjectType {
  key: string;
  displayName?: string;
  description?: string;
  properties?: SpecProperty[];
}

export interface SpecRelationType {
  key: string;
  displayName?: string;
  sourceNodeTypeKey?: string;
  targetNodeTypeKey?: string;
  cardinality?: string;
}

export interface SpecProblem {
  severity: string;
  code: string;
  subject: string;
  message: string;
}

export interface SpecDocumentPayload {
  name?: string;
  objectTypes?: SpecObjectType[];
  relationTypes?: SpecRelationType[];
}

export interface SpecDiffCardProps {
  prompt: string;
  loading?: boolean;
  error?: string | null;
  planSource?: "hermes" | "rejected" | null;
  document?: SpecDocumentPayload | null;
  problems?: SpecProblem[];
  approvalStatus?: string | null;
  domainId?: string | null;
  onOpenApproval?: () => void;
}

/** A missing type is stated, not left blank, so it does not read as data loss. */
function typeLabel(property: SpecProperty): string {
  return property.type && property.type.trim() ? property.type : "未定类型";
}

function approvalBadge(status: string | null | undefined): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  switch (status) {
    case "approved":
      return { label: "已批准", variant: "default" };
    case "rejected":
      return { label: "已驳回", variant: "destructive" };
    case "revision_requested":
      return { label: "待修改", variant: "outline" };
    case "pending":
      return { label: "待审批", variant: "secondary" };
    default:
      return { label: "未提交审批", variant: "outline" };
  }
}

export function SpecDiffCard({
  prompt,
  loading = false,
  error = null,
  planSource = null,
  document: specDocument = null,
  problems = [],
  approvalStatus = null,
  domainId = null,
  onOpenApproval,
}: SpecDiffCardProps) {
  const subject = prompt.trim().replace(DOMAIN_TRIGGER_PATTERN, "").trim();
  const objectTypes = specDocument?.objectTypes ?? [];
  const relationTypes = specDocument?.relationTypes ?? [];
  const errors = problems.filter((problem) => problem.severity === "error");
  const approval = approvalBadge(approvalStatus);

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-3 rounded-lg border px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitBranch className="text-primary h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-sm font-semibold">本体规范</span>
        </div>
        {planSource === "hermes" ? (
          <Badge variant={approval.variant}>{approval.label}</Badge>
        ) : planSource === "rejected" ? (
          <Badge variant="destructive">未产出规范</Badge>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">{subject || prompt}</p>

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          正在梳理领域模型…
        </div>
      ) : error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : planSource === "rejected" ? (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs">
            这次没能产出可审批的规范，因此本体里没有写入任何东西。
          </p>
          {errors.slice(0, 3).map((problem) => (
            <p key={`${problem.code}-${problem.subject}`} className="text-muted-foreground text-xs">
              · {problem.subject}: {problem.message}
            </p>
          ))}
        </div>
      ) : (
        <>
          {specDocument?.name ? (
            <p className="text-xs font-semibold">
              {specDocument.name}
              <span className="text-muted-foreground font-normal">
                {"  "}
                {objectTypes.length} 对象类型 / {relationTypes.length} 关系类型
              </span>
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            {objectTypes.map((type) => (
              <div key={type.key} className="bg-muted/40 rounded-md border px-3 py-2">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-semibold">
                    {type.displayName ?? type.key}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">{type.key}</span>
                </div>
                {(type.properties ?? []).map((property) => (
                  <div key={property.name} className="flex items-baseline justify-between gap-2">
                    <span className="text-muted-foreground truncate text-xs">{property.name}</span>
                    <span className="text-primary shrink-0 font-mono text-xs">
                      {typeLabel(property)}
                    </span>
                  </div>
                ))}
                {!type.properties?.length ? (
                  <span className="text-muted-foreground text-xs">无属性</span>
                ) : null}
              </div>
            ))}
          </div>

          {relationTypes.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs font-semibold">关系</span>
              {relationTypes.map((relation) => (
                <span key={relation.key} className="truncate text-xs">
                  {relation.sourceNodeTypeKey ?? "?"} → {relation.targetNodeTypeKey ?? "?"}
                  {"  "}
                  <span className="text-primary">{relation.displayName ?? relation.key}</span>
                  {relation.cardinality ? (
                    <span className="text-muted-foreground"> ({relation.cardinality})</span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}

          {problems.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs font-semibold">建模建议</span>
              {problems.slice(0, 4).map((problem) => (
                <span
                  key={`${problem.severity}-${problem.code}-${problem.subject}`}
                  className="text-muted-foreground text-xs"
                >
                  · {problem.subject}: {problem.message}
                </span>
              ))}
            </div>
          ) : null}

          {domainId ? (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              已落地本体域
            </span>
          ) : approvalStatus && onOpenApproval ? (
            <button
              type="button"
              onClick={onOpenApproval}
              className={cn(
                "text-muted-foreground flex items-center gap-1 text-xs",
                "transition-colors duration-150 hover:text-foreground",
              )}
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              审批通过后才会写入本体
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
