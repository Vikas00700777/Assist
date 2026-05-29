const contextText = document.getElementById("contextText");
const postText = document.getElementById("postText");
const toneSelect = document.getElementById("toneSelect");
const toneMenuButton = document.getElementById("toneMenuButton");
const toneMenuLabel = document.getElementById("toneMenuLabel");
const toneMenu = document.getElementById("toneMenu");
const toneOptions = toneMenu.querySelectorAll(".tone-option");
const generateRepliesButton = document.getElementById("generateRepliesButton");
const regenerateBtn = document.getElementById("regenerateBtn");
const useSelectedAsContextBtn = document.getElementById("useSelectedAsContextBtn");
const useSelectedTextBtn = document.getElementById("useSelectedTextBtn");
const uploadScreenshotButton = document.getElementById("uploadScreenshotButton");
const screenshotInput = document.getElementById("screenshotInput");
const captureSelectedAreaButton = document.getElementById("captureSelectedAreaButton");
const visualContextRow = document.getElementById("visualContextRow");
const attachedImageStatus = document.getElementById("attachedImageStatus");
const clearAttachedImageBtn = document.getElementById("clearAttachedImageBtn");
const clearTextBtn = document.getElementById("clearTextBtn");
const clearRepliesBtn = document.getElementById("clearRepliesBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const backendUrlInput = document.getElementById("backendUrlInput");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const testBackendBtn = document.getElementById("testBackendBtn");
const backendStatusMessage = document.getElementById("backendStatusMessage");
const resetExtensionBtn = document.getElementById("resetExtensionBtn");
const historyDetails = document.getElementById("historyDetails");
const settingsDetails = document.getElementById("settingsDetails");
const statusMessage = document.getElementById("statusMessage");
const replyList = document.getElementById("replyList");
const historyList = document.getElementById("historyList");
const LATEST_SELECTED_TEXT_KEY = "latestSelectedText";
const LAST_CAPTURED_CONTEXT_TEXT_KEY = "lastCapturedContextText";
let attachedImageData = "";
let statusHideTimer = null;

function showStatus(message, type = "info") {
  if (statusHideTimer) {
    clearTimeout(statusHideTimer);
    statusHideTimer = null;
  }

  statusMessage.textContent = message;
  statusMessage.dataset.type = type;

  if (!message) {
    return;
  }

  statusHideTimer = setTimeout(() => {
    statusMessage.textContent = "";
    statusHideTimer = null;
  }, type === "error" ? 5200 : 3600);
}

function showBackendStatus(message, type = "info") {
  backendStatusMessage.textContent = message;
  backendStatusMessage.dataset.type = type;
}

function getCaptureErrorMessage(message) {
  if ((message || "").toLowerCase() === "failed to fetch") {
    return "Captured image attached. Click Generate Replies.";
  }

  return message || "Selected area capture failed.";
}

function setButtonLoading(button, isLoading, loadingText, normalText) {
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : normalText;
  button.classList.toggle("loading", isLoading);
}

function setLoading(isLoading) {
  setButtonLoading(generateRepliesButton, isLoading, "Generating...", "Generate Replies");
  setButtonLoading(regenerateBtn, isLoading, "Regenerating...", "Regenerate Replies");
  useSelectedAsContextBtn.disabled = isLoading;
  useSelectedTextBtn.disabled = isLoading;
  uploadScreenshotButton.disabled = isLoading;
  captureSelectedAreaButton.disabled = isLoading;
  clearAttachedImageBtn.disabled = isLoading || !attachedImageData;
}

function setScreenshotLoading(isLoading) {
  setButtonLoading(uploadScreenshotButton, isLoading, "Analyzing...", "Upload Image / Screenshot");
  generateRepliesButton.disabled = isLoading;
  regenerateBtn.disabled = isLoading;
  useSelectedAsContextBtn.disabled = isLoading;
  useSelectedTextBtn.disabled = isLoading;
  captureSelectedAreaButton.disabled = isLoading;
  clearAttachedImageBtn.disabled = isLoading || !attachedImageData;
}

function setCaptureLoading(isLoading) {
  setButtonLoading(captureSelectedAreaButton, isLoading, "Starting...", "Capture Area");
}

function getToneLabel(selectElement, tone) {
  const selectedOption = selectElement.querySelector(`option[value="${tone}"]`);
  return selectedOption ? selectedOption.textContent : "Friendly";
}

function syncMenu(selectElement, labelElement, options) {
  labelElement.textContent = getToneLabel(selectElement, selectElement.value);

  options.forEach((option) => {
    const isSelected = option.dataset.tone === selectElement.value;
    option.classList.toggle("selected", isSelected);
    option.setAttribute("aria-selected", isSelected ? "true" : "false");
  });
}

function syncToneMenu() {
  syncMenu(toneSelect, toneMenuLabel, toneOptions);
}

function setMenuOpen(menuElement, buttonElement, isOpen) {
  menuElement.hidden = !isOpen;
  buttonElement.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function setToneMenuOpen(isOpen) {
  setMenuOpen(toneMenu, toneMenuButton, isOpen);
}

function clearReplies() {
  replyList.innerHTML = "";
}

function updateAttachedImageStatus() {
  visualContextRow.hidden = !attachedImageData;
  attachedImageStatus.textContent = attachedImageData
    ? "Visual context ready"
    : "";
  clearAttachedImageBtn.disabled = !attachedImageData;
}

function clearAttachedImage() {
  attachedImageData = "";
  updateAttachedImageStatus();
  showStatus("Visual context cleared.", "success");
}

function attachCapturedImage(imageData) {
  if (!imageData) {
    return false;
  }

  attachedImageData = imageData;
  updateAttachedImageStatus();
  return true;
}

function mergeContextText(existingText, addedText) {
  const current = (existingText || "").trim();
  const next = (addedText || "").trim();

  if (!next || next === "No readable text found") {
    return current;
  }

  if (!current) {
    return next;
  }

  if (current.includes(next)) {
    return current;
  }

  return `${current}\n\n${next}`;
}

function removeContextTextBlock(existingText, textToRemove) {
  const current = (existingText || "").trim();
  const previous = (textToRemove || "").trim();

  if (!current || !previous) {
    return current;
  }

  if (current === previous) {
    return "";
  }

  return current
    .replace(`\n\n${previous}`, "")
    .replace(`${previous}\n\n`, "")
    .replace(previous, "")
    .trim();
}

async function removeLastCapturedContextText() {
  const result = await chrome.storage.local.get(LAST_CAPTURED_CONTEXT_TEXT_KEY);
  const lastCapturedText = result[LAST_CAPTURED_CONTEXT_TEXT_KEY];

  if (!lastCapturedText) {
    return;
  }

  const nextContext = removeContextTextBlock(contextText.value, lastCapturedText);

  if (nextContext !== contextText.value.trim()) {
    contextText.value = nextContext;
    await saveDraftContextText(contextText.value);
  }

  await chrome.storage.local.remove(LAST_CAPTURED_CONTEXT_TEXT_KEY);
}

async function rememberCapturedContextText(capturedText) {
  const text = (capturedText || "").trim();

  if (!text || text === "No readable text found") {
    await chrome.storage.local.remove(LAST_CAPTURED_CONTEXT_TEXT_KEY);
    return;
  }

  await chrome.storage.local.set({ [LAST_CAPTURED_CONTEXT_TEXT_KEY]: text });
}

function showEmptyReplies() {
  showReplyListMessage("Your suggested replies will appear here.");
}

function showReplyListMessage(message, type = "empty") {
  const messageElement = document.createElement("p");
  messageElement.className = "empty-message";
  messageElement.dataset.type = type;
  messageElement.textContent = message;

  replyList.replaceChildren(messageElement);
}

function showEmptyHistory() {
  historyList.innerHTML = '<p class="empty-message">No reply history yet.</p>';
}

function clearText() {
  contextText.value = "";
  postText.value = "";
  attachedImageData = "";
  updateAttachedImageStatus();
  showStatus("Text and visual context cleared.", "success");

  clearDraftText().catch((error) => {
    console.error("Could not clear draft text.", error);
  });
  clearDraftContextText().catch((error) => {
    console.error("Could not clear draft context.", error);
  });
  chrome.storage.local.remove(LAST_CAPTURED_CONTEXT_TEXT_KEY).catch((error) => {
    console.error("Could not clear last captured text.", error);
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
      contextText.value = item.context || "";
      postText.value = item.replyText ?? item.text ?? "";
      saveCurrentDraftContextText();
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
  return url && (
    url.startsWith("https://x.com/") ||
    url.startsWith("https://twitter.com/") ||
    url.startsWith("https://mobile.twitter.com/")
  );
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function prepareAreaCaptureInTab(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const scrollableElements = Array.from(document.querySelectorAll("*"))
        .filter((element) => element.scrollTop || element.scrollLeft)
        .map((element, index) => {
          if (!element.dataset.aiReplyCaptureScrollId) {
            element.dataset.aiReplyCaptureScrollId = `scroll-${Date.now()}-${index}`;
          }

          return {
            id: element.dataset.aiReplyCaptureScrollId,
            left: element.scrollLeft,
            top: element.scrollTop
          };
        });

      window.__aiReplyCaptureScrollSnapshot = {
        windowLeft: window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft || 0,
        windowTop: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
        elements: scrollableElements
      };
    }
  });
}

async function openAreaCaptureInTab(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content/capture.css"]
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/capture.js"]
  });
}

async function insertReplyIntoActiveTab(replyText, insertButton) {
  try {
    setButtonLoading(insertButton, true, "Inserting...", "Insert");
    const activeTab = await getActiveTab();

    if (!activeTab || !isSupportedXUrl(activeTab.url)) {
      showStatus("Open X or Twitter, then click inside a reply box.", "error");
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

    insertButton.textContent = "Inserted";
    showStatus(response.message || "Reply inserted. Review it before posting.", "success");
  } catch (error) {
    showStatus("Could not connect to the X page. Refresh the tab and try again.", "error");
  } finally {
    setTimeout(() => {
      setButtonLoading(insertButton, false, "Inserting...", "Insert");
    }, 500);
  }
}

async function getStoredLatestSelectedText() {
  const result = await chrome.storage.local.get(LATEST_SELECTED_TEXT_KEY);
  return (result[LATEST_SELECTED_TEXT_KEY] || "").trim();
}

async function getLatestSelectedText() {
  const activeTab = await getActiveTab();

  if (activeTab && isSupportedXUrl(activeTab.url)) {
    try {
      const response = await chrome.tabs.sendMessage(activeTab.id, {
        type: "GET_SELECTED_TEXT"
      });

      if (response?.success && response.text?.trim()) {
        return response.text.trim();
      }
    } catch (error) {
      console.error("Could not get selected text from content script.", error);
    }
  }

  return getStoredLatestSelectedText();
}

async function useSelectedTextFromActiveTab(targetElement, button, successMessage) {
  const normalText = button.dataset.normalText || button.textContent;

  try {
    setButtonLoading(button, true, "Getting...", normalText);
    const selectedText = await getLatestSelectedText();

    if (!selectedText) {
      showStatus("Please select text on X first.", "error");
      return;
    }

    targetElement.value = selectedText;

    if (targetElement === contextText) {
      await saveDraftContextText(targetElement.value);
    } else {
      await saveDraftText(targetElement.value);
    }

    targetElement.focus();
    showStatus(successMessage, "success");
  } catch (error) {
    showStatus("Please select text on X first.", "error");
  } finally {
    setButtonLoading(button, false, "Getting...", normalText);
  }
}

async function startSelectedAreaCapture() {
  try {
    const activeTab = await getActiveTab();

    if (!activeTab || !isSupportedXUrl(activeTab.url)) {
      showStatus("Open X or Twitter before selecting an area.", "error");
      return;
    }

    await chrome.storage.local.set({
      pendingCaptureStatus: {
        status: "loading",
        message: "Select an area on the page."
      }
    });
    await chrome.storage.local.remove("pendingExtractedText");
    await removeLastCapturedContextText();

    setCaptureLoading(true);
    await prepareAreaCaptureInTab(activeTab.id);
    await openAreaCaptureInTab(activeTab.id);
    setCaptureLoading(false);

    showStatus("Drag to select an area. Press Esc or Cancel to stop.", "info");
    window.close();
  } catch (error) {
    setCaptureLoading(false);
    const errorMessage = getCaptureErrorMessage(error.message || "Could not start capture. Refresh the X tab and try again.");

    showStatus(errorMessage, "error");
  }
}

function renderReplies(replies) {
  clearReplies();

  if (!replies.length) {
    showEmptyReplies();
    return;
  }

  replies.forEach((reply, index) => {
    const card = document.createElement("article");
    card.className = "reply-card";
    card.style.animationDelay = `${Math.min(index * 35, 240)}ms`;

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
  const context = contextText.value.trim();
  const replyText = postText.value.trim();
  const text = replyText || context;
  const tone = toneSelect.value;
  const imageData = attachedImageData;

  if (!context && !replyText && !imageData) {
    showStatus("Add text, upload an image, or capture an area before generating replies.", "error");
    contextText.focus();
    return;
  }

  setLoading(true);
  showReplyListMessage("Generating thoughtful reply suggestions...", "loading");
  showStatus("", "info");

  try {
    const result = await generateRepliesFromAPI(text, tone, context, imageData);

    if (!result.success) {
      showReplyListMessage(result.message || "We could not generate replies. Please try again.", "error");
      showStatus(result.message || "Failed to generate replies.", "error");
      return;
    }

    const replies = result.replies || [];
    renderReplies(replies);

    await saveRecentReplies(replies);
    await saveReplyHistoryItem(context || text, tone, replies, context, replyText);
    await loadReplyHistory();

    showStatus("Replies generated successfully.", "success");
  } catch (error) {
    showReplyListMessage("We could not generate replies. Please try again.", "error");
    showStatus("Failed to generate replies.", "error");
  } finally {
    setLoading(false);
  }
}

async function loadSavedTone() {
  try {
    const lastTone = await getLastTone();

    if (lastTone) {
      toneSelect.value = lastTone;
    }

    syncToneMenu();
  } catch (error) {
    console.error("Could not load saved tone.", error);
  }
}

async function loadSettings() {
  try {
    const backendUrl = await getBackendUrl();

    backendUrlInput.value = backendUrl;
  } catch (error) {
    console.error("Could not load settings.", error);
  }
}

async function loadDraftText() {
  try {
    const draftContextText = await getDraftContextText();
    const draftText = await getDraftText();

    if (!contextText.value.trim() && draftContextText) {
      contextText.value = draftContextText;
    }

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

function saveCurrentDraftContextText() {
  saveDraftContextText(contextText.value).catch((error) => {
    console.error("Could not save draft context.", error);
  });
}

async function saveSettings() {
  const backendUrl = backendUrlInput.value.trim().replace(/\/$/, "");

  if (!/^https?:\/\/.+/i.test(backendUrl)) {
    showStatus("Enter a valid backend URL.", "error");
    backendUrlInput.focus();
    return;
  }

  try {
    await saveBackendUrl(backendUrl);
    showStatus("Settings saved.", "success");
  } catch (error) {
    showStatus("Could not save settings.", "error");
  }
}

async function checkBackendStatus() {
  setButtonLoading(testBackendBtn, true, "Checking...", "Check Backend");
  showBackendStatus("Checking backend connection...", "info");

  try {
    const result = await checkBackendHealthAPI();

    if (!result.success) {
      const message = result.message || "Backend is not running.";
      showBackendStatus(message, "error");
      return;
    }

    const message = result.message || "Backend is connected.";
    showBackendStatus(message, "success");
  } catch (error) {
    const message = "Backend is not running or not reachable.";
    showBackendStatus(message, "error");
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

    contextText.value = "";
    postText.value = "";
    toneSelect.value = "friendly";
    backendUrlInput.value = "https://assist-qw4s.onrender.com";
    attachedImageData = "";
    updateAttachedImageStatus();
    showEmptyReplies();
    showEmptyHistory();
    syncToneMenu();
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
      "pendingCapturedImage",
      "pendingCaptureStatus"
    ]);
    const pendingStatus = result.pendingCaptureStatus;
    const pendingText = result.pendingExtractedText;
    const pendingImage = result.pendingCapturedImage;

    if (pendingText) {
      attachCapturedImage(pendingImage);
      contextText.value = mergeContextText(contextText.value, pendingText);
      showStatus(pendingStatus?.message || "Capture analyzed and added to context.", "success");
      await rememberCapturedContextText(pendingText);
      await saveDraftContextText(contextText.value);
      await chrome.storage.local.remove(["pendingExtractedText", "pendingCapturedImage", "pendingCaptureStatus"]);
      return;
    }

    if (pendingImage) {
      attachCapturedImage(pendingImage);
    }

    if (pendingImage && pendingStatus?.status === "success") {
      showStatus(pendingStatus.message || "Visual context ready. Click Generate Replies.", "success");
      await chrome.storage.local.remove(["pendingCapturedImage", "pendingCaptureStatus"]);
      return;
    }

    if (pendingStatus?.status === "error") {
      const errorMessage = getCaptureErrorMessage(pendingStatus.message);

      showStatus(pendingImage ? "Visual context ready. Click Generate Replies." : errorMessage, pendingImage ? "success" : "error");
      await chrome.storage.local.remove(["pendingCapturedImage", "pendingCaptureStatus"]);
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
  showStatus("Analyzing image context...", "info");

  try {
    const imageData = await convertImageToDataURL(file);
    attachedImageData = imageData;
    updateAttachedImageStatus();
    showStatus("Image context ready. Reading visible text...", "info");

    const result = await extractTextFromImageAPI(imageData);

    if (!result.success) {
      showStatus("Image context ready. Click Generate Replies.", "success");
      return;
    }

    contextText.value = mergeContextText(contextText.value, result.text || "");
    await saveDraftContextText(contextText.value);
    showStatus("Image and visible text added to context.", "success");
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
    setToneMenuOpen(false);
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

useSelectedAsContextBtn.dataset.normalText = "Use Selected Text as Context";
useSelectedTextBtn.dataset.normalText = "Use Selected Text as Reply";

generateRepliesButton.addEventListener("click", handleGenerateReplies);

regenerateBtn.addEventListener("click", handleGenerateReplies);

useSelectedAsContextBtn.addEventListener("click", () => {
  useSelectedTextFromActiveTab(contextText, useSelectedAsContextBtn, "Selected text added as context.");
});

useSelectedTextBtn.addEventListener("click", () => {
  useSelectedTextFromActiveTab(postText, useSelectedTextBtn, "Selected text added as reply.");
});

toneMenuButton.addEventListener("click", () => {
  setToneMenuOpen(toneMenu.hidden);
});

toneOptions.forEach((option) => {
  option.addEventListener("click", () => {
    toneSelect.value = option.dataset.tone;
    syncToneMenu();
    setToneMenuOpen(false);

    saveLastTone(toneSelect.value).catch((error) => {
      console.error("Could not save selected tone.", error);
    });
  });
});

toneSelect.addEventListener("change", () => {
  syncToneMenu();

  saveLastTone(toneSelect.value).catch((error) => {
    console.error("Could not save selected tone.", error);
  });
});

document.addEventListener("click", (event) => {
  if (!toneMenu.hidden && !event.target.closest("#toneSelectMenu")) {
    setToneMenuOpen(false);
  }
});

contextText.addEventListener("input", saveCurrentDraftContextText);
postText.addEventListener("input", saveCurrentDraftText);

uploadScreenshotButton.addEventListener("click", () => {
  screenshotInput.click();
});

screenshotInput.addEventListener("change", handleScreenshotSelected);

captureSelectedAreaButton.addEventListener("click", startSelectedAreaCapture);

clearAttachedImageBtn.addEventListener("click", clearAttachedImage);

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

  attachCapturedImage(message.imageData);

  if (message.success && message.text) {
    contextText.value = mergeContextText(contextText.value, message.text);
    showStatus(message.message || "Capture analyzed and added to context.", "success");
    rememberCapturedContextText(message.text).catch((error) => {
      console.error("Could not save last captured text.", error);
    });
    saveCurrentDraftContextText();
    chrome.storage.local.remove(["pendingExtractedText", "pendingCapturedImage", "pendingCaptureStatus"]);
    return;
  }

  const errorMessage = getCaptureErrorMessage(message.message);

  showStatus(message.imageData ? "Visual context ready. Click Generate Replies." : errorMessage, message.imageData ? "success" : "error");
  chrome.storage.local.remove(["pendingCapturedImage", "pendingCaptureStatus"]);
});

initializePopup();
updateAttachedImageStatus();
