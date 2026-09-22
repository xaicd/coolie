import { useRef } from "react";
import type { CSSProperties } from "react";
import { C } from "../../theme";
import { rowLabelStyle, rowStyle } from "./Chip";

/**
 * 在 composer 里选好、但还没上传的文件。
 *
 * 上传不能发生在选文件的那一刻: Coolie Web composer 走
 * `issuesApi.uploadAttachment(companyId, issue.id, file)`, 需要 issue id,
 * 所以先暂存, 等创建接口回来再统一上传 (见 `useComposerFields`)。
 */
export interface StagedAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  file: File;
}

/**
 * h5 `Upload` 控件 —— Coolie Web NewIssueDialog 附件暂存的镜像,
 * 与 expo 端 `UploadRow.tsx` 同一份 props/语义。
 *
 * 上游用一个隐藏的 `<input type="file">` (或拖放) 暂存文件, 列表可逐项移除,
 * 任务建好后再上传; 这里就是那个 file input 的可见版本。
 */
export function UploadRow({
  files,
  onChange,
  disabled = false,
}: {
  files: StagedAttachment[];
  onChange: (files: StagedAttachment[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ ...rowStyle, alignItems: "flex-start" }}>
      <span style={rowLabelStyle}>Upload</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 }}>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []).map((file) => ({
              id: `${file.name}:${file.size}:${file.lastModified}`,
              name: file.name,
              mimeType: file.type || "application/octet-stream",
              size: file.size,
              file,
            }));
            const seen = new Set(files.map((file) => file.id));
            onChange([...files, ...picked.filter((file) => !seen.has(file.id))]);
            // 允许再次选同一个文件
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            disabled={disabled}
            style={{ ...uploadBtnStyle, ...(disabled ? { opacity: 0.4 } : null) }}
            onClick={() => inputRef.current?.click()}
          >
            📎 Upload
          </button>
          {files.length > 0 ? <span style={{ color: C.ink4, fontSize: 11 }}>{files.length} 个附件</span> : null}
        </div>

        {files.length > 0 ? (
          <div style={listStyle}>
            {files.map((file) => (
              <div key={file.id} style={itemStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: C.ink2, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {file.name}
                  </div>
                  <div style={{ color: C.ink4, fontSize: 11 }}>
                    {file.mimeType}
                    {file.size !== null ? ` · ${formatBytes(file.size)}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`移除 ${file.name}`}
                  style={removeBtnStyle}
                  onClick={() => onChange(files.filter((entry) => entry.id !== file.id))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** 与 Web composer 的 `formatFileSize` 同一形态。 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const uploadBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${C.line}`,
  background: "rgba(255,255,255,0.02)",
  color: C.ink3,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  border: `1px solid ${C.lineSubtle}`,
  borderRadius: 8,
  padding: 8,
};

const itemStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };

const removeBtnStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: C.ink3,
  fontSize: 13,
  cursor: "pointer",
  padding: 2,
};
