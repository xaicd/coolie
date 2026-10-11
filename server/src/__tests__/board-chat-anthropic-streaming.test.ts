import { describe, it, expect } from "vitest";
import { formatAnthropicMessages } from "../routes/board-chat.js";

describe("formatAnthropicMessages", () => {
  it("formats a single user message properly", () => {
    const messages = formatAnthropicMessages(
      [],
      "你好，帮我看看今天的待办",
      "",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      role: "user",
      content: "你好，帮我看看今天的待办",
    });
  });

  it("merges consecutive turns of the same role and alternates", () => {
    const history = [
      { isConcierge: false, body: "第一句用户" },
      { isConcierge: false, body: "第二句用户追加" },
      { isConcierge: true, body: "助手回复一" },
      { isConcierge: true, body: "助手回复补充" },
    ];

    const messages = formatAnthropicMessages(
      history,
      "第三句用户提问",
      "",
    );

    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("第一句用户\n\n第二句用户追加");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("助手回复一\n\n助手回复补充");
    expect(messages[2].role).toBe("user");
    expect(messages[2].content).toBe("第三句用户提问");
  });

  it("handles history that starts with an assistant turn by prepending user greeting", () => {
    const history = [
      { isConcierge: true, body: "我是董事长助理，有什么我可以帮您的？" },
    ];

    const messages = formatAnthropicMessages(
      history,
      "请列出系统待办",
      "",
    );

    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("你好");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("我是董事长助理，有什么我可以帮您的？");
    expect(messages[2].role).toBe("user");
    expect(messages[2].content).toBe("请列出系统待办");
  });

  it("appends document context to the latest user message", () => {
    const docContext = "【上传文档: 需求规格.docx】\n系统需要支持用户登录和权限管理\n【/上传文档: 需求规格.docx】";
    const messages = formatAnthropicMessages(
      [{ isConcierge: false, body: "请分析这份文档" }],
      "请分析这份文档",
      docContext,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain("请分析这份文档");
    expect(messages[0].content).toContain("[最新上传文档]");
    expect(messages[0].content).toContain("【上传文档: 需求规格.docx】");
  });

  it("filters out empty lines and transient thinking status lines", () => {
    const history = [
      { isConcierge: false, body: " " },
      { isConcierge: true, body: "思考中…" },
      { isConcierge: true, body: "正在连接会话助手…" },
      { isConcierge: false, body: "真实提问" },
      { isConcierge: true, body: "真实回答" },
    ];

    const messages = formatAnthropicMessages(
      history,
      "下一次提问",
      "",
    );

    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: "user", content: "真实提问" });
    expect(messages[1]).toEqual({ role: "assistant", content: "真实回答" });
    expect(messages[2]).toEqual({ role: "user", content: "下一次提问" });
  });

  it("preserves prior unreplied user questions when a new question arrives", () => {
    const history = [
      { isConcierge: false, body: "@墨斗 对标开源基座与标杆竞品" },
    ];

    const messages = formatAnthropicMessages(
      history,
      "hello",
      "",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("@墨斗 对标开源基座与标杆竞品\n\nhello");
  });
});
