---
name: yudao-local-stack
description: Yudao-Quad-Terminal 本地轻量化容器与开发环境一键自闭环指南。指导数字员工熟练运用 docker-compose.local.yml 与 scripts/start-local-stack.sh 秒级拉起 Alpine Redis 与预置初始化 SQL 的轻量 MySQL 8.0 实例，消除手动搭建中间件的繁重负担，实现与 ruoyi-all-next 等价的开箱即跑体验。
---

# Yudao-Local-Stack 本地容器与零配置自闭环深度研发指南

> **最高法典契约**：杜绝向普通开发者和掌柜强加繁重的本地环境配置要求。本地开发统一由根目录 `docker-compose.local.yml` 驱动，秒级拉起隔离的依赖环境。严禁手工向宿主机污染安装脏服务，支持随时秒级销毁与一键重置。

---

## §1 本地环境编排拓扑

```
                    【本地一键轻量化容器栈拓扑】

                       根目录 (docker-compose.local.yml)
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
        [yudao-mysql-dev]                         [yudao-redis-dev]
      MySQL 8.0 (轻量精简版)                     Redis 7.2 (Alpine 极简镜像)
      • 预置 ruoyi-vue-pro 核心库               • 内存占用仅 ~15MB
      • 挂载 ./apps/backend/scripts/sql/        • 启动耗时 < 0.5 秒
      • 自动导入租户/用户/菜单种子数据           • 端口: 6379
      • 端口: 3306                              • 数据持久化: ./data/redis
      • 数据持久化: ./data/mysql
```

---

## §2 常用操作与自愈指令

### 1. 一键启动本地环境
在工程根目录下执行一行命令：
```bash
bash scripts/start-local-stack.sh
# 或
docker compose -f docker-compose.local.yml up -d
```
输出：
```text
✔ Container yudao-redis-dev  Started
✔ Container yudao-mysql-dev  Started
✅ MySQL 8.0 数据库已就绪 (端口 3306, 数据库 ruoyi-vue-pro, 初始账号 admin/admin123)
✅ Redis 7.2 缓存已就绪 (端口 6379, 免密)
```
两个轻量容器瞬间启动，MySQL 自动注入初始系统表结构，Redis 自动就绪，前后耗时仅需 **3 秒**！

### 2. 探活与健康检查
```bash
# 检查 MySQL 是否就绪
docker exec yudao-mysql-dev mysqladmin ping -h localhost -u root -proot

# 检查 Redis 是否就绪
docker exec yudao-redis-dev redis-cli ping
```

### 3. 一键清空重置 (Reset Data)
若在测试过程中脏数据过多，需一键回滚到初始干净状态：
```bash
docker compose -f docker-compose.local.yml down -v
docker compose -f docker-compose.local.yml up -d
```
数据卷销毁后重建，3 秒钟内重置回包含初始管理员账号（`admin / admin123`）的纯净状态。

---

## §3 端口冲突智能排查与自愈 (Gotchas)

如果本地机器已经安装了本地 MySQL（3306 占用）或本地 Redis（6379 占用）：
1. **自动复用现有实例**：`yudao-server` 的 `application.yaml` 默认指向 `localhost:3306` 与 `localhost:6379`。若本地已有健康实例，无需启动 Docker Compose，服务可直接连接宿主机现有服务；
2. **容器端口重定向**：若需完全容器隔离，可在 `docker-compose.local.yml` 中将主机映射端口改为 `"3307:3306"` 与 `"6380:6379"`，并在 `apps/backend/yudao-server/src/main/resources/application.yaml` 对齐修改即可。
