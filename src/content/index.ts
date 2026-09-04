import { DeepSeekAdapter } from "./deepseek-adapter";
import { serializeError } from "../github/errors";
import type { BridgeMessage, BridgeReply } from "../shared/types";

const adapter = new DeepSeekAdapter();

chrome.runtime.onMessage.addListener((message: BridgeMessage, _sender, sendResponse) => {
  if (message.type !== "deepseek:ping" && message.type !== "deepseek:appendContext") {
    return false;
  }

  try {
    if (!adapter.isSupportedPage()) {
      throw new Error("当前页面不是受支持的 DeepSeek 对话页面。");
    }

    if (message.type === "deepseek:ping") {
      const response: BridgeReply<"deepseek:ping"> = {
        ok: true,
        data: {
          supportedPage: true,
          editorAvailable: Boolean(adapter.findPromptInput()),
          promptCharacters: adapter.getPromptText().length,
          url: window.location.href,
        },
      };
      sendResponse(response);
      return false;
    }

    if (!message.payload.text.trim()) {
      throw new Error("待插入的上下文为空。");
    }
    adapter.appendPromptText(message.payload.text);
    const response: BridgeReply<"deepseek:appendContext"> = {
      ok: true,
      data: {
        inserted: true,
        addedCharacters: message.payload.text.length,
        promptCharacters: adapter.getPromptText().length,
      },
    };
    sendResponse(response);
  } catch (error) {
    const response: BridgeReply<"deepseek:ping" | "deepseek:appendContext"> = {
      ok: false,
      error: serializeError(error),
    };
    sendResponse(response);
  }

  return false;
});

