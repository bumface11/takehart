console.log("✅ slideshow.js is running");
debugger; // Forces Chrome to pause when the script starts
const zoomDelayBeforeStart = 5000;  // ✅ Adjustable delay before zooming in (in milliseconds)


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
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(3, 5, 5);  // ✅ Closer and angled towards the wall
    light.castShadow = true;
    scene.add(light);
    
    // ✅ Configure shadow properties for better visibility
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 50;
    light.shadow.camera.left = -10;
    light.shadow.camera.right = 10;
    light.shadow.camera.top = 10;
    light.shadow.camera.bottom = -10;
    
    const ambientLight = new THREE.AmbientLight(0x888888, 0.5);
    scene.add(ambientLight);
    

    // Camera setup: Start with a wide view
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 15);  // ✅ Zoom out initially to see all images

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    document.body.appendChild(renderer.domElement);

    // Load wall texture
    const textureLoader = new THREE.TextureLoader();
    const wallTexture = textureLoader.load("images/wall-texture.jpg");
    const wallMaterial = new THREE.MeshLambertMaterial({ map: wallTexture });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(50, 30), wallMaterial);
    
    // ✅ Ensure the wall receives shadows
    wall.receiveShadow = true;
    
    wall.position.set(0, 0, -5);
    scene.add(wall);
    

    // Define grid layout
    const cols = Math.ceil(Math.sqrt(images.length));
    const rows1 = Math.ceil(images.length / cols);
    const spacingX = 6, spacingY = 5;
    const startX = -(cols / 2) * spacingX + spacingX / 2;
    const startY = (rows1 / 2) * spacingY - spacingY / 2;


    
    function addCaption(x, y, text, photoWidth) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
    
        let padding = 10;
        let fontSize = 14;
    
        // ✅ Set max width slightly smaller than the image
        let maxTextWidth = photoWidth * 75; 
    
        // Set font for measurement
        ctx.font = `italic bold ${fontSize}px "Dancing Script", cursive`;
    
        // ✅ Word-wrap function to prevent long captions
        function wrapText(ctx, text, maxWidth) {
            let words = text.split(" ");
            let lines = [];
            let line = "";
    
            for (let word of words) {
                let testLine = line + word + " ";
                let metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth && line.length > 0) {
                    lines.push(line);
                    line = word + " ";
                } else {
                    line = testLine;
                }
            }
            lines.push(line);
            return lines;
        }
    
        // ✅ Apply word wrapping
        let wrappedLines = wrapText(ctx, text, maxTextWidth);
        let textHeight = (wrappedLines.length * fontSize) + padding;
    
        // ✅ Dynamically adjust canvas size
        canvas.width = maxTextWidth + padding;
        canvas.height = textHeight + padding;
    
        // ✅ Reapply font after canvas resize
        ctx.font = `italic bold ${fontSize}px "Dancing Script", cursive`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
    
        // ✅ Draw background "paper"
        ctx.fillStyle = "#fdf7e3";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    
        // ✅ Draw soft border
        ctx.strokeStyle = "#e0d5b9";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
    
        // ✅ Draw wrapped text, line by line
        ctx.fillStyle = "black";
        let textY = padding;
        for (let line of wrappedLines) {
            ctx.fillText(line, canvas.width / 2, textY);
            textY += fontSize;
        }
    
        // ✅ Convert to Three.js texture
        const captionTexture = new THREE.CanvasTexture(canvas);
        captionTexture.minFilter = THREE.LinearFilter;
    
        const captionMaterial = new THREE.MeshLambertMaterial({
            map: captionTexture,
            transparent: true,
            depthTest: false
        });
    
        // ✅ Scale dynamically based on text size
        let planeWidth = canvas.width / 100;
        let planeHeight = canvas.height / 100;
    
        // ✅ Create a caption mesh
        const captionPlane = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeHeight), captionMaterial);
        captionPlane.position.set(x, y, 0.01); // ✅ Position relative to the image
    
        return captionPlane; // ✅ Return caption so it can be added to the group
    }
    
    
    
    // Define layout variables
    let rowWidths = []; // Stores total width per row to prevent overlaps
    const rowHeights = []; // Keeps track of row heights

    let maxRowHeight = 0;
    let rowImages = [];  // Stores images in the current row
// Define row tracking variables
let rows = [];  // Stores each row's images
let currentRowWidth = 0;
let currentRow = 0;
let maxRowWidth = 20; // Max width before moving to a new row
let yOffset = 0; // Tracks vertical position of rows

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

        const material = new THREE.MeshLambertMaterial({ map: texture });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeHeight), material);

        // ✅ Enable shadows
        plane.castShadow = true;
        plane.receiveShadow = true;

        // ✅ Tilt the image slightly for a "pinned" effect
        plane.rotation.z = (Math.random() - 0.5) * 0.02;

        // ✅ Start a new row if adding this image would exceed the max width
        if (currentRowWidth + planeWidth > maxRowWidth) {
            console.log(`Starting new row ${currentRow + 1}`);
            currentRow++;
            currentRowWidth = 0;
            yOffset -= 6; // Move down for the next row
        }

        // ✅ Initialize row storage before adding images
        if (!rows[currentRow]) {
            rows[currentRow] = [];
        }

        // ✅ Create a group for the image and caption
        const group = new THREE.Group();
        
        // ✅ Position the image at (0,0) inside the group
        plane.position.set(0, 0, 0);
        group.add(plane);

        // ✅ Create and position the caption **relative to the image**
        let captionY = -(planeHeight / 2) - 0.5;
        let caption = addCaption(0, captionY, images[i].caption, planeWidth);
        group.add(caption);

        // ✅ Calculate the X position for the **entire group**
        let x = currentRowWidth + (planeWidth / 2);
        let y = yOffset;

        // ✅ Position the group (instead of separate elements)
        group.position.set(x, y, 0);
        scene.add(group);
        photoPlanes.push(group);

        // ✅ Store the group in the row tracking
        rows[currentRow].push({ group, width: planeWidth });

        // ✅ Update row width tracking
        currentRowWidth += planeWidth + 1; // Add buffer space

        // ✅ After all images in row are loaded, adjust row centering
        let totalRowWidth = rows[currentRow].reduce((sum, img) => sum + img.width + 1, 0);
        let rowXOffset = -totalRowWidth / 2;

        rows[currentRow].forEach(imgObj => {
            imgObj.group.position.x += rowXOffset;
        });
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
const animationDuration = 5000; // 5 seconds per movement

function moveCameraToNextPhoto(timestamp) {
    if (!animationStart) animationStart = timestamp;
    let progress = (timestamp - animationStart) / animationDuration;

    if (photoPlanes.length === 0) return;

    const target = photoPlanes[currentIndex].position;

    // ✅ Get image size from current index
    const currentImageGroup = photoPlanes[currentIndex];
    let imageHeight = 4;  // Default image height
    let captionHeight = 1.5;  // Approximate caption height
    let totalHeight = imageHeight + captionHeight + 1; // Extra padding for spacing

    // ✅ Adjust zoom based on image + caption height
    let idealZoom = totalHeight * 1.2;  // Multiplier for extra margin
    camera.position.z += (idealZoom - camera.position.z) * 0.05;  // Smooth zooming

    // ✅ Move camera to the next image smoothly
    camera.position.x += (target.x - camera.position.x) * 0.1;
    camera.position.y += (target.y - camera.position.y) * 0.1;

    if (progress >= 1) {
        animationStart = null;
        currentIndex = (currentIndex + 1) % photoPlanes.length;
        setTimeout(() => {
            requestAnimationFrame(moveCameraToNextPhoto);
        }, 1000);  // ✅ Pause for 5 seconds before moving to next image
    } else {
        requestAnimationFrame(moveCameraToNextPhoto);
    }
}



function animate() {
    console.log("Render loop running");

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

    console.log(`Slideshow started - Showing full gallery for ${zoomDelayBeforeStart / 1000} seconds`);

    currentIndex = 0;
    animationState = "waiting";  // ✅ New state to prevent early animation
    animationStart = null;

    // ✅ Delay the camera movement
    setTimeout(() => {
        console.log("Zooming into first image...");
        animationState = "moving";  // ✅ Change state so movement can start
        requestAnimationFrame(moveCameraToNextPhoto);
    }, zoomDelayBeforeStart);  // ✅ Uses the configurable delay

    document.getElementById("start-btn").disabled = true;
    document.getElementById("stop-btn").disabled = false;
}





function stopSlideshow() {
    isTransitioning = false;
    animationLoopStarted = false; // Reset the flag
    document.getElementById("start-btn").disabled = false;
    document.getElementById("stop-btn").disabled = true;
}