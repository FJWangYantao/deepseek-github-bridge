import { describe, expect, it } from "vitest";
import { appendSelectedItem, appendSelectedFile } from "../src/panel/selection";
import type { ContextDiff, ContextFile } from "../src/runtime/context-builder";

const contextFile = (path: string): ContextFile => ({
  type: "file",
  source: { repo: "octo/demo", ref: "main" },
  repo: "octo/demo",
  ref: "main",
  path,
  language: "ts",
  content: `export const ${path.replace(/\W/g, "_")} = true;`,
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

  it("keeps diffs with the same head but different bases distinct", () => {
    const mainDiff = contextDiff("main", "feature/foo");
    const releaseDiff = contextDiff("release", "feature/foo");

    expect(appendSelectedItem([mainDiff], releaseDiff)).toEqual([mainDiff, releaseDiff]);
    expect(appendSelectedItem([mainDiff], contextDiff("main", "feature/foo"))).toEqual([mainDiff]);
  });
});
