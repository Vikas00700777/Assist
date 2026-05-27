const BACKEND_URL_KEY = "backendUrl";
const DEFAULT_BACKEND_URL = "http://127.0.0.1:5000";

async function getBackendUrl() {
  const result = await chrome.storage.local.get(BACKEND_URL_KEY);

  return result[BACKEND_URL_KEY] || DEFAULT_BACKEND_URL;
}

async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function saveCaptureStatus(status, message, text = "") {
  const values = {
    pendingCaptureStatus: { status, message }
  };

  if (text) {
    values.pendingExtractedText = text;
  }

  await chrome.storage.local.set(values);

  if (!text) {
    await chrome.storage.local.remove("pendingExtractedText");
  }
}

function notifyPopup(payload) {
  chrome.runtime.sendMessage({
    type: "CAPTURE_OCR_DONE",
    ...payload
  }, () => {
    chrome.runtime.lastError;
  });
}

async function blobToDataURL(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function cropImageDataUrl(imageDataUrl, rect, devicePixelRatio) {
  const sourceBlob = await fetch(imageDataUrl).then((response) => response.blob());
  const bitmap = await createImageBitmap(sourceBlob);
  const scale = devicePixelRatio || 1;
  const sourceX = Math.max(0, Math.round(rect.left * scale));
  const sourceY = Math.max(0, Math.round(rect.top * scale));
  const sourceWidth = Math.min(bitmap.width - sourceX, Math.round(rect.width * scale));
  const sourceHeight = Math.min(bitmap.height - sourceY, Math.round(rect.height * scale));

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Selected area is outside the captured tab.");
  }

  const canvas = new OffscreenCanvas(sourceWidth, sourceHeight);
  const context = canvas.getContext("2d");
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight
  );

  const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
  return blobToDataURL(croppedBlob);
}

async function extractTextFromCroppedImage(imageData) {
  const backendUrl = await getBackendUrl();
  let response;

  try {
    response = await fetchWithTimeout(`${backendUrl.replace(/\/$/, "")}/api/extract-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ imageData })
    }, 45000);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Selected area OCR timed out. Please try again.");
    }

    throw error;
  }

  let data = {};

  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || "Failed to extract text from selected area.");
  }

  return data.text || "";
}

async function handleCaptureSelectedArea(message, sender) {
  try {
    if (!sender.tab?.windowId) {
      throw new Error("Could not identify the active tab.");
    }

    await saveCaptureStatus("loading", "Extracting text from selected area...");

    const visibleTabImage = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
      format: "png"
    });
    const croppedImage = await cropImageDataUrl(
      visibleTabImage,
      message.rect,
      message.devicePixelRatio
    );
    const text = await extractTextFromCroppedImage(croppedImage);

    await saveCaptureStatus("success", "Text extracted from selected area.", text);
    notifyPopup({
      success: true,
      message: "Text extracted from selected area.",
      text
    });

    return {
      success: true,
      message: "Text extracted from selected area."
    };
  } catch (error) {
    const messageText = error.message || "Could not capture selected area.";

    await saveCaptureStatus("error", messageText);
    notifyPopup({
      success: false,
      message: messageText
    });

    return {
      success: false,
      message: messageText
    };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "CAPTURE_SELECTED_AREA") {
    return false;
  }

  handleCaptureSelectedArea(message, sender).then(sendResponse);
  return true;
});
