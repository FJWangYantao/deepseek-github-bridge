# DeepSeek GitHub Bridge

一个面向 Chrome/Chromium 的 Manifest V3 扩展：在 `chat.deepseek.com` 中打开侧边栏，连接 GitHub，浏览仓库文件，预览并把选中的只读源码上下文插入当前 DeepSeek 输入框。

当前版本是 V0.1，刻意保持为人工确认的只读流程：不会自动发送消息，不申请 GitHub 写权限，也不执行本地命令或修改仓库。

## 当前实现

- DeepSeek 内容脚本只负责页面识别和输入框 DOM 适配，支持 `textarea`、`contenteditable` 和 `role=textbox` 候选，并通过原生 setter 触发 React 输入事件。
- 后台 Service Worker 负责类型化消息路由和所有 GitHub API 请求。
- GitHub 客户端支持仓库、分支、目录和 UTF-8 文本文件读取，并统一处理鉴权、限流、无权限、网络和二进制文件错误。
- 侧边栏支持仓库/分支选择、目录导航、多文件选择、仓库目录树、代码搜索、分支 Diff、Commit SHA 上下文、文件大小与总上下文限制、Markdown 预览和手动附加。
- Token 只存在扩展的 `chrome.storage.local`，不会传入网页 JavaScript 或日志。

## 本地开发

要求 Node.js 22.12+（当前开发环境已验证 Node 22）。

```powershell
npm install
npm run check
```

`npm run check` 会依次执行 TypeScript 检查、单元测试和生产构建。构建结果位于 `dist/`。

开发调试可以运行：

```powershell
npm run dev
```

这会启动 Vite 的侧边栏页面预览；扩展本身仍应使用生产构建结果加载。

## 在 Chrome 中加载

1. 执行 `npm run build`。
2. 打开 `chrome://extensions`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本项目的 `dist` 目录。
4. 打开 `https://chat.deepseek.com/`，刷新页面，再点击扩展图标打开侧边栏。

如果修改了后台脚本或 Manifest，需要在扩展管理页点击“重新加载”；如果修改了内容脚本，也要刷新 DeepSeek 标签页。

## GitHub Token

当前版本使用开发阶段的 Personal Access Token 连接方式。推荐使用 GitHub fine-grained token，并仅授予：

- Metadata: Read-only
- Contents: Read-only

只选择确实要浏览的仓库。Token 会在扩展上下文内调用 `api.github.com`，断开连接会清除本地保存的 Token。正式 OAuth/GitHub App 流程留到后续版本，不在本地 MVP 中伪装成已完成能力。

## V0.2 Context Explorer

在选择仓库和分支后，侧边栏提供两种项目级上下文能力：

- **加入目录树**：读取当前 ref 的递归仓库树，把目录和文件路径作为结构化上下文加入待附加区域。
- **搜索代码或符号**：输入关键词搜索当前仓库的 GitHub Code Search 结果，点击结果即可读取文件并加入上下文。搜索接口使用 GitHub 的索引范围，不承诺针对所选非默认分支搜索；加入结果后仍按当前选择的仓库和分支读取文件。

目录树和文件可以同时选择，最终统一在 Markdown 预览中检查，再点击“附加到 DeepSeek”。搜索使用 GitHub 的代码索引，通常面向默认分支；如果需要严格查看当前分支内容，仍应通过目录浏览选择文件。

## V0.3 · Branch Diff Context

当前已加入只读的分支比较上下文：选择 `Base branch` 和 `Compare branch`，加载 GitHub Compare API 返回的变更文件，按文件勾选后点击 `Add Diff to Context`。Diff 预览包含比较元数据、变更文件清单、增删统计和 patch；GitHub 未返回 patch 的文件会明确标记为 `Patch omitted by GitHub`。整个流程不会写入 GitHub，也不会自动发送 DeepSeek 消息。

## V0.3 · Commit Context

选择仓库后，在 `Commit Context` 输入 Commit SHA，点击 `加载 Commit`，检查提交信息、作者、父提交、变更文件和 patch，再勾选文件并点击 `Add Commit to Context`。Commit Context 仍然是只读、人工确认的上下文，不会修改 GitHub 或自动发送 DeepSeek 消息。

## 手动验收重点

- 先在 DeepSeek 输入框输入一段文字，再附加文件，确认原文字被保留且上下文以两个换行追加。
- 附加完成后确认 DeepSeek 没有自动发送消息。
- 在不同会话之间导航并刷新页面，确认找不到编辑器时侧边栏给出可理解提示。
- 选择多个目录下的文本文件，展开 Markdown 预览，确认仓库、分支、路径、语言围栏和原文存在。
- 尝试选择二进制文件、超大文件或超过总量限制的组合，确认请求被拒绝且已有选择不丢失。
- 使用无效 Token、无权限仓库和触发限流的响应，确认错误不会显示 Token 内容。

更完整的手动测试表见 [`docs/MANUAL_TESTS.md`](docs/MANUAL_TESTS.md)，分层说明见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

