async function getApiUrl(endpoint) {
  const backendUrl = await getBackendUrl();
  return `${backendUrl.replace(/\/$/, "")}${endpoint}`;
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

async function readApiResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    return {};
  }
}

async function generateRepliesFromAPI(text, tone, context = "", imageData = "") {
  try {
    const response = await fetchWithTimeout(await getApiUrl("/api/generate-replies"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text, tone, context, imageData })
    }, imageData ? 45000 : 30000);

    const data = await readApiResponse(response);

    if (!response.ok) {
      return {
        success: false,
        message: data.error || data.message || "Failed to generate replies.",
        replies: []
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      message: error.name === "AbortError"
        ? "Backend timed out while generating replies. Please try again."
        : error.message || "Unable to connect to the backend.",
      replies: []
    };
  }
}

async function extractTextFromImageAPI(imageData) {
  try {
    const response = await fetchWithTimeout(await getApiUrl("/api/extract-text"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ imageData })
    }, 45000);

    const data = await readApiResponse(response);

    if (!response.ok) {
      return {
        success: false,
        message: data.error || data.message || "Failed to extract text from image.",
        text: ""
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      message: error.name === "AbortError"
        ? "Backend timed out while extracting text. Please try again."
        : error.message || "Unable to connect to the backend.",
      text: ""
    };
  }
}

async function checkBackendHealthAPI() {
  try {
    const response = await fetchWithTimeout(await getApiUrl("/health"), {}, 8000);
    const data = await readApiResponse(response);

    if (!response.ok || data.success !== true) {
      return {
        success: false,
        message: data.error || data.message || "Backend is not responding correctly."
      };
    }

    return {
      success: true,
      message: "Backend is connected."
    };
  } catch (error) {
    return {
      success: false,
      message: error.name === "AbortError"
        ? "Backend health check timed out. Make sure the backend is running."
        : error.message || "Backend is not reachable."
    };
  }
}
