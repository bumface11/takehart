document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get("images", data => {
        if (data.images && data.images.length > 0) {
            startSlideshow(data.images);
        }
    });
});

let currentIndex = 0;

function startSlideshow(images) {
    const photo = document.getElementById("photo");
    const caption = document.getElementById("caption");

    function showNextImage() {
        if (currentIndex >= images.length) currentIndex = 0;

        let imageData = images[currentIndex];
        photo.src = imageData.src;
        caption.innerText = imageData.caption;

        // Simulate an old-fashioned panning effect
        let direction = currentIndex % 2 === 0 ? "left" : "right";
        photo.style.transform = `translateX(${direction === "left" ? "-30px" : "30px"})`;
        setTimeout(() => {
            photo.style.transform = "translateX(0)";
        }, 500);

        currentIndex++;
        setTimeout(showNextImage, 3000);
    }

    showNextImage();
}
