import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { contextItemKey } from "../src/panel/selection";
import { useContextBasket } from "../src/panel/hooks/useContextBasket";
import type { ContextFile } from "../src/runtime/context-builder";

type Basket = ReturnType<typeof useContextBasket>;

const file = (path: string): ContextFile => ({
  type: "file",
  source: { repo: "octo/demo", ref: "main" },
  repo: "octo/demo",
  ref: "main",
  path,
  sha: `sha-${path}`,
  language: "ts",
  content: path,
});

function mountBasket(): { current: Basket; unmount: () => void } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let current: Basket | undefined;
  function Harness() {
    current = useContextBasket();
    return null;
  }
  const root = createRoot(host);
  act(() => root.render(createElement(Harness)));
  return {
    get current() {
      if (!current) throw new Error("Basket did not mount");
      return current;
    },
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("useContextBasket", () => {
  it("adds items in order, removes them, and moves them", () => {
    const basket = mountBasket();
    const first = file("src/one.ts");
    const second = file("src/two.ts");

    act(() => {
      basket.current.addItem(first);
      basket.current.addItem(second);
    });
    expect(basket.current.items.map((item) => item.type === "file" ? item.path : item.type)).toEqual(["src/one.ts", "src/two.ts"]);

    act(() => basket.current.moveItem(second, -1));
    expect(basket.current.items.map((item) => item.type === "file" ? item.path : item.type)).toEqual(["src/two.ts", "src/one.ts"]);

    act(() => basket.current.removeItem(second));
    expect(basket.current.items).toEqual([first]);
    basket.unmount();
  });

  it("clears the basket and replaces duplicate identities with upsert", () => {
    const basket = mountBasket();
    const original = file("src/one.ts");
    const updated = { ...original, content: "updated" };

    act(() => {
      basket.current.addItem(original);
      basket.current.upsertItem(updated);
    });
    expect(basket.current.items).toHaveLength(1);
    expect(basket.current.items[0]).toBe(updated);
    expect(contextItemKey(basket.current.items[0])).toBe("file:octo/demo:main:src/one.ts:*");

    act(() => basket.current.clear());
    expect(basket.current.items).toEqual([]);
    expect(basket.current.itemsRef.current).toEqual([]);
    basket.unmount();
  });
});
