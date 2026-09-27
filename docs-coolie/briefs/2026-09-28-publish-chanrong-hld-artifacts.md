# Brief: 把国信产融 HLD 修订与 G2 门禁脚本作为产物发布到工坊

> **类型**: 产物发布 (Generated Artifacts & Work Products)
> **执行角色**: `emp_fda` (前线架构师 / 对应门禁 `gate_g2_arch`)
> **产出系统**: `SYS_CHANRONG_AGENT` (国信产融智能体应用系统)
> **派单时间**: 2026-09-28 01:33 CST

---

## 0. 背景 (为什么有这份 brief)

本轮已完成两件产出,但它们**目前只存在于本地工作区,工坊里的老板与员工看不到**:

1. `projects/sys-chanrong-agent/docs/cmmi/02-hld.md` —— 重写版概要设计,补齐了 DAR 加权决策矩阵、需求级选型落地表、待决事项。
2. `projects/sys-chanrong-agent/scripts/check-fork-surface.mjs` —— **新建的 G2 门禁脚本**。此前 `cmmi-profile.json` 的 `gates.g2.checkCommand` 指向该文件,而文件从未存在,导致 G2 无法执行。

**为什么不能由外部会话直接上传**:`skills/paperclip/scripts/paperclip-upload-artifact.sh` 要求 `PAPERCLIP_RUN_ID`,并每次调用都发送 `X-Paperclip-Run-Id` 头(脚本第 401 行、129/138/171/436/506 行)。产物上传统一挂 run 出处,这是设计意图 —— 因此必须由**一次真实的 agent run**完成,不能绕过。

---

## 1. 任务 (3 步)

### TASK 1: 确认 G2 门禁在本地通过

```sh
cd <repo>/projects/sys-chanrong-agent
node scripts/check-fork-surface.mjs
```

期望:`✅ G2 架构门禁通过` 并打印 `需求覆盖校验通过:12 条 REQ-CR-### 均已登记`。

### TASK 2: 上传两份交付物为 artifact work product

```sh
cd <repo>
bash skills/paperclip/scripts/paperclip-upload-artifact.sh \
  projects/sys-chanrong-agent/docs/cmmi/02-hld.md \
  --title "国信产融 HLD 修订 — DAR 加权矩阵 + 需求级选型落地表" \
  --summary "补齐 G2 要求的 DAR 多准则加权决策矩阵(编排引擎/控制台底座/OCR 路线/规则引擎),新增 REQ-CR-001~012 的满足方式-许可证-风险对照,并登记 6 项待决事项" \
  --content-type text/markdown

bash skills/paperclip/scripts/paperclip-upload-artifact.sh \
  projects/sys-chanrong-agent/scripts/check-fork-surface.mjs \
  --title "G2 门禁脚本(此前缺失)" \
  --summary "补齐 cmmi-profile.json gates.g2 长期指向但不存在的检查脚本:校验分层拓扑、company_id 隔离、DAR 加权矩阵、需求覆盖、待决事项登记" \
  --content-type text/javascript
```

### TASK 3: 在 issue 内留痕并置状态

- 在本 issue 的最终评论中**链接两个已上传的 artifact**(不要只写本地路径 —— 本地路径不是可访问路径);
- 同时把 §3 的待决事项同步进 issue,因为它们需要业主决策,不是工程侧能自决的;
- 然后置 issue 状态。

---

## 2. Constraints

- ❌ 不要用本地绝对路径作为唯一交付路径。产物必须经 `paperclip-upload-artifact.sh` 进 Paperclip API。
- ❌ 不要修改 `01-srs.md`。SRS 第 4 节明确"任何需求变更必须经 **CCB 双人签名**",`REQ-CR-008` 等变更须走 CCB。
- ❌ 不要为了上传而伪造或用外部凭据;必须在本 run 内正常上传。
- ✅ 上传前先跑 TASK 1,确保产物本身是自洽的。

---

## 3. 必须一并上报的待决事项 (需业主决策)

1. ~~`xaicd/ruoyi-all-next` 无许可证~~ **已解决**:业主方已于 2026-09-27 17:34 推送 LICENSE,现为 **MIT**(API 实测 `spdx=MIT`,标准全文、零附加条款,`Copyright (c) 2026 xaicd`)。遗留义务(非阻塞):交付包须随附 `LICENSE` 全文与版权声明,漏署即许可违约。
2. **「若依」角色歧义(阻塞架构)**:`01-srs.md`/`03-lld-api.md` 把若依写成**甲方现有门户**(`REQ-CR-010`),而本次选型是**自建控制台**。代码归属/交付物/验收方式不同。
3. **★2.4 要求"采购的商用财报 OCR 工具"**,原 HLD 用 PaddleOCR+视觉模型覆盖财报,属**未声明偏离**;新版 DAR 已裁为"财报采购、发票/合同用开源"的组合路线。
4. **`REQ-CR-012` 硬件指纹 License 锁**会把国企客户系统锁死,须写入合同附件。
5. **无依据的量化承诺**:文档中 "2 秒内"、"1.5 秒首字"、">99.5%"、">98%"、"已通过信创合规论证" 均无实测/评审证据,投标前须补基准或改相对表述。
6. **门禁自身缺陷(非阻塞,但需知)**:`g3` 的 `npx tsc --noEmit` 目前解析到仓库根 TypeScript 并崩溃(项目无 tsconfig);`g4` 的 `npm test --if-present` 会向上走到祖先 `package.json`,跑的不是本项目的套件。

---

## 4. Done

- 两个 artifact 已上传,且**在本 issue 的最终评论中以 artifact 链接形式给出**(而非本地路径);
- `node scripts/check-fork-surface.mjs` 在本 run 内退出码为 0;
- §3 六项待决事项已在 issue 中列明并指派给业主决策方。
