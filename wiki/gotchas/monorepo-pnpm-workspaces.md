# 避坑实录：PNPM Monorepo 与开源基座自适应目录规范

1. **自研项目**：统一遵循 PNPM workspace monorepo 根结构；
2. **开源基座项目**：100% 保持基座原生目录结构（如 RuoYi 等），通过 `degit` 极速派生；
3. **彻底弃用 .coolie/cmmi**：增量敏捷特性需求统一扁平落盘于 `docs/specs/`。
