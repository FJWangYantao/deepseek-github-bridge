import { DEFAULT_CONTEXT_LIMITS } from "../shared/constants";
import type { DiffFile, FileContent, RepositoryDiff, RepositoryTree } from "../shared/types";

export type ContextItemType = "file" | "tree" | "diff";

export interface ContextSource {
  repo: string;
  ref: string;
}

export interface ContextFile {
  type: "file";
  source: ContextSource;
  repo: string;
  ref: string;
  path: string;
  language?: string;
  content: string;
}

export interface ContextTree {
  type: "tree";
  source: ContextSource;
  repo: string;
  ref: string;
  sha: string;
  truncated: boolean;
  entries: RepositoryTree["entries"];
}

export interface ContextDiff {
  type: "diff";
  source: ContextSource;
  repo: string;
  ref: string;
  base: string;
  head: string;
  status: string;
  aheadBy: number;
  behindBy: number;
  totalCommits: number;
  files: DiffFile[];
}

export type ContextItem = ContextFile | ContextTree | ContextDiff;

export interface ContextLimits {
  maxFiles: number;
  maxItems?: number;
  maxDiffFiles?: number;
  warnDiffCharacters?: number;
  maxDiffCharacters?: number;
  warnFileCharacters: number;
  maxFileCharacters: number;
  maxTotalCharacters: number;
}

export interface ContextStats {
  itemCount: number;
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
  items: ContextItem[],
  limits: ContextLimits = DEFAULT_CONTEXT_LIMITS,
): string {
  validateContextItems(items, limits);

  return renderContext(items);
}

function renderContext(items: ContextItem[]): string {
  const repositoryNames = [...new Set(items.map((item) => item.repo))];
  const files = items.filter((item): item is ContextFile => item.type === "file");
  const trees = items.filter((item): item is ContextTree => item.type === "tree");
  const diffs = items.filter((item): item is ContextDiff => item.type === "diff");
  const header = [
    "## GitHub context",
    "",
    `The following ${items.length === 1 ? "context item is" : "context items are"} from GitHub ${
      repositoryNames.length === 1 ? `repository \`${repositoryNames[0]}\`` : "repositories"
    }.`,
    "",
  ];

  const sections = [
    ...diffs.map(renderDiff),
    ...trees.map(renderTree),
    ...files.map(renderFile),
  ];

  return [...header, sections.join("\n\n")].join("\n");
}

function renderFile(file: ContextFile): string {
  const language = file.language ?? languageFromPath(file.path);
  const fence = "`".repeat(Math.max(3, longestBacktickRun(file.content) + 1));
  return [
    `Context item: File`,
    `File: \`${file.repo}/${file.path}\``,
    `Ref: \`${file.ref}\``,
    "",
    `${fence}${language ?? "text"}`,
    file.content,
    fence,
  ].join("\n");
}

function renderDiff(diff: ContextDiff): string {
  const additions = diff.files.reduce((total, file) => total + file.additions, 0);
  const deletions = diff.files.reduce((total, file) => total + file.deletions, 0);
  const changedFiles = diff.files
    .map((file) => `- ${file.status === "renamed" && file.previousPath ? `${file.previousPath} → ` : ""}${file.path}`)
    .join("\n");
  const patch = diff.files
    .map((file) => {
      if (file.patch !== undefined) return `diff --git a/${file.previousPath ?? file.path} b/${file.path}\n${file.patch}`;
      return `diff --git a/${file.previousPath ?? file.path} b/${file.path}\n# Patch omitted by GitHub (${file.status}; +${file.additions} -${file.deletions})`;
    })
    .join("\n");
  return [
    "Context item: Git diff",
    `Repository: \`${diff.repo}\``,
    `Base: \`${diff.base}\``,
    `Head: \`${diff.head}\``,
    `Status: \`${diff.status}\``,
    `Files changed: ${diff.files.length}`,
    `Additions: ${additions}`,
    `Deletions: ${deletions}`,
    `Commits ahead: ${diff.aheadBy}`,
    `Commits behind: ${diff.behindBy}`,
    "",
    "Changed files:",
    changedFiles || "- (none)",
    "",
    "```diff",
    patch || "# No patch returned by GitHub.",
    "```",
  ].join("\n");
}

function renderTree(tree: ContextTree): string {
  const lines = tree.entries
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => `${entry.type === "tree" ? "DIR " : "FILE"} ${entry.path}`);
  return [
    "Context item: Repository tree",
    `Repository: \`${tree.repo}\``,
    `Ref: \`${tree.ref}\``,
    `Tree SHA: \`${tree.sha}\``,
    tree.truncated ? "Warning: GitHub truncated this tree response." : "",
    "",
    "```text",
    ...lines,
    "```",
  ].filter(Boolean).join("\n");
}

export function contextFileFromGitHub(file: FileContent): ContextFile {
  return {
    type: "file",
    source: {
      repo: `${file.repo.owner}/${file.repo.name}`,
      ref: file.ref,
    },
    repo: `${file.repo.owner}/${file.repo.name}`,
    ref: file.ref,
    path: file.path,
    language: file.language,
    content: file.content,
  };
}

export function contextTreeFromGitHub(tree: RepositoryTree): ContextTree {
  return {
    type: "tree",
    source: {
      repo: `${tree.repo.owner}/${tree.repo.name}`,
      ref: tree.ref,
    },
    repo: `${tree.repo.owner}/${tree.repo.name}`,
    ref: tree.ref,
    sha: tree.sha,
    truncated: tree.truncated,
    entries: tree.entries,
  };
}

export function contextDiffFromGitHub(diff: RepositoryDiff): ContextDiff {
  return {
    type: "diff",
    source: {
      repo: `${diff.repo.owner}/${diff.repo.name}`,
      ref: diff.head,
    },
    repo: `${diff.repo.owner}/${diff.repo.name}`,
    ref: diff.head,
    base: diff.base,
    head: diff.head,
    status: diff.status,
    aheadBy: diff.aheadBy,
    behindBy: diff.behindBy,
    totalCommits: diff.totalCommits,
    files: diff.files,
  };
}

export function getContextStats(
  items: ContextItem[],
  limits: ContextLimits = DEFAULT_CONTEXT_LIMITS,
): ContextStats {
  const warnings: string[] = [];
  const files = items.filter((item): item is ContextFile => item.type === "file");
  const diffs = items.filter((item): item is ContextDiff => item.type === "diff");
  const totalCharacters = files.reduce((total, file) => total + file.content.length, 0) +
    diffs.reduce((total, diff) => total + diff.files.reduce((sum, file) => sum + (file.patch?.length ?? 0), 0), 0);
  for (const diff of diffs) {
    const diffCharacters = diff.files.reduce((total, file) => total + (file.patch?.length ?? 0), 0);
    const warnDiffCharacters = limits.warnDiffCharacters ?? 40_000;
    if (diffCharacters > warnDiffCharacters) {
      warnings.push(`Diff ${diff.base}...${diff.head} 较大（${diffCharacters.toLocaleString()} 字符）。`);
    }
  }
  for (const file of files) {
    if (file.content.length > limits.warnFileCharacters) {
      warnings.push(`${file.path} 较大（${file.content.length.toLocaleString()} 字符）。`);
    }
  }

  let estimatedCharacters = totalCharacters;
  try {
    estimatedCharacters = renderContext(items).length;
  } catch {
    // The source total is still useful when a partially selected file is invalid.
  }

  return {
    itemCount: items.length,
    fileCount: files.length,
    totalCharacters,
    estimatedCharacters,
    warnings,
  };
}

export function validateContextItems(
  items: ContextItem[],
  limits: ContextLimits = DEFAULT_CONTEXT_LIMITS,
): void {
  const files = items.filter((item): item is ContextFile => item.type === "file");
  const diffs = items.filter((item): item is ContextDiff => item.type === "diff");
  if (items.length === 0) {
    throw new ContextBuildError("NO_FILES", "请至少选择一个上下文项。 ");
  }
  const maxItems = limits.maxItems ?? limits.maxFiles + 1;
  if (items.length > maxItems) {
    throw new ContextBuildError(
      "TOO_MANY_FILES",
      `最多只能同时附加 ${maxItems} 个上下文项。`,
    );
  }
  if (files.length > limits.maxFiles) {
    throw new ContextBuildError(
      "TOO_MANY_FILES",
      `最多只能同时附加 ${limits.maxFiles} 个文件。`,
    );
  }

  const maxDiffFiles = limits.maxDiffFiles ?? 50;
  const maxDiffCharacters = limits.maxDiffCharacters ?? 100_000;
  let totalCharacters = 0;
  for (const diff of diffs) {
    const diffCharacters = diff.files.reduce((total, file) => total + (file.patch?.length ?? 0), 0);
    if (diff.files.length > maxDiffFiles) {
      throw new ContextBuildError(
        "TOO_MANY_FILES",
        `比较结果包含 ${diff.files.length} 个文件，超过 Diff 上限 ${maxDiffFiles} 个。`,
      );
    }
    if (diffCharacters > maxDiffCharacters) {
      throw new ContextBuildError(
        "TOTAL_TOO_LARGE",
        `Diff 约 ${diffCharacters.toLocaleString()} 字符，超过限制 ${maxDiffCharacters.toLocaleString()}。`,
      );
    }
    totalCharacters += diffCharacters;
  }
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

  const estimatedCharacters = renderContext(items).length;
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
