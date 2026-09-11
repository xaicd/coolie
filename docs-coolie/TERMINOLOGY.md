# 术语表 (TERMINOLOGY) — 消除 "coolie" 命名冲突

> **背景**:"coolie" 指向**两个不同项目**,极易混淆。本表钉死统一代号。改动/迁移前先读。
> **硬规则:禁止单独用 "coolie" 指代任一方,必须用下面的代号。**

| 代号 | 是什么 | 仓库 | 角色 |
|---|---|---|---|
| **TARGET**(本仓库) | paperclip 的 fork(MIT 控制平面) | `xaicd/coolie` | **迁移目标 / 定开底座**。本仓库即 TARGET。 |
| **SRC**(源) | DigitalStaff —— 用户旧系统(曾改名"苦力/Coolie",`coolie.cloud`) | `xaicd/DigitalStaff` | **迁移源**。仅作能力参考,clean-room 重写,不搬实现。 |

- 迁移方向恒为 **SRC → TARGET**。
- 本仓库内部包名 `@paperclipai/*`、环境变量 `PAPERCLIP_*` 是 fork 内部标识,**不改**(改了破坏基线);对外展示品牌 P1 已改为 "Coolie"(`ui/src/branding.ts`)。
- SRC(DigitalStaff)的 `AGENTS.md` 自称 "Coolie/苦力" —— 那是 **SRC 旧品牌自述**,与本仓库无关,读到时按 SRC 理解。
- 完整版术语表见 SRC 仓库 `rewrite/TERMINOLOGY.md`。

*本表与任何历史文档的裸 "coolie" 用法冲突时,以本表为准。*
