import { GITHUB_API_BASE, GITHUB_API_VERSION } from "../shared/constants";
import type {
  Branch,
  CommitAuthor,
  CompareRefsInput,
  CodeSearchResult,
  DiffFile,
  DiffFileStatus,
  FileContent,
  GetCommitInput,
  GetTreeInput,
  GitHubUser,
  ListDirectoryInput,
  ReadFileInput,
  RepoRef,
  Repository,
  RepositoryCommit,
  RepositoryDiff,
  RepositoryTree,
  SearchCodeInput,
  TreeEntry,
} from "../shared/types";
import { BridgeOperationError, GitHubApiError } from "./errors";
import type { AuthTokenProvider } from "./auth";

interface GitHubRepositoryResponse {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  html_url: string;
  owner: { login: string };
}

interface GitHubBranchResponse {
  name: string;
  protected: boolean;
}

interface GitHubTreeResponse {
  sha: string;
  truncated: boolean;
  tree: Array<{
    path: string;
    mode: string;
    type: string;
    sha: string;
    size?: number;
    url?: string;
  }>;
}

interface GitHubCommitResponse {
  sha: string;
  commit: {
    message: string;
    author?: { name?: string; email?: string; date?: string } | null;
    committer?: { name?: string; email?: string; date?: string } | null;
  };
  parents?: Array<{ sha: string }>;
  stats?: { additions?: number; deletions?: number; total?: number };
  files?: Array<{
    filename: string;
    previous_filename?: string;
    status: string;
    additions?: number;
    deletions?: number;
    changes?: number;
    patch?: string;
  }>;
}

interface GitHubCompareResponse {
  status: string;
  ahead_by: number;
  behind_by: number;
  total_commits: number;
  files?: Array<{
    filename: string;
    previous_filename?: string;
    status: string;
    additions?: number;
    deletions?: number;
    changes?: number;
    patch?: string;
  }>;
}

interface GitHubCodeSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: Array<{
    name: string;
    path: string;
    sha: string;
    html_url: string;
    repository: { full_name: string };
    text_matches?: Array<{
      fragment: string;
      matches: Array<{ text: string; indices: number[] }>;
    }>;
  }>;
}

interface GitHubContentResponse {
  type: string;
  name: string;
  path: string;
  sha: string;
  size?: number;
  html_url?: string;
  encoding?: string;
  content?: string;
}

interface GitHubUserResponse {
  login: string;
  avatar_url: string;
  html_url: string;
  name: string | null;
}

export class GitHubClient {
  constructor(
    private readonly auth: AuthTokenProvider,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getViewer(tokenOverride?: string): Promise<GitHubUser> {
    const data = await this.request<GitHubUserResponse>("/user", {}, tokenOverride);
    return {
      login: data.login,
      avatarUrl: data.avatar_url,
      htmlUrl: data.html_url,
      name: data.name,
    };
  }

  async listRepositories(): Promise<Repository[]> {
    const repositories: Repository[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const data = await this.request<GitHubRepositoryResponse[]>(
        `/user/repos?per_page=100&page=${page}&sort=updated&direction=desc`,
      );
      repositories.push(...data.map(mapRepository));
      if (data.length < 100) break;
    }
    return repositories;
  }

  async listBranches(repo: RepoRef): Promise<Branch[]> {
    const owner = encodeSegment(repo.owner);
    const name = encodeSegment(repo.name);
    const branches: Branch[] = [];

    for (let page = 1; ; page += 1) {
      const data = await this.request<GitHubBranchResponse[]>(
        `/repos/${owner}/${name}/branches?per_page=100&page=${page}`,
      );
      branches.push(
        ...data.map((branch) => ({
          name: branch.name,
          protected: branch.protected,
        })),
      );
      if (data.length < 100) break;
    }

    return branches;
  }

  async getTree(input: GetTreeInput): Promise<RepositoryTree> {
    const owner = encodeSegment(input.repo.owner);
    const name = encodeSegment(input.repo.name);
    const ref = encodeURIComponent(input.ref);
    const data = await this.request<GitHubTreeResponse>(
      `/repos/${owner}/${name}/git/trees/${ref}?recursive=1`,
    );
    if (!Array.isArray(data.tree) || typeof data.sha !== "string") {
      throw new GitHubApiError("INVALID_RESPONSE", "GitHub 返回的仓库树数据格式不正确。");
    }

    return {
      repo: input.repo,
      ref: input.ref,
      sha: data.sha,
      truncated: Boolean(data.truncated),
      entries: data.tree
        .filter((entry) => entry.type === "blob" || entry.type === "tree")
        .map((entry) => ({
          path: entry.path,
          mode: entry.mode,
          type: entry.type as "blob" | "tree",
          sha: entry.sha,
          ...(entry.size === undefined ? {} : { size: entry.size }),
          ...(entry.url === undefined ? {} : { url: entry.url }),
        })),
    };
  }

  async getCommit(input: GetCommitInput): Promise<RepositoryCommit> {
    const sha = input.sha.trim();
    if (!sha) {
      throw new GitHubApiError("VALIDATION_FAILED", "请输入 Commit SHA。 ");
    }
    const owner = encodeSegment(input.repo.owner);
    const name = encodeSegment(input.repo.name);
    const data = await this.request<GitHubCommitResponse>(
      `/repos/${owner}/${name}/commits/${encodeURIComponent(sha)}`,
    );
    if (
      typeof data.sha !== "string" ||
      !data.commit ||
      typeof data.commit.message !== "string" ||
      (data.files !== undefined && !Array.isArray(data.files))
    ) {
      throw new GitHubApiError("INVALID_RESPONSE", "GitHub 返回的提交数据格式不正确。 ");
    }
    const files = (data.files ?? []).map((file) => ({
      path: file.filename,
      status: normalizeDiffStatus(file.status),
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
      changes: file.changes ?? (file.additions ?? 0) + (file.deletions ?? 0),
      ...(file.patch === undefined ? {} : { patch: file.patch }),
      ...(file.previous_filename === undefined ? {} : { previousPath: file.previous_filename }),
    }));
    return {
      repo: input.repo,
      sha: data.sha,
      shortSha: data.sha.slice(0, 7),
      message: data.commit.message,
      author: mapCommitAuthor(data.commit.author),
      committer: mapCommitAuthor(data.commit.committer),
      parents: (data.parents ?? []).map((parent) => parent.sha).filter(Boolean),
      files,
      additions: data.stats?.additions ?? files.reduce((total, file) => total + file.additions, 0),
      deletions: data.stats?.deletions ?? files.reduce((total, file) => total + file.deletions, 0),
      changedFiles: data.stats?.total ?? files.length,
    };
  }

  async compareRefs(input: CompareRefsInput): Promise<RepositoryDiff> {
    const base = input.base.trim();
    const head = input.head.trim();
    if (!base || !head || base === head) {
      throw new GitHubApiError(
        "VALIDATION_FAILED",
        "请选择两个不同的分支进行比较。",
      );
    }

    const owner = encodeSegment(input.repo.owner);
    const name = encodeSegment(input.repo.name);
    const comparison = `${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
    const data = await this.request<GitHubCompareResponse>(
      `/repos/${owner}/${name}/compare/${comparison}`,
    );
    if (
      typeof data.status !== "string" ||
      typeof data.ahead_by !== "number" ||
      typeof data.behind_by !== "number" ||
      typeof data.total_commits !== "number" ||
      (data.files !== undefined && !Array.isArray(data.files))
    ) {
      throw new GitHubApiError("INVALID_RESPONSE", "GitHub 返回的比较数据格式不正确。");
    }
    if ((data.files?.length ?? 0) > 50) {
      throw new GitHubApiError("DIFF_TOO_LARGE", "比较结果超过 50 个文件，已拒绝加载。 ");
    }

    return {
      repo: input.repo,
      base,
      head,
      status: data.status,
      aheadBy: data.ahead_by,
      behindBy: data.behind_by,
      totalCommits: data.total_commits,
      files: (data.files ?? []).map((file) => ({
        path: file.filename,
        status: normalizeDiffStatus(file.status),
        additions: file.additions ?? 0,
        deletions: file.deletions ?? 0,
        changes: file.changes ?? (file.additions ?? 0) + (file.deletions ?? 0),
        ...(file.patch === undefined ? {} : { patch: file.patch }),
        ...(file.previous_filename === undefined ? {} : { previousPath: file.previous_filename }),
      })),
    };
  }

  async searchCode(input: SearchCodeInput): Promise<CodeSearchResult[]> {
    const query = input.query.trim();
    if (!query) {
      throw new GitHubApiError("VALIDATION_FAILED", "请输入要搜索的代码关键词。");
    }
    const search = encodeURIComponent(`${query} repo:${input.repo.owner}/${input.repo.name}`);
    const data = await this.request<GitHubCodeSearchResponse>(
      `/search/code?q=${search}&per_page=50`,
      { headers: { Accept: "application/vnd.github.text-match+json" } },
    );
    if (!Array.isArray(data.items)) {
      throw new GitHubApiError("INVALID_RESPONSE", "GitHub 返回的代码搜索数据格式不正确。");
    }
    return data.items.map((item) => ({
      name: item.name,
      path: item.path,
      sha: item.sha,
      htmlUrl: item.html_url,
      repositoryFullName: item.repository.full_name,
      textMatches: item.text_matches ?? [],
    }));
  }

  async listDirectory(input: ListDirectoryInput): Promise<TreeEntry[]> {
    const endpoint = contentsEndpoint(input.repo, input.path, input.ref);
    const data = await this.request<GitHubContentResponse | GitHubContentResponse[]>(endpoint);
    if (!Array.isArray(data)) {
      throw new GitHubApiError("INVALID_RESPONSE", "GitHub 返回的目录数据格式不正确。");
    }
    return data
      .map((entry) => ({
        name: entry.name,
        path: entry.path,
        type: normalizeEntryType(entry.type),
        ...(entry.size === undefined ? {} : { size: entry.size }),
        sha: entry.sha,
        htmlUrl: entry.html_url ?? "",
      }))
      .sort((left, right) => {
        if (left.type === "dir" && right.type !== "dir") return -1;
        if (left.type !== "dir" && right.type === "dir") return 1;
        return left.name.localeCompare(right.name);
      });
  }

  async readFile(input: ReadFileInput): Promise<FileContent> {
    const endpoint = contentsEndpoint(input.repo, input.path, input.ref);
    const data = await this.request<GitHubContentResponse | GitHubContentResponse[]>(endpoint);
    if (Array.isArray(data) || data.type !== "file" || data.content === undefined) {
      throw new GitHubApiError("INVALID_RESPONSE", "GitHub 返回的文件数据格式不正确。");
    }

    if ((data.size ?? 0) > 1_000_000) {
      throw new GitHubApiError(
        "FILE_TOO_LARGE",
        "文件超过 1 MB，已拒绝读取以保护浏览器和对话上下文。",
      );
    }

    if (data.encoding !== "base64") {
      throw new GitHubApiError("INVALID_RESPONSE", "GitHub 未返回可读取的 Base64 文件内容。");
    }

    const content = decodeBase64Utf8(data.content);
    if (isLikelyBinary(content)) {
      throw new GitHubApiError("BINARY_FILE", "该文件看起来是二进制文件，未添加到上下文。 ");
    }

    return {
      repo: input.repo,
      ref: input.ref,
      path: input.path,
      sha: data.sha,
      size: data.size ?? new TextEncoder().encode(content).byteLength,
      content,
      language: languageFromPath(input.path),
    };
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    tokenOverride?: string,
  ): Promise<T> {
    const token = tokenOverride ?? (await this.auth.getToken());
    if (!token) {
      throw new GitHubApiError("AUTH_REQUIRED", "请先连接 GitHub。", { status: 401 });
    }

    let response: Response;
    try {
      // WorkerGlobalScope.fetch is brand-checked. Calling it as
      // `this.fetchImpl(...)` would bind `this` to GitHubClient and throw
      // "Illegal invocation" in Chrome's extension service worker.
      response = await this.fetchImpl.call(globalThis, `${GITHUB_API_BASE}${path}`, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      // Keep the token out of diagnostics while preserving the browser-level
      // failure that is otherwise indistinguishable from an API 401/403.
      console.error("[GitHubClient] request failed", {
        path,
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
      });
      throw new GitHubApiError(
        "NETWORK_ERROR",
        `无法连接 GitHub API（${path}），请检查网络、扩展权限或代理设置后重试。`,
      );
    }

    const body = await readJsonSafely(response);
    if (!response.ok) {
      throw mapApiError(response, body);
    }

    return body as T;
  }
}

function mapRepository(repository: GitHubRepositoryResponse): Repository {
  const [owner, ...nameParts] = repository.full_name.split("/");
  const name = nameParts.join("/");
  if (!owner || !name) {
    throw new BridgeOperationError("INVALID_RESPONSE", "GitHub 返回了无效的仓库名称。 ");
  }
  return {
    id: repository.id,
    owner,
    name,
    fullName: repository.full_name,
    private: repository.private,
    defaultBranch: repository.default_branch,
    description: repository.description,
    htmlUrl: repository.html_url,
    ownerLogin: repository.owner.login,
  };
}

function contentsEndpoint(repo: RepoRef, path: string, ref: string): string {
  const owner = encodeSegment(repo.owner);
  const name = encodeSegment(repo.name);
  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map(encodeSegment)
    .join("/");
  const suffix = encodedPath ? `/${encodedPath}` : "";
  return `/repos/${owner}/${name}/contents${suffix}?ref=${encodeURIComponent(ref)}`;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function mapCommitAuthor(author?: { name?: string; email?: string; date?: string } | null): CommitAuthor | null {
  if (!author?.name || !author.date) return null;
  return {
    name: author.name,
    ...(author.email === undefined ? {} : { email: author.email }),
    date: author.date,
  };
}

function normalizeDiffStatus(status: string): DiffFileStatus {
  if (status === "added" || status === "modified" || status === "removed" || status === "renamed") {
    return status;
  }
  return "modified";
}

function normalizeEntryType(type: string): TreeEntry["type"] {
  if (type === "dir" || type === "file" || type === "symlink" || type === "submodule") {
    return type;
  }
  return "file";
}

async function readJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GitHubApiError("INVALID_RESPONSE", "GitHub 返回了无法解析的数据。", {
      status: response.status,
    });
  }
}

function mapApiError(response: Response, body: unknown): GitHubApiError {
  const message =
    isRecord(body) && typeof body.message === "string"
      ? body.message
      : `GitHub API 请求失败（HTTP ${response.status}）。`;
  const remaining = response.headers.get("x-ratelimit-remaining");
  const retryAfter = parseRetryAfter(response.headers.get("retry-after"));

  if (response.status === 401) {
    return new GitHubApiError("AUTH_INVALID", "GitHub Token 无效或已过期，请重新连接。", {
      status: response.status,
    });
  }
  if (response.status === 403 && (remaining === "0" || /rate limit/i.test(message))) {
    return new GitHubApiError("RATE_LIMITED", "GitHub API 已限流，请稍后重试。", {
      status: response.status,
      retryAfterSeconds: retryAfter,
    });
  }
  if (response.status === 404) {
    return new GitHubApiError("NOT_FOUND", "仓库、分支或文件不存在，或当前 Token 无权访问。", {
      status: response.status,
    });
  }
  if (response.status === 403) {
    return new GitHubApiError("FORBIDDEN", "GitHub 拒绝了这次请求，请检查 Token 权限。", {
      status: response.status,
    });
  }
  if (response.status === 422) {
    return new GitHubApiError("VALIDATION_FAILED", message, { status: response.status });
  }
  return new GitHubApiError("UNKNOWN", message, { status: response.status });
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

function decodeBase64Utf8(value: string): string {
  try {
    const bytes = Uint8Array.from(atob(value.replace(/\s/g, "")), (character) =>
      character.charCodeAt(0),
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new GitHubApiError("BINARY_FILE", "该文件不是有效的 UTF-8 文本文件。 ");
  }
}

function isLikelyBinary(value: string): boolean {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
