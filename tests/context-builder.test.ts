import { describe, expect, it } from "vitest";
import {
  buildContext,
  ContextBuildError,
  getContextStats,
  type ContextFile,
} from "../src/runtime/context-builder";

const file = (overrides: Partial<ContextFile> = {}): ContextFile => ({
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

  it("reports useful size statistics and warnings", () => {
    const result = getContextStats([file({ content: "x".repeat(60) })], {
      maxFiles: 12,
      warnFileCharacters: 50,
      maxFileCharacters: 80,
      maxTotalCharacters: 120,
    });
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

