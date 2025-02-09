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
    TWEEN.update();
    renderer.render(scene, camera);
}

function moveCameraToNextPhoto() {
    if (photoPlanes.length === 0 || isTransitioning) return;

    isTransitioning = true;

    const targetIndex = currentIndex % photoPlanes.length;
    const target = photoPlanes[targetIndex].position;
    console.log("0");
    new TWEEN.Tween(camera.position)
    .to({ x: target.x, y: target.y, z: 3 }, 2000)
    .easing(TWEEN.Easing.Quadratic.Out)
    .onComplete(() => {
        console.log("1");
        setTimeout(() => {
            console.log("2");
            new TWEEN.Tween(camera.position)
                .to({ x: target.x, y: target.y, z: 8 }, 2000)
                .easing(TWEEN.Easing.Quadratic.Out)
                .onComplete(() => {
                    console.log("3");
                    isTransitioning = false;
                    currentIndex++;
                })
                .start();
            TWEEN.update(); // Add this line!
        }, 1000);
    })
    .start();
TWEEN.update(); // Add this line!
}

function startSlideshow() {
    if (photoPlanes.length === 0) {
        alert("No images loaded. Try refreshing the extension.");
        return;
    }
console.log("a");
    if (intervalId) clearInterval(intervalId); // Clear any existing interval

    moveCameraToNextPhoto(); // Start animation immediately
    console.log("b");
    intervalId = setInterval(moveCameraToNextPhoto, 7000); // 7 seconds

    document.getElementById("start-btn").disabled = true;
    document.getElementById("stop-btn").disabled = false;
}

function stopSlideshow() {
    clearInterval(intervalId);
    intervalId = null; // Clear intervalId
    isTransitioning = false; // Reset isTransitioning
    document.getElementById("start-btn").disabled = false;
    document.getElementById("stop-btn").disabled = true;
}

