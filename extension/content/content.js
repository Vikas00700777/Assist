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
