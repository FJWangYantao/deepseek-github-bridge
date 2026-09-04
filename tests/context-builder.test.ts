import { describe, expect, it } from "vitest";
import {
  buildContext,
  ContextBuildError,
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

