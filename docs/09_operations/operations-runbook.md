# Coolie 工坊平台控制面日常商业运营与故障排查运维手册 (Operations Runbook)

> **文档代号**: COOA-OPS-RUN-v2.0  
> **系统代号**: `COOLIE-FOUNDRY-CORE` (Coolie AI-Native Foundry Control Plane)  
> **CMMI 阶段**: `09_operations` (BizOps / DataOps)  
> **归属门禁**: G7 持续商业运营门禁 (`gate_g7_ops`)  
> **责任数字员工**: 掌柜 (CEO) / 百晓生 (DS) / 兑底渊 (PRE-SRE)  
> **基线版本**: v2.0.0 (生产准入版)  
> **制定日期**: 2026-10-17  

---

## 1. 平台日常巡检指令全集 (Daily Health Inspection)

运营负责人与 SRE 每日必须执行以下四项核心健康核验：

### 1.1 控制面健康探测 (API Health Check)
```bash
# 本地或生产健康探测
curl -sSf http://127.0.0.1:3100/api/health | jq .
# 预期输出: { "status": "ok" }
```

### 1.2 数字员工状态与任务执行大盘
```bash
# 检查智能体在线状态与工具池健康度
bash scripts/cron-team-status.sh --probe-tool-status
```

### 1.3 交付主线例行巡检与自愈程序
```bash
# 单次检查并自愈悬空任务
node scripts/coolie-dev-loop-supervisor.mjs
```

---

## 2. 常见系统故障排查与自愈处置树 (Troubleshooting Decision Tree)

### 2.1 工单意外阻塞或智能体达到轮次上限挂死
- **现象**: 工单处于 `blocked` 或无新心跳，智能体日志报 `Maximum turns reached (100 turns)`；
- **排查与自愈**:
  1. 运行巡检中枢自动解救：
     ```bash
     node scripts/coolie-dev-loop-supervisor.mjs
     ```
  2. 若仍未释放，手动调用释放接口：
     ```bash
     curl -X POST http://127.0.0.1:3100/api/issues/<ISSUE_ID>/release \
          -H "Authorization: Bearer <AGENT_KEY>"
     ```

### 2.2 预算熔断自动硬停
- **现象**: 智能体无法签出新工单，API 报错 `403 Budget Exceeded`；
- **处置**:
  1. 查看累计开销：
     ```bash
     curl http://127.0.0.1:3100/api/companies/<COMPANY_ID>/costs
     ```
  2. 掌柜在移动端或 Web 控制台点击【提额】，完成合法配额追加。

### 2.3 移动端 Expo OTA 更新“下了不装”
- **现象**: 手机客户端提示更新成功，但重启后界面依然停留在老版本；
- **排查**:
  1. 检查三处 runtimeVersion 是否绝对一致：
     - `clients/expo/app.json`
     - 生产发布 `version.json`
     - 线上 manifest
  2. 确认 `launchAsset.key` 是否随 bundle 哈希产生变更，排除本地老缓存复用。
