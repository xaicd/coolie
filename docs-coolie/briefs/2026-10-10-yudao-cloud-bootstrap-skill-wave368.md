# 任务: 墨斗写 Coolie 工坊 skill — yudao-cloud 基座选型+裁剪+三端模板

## Background
老板命令: 「Coolie 工坊产品是不是可以写个 skill，选择基座比如 yudao-cloud 时指定 jdk 版本，根据实际业务需求把需要的模块留下，剔除不需要的就行；同时微信小程序端啥的 yudao 解决方案也有的，关联要查全了」

## Target
你是墨斗 (modou-fda), FDA 前线架构师。任务: 产出一个 Coolie 工坊 skill 文件:

`/Users/mac/workspace/xaicd/coolie/skills/yudao-cloud-bootstrap/SKILL.md`

这个 skill 让任何数字员工或老板在新立 yudao-cloud 基座项目时, 只需:
1. 选 jdk 版本 (8 / 17 / 21 / 25)
2. 选基座 (yudao-cloud 完整版 或 yudao-cloud-mini 精简版)
3. 列业务需要的 module 清单
5. skill 自动产出裁剪后代码 + 启动验证

skill 核心要点 (你要查全 + 写透):
- 三种基座分支 (master jdk8 / master-jdk17 / master-jdk25) 各自含的 module 数 / Java 文件数 / starter 集合
- 18 个业务 module 功能清单 + 三端模板 (mall-uniapp / admin-vue3 / admin-vben)
- Spring Cloud Alibaba 全套 (Nacos / Sentinel / Gateway / Seata / XXL-Job)
- 代码生成器 (单表 / 树表 / 主子表) 用法
- 多租户 / RBAC / 动态权限 / 数据权限 starter
- 微信生态集成 (公众平台 / 小程序 / 微信支付 / 微信登录) SDK 路径
- 裁剪命令模板 (rm + pom.xml 删除 module 块) + 依赖冲突典型清单
- 启动验证 (mvn compile + Spring Boot start + curl /admin-api/...)

## Branch
main (本机 dispatch 默认工作区)

## File allowlist
✅ 允许写: /Users/mac/workspace/xaicd/coolie/skills/yudao-cloud-bootstrap/SKILL.md (新建)
✅ 允许读:
   - https://gitee.com/yudaocode/yudao-cloud (完整版)
   - https://gitee.com/yudaocode/yudao-cloud-mini (精简版)
   - https://cloud.iocoder.cn/migrate-module/ (迁移指南)
   - https://github.com/YunaiV/yudao-cloud
   - https://github.com/YunaiV/ruoyi-vue-pro
   - https://gitee.com/yudaocode/yudao-ui-admin-vue3 (Vue3 Element Plus)
   - https://gitee.com/yudaocode/yudao-ui-admin-vben (Vue3 Antd)
   - https://gitee.com/yudaocode/yudao-mall-uniapp (uni-app 三端)
✅ 允许 read: ~/workspace/yudao-cloud-probe/ (铁匠贰号正在 clone 的完整版)

❌ 禁止: 改 /Users/mac/workspace/xaicd/coolie/skills/ 下其他 skill 文件
❌ 禁止: push / commit

## Steps
1. mkdir -p skills/yudao-cloud-bootstrap
2. web_extract 4 个 URL (云溪 yudao 完整版/精简版/迁移文档/官方文档站点)
3. 查全: 18 个业务 module 各自功能 + starter 清单 + 三端模板 (vue3/vben/uni-app)
4. 写 SKILL.md (含 YAML + 7 大节):
   - §0 Skill 目的 (1 段)
   - §1 JDK 版本矩阵 (4 版本: jdk8/17/21/25, 各对应 Spring Boot + Spring Cloud 版本)
   - §2 基座选型 (mini vs 完整版, 何时选哪个)
   - §3 18 业务 module 功能表 + 是否需要 mini 版需要 完整版迁移
   - §4 三端模板矩阵 (admin-vue3 / admin-vben / mall-uniapp / wxa-小程序原生)
   - §5 裁剪命令模板 (按 JDK 分支 + 选 module 的 rm 命令清单 + pom.xml 同步删除)
   - §6 启动验证 (mvn compile + Spring Boot start + curl /admin-api/...)
   - §7 故障排除 (依赖冲突 / mvn 下载慢 / Sentinel 漏配 / 多租户切库)
5. ls /tmp/yudao-cloud-probe/ 验真铁匠贰号进展 (如已 clone) — 拿真实数字写入 skill
6. 输出: SKILL.md 路径 + 行数 + 字节数 + 引用模块数

## Acceptance
✅ 必备输出 (markdown):
- SKILL.md 路径 + 体量 (字节 + 行)
- §3 模块表实际行数 (要包含 18 module 全名)
- §4 三端模板清单 (4+ 个, 含 mall-uniapp + admin-vue3 + admin-vben + 小程序原生)
- §5 至少 3 个完整裁剪命令模板 (jbr17 完整版保留 5 module / jbr17 完整版保留 10 module / jbr17 mini 全保留)
- 引用真实数据: 从 yudao 官方文档 / cloud.iocoder.cn 拿

⚠️ 重要: 不准编造数据。所有数字必须来自源码或官方文档。
如果官方文档站访问不通, 立刻回报 PM, 不准硬填。

## Rules
- 单写 (不并发)
- 不输出 keystore 密码 / token / secrets
- 不引入 mock 数据
- 卡 4h 必须回报 stuck
- 不动 skills/ 下其他文件