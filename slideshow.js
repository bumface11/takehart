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
    camera.position.set(0, 0, 4);  // ✅ Keep camera zoomed in

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


    
    function addCaption(x, y, text) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
    
        const padding = 20; const fontSize = 12;

        // Set temporary font to measure text
         ctx.font = `italic bold ${fontSize}px "Dancing Script", cursive`;
         const textMetrics = ctx.measureText(text); 
         const textWidth = Math.ceil(textMetrics.width) + padding; 
         const textHeight = fontSize + padding;
        
        // Set canvas dimensions (this resets the drawing state) 
        canvas.width = textWidth; canvas.height = textHeight;
        
        // Reapply font settings after resizing 
        ctx.font = `italic bold ${fontSize}px "Dancing Script", cursive`; 
        ctx.textAlign = "center"; 
        ctx.textBaseline = "middle";
        
        // Draw a paper-like background 
        ctx.fillStyle = "#fdf7e3"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw a soft border 
        ctx.strokeStyle = "#e0d5b9"; ctx.lineWidth = 2; ctx.strokeRect(0, 0, canvas.width, canvas.height);
        
        // Draw the caption text 
        ctx.fillStyle = "black"; ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        
        // Convert canvas to texture 
        const captionTexture = new THREE.CanvasTexture(canvas); captionTexture.minFilter = THREE.LinearFilter;
        
        // Create a material that disables depth testing so it always appears on top 
        const captionMaterial = new THREE.MeshBasicMaterial({ map: captionTexture, transparent: true, depthTest: false });
        
        // Force render order so captions are drawn after images 
        const captionPlane = new THREE.Mesh( new THREE.PlaneGeometry(textWidth / 100, textHeight / 100), captionMaterial ); captionPlane.renderOrder = 1;
        
        // Position the caption so that it appears just below the image. // (Adjust the offset as needed; here we subtract a small extra value so it sits clearly in front.) 
        captionPlane.position.set(x, y - (textHeight / 100) / 2 - 0.1, 0.01); 
        scene.add(captionPlane); 
        
    }
    

    for (let i = 0; i < images.length; i++) {
        const dataUrl = await convertToDataURL(images[i].src);
        if (!dataUrl) continue;

        textureLoader.load(dataUrl, (texture) => {
            console.log(`Image ${i + 1} loaded from Data URL`);

            // ✅ Get the correct aspect ratio
            const imgWidth = texture.image.width;
            const imgHeight = texture.image.height;
            const aspectRatio = imgWidth / imgHeight;

            const planeWidth = 4 * aspectRatio;  // ✅ Adjust width dynamically
            const planeHeight = 4;  // ✅ Fixed height

            const material = new THREE.MeshBasicMaterial({ map: texture });
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeHeight), material);

            // ✅ Position in a grid layout
            const x = startX + (i % cols) * spacingX;
            const y = startY - Math.floor(i / cols) * spacingY;
            plane.position.set(x, y, 0);
            scene.add(plane);
            photoPlanes.push(plane);

            // ✅ Add caption below the image
            const captionY = y - (planeHeight / 2) - 0.2;  // ✅ Slightly closer to the image
            addCaption(x, captionY, images[i].caption);
            

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

    if (photoPlanes.length === 0) return;

    // ✅ Stay zoomed in, only move X & Y
    const target = photoPlanes[currentIndex].position;
    camera.position.x += (target.x - camera.position.x) * 0.1;
    camera.position.y += (target.y - camera.position.y) * 0.1;

    if (progress >= 1) {
        animationStart = null;
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