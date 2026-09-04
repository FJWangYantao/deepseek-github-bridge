import { SUPPORTED_DEEPSEEK_HOSTS } from "../shared/constants";

export interface DeepSeekAdapterOptions {
  document?: Document;
  location?: Location;
}

const PROMPT_HINTS = [
  "message",
  "prompt",
  "输入",
  "消息",
  "询问",
  "发送",
  "ask",
];

const EDITOR_SELECTORS = [
  "textarea[data-testid*='chat']",
  "textarea[placeholder*='输入']",
  "textarea[placeholder*='message' i]",
  "textarea[placeholder*='ask' i]",
  "[contenteditable='true']",
  "[role='textbox']",
  "textarea",
];

export class DeepSeekAdapter {
  private readonly document: Document;
  private readonly location: Location;

  constructor(options: DeepSeekAdapterOptions = {}) {
    this.document = options.document ?? document;
    this.location = options.location ?? window.location;
  }

  isSupportedPage(): boolean {
    return SUPPORTED_DEEPSEEK_HOSTS.has(this.location.hostname);
  }

  findPromptInput(): HTMLElement | null {
    const candidates = new Set<HTMLElement>();
    for (const selector of EDITOR_SELECTORS) {
      for (const element of this.document.querySelectorAll<HTMLElement>(selector)) {
        candidates.add(element);
      }
    }

    return [...candidates]
      .filter((element) => isUsableEditor(element))
      .sort((left, right) => scoreEditor(right) - scoreEditor(left))[0] ?? null;
  }

  getPromptText(): string {
    const input = this.findPromptInput();
    return input ? readEditorValue(input) : "";
  }

  setPromptText(text: string): void {
    const input = this.findPromptInput();
    if (!input) {
      throw new Error("DeepSeek prompt editor was not found.");
    }
    writeEditorValue(input, text);
  }

  appendPromptText(text: string): void {
    const existing = this.getPromptText();
    const separator = existing.trim().length > 0 ? "\n\n" : "";
    this.setPromptText(`${existing}${separator}${text}`);
  }
}

function isUsableEditor(element: HTMLElement): boolean {
  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") {
    return false;
  }
  if (element.getAttribute("contenteditable") === "false") return false;
  if (element instanceof HTMLInputElement && element.type !== "text") return false;
  if (element.getAttribute("aria-hidden") === "true") return false;

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style?.display === "none" || style?.visibility === "hidden") return false;
  return true;
}

function scoreEditor(element: HTMLElement): number {
  let score = 0;
  const tagName = element.tagName.toLowerCase();
  const metadata = [
    element.getAttribute("placeholder") ?? "",
    element.getAttribute("aria-label") ?? "",
    element.getAttribute("data-testid") ?? "",
    typeof element.className === "string" ? element.className : "",
  ].join(" ").toLowerCase();

  if (tagName === "textarea") score += 45;
  if (element.getAttribute("contenteditable") === "true") score += 40;
  if (element.getAttribute("role") === "textbox") score += 20;
  if (PROMPT_HINTS.some((hint) => metadata.includes(hint))) score += 35;
  if (element.closest("form")) score += 5;
  return score;
}

function readEditorValue(element: HTMLElement): string {
  if (isValueElement(element)) return element.value;
  return element.textContent ?? "";
}

function writeEditorValue(element: HTMLElement, value: string): void {
  if (isValueElement(element)) {
    const prototype = Object.getPrototypeOf(element) as HTMLTextAreaElement | HTMLInputElement;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(element, value);
    if (!descriptor?.set) element.value = value;
  } else {
    element.textContent = value;
  }

  const InputEventConstructor = element.ownerDocument.defaultView?.InputEvent;
  const event = InputEventConstructor
    ? new InputEventConstructor("input", { bubbles: true, inputType: "insertText", data: value })
    : new Event("input", { bubbles: true });
  element.dispatchEvent(event);
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function isValueElement(element: HTMLElement): element is HTMLTextAreaElement | HTMLInputElement {
  return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;
}
