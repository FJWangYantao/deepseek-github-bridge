import { beforeEach, describe, expect, it } from "vitest";
import { DeepSeekAdapter } from "../src/content/deepseek-adapter";

const supportedLocation = { hostname: "chat.deepseek.com" } as Location;
const unsupportedLocation = { hostname: "example.com" } as Location;

describe("DeepSeekAdapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds a prompt textarea and preserves existing text when appending", () => {
    document.body.innerHTML = `
      <textarea placeholder="输入消息"></textarea>
      <textarea placeholder="搜索"></textarea>
    `;
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "已有提示词";
    const adapter = new DeepSeekAdapter({ document, location: supportedLocation });

    expect(adapter.isSupportedPage()).toBe(true);
    expect(adapter.findPromptInput()).toBe(textarea);
    adapter.appendPromptText("附加上下文");
    expect(textarea.value).toBe("已有提示词\n\n附加上下文");
  });

  it("supports contenteditable editors", () => {
    document.body.innerHTML = `<div contenteditable="true" aria-label="消息输入框"></div>`;
    const adapter = new DeepSeekAdapter({ document, location: supportedLocation });
    adapter.setPromptText("hello");
    expect(adapter.getPromptText()).toBe("hello");
  });

  it("does not claim support on unrelated pages", () => {
    const adapter = new DeepSeekAdapter({ document, location: unsupportedLocation });
    expect(adapter.isSupportedPage()).toBe(false);
  });
});

