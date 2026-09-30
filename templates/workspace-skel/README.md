# Coolie 开发基座（Development Base）

这是 **Coolie「公司 = Workspace」的开发基座**（`templates/workspace-skel/`）。
`scripts/new-company.sh <公司名>` 会把本目录整份拷贝到
`~/workspace/xaicd/<公司名>/`，并在那里 `git init`，作为该公司的代码与文档根目录。

## 基座是什么

**基座 = 空壳 + 默认模块，不含任何业务域。**

它只提供一套「站在上面快速定制」的脚手架：认证 / 权限 / 会员 / 审计 / 文件存储 /
代码生成 / 通知 / 定时任务 / OpenAPI 文档这些**每个项目都要的底座能力**，
以及 5 个角色（Palantir Foundry 岗位）的派单入口。

具体的业务（订单、审批流、商城、CRM、ERP、WMS、MES ……）**不在基座里预装**：
客户按**标书 / 需求文档**在基座上快速定制开发。基座里没有业务代码，所以也不会有
「用不上的域拖慢每个项目」这件事。

> 说明：本基座取代了旧的「全栈 15 域」底座（`ruoyi-all-next` 全量预装）。
> 15 域看似齐全，实际每个项目 80% 的域都用不上，反而拖慢启动与交付。
> 为什么这样选，见 `docs/ARCHITECTURE.md` 的「5 默认模块 vs 15 全栈域」对比表，
> 以及 `docs-coolie/specs/2026-09-21-coolie-workspace-template.md`。

## 目录约定

```
<公司名>/
├── modules/               默认模块（基座自带，每项目必用）
│   ├── system/            用户 / 角色 / 权限 / 菜单 / 字典
│   ├── infra/             文件存储 / 代码生成 / 通知 / 定时任务
│   ├── member/            会员体系
│   ├── audit/             审计日志
│   └── api/               OpenAPI 文档
├── specs/                 本公司自己的需求 spec（spec workflow 的输入）
├── docs/                  本公司自己的设计与运维文档
│   ├── ARCHITECTURE.md    基座架构 + 扩展点 + 定制开发指南
│   └── README.md          文档目录约定
├── .agents/skills/        本公司自己的角色 skill（默认空，按需加入）
├── cli/
│   ├── fda.sh             FDA  —— 前线架构师派单入口（骨架）
│   ├── core-swe.sh        Core SWE —— 平台核心研发（骨架）
│   ├── pre-sre.sh         PRE / SRE —— 产品可靠性（骨架）
│   ├── fdse.sh            FDSE —— 前线部署全栈（交付第一责任人）（骨架）
│   └── ds.sh              DS   —— 部署战略 / 业务方案（投产一票否决）（骨架）
├── models.yaml            5 角色主备 CLI / 模型映射
└── scripts/
    └── bootstrap.sh       自举：校验角色文件 + 默认模块 + 赋权
```

## 默认模块（5 个）

| 模块 | 职责 | 典型能力 |
|---|---|---|
| `system` | 组织与访问 | 用户 / 角色 / 权限 / 菜单 / 字典 |
| `infra` | 基础设施 | 文件存储 / 代码生成 / 通知 / 定时任务 |
| `member` | 会员体系 | 会员 / 等级 / 积分（业务侧的客户主体） |
| `audit` | 审计日志 | 谁在何时改了什么（写读一致，可回放） |
| `api` | 对外契约 | OpenAPI 文档 / 契约校验 |

每个模块目前是**骨架**（`modules/<name>/README.md` 说明边界与扩展点），
业务实现按项目标书在该模块内或新模块中补齐。

## 不含（故意不预装）

`bpm`（审批流）/ `pay`（支付）/ `report`（报表）/ `mp`（公众号）/ `mall`（商城）/
`crm` / `erp` / `wms` / `mes` / `im` —— 这 10 个业务域**不在基座里**。
按项目标书需要哪个，再引入哪个（可以复用成熟开源实现），基座不为它们留占位空壳。

## 用法

```bash
# 在主仓根目录一键立项：建平台公司 + 注册 5 角色 + 铺本骨架
bash scripts/new-company.sh acme

# 进入新 workspace 自举：校验角色 + 默认模块，赋可执行权限
cd ~/workspace/xaicd/acme && bash scripts/bootstrap.sh
```

可选的轻量底座代码（`coolie-base-1.0` tag，仍不含业务域）由
`scripts/new-company.sh` 按需拉取；拉取失败不阻断立项，可稍后重试。

## 五个角色

| 角色 | 职责一句话 | 门禁 |
|---|---|---|
| FDA | 实现前画死隔离 / 领域 / 权限 / 守恒边界 | G1 设计 |
| Core SWE | 让错误在编译期就无法提交 | G2 可编译 |
| PRE / SRE | 确保「测过的」就是「要上的」 | G5 环境 |
| FDSE | 交付第一责任人，状态机全覆盖 + 自写测试 | G3 自测 |
| DS | 用户视角主审官，一票否决 | G4 业务 |

角色细化 skill 见主仓 `.agents/skills/{fda,core-swe,pre-sre,fdse,ds}/`。
