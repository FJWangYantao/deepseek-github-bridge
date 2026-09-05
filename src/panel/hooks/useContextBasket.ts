import { useCallback, useRef, useState } from "react";
import {
  appendSelectedItem,
  contextItemKey,
} from "../selection";
import type { ContextItem } from "../../runtime/context-builder";

/**
 * Owns the ordered context selection independently from the GitHub browser.
 * The ref makes concurrent file reads append against the latest basket rather
 * than the render that started an async request.
 */
export function useContextBasket() {
  const [items, setItems] = useState<ContextItem[]>([]);
  const itemsRef = useRef<ContextItem[]>([]);

  const replaceItems = useCallback((nextItems: ContextItem[]) => {
    itemsRef.current = nextItems;
    setItems(nextItems);
  }, []);

  const addItem = useCallback((item: ContextItem) => {
    const nextItems = appendSelectedItem(itemsRef.current, item);
    replaceItems(nextItems);
    return nextItems;
  }, [replaceItems]);

  const removeItem = useCallback((item: ContextItem) => {
    const key = contextItemKey(item);
    replaceItems(itemsRef.current.filter((current) => contextItemKey(current) !== key));
  }, [replaceItems]);

  const moveItem = useCallback((item: ContextItem, direction: -1 | 1) => {
    const currentItems = [...itemsRef.current];
    const index = currentItems.findIndex((current) => contextItemKey(current) === contextItemKey(item));
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= currentItems.length) return;
    [currentItems[index], currentItems[nextIndex]] = [currentItems[nextIndex], currentItems[index]];
    replaceItems(currentItems);
  }, [replaceItems]);

  const clear = useCallback(() => {
    replaceItems([]);
  }, [replaceItems]);

  return {
    items,
    itemsRef,
    addItem,
    removeItem,
    moveItem,
    replaceItems,
    clear,
  };
}
