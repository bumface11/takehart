chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "BBC_IMAGES") {
        chrome.storage.local.set({ images: message.images });
    }
});
