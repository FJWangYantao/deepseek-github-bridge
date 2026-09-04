# DeepSeek GitHub Bridge — Implementation Plan

## 1. Project Goal

Build a browser extension that connects the DeepSeek web client with GitHub so that repository context can be brought into a DeepSeek conversation with minimal friction.

The project should start as a small, reliable GitHub context bridge and evolve toward a lightweight tool runtime.

### Long-term vision

```text
DeepSeek Web
    ↓
Browser Extension
    ↓
Bridge Runtime
    ↓
Tool Providers
    ├── GitHub
    ├── Local Filesystem (future)
    ├── Search (future)
    └── Review / Hook system (future)
```

The first release should **not** attempt to become a complete autonomous coding agent.

---

## 2. MVP Scope

The MVP should answer one question well:

> How can a user quickly select code from GitHub and inject it into the current DeepSeek conversation?

### MVP features

1. Run as a Chrome/Chromium browser extension.
2. Detect the DeepSeek chat page.
3. Show a GitHub side panel or extension panel.
4. Authenticate with GitHub.
5. List repositories accessible to the user.
6. Browse repository directories.
7. Read UTF-8 source files.
8. Attach one or more files to the current DeepSeek prompt.
9. Insert formatted repository context into DeepSeek's input box.
10. Handle common failures cleanly.

### Explicitly out of scope for MVP

- autonomous multi-step agent loops
- shell execution
- local filesystem access
- automatic code edits
- commits
- pull requests
- automatic review
- model-to-tool protocol
- background agent execution
- embeddings / vector database
- repository-wide semantic indexing

Keeping these out of V0 is important. The first milestone should validate the browser-to-GitHub-to-DeepSeek path before introducing a runtime abstraction.

---

## 3. Recommended Technology Stack

### Browser extension

- Chrome Extension Manifest V3
- TypeScript
- React for side-panel UI
- Vite for development/build tooling

### GitHub integration

Start with GitHub REST API.

Recommended abstraction:

```ts
interface GitHubClient {
  listRepositories(): Promise<Repository[]>;
  listDirectory(repo: RepoRef, path: string, ref?: string): Promise<TreeEntry[]>;
  readFile(repo: RepoRef, path: string, ref?: string): Promise<FileContent>;
}
```

The UI and DeepSeek integration layer should not call `fetch()` against GitHub directly.

### State

For the MVP, keep state small:

- current GitHub authentication state
- selected repository
- selected branch/ref
- current directory
- selected files
- extension preferences

Use extension storage only where persistence is actually needed.

---

## 4. High-Level Architecture

```text
┌──────────────────────────────────────────────┐
│ DeepSeek Web Page                            │
│                                              │
│  Chat UI                                     │
│     ↑                                        │
│     │ inject prompt/context                  │
│     │                                        │
│  Content Script                              │
└─────┼────────────────────────────────────────┘
      │ extension messaging
      ↓
┌──────────────────────────────────────────────┐
│ Extension Runtime                            │
│                                              │
│  Background / Service Worker                 │
│     │                                        │
│     ├── GitHubClient                         │
│     ├── Auth                                 │
│     └── Message Router                       │
│                                              │
│  Side Panel UI                               │
│     ├── Repository Picker                    │
│     ├── File Tree                            │
│     ├── Selected Context                     │
│     └── Attach Button                        │
└─────┼────────────────────────────────────────┘
      │ HTTPS
      ↓
┌──────────────────────────────────────────────┐
│ GitHub API                                   │
└──────────────────────────────────────────────┘
```

### Why separate the layers?

The DeepSeek DOM adapter is likely to be the least stable part of the project because the website can change its markup at any time.

Keep it isolated from the GitHub logic.

A future DeepSeek adapter replacement should not require rewriting GitHub code.

---

## 5. Proposed Repository Structure

```text
deepseek-github-bridge/
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   ├── ARCHITECTURE.md
│   └── TOOL_PROTOCOL.md              # future
│
├── src/
│   ├── background/
│   │   ├── index.ts
│   │   └── message-router.ts
│   │
│   ├── content/
│   │   ├── index.ts
│   │   └── deepseek-adapter.ts
│   │
│   ├── github/
│   │   ├── client.ts
│   │   ├── auth.ts
│   │   ├── types.ts
│   │   └── errors.ts
│   │
│   ├── panel/
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── state/
│   │
│   ├── runtime/                     # initially very small
│   │   ├── messages.ts
│   │   └── context-builder.ts
│   │
│   └── shared/
│       ├── types.ts
│       └── constants.ts
│
├── manifest.json
├── package.json
├── tsconfig.json
└── vite.config.ts
```

Do not build a large `runtime/` module in the MVP. It should initially contain only extension-domain orchestration that clearly does not belong to GitHub, UI, or DOM code.

---

## 6. Core Modules

## 6.1 DeepSeek Adapter

The adapter owns all knowledge of the DeepSeek website DOM.

Suggested API:

```ts
interface DeepSeekAdapter {
  isSupportedPage(): boolean;
  findPromptInput(): HTMLElement | null;
  getPromptText(): string;
  setPromptText(text: string): void;
  appendPromptText(text: string): void;
}
```

### Design rule

Never scatter selectors such as:

```ts
document.querySelector("...")
```

through the rest of the project.

All DeepSeek-specific selectors and DOM compatibility work belong in this adapter.

### Required resilience

- input element not found
- page still loading
- React-rendered element replaced after navigation
- DeepSeek DOM class names changed
- current page is not a chat page

Avoid continuous aggressive DOM polling.

Prefer event-driven initialization plus a limited `MutationObserver` where required.

---

## 6.2 GitHub Client

The GitHub client should expose domain operations rather than raw endpoints.

Initial methods:

```ts
listRepositories()
listBranches(repo)
listDirectory(repo, path, ref)
readFile(repo, path, ref)
```

Later:

```ts
searchCode()
getCommit()
getDiff()
createBranch()
createCommit()
createPullRequest()
```

### Important rule

The first version should be read-only.

Do not request GitHub write permissions before there is a concrete feature requiring them.

---

## 6.3 Context Builder

This module converts selected GitHub files into text that can be supplied to DeepSeek.

Example output:

````markdown
The following files are from GitHub repository `owner/repo`.

File: `src/runtime/index.ts`

```ts
// file contents
```

File: `src/runtime/tools.ts`

```ts
// file contents
```
````

Suggested API:

```ts
interface ContextFile {
  repo: string;
  ref: string;
  path: string;
  language?: string;
  content: string;
}

function buildContext(files: ContextFile[]): string;
```

### Add limits immediately

Even the MVP needs protection against accidentally attaching huge files.

Recommended first limits:

- reject obvious binary files
- warn above a per-file size threshold
- cap total attached text
- show the estimated character size before insertion

Exact limits can be tuned after testing.

---

## 6.4 Extension Messaging

Use typed messages between components.

Example:

```ts
type BridgeMessage =
  | { type: "github:listRepositories" }
  | { type: "github:listDirectory"; payload: ListDirectoryInput }
  | { type: "github:readFile"; payload: ReadFileInput }
  | { type: "deepseek:appendContext"; payload: { text: string } };
```

Avoid ad hoc strings and untyped payloads because this layer will become central once tool calling is introduced.

---

## 7. Authentication and Security

Security is a first-class design requirement because the extension may eventually access private repositories.

### MVP principles

1. Use the minimum GitHub permissions required.
2. Start read-only.
3. Never inject GitHub credentials into page JavaScript.
4. Keep secrets in the extension context, not the webpage context.
5. Do not log tokens.
6. Do not send repository contents anywhere except to the user-selected DeepSeek page workflow.
7. Clearly show which files will be inserted before insertion.

### Authentication options

Evaluate these in order:

1. GitHub OAuth / GitHub App based flow.
2. Development-only personal access token support if necessary for early local testing.

A PAT can be useful during development, but should not define the final UX.

---

## 8. MVP User Flow

```text
User opens chat.deepseek.com
        ↓
Extension detects supported page
        ↓
User opens GitHub panel
        ↓
Connect GitHub
        ↓
Select repository
        ↓
Select branch
        ↓
Browse file tree
        ↓
Select one or more source files
        ↓
Preview selected context
        ↓
Click "Attach to DeepSeek"
        ↓
Extension formats context
        ↓
Content script inserts it into the DeepSeek prompt box
        ↓
User reviews prompt and manually sends message
```

### Important MVP choice

**Do not automatically click Send.**

The user should be able to inspect the generated prompt before submitting it.

This creates a useful safety boundary and also makes DOM automation simpler.

---

## 9. Milestones

## Milestone 0 — Extension Skeleton

Goal: prove that the extension can run on DeepSeek.

Tasks:

- initialize TypeScript project
- create Manifest V3 configuration
- register content script
- detect DeepSeek page
- expose a minimal panel/popup
- configure local development workflow

Acceptance criteria:

- extension installs without errors
- content script successfully runs on the DeepSeek web client
- panel can communicate with background service worker

---

## Milestone 1 — DeepSeek Prompt Integration

Goal: reliably place text into the DeepSeek prompt editor.

Tasks:

- implement `DeepSeekAdapter`
- detect prompt editor
- append test text
- preserve existing user input
- test navigation between conversations
- handle missing editor gracefully

Acceptance criteria:

Given the text:

```text
hello from deepseek-github-bridge
```

clicking a development button reliably inserts it into the current prompt without automatically sending it.

This milestone is important enough to complete before GitHub integration.

---

## Milestone 2 — GitHub Read API

Goal: browse and retrieve repository files.

Tasks:

- implement authentication
- list repositories
- select repository
- list root directory
- browse nested directories
- choose branch/ref
- retrieve text file
- normalize GitHub API errors

Acceptance criteria:

A user can navigate from repository selection to displaying the contents of a selected source file inside the extension UI.

---

## Milestone 3 — Attach GitHub Context

Goal: complete the first end-to-end product workflow.

Tasks:

- support file selection
- implement context builder
- detect likely source language from extension
- implement context-size checks
- show selected file summary
- inject resulting context into DeepSeek

Acceptance criteria:

The following path works without manual copy/paste:

```text
GitHub repository
→ select file
→ Attach to DeepSeek
→ repository context appears in prompt
```

At this point the project has a usable V0 release.

---

## Milestone 4 — Developer Quality

Goal: make the extension maintainable.

Tasks:

- unit test context builder
- unit test message schemas
- test GitHub client using mocked responses
- centralize error handling
- add structured development logging
- document manual integration tests
- add linting and formatting

---

## 10. V1 — Repository Context Features

After the MVP is stable, add features that still preserve the human-driven workflow.

Recommended order:

1. Attach multiple files.
2. Repository file search.
3. Attach directory tree.
4. Attach commit information.
5. Attach branch diff.
6. Attach pull request diff.
7. Recently used repositories.
8. Ignore rules for generated/vendor files.

Possible context actions:

```text
Attach File
Attach Files
Attach Directory Tree
Attach Diff
Attach Commit
Attach PR
```

This stage creates strong GitHub integration without requiring an agent runtime yet.

---

## 11. V2 — Tool Calling Runtime

Only after the manual attachment workflow is robust should the project allow the model to request tools.

Example protocol:

```json
{
  "type": "tool_call",
  "id": "call_123",
  "tool": "github.read_file",
  "arguments": {
    "repo": "owner/project",
    "path": "src/index.ts",
    "ref": "main"
  }
}
```

Result:

```json
{
  "type": "tool_result",
  "id": "call_123",
  "ok": true,
  "result": {
    "path": "src/index.ts",
    "content": "..."
  }
}
```

### Candidate tools

Read-only tools first:

```text
github.list_repositories
github.get_tree
github.read_file
github.search_code
github.get_commit
github.get_diff
```

Write tools later:

```text
github.create_branch
github.write_file
github.commit
github.create_pull_request
```

### Runtime responsibilities

```text
model response
    ↓
tool-call parser
    ↓
validation
    ↓
permission check
    ↓
tool router
    ↓
GitHub provider
    ↓
tool result
    ↓
conversation continuation
```

Do not couple parsing directly to GitHub code.

---

## 12. Future Runtime Interface

A future generic tool abstraction could look like:

```ts
interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  execute(args: TArgs, context: ToolContext): Promise<TResult>;
}
```

Possible providers:

```text
ToolRegistry
├── GitHubProvider
├── BrowserProvider
├── FilesystemProvider
├── SearchProvider
└── ReviewProvider
```

The key design principle is that **GitHub should eventually become one provider of the runtime, not the runtime itself**.

---

## 13. V3 — Write Operations

GitHub mutations should be treated separately from read tools.

Possible flow:

```text
DeepSeek proposes edit
        ↓
Bridge generates proposed patch
        ↓
User reviews diff
        ↓
Explicit approval
        ↓
Create branch
        ↓
Commit changes
        ↓
Optional PR
```

### Safety rule

Never silently write to the default branch.

Recommended default behavior:

```text
main
  ↓
bridge/<task-name>
  ↓
commit
  ↓
PR
```

Any write action should have explicit user visibility and confirmation.

---

## 14. V4 — Hook / Review System

A later version can support execution lifecycle hooks.

Example:

```text
beforeToolCall
        ↓
tool execution
        ↓
afterToolCall
        ↓
afterEdit
        ↓
review model
```

For example:

```ts
runtime.on("afterEdit", async event => {
  await reviewer.review({
    diff: event.diff,
    changedFiles: event.files,
  });
});
```

This makes it possible for one model to generate changes and another model to review the resulting diff before a commit or PR is created.

Do not include this lifecycle system in the MVP; design the runtime so it can be added later without rewriting the GitHub provider.

---

## 15. Main Engineering Risks

### Risk 1 — DeepSeek DOM instability

The DeepSeek website may change markup without notice.

Mitigation:

- isolate selectors in `DeepSeekAdapter`
- prefer semantic attributes where possible
- avoid relying on deeply nested class selectors
- fail gracefully when the adapter cannot locate the editor

### Risk 2 — Authentication complexity

GitHub OAuth in a browser extension is more involved than making REST calls.

Mitigation:

- separate authentication from `GitHubClient`
- support a development auth path before polishing production OAuth

### Risk 3 — Context explosion

Attaching a repository can easily exceed a model's useful context window.

Mitigation:

- explicit file selection
- file-size limits
- total context budget
- directory/tree summaries
- later add search and selective retrieval

### Risk 4 — Unsafe write operations

A model-driven GitHub tool could accidentally change important code.

Mitigation:

- MVP is read-only
- separate read/write permission layers
- explicit approval UI
- branch-first workflow
- preview patches before applying

### Risk 5 — Runtime overengineering

It is easy to spend weeks designing a generic agent runtime before the browser bridge works.

Mitigation:

Build in this order:

```text
DOM injection
→ GitHub read
→ context attachment
→ search / diff
→ tool protocol
→ write operations
→ hooks
```

Do not reverse this order.

---

## 16. Definition of Done for V0

V0 is done when all of the following are true:

- [ ] extension installs in Chrome/Chromium
- [ ] DeepSeek pages are detected
- [ ] GitHub authentication works
- [ ] repositories can be listed
- [ ] repository directories can be browsed
- [ ] a text source file can be loaded
- [ ] multiple selected files can be previewed
- [ ] selected files are converted to structured Markdown context
- [ ] context can be inserted into the current DeepSeek prompt
- [ ] existing prompt text is preserved
- [ ] insertion does not automatically send the message
- [ ] oversized/binary files are handled safely
- [ ] GitHub API errors are visible to the user
- [ ] no GitHub write permission is required

---

## 17. Recommended Development Order

If implementing manually, work in the following order:

```text
1. Empty extension loads on DeepSeek
2. Content script detects prompt input
3. Test button inserts static text
4. Side panel communicates with background worker
5. Hard-coded GitHub API request works
6. Authentication is abstracted
7. Repository picker works
8. File tree works
9. File preview works
10. Context builder works
11. Attach File works end-to-end
12. Add size/error handling
13. Refactor only after end-to-end path is stable
```

The first technical checkpoint should therefore **not** be "GitHub login works".

It should be:

> "My extension can reliably insert controlled text into the DeepSeek prompt editor."

That is the highest-risk integration boundary and should be validated first.

---

## 18. Suggested Release Roadmap

```text
V0.1  Extension + DeepSeek DOM adapter
V0.2  GitHub repository browser
V0.3  Attach file(s) to prompt
V0.4  Search + diff context
V1.0  Stable read-only GitHub bridge

V1.x  Better context management
V2.0  Model-requested GitHub tool calls
V3.0  GitHub write / branch / commit / PR
V4.0  Runtime hooks + reviewer model
```

The architecture should leave room for V2–V4, but implementation effort should remain focused on V0 until the complete manual workflow is reliable.
