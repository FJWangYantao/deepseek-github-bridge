import { AuthStore } from "../github/auth";
import { GitHubClient } from "../github/client";
import { registerMessageRouter } from "./message-router";

const auth = new AuthStore();
const github = new GitHubClient(auth);

registerMessageRouter(auth, github);

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  void chrome.sidePanel.open({ tabId: tab.id });
});
