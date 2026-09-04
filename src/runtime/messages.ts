import { BridgeOperationError } from "../github/errors";
import type {
  BridgeMessage,
  BridgeMessageType,
  BridgeReply,
  MessageResponseMap,
} from "../shared/types";

export type MessageFor<K extends BridgeMessageType> = Extract<BridgeMessage, { type: K }>;

export async function requestBridge<K extends BridgeMessageType>(
  message: MessageFor<K>,
): Promise<MessageResponseMap[K]> {
  const reply = await new Promise<BridgeReply<K>>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: BridgeReply<K> | undefined) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(
          new BridgeOperationError(
            "MESSAGE_FAILED",
            runtimeError.message || "扩展消息通信失败。",
          ),
        );
        return;
      }
      if (!response) {
        reject(new BridgeOperationError("EMPTY_RESPONSE", "扩展没有返回结果。"));
        return;
      }
      resolve(response);
    });
  });

  if (!reply.ok) {
    throw new BridgeOperationError(reply.error.code, reply.error.message, {
      status: reply.error.status,
      retryAfterSeconds: reply.error.retryAfterSeconds,
    });
  }
  return reply.data;
}

