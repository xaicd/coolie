import type { Project } from "@coolie/api-client";
import { C } from "../../theme";
import { ComposerChip, rowChipsStyle, rowLabelStyle, rowStyle } from "./Chip";

/** 上游 project 未设色时的种子色, 与 Web 的 `--project-seed` 对齐 */
const SEED_COLOR = "#8A8F98";

/**
 * h5 `in [project]` 行 —— Coolie Web NewIssueDialog project 选择器的镜像,
 * 与 expo 端 `ProjectRow.tsx` 同一份 props/语义 (选中值就是 `projectId`)。
 *
 * 选项来自 `projectsApi.list` 那一个端点, 已归档项目按 Web 的 `activeProjects`
 * 过滤掉; `noneLabel="No project"` 对应这里的「无项目」。
 */
export function ProjectRow({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  /** 选中的 `projectId`; `null` 表示不归属任何项目。 */
  value: string | null;
  onChange: (projectId: string | null) => void;
}) {
  const activeProjects = projects.filter((project) => project.status !== "archived");

  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>in</span>
      <div style={rowChipsStyle}>
        <ComposerChip
          label="无项目"
          active={value === null}
          onClick={() => onChange(null)}
          dotColor={value === null ? C.accent : C.ink4}
        />
        {activeProjects.map((project) => (
          <ComposerChip
            key={project.id}
            label={project.name}
            active={value === project.id}
            onClick={() => onChange(project.id)}
            dotColor={project.color ?? SEED_COLOR}
            title={project.description ?? project.name}
          />
        ))}
      </div>
    </div>
  );
}
