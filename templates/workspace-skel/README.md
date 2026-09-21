# Workspace 骨架 — 一个公司 = 一个项目

这是 **Coolie「公司=Workspace」模板**（`templates/workspace-skel/`）。
`scripts/new-company.sh <公司名>` 会把本目录整份拷贝到
`~/workspace/xaicd/<公司名>/`，并在那里 `git init`，作为该公司的代码与文档根目录。

## 目录约定

```
<公司名>/
├── specs/                 公司自己的需求 spec（spec workflow 的输入）
├── docs/                  公司自己的设计/运维文档
├── .agents/skills/        公司自己的角色 skill（默认空，按需加入）
├── cli/
│   ├── fda.sh             FDA  —— 前线架构师派单入口
│   ├── core-swe.sh        Core SWE —— 平台核心研发
│   ├── pre-sre.sh         PRE / SRE —— 产品可靠性
│   ├── fdse.sh            FDSE —— 前线部署全栈（交付第一责任人）
│   └── ds.sh              DS   —— 部署战略 / 业务方案（投产一票否决）
├── models.yaml            5 角色主备 CLI / 模型映射
├── .gitmodules            ruoyi-all-next 框架子模块声明
└── scripts/
    ├── bootstrap.sh       自举：校验角色文件 + 赋权 + 子模块 init
    └── import-ruoyi.sh    拉取/初始化 ruoyi-all-next 子模块
```

## 用法

```bash
# 在主仓根目录一键立项（第二波接通平台 API 前为 stub）
bash scripts/new-company.sh acme

# 进入新 workspace 自举
cd ~/workspace/xaicd/acme && bash scripts/bootstrap.sh

# 拉取框架子模块
bash scripts/import-ruoyi.sh
```

## 五个角色

| 角色 | 职责一句话 | 门禁 |
|---|---|---|
| FDA | 实现前画死隔离 / 领域 / 权限 / 守恒边界 | G1 设计 |
| Core SWE | 让错误在编译期就无法提交 | G2 可编译 |
| PRE / SRE | 确保「测过的」就是「要上的」 | G5 环境 |
| FDSE | 交付第一责任人，状态机全覆盖 + 自写测试 | G3 自测 |
| DS | 用户视角主审官，一票否决 | G4 业务 |

角色细化 skill 见主仓 `.agents/skills/{fda,core-swe,pre-sre,fdse,ds}/`。
