import { describe, expect, it, vi } from "vitest";
import { GitHubClient } from "../src/github/client";

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("GitHubClient", () => {
  it("calls the fetch implementation without binding the client as this", async () => {
    const fetchMock = vi.fn(function (this: unknown, input: RequestInfo | URL) {
      expect(this).toBe(globalThis);
      return Promise.resolve(
        response({
          login: "octo",
          avatar_url: "https://avatars.example/octo.png",
          html_url: "https://github.com/octo",
          name: "Octo",
        }),
      );
    });
    const client = new GitHubClient(
      { getToken: async () => "test-token" },
      fetchMock as typeof fetch,
    );

    await expect(client.getViewer()).resolves.toMatchObject({ login: "octo" });
  });

  it("maps repository data and keeps requests behind the client", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("/user/repos");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
      return response([
        {
          id: 1,
          full_name: "octo/demo",
          private: false,
          default_branch: "main",
          description: null,
          html_url: "https://github.com/octo/demo",
          owner: { login: "octo" },
        },
      ]);
    });
    const client = new GitHubClient({ getToken: async () => "test-token" }, fetchMock as typeof fetch);

    await expect(client.listRepositories()).resolves.toEqual([
      expect.objectContaining({ fullName: "octo/demo", defaultBranch: "main" }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("paginates branches so later pages are not omitted", async () => {
    const requests: string[] = [];
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      name: `branch-${index}`,
      protected: false,
    }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      return new URL(url).searchParams.get("page") === "1"
        ? response(firstPage)
        : response([{ name: "main", protected: true }]);
    });
    const client = new GitHubClient(
      { getToken: async () => "test-token" },
      fetchMock as typeof fetch,
    );

    await expect(client.listBranches({ owner: "octo", name: "demo" })).resolves.toHaveLength(101);
    expect(requests).toEqual([
      expect.stringContaining("/repos/octo/demo/branches?per_page=100&page=1"),
      expect.stringContaining("/repos/octo/demo/branches?per_page=100&page=2"),
    ]);
  });

  it("maps the recursive repository tree response", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/git/trees/main?recursive=1");
      return response({
        sha: "tree-sha",
        truncated: false,
        tree: [
          { path: "src", mode: "040000", type: "tree", sha: "dir-sha" },
          { path: "src/index.ts", mode: "100644", type: "blob", sha: "file-sha", size: 12 },
        ],
      });
    });
    const client = new GitHubClient({ getToken: async () => "test-token" }, fetchMock as typeof fetch);

    await expect(client.getTree({ repo: { owner: "octo", name: "demo" }, ref: "main" })).resolves.toMatchObject({
      sha: "tree-sha",
      entries: expect.arrayContaining([
        expect.objectContaining({ path: "src/index.ts", type: "blob" }),
      ]),
    });
  });

  it("maps branch comparison results and preserves omitted patches", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/repos/octo/demo/compare/main...feature%2Ffoo");
      return response({
        status: "ahead",
        ahead_by: 2,
        behind_by: 0,
        total_commits: 2,
        files: [
          { filename: "src/new.ts", status: "added", additions: 4, deletions: 0, changes: 4, patch: "@@ -0,0 +1,4 @@" },
          { filename: "assets/bundle.js", status: "modified", additions: 12, deletions: 3, changes: 15 },
          { filename: "src/old.ts", previous_filename: "src/renamed.ts", status: "renamed", additions: 1, deletions: 1, changes: 2, patch: "@@" },
        ],
      });
    });
    const client = new GitHubClient({ getToken: async () => "test-token" }, fetchMock as typeof fetch);

    await expect(client.compareRefs({ repo: { owner: "octo", name: "demo" }, base: "main", head: "feature/foo" })).resolves.toEqual({
      repo: { owner: "octo", name: "demo" },
      base: "main",
      head: "feature/foo",
      status: "ahead",
      aheadBy: 2,
      behindBy: 0,
      totalCommits: 2,
      files: [
        { path: "src/new.ts", status: "added", additions: 4, deletions: 0, changes: 4, patch: "@@ -0,0 +1,4 @@" },
        { path: "assets/bundle.js", status: "modified", additions: 12, deletions: 3, changes: 15 },
        { path: "src/old.ts", previousPath: "src/renamed.ts", status: "renamed", additions: 1, deletions: 1, changes: 2, patch: "@@" },
      ],
    });
    await expect(client.compareRefs({ repo: { owner: "octo", name: "demo" }, base: "main", head: "main" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("maps code search results and rejects an empty query", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/search/code?q=");
      return response({
        total_count: 1,
        incomplete_results: false,
        items: [{
          name: "auth.ts",
          path: "src/github/auth.ts",
          sha: "file-sha",
          html_url: "https://github.com/octo/demo/blob/main/src/github/auth.ts",
          repository: { full_name: "octo/demo" },
          text_matches: [{ fragment: "getToken", matches: [{ text: "getToken", indices: [0, 8] }] }],
        }],
      });
    });
    const client = new GitHubClient({ getToken: async () => "test-token" }, fetchMock as typeof fetch);

    await expect(client.searchCode({ repo: { owner: "octo", name: "demo" }, query: "auth" })).resolves.toEqual([
      expect.objectContaining({ path: "src/github/auth.ts", repositoryFullName: "octo/demo" }),
    ]);
    await expect(client.searchCode({ repo: { owner: "octo", name: "demo" }, query: " " })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("normalizes authentication failures", async () => {
    const client = new GitHubClient(
      { getToken: async () => "bad-token" },
      (async () => response({ message: "Bad credentials" }, 401)) as typeof fetch,
    );

    await expect(client.listRepositories()).rejects.toMatchObject({
      code: "AUTH_INVALID",
      status: 401,
    });
  });

  it("decodes UTF-8 source files and rejects directories", async () => {
    const encoded = btoa(unescape(encodeURIComponent("你好\n")));
    const client = new GitHubClient(
      { getToken: async () => "test-token" },
      (async (input: RequestInfo | URL) => {
        if (String(input).includes("contents/src/index.ts")) {
          return response({ type: "file", path: "src/index.ts", sha: "abc", size: 7, encoding: "base64", content: encoded });
        }
        return response([]);
      }) as typeof fetch,
    );

    await expect(client.readFile({ repo: { owner: "octo", name: "demo" }, path: "src/index.ts", ref: "main" })).resolves.toMatchObject({
      content: "你好\n",
      language: "ts",
    });
  });
});
