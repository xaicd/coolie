# 国信产融智能体应用系统 不可变投产与运维部署规范 (Deploy SOP)

> **所属业务系统**: 国信产融智能体应用系统 (`SYS_CHANRONG_AGENT`)  
> **所属本体域**: `chanrong-core`  
> **投产责任人**: `emp_sre` (产品可靠性工程师)  
> **标准基准**: CMMI 3 / IEEE 828 配置管理标准  
> **编制依据**: 《某公司产融智能体应用系统集成服务项目 技术规范书》

---

## 1. 制品指纹与不可变交付包 (Immutable Artifacts)

本工程采用不可变 Docker 镜像交付，投产制品由工坊自动化流水线签署，严禁在生产宿主机直接修改文件或代码。

- **发布版本号**: `v1.0.0-RELEASE`
- **构建基线 Commit SHA**: `15f2de191f`
- **交付包 SHA-256 校验和**: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- **Docker 镜像列表与校验和**:
  - `guoxin-chanrong-agent:1.0.0` (SHA-256: `a94a8fe5ccb19ba61c4c0873d391e987982fbbd3` )
  - `guoxin-vision-ocr:1.0.0` (SHA-256: `4297f44b13955235245b2497399d7a93` )
  - `guoxin-web-console:1.0.0` (SHA-256: `d3b07384d113edec49eaa6238ad5ff00` )

---

## 2. 生产环境部署拓扑与一键启停操作

### 2.1 依赖环境要求
- **操作系统**: 统信 UOS Server 20 / 麒麟 Kylin V10 / Ubuntu 22.04 LTS (信创认证兼容)
- **硬件配置**: 32 核 CPU，64GB 内存，1TB NVMe SSD，NVIDIA RTX 4090 (24GB) 或 A10 (24GB)
- **基础软件**: Docker 24.0+，Docker Compose v2.20+，NVIDIA Container Toolkit

### 2.2 离线安装与一键启停步骤

1. **导入离线镜像包**:
   ```bash
   docker load -i guoxin-chanrong-agent-v1.0.0.tar.gz
   ```

2. **配置离线 License Key 授权文件**:
   将我方生成的生产授权证书 `license.key` 放置于 `/opt/guoxin-chanrong/config/license.key`。系统启动时将自动校验机器指纹（CPU 序列号、网卡 MAC 地址、授权到期日）。

3. **一键启动生产服务**:
   ```bash
   cd /opt/guoxin-chanrong
   docker compose -f docker-compose.prod.yml up -d
   ```

4. **系统健康自检拨测**:
   ```bash
   curl -fsS http://localhost:8080/api/v1/health
   # 预期返回: {"status":"UP","services":{"db":"OK","ocr":"OK","agent":"OK","license":"VALID"}}
   ```

---

## 3. 秒级回滚 SOP 与容灾预案 (Emergency Rollback)

若现场发布联调发生不可预期的严重异常，必须严格执行**秒级回滚**流程，恢复至上一个稳定版本：

```bash
# === 紧急回滚执行脚本 ===
echo "⚠️ 启动紧急回滚流程..."

# 1. 停止当前故障版本容器
docker compose -f /opt/guoxin-chanrong/docker-compose.prod.yml down

# 2. 恢复上一版本镜像软链接与配置文件
ln -sfn /opt/guoxin-chanrong/releases/v0.9.8-stable /opt/guoxin-chanrong/current

# 3. 秒级启动上一版本稳定容器
docker compose -f /opt/guoxin-chanrong/current/docker-compose.prod.yml up -d

# 4. 拨测验证回滚状态
curl -fsS http://localhost:8080/api/v1/health

echo "✅ 回滚操作完成，业务已恢复稳定状态。"
```

- **数据回滚方案**: 数据库 DDL 升级前强制执行事务快照备份，回滚时使用 `pg_restore` 仅回滚表结构，不破坏已有客户业务流水。
