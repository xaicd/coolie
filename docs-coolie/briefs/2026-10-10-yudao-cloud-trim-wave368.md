# 任务: 铁匠贰号完整版 yudao-cloud 拉取 + 无效模块裁剪

## Background
老板命令: 「完整版拉 https://github.com/YunaiV/yudao-cloud.git，干掉无效的就行」
项目背景: 社区生活服务平台采购项目（~workspace/life-service/），客户招标文件硬红线 90 天交付，20 模块完整 yudao-cloud 含含 mp 14+ 业务模块，但本项目只用其中 ~5 个

## Target
你是铁匠贰号 (forge-ii-core-swe), Core SWE 主力。任务:
1. 把 https://github.com/YunaiV/yudao-cloud.git 完整版 clone 到本地
2. 按老板 hard-rule「干掉无效模块」，裁剪到只剩本项目必须的 5 个业务 module + 必需 framework starter
3. 验证裁剪后 mvn compile 仍 0 报错 + Spring Boot 启动成功

老板硬选 (已定的 5 业务 module):
  - yudao-module-system    (用户/角色/部门/字典/通知/短信/租户/认证)
  - yudao-module-infra     (文件存储/定时任务/API日志/代码生成/配置)
  - yudao-module-member    (前台用户中心 C/B 端, 含房东/家政/居民)
  - yudao-module-pay       (家政订单支付 + 退款流程)
  - yudao-module-report    (房源数据统计大屏)

干掉 (14 个 module):
  - yudao-module-bpm / crm / erp / mes / fms / hrm / im / iot / mall / mp / oa / pms / wms / ai

保留必须依赖: yudao-gateway + yudao-framework 全部 15 个 starter + yudao-dependencies + yudao-server

## Branch
main (本机 dispatch 默认工作区)

## File allowlist
允许: ~/workspace/yudao-cloud-probe/  (新建, 你 clone 进去操作)
允许: ~/workspace/life-service/ (只读, 看招标规范书)
禁止: 改 /Users/mac/workspace/xaicd/coolie/ 任何文件
禁止: push 到 github
禁止: commit 到其他仓库

## Steps
1. rm -rf ~/workspace/yudao-cloud-probe
2. cd ~/workspace && git clone --depth 1 https://github.com/YunaiV/yudao-cloud.git yudao-cloud-probe
3. cd yudao-cloud-probe
4. ls -d yudao-module-*  # 列全部 18 个 module
6. 删出 14 个多余 module:
   rm -rf yudao-module-{bpm,crm,erp,mes,fms,hrm,im,iot,mall,mp,oa,pms,wms,ai}
7. 从 pom.xml 删除上面 module 的 <module> 行
8. mvn clean compile -pl '!yudao-ui-admin-vue3' -am  # 验证编译 0 报错
9. cd yudao-server && mvn spring-boot:run -Dspring-boot.run.profiles=local &
10. sleep 30 && curl http://localhost:8080/admin-api/system/auth/login 验证启动成功
11. kill %1  # 验证完杀掉
12. 输出: 剩余 module 清单 + Java 文件数 + starter 数 + 编译耗时 + 启动耗时 + 验证截图 (curl 返回码)

## Acceptance
✅ 必备输出 (markdown):
- 删了哪些 module (14 个)
- 保留 module 清单 (5 业务 + gateway + framework + server + dependencies + ui)
- mvn 编译结果 (BUILD SUCCESS / FAILURE)
- Spring Boot 启动日志最后 20 行
- curl 验证响应 (HTTP 状态码)
- 最后: 启动总耗时 + 本地 mvn 仓库占用

⚠️ 重要: 如果 mvn compile 失败 (依赖冲突) — 不要硬调, 立即回报 PM 给老板看, 不要硬凑 next-steps

## Rules
- 单写 (不并发)
- 不输出 keystore 密码 / token / secrets
- 不引入 mock 数据
- 卡 4h 必须回报 stuck
- 不动 /Users/mac/workspace/xaicd/coolie/ (主仓库)