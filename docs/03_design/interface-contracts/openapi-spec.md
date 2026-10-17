# 统一对外接口契约规范 (OpenAPI 3.1 & Domain Contracts)

- **归属规范**: CMMI 03_design (TS) / .agents/skills/cmmi-detailed-contracts

---

## 1. 接口设计通用准则
- 动词化语义 API 契约
- 严格遵循输入输出 Schema 校验
- 响应形状统一：`{ code: 0, data: T, msg: "success" }`
