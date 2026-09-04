import type { SerializedError } from "../shared/types";

export type GitHubErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_INVALID"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_FAILED"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "BINARY_FILE"
  | "FILE_TOO_LARGE"
  | "UNKNOWN";

export class GitHubApiError extends Error {
  readonly code: GitHubErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: GitHubErrorCode,
    message: string,
    options: { status?: number; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "GitHubApiError";
    this.code = code;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export class BridgeOperationError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: string,
    message: string,
    options: { status?: number; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "BridgeOperationError";
    this.code = code;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof GitHubApiError || error instanceof BridgeOperationError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.status === undefined ? {} : { status: error.status }),
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
    };
  }

  if (error instanceof Error) {
    return { code: "UNKNOWN", message: error.message };
  }

  return { code: "UNKNOWN", message: "发生了未知错误。" };
}

export function errorMessage(error: unknown): string {
  return serializeError(error).message;
}

