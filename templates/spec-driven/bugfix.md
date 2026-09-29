# 缺陷模板（bugfix）

> spec 链第一步的另一种形态：不是「要做什么」而是「哪里不对」。四个字段讲清一个 bug。
> 机器骨架见 `specTemplateSkeleton("bugfix")`。

## 字段

| 字段 | 机器键 | 说明 |
|---|---|---|
| 标题 | (issue.title) | 一句话症状 |
| 复现步骤 | `bugfix.reproSteps` | 1、2、3…，别人照做能重现 |
| 预期行为 | `bugfix.expectedBehavior` | 本来应该怎样 |
| 实际行为 | `bugfix.actualBehavior` | 现在怎样（贴报错原文） |
| 证据 | — | 截图路径 / 日志 / 请求，**不编造** |

## 示例

```markdown
标题: 新建任务弹窗在 iPad 上被键盘挡住

复现步骤:
1. 打开 App，进入「新建任务」
2. 点标题输入框唤起键盘

预期行为: 弹窗上移，创建按钮可见。

实际行为: 键盘遮住底部按钮，无法提交。

证据: screenshots/... (本地留档，不入库)
```

## 下一步

确认是 bug 后派生 **design**（修法），再派生 **task**。若一行能改完，可跳过 design 直接一条 task。
