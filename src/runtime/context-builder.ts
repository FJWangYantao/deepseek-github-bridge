import { DEFAULT_CONTEXT_LIMITS } from "../shared/constants";
import type { FileContent } from "../shared/types";

export interface ContextFile {
  repo: string;
  ref: string;
  path: string;
  language?: string;
  content: string;
}

export interface ContextLimits {
  maxFiles: number;
  warnFileCharacters: number;
  maxFileCharacters: number;
  maxTotalCharacters: number;
}

export interface ContextStats {
  fileCount: number;
  totalCharacters: number;
  estimatedCharacters: number;
  warnings: string[];
}

export class ContextBuildError extends Error {
  readonly code: "NO_FILES" | "TOO_MANY_FILES" | "FILE_TOO_LARGE" | "TOTAL_TOO_LARGE" | "BINARY_FILE";
  readonly path?: string;

  constructor(
    code: ContextBuildError["code"],
    message: string,
    options: { path?: string } = {},
  ) {
    super(message);
    this.name = "ContextBuildError";
    this.code = code;
    this.path = options.path;
  }
}

export function buildContext(
  files: ContextFile[],
  limits: ContextLimits = DEFAULT_CONTEXT_LIMITS,
): string {
  validateContextFiles(files, limits);

  return renderContext(files);
}

function renderContext(files: ContextFile[]): string {

  const repositoryNames = [...new Set(files.map((file) => file.repo))];
  const header = [
    "## GitHub context",
    "",
    `The following ${files.length === 1 ? "file is" : "files are"} from GitHub ${
      repositoryNames.length === 1 ? `repository \`${repositoryNames[0]}\`` : "repositories"
    }.`,
    "",
  ];

  const sections = files.map((file) => {
    const language = file.language ?? languageFromPath(file.path);
    const fence = "`".repeat(Math.max(3, longestBacktickRun(file.content) + 1));
    return [
      `File: \`${file.repo}/${file.path}\``,
      `Ref: \`${file.ref}\``,
      "",
      `${fence}${language ?? "text"}`,
      file.content,
      fence,
    ].join("\n");
  });

  return [...header, sections.join("\n\n")].join("\n");
}

export function contextFileFromGitHub(file: FileContent): ContextFile {
  return {
    repo: `${file.repo.owner}/${file.repo.name}`,
    ref: file.ref,
    path: file.path,
    language: file.language,
    content: file.content,
  };
}

export function getContextStats(
  files: ContextFile[],
  limits: ContextLimits = DEFAULT_CONTEXT_LIMITS,
): ContextStats {
  const warnings: string[] = [];
  const totalCharacters = files.reduce((total, file) => total + file.content.length, 0);
  for (const file of files) {
    if (file.content.length > limits.warnFileCharacters) {
      warnings.push(`${file.path} 较大（${file.content.length.toLocaleString()} 字符）。`);
    }
  }

  let estimatedCharacters = totalCharacters;
  try {
    estimatedCharacters = renderContext(files).length;
  } catch {
    // The source total is still useful when a partially selected file is invalid.
  }

  return {
    fileCount: files.length,
    totalCharacters,
    estimatedCharacters,
    warnings,
  };
}

export function validateContextFiles(
  files: ContextFile[],
  limits: ContextLimits = DEFAULT_CONTEXT_LIMITS,
): void {
  if (files.length === 0) {
    throw new ContextBuildError("NO_FILES", "请至少选择一个文件。 ");
  }
  if (files.length > limits.maxFiles) {
    throw new ContextBuildError(
      "TOO_MANY_FILES",
      `最多只能同时附加 ${limits.maxFiles} 个文件。`,
    );
  }

  let totalCharacters = 0;
  for (const file of files) {
    if (isLikelyBinary(file.content)) {
      throw new ContextBuildError(
        "BINARY_FILE",
        `${file.path} 看起来是二进制文件，无法作为文本附加。`,
        { path: file.path },
      );
    }
    if (file.content.length > limits.maxFileCharacters) {
      throw new ContextBuildError(
        "FILE_TOO_LARGE",
        `${file.path} 超过单文件 ${limits.maxFileCharacters.toLocaleString()} 字符限制。`,
        { path: file.path },
      );
    }
    totalCharacters += file.content.length;
  }
  if (totalCharacters > limits.maxTotalCharacters) {
    throw new ContextBuildError(
      "TOTAL_TOO_LARGE",
      `所选文件共 ${totalCharacters.toLocaleString()} 字符，超过总量 ${limits.maxTotalCharacters.toLocaleString()} 字符限制。`,
    );
  }

  const estimatedCharacters = renderContext(files).length;
  if (estimatedCharacters > limits.maxTotalCharacters) {
    throw new ContextBuildError(
      "TOTAL_TOO_LARGE",
      `生成的 Markdown 上下文约 ${estimatedCharacters.toLocaleString()} 字符，超过总量 ${limits.maxTotalCharacters.toLocaleString()} 字符限制。`,
    );
  }
}

export function isLikelyBinary(value: string): boolean {
  if (value.includes("\u0000") || value.includes("\ufffd")) return true;
  let suspicious = 0;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if ((code < 7 || (code > 14 && code < 32)) && code !== 9 && code !== 10 && code !== 13) {
      suspicious += 1;
    }
  }
  return value.length > 0 && suspicious / value.length > 0.02;
}

function longestBacktickRun(value: string): number {
  let longest = 0;
  let current = 0;
  for (const character of value) {
    if (character === "`") {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function languageFromPath(path: string): string | undefined {
  const extension = path.toLowerCase().split(".").pop();
  const languages: Record<string, string> = {
    ts: "ts",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    sh: "bash",
    ps1: "powershell",
    sql: "sql",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    vue: "vue",
    svelte: "svelte",
  };
  return extension ? languages[extension] : undefined;
}
