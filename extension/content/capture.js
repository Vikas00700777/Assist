(function startAiReplyAreaCapture() {
  const existingState = window.__aiReplyCaptureState;

  if (existingState?.remove) {
    existingState.remove();
  }

  const scrollSnapshot = window.__aiReplyCaptureScrollSnapshot || {
    windowLeft: window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft || 0,
    windowTop: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
    elements: []
  };

  function restoreScrollSnapshot() {
    window.scrollTo(scrollSnapshot.windowLeft, scrollSnapshot.windowTop);
    document.documentElement.scrollLeft = scrollSnapshot.windowLeft;
    document.documentElement.scrollTop = scrollSnapshot.windowTop;
    document.body.scrollLeft = scrollSnapshot.windowLeft;
    document.body.scrollTop = scrollSnapshot.windowTop;

    (scrollSnapshot.elements || []).forEach(({ id, left, top }) => {
      const element = document.querySelector(`[data-ai-reply-capture-scroll-id="${id}"]`);

      if (!element) {
        return;
      }

      element.scrollLeft = left;
      element.scrollTop = top;
    });
  }

  const overlay = document.createElement("div");
  overlay.className = "ai-reply-capture-overlay";

  const selection = document.createElement("div");
  selection.className = "ai-reply-capture-selection";

  const hint = document.createElement("div");
  hint.className = "ai-reply-capture-hint";
  hint.textContent = "Drag to select an area. Press Esc or Cancel to stop.";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "ai-reply-capture-cancel";
  cancelButton.textContent = "Cancel";

  document.body.appendChild(overlay);
  document.body.appendChild(selection);
  document.body.appendChild(hint);
  document.body.appendChild(cancelButton);

  const state = {
    overlay,
    selection,
    hint,
    cancelButton,
    isDragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    scrollRestoreTimers: []
  };

  function clearScrollRestoreTimers() {
    state.scrollRestoreTimers.forEach((timerId) => {
      clearTimeout(timerId);
      cancelAnimationFrame(timerId);
    });
    state.scrollRestoreTimers = [];
  }

  function removeCaptureOverlay() {
    clearScrollRestoreTimers();
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
    document.removeEventListener("pointercancel", handlePointerCancel);
    document.removeEventListener("keydown", handleKeyDown);
    overlay.remove();
    selection.remove();
    hint.remove();
    cancelButton.remove();
    window.__aiReplyCaptureState = null;
  }

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

  function updateSelectionRectangle(currentX, currentY) {
    const left = Math.min(state.startX, currentX);
    const top = Math.min(state.startY, currentY);
    const width = Math.abs(currentX - state.startX);
    const height = Math.abs(currentY - state.startY);

    selection.style.left = `${left}px`;
    selection.style.top = `${top}px`;
    selection.style.width = `${width}px`;
    selection.style.height = `${height}px`;
  }

  function getElementText(element) {
    if (!element || element === document.body || element === document.documentElement) {
      return "";
    }

    const tagName = element.tagName?.toLowerCase();

    if (["script", "style", "noscript", "svg", "canvas", "img", "video"].includes(tagName)) {
      return "";
    }

    const ariaLabel = element.getAttribute?.("aria-label") || "";
    const text = element.innerText || element.textContent || ariaLabel;

    return (text || "").replace(/\s+/g, " ").trim();
  }

  function isGoodTextCandidate(element, rect) {
    const bounds = element.getBoundingClientRect();
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const elementArea = bounds.width * bounds.height;
    const selectionArea = Math.max(1, rect.width * rect.height);

    if (elementArea > viewportArea * 0.8 && elementArea > selectionArea * 4) {
      return false;
    }

    return true;
  }

  function elementIntersectsRect(element, rect) {
    const bounds = element.getBoundingClientRect();

    return bounds.width > 0 &&
      bounds.height > 0 &&
      bounds.right >= rect.left &&
      bounds.left <= rect.left + rect.width &&
      bounds.bottom >= rect.top &&
      bounds.top <= rect.top + rect.height;
  }

  function extractTextFromRect(rect) {
    const previousVisibility = [
      [overlay, overlay.style.visibility],
      [selection, selection.style.visibility],
      [hint, hint.style.visibility],
      [cancelButton, cancelButton.style.visibility]
    ];
    const foundElements = new Set();
    const stepX = Math.max(20, Math.floor(rect.width / 4));
    const stepY = Math.max(20, Math.floor(rect.height / 4));

    previousVisibility.forEach(([element]) => {
      element.style.visibility = "hidden";
    });

    try {
      for (let y = rect.top; y <= rect.top + rect.height; y += stepY) {
        for (let x = rect.left; x <= rect.left + rect.width; x += stepX) {
          const pointX = Math.min(rect.left + rect.width - 1, Math.max(rect.left, x));
          const pointY = Math.min(rect.top + rect.height - 1, Math.max(rect.top, y));

          document.elementsFromPoint(pointX, pointY).forEach((element) => {
            if (elementIntersectsRect(element, rect) && isGoodTextCandidate(element, rect)) {
              foundElements.add(element);
            }
          });
        }
      }
    } finally {
      previousVisibility.forEach(([element, visibility]) => {
        element.style.visibility = visibility;
      });
    }

    const lines = [];

    Array.from(foundElements)
      .sort((first, second) => {
        const firstBounds = first.getBoundingClientRect();
        const secondBounds = second.getBoundingClientRect();
        return (firstBounds.width * firstBounds.height) - (secondBounds.width * secondBounds.height);
      })
      .forEach((element) => {
        const text = getElementText(element);

        if (text && text.length <= 1200 && !lines.some((line) => line === text || line.includes(text))) {
          lines.push(text);
        }
      });

    return lines
      .filter((line) => !lines.some((otherLine) => otherLine !== line && line.includes(otherLine)))
      .join("\n")
      .slice(0, 4000)
      .trim();
  }

  function handlePointerDown(event) {
    if (event.target === cancelButton) {
      return;
    }

    event.preventDefault();
    clearScrollRestoreTimers();
    state.isDragging = true;
    state.pointerId = event.pointerId;
    state.startX = event.clientX;
    state.startY = event.clientY;
    updateSelectionRectangle(event.clientX, event.clientY);

    if (overlay.setPointerCapture) {
      overlay.setPointerCapture(event.pointerId);
    }

    document.addEventListener("pointermove", handlePointerMove, { passive: false });
    document.addEventListener("pointerup", handlePointerUp, { passive: false });
    document.addEventListener("pointercancel", handlePointerCancel, { passive: false });
  }

  function handlePointerMove(event) {
    if (!state.isDragging || (state.pointerId !== null && event.pointerId !== state.pointerId)) {
      return;
    }

    event.preventDefault();
    updateSelectionRectangle(event.clientX, event.clientY);
  }

  function handlePointerUp(event) {
    if (!state.isDragging || (state.pointerId !== null && event.pointerId !== state.pointerId)) {
      return;
    }

    event.preventDefault();

    const left = Math.min(state.startX, event.clientX);
    const top = Math.min(state.startY, event.clientY);
    const width = Math.abs(event.clientX - state.startX);
    const height = Math.abs(event.clientY - state.startY);
    const devicePixelRatio = window.devicePixelRatio || 1;
    const rect = { left, top, width, height };

    removeCaptureOverlay();

    if (width < 10 || height < 10) {
      sendCaptureStatus("error", "Selected area is too small. Try again.");
      return;
    }

    const fallbackText = extractTextFromRect(rect);

    chrome.runtime.sendMessage({
      type: "CAPTURE_SELECTED_AREA",
      rect,
      devicePixelRatio,
      fallbackText
    });
  }

  function handlePointerCancel(event) {
    event.preventDefault();
    removeCaptureOverlay();
    sendCaptureStatus("error", "Area capture cancelled.");
  }

  function handleKeyDown(event) {
    if (event.key !== "Escape") {
      return;
    }

    removeCaptureOverlay();
    sendCaptureStatus("error", "Area capture cancelled.");
  }

  state.remove = removeCaptureOverlay;
  window.__aiReplyCaptureState = state;
  overlay.addEventListener("pointerdown", handlePointerDown, { passive: false });
  cancelButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
  cancelButton.addEventListener("click", (event) => {
    event.preventDefault();
    removeCaptureOverlay();
    sendCaptureStatus("error", "Area capture cancelled.");
  });
  document.addEventListener("keydown", handleKeyDown);

  const restore = () => restoreScrollSnapshot();
  state.scrollRestoreTimers.push(requestAnimationFrame(restore));
  [0, 40, 120, 260, 520, 900, 1400, 2200].forEach((delay) => {
    state.scrollRestoreTimers.push(setTimeout(restore, delay));
  });
})();
