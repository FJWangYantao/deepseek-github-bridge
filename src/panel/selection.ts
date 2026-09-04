import {
  type ContextItem,
  validateContextItems,
} from "../runtime/context-builder";

export function appendSelectedItem(
  items: ContextItem[],
  contextItem: ContextItem,
): ContextItem[] {
  if (
    contextItem.type === "tree" &&
    items.some(
      (item) =>
        item.type === "tree" &&
        item.repo === contextItem.repo &&
        item.ref === contextItem.ref,
    )
  ) {
    return items;
  }
  if (
    contextItem.type === "diff" &&
    items.some(
      (item) =>
        item.type === "diff" &&
        item.repo === contextItem.repo &&
        item.base === contextItem.base &&
        item.head === contextItem.head,
    )
  ) {
    return items;
  }
  if (
    contextItem.type === "file" &&
    items.some(
      (item) =>
        item.type === "file" &&
        item.repo === contextItem.repo &&
        item.ref === contextItem.ref &&
        item.path === contextItem.path,
    )
  ) {
    return items;
  }

  const nextItems = [...items, contextItem];
  validateContextItems(nextItems);
  return nextItems;
}

export function appendSelectedFile(
  files: ContextItem[],
  contextFile: ContextItem,
): ContextItem[] {
  return appendSelectedItem(files, contextFile);
}
