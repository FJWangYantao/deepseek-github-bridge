# DeepSeek GitHub Bridge — V0.1 架构

## 数据流

```text
Chrome action
    ↓
Side Panel (React)
    │ typed chrome.runtime messages
    ↓
Background Service Worker
    ├── AuthStore → chrome.storage.local
    ├── GitHubClient → api.github.com (read-only)
    └── DeepSeek message relay → active tab
                              ↓
                         Content Script
                              ↓
                         DeepSeekAdapter
                              ↓
                         prompt editor DOM
```

## 边界

### `src/content/deepseek-adapter.ts`

这里是唯一允许出现 DeepSeek DOM 选择器的模块。它负责判断受支持的 Host、筛选可用输入框、读取文本和通过输入事件写回文本。网站 DOM 变化时，优先只修改这一层。

### `src/github/`

`GitHubClient` 暴露仓库、分支、目录和文件四类领域操作；面板不拼接 GitHub URL，也不直接调用 `fetch()`。`AuthStore` 只负责 Token/用户状态持久化，鉴权失败不会把旧 Token 发送到网页环境。

### `src/runtime/`

这里只保留跨模块的最小编排：类型化消息和上下文构建器。上下文构建是确定性的，负责将 `ContextItem`（文件或仓库树）渲染为 Markdown、动态 fence、数量/字符限制和二进制检测。当前没有模型驱动的工具循环。

### V0.2 Context Explorer

`GitHubClient` 通过 `getTree()` 调用递归 Git Trees API，通过 `searchCode()` 调用只读 Code Search API。面板仍然只通过类型化消息访问 GitHub，并把仓库树、搜索得到的文件和手动浏览得到的文件统一放入 `selectedItems`，再交给 Context Builder 预览和附加。Code Search 输入只包含仓库和查询词，因为 GitHub 的代码索引不提供可靠的非默认分支搜索语义；搜索结果加入上下文时，文件仍以面板当前选择的仓库和 ref 读取，并丢弃切换仓库/分支后的过期响应。

### `src/background/message-router.ts`

消息路由集中处理权限边界：GitHub 请求只从后台发出，DeepSeek 附加请求只转发到当前活动标签页。路由统一返回 `{ ok: true, data }` 或 `{ ok: false, error }`，面板不需要理解原始 API 错误格式。

## 安全边界

- Manifest 只声明 `storage`、`activeTab`、`sidePanel`，以及访问 `api.github.com` 所需的 Host 权限。
- MVP 不声明 GitHub 写权限，不提供 commit、branch、PR 或自动修改。
- 附加操作只写入输入框，绝不调用 DeepSeek 的发送按钮。
- 源码内容仅由用户主动选择后从 GitHub 读取，并在用户点击附加后进入当前网页输入框。

## 构建边界

Vite 构建 React 侧边栏；`scripts/build.mjs` 使用 esbuild 将后台和内容脚本分别打成独立的 classic IIFE，避免内容脚本依赖浏览器原生 module loader。最终 Manifest、`background.js`、`content.js` 和 `panel/` 一起输出到 `dist/`。

## 后续扩展点

下一步可以在不改变当前 GitHub 客户端和 DeepSeek 适配器的前提下增加 diff 和提交信息。只有手动附加流程稳定后，才应引入 `ToolRegistry`、工具调用解析和写操作审批流。

