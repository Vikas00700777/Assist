const postText = document.getElementById("postText");
const toneSelect = document.getElementById("toneSelect");
const quickToneButtons = document.querySelectorAll(".quick-tone-btn");
const generateRepliesButton = document.getElementById("generateRepliesButton");
const regenerateBtn = document.getElementById("regenerateBtn");
const useSelectedTextBtn = document.getElementById("useSelectedTextBtn");
const uploadScreenshotButton = document.getElementById("uploadScreenshotButton");
const screenshotInput = document.getElementById("screenshotInput");
const captureSelectedAreaButton = document.getElementById("captureSelectedAreaButton");
const clearTextBtn = document.getElementById("clearTextBtn");
const clearRepliesBtn = document.getElementById("clearRepliesBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const defaultToneSelect = document.getElementById("defaultToneSelect");
const backendUrlInput = document.getElementById("backendUrlInput");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const testBackendBtn = document.getElementById("testBackendBtn");
const resetExtensionBtn = document.getElementById("resetExtensionBtn");
const historyDetails = document.getElementById("historyDetails");
const settingsDetails = document.getElementById("settingsDetails");
const statusMessage = document.getElementById("statusMessage");
const replyList = document.getElementById("replyList");
const historyList = document.getElementById("historyList");

function showStatus(message, type = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.type = type;
}

function setButtonLoading(button, isLoading, loadingText, normalText) {
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : normalText;
}

function setLoading(isLoading) {
  setButtonLoading(generateRepliesButton, isLoading, "Generating...", "Generate Replies");
  setButtonLoading(regenerateBtn, isLoading, "Regenerating...", "Regenerate Replies");
  useSelectedTextBtn.disabled = isLoading;
  uploadScreenshotButton.disabled = isLoading;
  captureSelectedAreaButton.disabled = isLoading;
}

function setScreenshotLoading(isLoading) {
  setButtonLoading(uploadScreenshotButton, isLoading, "Extracting...", "Upload Screenshot");
  generateRepliesButton.disabled = isLoading;
  regenerateBtn.disabled = isLoading;
  useSelectedTextBtn.disabled = isLoading;
  captureSelectedAreaButton.disabled = isLoading;
}

function setCaptureLoading(isLoading) {
  setButtonLoading(captureSelectedAreaButton, isLoading, "Starting...", "Capture Area");
}

function updateActiveQuickTone() {
  quickToneButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tone === toneSelect.value);
  });
}

function clearReplies() {
  replyList.innerHTML = "";
}

function showEmptyReplies() {
  replyList.innerHTML = '<p class="empty-message">No replies generated yet.</p>';
}

function showEmptyHistory() {
  historyList.innerHTML = '<p class="empty-message">No reply history yet.</p>';
}

function clearText() {
  postText.value = "";
  postText.focus();
  showStatus("Text cleared.", "success");

  clearDraftText().catch((error) => {
    console.error("Could not clear draft text.", error);
  });
}

async function clearStoredReplies() {
  showEmptyReplies();

  try {
    await clearRecentReplies();
    showStatus("Replies cleared.", "success");
  } catch (error) {
    showStatus("Could not clear saved replies.", "error");
  }
}

function formatHistoryDate(createdAt) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "Saved reply";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function renderHistory(historyItems) {
  historyList.innerHTML = "";

  if (!historyItems.length) {
    showEmptyHistory();
    return;
  }

  historyItems.slice(0, 10).forEach((item) => {
    const card = document.createElement("article");
    card.className = "history-card";

    const textPreview = document.createElement("p");
    textPreview.className = "history-text";
    textPreview.textContent = item.text;

    const meta = document.createElement("p");
    meta.className = "history-meta";
    meta.textContent = `${item.tone || "Tone"} - ${formatHistoryDate(item.createdAt)}`;

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const useTextButton = document.createElement("button");
    useTextButton.type = "button";
    useTextButton.className = "light-btn";
    useTextButton.textContent = "Use Text";
    useTextButton.addEventListener("click", () => {
      postText.value = item.text || "";
      saveCurrentDraftText();

      if (item.tone) {
        toneSelect.value = item.tone;
        saveLastTone(item.tone).catch((error) => {
          console.error("Could not save selected tone.", error);
        });
      }

      showStatus("History text loaded.", "success");
    });

    const useRepliesButton = document.createElement("button");
    useRepliesButton.type = "button";
    useRepliesButton.className = "light-btn";
    useRepliesButton.textContent = "Use Replies";
    useRepliesButton.addEventListener("click", async () => {
      const replies = item.replies || [];

      if (!replies.length) {
        showEmptyReplies();
        showStatus("No replies saved for this history item.", "error");
        return;
      }

      renderReplies(replies);

      try {
        await saveRecentReplies(replies);
      } catch (error) {
        console.error("Could not save recent replies.", error);
      }

      showStatus("History replies loaded.", "success");
    });

    actions.appendChild(useTextButton);
    actions.appendChild(useRepliesButton);
    card.appendChild(textPreview);
    card.appendChild(meta);
    card.appendChild(actions);
    historyList.appendChild(card);
  });
}

async function loadReplyHistory() {
  try {
    const history = await getReplyHistory();
    renderHistory(history);
  } catch (error) {
    console.error("Could not load reply history.", error);
    showEmptyHistory();
  }
}

async function clearStoredHistory() {
  try {
    await clearReplyHistory();
    showEmptyHistory();
    showStatus("Reply history cleared.", "success");
  } catch (error) {
    showStatus("Could not clear reply history.", "error");
  }
}

async function copyReplyToClipboard(replyText, copyButton) {
  try {
    setButtonLoading(copyButton, true, "Copied", "Copy");
    await navigator.clipboard.writeText(replyText);
    showStatus("Reply copied to clipboard.", "success");
  } catch (error) {
    showStatus("Could not copy reply. Please try again.", "error");
  } finally {
    setTimeout(() => {
      setButtonLoading(copyButton, false, "Copied", "Copy");
    }, 900);
  }
}

function isSupportedXUrl(url) {
  return url && (url.startsWith("https://x.com/") || url.startsWith("https://twitter.com/"));
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function insertReplyIntoActiveTab(replyText, insertButton) {
  try {
    setButtonLoading(insertButton, true, "Inserting...", "Insert");
    const activeTab = await getActiveTab();

    if (!activeTab || !isSupportedXUrl(activeTab.url)) {
      showStatus("Open x.com or twitter.com, then click inside a reply box.", "error");
      return;
    }

    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: "INSERT_REPLY",
      replyText
    });

    if (!response || !response.success) {
      showStatus(response?.message || "Could not insert reply.", "error");
      return;
    }

    showStatus(response.message || "Reply inserted. Review it before posting.", "success");
  } catch (error) {
    showStatus("Could not connect to the X page. Refresh the tab and try again.", "error");
  } finally {
    setButtonLoading(insertButton, false, "Inserting...", "Insert");
  }
}

async function useSelectedTextFromActiveTab() {
  try {
    setButtonLoading(useSelectedTextBtn, true, "Getting...", "Use Selected Text");
    const activeTab = await getActiveTab();

    if (!activeTab || !isSupportedXUrl(activeTab.url)) {
      showStatus("Open x.com or twitter.com and select text first.", "error");
      return;
    }

    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: "GET_SELECTED_TEXT"
    });

    if (!response || !response.success) {
      showStatus(response?.message || "No selected text found.", "error");
      return;
    }

    postText.value = response.text || "";
    await saveDraftText(postText.value);
    postText.focus();
    showStatus("Selected text added.", "success");
  } catch (error) {
    showStatus("Could not get selected text. Refresh the X tab and try again.", "error");
  } finally {
    setButtonLoading(useSelectedTextBtn, false, "Getting...", "Use Selected Text");
  }
}

async function startSelectedAreaCapture() {
  try {
    const activeTab = await getActiveTab();

    if (!activeTab || !isSupportedXUrl(activeTab.url)) {
      showStatus("Open x.com or twitter.com before selecting an area.", "error");
      return;
    }

    await chrome.storage.local.set({
      pendingCaptureStatus: {
        status: "loading",
        message: "Select an area on the page."
      }
    });
    await chrome.storage.local.remove("pendingExtractedText");

    setCaptureLoading(true);
    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: "START_AREA_CAPTURE"
    });
    setCaptureLoading(false);

    if (!response || !response.success) {
      showStatus(response?.message || "Could not start area capture.", "error");
      return;
    }

    showStatus("Drag on the page to select an area. Press Escape to cancel.", "info");
    window.close();
  } catch (error) {
    setCaptureLoading(false);
    showStatus("Could not start capture. Refresh the X tab and try again.", "error");
  }
}

function renderReplies(replies) {
  clearReplies();

  if (!replies.length) {
    showEmptyReplies();
    return;
  }

  replies.forEach((reply) => {
    const card = document.createElement("article");
    card.className = "reply-card";

    const replyTextElement = document.createElement("p");
    replyTextElement.textContent = reply;

    const actions = document.createElement("div");
    actions.className = "reply-actions";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "copy-button";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", () => copyReplyToClipboard(reply, copyButton));

    const insertButton = document.createElement("button");
    insertButton.type = "button";
    insertButton.className = "insert-button";
    insertButton.textContent = "Insert";
    insertButton.addEventListener("click", () => insertReplyIntoActiveTab(reply, insertButton));

    actions.appendChild(copyButton);
    actions.appendChild(insertButton);
    card.appendChild(replyTextElement);
    card.appendChild(actions);
    replyList.appendChild(card);
  });
}

async function handleGenerateReplies() {
  const text = postText.value.trim();
  const tone = toneSelect.value;

  if (!text) {
    showStatus("Please paste some text before generating replies.", "error");
    postText.focus();
    return;
  }

  setLoading(true);
  clearReplies();
  showStatus("Generating replies...", "info");

  try {
    const result = await generateRepliesFromAPI(text, tone);

    if (!result.success) {
      showEmptyReplies();
      showStatus(result.message || "Failed to generate replies.", "error");
      return;
    }

    const replies = result.replies || [];
    renderReplies(replies);

    await saveRecentReplies(replies);
    await saveReplyHistoryItem(text, tone, replies);
    await loadReplyHistory();

    showStatus("Replies generated successfully.", "success");
  } catch (error) {
    showEmptyReplies();
    showStatus("Failed to generate replies.", "error");
  } finally {
    setLoading(false);
  }
}

async function loadSavedTone() {
  try {
    const lastTone = await getLastTone();
    const defaultTone = await getDefaultTone();

    if (lastTone) {
      toneSelect.value = lastTone;
    } else if (defaultTone) {
      toneSelect.value = defaultTone;
    }

    updateActiveQuickTone();
  } catch (error) {
    console.error("Could not load saved tone.", error);
  }
}

async function loadSettings() {
  try {
    const defaultTone = await getDefaultTone();
    const backendUrl = await getBackendUrl();

    defaultToneSelect.value = defaultTone;
    backendUrlInput.value = backendUrl;
  } catch (error) {
    console.error("Could not load settings.", error);
  }
}

async function loadDraftText() {
  try {
    const draftText = await getDraftText();

    if (!postText.value.trim() && draftText) {
      postText.value = draftText;
    }
  } catch (error) {
    console.error("Could not load draft text.", error);
  }
}

function saveCurrentDraftText() {
  saveDraftText(postText.value).catch((error) => {
    console.error("Could not save draft text.", error);
  });
}

function isValidBackendUrl(url) {
  return url.startsWith("http://") || url.startsWith("https://");
}

async function saveSettings() {
  const defaultTone = defaultToneSelect.value;
  const backendUrl = backendUrlInput.value.trim().replace(/\/$/, "");

  if (!isValidBackendUrl(backendUrl)) {
    showStatus("Backend URL must start with http:// or https://.", "error");
    backendUrlInput.focus();
    return;
  }

  try {
    await saveDefaultTone(defaultTone);
    await saveBackendUrl(backendUrl);
    toneSelect.value = defaultTone;
    updateActiveQuickTone();
    showStatus("Settings saved.", "success");
  } catch (error) {
    showStatus("Could not save settings.", "error");
  }
}

async function checkBackendStatus() {
  setButtonLoading(testBackendBtn, true, "Checking...", "Check Backend");
  showStatus("Checking backend connection...", "info");

  try {
    const result = await checkBackendHealthAPI();

    if (!result.success) {
      showStatus(result.message || "Backend is not running.", "error");
      return;
    }

    showStatus(result.message || "Backend is connected.", "success");
  } catch (error) {
    showStatus("Backend is not running or not reachable.", "error");
  } finally {
    setButtonLoading(testBackendBtn, false, "Checking...", "Check Backend");
  }
}

async function resetExtension() {
  const shouldReset = confirm("Reset all saved extension data?");

  if (!shouldReset) {
    return;
  }

  try {
    await resetAllExtensionData();

    postText.value = "";
    toneSelect.value = "friendly";
    defaultToneSelect.value = "friendly";
    backendUrlInput.value = "http://127.0.0.1:5000";
    showEmptyReplies();
    showEmptyHistory();
    updateActiveQuickTone();
    showStatus("Extension reset successfully.", "success");
  } catch (error) {
    showStatus("Could not reset extension data.", "error");
  }
}

async function loadRecentReplies() {
  try {
    const recentReplies = await getRecentReplies();

    if (recentReplies.length) {
      renderReplies(recentReplies);
      showStatus("Recent replies loaded.", "info");
    }
  } catch (error) {
    console.error("Could not load recent replies.", error);
  }
}

async function loadPendingCaptureResult() {
  try {
    const result = await chrome.storage.local.get([
      "pendingExtractedText",
      "pendingCaptureStatus"
    ]);
    const pendingStatus = result.pendingCaptureStatus;
    const pendingText = result.pendingExtractedText;

    if (pendingText) {
      postText.value = pendingText;
      showStatus(pendingStatus?.message || "Text extracted from selected area.", "success");
      await saveDraftText(postText.value);
      await chrome.storage.local.remove(["pendingExtractedText", "pendingCaptureStatus"]);
      return;
    }

    if (pendingStatus?.status === "error") {
      showStatus(pendingStatus.message || "Selected area capture failed.", "error");
      await chrome.storage.local.remove("pendingCaptureStatus");
      return;
    }

    if (pendingStatus?.status === "loading") {
      showStatus(pendingStatus.message || "Area capture is in progress.", "info");
    }
  } catch (error) {
    console.error("Could not load pending capture result.", error);
  }
}

async function initializePopup() {
  await loadSettings();
  await loadDraftText();
  await loadSavedTone();
  await loadRecentReplies();
  await loadReplyHistory();
  await loadPendingCaptureResult();
}

async function handleScreenshotSelected(event) {
  const file = event.target.files[0];

  if (!file) {
    return;
  }

  setScreenshotLoading(true);
  showStatus("Extracting text from screenshot...", "info");

  try {
    const imageData = await convertImageToDataURL(file);
    const result = await extractTextFromImageAPI(imageData);

    if (!result.success) {
      showStatus(result.message || "Could not extract text from screenshot.", "error");
      return;
    }

    postText.value = result.text || "";
    await saveDraftText(postText.value);
    showStatus("Text extracted from screenshot.", "success");
  } catch (error) {
    showStatus(error.message || "Could not process screenshot.", "error");
  } finally {
    setScreenshotLoading(false);
    screenshotInput.value = "";
  }
}

function toggleDetails(detailsElement) {
  detailsElement.open = !detailsElement.open;
}

function handleKeyboardShortcuts(event) {
  if (event.key === "Escape") {
    statusMessage.textContent = "";
    delete statusMessage.dataset.type;
    return;
  }

  if (!event.ctrlKey) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    generateRepliesButton.click();
    return;
  }

  const shortcutKey = event.key.toLowerCase();

  if (shortcutKey === "l") {
    event.preventDefault();
    clearTextBtn.click();
    return;
  }

  if (shortcutKey === "h") {
    event.preventDefault();
    toggleDetails(historyDetails);
    return;
  }

  if (shortcutKey === "s") {
    event.preventDefault();
    toggleDetails(settingsDetails);
  }
}

generateRepliesButton.addEventListener("click", handleGenerateReplies);

regenerateBtn.addEventListener("click", handleGenerateReplies);

useSelectedTextBtn.addEventListener("click", useSelectedTextFromActiveTab);

quickToneButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tone = button.dataset.tone;
    toneSelect.value = tone;
    updateActiveQuickTone();
    showStatus(`${button.textContent} tone selected.`, "success");

    saveLastTone(tone).catch((error) => {
      console.error("Could not save selected tone.", error);
    });
  });
});

toneSelect.addEventListener("change", () => {
  updateActiveQuickTone();

  saveLastTone(toneSelect.value).catch((error) => {
    console.error("Could not save selected tone.", error);
  });
});

postText.addEventListener("input", saveCurrentDraftText);

uploadScreenshotButton.addEventListener("click", () => {
  screenshotInput.click();
});

screenshotInput.addEventListener("change", handleScreenshotSelected);

captureSelectedAreaButton.addEventListener("click", startSelectedAreaCapture);

clearTextBtn.addEventListener("click", clearText);

clearRepliesBtn.addEventListener("click", clearStoredReplies);

clearHistoryBtn.addEventListener("click", clearStoredHistory);

saveSettingsBtn.addEventListener("click", saveSettings);

testBackendBtn.addEventListener("click", checkBackendStatus);

resetExtensionBtn.addEventListener("click", resetExtension);

document.addEventListener("keydown", handleKeyboardShortcuts);

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "CAPTURE_OCR_DONE") {
    return;
  }

  if (message.success && message.text) {
    postText.value = message.text;
    showStatus(message.message || "Text extracted from selected area.", "success");
    saveCurrentDraftText();
    chrome.storage.local.remove(["pendingExtractedText", "pendingCaptureStatus"]);
    return;
  }

  showStatus(message.message || "Selected area capture failed.", "error");
  chrome.storage.local.remove("pendingCaptureStatus");
});

initializePopup();
