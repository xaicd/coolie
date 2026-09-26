/**
 * 版本更新说明 —— 装机后「这台机器到底装了什么新东西」。
 *
 * 优先走服务端：GET /api/release-notes?version=<expo.version>，由 server 从
 * clients/expo/CHANGELOG.md 抽 `## vX.Y.Z` 节（wave89 修法 C）。CHANGELOG 是
 * 发版流水本来就要写的文档，这样 WhatsNew 不再要求「每个版本手工同步两份文案」，
 * h5 端也不再常年停在旧版本号。
 *
 * 本文件内的数组降级为离线兜底：取不到远端（断网 / 端点还没部署 / 版本节还没写）
 * 时 WhatsNew 用它显示最近一版，不白屏、不空屏。
 *
 * 新增版本时正常发版（CHANGELOG 顶部加节）即可；只有想在离线兜底里也带上
 * 说明时才需要往数组顶部加一节。
 */

import { COOLIE_BASE_URL } from "./coolie";

export interface ReleaseNote {
  /** 语义化版本，必须与 app.json 的 expo.version 一致 */
  version: string;
  /** 一句话主题 */
  title: string;
  /** 本版功能点，逐条列出 */
  features: string[];
}

/** /api/release-notes 的响应体（公开只读，见 server/src/routes/release-notes.ts） */
interface RemoteReleaseNotes {
  version: string;
  title: string;
  content: string;
  bullets: string[];
}

/**
 * 拉某版本的远端说明；任何失败（网络 / 非 200 / 结构不对）都返回 null，
 * 调用方回退到本地兜底数组 —— WhatsNew 绝不因拉取失败而缺内容。
 */
export async function fetchReleaseNotes(version: string): Promise<ReleaseNote | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `${COOLIE_BASE_URL}/api/release-notes?version=${encodeURIComponent(version)}`,
      { headers: { Accept: "application/json" }, signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as RemoteReleaseNotes | null;
    if (typeof data?.version !== "string" || !Array.isArray(data?.bullets)) return null;
    const features = data.bullets.filter(
      (bullet): bullet is string => typeof bullet === "string" && bullet.length > 0,
    );
    if (features.length === 0) return null;
    return {
      version: data.version,
      title: typeof data.title === "string" && data.title ? data.title : `v${data.version} 更新`,
      features,
    };
  } catch {
    return null;
  }
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "0.5.23",
    title: "砍掉工作空间，工坊一件到底",
    features: [
      "删掉「工作空间」四 Tab 屏 (对话 / 预览 / 文件 / 终端): 那是抄来的 RN 骨架, 预览/文件/终端全是假数据, 按老板「工作空间很乱, 对话不像对话」的意见整屏删除",
      "工坊 (ChatHome) 成为唯一对话面: 智能识别 build / plan / pipeline / pr / chat + Quick chip + SSE 流式回复, 现有能力足够",
      "顶栏不再有 [工作空间] 入口; 旧深链 coolie://workspace 一并移除",
    ],
  },
  {
    version: "0.5.22",
    title: "[驾驶舱Web] 内置网页兜底",
    features: [
      "顶栏 [驾驶舱Web] 智能路由：装了 Coolie Web 就深链拉起，没装就用内置网页兜底 —— 不再只弹「未安装」就断",
      "兜底页整屏加载 Coolie Web，顶部 [安装独立] 引导去下独立 APK：只引导，不静默强装",
      "新会话页 ↗ (在 Coolie Web 打开) 走同一套逻辑",
    ],
  },
  {
    version: "0.5.5",
    title: "对齐 Coolie Web 风格 + 登录修复",
    features: [
      "原生 appBar + 底部 tab bar：汇览 / 任务 / 中央「+」/ 员工 / 收件箱，跟 Coolie Web 同一套骨架",
      "顶栏 [驾驶舱Web] 一键跳 coolieweb:// 深链，直达 Coolie Web App",
      "主题色统一：近黑三档背景 + 品牌紫蓝 #5E6AD2，与 Coolie Web 一致",
      "装机自检 (What's New) 屏改成启动即弹 —— 未登录也先弹，看完再进登录页",
      "登录修复：切换「邮箱密码 / API Key」时清空输入并给出 ready 提示，按钮不再「看起来没反应」",
    ],
  },
  {
    version: "0.5.2",
    title: "ChatHome 收编 + 装机自检",
    features: [
      "ChatHome 内嵌预览：总办回复里的预览标签就地渲染，网址用网页视图、图片用大图，不再跳屏",
      "工作空间四合一：对话 / 预览 / 文件 / 终端，一个模态里来回切",
      "5 角色智能体：需求 / 设计 / 编码 / 测试 / 发布，随公司一起注册",
      "装机自检：核对 APK 版本与 OTA 运行时版本，一眼看出有没有装对",
    ],
  },
  {
    version: "0.5.1",
    title: "ChatHome 预览 + 工作空间",
    features: [
      "ChatHome 预览：工坊对话流里就地渲染总办回复的内嵌预览",
      "工作空间四 Tab：对话 / 预览 / 文件 / 终端",
      "本体规范工作流：发「建域 xxx」产出规范预览卡，审批通过后落库",
    ],
  },
];

/** 取某版本的说明；找不到就给最近一版，绝不返回空指针。 */
export function noteForVersion(version: string): ReleaseNote {
  return RELEASE_NOTES.find((note) => note.version === version) ?? RELEASE_NOTES[0];
}
