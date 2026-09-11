# RTK L1 验证报告(运行时注入 · 压缩率实测)

> 配套方案:`docs-coolie/RTK-INTEGRATION.md`
> 目的:在真实沙箱里验证 rtk 可用性,并用**真实开发命令输出**量出压缩率,判断"省钱"是否成立。
> 结论:**成立**。rtk 的 hook 核心(`rtk rewrite`)可用,常见开发命令的 bash 输出压缩显著。

---

## 1. 环境与安装

- 平台:Linux x86_64;`rg`(ripgrep)已在 PATH(部分过滤器依赖)。
- 安装:下载官方预编译 musl 二进制(v0.48.0),放入 `/usr/local/bin/rtk`。
  - 也可 `brew install rtk` / `cargo install --git` / `install.sh`(见 RTK README)。
- `rtk --version` → `rtk 0.48.0` ✅
- 关闭遥测:`export RTK_TELEMETRY_DISABLED=1`(rtk 默认遥测关闭,需显式 opt-in;这里再兜底禁用)。

## 2. Hook 核心可用性(`rtk rewrite`)

rtk 的适配器 hook 本质就是把命令改写成 `rtk <cmd>`。实测:

| 输入命令 | rtk rewrite 输出 |
|---|---|
| `git status` | `rtk git status` ✅ |
| `ls -la` | `rtk ls -la` ✅ |
| `cargo test` | `rtk cargo test` ✅ |
| `grep -rn foo .` | `rtk grep -rn foo .` ✅ |
| `git log` | `rtk git log` ✅ |
| `npm test` | (空 = 无改写规则,按契约放行原命令) |

> 说明:并非所有命令都有改写规则;无规则时 rtk 返回空、命令原样执行(graceful,永不阻断)。

## 3. 真实压缩率(coolie 仓库,实测字节)

| 命令 | 原始字节 | rtk 字节 | 压缩率 |
|---|---:|---:|---:|
| `git status`(仓库干净) | 100 | 49 | **-51.0%** |
| `ls -la ui/src` | 1,523 | 551 | **-63.8%** |
| `git log -n 30` | 10,478 | 3,101 | **-70.4%** |
| `git diff HEAD~5` | 226,626 | 24,923 | **-89.0%** |
| `ls -R packages` | 222,763 | 728 | **-99.7%** |

> 输出越大、越"噪音多"(目录树、diff),rtk 压得越狠——这正是 Agent 跑命令时最烧 token 的场景。

## 4. `rtk gain` 统计面板(tracking 工作正常)

一轮演示(8 条命令)后:

```
Total commands:    8
Input tokens:      211.6K
Tokens saved:      204.3K (96.5%)
Top: rtk ls -R packages  -99.9% | rtk git diff HEAD~5  -89.2%
```

- rtk 会累计记录每条命令的节省,`rtk gain --format json` 可导出(用于将来接入 coolie 成本看板 = L3)。

## 5. 诚实说明(不夸大)

- **压缩率 ≠ 账单降幅**:rtk 砍的是"bash 输出字节"这一项输入 token;账单还含 prompt、系统提示、历史、输出 token,收益逐级稀释。百分比可靠,绝对 token 数为 `bytes/4` 估算。
- **仅作用于 Bash 工具调用**:Agent 的内置 Read/Grep/Glob 等不走 Bash hook,不受益。
- **本报告是"命令级"验证**,不是端到端业务闭环:真实业务省钱数要等接入真实模型 + Agent(P2 native 引擎)后才能端到端测。
- 本验证中 `rtk grep` 因调用参数不当(把目录传给底层 grep)未体现压缩,不代表 `rtk grep` 无效;正确用法见 RTK 文档。

## 6. 下一步(L2 / L3)

- **L2**:把 rtk 装进 coolie 的 sandbox-provider 镜像(`packages/plugins/sandbox-providers/`),新执行环境自带 rtk + `rtk init -g --agent <adapter>`,所有 Agent 默认启用。
- **L3**:写一个 coolie plugin,消费 `rtk gain --format json`,把省 token 数据接入 `cost_events`/dashboard,量化降本收益。

---

*本报告为验证记录,未改动 coolie 核心代码;rtk 为 Apache-2.0,与 coolie(MIT)兼容。*
