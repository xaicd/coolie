# ISO/IEC/IEEE 29148 & CMMI 需求规格与 RTM 双向跟踪标准规约

> **权威标准参考**: ISO/IEC/IEEE 29148:2018 (Systems and software engineering — Life cycle processes — Requirements engineering，取代原 IEEE 830-1998) 与 CMMI V2.0 需求开发 (RD) / 需求管理 (REQM) 过程域。

---

## 1. 标准软件需求规格说明书 (SRS) 结构大纲

根据 ISO/IEC/IEEE 29148 国际标准，一份完备的 SRS 文档必须包含以下核心章节，杜绝格式混乱：

```
1. 引言 (Introduction)
   1.1 目的 (Purpose)
   1.2 范围与业务上下文 (Scope & Business Context)
   1.3 核心术语与缩略语 (Definitions & Acronyms)
   1.4 参考文献与关联文档 (References)
2. 总体描述 (Overall Description)
   2.1 产品视角与拓扑位置 (Product Perspective)
   2.2 用户角色与特征画像 (User Classes & Characteristics)
   2.3 运行环境与依赖 (Operating Environment)
   2.4 设计与实现约束 (Design & Implementation Constraints)
   2.5 假设与依赖条件 (Assumptions & Dependencies)
3. 结构化特定需求 (Specific Requirements - EARS Standard)
   3.1 业务功能需求 (Functional Requirements)
   3.2 外部接口需求 (External Interface Requirements: UI/API/Hardware)
   3.3 非功能性质量属性 (Non-functional: Performance, Security, Availability)
4. 需求双向跟踪矩阵 (Requirements Traceability Matrix - RTM)
```

---

## 2. EARS 结构化需求句式转换指南 (0 歧义表达)

ISO/IEC/IEEE 29148 推荐使用限制性自然语言 (Constrained Natural Language)。本工坊强制统一使用 **EARS (Easy Approach to Requirements Syntax)** 句式，严禁“尽量”、“大概”、“高效”等不可量化词汇：

| EARS 模式 | 适用场景 | 标准语法结构 | 工业级示范 |
| :--- | :--- | :--- | :--- |
| **1. 普遍型 (Ubiquitous)** | 无前置条件，系统必须始终满足的基础能力 | `The <system> shall <response>.` | 系统 SHALL 对所有持久化存储的密码使用 Argon2id 进行单向哈希。 |
| **2. 事件驱动型 (Event-driven)** | 由明确的用户操作或外部事件触发 | `WHEN <trigger>, the <system> shall <response>.` | WHEN 用户点击“提交审核”按钮，系统 SHALL 锁定表单编辑态并发送审批事件通知。 |
| **3. 状态驱动型 (State-driven)** | 系统处于特定运行状态时的行为约束 | `WHILE <in state>, the <system> shall <response>.` | WHILE 系统处于“只读维护模式”期间，系统 SHALL 拦截所有 POST/PUT/DELETE 请求并返回 503 提示。 |
| **4. 异常驱动型 (Unwanted behavior)** | 发生错误、越权或异常环境时的防御处理 | `IF <error condition>, THEN the <system> shall <response>.` | IF 接口请求携带的租户 Token 校验失败，THEN 系统 SHALL 立即阻断请求并返回 HTTP 401 错误码。 |
| **5. 特性可选型 (Optional feature)** | 特定版本或配置包含特定功能时的行为 | `WHERE <feature enabled>, the <system> shall <response>.` | WHERE 启用了 OSS 多存储后端，系统 SHALL 自动为上传的文件生成预签名下载 URL。 |

---

## 3. 需求双向跟踪矩阵 (RTM) 字段契约

CMMI Level 3 (REQM) 要求必须维持**正向跟踪 (Forward)** 与**反向跟踪 (Backward)** 的完全闭环：

```markdown
| 需求编号 (REQ-ID) | 需求描述 (EARS) | 商业目标/用户故事 | 概要架构模块 (HLD) | 详细实现类/API (LLD) | 验收测试用例 (TC-ID) | 责任工匠 | 门禁状态 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| REQ-SYS-001 | WHEN 用户选择本地磁盘... | US-EXPORT-01 | Mod_StorageManager | StorageService.ts | TC-STORAGE-DISK-01 | DS/SWE | G1 PASSED |
```

### RTM 审查原则：
1. **0 悬空需求 (No Orphan Requirements)**: 每一个需求必有对应的测试用例与架构模块。
2. **0 越界开发 (No Gold-Plating)**: 代码中不得存在任何无法在 RTM 中溯源到合法需求的“私自加塞功能”。

---

## 4. G1 需求门禁同行评审清单 (Peer Review Checklist)

- [ ] **完整性**: 是否涵盖了全部业务用例与逆向异常分支？
- [ ] **一致性**: 需求之间是否存在相互矛盾的业务逻辑？
- [ ] **可验证性**: 每个验收条目是否都可以通过自动化测试或确定性操作进行验证？
- [ ] **合规性**: 每一条功能需求是否 100% 转换为 EARS 语法句式？
- [ ] **跟踪完备性**: RTM 矩阵中所有条目是否有对应的测试用例编号？
