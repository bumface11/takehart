const MAX_IMAGES = 60;
const FALLBACK_CAPTION = "No caption available";
const DEBUG_LOADING = true;

function debugLog(...args) {
    if (DEBUG_LOADING) {
        console.log("[content]", ...args);
    }
}

function isAllowedImageUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== "https:") {
            return false;
        }

        return (
            parsed.hostname === "www.bbc.co.uk" ||
            parsed.hostname.endsWith(".bbc.co.uk") ||
            parsed.hostname.endsWith(".bbci.co.uk")
        );
    } catch (_) {
        return false;
    }
}

function normalizeCaption(value) {
    const caption = typeof value === "string"
        ? value.replace(/^Image caption,\s*/i, "").trim()
        : "";
    return caption || FALLBACK_CAPTION;
}

async function getImagesAndCaptions() {
    const seenUrls = new Set();
    const images = [];

    document.querySelectorAll("figure img").forEach((img) => {
        const src = img.currentSrc || img.src;
        if (!isAllowedImageUrl(src) || seenUrls.has(src)) {
            return;
        }

        const figure = img.closest("figure");
        const captionElem = figure ? figure.querySelector("figcaption") : null;
        const caption = normalizeCaption(captionElem ? captionElem.textContent : "");

        images.push({ src, caption });
        seenUrls.add(src);
    });

    debugLog("discovered images", images.length, images.slice(0, 3));
    return images.slice(0, MAX_IMAGES);
}

async function saveImages(images) {
    if (!Array.isArray(images) || images.length === 0) {
        debugLog("nothing to store");
        return;
    }

    chrome.storage.local.set({ images, imagesCapturedAt: Date.now() }, () => {
        if (chrome.runtime.lastError) {
            console.warn("Failed to store images:", chrome.runtime.lastError.message);
            debugLog("store failed", chrome.runtime.lastError.message);
            return;
        }

        debugLog("stored images", images.length);
    });
}

getImagesAndCaptions().then(saveImages);
