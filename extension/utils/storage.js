const LAST_TONE_KEY = "lastTone";
const RECENT_REPLIES_KEY = "recentReplies";
const REPLY_HISTORY_KEY = "replyHistory";
const BACKEND_URL_KEY = "backendUrl";
const DRAFT_TEXT = "draftText";
const DRAFT_CONTEXT_TEXT = "draftContextText";
const DEFAULT_BACKEND_URL = "https://assist-qw4s.onrender.com";

function saveLastTone(tone) {
  return chrome.storage.local.set({ [LAST_TONE_KEY]: tone });
}

async function getLastTone() {
  const result = await chrome.storage.local.get(LAST_TONE_KEY);
  return result[LAST_TONE_KEY] || null;
}

function saveRecentReplies(replies) {
  return chrome.storage.local.set({ [RECENT_REPLIES_KEY]: replies });
}

async function getRecentReplies() {
  const result = await chrome.storage.local.get(RECENT_REPLIES_KEY);
  return result[RECENT_REPLIES_KEY] || [];
}

function clearRecentReplies() {
  return chrome.storage.local.remove(RECENT_REPLIES_KEY);
}

async function getReplyHistory() {
  const result = await chrome.storage.local.get(REPLY_HISTORY_KEY);
  return result[REPLY_HISTORY_KEY] || [];
}

async function saveReplyHistoryItem(text, tone, replies, context = "", replyText = text) {
  const history = await getReplyHistory();
  const historyItem = {
    context,
    replyText,
    text,
    tone,
    replies,
    createdAt: new Date().toISOString()
  };
  const nextHistory = [historyItem, ...history].slice(0, 10);

  return chrome.storage.local.set({ [REPLY_HISTORY_KEY]: nextHistory });
}

function clearReplyHistory() {
  return chrome.storage.local.remove(REPLY_HISTORY_KEY);
}

function saveDraftText(text) {
  return chrome.storage.local.set({ [DRAFT_TEXT]: text });
}

function saveDraftContextText(text) {
  return chrome.storage.local.set({ [DRAFT_CONTEXT_TEXT]: text });
}

async function getDraftText() {
  const result = await chrome.storage.local.get(DRAFT_TEXT);
  return result[DRAFT_TEXT] || "";
}

async function getDraftContextText() {
  const result = await chrome.storage.local.get(DRAFT_CONTEXT_TEXT);
  return result[DRAFT_CONTEXT_TEXT] || "";
}

function clearDraftText() {
  return chrome.storage.local.remove(DRAFT_TEXT);
}

function clearDraftContextText() {
  return chrome.storage.local.remove(DRAFT_CONTEXT_TEXT);
}

function resetAllExtensionData() {
  return chrome.storage.local.clear();
}

function saveBackendUrl(url) {
  return chrome.storage.local.set({ [BACKEND_URL_KEY]: url });
}

async function getBackendUrl() {
  const result = await chrome.storage.local.get(BACKEND_URL_KEY);
  const backendUrl = (result[BACKEND_URL_KEY] || "").trim();

  return backendUrl || DEFAULT_BACKEND_URL;
}
