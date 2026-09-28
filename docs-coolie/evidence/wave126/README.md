# wave126 验证证据 — 项目卡「创建任务 / 查看任务」

日期: 2026-09-28 · 版本: v0.5.88 (versionCode 588) · 设备: Android emulator (coolie-api28, 1080x2280)

老板原话 (20:42): 「项目中心 下 项目 下的 创建任务 应该跳到 新建任务 页，并且 选择了 项目」

## 实现提交

- `1ff479e87` feat: wave126 项目卡创建任务跳转新建页并预选项目
- `2527ce989` chore(release): version.json 0.5.87 → 0.5.88 (wave126 APK)

## 验证方法

在真机/模拟器安装的 **v0.5.88 release APK**（领导版本，非 dev build）上按真实用户路径走查，
并用生产 API 回读落库结果。登录用户: robinschen1989@gmail.com。

被测项目: `若依全栈 Next (ruoyi-all-next)`
- projectId: `5d664d24-0431-4fe8-9fdf-398915ff382a`
- 主工作区 (isPrimary): `be8eeed3-8700-4c3e-8467-69a2bbb16597` (ruoyi-all-next-workspace)

## 结果

### 1. 创建任务 → 新建任务弹窗，项目已预选

资产 → 项目中心 → 展开项目卡 → 点「创建任务」。

弹窗 `新建任务` 打开，「项目」下拉直接显示 **若依全栈 Next (ruoyi-all-next)**
（boss 要求的「选择了项目」）。

证据: `01-createtask-modal-project-preselected.png`

### 2. 建单落库绑定该项目主工作区（API 回读）

建单后生产 API 回读 (GET /api/companies/:cid/issues?projectId=...):

```
{
  "id": "233d13f1-65af-493a-8175-8b31b01d29d8",
  "title": "wave126-e2e-projectpreselect-1790605120",
  "projectId": "5d664d24-0431-4fe8-9fdf-398915ff382a",      <-- 与项目一致
  "projectWorkspaceId": "be8eeed3-8700-4c3e-8467-69a2bbb16597",  <-- == 项目主工作区
  "status": "todo"
}
```

`projectWorkspaceId` 等于项目主工作区 id → 服务端据 projectId 绑定项目主工作区，符合预期。

证据: `02-task-created-alert.png`（App 内「任务已创建」提示）

### 3. 清理测试数据

`DELETE /api/issues/233d13f1-65af-493a-8175-8b31b01d29d8` → 200，随后该项目任务列表为空。

### 4. 查看任务 → 任务页并套用该项目筛选

项目卡点「查看任务」→ 底部切到「任务」tab，筛选栏「项目」下拉自动选中
**若依全栈 Next (ruoyi-all-next)**（蓝框高亮），列表显示「没有匹配的任务」
（该项目本次无遗留任务；筛选确已生效）。

证据: `03-tasks-filtered-by-project.png`

## 截图

| 文件 | 内容 |
|---|---|
| `01-createtask-modal-project-preselected.png` | 新建任务弹窗，「项目」已预选 |
| `02-task-created-alert.png` | 建单成功提示 |
| `03-tasks-filtered-by-project.png` | 任务页，项目筛选已套用 |

## 发版产物核对

- APK: https://dls.xrobinai.cn/coolie/app/0.5.88/coolie-release.apk (HTTP 200, 78,093,606 B)
- sha256: `319ce9674de283cb3d1f7e895c20590d48685bd34a767a206b2e4d0965f70ef1`（与 version.json 一致）
- version.json: https://xrobinai.cn/version.json → 0.5.88 / 588
- OTA manifest: https://xrobinai.cn/ota/manifest → runtimeVersion 0.5.88
