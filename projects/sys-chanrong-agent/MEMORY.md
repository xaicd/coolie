# MEMORY.md — sys-chanrong-agent 项目记忆中枢

> **极简全景**: 任何 AI 打开本项目进场第一秒必读。全文体积严格守卫在 8KB 以内。
> 详细工程安全带见 [HARNESS.md](HARNESS.md)，工程法典见 [AGENTS.md](AGENTS.md)。

---

## 0. 进场必知 (5 秒掌握)

- **系统全称**: sys-chanrong-agent (`sys-chanrong-agent`)
- **客户公司**: 客户专属商业实体
- **技术栈**: Node / TS 全栈 (PNPM Monorepo 架构)
- **当前 Sprint 状态**: `2026-sprint-active-delivery` (里程碑有序推进中)

---

## 1. 活体业务实体与动词速查

- **核心实体**: 业务实体
- **核心动词**: 业务动词
- **硬底线**:
  • 租户数据行级隔离: 所有 SQL/API 查询强制注入 company_id / tenant_id 隔离
  • 交付不可变证据: 标记完工必须挂载测试验收凭据与不可篡改记录
  • 1 Task = 1 Commit: 每个原子任务绑定唯一物理提交，工作树保持 0 脏

---

## 2. 客户口语意图路由表 (Intent Router)

| 客户说的话 / 老板原话 | 映射 Action / Spec 路径 | 责任员工 |
| :--- | :--- | :--- |
| "加个新业务功能 / 改个需求" | `node scripts/speckit.cjs new` | 墨斗 (FDA) |
| "修个 bug / 接口报错了" | `node scripts/run-tests.mjs` | 铁匠 (Core SWE) |
| "验一下能不能上 / 界面跑通没" | `bash scripts/harness.sh test` | 门神 (FDSE) / 百晓生 (DS) |
| "现在项目怎么样了 / 跑个全身体检" | `bash scripts/harness.sh full-audit` | 兑底渊 (PRE/SRE) |
| "发版上线 / 生产割接" | 查阅 `docs/07_release/release-sop.md` | 兑底渊 (PRE/SRE) |

---

## 3. 高频命令速查

```bash
bash scripts/harness.sh full-audit      # 全量五位一体审计
node scripts/speckit.cjs tasks          # 查看任务进度面板
node scripts/run-tests.mjs              # 运行自动化测试
```
