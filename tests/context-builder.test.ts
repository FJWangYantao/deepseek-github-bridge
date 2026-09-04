import { describe, expect, it } from "vitest";
import {
  buildContext,
  ContextBuildError,
  contextCommitFromGitHub,
  contextDiffFromGitHub,
  contextTreeFromGitHub,
  getContextStats,
  type ContextFile,
} from "../src/runtime/context-builder";

const file = (overrides: Partial<ContextFile> = {}): ContextFile => ({
  type: "file",
  source: { repo: "octo/demo", ref: "main" },
  repo: "octo/demo",
  ref: "main",
  path: "src/index.ts",
  language: "ts",
  content: "export const answer = 42;",
  ...overrides,
});

describe("buildContext", () => {
  it("builds deterministic Markdown while retaining metadata and source text", () => {
    const result = buildContext([
      file(),
      file({ path: "README.md", language: "markdown", content: "# Demo" }),
    ]);

    expect(result).toContain("repository `octo/demo`");
    expect(result).toContain("File: `octo/demo/src/index.ts`");
    expect(result).toContain("```ts");
    expect(result).toContain("export const answer = 42;");
    expect(result).toContain("```markdown");
  });

  it("chooses a fence longer than backticks inside source", () => {
    const result = buildContext([file({ content: "const snippet = ```;" })]);
    expect(result).toContain("````ts");
  });

  it("renders a repository tree alongside selected files", () => {
    const tree = contextTreeFromGitHub({
      repo: { owner: "octo", name: "demo" },
      ref: "main",
      sha: "tree-sha",
      truncated: false,
      entries: [
        { path: "src/index.ts", mode: "100644", type: "blob", sha: "file-sha" },
        { path: "src", mode: "040000", type: "tree", sha: "dir-sha" },
      ],
    });

    const result = buildContext([tree, file()]);
    expect(result).toContain("Context item: Repository tree");
    expect(result).toContain("FILE src/index.ts");
    expect(result).toContain("Context item: File");
  });

  it("renders a branch diff with metadata and an omitted patch marker", () => {
    const result = buildContext([contextDiffFromGitHub({
      repo: { owner: "octo", name: "demo" },
      base: "main",
      head: "feature/foo",
      status: "ahead",
      aheadBy: 2,
      behindBy: 0,
      totalCommits: 2,
      files: [
        { path: "src/index.ts", status: "modified", additions: 3, deletions: 1, changes: 4, patch: "@@ -1 +1 @@" },
        { path: "assets/app.js", status: "modified", additions: 20, deletions: 5, changes: 25 },
      ],
    })]);
    expect(result).toContain("Context item: Git diff");
    expect(result).toContain("Base: `main`");
    expect(result).toContain("Files changed: 2");
    expect(result).toContain("Patch omitted by GitHub");
    expect(result).toContain("```diff");
  });

  it("renders commit intent, metadata, parents, files, and diff", () => {
    const result = buildContext([contextCommitFromGitHub({
      repo: { owner: "octo", name: "demo" },
      sha: "abc1234567890",
      shortSha: "abc1234",
      message: "fix: race condition",
      author: { name: "Octo", date: "2026-01-01T00:00:00Z" },
      committer: null,
      parents: ["parent-1", "parent-2"],
      additions: 5,
      deletions: 2,
      changedFiles: 1,
      files: [{ path: "src/app.ts", status: "modified", additions: 5, deletions: 2, changes: 7, patch: "@@" }],
    })]);
    expect(result).toContain("Context item: Git commit");
    expect(result).toContain("Commit: `abc1234567890`");
    expect(result).toContain("fix: race condition");
    expect(result).toContain("- parent-1");
    expect(result).toContain("modified src/app.ts");
    expect(result).toContain("```diff");
  });

  it("uses a longer fence when a patch contains backticks", () => {
    const result = buildContext([contextDiffFromGitHub({
      repo: { owner: "octo", name: "demo" },
      base: "main",
      head: "docs",
      status: "ahead",
      aheadBy: 1,
      behindBy: 0,
      totalCommits: 1,
      files: [{ path: "README.md", status: "modified", additions: 2, deletions: 0, changes: 2, patch: "+```ts\n+const value = 1;\n+```" }],
    })]);
    expect(result).toContain("````diff");
  });

  it("reports useful size statistics and warnings", () => {
    const result = getContextStats([file({ content: "x".repeat(60) })], {
      maxFiles: 12,
      warnFileCharacters: 50,
      maxFileCharacters: 80,
      maxTotalCharacters: 120,
    });
    expect(result.itemCount).toBe(1);
    expect(result.fileCount).toBe(1);
    expect(result.totalCharacters).toBe(60);
    expect(result.estimatedCharacters).toBeGreaterThan(60);
    expect(result.warnings).toHaveLength(1);
  });

  it("rejects binary-looking and oversized input", () => {
    expect(() => buildContext([file({ content: "text\u0000bytes" })])).toThrow(ContextBuildError);
    expect(() => buildContext([file({ content: "x".repeat(81) })], {
      maxFiles: 12,
      warnFileCharacters: 50,
      maxFileCharacters: 80,
      maxTotalCharacters: 120,
    })).toThrow(/单文件/);
  });
});

