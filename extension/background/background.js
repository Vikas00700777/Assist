const BACKEND_URL_KEY = "backendUrl";
const DEFAULT_BACKEND_URL = "https://assist-qw4s.onrender.com";
const MOBILE_CAPTURE_UNSUPPORTED_MESSAGE = "Capture Area is not supported by this mobile browser. Please use Upload Screenshot instead.";

async function getBackendUrl() {
  const result = await chrome.storage.local.get(BACKEND_URL_KEY);
  const backendUrl = (result[BACKEND_URL_KEY] || "").trim();

  return backendUrl || DEFAULT_BACKEND_URL;
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

async function saveCaptureStatus(status, message, text = "", imageData = "") {
  const values = {
    pendingCaptureStatus: { status, message }
  };

  if (text) {
    values.pendingExtractedText = text;
  }

  if (imageData) {
    values.pendingCapturedImage = imageData;
  }

  await chrome.storage.local.set(values);

  if (!text) {
    await chrome.storage.local.remove("pendingExtractedText");
  }

  if (!imageData) {
    await chrome.storage.local.remove("pendingCapturedImage");
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

function dataURLToBlob(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);

  if (!match) {
    throw new Error("Captured image data is invalid.");
  }

  const mimeType = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

async function cropImageDataUrl(imageDataUrl, rect, devicePixelRatio) {
  const sourceBlob = dataURLToBlob(imageDataUrl);
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

    throw new Error("Backend OCR is not reachable. The captured image was attached instead.");
  }

  let data = {};

  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok || !data.success) {
    const message = data.error || data.message || "Failed to extract text from selected area.";
    throw new Error(message === "Failed to fetch"
      ? "Backend OCR is not reachable. The captured image was attached instead."
      : message);
  }

  return data.text || "";
}

async function handleCaptureSelectedArea(message, sender) {
  try {
    if (sender.tab?.windowId === undefined || sender.tab?.windowId === null) {
      throw new Error("Could not identify the active tab.");
    }

    await saveCaptureStatus("loading", "Extracting text from selected area...");

    let visibleTabImage;

    try {
      visibleTabImage = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
        format: "png"
      });
    } catch (error) {
      throw new Error(MOBILE_CAPTURE_UNSUPPORTED_MESSAGE);
    }

    const croppedImage = await cropImageDataUrl(
      visibleTabImage,
      message.rect,
      message.devicePixelRatio
    );
    let text = "";

    try {
      text = await extractTextFromCroppedImage(croppedImage);
    } catch (error) {
      const messageText = error.message || "OCR failed. The captured image was attached instead.";

      await saveCaptureStatus("error", messageText, "", croppedImage);
      notifyPopup({
        success: false,
        message: messageText,
        imageData: croppedImage
      });

      return {
        success: false,
        message: messageText
      };
    }

    await saveCaptureStatus("success", "Text extracted from selected area.", text, croppedImage);
    notifyPopup({
      success: true,
      message: "Text extracted from selected area.",
      text,
      imageData: croppedImage
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
  if (message.type === "CAPTURE_SELECTED_AREA") {
    handleCaptureSelectedArea(message, sender).then(sendResponse);
    return true;
  }

  return false;
});
