---
name: course-commerce-generation
description: 用于教育培训商户多媒体课程、真实课件与音视频资产的端到端自动化生成与造数工作流。涵盖 PPTX 演示文稿、PDF 教学讲义、H.264/AAC MP4 教学视频的程序化生成，教师档案建立，多章节目录及随堂资料结构化编排，以及商户工作台全自动化发布与播放验收。适用于“生成课程”“造课件数据”“上传视频与PPT”“教育商户造数”等场景。
---

# 教育商户真实课程与多媒体课件自动化生成工作流 (Course Commerce Generation)

本 Skill 沉淀了乡村振兴平台在**教育培训商户课程经营、真实多媒体课件生成、教师档案管理与 E2E 自动化造数**领域的全流程标准规范。

---

## 一、核心理念与零造假红线

在教育培训业态中，课件（PPT/PDF/ZIP）与教学视频（MP4）是课程交易的核心交付物：

- **强制红线 1：严禁空字节或虚构假文本冒充课件**
  - 上传的 PPT 必须为合法的 Office Open XML 演示文稿（`.pptx`），能被 Office、WPS 或 Keynote 正常打开并呈现幻灯片版式；
  - 上传的 PDF 必须为合法的 PDF 文档（`.pdf`），能被现代浏览器或阅读器完整渲染页眉、大纲与正文；
  - 上传的视频必须为标准的 H.264 + AAC 编码 MP4（`.mp4`），播放时长大于 0，画质清晰且带音频轨道，杜绝播放器黑屏崩溃。
- **强制红线 2：严禁未建讲师直接挂载无名氏**
  - 每门课程必须关联至少一位真实公开教师档案（姓名、职称、所属机构、教学特长标签与真实头像）。
- **强制红线 3：目录与随堂课件强一致**
  - 每个章节（Chapter）必须包含清晰的时长（durationSeconds）、视频资源（videoUrl）、随堂课件列表（attachments），并在学习端支持音画同步。

---

## 二、多媒体资产生成核心技术栈

| 资产类型 | 生成引擎 | 规格参数 | 产物规范 |
| :--- | :--- | :--- | :--- |
| **PPT 演示文稿** | `python-pptx` | 16:9 宽屏（13.33" x 7.5"）、齐鲁红主题色 | 包含封面、讲师信息、大纲目录、核心知识点卡片与课后实训题 |
| **PDF 讲义教材** | `reportlab` | A4 标准版式、完整页眉页脚与目录 | 包含中英文课程概要、核心实操规程（SOP）、设备组网图示与评分标准 |
| **MP4 教学视频** | `ffmpeg` | 1280x720 HD、25fps、H.264/yuv420p、AAC 128k 伴音 | 包含章节片头、大字版知识点条幅、背景色与标准教学伴音，100% 浏览器兼容 |

### 生成器调用示例：
```bash
python3 scripts/multimedia/generate-course-assets.py
```

---

## 三、教育商户课程结构化数据组装

一门标准的教育培训商业化课程包含以下层级结构：

```json
{
  "title": "现代温室大棚智能环控与水肥一体化实训课",
  "category": "MODERN_AGRI",
  "price": 199.00,
  "description": "面向现代乡村农业技术人员，系统讲授大棚传感网络、自动通风降温与精准滴灌实操技术。",
  "instructors": [
    {
      "instructorId": "<教师ID>",
      "role": "MAIN",
      "displayOrder": 1
    }
  ],
  "chapters": [
    {
      "title": "第 1 讲：温室大棚环境感知与智能传感器组网",
      "videoUrl": "/uploads/xxx.mp4",
      "durationSeconds": 1800,
      "description": "温湿度、光照、二氧化碳传感器的布设与通讯协议。",
      "segments": [
        { "title": "传感器类型与布点规范", "timeSeconds": 0, "description": "核心设备布设" },
        { "title": "485总线与LoRa网关组网", "timeSeconds": 600, "description": "无线通讯搭建" }
      ],
      "attachments": [
        {
          "name": "智能温室传感组网实训.pptx",
          "url": "/uploads/xxx.pptx",
          "sizeBytes": 29894,
          "ext": "pptx"
        },
        {
          "name": "传感器校准与点检SOP.pdf",
          "url": "/uploads/xxx.pdf",
          "sizeBytes": 2367,
          "ext": "pdf"
        }
      ]
    }
  ]
}
```

---

## 四、端到端自动化造数与发布验收流程

在编写或执行教育商户 E2E 造数测试时，严格遵循以下 5 步闭环：

```
[1. 生成真实音视频课件] ──> 本地生成真实 .pptx, .pdf, .mp4 文件
           │
           ▼
[2. 受控对象存储上传] ───> 调用 POST /api/upload (分发至 S3/MinIO/Local，类别识别为 DOCUMENT/VIDEO)
           │
           ▼
[3. 教师档案维护] ───────> 调用 POST /api/merchant/course-instructors 确立认证教师
           │
           ▼
[4. 课程创建与绑定] ─────> 调用 POST /api/merchant/courses 录入多章节与随堂附件，自动同步生成 SPU/SKU
           │
           ▼
[5. 工作台与大屏验收] ───> 打开 /merchant-console/courses 核验卡片状态、讲师展示与编辑弹窗目录树
```

---

## 五、验收标准清单 (Checklist)

- [ ] **课件真实性**：下载导出的 PPTX/PDF 能够在桌面端 Office/阅读器正常翻页浏览；
- [ ] **视频可播性**：HTML5 `<video>` 标签加载后能正常获取 `duration` 并触发 `play` 事件；
- [ ] **格式白名单覆盖**：UploadService 准确识别 `.pptx`、`.docx`、`.pdf`、`.zip` 为 `DOCUMENT` 类别；
- [ ] **商户端回显**：课程经营工作台列表中准确展示讲师姓名、时长、章节数与随堂资料标识；
- [ ] **C 端购课学习**：学员端课程详情页可查看章节大纲、在线观看录播视频并下载随堂课件。
