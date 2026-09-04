export interface RepoRef {
  owner: string;
  name: string;
}

export interface Repository extends RepoRef {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  htmlUrl: string;
  ownerLogin: string;
}

export interface Branch {
  name: string;
  protected: boolean;
}

export type TreeEntryType = "file" | "dir" | "symlink" | "submodule";

export interface TreeEntry {
  name: string;
  path: string;
  type: TreeEntryType;
  size?: number;
  sha: string;
  htmlUrl: string;
}

export interface FileContent {
  repo: RepoRef;
  ref: string;
  path: string;
  sha: string;
  size: number;
  content: string;
  language?: string;
}

export interface GitHubUser {
  login: string;
  avatarUrl: string;
  htmlUrl: string;
  name: string | null;
}

export interface AuthStatus {
  authenticated: boolean;
  user: GitHubUser | null;
}

export interface DeepSeekStatus {
  supportedPage: boolean;
  editorAvailable: boolean;
  promptCharacters: number;
  url: string;
}

export interface AppendContextResult {
  inserted: boolean;
  addedCharacters: number;
  promptCharacters: number;
}

export interface SerializedError {
  code: string;
  message: string;
  status?: number;
  retryAfterSeconds?: number;
}

export interface ListDirectoryInput {
  repo: RepoRef;
  path: string;
  ref: string;
}

export interface ReadFileInput {
  repo: RepoRef;
  path: string;
  ref: string;
}

export interface MessagePayloadMap {
  "auth:getStatus": undefined;
  "auth:setToken": { token: string };
  "auth:clear": undefined;
  "github:listRepositories": undefined;
  "github:listBranches": { repo: RepoRef };
  "github:listDirectory": ListDirectoryInput;
  "github:readFile": ReadFileInput;
  "deepseek:ping": undefined;
  "deepseek:appendContext": { text: string };
}

export interface MessageResponseMap {
  "auth:getStatus": AuthStatus;
  "auth:setToken": AuthStatus;
  "auth:clear": AuthStatus;
  "github:listRepositories": Repository[];
  "github:listBranches": Branch[];
  "github:listDirectory": TreeEntry[];
  "github:readFile": FileContent;
  "deepseek:ping": DeepSeekStatus;
  "deepseek:appendContext": AppendContextResult;
}

export type BridgeMessageType = keyof MessagePayloadMap;

export type BridgeMessage = {
  [K in BridgeMessageType]: MessagePayloadMap[K] extends undefined
    ? { type: K }
    : { type: K; payload: MessagePayloadMap[K] };
}[BridgeMessageType];

export type BridgeSuccess<K extends BridgeMessageType> = {
  ok: true;
  data: MessageResponseMap[K];
};

export type BridgeFailure = {
  ok: false;
  error: SerializedError;
};

export type BridgeReply<K extends BridgeMessageType> =
  | BridgeSuccess<K>
  | BridgeFailure;

