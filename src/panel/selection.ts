import {
  type ContextItem,
  validateContextItems,
} from "../runtime/context-builder";

export function appendSelectedItem(
  items: ContextItem[],
  contextItem: ContextItem,
): ContextItem[] {
  if (
    items.some(
      (item) =>
        item.type === contextItem.type &&
        item.repo === contextItem.repo &&
        item.ref === contextItem.ref,
    ) && contextItem.type === "tree"
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
