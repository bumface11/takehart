chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: "slideshow.html" });
});

const DEBUG_LOADING = true;

function debugLog(...args) {
    if (DEBUG_LOADING) {
        console.log("[background]", ...args);
    }
}

async function convertToDataURL(imageUrl) {
    debugLog("convert request", imageUrl);
    const response = await fetch(imageUrl);
    if (!response.ok) {
        debugLog("fetch failed", imageUrl, response.status);
        return null;
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";

    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }

    const dataUrl = `data:${contentType};base64,${btoa(binary)}`;
    debugLog("convert success", imageUrl, { contentType, bytes: bytes.length, dataUrlLength: dataUrl.length });
    return dataUrl;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "convertToDataURL" || typeof message.imageUrl !== "string") {
        return;
    }

    convertToDataURL(message.imageUrl)
        .then((dataUrl) => sendResponse({ dataUrl: typeof dataUrl === "string" ? dataUrl : null }))
        .catch((error) => {
            console.warn("Failed to convert image to data URL:", message.imageUrl, error);
            debugLog("convert error", message.imageUrl, error?.message || error);
            sendResponse({ dataUrl: null });
        });

    return true;
});
