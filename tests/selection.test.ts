import { describe, expect, it } from "vitest";
import { appendSelectedFile } from "../src/panel/selection";
import type { ContextFile } from "../src/runtime/context-builder";

const contextFile = (path: string): ContextFile => ({
  repo: "octo/demo",
  ref: "main",
  path,
  language: "ts",
  content: `export const ${path.replace(/\W/g, "_")} = true;`,
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
});
