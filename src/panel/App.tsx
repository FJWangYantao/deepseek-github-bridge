import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../github/errors";
import {
  buildContext,
  contextDiffFromGitHub,
  contextFileFromGitHub,
  contextTreeFromGitHub,
  getContextStats,
  type ContextFile,
  type ContextItem,
} from "../runtime/context-builder";
import { appendSelectedItem } from "./selection";
import { requestBridge } from "../runtime/messages";
import type {
  AuthStatus,
  Branch,
  CodeSearchResult,
  RepositoryDiff,
  DeepSeekStatus,
  Repository,
  TreeEntry,
} from "../shared/types";

const EMPTY_AUTH: AuthStatus = { authenticated: false, user: null };

export default function App() {
  const [auth, setAuth] = useState<AuthStatus>(EMPTY_AUTH);
  const [token, setToken] = useState("");
  const [deepSeek, setDeepSeek] = useState<DeepSeekStatus | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repoKey, setRepoKey] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchName, setBranchName] = useState("");
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [selectedItems, setSelectedItems] = useState<ContextItem[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [loadingRepositories, setLoadingRepositories] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Set<string>>(() => new Set());
  const [repositoryTree, setRepositoryTree] = useState<ContextItem | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CodeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [baseBranch, setBaseBranch] = useState("");
  const [headBranch, setHeadBranch] = useState("");
  const [repositoryDiff, setRepositoryDiff] = useState<RepositoryDiff | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [selectedDiffPaths, setSelectedDiffPaths] = useState<Set<string>>(() => new Set());
  const selectedItemsRef = useRef<ContextItem[]>([]);
  const pendingFilesRef = useRef<Map<string, symbol>>(new Map());
  const selectionVersionRef = useRef(0);
  const treeRequestRef = useRef(0);
  const searchRequestRef = useRef(0);
  const diffRequestRef = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedRepository = useMemo(
    () => repositories.find((repository) => repository.fullName === repoKey) ?? null,
    [repositories, repoKey],
  );

  const contextState = useMemo(() => {
    if (selectedItems.length === 0) {
      return {
        text: "",
        stats: { itemCount: 0, fileCount: 0, totalCharacters: 0, estimatedCharacters: 0, warnings: [] },
        error: "",
      };
    }
    try {
      return {
        text: buildContext(selectedItems),
        stats: getContextStats(selectedItems),
        error: "",
      };
    } catch (contextError) {
      return {
        text: "",
        stats: getContextStatsWithoutBuild(selectedItems),
        error: errorMessage(contextError),
      };
    }
  }, [selectedItems]);

  const refreshDeepSeek = useCallback(async (showError = false) => {
    try {
      const status = await requestBridge({ type: "deepseek:ping" });
      setDeepSeek(status);
      if (showError) setError("");
    } catch (refreshError) {
      setDeepSeek({
        supportedPage: false,
        editorAvailable: false,
        promptCharacters: 0,
        url: "",
      });
      if (showError) setError(errorMessage(refreshError));
    }
  }, []);

  const loadRepositories = useCallback(async () => {
    setLoadingRepositories(true);
    try {
      const data = await requestBridge({ type: "github:listRepositories" });
      setRepositories(data);
      setRepoKey((current) =>
        data.some((repository) => repository.fullName === current)
          ? current
          : data[0]?.fullName ?? "",
      );
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoadingRepositories(false);
    }
  }, []);

  useEffect(() => {
    void refreshDeepSeek();
    void requestBridge({ type: "auth:getStatus" })
      .then(setAuth)
      .catch((statusError) => setError(errorMessage(statusError)));
  }, [refreshDeepSeek]);

  useEffect(() => {
    if (auth.authenticated) void loadRepositories();
  }, [auth.authenticated, loadRepositories]);

  useEffect(() => {
    if (!selectedRepository) {
      setBranches([]);
      setBranchName("");
      return;
    }

    let cancelled = false;
    setLoadingBranches(true);
    setBranches([]);
    setBranchName("");
    void requestBridge({
      type: "github:listBranches",
      payload: { repo: selectedRepository },
    })
      .then((data) => {
        if (cancelled) return;
        setBranches(data);
        setBranchName(
          data.some((branch) => branch.name === selectedRepository.defaultBranch)
            ? selectedRepository.defaultBranch
            : data[0]?.name ?? "",
        );
      })
      .catch((loadError) => {
        if (!cancelled) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoadingBranches(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRepository]);

  useEffect(() => {
    selectionVersionRef.current += 1;
    treeRequestRef.current += 1;
    searchRequestRef.current += 1;
    diffRequestRef.current += 1;
    setLoadingTree(false);
    setSearching(false);
    selectedItemsRef.current = [];
    pendingFilesRef.current.clear();
    setPendingFiles(new Set());
    setSelectedItems([]);
    setRepositoryTree(null);
    setSearchQuery("");
    setSearchResults([]);
    setBaseBranch("");
    setHeadBranch("");
    setRepositoryDiff(null);
    setSelectedDiffPaths(new Set());
    setPath("");
    setEntries([]);
  }, [repoKey, branchName]);

  useEffect(() => {
    if (!selectedRepository || !branchName) return;
    let cancelled = false;
    setLoadingDirectory(true);
    void requestBridge({
      type: "github:listDirectory",
      payload: {
        repo: selectedRepository,
        path,
        ref: branchName,
      },
    })
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((loadError) => {
        if (!cancelled) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoadingDirectory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [branchName, path, selectedRepository]);

  async function connectGitHub() {
    if (!token.trim()) {
      setError("请粘贴 GitHub Token。 ");
      return;
    }
    setConnecting(true);
    setError("");
    setNotice("");
    try {
      const status = await requestBridge({
        type: "auth:setToken",
        payload: { token },
      });
      setAuth(status);
      setToken("");
      setNotice(`已连接 GitHub（${status.user?.login ?? "当前用户"}）。`);
    } catch (connectError) {
      setError(errorMessage(connectError));
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectGitHub() {
    try {
      setAuth(await requestBridge({ type: "auth:clear" }));
      setRepositories([]);
      setRepoKey("");
      setBranches([]);
      setBranchName("");
      setEntries([]);
      setRepositoryTree(null);
      setSearchQuery("");
      setSearchResults([]);
      setBaseBranch("");
      setHeadBranch("");
      setRepositoryDiff(null);
      setSelectedDiffPaths(new Set());
      selectionVersionRef.current += 1;
      treeRequestRef.current += 1;
      searchRequestRef.current += 1;
      diffRequestRef.current += 1;
      setLoadingTree(false);
      setSearching(false);
      selectedItemsRef.current = [];
      pendingFilesRef.current.clear();
      setPendingFiles(new Set());
      setSelectedItems([]);
      setNotice("已断开 GitHub，扩展存储中的 Token 已清除。 ");
    } catch (disconnectError) {
      setError(errorMessage(disconnectError));
    }
  }

  async function toggleRepositoryTree() {
    if (!selectedRepository || !branchName) return;
    if (repositoryTree) {
      const nextItems = selectedItemsRef.current.filter((item) => item !== repositoryTree);
      selectedItemsRef.current = nextItems;
      setSelectedItems(nextItems);
      setRepositoryTree(null);
      return;
    }

    const selectionVersion = selectionVersionRef.current;
    const treeRepository = selectedRepository;
    const treeRef = branchName;
    const requestId = ++treeRequestRef.current;
    setLoadingTree(true);
    setError("");
    try {
      const tree = contextTreeFromGitHub(
        await requestBridge({
          type: "github:getTree",
          payload: { repo: treeRepository, ref: treeRef },
        }),
      );
      if (
        selectionVersionRef.current !== selectionVersion ||
        treeRequestRef.current !== requestId ||
        selectedRepository?.fullName !== treeRepository.fullName ||
        branchName !== treeRef
      ) return;
      const nextItems = appendSelectedItem(selectedItemsRef.current, tree);
      selectedItemsRef.current = nextItems;
      setSelectedItems(nextItems);
      setRepositoryTree(tree);
      setNotice("已加入仓库目录树。");
    } catch (loadError) {
      if (
        selectionVersionRef.current === selectionVersion &&
        treeRequestRef.current === requestId
      ) setError(errorMessage(loadError));
    } finally {
      if (treeRequestRef.current === requestId) setLoadingTree(false);
    }
  }

  async function loadDiff() {
    if (!selectedRepository || !baseBranch || !headBranch || baseBranch === headBranch) return;
    const selectionVersion = selectionVersionRef.current;
    const diffRepository = selectedRepository;
    const base = baseBranch;
    const head = headBranch;
    const requestId = ++diffRequestRef.current;
    setLoadingDiff(true);
    setError("");
    try {
      const diff = await requestBridge({
        type: "github:compareRefs",
        payload: { repo: diffRepository, base, head },
      });
      if (
        selectionVersionRef.current !== selectionVersion ||
        diffRequestRef.current !== requestId ||
        selectedRepository?.fullName !== diffRepository.fullName ||
        branchName !== head
      ) return;
      setRepositoryDiff(diff);
      setSelectedDiffPaths(new Set(diff.files.map((file) => file.path)));
    } catch (loadError) {
      if (selectionVersionRef.current === selectionVersion && diffRequestRef.current === requestId) setError(errorMessage(loadError));
    } finally {
      if (diffRequestRef.current === requestId) setLoadingDiff(false);
    }
  }

  function toggleDiffPath(path: string) {
    setSelectedDiffPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function addDiffToContext() {
    if (!repositoryDiff) return;
    const selectedFiles = repositoryDiff.files.filter((file) => selectedDiffPaths.has(file.path));
    if (selectedFiles.length === 0) {
      setError("请至少选择一个 Diff 文件。 ");
      return;
    }
    const nextDiff = { ...repositoryDiff, files: selectedFiles };
    const contextDiff = contextDiffFromGitHub(nextDiff);
    const nextItems = appendSelectedItem(selectedItemsRef.current, contextDiff);
    selectedItemsRef.current = nextItems;
    setSelectedItems(nextItems);
    setNotice(`已加入 ${selectedFiles.length} 个 Diff 文件。`);
  }

  async function searchRepository() {
    if (!selectedRepository || !branchName || !searchQuery.trim()) return;
    const selectionVersion = selectionVersionRef.current;
    const searchRepositoryRef = selectedRepository;
    const searchRef = branchName;
    const searchText = searchQuery.trim();
    const requestId = ++searchRequestRef.current;
    setSearching(true);
    setError("");
    try {
      const results = await requestBridge({
        type: "github:searchCode",
        payload: {
          repo: searchRepositoryRef,
          query: searchText,
        },
      });
      if (
        selectionVersionRef.current !== selectionVersion ||
        searchRequestRef.current !== requestId ||
        selectedRepository?.fullName !== searchRepositoryRef.fullName ||
        branchName !== searchRef
      ) return;
      setSearchResults(results);
    } catch (searchError) {
      if (
        selectionVersionRef.current === selectionVersion &&
        searchRequestRef.current === requestId
      ) setError(errorMessage(searchError));
    } finally {
      if (searchRequestRef.current === requestId) setSearching(false);
    }
  }

  async function addSearchResult(result: CodeSearchResult) {
    if (!selectedRepository || !branchName || result.repositoryFullName !== selectedRepository.fullName) return;
    const entry: TreeEntry = {
      name: result.name,
      path: result.path,
      type: "file",
      sha: result.sha,
      htmlUrl: result.htmlUrl,
    };
    await toggleFile(entry);
  }

  async function toggleFile(entry: TreeEntry) {
    if (!selectedRepository || !branchName || entry.type !== "file") return;

    const selectionKey = `${selectedRepository.fullName}:${branchName}:${entry.path}`;
    const existing = selectedItemsRef.current.find(
      (item) =>
        item.type === "file" &&
        item.repo === selectedRepository.fullName &&
        item.ref === branchName &&
        item.path === entry.path,
    );
    if (existing) {
      const nextItems = selectedItemsRef.current.filter((item) => item !== existing);
      selectedItemsRef.current = nextItems;
      setSelectedItems(nextItems);
      return;
    }
    if (pendingFilesRef.current.has(selectionKey)) return;

    const selectionVersion = selectionVersionRef.current;
    const requestToken = Symbol(selectionKey);
    pendingFilesRef.current.set(selectionKey, requestToken);
    setPendingFiles(new Set(pendingFilesRef.current.keys()));
    setError("");
    try {
      const file = await requestBridge({
        type: "github:readFile",
        payload: {
          repo: selectedRepository,
          path: entry.path,
          ref: branchName,
        },
      });
      if (selectionVersionRef.current !== selectionVersion) return;
      const contextFile = contextFileFromGitHub(file);
      // Use the ref as the authoritative latest selection. Each async response
      // appends to the current value, instead of the render that started it.
      const nextItems = appendSelectedItem(selectedItemsRef.current, contextFile);
      selectedItemsRef.current = nextItems;
      setSelectedItems(nextItems);
      setNotice(`已加载 ${entry.path}。`);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      if (pendingFilesRef.current.get(selectionKey) === requestToken) {
        pendingFilesRef.current.delete(selectionKey);
        setPendingFiles(new Set(pendingFilesRef.current.keys()));
      }
    }
  }

  async function attachContext() {
    if (!contextState.text || contextState.error) {
      setError(contextState.error || "请先选择文件。 ");
      return;
    }
    if (!deepSeek?.supportedPage || !deepSeek.editorAvailable) {
      setError("当前 DeepSeek 编辑器不可用，请切换到 chat.deepseek.com 对话页并刷新页面。 ");
      return;
    }

    setError("");
    try {
      const result = await requestBridge({
        type: "deepseek:appendContext",
        payload: { text: contextState.text },
      });
      setDeepSeek((current) =>
        current
          ? { ...current, promptCharacters: result.promptCharacters, editorAvailable: true }
          : current,
      );
      setNotice(`已插入 ${result.addedCharacters.toLocaleString()} 个字符；消息尚未发送。`);
    } catch (attachError) {
      setError(errorMessage(attachError));
      await refreshDeepSeek();
    }
  }

  const breadcrumbs = path ? path.split("/").filter(Boolean) : [];

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">READ-ONLY BRIDGE · V0.1</p>
          <h1>DeepSeek GitHub Bridge</h1>
        </div>
        <button className="icon-button" type="button" onClick={() => void refreshDeepSeek(true)} title="刷新 DeepSeek 状态">
          ↻
        </button>
      </header>

      <section className={`connection-strip ${deepSeek?.supportedPage && deepSeek.editorAvailable ? "is-ready" : ""}`}>
        <span className="status-dot" />
        <div>
          <strong>DeepSeek 对话</strong>
          <span>
            {deepSeek?.supportedPage
              ? deepSeek.editorAvailable
                ? `编辑器已就绪 · 当前 ${deepSeek.promptCharacters.toLocaleString()} 字符`
                : "页面已识别，但还没有找到输入框"
              : "请在 chat.deepseek.com 对话页打开侧边栏"}
          </span>
        </div>
      </section>

      {error && (
        <div className="alert alert-error" role="alert">
          <span>!</span>
          <p>{error}</p>
          <button type="button" onClick={() => setError("")} aria-label="关闭错误提示">×</button>
        </div>
      )}
      {notice && (
        <div className="alert alert-notice" role="status">
          <span>✓</span>
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice("")} aria-label="关闭提示">×</button>
        </div>
      )}

      {!auth.authenticated ? (
        <section className="auth-card panel-card">
          <div className="section-heading">
            <div className="section-icon github-mark">GH</div>
            <div>
              <h2>连接 GitHub</h2>
              <p>使用只读 Token 浏览你有权限访问的仓库。</p>
            </div>
          </div>
          <label className="field-label" htmlFor="github-token">Fine-grained Personal Access Token</label>
          <input
            id="github-token"
            className="text-input"
            type="password"
            autoComplete="off"
            placeholder="github_pat_••••••••"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void connectGitHub();
            }}
          />
          <button className="primary-button full-width" type="button" disabled={connecting} onClick={() => void connectGitHub()}>
            {connecting ? "验证中…" : "连接并验证"}
          </button>
          <p className="security-note">
            Token 只保存在扩展存储中，不会注入 DeepSeek 页面，也不会写入日志。
          </p>
          <a className="help-link" href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noreferrer">
            如何创建只读 Token ↗
          </a>
        </section>
      ) : (
        <>
          <section className="user-bar panel-card">
            <div className="avatar">{auth.user?.login.slice(0, 1).toUpperCase() ?? "G"}</div>
            <div className="user-copy">
              <strong>{auth.user?.name || auth.user?.login}</strong>
              <span>@{auth.user?.login}</span>
            </div>
            <button className="text-button" type="button" onClick={() => void disconnectGitHub()}>断开</button>
          </section>

          <section className="panel-card browser-card">
            <div className="section-heading compact-heading">
              <div className="section-icon">01</div>
              <div>
                <h2>选择仓库</h2>
                <p>只读浏览 GitHub 文件内容。</p>
              </div>
            </div>
            <label className="sr-only" htmlFor="repository">Repository</label>
            <select
              id="repository"
              className="select-input"
              value={repoKey}
              onChange={(event) => setRepoKey(event.target.value)}
              disabled={loadingRepositories || repositories.length === 0}
            >
              <option value="">{loadingRepositories ? "加载仓库中…" : "选择一个仓库"}</option>
              {repositories.map((repository) => (
                <option value={repository.fullName} key={repository.id}>
                  {repository.fullName}{repository.private ? " · private" : ""}
                </option>
              ))}
            </select>

            {selectedRepository && (
              <>
                <div className="branch-row">
                  <span className="branch-label">BRANCH</span>
                  <select
                    className="select-input branch-select"
                    value={branchName}
                    onChange={(event) => setBranchName(event.target.value)}
                    disabled={loadingBranches || branches.length === 0}
                  >
                    <option value="">{loadingBranches ? "加载分支中…" : "选择分支"}</option>
                    {branches.map((branch) => (
                      <option value={branch.name} key={branch.name}>{branch.name}{branch.protected ? " · protected" : ""}</option>
                    ))}
                  </select>
                </div>

                <div className="path-bar">
                  <button className="path-root" type="button" onClick={() => setPath("")}>⌂</button>
                  {breadcrumbs.map((crumb, index) => {
                    const crumbPath = breadcrumbs.slice(0, index + 1).join("/");
                    return (
                      <span className="crumb-group" key={crumbPath}>
                        <span className="crumb-separator">/</span>
                        <button type="button" onClick={() => setPath(crumbPath)}>{crumb}</button>
                      </span>
                    );
                  })}
                </div>

                <div className="explorer-tools">
                  <form className="search-row" onSubmit={(event) => { event.preventDefault(); void searchRepository(); }}>
                    <input
                      className="text-input search-input"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="搜索代码或符号"
                      aria-label="搜索代码或符号"
                    />
                    <button className="secondary-button" type="submit" disabled={searching || !searchQuery.trim()}>
                      {searching ? "…" : "搜索"}
                    </button>
                  </form>
                  <div className="explorer-actions">
                    <button className={`text-button ${repositoryTree ? "is-active" : ""}`} type="button" onClick={() => void toggleRepositoryTree()} disabled={loadingTree}>
                      {loadingTree ? "读取目录树…" : repositoryTree ? "移除目录树" : "加入目录树"}
                    </button>
                  </div>
                  <div className="diff-tools">
                    <div className="development-heading"><span>Development Context</span><span className="context-chip">DIFF</span></div>
                    <div className="diff-branch-row">
                      <select className="select-input" value={baseBranch} onChange={(event) => setBaseBranch(event.target.value)} aria-label="Diff base branch">
                        <option value="">Base branch</option>
                        {branches.map((branch) => <option value={branch.name} key={`base:${branch.name}`}>{branch.name}</option>)}
                      </select>
                      <span className="diff-arrow">→</span>
                      <select className="select-input" value={headBranch} onChange={(event) => setHeadBranch(event.target.value)} aria-label="Diff compare branch">
                        <option value="">Compare branch</option>
                        {branches.map((branch) => <option value={branch.name} key={`head:${branch.name}`}>{branch.name}</option>)}
                      </select>
                    </div>
                    <button className="secondary-button diff-load-button" type="button" onClick={() => void loadDiff()} disabled={loadingDiff || !baseBranch || !headBranch || baseBranch === headBranch}>
                      {loadingDiff ? "加载 Diff…" : "加载 Diff"}
                    </button>
                    {repositoryDiff && (
                      <div className="diff-results">
                        <div className="diff-summary"><strong>{repositoryDiff.files.length} files changed</strong><span className="diff-additions">+{repositoryDiff.files.reduce((total, file) => total + file.additions, 0)}</span><span className="diff-deletions">−{repositoryDiff.files.reduce((total, file) => total + file.deletions, 0)}</span></div>
                        <div className="diff-files">
                          {repositoryDiff.files.map((file) => <label className="diff-file-row" key={`${file.status}:${file.path}`}><input type="checkbox" checked={selectedDiffPaths.has(file.path)} onChange={() => toggleDiffPath(file.path)} /><span className="diff-file-path">{file.path}</span><span className="diff-file-stat">+{file.additions} −{file.deletions}</span></label>)}
                        </div>
                        <button className="text-button diff-add-button" type="button" onClick={addDiffToContext} disabled={selectedDiffPaths.size === 0}>Add Diff to Context</button>
                      </div>
                    )}
                  </div>
                  {searchResults.length > 0 && (
                    <div className="search-results">
                      <div className="search-results-heading"><span>搜索结果</span><span>{searchResults.length}</span></div>
                      {searchResults.map((result) => {
                        const selected = selectedItems.some((item) => item.type === "file" && item.path === result.path && item.repo === selectedRepository.fullName && item.ref === branchName);
                        return (
                          <button className={`search-result ${selected ? "is-selected" : ""}`} type="button" key={`${result.path}:${result.sha}`} onClick={() => void addSearchResult(result)} disabled={selected}>
                            <span className="search-result-path">{result.path}</span>
                            <span className="search-result-meta">{selected ? "已加入" : "加入上下文"}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="tree-toolbar">
                  <span>{path || "根目录"}</span>
                  {path && <button className="text-button" type="button" onClick={() => setPath(parentPath(path))}>返回上级</button>}
                </div>
                <div className="file-tree" aria-live="polite">
                  {loadingDirectory ? (
                    <div className="empty-state"><span className="loader" />读取目录…</div>
                  ) : entries.length === 0 ? (
                    <div className="empty-state">这个目录是空的。</div>
                  ) : (
                    entries.map((entry) => {
                      const isSelected = selectedItems.some(
                        (item) =>
                          item.type === "file" &&
                          item.repo === selectedRepository.fullName &&
                          item.ref === branchName &&
                          item.path === entry.path,
                      );
                      const isPending = pendingFiles.has(
                        `${selectedRepository.fullName}:${branchName}:${entry.path}`,
                      );
                      const isDirectory = entry.type === "dir";
                      const isSelectable = entry.type === "file";
                      return (
                        <button
                          className={`tree-row ${isSelected ? "is-selected" : ""} ${!isSelectable ? "is-directory" : ""}`}
                          type="button"
                          key={`${entry.type}:${entry.path}`}
                          disabled={isPending}
                          onClick={() => {
                            if (isDirectory) setPath(entry.path);
                            else void toggleFile(entry);
                          }}
                        >
                          <span className="tree-icon">{isDirectory ? "▸" : isSelected ? "✓" : isPending ? "…" : "·"}</span>
                          <span className="tree-name">{entry.name}</span>
                          <span className="tree-meta">{isDirectory ? "DIR" : formatBytes(entry.size)}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
            {!loadingRepositories && repositories.length === 0 && (
              <div className="empty-state repository-empty">没有可访问的仓库，或 Token 缺少 Metadata 读取权限。</div>
            )}
          </section>

          <section className="panel-card context-card">
            <div className="context-heading">
              <div>
                <p className="eyebrow">02 · REVIEW BEFORE INSERT</p>
                <h2>待附加上下文</h2>
                <p className="context-subtitle">文件、目录树与 Diff 会一起发送</p>
              </div>
              <span className="count-badge">{contextState.stats.itemCount} items</span>
            </div>
            {selectedItems.length === 0 ? (
              <div className="context-empty">
                <span className="empty-glyph">⌁</span>
                <p>从上面的文件树选择源文件。</p>
                <span>内容会在插入前以 Markdown 预览。</span>
              </div>
            ) : (
              <>
                <div className="selected-list">
                  {selectedItems.filter((item): item is Extract<ContextItem, { type: "diff" }> => item.type === "diff").map((diff) => (
                    <div className="selected-file selected-diff" key={`${diff.repo}:${diff.base}:${diff.head}`}>
                      <span className="file-type">DIFF</span>
                      <span className="selected-file-name" title={`${diff.repo}/${diff.base}...${diff.head}`}>{diff.base}...{diff.head} · {diff.files.length} files</span>
                      <button className="remove-file" type="button" onClick={() => { const nextItems = selectedItemsRef.current.filter((item) => item !== diff); selectedItemsRef.current = nextItems; setSelectedItems(nextItems); }} aria-label="移除 Diff">×</button>
                    </div>
                  ))}
                  {selectedItems.filter((item): item is Extract<ContextItem, { type: "tree" }> => item.type === "tree").map((tree) => (
                    <div className="selected-file selected-tree" key={`${tree.repo}:${tree.ref}:${tree.sha}`}>
                      <span className="file-type">TREE</span>
                      <span className="selected-file-name" title={`${tree.repo}/${tree.ref}`}>仓库目录树 · {tree.entries.length} entries</span>
                      <button className="remove-file" type="button" onClick={() => { const nextItems = selectedItemsRef.current.filter((item) => item !== tree); selectedItemsRef.current = nextItems; setSelectedItems(nextItems); setRepositoryTree(null); }} aria-label="移除仓库目录树">×</button>
                    </div>
                  ))}
                  {selectedItems.filter((item): item is ContextFile => item.type === "file").map((file) => (
                    <div className="selected-file" key={`${file.repo}:${file.ref}:${file.path}`}>
                      <span className="file-type">{(file.language ?? "TXT").slice(0, 4).toUpperCase()}</span>
                      <span className="selected-file-name" title={`${file.repo}/${file.path}`}>{file.path}</span>
                      <button
                        className="remove-file"
                        type="button"
                        onClick={() => {
                          const nextItems = selectedItemsRef.current.filter((item) => item !== file);
                          selectedItemsRef.current = nextItems;
                          setSelectedItems(nextItems);
                        }}
                        aria-label={`移除 ${file.path}`}
                      >×</button>
                    </div>
                  ))}
                </div>
                <div className="stats-row">
                  <span>{contextState.stats.totalCharacters.toLocaleString()} source chars</span>
                  <span>≈ {contextState.stats.estimatedCharacters.toLocaleString()} inserted chars</span>
                </div>
                {contextState.stats.warnings.map((warning) => <p className="warning-line" key={warning}>△ {warning}</p>)}
                {contextState.error && <p className="warning-line error-line">! {contextState.error}</p>}
                <details className="preview-details">
                  <summary>查看 Markdown 预览</summary>
                  <pre className="context-preview">{contextState.text || "无法生成预览。"}</pre>
                </details>
                <button
                  className="primary-button full-width attach-button"
                  type="button"
                  disabled={!contextState.text || Boolean(contextState.error)}
                  onClick={() => void attachContext()}
                >
                  附加到 DeepSeek <span>→</span>
                </button>
                <p className="manual-send-note">插入后请检查提示词，再由你手动发送。</p>
              </>
            )}
          </section>
        </>
      )}

      <footer className="app-footer">
        <span>V0.1 · GitHub read-only</span>
        <span>没有自动发送或写操作</span>
      </footer>
    </main>
  );
}

function parentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function formatBytes(bytes = 0): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getContextStatsWithoutBuild(items: ContextItem[]) {
  const files = items.filter((item): item is ContextFile => item.type === "file");
  return {
    itemCount: items.length,
    fileCount: files.length,
    totalCharacters: files.reduce((total, file) => total + file.content.length, 0),
    estimatedCharacters: 0,
    warnings: [],
  };
}
