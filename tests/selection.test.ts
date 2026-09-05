import { describe, expect, it } from "vitest";
import { appendSelectedItem, appendSelectedFile, contextItemKey } from "../src/panel/selection";
import type { ContextCommit, ContextDiff, ContextFile } from "../src/runtime/context-builder";

const contextFile = (path: string, range?: { startLine: number; endLine: number }): ContextFile => ({
  type: "file",
  source: { repo: "octo/demo", ref: "main" },
  repo: "octo/demo",
  ref: "main",
  path,
  sha: `sha-${path}`,
  language: "ts",
  ...(range ?? {}),
  content: `export const ${path.replace(/\W/g, "_")} = true;`,
});

const contextCommit = (repo: string, sha: string): ContextCommit => ({
  type: "commit",
  source: { repo, ref: sha },
  repo,
  ref: sha,
  sha,
  shortSha: sha.slice(0, 7),
  message: "fix",
  parents: [],
  files: [],
  additions: 0,
  deletions: 0,
  changedFiles: 0,
});

const contextDiff = (base: string, head: string): ContextDiff => ({
  type: "diff",
  source: { repo: "octo/demo", ref: head },
  repo: "octo/demo",
  ref: head,
  base,
  head,
  status: "ahead",
  aheadBy: 1,
  behindBy: 0,
  totalCommits: 1,
  files: [],
});

describe("appendSelectedFile", () => {
  it("appends a result to the latest selection", () => {
    const first = [contextFile("src/first.ts")];
    const second = contextFile("src/second.ts");

    expect(appendSelectedFile(first, second)).toEqual([first[0], second]);
  });

  it("does not duplicate a file when a result is committed twice", () => {
    const first = contextFile("src/first.ts");

    expect(appendSelectedFile([first], first)).toEqual([first]);
  });

  it("includes a file line range in its identity", () => {
    const first = contextFile("src/app.ts", { startLine: 20, endLine: 45 });
    const second = contextFile("src/app.ts", { startLine: 80, endLine: 110 });
    expect(contextItemKey(first)).toBe("file:octo/demo:main:src/app.ts:20-45");
    expect(appendSelectedItem([first], second)).toEqual([first, second]);
  });

  it("uses stable keys and deduplicates commits", () => {
    const commit = contextCommit("octo/demo", "abc1234567890");
    expect(contextItemKey(commit)).toBe("commit:octo/demo:abc1234567890");
    expect(appendSelectedItem([commit], contextCommit("octo/demo", "abc1234567890"))).toEqual([commit]);
    expect(appendSelectedItem([commit], contextCommit("other/demo", "abc1234567890"))).toEqual([commit, contextCommit("other/demo", "abc1234567890")]);
  });

  it("deduplicates pull requests by repository and number", () => {
    const pullRequest = {
      type: "pull_request" as const,
      source: { repo: "octo/demo", ref: "feature/context" },
      repo: "octo/demo", ref: "feature/context", number: 12, title: "feat", state: "open" as const,
      draft: false, base: "main", head: "feature/context", commits: 1, additions: 1, deletions: 0,
      changedFiles: 1, files: [],
    };
    expect(contextItemKey(pullRequest)).toBe("pr:octo/demo:12");
    expect(appendSelectedItem([pullRequest], { ...pullRequest })).toEqual([pullRequest]);
    expect(appendSelectedItem([pullRequest], { ...pullRequest, repo: "other/demo", source: { ...pullRequest.source, repo: "other/demo" } })).toHaveLength(2);
  });

  it("keeps diffs with the same head but different bases distinct", () => {
    const mainDiff = contextDiff("main", "feature/foo");
    const releaseDiff = contextDiff("release", "feature/foo");

    expect(appendSelectedItem([mainDiff], releaseDiff)).toEqual([mainDiff, releaseDiff]);
    expect(appendSelectedItem([mainDiff], contextDiff("main", "feature/foo"))).toEqual([mainDiff]);
  });
});
