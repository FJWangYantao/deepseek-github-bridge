export const SUPPORTED_DEEPSEEK_HOSTS = new Set(["chat.deepseek.com"]);

export const GITHUB_API_BASE = "https://api.github.com";

export const GITHUB_API_VERSION = "2022-11-28";

export const AUTH_STORAGE_KEY = "githubAuth";

export const DEFAULT_CONTEXT_LIMITS = {
  maxFiles: 12,
  maxItems: 13,
  maxDiffFiles: 50,
  warnDiffCharacters: 40_000,
  maxDiffCharacters: 100_000,
  warnFileCharacters: 50_000,
  maxFileCharacters: 80_000,
  maxTotalCharacters: 120_000,
} as const;

