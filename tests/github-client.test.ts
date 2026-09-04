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
