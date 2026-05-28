function getContentEditableBox(element) {
  if (!element) {
    return null;
  }

  if (element.getAttribute("contenteditable") === "true") {
    return element;
  }

  return element.closest?.('[contenteditable="true"]') || null;
}

function findReplyBox() {
  const focusedReplyBox = getContentEditableBox(document.activeElement);

  if (focusedReplyBox) {
    return focusedReplyBox;
  }

  return (
    getContentEditableBox(document.querySelector('[data-testid="tweetTextarea_0"]')) ||
    getContentEditableBox(document.querySelector('[role="textbox"]'))
  );
}

function dispatchEditorEvents(replyBox, replyText) {
  replyBox.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType: "insertText",
    data: replyText
  }));
  replyBox.dispatchEvent(new Event("change", { bubbles: true }));
}

function replaceEditorText(replyBox, replyText) {
  replyBox.focus();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(replyBox);
  selection.removeAllRanges();
  selection.addRange(range);

  if (!document.execCommand("insertText", false, replyText)) {
    replyBox.textContent = replyText;
    dispatchEditorEvents(replyBox, replyText);
  }
}

function insertReplyText(replyText) {
  const replyBox = findReplyBox();

  if (!replyBox) {
    return {
      success: false,
      message: "Could not find a reply box. Click inside the X reply field and try again."
    };
  }

  replaceEditorText(replyBox, replyText);

  return {
    success: true,
    message: "Reply inserted. Review it before posting."
  };
}

const LATEST_SELECTED_TEXT_KEY = "latestSelectedText";
const LATEST_SELECTED_TEXT_TIME_KEY = "latestSelectedTextTime";
let saveSelectedTextTimer = null;

function getCurrentSelectedText() {
  return (window.getSelection()?.toString() || "").trim();
}

function saveLatestSelectedText(selectedText) {
  if (!selectedText) {
    return;
  }

  chrome.storage.local.set({
    [LATEST_SELECTED_TEXT_KEY]: selectedText,
    [LATEST_SELECTED_TEXT_TIME_KEY]: Date.now()
  });
}

function queueSelectedTextSave(delay = 300) {
  clearTimeout(saveSelectedTextTimer);

  saveSelectedTextTimer = setTimeout(() => {
    saveLatestSelectedText(getCurrentSelectedText());
  }, delay);
}

async function getSavedSelectedText() {
  const result = await chrome.storage.local.get(LATEST_SELECTED_TEXT_KEY);
  return (result[LATEST_SELECTED_TEXT_KEY] || "").trim();
}

async function getSelectedText() {
  const selectedText = getCurrentSelectedText();

  if (selectedText) {
    saveLatestSelectedText(selectedText);
    return {
      success: true,
      text: selectedText
    };
  }

  const savedSelectedText = await getSavedSelectedText();

  if (savedSelectedText) {
    return {
      success: true,
      text: savedSelectedText
    };
  }

  return {
    success: false,
    message: "Select text on X first, then try again."
  };
}

let captureState = null;

function sendCaptureStatus(status, message) {
  chrome.storage.local.set({
    pendingCaptureStatus: { status, message }
  }, () => {
    chrome.storage.local.remove("pendingExtractedText");
  });
  chrome.runtime.sendMessage({
    type: "CAPTURE_OCR_DONE",
    success: status === "success",
    message
  });
}

function removeCaptureOverlay() {
  if (!captureState) {
    return;
  }

  document.removeEventListener("pointermove", handleCapturePointerMove);
  document.removeEventListener("pointerup", handleCapturePointerUp);
  document.removeEventListener("pointercancel", handleCapturePointerCancel);
  document.removeEventListener("keydown", handleCaptureKeyDown);

  document.body.style.overflow = captureState.originalBodyOverflow;
  captureState.overlay.remove();
  captureState.selection.remove();
  captureState.hint.remove();
  captureState.cancelButton.remove();
  captureState = null;
}

function updateSelectionRectangle(currentX, currentY) {
  const left = Math.min(captureState.startX, currentX);
  const top = Math.min(captureState.startY, currentY);
  const width = Math.abs(currentX - captureState.startX);
  const height = Math.abs(currentY - captureState.startY);

  captureState.selection.style.left = `${left}px`;
  captureState.selection.style.top = `${top}px`;
  captureState.selection.style.width = `${width}px`;
  captureState.selection.style.height = `${height}px`;
}

function handleCapturePointerDown(event) {
  if (event.target === captureState.cancelButton) {
    return;
  }

  event.preventDefault();

  captureState.isDragging = true;
  captureState.pointerId = event.pointerId;
  captureState.startX = event.clientX;
  captureState.startY = event.clientY;
  updateSelectionRectangle(event.clientX, event.clientY);

  if (captureState.overlay.setPointerCapture) {
    captureState.overlay.setPointerCapture(event.pointerId);
  }

  document.addEventListener("pointermove", handleCapturePointerMove, { passive: false });
  document.addEventListener("pointerup", handleCapturePointerUp, { passive: false });
  document.addEventListener("pointercancel", handleCapturePointerCancel, { passive: false });
}

function handleCapturePointerMove(event) {
  if (!captureState?.isDragging) {
    return;
  }

  if (captureState.pointerId !== null && event.pointerId !== captureState.pointerId) {
    return;
  }

  event.preventDefault();
  updateSelectionRectangle(event.clientX, event.clientY);
}

function handleCapturePointerUp(event) {
  if (!captureState?.isDragging) {
    return;
  }

  if (captureState.pointerId !== null && event.pointerId !== captureState.pointerId) {
    return;
  }

  event.preventDefault();

  const left = Math.min(captureState.startX, event.clientX);
  const top = Math.min(captureState.startY, event.clientY);
  const width = Math.abs(event.clientX - captureState.startX);
  const height = Math.abs(event.clientY - captureState.startY);
  const devicePixelRatio = window.devicePixelRatio || 1;

  removeCaptureOverlay();

  if (width < 10 || height < 10) {
    sendCaptureStatus("error", "Selected area is too small. Try again.");
    return;
  }

  chrome.runtime.sendMessage({
    type: "CAPTURE_SELECTED_AREA",
    rect: { left, top, width, height },
    devicePixelRatio
  });
}

function handleCapturePointerCancel(event) {
  if (!captureState) {
    return;
  }

  event.preventDefault();
  removeCaptureOverlay();
  sendCaptureStatus("error", "Area capture cancelled.");
}

function handleCaptureKeyDown(event) {
  if (event.key !== "Escape") {
    return;
  }

  removeCaptureOverlay();
  sendCaptureStatus("error", "Area capture cancelled.");
}

function startAreaCapture() {
  if (captureState) {
    return {
      success: false,
      message: "Area capture is already active."
    };
  }

  const overlay = document.createElement("div");
  overlay.className = "ai-reply-capture-overlay";

  const selection = document.createElement("div");
  selection.className = "ai-reply-capture-selection";

  const hint = document.createElement("div");
  hint.className = "ai-reply-capture-hint";
  hint.textContent = "Drag with finger to select area. Tap Cancel to stop.";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "ai-reply-capture-cancel";
  cancelButton.textContent = "Cancel";

  document.body.appendChild(overlay);
  document.body.appendChild(selection);
  document.body.appendChild(hint);
  document.body.appendChild(cancelButton);

  captureState = {
    overlay,
    selection,
    hint,
    cancelButton,
    isDragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originalBodyOverflow: document.body.style.overflow
  };

  document.body.style.overflow = "hidden";

  overlay.addEventListener("pointerdown", handleCapturePointerDown, { passive: false });
  cancelButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
  cancelButton.addEventListener("click", (event) => {
    event.preventDefault();
    removeCaptureOverlay();
    sendCaptureStatus("error", "Area capture cancelled.");
  });
  document.addEventListener("keydown", handleCaptureKeyDown);

  return {
    success: true,
    message: "Drag with finger to select area. Tap Cancel to stop."
  };
}

document.addEventListener("selectionchange", () => {
  queueSelectedTextSave(300);
});

document.addEventListener("mouseup", () => {
  queueSelectedTextSave(0);
});

document.addEventListener("touchend", () => {
  queueSelectedTextSave(0);
}, { passive: true });

document.addEventListener("pointerup", () => {
  queueSelectedTextSave(0);
}, { passive: true });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_SELECTED_TEXT") {
    getSelectedText().then(sendResponse);
    return true;
  }

  if (message.type === "START_AREA_CAPTURE") {
    sendResponse(startAreaCapture());
    return false;
  }

  if (message.type === "INSERT_REPLY") {
    const replyText = (message.replyText || "").trim();

    if (!replyText) {
      sendResponse({
        success: false,
        message: "Reply text is empty."
      });
      return false;
    }

    sendResponse(insertReplyText(replyText));
    return false;
  }

  return false;
});
