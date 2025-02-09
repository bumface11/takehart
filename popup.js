document.addEventListener("DOMContentLoaded", () => {
    const startBtn = document.getElementById("start-btn");
    const stopBtn = document.getElementById("stop-btn");
    const photoContainer = document.getElementById("photo-container");
    const photo = document.getElementById("photo");
    const caption = document.getElementById("caption");
    let images = [];
    let currentIndex = 0;
    let intervalId = null;
    let isTransitioning = false;

    // Load stored images
    chrome.storage.local.get("images", data => {
        if (data.images && data.images.length > 0) {
            images = data.images;
        } else {
            caption.innerText = "No images found. Open a BBC article first.";
        }
    });

    function getRandomDirection() {
        const directions = ["left", "right", "up", "down"];
        return directions[Math.floor(Math.random() * directions.length)];
    }

    function moveWall(direction) {
        const body = document.body;
        let currentX = parseInt(body.style.backgroundPositionX || "0");
        let currentY = parseInt(body.style.backgroundPositionY || "0");

        switch (direction) {
            case "left":
                body.style.backgroundPositionX = `${currentX - 50}px`;
                photoContainer.style.transform = "translateX(-100vw)";
                break;
            case "right":
                body.style.backgroundPositionX = `${currentX + 50}px`;
                photoContainer.style.transform = "translateX(100vw)";
                break;
            case "up":
                body.style.backgroundPositionY = `${currentY - 50}px`;
                photoContainer.style.transform = "translateY(-100vh)";
                break;
            case "down":
                body.style.backgroundPositionY = `${currentY + 50}px`;
                photoContainer.style.transform = "translateY(100vh)";
                break;
        }
    }

    function showNextImage() {
        if (images.length === 0 || isTransitioning) return;

        isTransitioning = true;

        if (currentIndex >= images.length) {
            currentIndex = 0;
        }

        let imageData = images[currentIndex];

        // Set new photo and caption
        photo.src = imageData.src;
        caption.innerText = imageData.caption;

        // Pause for 2 seconds before moving
        setTimeout(() => {
            let direction = getRandomDirection();
            moveWall(direction);

            setTimeout(() => {
                // Reset position for next image
                photoContainer.style.transition = "none";
                photoContainer.style.transform = "translateX(0) translateY(0)";
                setTimeout(() => {
                    photoContainer.style.transition = "transform 1s ease-in-out";
                    currentIndex++;
                    isTransitioning = false;
                }, 50);
            }, 1000);
        }, 2000);
    }

    function startSlideshow() {
        if (images.length === 0) return;

        showNextImage();
        intervalId = setInterval(showNextImage, 4000); // 2s pause + 1s transition
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
