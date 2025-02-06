function getImagesAndCaptions() {
    let images = [];
    document.querySelectorAll("figure img").forEach(img => {
        let captionElem = img.closest("figure").querySelector("figcaption");
        let caption = captionElem ? captionElem.innerText.trim() : "No caption available";
        images.push({ src: img.src, caption });
    });

    if (images.length > 0) {
        chrome.storage.local.set({ images });
    }
}

// Run when page loads
getImagesAndCaptions();
