# 生产环境可观测性、告警与容灾备份体系 (Production Observability, Alerts & DR)

> **工程标准**: CMMI 3 配置管理与生产投产 (CM/RSKM/PMC) & Google SRE 稳定性保障 (SLO/SLI)  
> **服务工单**: [COOA-270](/COOA/issues/COOA-270) `[G6·发布-B] Prometheus+Grafana 业务面板 + Postgres WAL 备份 → OSS`  
> **关联配置**: `deploy/observability/prometheus/`, `deploy/observability/grafana/`, `scripts/backup/postgres-wal-to-oss.sh`

---

## 1. 体系总览与目录结构

```
deploy/observability/
├── prometheus/
│   ├── prometheus.yml                     # Prometheus 主配置文件
│   ├── targets/                           # 采集目标定义 (File SD)
│   │   ├── apps.yml                       # Coolie 核心服务应用端点
│   │   ├── blackbox.yml                   # 公网与内部端点拨测
│   │   ├── mysql.yml                      # MySQL 监控
│   │   ├── node.yml                       # 主机基础资源与 textfile 指标
│   │   ├── postgres.yml                   # Postgres 数据库指标
│   │   └── redis.yml                      # Redis 中间件指标
│   └── rules/                             # 告警与记录规则
│       ├── business-signals.rules.yml     # 业务交易与验签成功率规则
│       ├── infra-and-backup.rules.yml     # 基础设施、中间件与备份容灾规则
│       └── sla-burn-rate.rules.yml        # Multi-window Multi-burn-rate SLO 规则
└── grafana/
    └── dashboards/
        └── coolie-production-overview.json # Grafana 4 业务面板大盘
```

---

## 2. Grafana 4 核心业务面板矩阵

大盘 UID: `coolie-prod-overview`

1. **流量与网关健康度**：QPS 趋势、2xx/4xx/5xx 状态码分布、P90/P99 延迟 SLO 守望；
2. **数据库与中间件水位**：Postgres/MySQL 活跃连接率、慢查询 QPS、Redis 命中率；
3. **核心业务信号**：订单履约成功率 (SLO ≥ 99.5%)、微信支付回调验签率、租户行级隔离越权拦截计数、SM4 解密异常；
4. **备份与容灾监控**：Postgres WAL 备份陈旧时间 (RPO ≤ 5m 告警)、产物大小趋势与耗时。

---

## 3. Postgres WAL 与全量备份至阿里云 OSS

- **备份脚本**: `scripts/backup/postgres-wal-to-oss.sh`
- **定时调度**: 每日 03:00 全量备份，WAL 归档近实时增量上传
- **Node Exporter Textfile 采集集成**:
  - 脚本执行后原子写入 `/var/lib/node_exporter/textfile_collector/coolie_backup_postgres.prom`；
  - 产出 `coolie_backup_last_success_timestamp_seconds`、`coolie_backup_last_size_bytes`、`coolie_backup_runs_total`；
  - Prometheus 自动抓取并在备份中断超 36 小时或产物体积骤降 > 50% 时触发 P0/P1 语音/企微告警。
