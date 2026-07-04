const CAMERA_IDLE_Z = 8;
const MOVE_IN_MS = 2000;
const HOLD_MS = 1000;
const MOVE_OUT_MS = 1800;
const BRIDGE_MOVE_MS = 1400;
const DEFAULT_CYCLE_MS = 7000;
const REDUCED_MOTION_CYCLE_MS = 2500;

const ALLOWED_IMAGE_HOSTS = ["bbc.co.uk", "bbci.co.uk"];

const WALL_Z = -5;
const PHOTO_BASE_Z = WALL_Z + 0.08;
const PHOTO_SLOT_WIDTH = 4.8;
const PHOTO_SLOT_HEIGHT = 3.4;
const FRAME_BORDER = 0.22;
const GALLERY_GAP_X = 0.85;
const GALLERY_GAP_Y = 0.65;

const VIEWPORT_FILL_RATIO = 0.82;
const OVERVIEW_FILL_RATIO = 0.9;
const OVERVIEW_EXTRA_Z = 0.7;
const OVERVIEW_MOVE_MS = 1200;
const ZOOM_OUT_BUFFER = 1.9;

const MIDI_TRACK_URL = "music/slideshow.mid";
const MIDI_PORT_NAME = "Slideshow Tiny Synth";
const MIDI_GAIN_SCALE = 0.5;

const state = {
    scene: null,
    camera: null,
    renderer: null,
    photoPlanes: [],
    images: [],
    currentIndex: 0,
    isRunning: false,
    isTransitioning: false,
    isReady: false,
    isOverview: false,

    intervalId: null,
    transitionTimeoutId: null,
    animationFrameId: null,
    cameraMoveRafId: null,
    transitionRunId: 0,

    galleryBounds: null,

    midiLoaded: false,
    midiEnabled: true,
    smfData: null,
    midiPlayer: null,
    midiProcessor: null,
    midiOut: null,
    midiDurationMs: 0,
    isMuted: false,

    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
};

let toggleBtn = null;
let zoomOutBtn = null;
let muteBtn = null;
let statusEl = null;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

document.addEventListener("DOMContentLoaded", initialize);
window.addEventListener("beforeunload", teardown);

function setStatus(message, isError = false) {
    if (!statusEl) {
        return;
    }
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
}

function setControls({ canStart, isRunning }) {
    state.isRunning = Boolean(isRunning);

    if (toggleBtn) {
        toggleBtn.disabled = !canStart;
        toggleBtn.textContent = state.isRunning ? "Pause Slideshow" : "Start Slideshow";
        toggleBtn.setAttribute("aria-pressed", state.isRunning ? "true" : "false");
        toggleBtn.classList.toggle("running", state.isRunning);
    }

    if (zoomOutBtn) {
        zoomOutBtn.disabled = !canStart;
    }

    if (muteBtn) {
        muteBtn.disabled = !canStart || !state.midiEnabled;
        muteBtn.textContent = state.isMuted ? "Unmute" : "Mute";
        muteBtn.setAttribute("aria-pressed", state.isMuted ? "true" : "false");
        muteBtn.classList.toggle("muted", state.isMuted);
    }
}

function isAllowedImageUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== "https:") {
            return false;
        }

        return ALLOWED_IMAGE_HOSTS.some(
            (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
        );
    } catch (_) {
        return false;
    }
}

function sanitizeImages(rawImages) {
    if (!Array.isArray(rawImages)) {
        return [];
    }

    const seen = new Set();
    return rawImages
        .filter((item) => item && typeof item.src === "string")
        .map((item) => ({
            src: item.src,
            caption: typeof item.caption === "string" && item.caption.trim()
                ? item.caption.replace(/^Image caption,\s*/i, "").trim()
                : "Untitled"
        }))
        .filter((item) => {
            if (!isAllowedImageUrl(item.src) || seen.has(item.src)) {
                return false;
            }
            seen.add(item.src);
            return true;
        });
}

function loadImagesFromStorage() {
    return new Promise((resolve) => {
        chrome.storage.local.get("images", (data) => {
            if (chrome.runtime.lastError) {
                console.warn("Failed to read stored images:", chrome.runtime.lastError.message);
                resolve([]);
                return;
            }
            resolve(sanitizeImages(data.images));
        });
    });
}

function loadTexture(textureLoader, src) {
    return new Promise((resolve) => {
        textureLoader.load(
            src,
            (texture) => {
                texture.minFilter = THREE.LinearFilter;
                texture.generateMipmaps = false;
                resolve(texture);
            },
            undefined,
            () => resolve(null)
        );
    });
}

function createPhotoCard(texture, caption, index) {
    const card = new THREE.Group();

    const imageAspect = texture?.image?.width && texture?.image?.height
        ? texture.image.width / texture.image.height
        : 4 / 3;

    let photoWidth = PHOTO_SLOT_WIDTH;
    let photoHeight = photoWidth / imageAspect;

    if (photoHeight > PHOTO_SLOT_HEIGHT) {
        photoHeight = PHOTO_SLOT_HEIGHT;
        photoWidth = photoHeight * imageAspect;
    }

    const matteWidth = photoWidth + FRAME_BORDER;
    const matteHeight = photoHeight + FRAME_BORDER;

    const coreShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(matteWidth + 0.06, matteHeight + 0.06),
        new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.14,
            depthWrite: false
        })
    );
    coreShadow.position.set(0.045, -0.045, -0.001);

    const matte = new THREE.Mesh(
        new THREE.PlaneGeometry(matteWidth, matteHeight),
        new THREE.MeshBasicMaterial({ color: 0xf4efe6 })
    );
    matte.position.set(0, 0, 0.01);

    const photo = new THREE.Mesh(
        new THREE.PlaneGeometry(photoWidth, photoHeight),
        new THREE.MeshBasicMaterial({ map: texture })
    );
    photo.position.set(0, 0, 0.02);

    card.add(coreShadow);
    card.add(matte);
    card.add(photo);

    card.rotation.z = ((index % 5) - 2) * 0.01;
    card.userData.caption = caption;
    card.userData.index = index;
    card.userData.frameWidth = matteWidth;
    card.userData.frameHeight = matteHeight;

    return card;
}

function getCardFromObject(object) {
    let current = object;
    while (current) {
        if (current.userData && Number.isInteger(current.userData.index)) {
            return current;
        }
        current = current.parent;
    }
    return null;
}

function getCameraZForFrame(frameWidth, frameHeight, fillRatio) {
    if (!state.camera) {
        return CAMERA_IDLE_Z;
    }

    const vFov = (state.camera.fov * Math.PI) / 180;
    const aspect = state.camera.aspect || (window.innerWidth / window.innerHeight);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

    const distanceForHeight = (frameHeight / 2) / Math.tan(vFov / 2) / fillRatio;
    const distanceForWidth = (frameWidth / 2) / Math.tan(hFov / 2) / fillRatio;

    return PHOTO_BASE_Z + Math.max(distanceForHeight, distanceForWidth);
}

function getFocusCameraZ(targetObject) {
    const frameWidth = targetObject?.userData?.frameWidth || PHOTO_SLOT_WIDTH;
    const frameHeight = targetObject?.userData?.frameHeight || PHOTO_SLOT_HEIGHT;
    return getCameraZForFrame(frameWidth, frameHeight, VIEWPORT_FILL_RATIO);
}

function computeGalleryBounds(cards) {
    if (!cards.length) {
        state.galleryBounds = null;
        return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    cards.forEach((card) => {
        const halfW = (card.userData.frameWidth || PHOTO_SLOT_WIDTH) / 2;
        const halfH = (card.userData.frameHeight || PHOTO_SLOT_HEIGHT) / 2;
        minX = Math.min(minX, card.position.x - halfW);
        maxX = Math.max(maxX, card.position.x + halfW);
        minY = Math.min(minY, card.position.y - halfH);
        maxY = Math.max(maxY, card.position.y + halfH);
    });

    state.galleryBounds = {
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
        width: maxX - minX,
        height: maxY - minY
    };
}

function getGalleryOverviewCameraZ() {
    if (!state.galleryBounds) {
        return CAMERA_IDLE_Z;
    }

    return getCameraZForFrame(
        state.galleryBounds.width,
        state.galleryBounds.height,
        OVERVIEW_FILL_RATIO
    ) + OVERVIEW_EXTRA_Z;
}

function onResize() {
    if (!state.camera || !state.renderer) {
        return;
    }

    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    if (!state.renderer || !state.scene || !state.camera) {
        return;
    }

    state.animationFrameId = requestAnimationFrame(animate);
    TWEEN.update(performance.now());
    state.renderer.render(state.scene, state.camera);
}

function wait(ms) {
    return new Promise((resolve) => {
        state.transitionTimeoutId = setTimeout(resolve, ms);
    });
}

function animateCameraTo(position, durationMs) {
    return new Promise((resolve) => {
        if (!state.camera) {
            resolve(false);
            return;
        }

        const startPos = {
            x: state.camera.position.x,
            y: state.camera.position.y,
            z: state.camera.position.z
        };
        const startTime = performance.now();

        const step = (now) => {
            if (!state.camera) {
                resolve(false);
                return;
            }

            const t = Math.min((now - startTime) / durationMs, 1);
            const eased = t * (2 - t);

            state.camera.position.set(
                startPos.x + (position.x - startPos.x) * eased,
                startPos.y + (position.y - startPos.y) * eased,
                startPos.z + (position.z - startPos.z) * eased
            );

            if (t >= 1) {
                state.cameraMoveRafId = null;
                resolve(true);
                return;
            }

            state.cameraMoveRafId = requestAnimationFrame(step);
        };

        state.cameraMoveRafId = requestAnimationFrame(step);
    });
}

function stopAnimationLoop() {
    if (state.animationFrameId) {
        cancelAnimationFrame(state.animationFrameId);
        state.animationFrameId = null;
    }
}

function disposeMaterial(material) {
    if (!material) {
        return;
    }

    if (material.map) {
        material.map.dispose();
    }
    material.dispose();
}

function clearTransitions() {
    state.transitionRunId += 1;

    if (state.transitionTimeoutId) {
        clearTimeout(state.transitionTimeoutId);
        state.transitionTimeoutId = null;
    }

    if (state.cameraMoveRafId) {
        cancelAnimationFrame(state.cameraMoveRafId);
        state.cameraMoveRafId = null;
    }

    TWEEN.removeAll();
    state.isTransitioning = false;
}

function teardownScene() {
    clearTransitions();
    stopAnimationLoop();
    window.removeEventListener("resize", onResize);

    if (state.scene) {
        state.scene.traverse((node) => {
            if (!node.isMesh) {
                return;
            }

            if (node.geometry) {
                node.geometry.dispose();
            }

            if (Array.isArray(node.material)) {
                node.material.forEach(disposeMaterial);
            } else {
                disposeMaterial(node.material);
            }
        });
    }

    if (state.renderer) {
        state.renderer.dispose();
        if (state.renderer.domElement && state.renderer.domElement.parentNode) {
            state.renderer.domElement.parentNode.removeChild(state.renderer.domElement);
        }
    }

    state.scene = null;
    state.camera = null;
    state.renderer = null;
    state.photoPlanes = [];
    state.currentIndex = 0;
}

async function init3DScene(images) {
    teardownScene();

    if (!images.length) {
        return 0;
    }

    state.scene = new THREE.Scene();
    state.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    state.camera.position.set(0, 0, 10);

    state.renderer = new THREE.WebGLRenderer({ antialias: true });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(state.renderer.domElement);
    state.renderer.domElement.addEventListener("click", onSceneClick);

    window.addEventListener("resize", onResize, { passive: true });

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin("anonymous");

    const wallTexture = await loadTexture(textureLoader, "images/wall-texture.jpg");
    const wallMaterial = wallTexture
        ? new THREE.MeshBasicMaterial({ map: wallTexture })
        : new THREE.MeshBasicMaterial({ color: 0x202020 });

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(50, 30), wallMaterial);
    wall.position.set(0, 0, WALL_Z);
    state.scene.add(wall);

    const cols = Math.ceil(Math.sqrt(images.length));
    const spacingX = PHOTO_SLOT_WIDTH + FRAME_BORDER + GALLERY_GAP_X;
    const spacingY = PHOTO_SLOT_HEIGHT + FRAME_BORDER + GALLERY_GAP_Y;
    const startX = -(cols / 2) * spacingX + spacingX / 2;
    const rows = Math.ceil(images.length / cols);
    const startY = (rows / 2) * spacingY - spacingY / 2;

    for (let i = 0; i < images.length; i++) {
        const texture = await loadTexture(textureLoader, images[i].src);
        if (!texture) {
            continue;
        }

        const card = createPhotoCard(texture, images[i].caption, i);
        const x = startX + (i % cols) * spacingX;
        const y = startY - Math.floor(i / cols) * spacingY;

        card.position.set(x, y, PHOTO_BASE_Z);
        state.scene.add(card);
        state.photoPlanes.push(card);
    }

    computeGalleryBounds(state.photoPlanes);
    animate();
    return state.photoPlanes.length;
}

async function showGalleryOverview() {
    if (!state.camera || !state.galleryBounds) {
        return;
    }

    const overviewZ = getGalleryOverviewCameraZ();
    await animateCameraTo(
        { x: state.galleryBounds.centerX, y: state.galleryBounds.centerY, z: overviewZ },
        OVERVIEW_MOVE_MS
    );

    if (state.camera) {
        state.camera.lookAt(state.galleryBounds.centerX, state.galleryBounds.centerY, PHOTO_BASE_Z);
    }

    state.isOverview = true;
}

async function focusImageByIndex(index) {
    if (!state.camera || !state.photoPlanes.length) {
        return;
    }

    const safeIndex = Math.max(0, Math.min(index, state.photoPlanes.length - 1));
    const targetObject = state.photoPlanes[safeIndex];
    const target = targetObject.position;
    const focusZ = getFocusCameraZ(targetObject);

    clearTransitions();
    await animateCameraTo({ x: target.x, y: target.y, z: focusZ }, OVERVIEW_MOVE_MS);

    if (state.camera) {
        state.camera.lookAt(target.x, target.y, PHOTO_BASE_Z);
    }

    state.currentIndex = safeIndex;
    state.isOverview = false;
    setStatus(targetObject.userData.caption || "Untitled");
}

async function moveCameraToNextPhoto() {
    if (!state.camera || !state.photoPlanes.length || state.isTransitioning) {
        return;
    }

    state.isTransitioning = true;
    state.isOverview = false;
    const runId = state.transitionRunId;

    const targetIndex = state.currentIndex % state.photoPlanes.length;
    const targetObject = state.photoPlanes[targetIndex];
    const target = targetObject.position;
    const currentFocusZ = getFocusCameraZ(targetObject);

    state.camera.lookAt(target.x, target.y, PHOTO_BASE_Z);
    setStatus(targetObject.userData.caption || "Untitled");

    if (state.reducedMotion || state.photoPlanes.length === 1) {
        state.camera.position.set(target.x, target.y, currentFocusZ);
        state.camera.lookAt(target.x, target.y, PHOTO_BASE_Z);
        state.currentIndex++;
        state.isTransitioning = false;
        return;
    }

    await animateCameraTo({ x: target.x, y: target.y, z: currentFocusZ }, MOVE_IN_MS);
    if (runId !== state.transitionRunId) {
        state.isTransitioning = false;
        return;
    }

    await wait(HOLD_MS);
    if (runId !== state.transitionRunId) {
        state.isTransitioning = false;
        return;
    }

    const nextIndex = (targetIndex + 1) % state.photoPlanes.length;
    const nextObject = state.photoPlanes[nextIndex];
    const nextTarget = nextObject.position;
    const nextFocusZ = getFocusCameraZ(nextObject);

    if (nextTarget.x < target.x) {
        const bridgeZ = Math.max(currentFocusZ, nextFocusZ) + ZOOM_OUT_BUFFER;
        await animateCameraTo(
            {
                x: (target.x + nextTarget.x) / 2,
                y: (target.y + nextTarget.y) / 2,
                z: bridgeZ
            },
            BRIDGE_MOVE_MS
        );

        if (runId !== state.transitionRunId) {
            state.isTransitioning = false;
            return;
        }
    }

    await animateCameraTo({ x: nextTarget.x, y: nextTarget.y, z: nextFocusZ }, MOVE_OUT_MS);
    if (runId !== state.transitionRunId) {
        state.isTransitioning = false;
        return;
    }

    state.camera.lookAt(nextTarget.x, nextTarget.y, PHOTO_BASE_Z);
    setStatus(nextObject.userData.caption || "Untitled");

    state.currentIndex++;
    state.isTransitioning = false;
}

function applyMidiMuteState() {
    if (!state.midiPlayer || !state.midiEnabled) {
        return;
    }

    try {
        if (state.isMuted) {
            if (state.midiPlayer.playing) {
                state.midiPlayer.pause();
            }
            return;
        }

        if (state.isRunning && state.midiPlayer.paused) {
            state.midiPlayer.resume();
        }
    } catch (error) {
        console.warn("Unable to apply MIDI mute state:", error);
    }
}

function scaleMidiValue(value, { preserveNonZero = false } = {}) {
    const scaled = Math.round(value * MIDI_GAIN_SCALE);
    if (preserveNonZero && value > 0) {
        return Math.max(1, Math.min(127, scaled));
    }

    return Math.max(0, Math.min(127, scaled));
}

function createMidiProcessor() {
    return JZZ.Widget({
        _receive(message) {
            const nextMessage = JZZ.MIDI(message);
            const status = nextMessage[0] & 0xf0;

            if (status === 0x90 && nextMessage[2] > 0) {
                nextMessage[2] = scaleMidiValue(nextMessage[2], { preserveNonZero: true });
            } else if (status === 0xb0 && (nextMessage[1] === 7 || nextMessage[1] === 11)) {
                nextMessage[2] = scaleMidiValue(nextMessage[2]);
            }

            this.emit(nextMessage);
        }
    });
}

async function ensureMidiLoaded() {
    if (state.midiLoaded) {
        return;
    }

    try {
        if (typeof JZZ === "undefined" || !JZZ.MIDI || !JZZ.MIDI.SMF || !JZZ.synth || !JZZ.synth.Tiny) {
            throw new Error("JZZ modules are missing.");
        }

        JZZ.synth.Tiny.register(MIDI_PORT_NAME);
        state.midiOut = JZZ().openMidiOut(MIDI_PORT_NAME);
        state.midiProcessor = createMidiProcessor();

        const response = await fetch(MIDI_TRACK_URL);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        state.smfData = new Uint8Array(buffer);
        const smf = new JZZ.MIDI.SMF(state.smfData);
        state.midiPlayer = smf.player();
        state.midiPlayer.loop(true);
        state.midiPlayer.connect(state.midiProcessor);
        state.midiProcessor.connect(state.midiOut);
        state.midiDurationMs = state.midiPlayer.durationMS ? state.midiPlayer.durationMS() : 0;

        state.midiLoaded = true;
        applyMidiMuteState();
    } catch (error) {
        state.midiEnabled = false;
        console.warn("MIDI setup unavailable:", error);
    }
}

function stopMidiPlayback() {
    if (!state.midiPlayer) {
        return;
    }

    try {
        state.midiPlayer.stop();
    } catch (_) {
        // no-op
    }

    if (state.midiOut) {
        for (let ch = 0; ch < 16; ch++) {
            state.midiOut.send([0xb0 + ch, 123, 0]);
            state.midiOut.send([0xb0 + ch, 120, 0]);
        }
    }
}

function pauseMidiPlayback() {
    if (!state.midiPlayer) {
        return;
    }

    try {
        if (state.midiPlayer.playing) {
            state.midiPlayer.pause();
        }
    } catch (error) {
        console.warn("Unable to pause MIDI playback:", error);
    }
}

async function startMidiPlayback() {
    await ensureMidiLoaded();
    if (!state.midiEnabled || !state.midiPlayer) {
        return;
    }

    try {
        if (state.midiPlayer.paused && state.midiPlayer.positionMS() > 0) {
            applyMidiMuteState();
            if (!state.isMuted) {
                state.midiPlayer.resume();
            }
            return;
        }

        if (!state.midiPlayer.playing) {
            state.midiPlayer.play();
        }

        applyMidiMuteState();
    } catch (error) {
        console.warn("Unable to start MIDI playback:", error);
    }
}

function toggleMute() {
    state.isMuted = !state.isMuted;
    applyMidiMuteState();
    setControls({ canStart: state.isReady && state.photoPlanes.length > 0, isRunning: state.isRunning });
}

function startSlideshow() {
    if (!state.isReady || !state.photoPlanes.length) {
        setStatus("No images loaded yet. Open a BBC article and reload.", true);
        return;
    }

    if (state.intervalId) {
        clearInterval(state.intervalId);
    }

    state.isOverview = false;
    moveCameraToNextPhoto();

    const cycleMs = state.reducedMotion ? REDUCED_MOTION_CYCLE_MS : DEFAULT_CYCLE_MS;
    state.intervalId = setInterval(moveCameraToNextPhoto, cycleMs);

    startMidiPlayback().catch((error) => {
        console.warn("Unable to start MIDI playback:", error);
    });

    setControls({ canStart: true, isRunning: true });
}

function stopSlideshow() {
    if (state.intervalId) {
        clearInterval(state.intervalId);
        state.intervalId = null;
    }

    clearTransitions();
    pauseMidiPlayback();

    setControls({ canStart: state.photoPlanes.length > 0, isRunning: false });
    setStatus("Slideshow paused.");
}

function toggleSlideshow() {
    if (!state.isRunning) {
        startSlideshow();
    } else {
        stopSlideshow();
    }
}

async function zoomOutToGallery() {
    stopSlideshow();
    await showGalleryOverview();
    setStatus("Full gallery view.");
}

function onSceneClick(event) {
    if (!state.isOverview || !state.renderer || !state.camera || !state.photoPlanes.length) {
        return;
    }

    const rect = state.renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, state.camera);
    const intersections = raycaster.intersectObjects(state.photoPlanes, true);
    if (!intersections.length) {
        return;
    }

    const card = getCardFromObject(intersections[0].object);
    if (!card || !Number.isInteger(card.userData.index)) {
        return;
    }

    focusImageByIndex(card.userData.index);
}

async function initialize() {
    toggleBtn = document.getElementById("toggle-btn");
    zoomOutBtn = document.getElementById("zoom-out-btn");
    muteBtn = document.getElementById("mute-btn");
    statusEl = document.getElementById("status");

    if (!toggleBtn || !zoomOutBtn || !muteBtn || !statusEl) {
        console.error("Slideshow controls failed to initialize.");
        return;
    }

    await ensureMidiLoaded();

    setControls({ canStart: false, isRunning: false });
    setStatus("Loading images...");

    state.images = await loadImagesFromStorage();
    if (!state.images.length) {
        setStatus("No images found. Open a BBC article and refresh this page.", true);
        return;
    }

    const loadedCount = await init3DScene(state.images);
    if (!loadedCount) {
        setStatus("Images were found but none could be loaded.", true);
        return;
    }

    state.isReady = true;
    setControls({ canStart: true, isRunning: false });
    setStatus(`Loaded ${loadedCount} images.`);

    toggleBtn.addEventListener("click", toggleSlideshow);
    zoomOutBtn.addEventListener("click", zoomOutToGallery);
    muteBtn.addEventListener("click", toggleMute);
}

function teardown() {
    if (toggleBtn) {
        toggleBtn.removeEventListener("click", toggleSlideshow);
    }
    if (zoomOutBtn) {
        zoomOutBtn.removeEventListener("click", zoomOutToGallery);
    }
    if (muteBtn) {
        muteBtn.removeEventListener("click", toggleMute);
    }

    if (state.intervalId) {
        clearInterval(state.intervalId);
        state.intervalId = null;
    }

    stopMidiPlayback();

    if (state.renderer?.domElement) {
        state.renderer.domElement.removeEventListener("click", onSceneClick);
    }

    teardownScene();
}
