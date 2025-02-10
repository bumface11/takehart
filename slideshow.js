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
    camera.position.set(0, 0, 10);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Handle window resizing
    window.addEventListener("resize", () => {
        if (camera && renderer) {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
    });

    // Load wall texture
    const textureLoader = new THREE.TextureLoader();
    const wallTexture = textureLoader.load("images/wall-texture.jpg");
    const wallGeometry = new THREE.PlaneGeometry(50, 30);
    const wallMaterial = new THREE.MeshBasicMaterial({ map: wallTexture });
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(0, 0, -5);
    scene.add(wall);

    // Define grid layout
    const cols = Math.ceil(Math.sqrt(images.length)); // Number of columns
    const rows = Math.ceil(images.length / cols);    // Number of rows
    const spacingX = 5; // Horizontal spacing
    const spacingY = 4; // Vertical spacing
    const startX = -(cols / 2) * spacingX + spacingX / 2;
    const startY = (rows / 2) * spacingY - spacingY / 2;

    const planeGeometry = new THREE.PlaneGeometry(4, 3);
    
    for (let i = 0; i < images.length; i++) {
        const dataUrl = await convertToDataURL(images[i].src);
        if (!dataUrl) continue;

        const imageTexture = textureLoader.load(dataUrl, (texture) => {
            console.log(`Image ${i + 1} loaded from Data URL`);
            texture.minFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;

            const material = new THREE.MeshBasicMaterial({ map: texture });
            const plane = new THREE.Mesh(planeGeometry, material);

            // Calculate grid position
            const x = startX + (i % cols) * spacingX;
            const y = startY - Math.floor(i / cols) * spacingY;

            plane.position.set(x, y, 0);
            scene.add(plane);
            photoPlanes.push(plane);
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


let animationState = "idle"; // "zoomingIn", "paused", "zoomingOut", "moving"
let animationProgress = 0;
let animationStart = null;
const animationDuration = 2000; // 2 seconds per movement

function moveCameraToNextPhoto(timestamp) {
    if (!animationStart) animationStart = timestamp;
    let progress = (timestamp - animationStart) / animationDuration;

    if (animationState === "zoomingIn") {
        camera.position.z += (3 - camera.position.z) * 0.1;  // ✅ Manual Lerp
    } else if (animationState === "zoomingOut") {
        camera.position.z += (8 - camera.position.z) * 0.1;  // ✅ Manual Lerp
    } else if (animationState === "moving") {
        const target = photoPlanes[currentIndex].position;
        camera.position.x += (target.x - camera.position.x) * 0.1;
        camera.position.y += (target.y - camera.position.y) * 0.1;
    }

    if (progress >= 1) {
        animationStart = null;

        if (animationState === "zoomingIn") {
            animationState = "paused";
            setTimeout(() => {
                animationState = "zoomingOut";
                requestAnimationFrame(moveCameraToNextPhoto);
            }, 1000);
        } else if (animationState === "zoomingOut") {
            animationState = "moving";
            requestAnimationFrame(moveCameraToNextPhoto);
        } else if (animationState === "moving") {
            animationState = "zoomingIn";
            currentIndex = (currentIndex + 1) % photoPlanes.length;
            requestAnimationFrame(moveCameraToNextPhoto);
        }
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
    console.log(THREE.REVISION);

    if (photoPlanes.length === 0) {
        alert("No images loaded. Try refreshing the extension.");
        return;
    }

    console.log("Slideshow started");
    
    currentIndex = 0;
    animationState = "zoomingIn";
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