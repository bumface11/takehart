chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: "slideshow.html" });
});
