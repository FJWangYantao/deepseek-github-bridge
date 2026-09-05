import { describe, expect, it } from "vitest";
import { appendSelectedItem, contextItemKey } from "../src/panel/selection";
import type { ContextFile } from "../src/runtime/context-builder";

const file = (path: string): ContextFile => ({
  type: "file",
  source: { repo: "octo/demo", ref: "main" },
  repo: "octo/demo",
  ref: "main",
  path,
  language: "ts",
  content: path,
});

describe("context basket primitives", () => {
  it("keeps context order while deduplicating by stable identity", () => {
    const first = file("src/one.ts");
    const second = file("src/two.ts");
    expect(appendSelectedItem([], first)).toEqual([first]);
    expect(appendSelectedItem([first], second)).toEqual([first, second]);
    expect(appendSelectedItem([first, second], { ...first, content: "newer" })).toEqual([first, second]);
    expect(contextItemKey(first)).toBe("file:octo/demo:main:src/one.ts");
  });
});
