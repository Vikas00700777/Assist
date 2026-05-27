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

function getSelectedText() {
  const selectedText = window.getSelection().toString().trim();

  if (!selectedText) {
    return {
      success: false,
      message: "Select text on X first, then try again."
    };
  }

  return {
    success: true,
    text: selectedText
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

  document.removeEventListener("mousemove", handleCaptureMouseMove);
  document.removeEventListener("mouseup", handleCaptureMouseUp);
  document.removeEventListener("keydown", handleCaptureKeyDown);

  captureState.overlay.remove();
  captureState.selection.remove();
  captureState.hint.remove();
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

function handleCaptureMouseDown(event) {
  event.preventDefault();

  captureState.isDragging = true;
  captureState.startX = event.clientX;
  captureState.startY = event.clientY;
  updateSelectionRectangle(event.clientX, event.clientY);

  document.addEventListener("mousemove", handleCaptureMouseMove);
  document.addEventListener("mouseup", handleCaptureMouseUp);
}

function handleCaptureMouseMove(event) {
  if (!captureState?.isDragging) {
    return;
  }

  event.preventDefault();
  updateSelectionRectangle(event.clientX, event.clientY);
}

function handleCaptureMouseUp(event) {
  if (!captureState?.isDragging) {
    return;
  }

  event.preventDefault();

  const left = Math.min(captureState.startX, event.clientX);
  const top = Math.min(captureState.startY, event.clientY);
  const width = Math.abs(event.clientX - captureState.startX);
  const height = Math.abs(event.clientY - captureState.startY);
  const devicePixelRatio = window.devicePixelRatio || 1;

  removeCaptureOverlay();

  if (width < 20 || height < 20) {
    sendCaptureStatus("error", "Selected area is too small. Try a larger area.");
    return;
  }

  chrome.runtime.sendMessage({
    type: "CAPTURE_SELECTED_AREA",
    rect: { left, top, width, height },
    devicePixelRatio
  });
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
  hint.textContent = "Drag to select an area. Press Escape to cancel.";

  document.body.appendChild(overlay);
  document.body.appendChild(selection);
  document.body.appendChild(hint);

  captureState = {
    overlay,
    selection,
    hint,
    isDragging: false,
    startX: 0,
    startY: 0
  };

  overlay.addEventListener("mousedown", handleCaptureMouseDown);
  document.addEventListener("keydown", handleCaptureKeyDown);

  return {
    success: true,
    message: "Select an area on the page."
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_SELECTED_TEXT") {
    sendResponse(getSelectedText());
    return false;
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
