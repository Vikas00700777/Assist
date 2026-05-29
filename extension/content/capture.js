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
