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
const captureAreaWrap = document.getElementById("captureAreaWrap");
const captureUnsupportedNote = document.getElementById("captureUnsupportedNote");
const analyzeImageWithReply = document.getElementById("analyzeImageWithReply");
const attachedImageStatus = document.getElementById("attachedImageStatus");
const clearAttachedImageBtn = document.getElementById("clearAttachedImageBtn");
const clearTextBtn = document.getElementById("clearTextBtn");
const clearRepliesBtn = document.getElementById("clearRepliesBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const defaultToneSelect = document.getElementById("defaultToneSelect");
const defaultToneMenuButton = document.getElementById("defaultToneMenuButton");
const defaultToneMenuLabel = document.getElementById("defaultToneMenuLabel");
const defaultToneMenu = document.getElementById("defaultToneMenu");
const defaultToneOptions = defaultToneMenu.querySelectorAll(".default-tone-option");
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
const CAPTURE_AREA_UNSUPPORTED_KEY = "captureAreaUnsupported";
const CAPTURE_AREA_MOBILE_MESSAGE = "Capture Area is not supported on this mobile browser. Use Upload Screenshot.";
const LATEST_SELECTED_TEXT_KEY = "latestSelectedText";
let attachedImageData = "";
let isCaptureAreaUnsupported = false;

function showStatus(message, type = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.type = type;
}

function showBackendStatus(message, type = "info") {
  backendStatusMessage.textContent = message;
  backendStatusMessage.dataset.type = type;
}

function isMobileBrowser() {
  const userAgent = navigator.userAgent || "";
  const hasCoarsePointer = window.matchMedia?.("(pointer: coarse)").matches;

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent) ||
    Boolean(hasCoarsePointer && navigator.maxTouchPoints > 1);
}

function getCaptureErrorMessage(message) {
  if ((message || "").includes("not supported by this mobile browser")) {
    return CAPTURE_AREA_MOBILE_MESSAGE;
  }

  return message || "Selected area capture failed.";
}

function isCaptureUnsupportedError(message) {
  return /not supported by this mobile browser|capture area is not supported|capturevisibletab/i.test(message || "");
}

function updateCaptureAreaAvailability() {
  const shouldHideCapture = isMobileBrowser() && isCaptureAreaUnsupported;

  captureAreaWrap.classList.toggle("is-unsupported", shouldHideCapture);
  captureUnsupportedNote.hidden = !shouldHideCapture;
  captureSelectedAreaButton.disabled = shouldHideCapture;
  captureSelectedAreaButton.setAttribute("aria-hidden", shouldHideCapture ? "true" : "false");
}

async function markCaptureAreaUnsupported() {
  if (!isMobileBrowser()) {
    return;
  }

  isCaptureAreaUnsupported = true;
  await chrome.storage.local.set({ [CAPTURE_AREA_UNSUPPORTED_KEY]: true });
  updateCaptureAreaAvailability();
}

async function loadCaptureAreaSupportState() {
  try {
    const result = await chrome.storage.local.get(CAPTURE_AREA_UNSUPPORTED_KEY);
    isCaptureAreaUnsupported = Boolean(result[CAPTURE_AREA_UNSUPPORTED_KEY]);
  } catch (error) {
    isCaptureAreaUnsupported = false;
  }

  updateCaptureAreaAvailability();
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
  captureSelectedAreaButton.disabled = isLoading || (isMobileBrowser() && isCaptureAreaUnsupported);
  clearAttachedImageBtn.disabled = isLoading || !attachedImageData;
}

function setScreenshotLoading(isLoading) {
  setButtonLoading(uploadScreenshotButton, isLoading, "Extracting...", "Upload Screenshot");
  generateRepliesButton.disabled = isLoading;
  regenerateBtn.disabled = isLoading;
  useSelectedAsContextBtn.disabled = isLoading;
  useSelectedTextBtn.disabled = isLoading;
  captureSelectedAreaButton.disabled = isLoading || (isMobileBrowser() && isCaptureAreaUnsupported);
  clearAttachedImageBtn.disabled = isLoading || !attachedImageData;
}

function setCaptureLoading(isLoading) {
  setButtonLoading(captureSelectedAreaButton, isLoading, "Starting...", "Capture Area");
  updateCaptureAreaAvailability();
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

function syncDefaultToneMenu() {
  syncMenu(defaultToneSelect, defaultToneMenuLabel, defaultToneOptions);
}

function setMenuOpen(menuElement, buttonElement, isOpen) {
  menuElement.hidden = !isOpen;
  buttonElement.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function setToneMenuOpen(isOpen) {
  setMenuOpen(toneMenu, toneMenuButton, isOpen);
}

function setDefaultToneMenuOpen(isOpen) {
  setMenuOpen(defaultToneMenu, defaultToneMenuButton, isOpen);
}

function clearReplies() {
  replyList.innerHTML = "";
}

function enforceImageAnalysisAlwaysOn() {
  analyzeImageWithReply.checked = true;
  analyzeImageWithReply.disabled = true;
}

function updateAttachedImageStatus() {
  enforceImageAnalysisAlwaysOn();
  attachedImageStatus.textContent = attachedImageData
    ? "Image attached for AI analysis"
    : "No image attached";
  clearAttachedImageBtn.disabled = !attachedImageData;
}

function clearAttachedImage() {
  attachedImageData = "";
  enforceImageAnalysisAlwaysOn();
  updateAttachedImageStatus();
  showStatus("Attached image cleared.", "success");
}

function showEmptyReplies() {
  replyList.innerHTML = '<p class="empty-message">No replies generated yet.</p>';
}

function showEmptyHistory() {
  historyList.innerHTML = '<p class="empty-message">No reply history yet.</p>';
}

function clearText() {
  contextText.value = "";
  postText.value = "";
  postText.focus();
  showStatus("Text cleared.", "success");

  clearDraftText().catch((error) => {
    console.error("Could not clear draft text.", error);
  });
  clearDraftContextText().catch((error) => {
    console.error("Could not clear draft context.", error);
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
  if (isMobileBrowser() && isCaptureAreaUnsupported) {
    showStatus(CAPTURE_AREA_MOBILE_MESSAGE, "info");
    return;
  }

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
      const errorMessage = getCaptureErrorMessage(response?.message || "Could not start area capture.");

      if (isCaptureUnsupportedError(errorMessage)) {
        await markCaptureAreaUnsupported();
      }

      showStatus(errorMessage, "error");
      return;
    }

    showStatus(response.message || "Drag with finger to select area. Tap Cancel to stop.", "info");
    window.close();
  } catch (error) {
    setCaptureLoading(false);
    const errorMessage = getCaptureErrorMessage(error.message || "Could not start capture. Refresh the X tab and try again.");

    if (isCaptureUnsupportedError(errorMessage)) {
      await markCaptureAreaUnsupported();
    }

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

  if (!text && !imageData) {
    showStatus("Paste text or attach an image before generating replies.", "error");
    contextText.focus();
    return;
  }

  setLoading(true);
  clearReplies();
  showStatus("Generating replies...", "info");

  try {
    const result = await generateRepliesFromAPI(text, tone, replyText ? context : "", imageData);

    if (!result.success) {
      showEmptyReplies();
      showStatus(result.message || "Failed to generate replies.", "error");
      return;
    }

    const replies = result.replies || [];
    renderReplies(replies);

    await saveRecentReplies(replies);
    await saveReplyHistoryItem(text, tone, replies, context, replyText);
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

    syncToneMenu();
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
    syncDefaultToneMenu();
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
  const defaultTone = defaultToneSelect.value;
  const backendUrl = backendUrlInput.value.trim().replace(/\/$/, "");

  if (backendUrl !== "https://assist-qw4s.onrender.com") {
    showStatus("Use the production Render backend URL.", "error");
    backendUrlInput.value = "https://assist-qw4s.onrender.com";
    backendUrlInput.focus();
    return;
  }

  try {
    await saveDefaultTone(defaultTone);
    await saveBackendUrl(backendUrl);
    toneSelect.value = defaultTone;
    syncToneMenu();
    showStatus("Settings saved.", "success");
  } catch (error) {
    showStatus("Could not save settings.", "error");
  }
}

async function checkBackendStatus() {
  setButtonLoading(testBackendBtn, true, "Checking...", "Check Backend");
  showStatus("Checking backend connection...", "info");
  showBackendStatus("Checking backend connection...", "info");

  try {
    const result = await checkBackendHealthAPI();

    if (!result.success) {
      const message = result.message || "Backend is not running.";
      showStatus(message, "error");
      showBackendStatus(message, "error");
      return;
    }

    const message = result.message || "Backend is connected.";
    showStatus(message, "success");
    showBackendStatus(message, "success");
  } catch (error) {
    const message = "Backend is not running or not reachable.";
    showStatus(message, "error");
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
    defaultToneSelect.value = "friendly";
    backendUrlInput.value = "https://assist-qw4s.onrender.com";
    isCaptureAreaUnsupported = false;
    enforceImageAnalysisAlwaysOn();
    showEmptyReplies();
    showEmptyHistory();
    syncToneMenu();
    syncDefaultToneMenu();
    updateCaptureAreaAvailability();
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
      const errorMessage = getCaptureErrorMessage(pendingStatus.message);

      if (isCaptureUnsupportedError(errorMessage)) {
        await markCaptureAreaUnsupported();
      }

      showStatus(errorMessage, "error");
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
  await loadCaptureAreaSupportState();
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
    attachedImageData = imageData;
    enforceImageAnalysisAlwaysOn();
    updateAttachedImageStatus();
    showStatus("Image attached for analysis. Extracting text...", "info");

    const result = await extractTextFromImageAPI(imageData);

    if (!result.success) {
      showStatus(result.message || "Image attached, but OCR could not extract text.", "error");
      return;
    }

    postText.value = result.text || "";
    await saveDraftText(postText.value);
    showStatus("Text extracted. Image attached for AI analysis.", "success");
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
    setDefaultToneMenuOpen(false);
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

defaultToneMenuButton.addEventListener("click", () => {
  setDefaultToneMenuOpen(defaultToneMenu.hidden);
});

defaultToneOptions.forEach((option) => {
  option.addEventListener("click", () => {
    defaultToneSelect.value = option.dataset.tone;
    syncDefaultToneMenu();
    setDefaultToneMenuOpen(false);
  });
});

toneSelect.addEventListener("change", () => {
  syncToneMenu();

  saveLastTone(toneSelect.value).catch((error) => {
    console.error("Could not save selected tone.", error);
  });
});

defaultToneSelect.addEventListener("change", syncDefaultToneMenu);

document.addEventListener("click", (event) => {
  if (!toneMenu.hidden && !event.target.closest("#toneSelectMenu")) {
    setToneMenuOpen(false);
  }

  if (!defaultToneMenu.hidden && !event.target.closest("#defaultToneSelectMenu")) {
    setDefaultToneMenuOpen(false);
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

  if (message.success && message.text) {
    postText.value = message.text;
    showStatus(message.message || "Text extracted from selected area.", "success");
    saveCurrentDraftText();
    chrome.storage.local.remove(["pendingExtractedText", "pendingCaptureStatus"]);
    return;
  }

  const errorMessage = getCaptureErrorMessage(message.message);

  if (isCaptureUnsupportedError(errorMessage)) {
    markCaptureAreaUnsupported().catch((error) => {
      console.error("Could not save capture support state.", error);
    });
  }

  showStatus(errorMessage, "error");
  chrome.storage.local.remove("pendingCaptureStatus");
});

initializePopup();
enforceImageAnalysisAlwaysOn();
updateAttachedImageStatus();
updateCaptureAreaAvailability();
