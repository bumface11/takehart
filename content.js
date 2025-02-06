function getImagesAndCaptions() {
    let images = [];
    document.querySelectorAll("figure img").forEach(img => {
        let captionElem = img.closest("figure").querySelector("figcaption");
        let caption = captionElem ? captionElem.innerText.trim() : "No caption available";
        images.push({ src: img.src, caption });
    });
    return images;
}

// Send extracted data to popup
chrome.runtime.sendMessage({ type: "BBC_IMAGES", images: getImagesAndCaptions() });
