# 第三方代码来源

`course-deck` 的 deck 工具链来自 **huashu-design**（花叔Design），MIT 许可。
原件版权与许可全文见 [`LICENSE-huashu-design`](./LICENSE-huashu-design)。

| 本目录文件 | 上游文件 | 改动 |
|---|---|---|
| `scripts/export_pdf.mjs` | `scripts/export_deck_pdf.mjs` | 仅改名 |
| `scripts/export_pptx.mjs` | `scripts/export_deck_pptx.mjs` | 仅改名 |
| `scripts/html2pptx.js` | `scripts/html2pptx.js` | 无 |
| `scripts/pptx_from_rendered.py` | `scripts/pptx_from_rendered.py` | 无 |
| `scripts/gen_deck_thumbs.mjs` | `scripts/gen_deck_thumbs.mjs` | 无 |
| `scripts/verify_render.py` | `scripts/verify.py` | 仅改名 |
| `assets/deck_index.html` | `assets/deck_index.html` | 无 |

**本技能自有的部分**（非上游）：

- `scripts/combine_deck.py` —— 多文件 deck → 单文件 PPTX 导出源。
  上游没有这一步的脚本；页单位标在 `.stage` 上以避开默认选择器里的 `.s`。
- `scripts/verify_deck.mjs` —— 逐页量坐标，检出被 `overflow:hidden` 静默裁掉的内容。
- `SKILL.md` 与课程场景的验收清单、计高预算表、坑表。

## 许可义务

MIT 允许商用、修改、再分发，**条件是保留版权声明与许可全文**。
因此 `LICENSE-huashu-design` **不得删除**，本文件也不得删除。
若日后升级上游脚本，请同步更新上表的对应关系。

上游仓库：https://github.com/alchaincyf/huashu-design
