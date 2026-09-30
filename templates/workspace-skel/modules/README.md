# modules/ —— 默认模块（基座自带，5 个）

基座自带 5 个默认模块，每个都是「每个项目都要」的底座能力，**不含业务语义**：

| 模块 | 职责 |
|---|---|
| [`system/`](./system/README.md) | 用户 / 角色 / 权限 / 菜单 / 字典 |
| [`infra/`](./infra/README.md) | 文件存储 / 代码生成 / 通知 / 定时任务 |
| [`member/`](./member/README.md) | 会员体系 |
| [`audit/`](./audit/README.md) | 审计日志 |
| [`api/`](./api/README.md) | OpenAPI 文档 |

## 约定

- 每个模块一个目录，目录内 `README.md` 写清**边界、对外接口、扩展点**。
- 业务域**不在这里** —— 按项目标书在 `modules/<新域>/` 新建（见 `../docs/ARCHITECTURE.md` §4）。
- 模块之间通过显式接口协作，不互相读对方内部结构。

## 故意不含的业务域

`bpm` / `pay` / `report` / `mp` / `mall` / `crm` / `erp` / `wms` / `mes` / `im`
—— 基座不预装，按项目需要再引入。
