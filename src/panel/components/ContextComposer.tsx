import type { ContextStats } from "../../runtime/context-builder";
import { contextItemKey } from "../selection";
import type { ContextItem } from "../../runtime/context-builder";

interface ContextComposerProps {
  items: ContextItem[];
  stats: ContextStats;
  preview: string;
  error: string;
  onRemove: (item: ContextItem) => void;
  onMove: (item: ContextItem, direction: -1 | 1) => void;
  onClear: () => void;
  onAttach: () => void;
  attachDisabled: boolean;
}

export default function ContextComposer({
  items,
  stats,
  preview,
  error,
  onRemove,
  onMove,
  onClear,
  onAttach,
  attachDisabled,
}: ContextComposerProps) {
  const budget = 32_000;
  const percentage = Math.min(100, Math.round((stats.estimatedTokens / budget) * 100));

  return (
    <>
      <div className="composer-toolbar">
        <span className="composer-label">CONTEXT BASKET</span>
        {items.length > 0 && <button className="text-button" type="button" onClick={onClear}>清空</button>}
      </div>
      {items.length === 0 ? (
        <div className="context-empty">
          <span className="empty-glyph">⌁</span>
          <p>从上面的文件树选择源文件。</p>
          <span>先浏览，再决定哪些内容值得带入对话。</span>
        </div>
      ) : (
        <>
          <div className="selected-list">
            {items.map((item, index) => (
              <div className={`selected-file selected-${item.type}`} key={contextItemKey(item)}>
                <span className="file-type">{itemLabel(item)}</span>
                <span className="selected-file-name" title={itemTitle(item)}>{itemTitle(item)}</span>
                <div className="item-actions">
                  <button type="button" onClick={() => onMove(item, -1)} disabled={index === 0} aria-label="上移上下文项">↑</button>
                  <button type="button" onClick={() => onMove(item, 1)} disabled={index === items.length - 1} aria-label="下移上下文项">↓</button>
                  <button type="button" onClick={() => onRemove(item)} aria-label={`移除 ${itemTitle(item)}`}>×</button>
                </div>
              </div>
            ))}
          </div>
          <div className="budget-block" aria-label={`预计 ${stats.estimatedTokens.toLocaleString()} / ${budget.toLocaleString()} tokens`}>
            <div className="budget-heading"><span>Context budget</span><strong>≈ {stats.estimatedTokens.toLocaleString()} / {budget.toLocaleString()} tokens</strong></div>
            <div className="budget-track"><span style={{ width: `${percentage}%` }} /></div>
          </div>
          <div className="stats-row">
            <span>{stats.itemCount} items · {stats.fileCount} files</span>
            <span>{stats.estimatedCharacters.toLocaleString()} chars inserted</span>
          </div>
          {stats.warnings.map((warning) => <p className="warning-line" key={warning}>△ {warning}</p>)}
          {error && <p className="warning-line error-line">! {error}</p>}
          <details className="preview-details">
            <summary>查看 Markdown 预览</summary>
            <pre className="context-preview">{preview || "无法生成预览。"}</pre>
          </details>
          <button className="primary-button full-width attach-button" type="button" disabled={attachDisabled} onClick={onAttach}>
            附加到 DeepSeek <span>→</span>
          </button>
          <p className="manual-send-note">插入后请检查提示词，再由你手动发送。</p>
        </>
      )}
    </>
  );
}

function itemLabel(item: ContextItem): string {
  if (item.type === "file") return (item.language ?? "TXT").slice(0, 4).toUpperCase();
  if (item.type === "pull_request") return "PR";
  if (item.type === "commit") return "COMMIT";
  return item.type.toUpperCase();
}

function itemTitle(item: ContextItem): string {
  switch (item.type) {
    case "file": return item.path;
    case "tree": return `仓库目录树 · ${item.entries.length} entries`;
    case "diff": return `${item.base}...${item.head} · ${item.files.length} files`;
    case "commit": return `${item.shortSha} · ${item.message.split("\n")[0]}`;
    case "pull_request": return `#${item.number} · ${item.title}`;
  }
}
