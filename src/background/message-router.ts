import { AuthStore } from "../github/auth";
import { GitHubClient } from "../github/client";
import { BridgeOperationError, serializeError } from "../github/errors";
import type {
  BridgeMessage,
  BridgeMessageType,
  BridgeReply,
  DeepSeekStatus,
  MessageResponseMap,
} from "../shared/types";

type AnyReply = BridgeReply<BridgeMessageType>;
type DeepSeekMessage = Extract<BridgeMessage, { type: "deepseek:ping" | "deepseek:appendContext" }>;

export function registerMessageRouter(auth: AuthStore, github: GitHubClient): void {
  chrome.runtime.onMessage.addListener((message: BridgeMessage, sender, sendResponse) => {
    void routeMessage(message, sender, auth, github)
      .then((reply) => sendResponse(reply))
      .catch((error) => sendResponse({ ok: false, error: serializeError(error) }));
    return true;
  });
}

async function routeMessage(
  message: BridgeMessage,
  sender: chrome.runtime.MessageSender,
  auth: AuthStore,
  github: GitHubClient,
): Promise<AnyReply> {
  switch (message.type) {
    case "auth:getStatus":
      return success(message.type, await auth.getStatus());
    case "auth:setToken": {
      const token = message.payload.token.trim();
      if (token.length < 10 || /\s/.test(token)) {
        throw new BridgeOperationError("INVALID_TOKEN", "请输入有效的 GitHub Token。 ");
      }
      const user = await github.getViewer(token);
      return success(message.type, await auth.save(token, user));
    }
    case "auth:clear":
      return success(message.type, await auth.clear());
    case "github:listRepositories":
      return success(message.type, await github.listRepositories());
    case "github:listBranches":
      return success(message.type, await github.listBranches(message.payload.repo));
    case "github:getTree":
      return success(message.type, await github.getTree(message.payload));
    case "github:compareRefs":
      return success(message.type, await github.compareRefs(message.payload));
    case "github:getCommit":
      return success(message.type, await github.getCommit(message.payload));
    case "github:getPullRequest":
      return success(message.type, await github.getPullRequest(message.payload));
    case "github:searchCode":
      return success(message.type, await github.searchCode(message.payload));
    case "github:listDirectory":
      return success(message.type, await github.listDirectory(message.payload));
    case "github:readFile":
      return success(message.type, await github.readFile(message.payload));
    case "deepseek:ping":
    case "deepseek:appendContext":
      return success(message.type, await sendToDeepSeek(message, sender));
    default:
      throw new BridgeOperationError("UNKNOWN_MESSAGE", "不支持的扩展消息。 ");
  }
}

async function sendToDeepSeek(
  message: DeepSeekMessage,
  sender: chrome.runtime.MessageSender,
): Promise<DeepSeekStatus | MessageResponseMap["deepseek:appendContext"]> {
  const tabId = sender.tab?.id ?? (await getActiveTabId());
  if (tabId === undefined) {
    throw new BridgeOperationError("DEEPSEEK_TAB_NOT_FOUND", "没有找到当前浏览器标签页。 ");
  }

  try {
    const reply = await chrome.tabs.sendMessage(tabId, message);
    if (!reply) {
      throw new BridgeOperationError("DEEPSEEK_EMPTY_RESPONSE", "DeepSeek 页面没有返回结果。 ");
    }
    if (!reply.ok) {
      throw new BridgeOperationError(reply.error.code, reply.error.message, {
        status: reply.error.status,
        retryAfterSeconds: reply.error.retryAfterSeconds,
      });
    }
    return reply.data;
  } catch (error) {
    if (error instanceof BridgeOperationError) throw error;
    throw new BridgeOperationError(
      "DEEPSEEK_CONTENT_UNAVAILABLE",
      "无法连接 DeepSeek 页面。请确认当前标签页是 chat.deepseek.com，并刷新页面后重试。",
    );
  }
}

async function getActiveTabId(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0]?.id;
}

function success<K extends BridgeMessageType>(
  _type: K,
  data: MessageResponseMap[K],
): BridgeReply<K> {
  return { ok: true, data };
}
