let scene, camera, renderer;
let photoPlanes = [];
let images = [];
let currentIndex = 0;
let intervalId = null;
let isTransitioning = false;

document.addEventListener("DOMContentLoaded", () => {
    const startBtn = document.getElementById("start-btn");
    const stopBtn = document.getElementById("stop-btn");

    // Load images from storage
    chrome.storage.local.get("images", data => {
        if (data.images && data.images.length > 0) {
            images = data.images;
            init3DScene();  // Only run Three.js after images are available
        } else {
            alert("No images found. Open a BBC article first and refresh.");
        }
    });

    startBtn.addEventListener("click", startSlideshow);
    stopBtn.addEventListener("click", stopSlideshow);
});

async function convertToDataURL(imageUrl) {
    try {
        const response = await fetch(imageUrl, { mode: "cors" });
        const blob = await response.blob();

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("Error fetching image:", error);
        return null;
    }
}

async function init3DScene() {
    if (images.length === 0) {
        alert("No images available. Please reload the extension.");
        return;
    }

 

    // Create Three.js scene
    scene = new THREE.Scene();

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 3);  // ✅ Keep camera zoomed in

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Load wall texture
    const textureLoader = new THREE.TextureLoader();
    const wallTexture = textureLoader.load("images/wall-texture.jpg");
    const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(50, 30),
        new THREE.MeshBasicMaterial({ map: wallTexture })
    );
    wall.position.set(0, 0, -5);
    scene.add(wall);

    // Define grid layout
    const cols = Math.ceil(Math.sqrt(images.length));
    const rows = Math.ceil(images.length / cols);
    const spacingX = 6, spacingY = 5;
    const startX = -(cols / 2) * spacingX + spacingX / 2;
    const startY = (rows / 2) * spacingY - spacingY / 2;

    function addPins(x, y, width, height) {
        const pinGeometry = new THREE.SphereGeometry(0.1, 16, 16); // Small sphere
        const pinMaterial = new THREE.MeshBasicMaterial({ color: "#aa0000" }); // Red push pin color
    
        const topLeft = new THREE.Mesh(pinGeometry, pinMaterial);
        topLeft.position.set(x - width / 2 + 0.1, y + height / 2 - 0.1, 0.3);
    
        const topRight = new THREE.Mesh(pinGeometry, pinMaterial);
        topRight.position.set(x + width / 2 - 0.1, y + height / 2 - 0.1, 0.3);
    
        scene.add(topLeft, topRight);
    }

    function addCaption(x, y, text) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
    
        // ✅ Set font and measure text width
        ctx.font = "italic 24px 'Dancing Script', cursive";
        let textWidth = ctx.measureText(text).width;
    
        // ✅ Ensure the caption is not too wide
        const maxWidth = 6; // Max width in world units
        const scaleFactor = maxWidth / textWidth;
        textWidth = Math.min(textWidth, maxWidth);
    
        // ✅ Set canvas size dynamically based on text
        canvas.width = Math.ceil(textWidth * 50);
        canvas.height = 100;
    
        // ✅ Background color (paper effect)
        ctx.fillStyle = "#f9f3d7"; // Light beige paper color
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    
        // ✅ Add slight border shadow
        ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#e3d9b6";
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
    
        // ✅ Text styling
        ctx.fillStyle = "#222"; // Dark ink color
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "italic 24px 'Dancing Script', cursive"; // Handwritten effect
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
        // ✅ Convert to texture
        const captionTexture = new THREE.CanvasTexture(canvas);
        captionTexture.needsUpdate = true;
    
        const captionMaterial = new THREE.MeshBasicMaterial({ map: captionTexture, transparent: true });
        const captionPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(textWidth, 1),
            captionMaterial
        );
    
        captionPlane.position.set(x, y, 0.1); // ✅ Slightly in front of the image
        scene.add(captionPlane);
    }
    
    

    for (let i = 0; i < images.length; i++) {
        const dataUrl = await convertToDataURL(images[i].src);
        if (!dataUrl) continue;

        textureLoader.load(dataUrl, (texture) => {
            console.log(`Image ${i + 1} loaded from Data URL`);
        
            // ✅ Keep the correct aspect ratio
            const imgWidth = texture.image.width;
            const imgHeight = texture.image.height;
            const aspectRatio = imgWidth / imgHeight;
        
            const planeWidth = 4 * aspectRatio;
            const planeHeight = 4;
        
            const material = new THREE.MeshBasicMaterial({ map: texture });
        
            // ✅ Image Plane (Pinned Photo)
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeHeight), material);
        
            // ✅ Random slight rotation to make it look "pinned"
            const rotationAngle = (Math.random() - 0.5) * 0.2; // Random rotation between -0.1 and 0.1 radians
            plane.rotation.z = rotationAngle;
        
            // ✅ Push the image forward slightly to avoid z-fighting
            plane.position.set(x, y, 0.2);
        
            // ✅ Add a shadow-like frame behind the image
            const shadowMaterial = new THREE.MeshBasicMaterial({ color: "#000", opacity: 0.2, transparent: true });
            const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth + 0.3, planeHeight + 0.3), shadowMaterial);
            shadowPlane.position.set(x, y, 0.1); // Slightly behind the image
            scene.add(shadowPlane);
        
            // ✅ Add "pins" (small spheres)
            addPins(x, y, planeWidth, planeHeight);
        
            scene.add(plane);
            photoPlanes.push(plane);
        
            // ✅ Add caption below the image
            addCaption(x, y - (planeHeight / 2) - 0.5, images[i].caption);
        });
        
    }

    animate();
}



function animate() {
    requestAnimationFrame(animate);
    console.log("Animation frame running...");  // ✅ Should print continuously
    renderer.render(scene, camera);
}

let animationLoopStarted = false; // Flag to track if the loop is running


//let animationState = "idle"; // "zoomingIn", "paused", "zoomingOut", "moving"
let animationProgress = 0;

let animationState = "moving";
let animationStart = null;
const animationDuration = 2000; // 2 seconds per movement

function moveCameraToNextPhoto(timestamp) {
    if (!animationStart) animationStart = timestamp;
    let progress = (timestamp - animationStart) / animationDuration;

    if (animationState === "moving") {
        const target = photoPlanes[currentIndex].position;

        // ✅ Stay zoomed in at z=3, only pan
        camera.position.x += (target.x - camera.position.x) * 0.1;
        camera.position.y += (target.y - camera.position.y) * 0.1;
    }

    if (progress >= 1) {
        animationStart = null;

        animationState = "moving";
        currentIndex = (currentIndex + 1) % photoPlanes.length;
        requestAnimationFrame(moveCameraToNextPhoto);
    } else {
        requestAnimationFrame(moveCameraToNextPhoto);
    }
}

function animate() {
    requestAnimationFrame(animate);  // Call animate again for the next frame
    TWEEN.update();
    renderer.render(scene, camera);

    // Check if animation should start *after* the loop is running:
    if (photoPlanes.length > 0 && !isTransitioning && !animationLoopStarted) {
      animationLoopStarted = true;
      moveCameraToNextPhoto(); // Now call it here!
    }
}

function startSlideshow() {
    if (photoPlanes.length === 0) {
        alert("No images loaded. Try refreshing the extension.");
        return;
    }

    console.log("Slideshow started");

    currentIndex = 0;
    animationState = "moving";
    animationStart = null;

    requestAnimationFrame(moveCameraToNextPhoto);

    document.getElementById("start-btn").disabled = true;
    document.getElementById("stop-btn").disabled = false;
}



function stopSlideshow() {
    isTransitioning = false;
    animationLoopStarted = false; // Reset the flag
    document.getElementById("start-btn").disabled = false;
    document.getElementById("stop-btn").disabled = true;
}