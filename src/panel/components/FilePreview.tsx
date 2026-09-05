import type { FileLineRange } from "../../runtime/context-builder";
import type { FileContent, TreeEntry } from "../../shared/types";

interface FilePreviewProps {
  entry: TreeEntry;
  file: FileContent;
  range: FileLineRange | null;
  onRangeChange: (range: FileLineRange | null) => void;
  onAddRange: (range: FileLineRange) => void;
  onAddEntire: () => void;
  onClose: () => void;
}

export default function FilePreview({
  entry,
  file,
  range,
  onRangeChange,
  onAddRange,
  onAddEntire,
  onClose,
}: FilePreviewProps) {
  const lines = file.content.split(/\r?\n/);
  const startLine = range?.startLine ?? "";
  const endLine = range?.endLine ?? "";
  const validRange = range !== null && range.startLine >= 1 && range.endLine >= range.startLine && range.endLine <= lines.length;

  function updateRange(startLineValue: string, endLineValue: string) {
    const nextStart = Number(startLineValue);
    const nextEnd = Number(endLineValue);
    if (!startLineValue && !endLineValue) {
      onRangeChange(null);
      return;
    }
    onRangeChange({
      startLine: Number.isInteger(nextStart) ? nextStart : 0,
      endLine: Number.isInteger(nextEnd) ? nextEnd : 0,
    });
  }

  function selectLine(lineNumber: number) {
    if (!range || range.startLine === range.endLine) {
      const start = range?.startLine && lineNumber >= range.startLine ? range.startLine : lineNumber;
      onRangeChange({ startLine: start, endLine: lineNumber >= start ? lineNumber : start });
      return;
    }
    onRangeChange({ startLine: lineNumber, endLine: lineNumber });
  }

  return (
    <section className="file-preview" aria-label={`预览 ${file.path}`}>
      <div className="preview-header">
        <div className="preview-title">
          <span className="file-type">FILE</span>
          <div>
            <strong>{file.path}</strong>
            <span>{file.sha.slice(0, 12)} · {lines.length} lines</span>
          </div>
        </div>
        <button className="text-button" type="button" onClick={onClose}>关闭</button>
      </div>

      <div className="preview-code" role="listbox" aria-label="选择源码行">
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const selected = range !== null && lineNumber >= range.startLine && lineNumber <= range.endLine;
          return (
            <button className={`code-line ${selected ? "is-selected" : ""}`} type="button" key={lineNumber} onClick={() => selectLine(lineNumber)}>
              <span className="line-number">{lineNumber}</span>
              <span className="line-content">{line || " "}</span>
            </button>
          );
        })}
      </div>

      <div className="range-controls">
        <div className="range-heading"><span>LINE RANGE</span><span>{range ? `${range.startLine} — ${range.endLine}` : "未选择"}</span></div>
        <div className="range-inputs">
          <label>From <input type="number" min="1" max={lines.length} value={startLine} onChange={(event) => updateRange(event.target.value, String(endLine))} /></label>
          <span>—</span>
          <label>To <input type="number" min="1" max={lines.length} value={endLine} onChange={(event) => updateRange(String(startLine), event.target.value)} /></label>
        </div>
        <div className="preview-actions">
          <button className="secondary-button" type="button" onClick={onAddEntire}>加入整个文件</button>
          <button className="primary-button" type="button" disabled={!validRange} onClick={() => validRange && onAddRange(range)}>加入选中行</button>
        </div>
      </div>
      <p className="preview-note">点击代码行设置范围；加入后只会发送选中的源码，不会发送行号。</p>
    </section>
  );
}
