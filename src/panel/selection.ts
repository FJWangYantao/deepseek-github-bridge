import {
  type ContextItem,
  validateContextItems,
} from "../runtime/context-builder";

export function contextItemKey(item: ContextItem): string {
  switch (item.type) {
    case "file":
      return `file:${item.repo}:${item.ref}:${item.path}:${item.startLine === undefined || item.endLine === undefined ? "*" : `${item.startLine}-${item.endLine}`}`;
    case "tree":
      return `tree:${item.repo}:${item.ref}`;
    case "diff":
      return `diff:${item.repo}:${item.base}...${item.head}`;
    case "commit":
      return `commit:${item.repo}:${item.sha}`;
    case "pull_request":
      return `pr:${item.repo}:${item.number}`;
  }
}

export function appendSelectedItem(
  items: ContextItem[],
  contextItem: ContextItem,
): ContextItem[] {
  const key = contextItemKey(contextItem);
  if (items.some((item) => contextItemKey(item) === key)) {
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
