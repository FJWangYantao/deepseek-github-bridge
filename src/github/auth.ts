import { AUTH_STORAGE_KEY } from "../shared/constants";
import type { AuthStatus, GitHubUser } from "../shared/types";

interface StoredAuth {
  token: string;
  user: GitHubUser;
}

export interface AuthTokenProvider {
  getToken(): Promise<string | null>;
}

export class AuthStore implements AuthTokenProvider {
  async getToken(): Promise<string | null> {
    const result = await chrome.storage.local.get(AUTH_STORAGE_KEY);
    const stored = result[AUTH_STORAGE_KEY] as StoredAuth | undefined;
    return stored?.token || null;
  }

  async getStatus(): Promise<AuthStatus> {
    const result = await chrome.storage.local.get(AUTH_STORAGE_KEY);
    const stored = result[AUTH_STORAGE_KEY] as StoredAuth | undefined;
    return {
      authenticated: Boolean(stored?.token && stored.user),
      user: stored?.user ?? null,
    };
  }

  async save(token: string, user: GitHubUser): Promise<AuthStatus> {
    const stored: StoredAuth = { token, user };
    await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: stored });
    return { authenticated: true, user };
  }

  async clear(): Promise<AuthStatus> {
    await chrome.storage.local.remove(AUTH_STORAGE_KEY);
    return { authenticated: false, user: null };
  }
}

