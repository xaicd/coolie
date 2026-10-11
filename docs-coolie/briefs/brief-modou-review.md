# 任务: 墨斗评审社区生活服务 60/90 天交付估算方案

## Background
老板命令: 「估算方案让 agy, claude-glm 都看看」
项目位置: ~/workspace/life-service/某单位社区生活服务平台采购项目技术规范书.docx (4.7万字/1662段/9业务模块/15子功能)
yudao 源码 (已 git clone 到本机): /tmp/yudao-mini-probe (master-jdk17 分支, 7 module, 1001 Java 文件)

## Target
你是墨斗 (modou-fda), FDA 前线架构师。评审下面这份估算方案, 6 维度输出评审意见 markdown:

方案原文: /tmp/review/life-service-estimating-brief.md (120 行)

请直接 read_file /tmp/review/life-service-estimating-brief.md 读取后, 按方案末尾指定的 6 段格式输出评审意见 (markdown):
1. 工期真伪 (评分 1-5, 5=准确; 高估/低估的地方)
2. 风险盲点 (老板漏列的坑)
3. 派活合理性 (6 人队, 缺谁)
4. yudao 合并可信度 (保守/激进, 是否需 spike?)
5. 给老板的 1 条关键指令 (立刻就做)
6. 你的最终选 A/B/C?

【墨斗强项发挥要求】:
- FDA 视角: 选型合理性 / 架构风险 / 工期矩阵可信度
- 必须引用 brief 里的真实数字 (工期/团队规模/yudao 模块数), 不要泛泛
- 真证据驱动: 你能看到 ~/workspace/life-service/ 里的 docx 规范书, 可以交叉验证
- 中文输出, 微信一屏看完

## Branch
main (本机 dispatch 默认)

## File allowlist
只读 /tmp/review/life-service-estimating-brief.md + /tmp/yudao-mini-probe/
不写文件 / 不动 git / 不 commit

## Steps
1. read_file /tmp/review/life-service-estimating-brief.md 全文
2. ls /tmp/yudao-mini-probe 验真 yudao 模块结构
3. 可选: read_file ~/workspace/life-service/某单位社区生活服务平台采购项目技术规范书.docx (已是 md 提取版, 需用 unzip 处理)
4. 输出 6 维度评审 (markdown)

## Acceptance
输出: 完整 markdown 评审意见 (≥5 维度 + 至少 3 条具体风险 + 1 条数据引用)
不要真的写文件, 输出到 stdout 即可。

## Rules
- 单写 (不并发)
- 不输出 secrets
- 不引入 mock 数据
- 卡 4h 必须回报 stuck