const MAX_IMAGES = 60;
const FALLBACK_CAPTION = "No caption available";

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

function getImagesAndCaptions() {
    const images = [];
    const seenUrls = new Set();

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

    return images.slice(0, MAX_IMAGES);
}

function saveImages(images) {
    if (!Array.isArray(images) || images.length === 0) {
        return;
    }

    chrome.storage.local.set({ images, imagesCapturedAt: Date.now() }, () => {
        if (chrome.runtime.lastError) {
            console.warn("Failed to store images:", chrome.runtime.lastError.message);
        }
    });
}

saveImages(getImagesAndCaptions());
