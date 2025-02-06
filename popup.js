document.addEventListener("DOMContentLoaded", () => {
    const startBtn = document.getElementById("start-btn");
    const stopBtn = document.getElementById("stop-btn");
    const photo = document.getElementById("photo");
    const caption = document.getElementById("caption");

    let images = [];
    let currentIndex = 0;
    let intervalId = null;

    // Load stored images
    chrome.storage.local.get("images", data => {
        if (data.images && data.images.length > 0) {
            images = data.images;
        } else {
            caption.innerText = "No images found. Open a BBC article first.";
        }
    });

    function showNextImage() {
        if (images.length === 0) return;

        if (currentIndex >= images.length) {
            currentIndex = 0;
        }

        let imageData = images[currentIndex];
        photo.src = imageData.src;
        caption.innerText = imageData.caption;

        // Old-fashioned TV panning effect
        let direction = currentIndex % 2 === 0 ? "left" : "right";
        photo.style.transition = "transform 0.5s ease-in-out";
        photo.style.transform = `translateX(${direction === "left" ? "-20px" : "20px"})`;

        setTimeout(() => {
            photo.style.transform = "translateX(0)";
        }, 500);

        currentIndex++;
    }

    function startSlideshow() {
        if (images.length === 0) return;

        showNextImage();
        intervalId = setInterval(showNextImage, 3000);
        startBtn.disabled = true;
        stopBtn.disabled = false;
    }

    function stopSlideshow() {
        clearInterval(intervalId);
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }

    startBtn.addEventListener("click", startSlideshow);
    stopBtn.addEventListener("click", stopSlideshow);
});
