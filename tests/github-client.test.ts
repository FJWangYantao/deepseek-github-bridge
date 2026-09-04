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
