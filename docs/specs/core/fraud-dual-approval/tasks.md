# Tasks: 高危反诈双人会签

上游：`design.md`。

## 1. 任务依赖波次图 (Task Dependency Graph - Kiro Waves)

```json
{
  "waves": [
    {
      "id": "wave-1",
      "title": "地基与契约准备",
      "tasks": [
        "T1"
      ],
      "dependsOn": []
    },
    {
      "id": "wave-2",
      "title": "核心服务与数据流落地",
      "tasks": [
        "T2"
      ],
      "dependsOn": [
        "wave-1"
      ]
    },
    {
      "id": "wave-3",
      "title": "端到端测试与集成验证",
      "tasks": [
        "T3"
      ],
      "dependsOn": [
        "wave-2"
      ]
    }
  ]
}
```

## 2. 交互式任务清单 (Interactive Execution Tasks)

- [ ] **T1**: 建立压测性能基线 (Baseline Benchmark)
  - 归属: `main`
  - 文件白名单: `<!-- 待填: 测试文件 -->`
  - 验收要求: 必须携带提交标识 `[T1]` 并附带真实测试验证

- [ ] **T2**: 实现性能优化与瓶颈消解
  - 归属: `T1`
  - 文件白名单: `<!-- 待填: 核心优化代码 -->`
  - 验收要求: 必须携带提交标识 `[T2]` 并附带真实测试验证

- [ ] **T3**: 运行对照压测并验证达标
  - 归属: `main`
  - 文件白名单: `-`
  - 验收要求: 必须携带提交标识 `[T3]` 并附带真实测试验证


## 3. CMMI 双向追溯与 Git 提交核实矩阵 (RTM & Git Trace)

| ID | 归属 | 任务 | 文件白名单 | 状态 |
|---|---|---|---|---|
| T1 | main | 建立压测性能基线 (Baseline Benchmark) | <!-- 待填: 测试文件 --> | 未开始 |
| T2 | T1 | 实现性能优化与瓶颈消解 | <!-- 待填: 核心优化代码 --> | 未开始 |
| T3 | main | 运行对照压测并验证达标 | - | 未开始 |

## 4. 依赖说明

T1 → T2 → T3

## 5. 阶段状态

* 规划：`PLAN_APPROVED`（由 brief 展开）
* 开发：待开始
* 独立测试：待开始
