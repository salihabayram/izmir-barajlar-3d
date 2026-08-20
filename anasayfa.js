import * as THREE from "three/webgpu";

import {
    positionLocal,
    positionWorld,
    cameraPosition,
    modelNormalMatrix,
    modelWorldMatrix,
    materialColor,
    time,
    vec3,
    sin,
    cos,
    normalize,
    transformDirection,
    dot,
    max,
    pow,
    smoothstep,
    mix
} from "three/tsl";

import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

// ======================================================
// 1. HTML SAHNE ALANI VE AÇIK GÖKYÜZÜ RENKLERİ
// ======================================================

const threeBolumu = document.getElementById("three-bolumu");
const resetViewBtn = document.getElementById("reset-view-btn");
const galleryUpdateDateEl = document.getElementById("gallery-update-date");
const galleryUpdateDateLabelEl = document.getElementById("gallery-update-date-label");
const dateSelectorPopover = document.getElementById("date-selector-popover");
const dateSelectorStatus = document.getElementById("date-selector-status");
const latestDateOptionLabel = document.getElementById("latest-date-option-label");
const lastYearDateOptionLabel = document.getElementById("last-year-date-option-label");
const compareDateOptionLabel = document.getElementById("compare-date-option-label");
const dataSourceBadge = document.getElementById("data-source-badge");
const latestDataDateLabel = document.getElementById("latest-data-date-label");
const usedDataDateLabel = document.getElementById("used-data-date-label");
const dateModeOptions = [...document.querySelectorAll(".date-mode-option")];

const SKY_BASE_COLOR = 0x56a4f7;

// ======================================================
// 2. SAHNE & SİSSİZ AÇIK HAVA YAPILANDIRMASI
// ======================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_BASE_COLOR);
scene.fog = null;

const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.5,
    1200
);

// BAŞLANGIÇ KAMERA VE HEDEF DEĞERLERİ (YATAY DÜZENE UYGUN SAKLANIR)
const DEFAULT_CAMERA_POS = new THREE.Vector3(0, 13.5, 30.5);
const DEFAULT_CONTROLS_TARGET = new THREE.Vector3(0, 2.8, 0);

camera.position.copy(DEFAULT_CAMERA_POS);
camera.lookAt(DEFAULT_CONTROLS_TARGET);

const renderer = new THREE.WebGPURenderer({
    antialias: true,
    // Chromium'un mobil/Responsive Design resize akışında WebGPU arka ucu,
    // kullanımda olan RGBA16Float ara hedefini yok edip eski command buffer'ı
    // submit edebiliyor. Aynı TSL materyallerini destekleyen WebGL2 arka ucu bu
    // sürücü yarışına girmeden kararlı biçimde çalışır.
    forceWebGL: true,
    outputBufferType: THREE.UnsignedByteType
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setClearColor(SKY_BASE_COLOR, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

threeBolumu.appendChild(renderer.domElement);

// ======================================================
// 3. DOĞAL AÇIK MAVİ GÖKYÜZÜ KUBBESİ (SKY DOME)
// ======================================================

function createSkyDome() {
    const skyGeo = new THREE.SphereGeometry(450, 32, 16);

    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, "#237ee6");
    grad.addColorStop(0.28, "#4ca0f8");
    grad.addColorStop(0.60, "#3291e8");
    grad.addColorStop(0.85, "#3f9dec");
    grad.addColorStop(1.0, "#4fa9ef");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 512);

    const skyTex = new THREE.CanvasTexture(canvas);
    skyTex.wrapS = THREE.ClampToEdgeWrapping;
    skyTex.wrapT = THREE.ClampToEdgeWrapping;

    const skyMat = new THREE.MeshBasicMaterial({
        map: skyTex,
        depthWrite: false,
        side: THREE.BackSide
    });

    return new THREE.Mesh(skyGeo, skyMat);
}

const skyDome = createSkyDome();
scene.add(skyDome);

// ======================================================
// 4. 3D KATMANLI CUMULUS BULUT SİSTEMİ
// ======================================================

const cloudsGroup = new THREE.Group();
scene.add(cloudsGroup);

function createRealisticCloudTexture(type = 0) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    const puffSets = [
        [
            { x: 256, y: 250, r: 160, a: 0.95, shade: 0 },
            { x: 180, y: 270, r: 130, a: 0.85, shade: 1 },
            { x: 335, y: 265, r: 135, a: 0.88, shade: 1 },
            { x: 220, y: 195, r: 115, a: 0.90, shade: 0 },
            { x: 295, y: 200, r: 120, a: 0.92, shade: 0 },
            { x: 125, y: 285, r: 90, a: 0.65, shade: 1 },
            { x: 390, y: 280, r: 95, a: 0.68, shade: 1 },
            { x: 256, y: 310, r: 110, a: 0.70, shade: 2 }
        ],
        [
            { x: 256, y: 255, r: 150, a: 0.94, shade: 0 },
            { x: 190, y: 250, r: 120, a: 0.86, shade: 0 },
            { x: 325, y: 260, r: 125, a: 0.88, shade: 1 },
            { x: 256, y: 190, r: 110, a: 0.92, shade: 0 },
            { x: 140, y: 275, r: 85, a: 0.62, shade: 1 },
            { x: 375, y: 270, r: 90, a: 0.65, shade: 1 },
            { x: 256, y: 315, r: 105, a: 0.72, shade: 2 }
        ]
    ];

    const puffs = puffSets[type % puffSets.length];

    puffs.forEach(p => {
        const radGrad = ctx.createRadialGradient(p.x, p.y, p.r * 0.10, p.x, p.y, p.r);

        let innerColor = "255, 255, 255";
        let midColor = "250, 253, 255";
        if (p.shade === 1) {
            innerColor = "246, 250, 255";
            midColor = "236, 244, 253";
        } else if (p.shade === 2) {
            innerColor = "238, 245, 254";
            midColor = "225, 236, 248";
        }

        radGrad.addColorStop(0.0, `rgba(${innerColor}, ${p.a})`);
        radGrad.addColorStop(0.48, `rgba(${midColor}, ${p.a * 0.82})`);
        radGrad.addColorStop(0.78, `rgba(230, 240, 252, ${p.a * 0.32})`);
        radGrad.addColorStop(1.0, "rgba(255, 255, 255, 0)");

        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

const cloudTextureA = createRealisticCloudTexture(0);
const cloudTextureB = createRealisticCloudTexture(1);

const cloudMatA = new THREE.MeshBasicMaterial({
    map: cloudTextureA,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
});

const cloudMatB = new THREE.MeshBasicMaterial({
    map: cloudTextureB,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
});

const lowPolyCloudMat = new THREE.MeshStandardMaterial({
    color: 0xf7fbff,
    emissive: 0xdcecff,
    emissiveIntensity: 0.22,
    roughness: 0.88,
    metalness: 0.0,
    flatShading: false
});

const cloudClusterConfigs = [
    { x: -430, y: 30, z: -920, width: 88, height: 35, scale: 1.72, speed: 1.8 },
    { x: -235, y: 40, z: -1010, width: 108, height: 42, scale: 1.85, speed: 1.5 },
    { x: -55, y: 31, z: -875, width: 82, height: 33, scale: 1.68, speed: 2.0 },
    { x: 120, y: 43, z: -1040, width: 116, height: 44, scale: 1.95, speed: 1.4 },
    { x: 390, y: 30, z: -920, width: 92, height: 36, scale: 1.78, speed: 1.7 },
    { x: -190, y: 48, z: -560, width: 76, height: 31, scale: 1.35, speed: 2.2 },
    { x: 280, y: 52, z: -640, width: 84, height: 34, scale: 1.45, speed: 2.0 },
    // Yeni kümeler mevcut bulutları devleştirmeden gökyüzünün boş kalan
    // sol, orta ve sağ katmanlarını dengeler.
    { x: -535, y: 43, z: -760, width: 72, height: 29, scale: 1.24, speed: 1.9 },
    { x: 35, y: 56, z: -720, width: 78, height: 31, scale: 1.30, speed: 1.7 },
    { x: 515, y: 46, z: -790, width: 70, height: 28, scale: 1.22, speed: 1.8 },
    // Kameranın arkasındaki uzak dağ halkasının üstünde kalan atmosfer katmanı.
    { x: -175, y: 35, z: 225, width: 68, height: 27, scale: 1.18, speed: 1.35 },
    { x: 20, y: 42, z: 255, width: 76, height: 30, scale: 1.28, speed: 1.25 },
    { x: 195, y: 37, z: 215, width: 66, height: 26, scale: 1.16, speed: 1.40 }
];

const cloudClusters = [];
const CLOUD_WIND_DIR = new THREE.Vector3(1, 0, 0.12).normalize();

cloudClusterConfigs.forEach((cfg) => {
    const cluster = new THREE.Group();
    const cloudAltitude = cfg.y;
    cluster.position.set(cfg.x, cloudAltitude, cfg.z);
    cluster.scale.setScalar(cfg.scale);

    const puffLayers = [
        { ox: 0, oy: 0, oz: 0, w: cfg.width * 0.90, h: cfg.height * 0.90, rotX: -0.22, rotZ: 0 },
        { ox: -cfg.width * 0.14, oy: -1.2, oz: 3.5, w: cfg.width * 0.78, h: cfg.height * 0.82, rotX: -0.15, rotZ: 0.08 },
        { ox: cfg.width * 0.15, oy: 0.8, oz: -3.0, w: cfg.width * 0.82, h: cfg.height * 0.84, rotX: -0.28, rotZ: -0.06 },
        { ox: cfg.width * 0.04, oy: 2.2, oz: -1.5, w: cfg.width * 0.58, h: cfg.height * 0.65, rotX: -0.20, rotZ: 0.04 },
        { ox: 0, oy: -0.5, oz: 1.0, w: cfg.width * 0.80, h: cfg.height * 0.75, rotX: -0.75, rotZ: 0.02 }
    ];

    puffLayers.forEach((pl) => {
        const geom = new THREE.IcosahedronGeometry(1, 2);
        const mesh = new THREE.Mesh(geom, lowPolyCloudMat);
        mesh.position.set(pl.ox, pl.oy, pl.oz);
        mesh.scale.set(pl.w * 0.105, pl.h * 0.115, pl.w * 0.060);
        mesh.rotation.set(pl.rotX * 0.25, pl.rotZ, pl.rotZ * 0.5);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        cluster.add(mesh);
    });

    cluster.userData = {
        velocity: CLOUD_WIND_DIR.clone().multiplyScalar(cfg.speed),
        initialY: cloudAltitude,
        initialZ: cfg.z,
        baseScale: 1.0,
        bobPhase: Math.random() * Math.PI * 2
    };

    cloudsGroup.add(cluster);
    cloudClusters.push(cluster);
});

// ======================================================
// 5. CSS2D RENDERER (TANK ETİKETLERİ)
// ======================================================

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.left = "0";
labelRenderer.domElement.style.top = "0";
labelRenderer.domElement.style.pointerEvents = "none";
labelRenderer.domElement.style.zIndex = "2";

threeBolumu.appendChild(labelRenderer.domElement);

// ======================================================
// 6. ORBIT CONTROLS & SENKRON GÖRÜNÜMÜ SIFIRLAMA
// ======================================================

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableRotate = true;
controls.enableZoom = true;
controls.enablePan = false;

controls.target.copy(DEFAULT_CONTROLS_TARGET);
controls.minPolarAngle = 0.04;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minDistance = 4.5;
controls.maxDistance = 80.0;

const resetStartPosition = new THREE.Vector3();
const resetStartTarget = new THREE.Vector3();

let isResettingView = false;
let resetStartTime = 0;
const RESET_DURATION = 850; // ms

function easeInOutCubic(t) {
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function triggerResetView() {
    if (isModalOpen || isResettingView) return;

    resetStartPosition.copy(camera.position);
    resetStartTarget.copy(controls.target);

    resetStartTime = performance.now();
    isResettingView = true;

    controls.enabled = false;
}

if (resetViewBtn) {
    resetViewBtn.addEventListener("click", triggerResetView);
}

// ======================================================
// 7. YATAY PLATFORM VE TANK KONUM MATEMATİĞİ
// ======================================================

const TANK_COUNT = 5;
const TANK_SCALE = 1.88;
const TANK_HEIGHT = 3.0;
const scaledTankHeight = TANK_HEIGHT * TANK_SCALE;
const PODIUM_HEIGHT = 0.16;
const tankY = scaledTankHeight / 2 + PODIUM_HEIGHT;

// 5 Baraj Tankının Soldan Sağa Ferah Yatay Konumları
const tankPositions = [
    { x: -17.0, z: -2.2 }, // Tahtalı
    { x: -8.5, z: -2.2 }, // Balçova
    { x: 0.0, z: -2.2 }, // Gördes
    { x: 8.5, z: -2.2 }, // Ürkmez
    { x: 17.0, z: -2.2 }  // Alaçatı
];

const mobileTankPositions = [
    { x: -11.4, z: -2.2 },
    { x: -5.7, z: -2.2 },
    { x: 0.0, z: -2.2 },
    { x: 5.7, z: -2.2 },
    { x: 11.4, z: -2.2 }
];

const MOBILE_TANK_SCALE = 1.12;

function getTankPosition(index) {
    return tankPositions[index] || { x: 0, z: 0 };
}

// ======================================================
// 8. DOĞAL GÜNDÜZ IŞIKLANDIRMASI
// ======================================================

const ambientLight = new THREE.AmbientLight(0xfff8ee, 0.78);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x98d4ff, 0x4d6642, 0.88);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfffaf0, 2.25);
sunLight.position.set(35, 55, 40);
sunLight.target.position.set(0, 0, 0);
sunLight.castShadow = true;

sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 1.0;
sunLight.shadow.camera.far = 140.0;
sunLight.shadow.camera.left = -45;
sunLight.shadow.camera.right = 45;
sunLight.shadow.camera.top = 45;
sunLight.shadow.camera.bottom = -45;
sunLight.shadow.bias = -0.00012;
sunLight.shadow.normalBias = 0.025;

scene.add(sunLight);
scene.add(sunLight.target);

// ======================================================
// 9. ZEMİNLER: GENİŞ DİKDÖRTGEN PLATFORM + BORDÜR + ÇİMENLİK
// ======================================================

const platformWidth = 46.0;
const platformDepth = 17.5;
const platformHeight = 0.20;
const walkwayRadius = 24.0;

// 1. Açık Gri Geniş Sergi Platformu
const platformGeom = new THREE.BoxGeometry(platformWidth, platformHeight, platformDepth);
const platformMat = new THREE.MeshStandardMaterial({
    color: 0xa8adb5,
    roughness: 0.76,
    metalness: 0.04
});
const platformMesh = new THREE.Mesh(platformGeom, platformMat);
platformMesh.position.set(0, platformHeight / 2 + 0.06, 0.5);
platformMesh.receiveShadow = true;
scene.add(platformMesh);

// 2. İnce Koyu Antrasit Çerçeve/Bordür
const rimWidth = platformWidth + 0.70;
const rimDepth = platformDepth + 0.70;
const rimHeight = 0.07;
const rimGeom = new THREE.BoxGeometry(rimWidth, rimHeight, rimDepth);
const rimMat = new THREE.MeshStandardMaterial({
    color: 0x2d3036,
    roughness: 0.70,
    metalness: 0.12
});
const rimMesh = new THREE.Mesh(rimGeom, rimMat);
rimMesh.position.set(0, rimHeight / 2 + 0.04, 0.5);
rimMesh.receiveShadow = true;
scene.add(rimMesh);

// 3. Doğal Çakıl/Yürüyüş Geçiş Bandı
const walkwayWidth = platformWidth + 4.0;
const walkwayDepth = platformDepth + 4.0;
const walkwayGeom = new THREE.PlaneGeometry(walkwayWidth, walkwayDepth);
const walkwayMat = new THREE.MeshStandardMaterial({
    color: 0x646a72,
    roughness: 0.85,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
});
const walkwayMesh = new THREE.Mesh(walkwayGeom, walkwayMat);
walkwayMesh.rotation.x = -Math.PI / 2;
walkwayMesh.position.set(0, 0.025, 0.5);
walkwayMesh.receiveShadow = true;
scene.add(walkwayMesh);

// ======================================================
// 10. TEK VE BÜTÜNLEŞİK MASTER TOPOĞRAFİK ARAZİ & DAĞ SIRTLARI
// ======================================================

// Ana göletle aynı geniş vadi tabanını paylaşan tek küçük eş gölet.
// Ayrı ayrı terrain çukurları açılmadığı için uzaktan "obruk" görüntüsü oluşmaz.
const decorativePondConfigs = Object.freeze([
    { x: -60, z: -11, radiusX: 4.8, radiusZ: 3.25, seed: 1.9, color: 0x315f62 }
]);

const DAM_ENVIRONMENT = Object.freeze({
    x: 52,
    z: -112,
    rotationY: -0.40,
    halfSpan: 31.5,
    halfDepth: 11.5
});

// Baraj koridoruna değen terrain üçgenlerini tamamen kaldırır. Vertexleri yalnızca
// aşağı çekmek, seyrek yüzeylerde komşu üçgenlerin betonun içinden geçmesine yol
// açtığı için açıklık doğrudan geometri üzerinde oluşturulur.
function carveDamClearance(geometry, offsetX = 0, offsetZ = 0, marginX = 0.9, marginZ = 0.9) {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = source.attributes.position;
    const keptVertexIndices = [];
    const cos = Math.cos(DAM_ENVIRONMENT.rotationY);
    const sin = Math.sin(DAM_ENVIRONMENT.rotationY);
    const clearanceX = DAM_ENVIRONMENT.halfSpan + marginX;
    const clearanceZ = DAM_ENVIRONMENT.halfDepth + marginZ;

    for (let i = 0; i < position.count; i += 3) {
        let minLocalX = Infinity;
        let maxLocalX = -Infinity;
        let minLocalZ = Infinity;
        let maxLocalZ = -Infinity;

        for (let vertex = 0; vertex < 3; vertex++) {
            const index = i + vertex;
            const dx = offsetX + position.getX(index) - DAM_ENVIRONMENT.x;
            const dz = offsetZ + position.getZ(index) - DAM_ENVIRONMENT.z;
            const localX = cos * dx - sin * dz;
            const localZ = sin * dx + cos * dz;
            minLocalX = Math.min(minLocalX, localX);
            maxLocalX = Math.max(maxLocalX, localX);
            minLocalZ = Math.min(minLocalZ, localZ);
            maxLocalZ = Math.max(maxLocalZ, localZ);
        }

        const overlapsClearance =
            minLocalX < clearanceX && maxLocalX > -clearanceX &&
            minLocalZ < clearanceZ && maxLocalZ > -clearanceZ;
        if (!overlapsClearance) keptVertexIndices.push(i, i + 1, i + 2);
    }

    const carved = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) {
        const values = [];
        for (const vertexIndex of keptVertexIndices) {
            const start = vertexIndex * attribute.itemSize;
            for (let component = 0; component < attribute.itemSize; component++) {
                values.push(attribute.array[start + component]);
            }
        }
        carved.setAttribute(
            name,
            new THREE.BufferAttribute(new attribute.array.constructor(values), attribute.itemSize, attribute.normalized)
        );
    }
    return carved;
}

// Gerçek Topoğrafik Dağ Yükseklik Fonksiyonu
function getMountainHeight(x, z) {
    // 1. Ana platform etrafındaki düz vadiyi koruma
    const distCenter = Math.hypot(x, z);
    if (distCenter < 24.0) return 0;
    const centerFactor = Math.min(Math.max((distCenter - 24.0) / 18.0, 0), 1);
    const smoothCenter = centerFactor * centerFactor * (3 - 2 * centerFactor);

    // Referanstaki geniş rezervuar vadisi: su yüzeyinin altında tek ve temiz taban.
    const reservoirMetric = Math.min(
        Math.hypot(x / 146.0, (z + 82.0) / 82.0),
        Math.hypot((x + 76.0) / 72.0, (z + 158.0) / 68.0),
        Math.hypot((x - 12.0) / 66.0, (z + 182.0) / 78.0),
        Math.hypot((x - 96.0) / 58.0, (z + 144.0) / 62.0)
    );
    let reservoirFactor = 1.0;
    if (reservoirMetric < 1.50) {
        const rf = THREE.MathUtils.clamp((reservoirMetric - 0.78) / 0.72, 0, 1);
        reservoirFactor = rf * rf * rf * (rf * (rf * 6 - 15) + 10);
    }

    // 2. İki göleti tek, geniş ve yumuşak bir vadi tabanına oturt.
    // Geniş geçiş bandı sert kesik yüzeyleri ve yapay çöküntüleri önler.
    const pondFactor = 1.0;

    function broadRidge(centerX, centerZ, radiusX, radiusZ, height, seed) {
        const dx = (x - centerX) / radiusX;
        const dz = (z - centerZ) / radiusZ;
        const distance = Math.hypot(dx, dz);
        if (distance >= 1) return 0;

        const angle = Math.atan2(dz, dx);
        const irregularEdge = 1
            + Math.sin(angle * 3 + seed) * 0.065
            + Math.sin(angle * 7 - seed * 1.4) * 0.025;
        const normalizedDistance = distance / irregularEdge;
        if (normalizedDistance >= 1) return 0;

        const t = 1 - normalizedDistance;
        const ridgeAngle = seed * 1.31;
        const ridgeAxis = dx * Math.cos(ridgeAngle) + dz * Math.sin(ridgeAngle);
        const crossAxis = -dx * Math.sin(ridgeAngle) + dz * Math.cos(ridgeAngle);
        const mainRidgeDistance = Math.hypot(ridgeAxis / 1.18, crossAxis / 0.66);
        const secondaryDistance = Math.hypot(
            (ridgeAxis - 0.34) / 0.58,
            (crossAxis + 0.10) / 0.72
        );
        const mainRidge = Math.pow(Math.max(1 - mainRidgeDistance, 0), 0.76);
        const secondaryPeak = Math.pow(Math.max(1 - secondaryDistance, 0), 0.84) * 0.72;
        const edgeFade = THREE.MathUtils.smoothstep(t, 0.0, 0.16);
        const slopeBreak = 0.94
            + Math.sin(ridgeAxis * 8.0 + seed) * 0.055
            + Math.cos(crossAxis * 10.0 - seed) * 0.035;

        return height * Math.max(mainRidge, secondaryPeak) * edgeFade * slopeBreak;
    }

    let naturalHeight = 0;
    naturalHeight = Math.max(naturalHeight, broadRidge(-105, -82, 122, 92, 15.0, 0.75));
    naturalHeight = Math.max(naturalHeight, broadRidge(-45, -102, 132, 88, 18.5, 1.55));
    naturalHeight = Math.max(naturalHeight, broadRidge(20, -108, 142, 94, 19.0, 2.35));
    naturalHeight = Math.max(naturalHeight, broadRidge(82, -96, 128, 88, 16.5, 3.10));
    naturalHeight = Math.max(naturalHeight, broadRidge(135, -78, 112, 80, 13.5, 3.90));

    const backgroundBlend = THREE.MathUtils.clamp((-z - 24) / 110, 0, 1);
    const longUndulation =
        Math.sin(x * 0.020 + z * 0.006 + 0.8) * 0.85 +
        Math.cos(x * 0.011 - z * 0.014) * 0.55;
    naturalHeight += Math.max(0, 1.2 + longUndulation * 0.55) * backgroundBlend;

    return Math.max(naturalHeight * smoothCenter * pondFactor * reservoirFactor * 0.48, 0);

}

const hillsGroup = new THREE.Group();
scene.add(hillsGroup);

// --- TEK MASTER DOĞAL YEŞİL DAĞ VE ARAZİ YÜZEYİ ---
let masterTerrainGeom = new THREE.PlaneGeometry(650, 650, 160, 160);
masterTerrainGeom.rotateX(-Math.PI / 2);
const posAttrMaster = masterTerrainGeom.attributes.position;
const terrainColors = [];
const terrainLow = new THREE.Color(0x587f36);
const terrainMid = new THREE.Color(0x3f7040);
const terrainHigh = new THREE.Color(0x315f47);
for (let i = 0; i < posAttrMaster.count; i++) {
    const vx = posAttrMaster.getX(i);
    const vz = posAttrMaster.getZ(i);
    const vy = getMountainHeight(vx, vz);
    posAttrMaster.setY(i, vy);
    const color = vy > 20 ? terrainHigh.clone() : terrainLow.clone().lerp(terrainMid, THREE.MathUtils.clamp(vy / 20, 0, 1));
    const broadVariation = Math.sin(vx * 0.018 + vz * 0.009) * 0.010 + Math.cos(vz * 0.016) * 0.007;
    color.offsetHSL(0, 0, broadVariation);
    terrainColors.push(color.r, color.g, color.b);
}
masterTerrainGeom.setAttribute("color", new THREE.Float32BufferAttribute(terrainColors, 3));
// Baraj açıklığı geometriyi üçgenlere ayırmadan önce yumuşak tepe normallerini
// hesapla. carveDamClearance bu normalleri kopyalayarak korur; sonradan yeniden
// hesaplamak her üçgeni ayrı bir faset gibi görünür hale getiriyordu.
masterTerrainGeom.computeVertexNormals();
masterTerrainGeom = carveDamClearance(masterTerrainGeom, 0, 0, 1.1, 1.1);

const masterTerrainMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.01,
    flatShading: false
});
const masterTerrainMesh = new THREE.Mesh(masterTerrainGeom, masterTerrainMat);
masterTerrainMesh.position.y = 0;
masterTerrainMesh.receiveShadow = true;
masterTerrainMesh.castShadow = false;
scene.add(masterTerrainMesh);

// Static natural snow cap on the upper waterfall mountain and ridge line.
function buildMountainSnowCap() {
    const minX = -65.0;
    const maxX = -12.0;
    const minZ = -76.0;
    const maxZ = -25.0;
    const segmentsX = 62;
    const segmentsZ = 58;
    const vertices = [];

    function snowPoint(x, z) {
        const height = getMountainHeight(x, z);
        const organicSnowLine = 21.2 + Math.sin(x * 0.24) * 0.85 + Math.cos(z * 0.21) * 0.70;
        if (height < organicSnowLine) return null;
        return [x, height + 0.19, z];
    }

    function addTriangle(a, b, c) {
        if (a && b && c) vertices.push(...a, ...b, ...c);
    }

    for (let iz = 0; iz < segmentsZ; iz++) {
        const z0 = THREE.MathUtils.lerp(minZ, maxZ, iz / segmentsZ);
        const z1 = THREE.MathUtils.lerp(minZ, maxZ, (iz + 1) / segmentsZ);
        for (let ix = 0; ix < segmentsX; ix++) {
            const x0 = THREE.MathUtils.lerp(minX, maxX, ix / segmentsX);
            const x1 = THREE.MathUtils.lerp(minX, maxX, (ix + 1) / segmentsX);
            const p00 = snowPoint(x0, z0);
            const p10 = snowPoint(x1, z0);
            const p01 = snowPoint(x0, z1);
            const p11 = snowPoint(x1, z1);
            addTriangle(p00, p01, p10);
            addTriangle(p10, p01, p11);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
}

const mountainSnowMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f8,
    roughness: 0.98,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide
});

const mountainSnowMesh = new THREE.Mesh(buildMountainSnowCap(), mountainSnowMat);
mountainSnowMesh.castShadow = true;
mountainSnowMesh.receiveShadow = true;
mountainSnowMesh.renderOrder = 2;
scene.add(mountainSnowMesh);
mountainSnowMesh.visible = false;

const layeredMountainGroup = new THREE.Group();
scene.add(layeredMountainGroup);

function createConnectedRidgeLayer({ z, width, depth, height, seed, lowColor, highColor }) {
    let geometry = new THREE.PlaneGeometry(width, depth, 72, 12);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = [];
    const low = new THREE.Color(lowColor);
    const high = new THREE.Color(highColor);

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const localZ = position.getZ(i);
        const v = THREE.MathUtils.clamp(localZ / depth + 0.5, 0, 1);
        const crossSection = Math.pow(Math.sin(v * Math.PI), 1.35);
        const broadShoulders =
            0.86 +
            Math.sin(x * 0.018 + seed) * 0.12 +
            Math.sin(x * 0.038 - seed * 0.7) * 0.055 +
            Math.cos(x * 0.009 + seed * 1.8) * 0.08;
        const ridgeDetail = Math.sin(x * 0.055 + seed * 2.1) * height * 0.035;
        const y = Math.max(0, crossSection * (height * broadShoulders + ridgeDetail));
        position.setY(i, y);

        const tone = low.clone().lerp(high, THREE.MathUtils.clamp(y / Math.max(height, 0.001), 0, 1));
        tone.offsetHSL(0, 0, Math.sin(x * 0.018 + localZ * 0.025 + seed) * 0.008);
        colors.push(tone.r, tone.g, tone.b);
    }

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry = carveDamClearance(geometry, 0, z, 1.1, 1.1);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.96,
        metalness: 0,
        flatShading: false
    });
    const ridge = new THREE.Mesh(geometry, material);
    ridge.position.z = z;
    ridge.receiveShadow = true;
    ridge.castShadow = false;
    layeredMountainGroup.add(ridge);
    return ridge;
}

// Başlangıç kamerasında rezervuarı sağdan ve soldan doğal biçimde çerçeveleyen
// geniş yan tepeler. Merkezleri kıyının dışında kalır; yalnızca iç yamaçları
// kadraja girerek platform ve baraj görüşünü açık tutar.
const sideHillConfigs = Object.freeze([
    // Ön rezervuar görünümünü çerçeveleyen ilk iki büyük tepe korunur.
    { x: -168, z: -108, radiusX: 98, radiusZ: 88, height: 22.8, seed: 1.25, treeCount: 5, shrubCount: 3 },
    { x: 182, z: -91, radiusX: 92, radiusZ: 92, height: 24.4, seed: 2.05, treeCount: 5, shrubCount: 3 },

    // Karşı çapraz açıda iki büyük tepe arasında kalan boş geçiş.
    { x: -72, z: -170, radiusX: 88, radiusZ: 76, height: 15.7, seed: 2.30, treeCount: 4, shrubCount: 2 },
    { x: 0, z: -184, radiusX: 102, radiusZ: 82, height: 20.4, seed: 2.55, treeCount: 5, shrubCount: 2 },
    { x: 98, z: -168, radiusX: 78, radiusZ: 74, height: 16.7, seed: 2.80, treeCount: 4, shrubCount: 2 },

    // Referans açısındaki sol boşluk: örtüşen 7 farklı tepe.
    { x: -205, z: 160, radiusX: 58, radiusZ: 72, height: 10.5, seed: 3.10, treeCount: 3, shrubCount: 1 },
    { x: -173, z: 170, radiusX: 62, radiusZ: 76, height: 16.0, seed: 3.75, treeCount: 4, shrubCount: 2 },
    { x: -142, z: 151, radiusX: 56, radiusZ: 68, height: 9.6, seed: 4.40, treeCount: 3, shrubCount: 1 },
    { x: -113, z: 177, radiusX: 65, radiusZ: 80, height: 17.5, seed: 5.05, treeCount: 4, shrubCount: 2 },
    { x: -85, z: 155, radiusX: 53, radiusZ: 66, height: 11.8, seed: 5.70, treeCount: 3, shrubCount: 1 },
    { x: -59, z: 179, radiusX: 56, radiusZ: 72, height: 14.2, seed: 6.35, treeCount: 4, shrubCount: 2 },
    { x: -34, z: 158, radiusX: 48, radiusZ: 62, height: 8.4, seed: 7.00, treeCount: 2, shrubCount: 1 },

    // Sağ boşluk aynı sayıda fakat farklı yükseklik ritminde tamamlanır.
    { x: 35, z: 165, radiusX: 49, radiusZ: 64, height: 9.4, seed: 7.65, treeCount: 2, shrubCount: 1 },
    { x: 62, z: 181, radiusX: 56, radiusZ: 72, height: 14.8, seed: 8.30, treeCount: 4, shrubCount: 2 },
    { x: 91, z: 156, radiusX: 54, radiusZ: 68, height: 10.8, seed: 8.95, treeCount: 3, shrubCount: 1 },
    { x: 120, z: 178, radiusX: 65, radiusZ: 80, height: 18.0, seed: 9.60, treeCount: 4, shrubCount: 2 },
    { x: 149, z: 153, radiusX: 57, radiusZ: 69, height: 10.2, seed: 10.25, treeCount: 3, shrubCount: 1 },
    { x: 179, z: 172, radiusX: 63, radiusZ: 76, height: 16.4, seed: 10.90, treeCount: 4, shrubCount: 2 },
    { x: 211, z: 159, radiusX: 60, radiusZ: 72, height: 12.0, seed: 11.55, treeCount: 3, shrubCount: 1 },

    // İki yan açıdaki düz orta horizon boşluğunu dolduran ikinci, alçak sıra.
    // Bu profiller yeni zincirin parçasıdır; eski mavi rear-ridge katmanı değildir.
    { x: -92, z: 232, radiusX: 82, radiusZ: 68, height: 11.6, seed: 12.20, treeCount: 4, shrubCount: 2 },
    { x: 0, z: 242, radiusX: 94, radiusZ: 74, height: 14.0, seed: 12.85, treeCount: 5, shrubCount: 2 },
    { x: 96, z: 231, radiusX: 84, radiusZ: 70, height: 12.4, seed: 13.50, treeCount: 4, shrubCount: 2 },

    // Platform boyunca bakılan doğu/batı yönlerindeki iki düz koridor.
    { x: -232, z: -68, radiusX: 70, radiusZ: 64, height: 11.8, seed: 14.15, treeCount: 3, shrubCount: 1 },
    { x: -246, z: 0, radiusX: 80, radiusZ: 72, height: 16.2, seed: 14.80, treeCount: 4, shrubCount: 2 },
    { x: -230, z: 70, radiusX: 70, radiusZ: 66, height: 10.6, seed: 15.45, treeCount: 3, shrubCount: 1 },
    { x: 234, z: -66, radiusX: 72, radiusZ: 64, height: 12.6, seed: 16.10, treeCount: 3, shrubCount: 1 },
    { x: 248, z: 2, radiusX: 82, radiusZ: 74, height: 17.0, seed: 16.75, treeCount: 4, shrubCount: 2 },
    { x: 232, z: 72, radiusX: 72, radiusZ: 66, height: 11.2, seed: 17.40, treeCount: 3, shrubCount: 1 }
]);

function getSideHillRise(config, x, z) {
    const dx = (x - config.x) / config.radiusX;
    const dz = (z - config.z) / config.radiusZ;
    const distance = Math.hypot(dx, dz);
    if (distance >= 1) return 0;

    const angle = Math.atan2(dz, dx);
    const irregularEdge = 1 + Math.sin(angle * 5 + config.seed) * 0.035;
    const normalizedDistance = distance / irregularEdge;
    if (normalizedDistance >= 1) return 0;

    const t = 1 - normalizedDistance;
    const ridgeAngle = config.seed * 1.17;
    const ridgeAxis = dx * Math.cos(ridgeAngle) + dz * Math.sin(ridgeAngle);
    const crossAxis = -dx * Math.sin(ridgeAngle) + dz * Math.cos(ridgeAngle);
    const ridgeDistance = Math.hypot(ridgeAxis / 1.20, crossAxis / 0.67);
    const shoulderDistance = Math.hypot(
        (ridgeAxis + 0.31) / 0.62,
        (crossAxis - 0.12) / 0.74
    );
    const ridgeProfile = Math.pow(Math.max(1 - ridgeDistance, 0), 0.72);
    const shoulderProfile = Math.pow(Math.max(1 - shoulderDistance, 0), 0.86) * 0.70;
    const edgeFade = THREE.MathUtils.smoothstep(t, 0.0, 0.17);
    const broadVariation =
        0.96
        + Math.sin(ridgeAxis * 8.5 + config.seed) * 0.065
        + Math.cos(crossAxis * 11.0 - config.seed) * 0.040;
    return Math.max(
        0,
        config.height * Math.max(ridgeProfile, shoulderProfile) * edgeFade * broadVariation
    );
}

function getSideHillSurfaceHeight(x, z) {
    const baseHeight = getMountainHeight(x, z);
    let combinedRise = 0;
    for (const config of sideHillConfigs) {
        combinedRise = Math.max(combinedRise, getSideHillRise(config, x, z));
    }
    return baseHeight + combinedRise;
}

function getCombinedSideHillRise(x, z) {
    let rise = 0;
    for (const config of sideHillConfigs) {
        rise = Math.max(rise, getSideHillRise(config, x, z));
    }
    return rise;
}

function createSideHillTerrain() {
    const minX = Math.min(...sideHillConfigs.map(config => config.x - config.radiusX));
    const maxX = Math.max(...sideHillConfigs.map(config => config.x + config.radiusX));
    const minZ = Math.min(...sideHillConfigs.map(config => config.z - config.radiusZ));
    const maxZ = Math.max(...sideHillConfigs.map(config => config.z + config.radiusZ));
    const segmentsX = 124;
    const segmentsZ = 112;
    const vertices = [];
    const colors = [];
    const indices = [];
    const baseLow = new THREE.Color(0x587f36);
    const baseMid = new THREE.Color(0x3f7040);
    const hillLow = new THREE.Color(0x4d7835);
    const hillHigh = new THREE.Color(0x294f32);

    for (let iz = 0; iz <= segmentsZ; iz++) {
        const worldZ = THREE.MathUtils.lerp(minZ, maxZ, iz / segmentsZ);
        for (let ix = 0; ix <= segmentsX; ix++) {
            const worldX = THREE.MathUtils.lerp(minX, maxX, ix / segmentsX);
            const baseHeight = getMountainHeight(worldX, worldZ);
            const rise = getCombinedSideHillRise(worldX, worldZ);
            vertices.push(worldX, baseHeight + rise + 0.035, worldZ);

            const baseTone = baseLow.clone().lerp(baseMid, THREE.MathUtils.clamp(baseHeight / 18, 0, 1));
            const hillTone = hillLow.clone().lerp(hillHigh, THREE.MathUtils.clamp(rise / 20.0, 0, 1));
            const blend = THREE.MathUtils.smoothstep(rise, 0.0, 2.2);
            const tone = baseTone.lerp(hillTone, blend);
            tone.offsetHSL(0, 0, Math.sin(worldX * 0.025 + worldZ * 0.019) * 0.012);
            colors.push(tone.r, tone.g, tone.b);
        }
    }

    const stride = segmentsX + 1;
    for (let iz = 0; iz < segmentsZ; iz++) {
        for (let ix = 0; ix < segmentsX; ix++) {
            const centerX = THREE.MathUtils.lerp(minX, maxX, (ix + 0.5) / segmentsX);
            const centerZ = THREE.MathUtils.lerp(minZ, maxZ, (iz + 0.5) / segmentsZ);
            if (getCombinedSideHillRise(centerX, centerZ) <= 0.01) continue;
            const a = iz * stride + ix;
            const b = a + 1;
            const c = a + stride;
            const d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }

    let geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    // Aynı yükselti geometrisini koruyup yalnızca ışık geçişini yumuşat.
    geometry.computeVertexNormals();
    geometry = carveDamClearance(geometry, 0, 0, 1.1, 1.1);

    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.94,
        metalness: 0,
        flatShading: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
    });
    const hill = new THREE.Mesh(geometry, material);
    hill.receiveShadow = true;
    hill.castShadow = false;
    layeredMountainGroup.add(hill);
    return hill;
}

createSideHillTerrain();

// ======================================================
// 11. BİTKİ / ÇALI CLEAR-ZONE KONTROLÜ
// ======================================================

function isPositionBlocked(x, z, extraMargin = 0) {
    // 1. Ana baraj dikdörtgen platformu ve ön koridoru
    const minX = -(platformWidth / 2 + 2.5 + extraMargin);
    const maxX = platformWidth / 2 + 2.5 + extraMargin;
    const minZ = -(platformDepth / 2 + 3.0 + extraMargin);
    const maxZ = platformDepth / 2 + 5.5 + extraMargin;

    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
        return true;
    }

    // 2. Şelale su yatağı ve gölet alanı (Ağaçların, çalıların, çiçeklerin ve çimlerin suya girmesini kesinlikle önler)
    if (x >= -(50.0 + extraMargin) && x <= -(24.0 - extraMargin) && z >= -(52.0 + extraMargin) && z <= -(6.0 - extraMargin)) {
        return true;
    }

    const reservoirDistance = Math.min(
        Math.hypot(x / (143.0 + extraMargin), (z + 82.0) / (80.0 + extraMargin)),
        Math.hypot((x + 76.0) / (70.0 + extraMargin), (z + 158.0) / (66.0 + extraMargin)),
        Math.hypot((x - 12.0) / (64.0 + extraMargin), (z + 182.0) / (76.0 + extraMargin)),
        Math.hypot((x - 96.0) / (56.0 + extraMargin), (z + 144.0) / (60.0 + extraMargin))
    );
    if (reservoirDistance < 1.04) return true;

    // Barajın yerel eksenlerine çevrilmiş kalıcı clear-zone. Bu alan çim,
    // çalı, çiçek ve ağaç üretimini engeller; baraj her açıdan temiz okunur.
    const damDx = x - DAM_ENVIRONMENT.x;
    const damDz = z - DAM_ENVIRONMENT.z;
    const damCos = Math.cos(DAM_ENVIRONMENT.rotationY);
    const damSin = Math.sin(DAM_ENVIRONMENT.rotationY);
    const damLocalX = damCos * damDx - damSin * damDz;
    const damLocalZ = damSin * damDx + damCos * damDz;
    if (
        Math.abs(damLocalX) < DAM_ENVIRONMENT.halfSpan + extraMargin &&
        Math.abs(damLocalZ) < DAM_ENVIRONMENT.halfDepth + extraMargin
    ) {
        return true;
    }

    // 3. Decorative pond shorelines remain free of spawned vegetation.
    for (const pond of decorativePondConfigs) {
        const pondDistance = Math.hypot(
            (x - pond.x) / (pond.radiusX + 1.4 + extraMargin),
            (z - pond.z) / (pond.radiusZ + 1.4 + extraMargin)
        );
        if (pondDistance < 1) return true;
    }

    return false;
}

// ======================================================
// 12. GPU TSL SHADER İLE DALGALANAN ÇİMENLER (SAKİN, EŞİT ZEMİN RÜZGÂRI)
// ======================================================

const GRASS_COUNT = 1400;
const grassBladeGeom = new THREE.PlaneGeometry(0.12, 0.68, 1, 3);
grassBladeGeom.translate(0, 0.34, 0);

// TSL GPU Vertex Rüzgâr Dalgası (Tüm Zemin İçin Sakin, Yumuşak ve Eşit Esinti)
const grassWindWave = sin(
    positionWorld.x.mul(0.08)
        .add(positionWorld.z.mul(0.06))
        .add(time.mul(1.1))
);
const grassWindDirection = vec3(0.99, 0, 0.12);
const grassHeightWeight = max(positionLocal.y, 0).mul(0.08);
const grassDisplacement = grassWindDirection
    .mul(grassWindWave)
    .mul(grassHeightWeight);

const grassBladeMat = new THREE.MeshStandardNodeMaterial({
    color: 0x4f8041,
    roughness: 0.85,
    side: THREE.DoubleSide
});
grassBladeMat.positionNode = positionLocal.add(grassDisplacement);

const grassInstancedMesh = new THREE.InstancedMesh(grassBladeGeom, grassBladeMat, GRASS_COUNT);
const dummyMatrix = new THREE.Matrix4();
const dummyPos = new THREE.Vector3();
const dummyQuat = new THREE.Quaternion();
const dummyScale = new THREE.Vector3();

let grassPlaced = 0;
let attempts = 0;

function isGrassGroundSafe(x, z) {
    const height = getMountainHeight(x, z);
    if (height > 0.65) return false;

    const sampleDistance = 0.55;
    const slopeX = Math.abs(
        getMountainHeight(x + sampleDistance, z) - getMountainHeight(x - sampleDistance, z)
    ) / (sampleDistance * 2);
    const slopeZ = Math.abs(
        getMountainHeight(x, z + sampleDistance) - getMountainHeight(x, z - sampleDistance)
    ) / (sampleDistance * 2);

    return Math.hypot(slopeX, slopeZ) < 0.22;
}

while (grassPlaced < GRASS_COUNT && attempts < 9000) {
    attempts++;
    const r = walkwayRadius + 1.8 + Math.random() * 50.0;
    const a = Math.random() * Math.PI * 2;
    const gx = Math.cos(a) * r;
    const gz = Math.sin(a) * r;

    if (!isPositionBlocked(gx, gz, 0) && isGrassGroundSafe(gx, gz)) {
        dummyPos.set(gx, getMountainHeight(gx, gz) + 0.015, gz);
        const rotY = Math.random() * Math.PI * 2;
        const tilt = (Math.random() - 0.5) * 0.16;
        dummyQuat.setFromEuler(new THREE.Euler(tilt, rotY, 0));
        const s = 0.75 + Math.random() * 0.6;
        dummyScale.set(s, s, s);

        dummyMatrix.compose(dummyPos, dummyQuat, dummyScale);
        grassInstancedMesh.setMatrixAt(grassPlaced, dummyMatrix);
        grassPlaced++;
    }
}
grassInstancedMesh.count = grassPlaced;
grassInstancedMesh.instanceMatrix.needsUpdate = true;
scene.add(grassInstancedMesh);

// ======================================================
// 13. 3D DOĞAL ÇİÇEK KÜMELERİ
// ======================================================

const FLOWER_COUNT = 900;
const flowerGeom = new THREE.CircleGeometry(0.16, 5);
flowerGeom.rotateX(-Math.PI / 2);

const flowerMat = new THREE.MeshStandardMaterial({
    roughness: 0.7,
    side: THREE.DoubleSide
});

const flowerInstancedMesh = new THREE.InstancedMesh(flowerGeom, flowerMat, FLOWER_COUNT);

const flowerColors = [
    new THREE.Color(0xfdfefe),
    new THREE.Color(0xfef08a),
    new THREE.Color(0xe9d5ff),
    new THREE.Color(0xfbcfe8)
];

let flowersPlaced = 0;
attempts = 0;
const flowerClusters = [];

for (let c = 0; c < 35; c++) {
    const r = walkwayRadius + 3.8 + Math.random() * 45.0;
    const a = Math.random() * Math.PI * 2;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    if (!isPositionBlocked(cx, cz, 0.5)) {
        const clusterColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];
        flowerClusters.push({
            x: cx,
            z: cz,
            radius: 2.2 + Math.random() * 2.4,
            color: clusterColor,
            count: 16 + Math.floor(Math.random() * 14)
        });
    }
}

flowerClusters.forEach(cluster => {
    for (let i = 0; i < cluster.count && flowersPlaced < FLOWER_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        const rad = Math.random() * cluster.radius;
        const fx = cluster.x + Math.cos(angle) * rad;
        const fz = cluster.z + Math.sin(angle) * rad;

        if (!isPositionBlocked(fx, fz, 0.5)) {
            dummyPos.set(fx, getMountainHeight(fx, fz) + 0.025 + Math.random() * 0.02, fz);
            const rotY = Math.random() * Math.PI * 2;
            dummyQuat.setFromEuler(new THREE.Euler(0, rotY, 0));
            const sc = 0.75 + Math.random() * 0.55;
            dummyScale.set(sc, sc, sc);

            dummyMatrix.compose(dummyPos, dummyQuat, dummyScale);
            flowerInstancedMesh.setMatrixAt(flowersPlaced, dummyMatrix);
            flowerInstancedMesh.setColorAt(flowersPlaced, cluster.color);
            flowersPlaced++;
        }
    }
});

flowerInstancedMesh.instanceMatrix.needsUpdate = true;
if (flowerInstancedMesh.instanceColor) flowerInstancedMesh.instanceColor.needsUpdate = true;
scene.add(flowerInstancedMesh);

// ======================================================
// 14. 3 SEVİYELİ LOD ÇALILAR & ASENKRON RÜZGÂR SWAY SİSTEMİ
// ======================================================

const floraGroup = new THREE.Group();
scene.add(floraGroup);

const animatedShrubs = [];

const shrubMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x335928, roughness: 0.88, metalness: 0.02 }),
    new THREE.MeshStandardMaterial({ color: 0x3e6931, roughness: 0.86, metalness: 0.02 }),
    new THREE.MeshStandardMaterial({ color: 0x2b4c21, roughness: 0.90, metalness: 0.02 }),
    new THREE.MeshStandardMaterial({ color: 0x4a7337, roughness: 0.85, metalness: 0.02 })
];

const lobeGeomHigh = new THREE.IcosahedronGeometry(0.55, 1);
const lobeGeomMed = new THREE.DodecahedronGeometry(0.65, 0);

function createRealisticShrub(scaleCategory = "medium", matIndex = 0) {
    const shrubLOD = new THREE.LOD();
    const primaryMat = shrubMaterials[matIndex % shrubMaterials.length];
    const secondaryMat = shrubMaterials[(matIndex + 1) % shrubMaterials.length];

    let baseMultiplier = 1.0;
    if (scaleCategory === "small") baseMultiplier = 0.68 + Math.random() * 0.18;
    else if (scaleCategory === "medium") baseMultiplier = 0.95 + Math.random() * 0.25;
    else if (scaleCategory === "large") baseMultiplier = 1.25 + Math.random() * 0.30;

    // LOD 0: YAKIN (0 - 26m) - 6 Detaylı Lobe + Gölgeler
    const highGroup = new THREE.Group();
    const highLobes = [
        { x: 0, y: 0.45, z: 0, sx: 1.1, sy: 0.9, sz: 1.0, mat: primaryMat },
        { x: 0.32, y: 0.38, z: 0.22, sx: 0.85, sy: 0.75, sz: 0.85, mat: primaryMat },
        { x: -0.30, y: 0.40, z: -0.20, sx: 0.80, sy: 0.70, sz: 0.80, mat: secondaryMat },
        { x: 0.24, y: 0.32, z: -0.28, sx: 0.75, sy: 0.65, sz: 0.75, mat: secondaryMat },
        { x: -0.26, y: 0.35, z: 0.25, sx: 0.78, sy: 0.68, sz: 0.78, mat: primaryMat },
        { x: 0.05, y: 0.68, z: 0.02, sx: 0.65, sy: 0.55, sz: 0.65, mat: primaryMat }
    ];
    highLobes.forEach(l => {
        const mesh = new THREE.Mesh(lobeGeomHigh, l.mat);
        mesh.position.set(l.x, l.y, l.z);
        mesh.scale.set(l.sx, l.sy, l.sz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        highGroup.add(mesh);
    });

    // LOD 1: ORTA (26 - 48m) - 2 Lobe (Gölgesiz)
    const medGroup = new THREE.Group();
    const med1 = new THREE.Mesh(lobeGeomMed, primaryMat);
    med1.position.set(0, 0.42, 0);
    med1.scale.set(1.15, 0.85, 1.1);
    medGroup.add(med1);

    const med2 = new THREE.Mesh(lobeGeomMed, secondaryMat);
    med2.position.set(0.2, 0.50, -0.15);
    med2.scale.set(0.85, 0.75, 0.85);
    medGroup.add(med2);

    // LOD 2: UZAK (48m+) - Tek Low-Poly Geometri
    const lowGroup = new THREE.Group();
    const lowMesh = new THREE.Mesh(lobeGeomMed, primaryMat);
    lowMesh.position.set(0, 0.42, 0);
    lowMesh.scale.set(1.2, 0.9, 1.15);
    lowGroup.add(lowMesh);

    shrubLOD.addLevel(highGroup, 0);
    shrubLOD.addLevel(medGroup, 26);
    shrubLOD.addLevel(lowGroup, 48);

    shrubLOD.scale.setScalar(baseMultiplier);
    shrubLOD.rotation.y = Math.random() * Math.PI * 2;

    shrubLOD.userData = {
        windSpeed: 1.4 + Math.random() * 0.8,
        windPhase: Math.random() * Math.PI * 2,
        windAmpX: 0.006 + Math.random() * 0.008,
        windAmpZ: 0.008 + Math.random() * 0.010
    };

    animatedShrubs.push(shrubLOD);
    return shrubLOD;
}

const shrubClusters = [
    { x: -38, z: -48, count: 5, radius: 6 },
    { x: 44, z: -52, count: 6, radius: 7 },
    { x: -55, z: 30, count: 5, radius: 6 },
    { x: 50, z: 35, count: 6, radius: 7 },
    { x: 0, z: -62, count: 7, radius: 8 },
    { x: -58, z: -20, count: 5, radius: 6 },
    { x: 62, z: -15, count: 5, radius: 6 },
    { x: -30, z: 58, count: 5, radius: 6 }
];

const scaleClasses = ["small", "medium", "large", "medium", "small"];
let shrubsPlaced = 0;
const SHRUB_TARGET = 64;

shrubClusters.forEach((cl, cIdx) => {
    for (let i = 0; i < cl.count && shrubsPlaced < SHRUB_TARGET; i++) {
        const angle = Math.random() * Math.PI * 2;
        const rad = Math.random() * cl.radius;
        const sx = cl.x + Math.cos(angle) * rad;
        const sz = cl.z + Math.sin(angle) * rad;

        if (!isPositionBlocked(sx, sz, 1.2)) {
            const sc = scaleClasses[(cIdx + i) % scaleClasses.length];
            const shrub = createRealisticShrub(sc, cIdx + i);
            shrub.position.set(sx, getMountainHeight(sx, sz), sz);
            floraGroup.add(shrub);
            shrubsPlaced++;
        }
    }
});

attempts = 0;
while (shrubsPlaced < SHRUB_TARGET && attempts < 4000) {
    attempts++;
    const r = walkwayRadius + 6.0 + Math.random() * 45.0;
    const a = Math.random() * Math.PI * 2;
    const sx = Math.cos(a) * r;
    const sz = Math.sin(a) * r;

    if (!isPositionBlocked(sx, sz, 1.2)) {
        const sc = scaleClasses[shrubsPlaced % scaleClasses.length];
        const shrub = createRealisticShrub(sc, shrubsPlaced);
        shrub.position.set(sx, getMountainHeight(sx, sz), sz);
        floraGroup.add(shrub);
        shrubsPlaced++;
    }
}

// ======================================================
// 15. AĞAÇ KÜMELERİ
// ======================================================

const animatedTrees = [];

const trunkGeom = new THREE.CylinderGeometry(0.24, 0.38, 3.8, 8);
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x423225, roughness: 0.9 });

const foliageMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x2e5227, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0x3d6632, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0x274523, roughness: 0.88 })
];

const trunkGeomLow = new THREE.CylinderGeometry(0.24, 0.38, 3.8, 5);

function createTree(tx, tz, scale = 1.0, matIdx = 0, explicitY = null) {
    const treeLOD = new THREE.LOD();
    const fMat = foliageMaterials[matIdx % foliageMaterials.length];

    const highGroup = new THREE.Group();
    const trunkHigh = new THREE.Mesh(trunkGeom, trunkMat);
    trunkHigh.position.y = 1.9;
    trunkHigh.castShadow = true;
    highGroup.add(trunkHigh);

    const canopyHigh1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.9, 1), fMat);
    canopyHigh1.position.y = 4.3;
    canopyHigh1.castShadow = true;
    highGroup.add(canopyHigh1);

    const canopyHigh2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 1), fMat);
    canopyHigh2.position.set(0.3, 5.5, 0.2);
    canopyHigh2.castShadow = true;
    highGroup.add(canopyHigh2);

    const medGroup = new THREE.Group();
    const trunkMed = new THREE.Mesh(trunkGeomLow, trunkMat);
    trunkMed.position.y = 1.9;
    medGroup.add(trunkMed);

    const canopyMed1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.85, 0), fMat);
    canopyMed1.position.y = 4.3;
    medGroup.add(canopyMed1);

    const canopyMed2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.35, 0), fMat);
    canopyMed2.position.set(0.3, 5.4, 0.2);
    medGroup.add(canopyMed2);

    const lowGroup = new THREE.Group();
    const trunkLow = new THREE.Mesh(trunkGeomLow, trunkMat);
    trunkLow.position.y = 1.9;
    lowGroup.add(trunkLow);

    const canopyLow = new THREE.Mesh(new THREE.DodecahedronGeometry(2.1, 0), fMat);
    canopyLow.position.y = 4.7;
    lowGroup.add(canopyLow);

    treeLOD.addLevel(highGroup, 0);
    treeLOD.addLevel(medGroup, 38);
    treeLOD.addLevel(lowGroup, 68);

    treeLOD.scale.setScalar(scale);
    treeLOD.position.set(tx, explicitY ?? getMountainHeight(tx, tz), tz);
    treeLOD.rotation.y = Math.random() * Math.PI * 2;

    treeLOD.userData = {
        canopy1: canopyHigh1,
        canopy2: canopyHigh2,
        canopyMed1: canopyMed1,
        canopyMed2: canopyMed2,
        windPhase: Math.random() * Math.PI * 2,
        windSpeed: 0.7 + Math.random() * 0.35,
        windAmplitude: 0.004 + Math.random() * 0.008
    };

    animatedTrees.push(treeLOD);
    return treeLOD;
}

const treeClusters = [
    { x: -48, z: -58, count: 7, radius: 12 },
    { x: 54, z: -62, count: 7, radius: 12 },
    { x: -68, z: 38, count: 6, radius: 11 },
    { x: 64, z: 42, count: 7, radius: 12 },
    { x: 0, z: -78, count: 8, radius: 14 },
    { x: -72, z: -28, count: 6, radius: 11 },
    { x: 78, z: -22, count: 6, radius: 11 },
    { x: -38, z: 68, count: 6, radius: 11 },
    { x: 35, z: 72, count: 6, radius: 12 },
    { x: -85, z: 10, count: 5, radius: 10 },
    { x: 88, z: 15, count: 5, radius: 10 },
    { x: -20, z: -90, count: 6, radius: 12 },
    { x: -164, z: -72, count: 7, radius: 15 },
    { x: 164, z: -80, count: 6, radius: 14 },
    { x: -151, z: -151, count: 6, radius: 14 },
    { x: 154, z: -165, count: 7, radius: 15 },
    { x: -112, z: 84, count: 5, radius: 14 },
    { x: 111, z: 90, count: 6, radius: 15 }
];

// Platformun ön cephesinden (+Z yönü) alçak açıyla bakıldığında bilgi panosu
// ve tank etiketleri görünür kalmalı. Bu koridorda uzun gövdeli ağaç yerine
// aynı yeşil yoğunluğu koruyan alçak çalılar kullanılır.
function isPlatformForegroundSightline(x, z) {
    if (z < walkwayRadius + 1.5 || z > 96) return false;

    // Platforma yakın bölüm dar, kameraya yaklaştıkça görüş konisi geniştir.
    const normalizedDepth = THREE.MathUtils.clamp((z - walkwayRadius) / 72, 0, 1);
    const corridorHalfWidth = THREE.MathUtils.lerp(31, 46, normalizedDepth);
    return Math.abs(x) < corridorHalfWidth;
}

function addForegroundAwareTree(x, z, scale, materialIndex) {
    if (isPlatformForegroundSightline(x, z)) {
        const shrub = createRealisticShrub(scale > 1.0 ? "large" : "medium", materialIndex);
        shrub.position.set(x, getMountainHeight(x, z), z);
        shrub.scale.multiplyScalar(0.92);
        floraGroup.add(shrub);
        return;
    }

    floraGroup.add(createTree(x, z, scale, materialIndex));
}

let treesPlaced = 0;
const TREE_COUNT = 108;

treeClusters.forEach((cluster, cIdx) => {
    for (let i = 0; i < cluster.count && treesPlaced < TREE_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        const rad = Math.random() * cluster.radius;
        const tx = cluster.x + Math.cos(angle) * rad;
        const tz = cluster.z + Math.sin(angle) * rad;

        if (!isPositionBlocked(tx, tz, 2.0)) {
            const scale = 0.75 + Math.random() * 0.55;
            addForegroundAwareTree(tx, tz, scale, cIdx + i);
            treesPlaced++;
        }
    }
});

let treeAttempts = 0;
while (treesPlaced < TREE_COUNT && treeAttempts < 5000) {
    treeAttempts++;
    const r = walkwayRadius + 10.0 + Math.random() * 58.0;
    const a = Math.random() * Math.PI * 2;
    const tx = Math.cos(a) * r;
    const tz = Math.sin(a) * r;

    if (!isPositionBlocked(tx, tz, 2.0)) {
        const scale = 0.75 + Math.random() * 0.55;
        addForegroundAwareTree(tx, tz, scale, treesPlaced);
        treesPlaced++;
    }
}

// Yan tepelerde bitki örtüsü iç yamaçlara doğru yoğunlaşır. Mevcut LOD,
// koyu yeşil foliage materyalleri ve rüzgâr animasyonu aynen kullanılır.
sideHillConfigs.forEach((hill, hillIndex) => {
    const inwardDirection = hill.x < 0 ? 1 : -1;

    for (let i = 0; i < hill.treeCount; i++) {
        const band = 0.28 + Math.random() * 0.48;
        const tx = hill.x + inwardDirection * hill.radiusX * band + (Math.random() - 0.5) * 12;
        const tz = hill.z + (Math.random() - 0.5) * hill.radiusZ * 0.78;
        const terrainY = getSideHillSurfaceHeight(tx, tz);
        const rise = getSideHillRise(hill, tx, tz);
        if (rise < 1.0 || isPositionBlocked(tx, tz, 4.0)) continue;
        const heightScale = THREE.MathUtils.clamp(hill.height / 18, 0.72, 1.12);
        const scale = (0.58 + Math.random() * 0.46) * heightScale;
        floraGroup.add(createTree(tx, tz, scale, 30 + hillIndex * 17 + i, terrainY + 0.02));
    }

    for (let i = 0; i < hill.shrubCount; i++) {
        const band = 0.24 + Math.random() * 0.54;
        const sx = hill.x + inwardDirection * hill.radiusX * band + (Math.random() - 0.5) * 15;
        const sz = hill.z + (Math.random() - 0.5) * hill.radiusZ * 0.82;
        const terrainY = getSideHillSurfaceHeight(sx, sz);
        if (getSideHillRise(hill, sx, sz) < 0.7 || isPositionBlocked(sx, sz, 2.0)) continue;
        const shrub = createRealisticShrub(i % 4 === 0 ? "large" : "medium", 20 + hillIndex * 11 + i);
        shrub.position.set(sx, terrainY + 0.02, sz);
        floraGroup.add(shrub);
    }
});

// ======================================================
// 15.1. UZAK EGE YAMAÇLARI: ÇAM KORULARI, MAKİ VE KAYA AÇILIMLARI
// ======================================================

// Uzak sırtlarda tam LOD ağaçlar yerine InstancedMesh kullanılır. Böylece yüzlerce
// küçük silüet yalnızca birkaç çizim çağrısıyla yamaçlara doğal doku kazandırır.
function distantLandscapeRandom(seed) {
    let value = seed >>> 0;
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 4294967296;
    };
}

function createDistantAegeanHillsideDetails() {
    const random = distantLandscapeRandom(28493);
    const rearHills = sideHillConfigs.slice(0, 5);
    const pineTargets = [72, 68, 58, 82, 64];
    const scrubTargets = [82, 76, 68, 92, 72];
    const rockTargets = [5, 5, 4, 6, 5];
    const totalPines = pineTargets.reduce((sum, value) => sum + value, 0);
    const totalScrub = scrubTargets.reduce((sum, value) => sum + value, 0);
    const totalRocks = rockTargets.reduce((sum, value) => sum + value, 0);

    const pineTrunkGeometry = new THREE.CylinderGeometry(0.17, 0.25, 2.45, 6);
    pineTrunkGeometry.translate(0, 1.225, 0);
    const pineCanopyGeometry = new THREE.ConeGeometry(1.28, 2.65, 7);
    pineCanopyGeometry.translate(0, 2.55, 0);
    const pineCanopyUpperGeometry = new THREE.ConeGeometry(0.92, 2.45, 7);
    pineCanopyUpperGeometry.translate(0, 3.88, 0);
    const scrubGeometry = new THREE.DodecahedronGeometry(0.72, 0);
    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);

    const pineTrunks = new THREE.InstancedMesh(
        pineTrunkGeometry,
        new THREE.MeshStandardMaterial({ color: 0x4b3928, roughness: 0.98 }),
        totalPines
    );
    const pineCanopies = new THREE.InstancedMesh(
        pineCanopyGeometry,
        new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.94 }),
        totalPines
    );
    const pineCanopiesUpper = new THREE.InstancedMesh(
        pineCanopyUpperGeometry,
        new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.94 }),
        totalPines
    );
    const distantScrub = new THREE.InstancedMesh(
        scrubGeometry,
        new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.97 }),
        totalScrub
    );
    const distantRocks = new THREE.InstancedMesh(
        rockGeometry,
        new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1.0, flatShading: true }),
        totalRocks
    );

    const pineColors = [
        new THREE.Color(0x244b30),
        new THREE.Color(0x2d5935),
        new THREE.Color(0x365f38),
        new THREE.Color(0x1f432d)
    ];
    const scrubColors = [
        new THREE.Color(0x385f32),
        new THREE.Color(0x456d35),
        new THREE.Color(0x52783c),
        new THREE.Color(0x2e5631)
    ];
    const rockColors = [
        new THREE.Color(0x8e8b72),
        new THREE.Color(0x9d916e),
        new THREE.Color(0x777d6b)
    ];
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Euler();
    let pineIndex = 0;
    let scrubIndex = 0;
    let rockIndex = 0;

    function findHillPoint(hill, minimumRise, bandMin, bandMax) {
        for (let attempt = 0; attempt < 80; attempt++) {
            const angle = random() * Math.PI * 2;
            const band = bandMin + Math.sqrt(random()) * (bandMax - bandMin);
            const x = hill.x + Math.cos(angle) * hill.radiusX * band;
            const z = hill.z + Math.sin(angle) * hill.radiusZ * band;
            const rise = getSideHillRise(hill, x, z);
            const damDistance = Math.hypot(x - DAM_ENVIRONMENT.x, z - DAM_ENVIRONMENT.z);
            if (rise < minimumRise || damDistance < 42) continue;

            // Geniş boşluklar bırakan sinüzoidal kabul maskesi koruları doğal
            // kümelere ayırır; bitki örtüsü eşit aralıklı bir ızgaraya dönüşmez.
            const patchMask = (
                Math.sin(x * 0.083 + hill.seed * 2.7)
                + Math.cos(z * 0.097 - hill.seed * 1.9)
            ) * 0.25 + 0.50;
            if (random() > 0.38 + patchMask * 0.58) continue;
            return { x, z, y: getSideHillSurfaceHeight(x, z), rise };
        }
        return null;
    }

    rearHills.forEach((hill, hillIndex) => {
        for (let i = 0; i < pineTargets[hillIndex]; i++) {
            const point = findHillPoint(hill, 2.1, 0.18, 0.76);
            if (!point) continue;
            const size = 0.84 + random() * 0.70;
            position.set(point.x, point.y + 0.03, point.z);
            rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.035);
            quaternion.setFromEuler(rotation);
            scale.set(size * (0.88 + random() * 0.15), size, size * (0.88 + random() * 0.15));
            matrix.compose(position, quaternion, scale);
            pineTrunks.setMatrixAt(pineIndex, matrix);
            pineCanopies.setMatrixAt(pineIndex, matrix);
            pineCanopiesUpper.setMatrixAt(pineIndex, matrix);
            pineCanopies.setColorAt(pineIndex, pineColors[(hillIndex + i) % pineColors.length]);
            pineCanopiesUpper.setColorAt(pineIndex, pineColors[(hillIndex + i + 1) % pineColors.length]);
            pineIndex++;
        }

        for (let i = 0; i < scrubTargets[hillIndex]; i++) {
            const point = findHillPoint(hill, 1.0, 0.22, 0.88);
            if (!point) continue;
            const width = 0.72 + random() * 1.10;
            position.set(point.x, point.y + 0.34, point.z);
            rotation.set(0, random() * Math.PI * 2, 0);
            quaternion.setFromEuler(rotation);
            scale.set(width, 0.42 + random() * 0.34, width * (0.78 + random() * 0.38));
            matrix.compose(position, quaternion, scale);
            distantScrub.setMatrixAt(scrubIndex, matrix);
            distantScrub.setColorAt(scrubIndex, scrubColors[(hillIndex * 3 + i) % scrubColors.length]);
            scrubIndex++;
        }

        for (let i = 0; i < rockTargets[hillIndex]; i++) {
            const point = findHillPoint(hill, 2.4, 0.32, 0.78);
            if (!point) continue;
            const width = 1.9 + random() * 2.8;
            position.set(point.x, point.y + 0.28, point.z);
            rotation.set((random() - 0.5) * 0.22, random() * Math.PI * 2, (random() - 0.5) * 0.18);
            quaternion.setFromEuler(rotation);
            scale.set(width, 0.34 + random() * 0.34, width * (0.48 + random() * 0.34));
            matrix.compose(position, quaternion, scale);
            distantRocks.setMatrixAt(rockIndex, matrix);
            distantRocks.setColorAt(rockIndex, rockColors[(hillIndex + i) % rockColors.length]);
            rockIndex++;
        }
    });

    for (const mesh of [pineTrunks, pineCanopies, pineCanopiesUpper, distantScrub, distantRocks]) {
        mesh.count = mesh === pineTrunks || mesh === pineCanopies || mesh === pineCanopiesUpper
            ? pineIndex
            : mesh === distantScrub ? scrubIndex : rockIndex;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.frustumCulled = true;
        floraGroup.add(mesh);
    }
}

createDistantAegeanHillsideDetails();

// ======================================================
// 15.2. GENİŞ DOĞAL DAĞ GÖLETİ, ORGANİK KIYILAR VE SAZLIKLAR
// ======================================================

const pondGroup = new THREE.Group();
scene.add(pondGroup);

const pondCenterX = -38.0;
const pondCenterZ = -15.0;
pondGroup.position.set(pondCenterX, 0, pondCenterZ);

const pondShape = new THREE.Shape();
const numPondPoints = 36;
const pondBaseRadiusX = 15.2;
const pondBaseRadiusZ = 11.4;
for (let i = 0; i < numPondPoints; i++) {
    const theta = (i / numPondPoints) * Math.PI * 2;
    const noise = Math.sin(theta * 3.0) * 1.35 + Math.cos(theta * 5.0) * 0.75 + Math.sin(theta * 2.0) * 0.6;
    const px = Math.cos(theta) * (pondBaseRadiusX + noise);
    const pz = Math.sin(theta) * (pondBaseRadiusZ + noise);
    if (i === 0) pondShape.moveTo(px, pz);
    else pondShape.lineTo(px, pz);
}
pondShape.closePath();

const pondWaterGeom = new THREE.ShapeGeometry(pondShape);
const pondWaterMat = new THREE.MeshStandardMaterial({
    color: 0x28666a,
    roughness: 0.28,
    metalness: 0.03,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide
});
const pondWaterMesh = new THREE.Mesh(pondWaterGeom, pondWaterMat);
pondWaterMesh.rotation.x = -Math.PI / 2;
pondWaterMesh.position.y = 0.04;
pondWaterMesh.receiveShadow = true;
pondGroup.add(pondWaterMesh);

const pondBedShape = new THREE.Shape();
for (let i = 0; i < numPondPoints; i++) {
    const theta = (i / numPondPoints) * Math.PI * 2;
    const noise = Math.sin(theta * 3.0) * 1.35 + Math.cos(theta * 5.0) * 0.75 + Math.sin(theta * 2.0) * 0.6;
    const px = Math.cos(theta) * (pondBaseRadiusX + noise + 1.1);
    const pz = Math.sin(theta) * (pondBaseRadiusZ + noise + 1.1);
    if (i === 0) pondBedShape.moveTo(px, pz);
    else pondBedShape.lineTo(px, pz);
}
pondBedShape.closePath();
const pondBedGeom = new THREE.ShapeGeometry(pondBedShape);
const pondBedMat = new THREE.MeshStandardMaterial({
    color: 0x485038,
    roughness: 0.95,
    metalness: 0.01
});
const pondBedMesh = new THREE.Mesh(pondBedGeom, pondBedMat);
pondBedMesh.rotation.x = -Math.PI / 2;
pondBedMesh.position.y = 0.015;
pondBedMesh.receiveShadow = true;
pondGroup.add(pondBedMesh);

const reedBladeGeom = new THREE.PlaneGeometry(0.09, 1.5, 1, 2);
reedBladeGeom.translate(0, 0.75, 0);
const reedMat = new THREE.MeshStandardMaterial({
    color: 0x5a7d3c,
    roughness: 0.85,
    side: THREE.DoubleSide
});
const REED_COUNT = 80;
const reedInstancedMesh = new THREE.InstancedMesh(reedBladeGeom, reedMat, REED_COUNT);
const reedDummy = new THREE.Object3D();

let reedIdx = 0;
const reedClusters = [0.4, 1.2, 2.2, 3.8, 5.2];
reedClusters.forEach(baseAngle => {
    const clusterCount = 12 + Math.floor(Math.random() * 5);
    for (let c = 0; c < clusterCount && reedIdx < REED_COUNT; c++) {
        const theta = baseAngle + (Math.random() - 0.5) * 0.35;
        const noise = Math.sin(theta * 3.0) * 1.35 + Math.cos(theta * 5.0) * 0.75;
        const dist = (pondBaseRadiusX + noise) * (0.92 + Math.random() * 0.12);
        const rx = pondCenterX + Math.cos(theta) * dist;
        const rz = pondCenterZ + Math.sin(theta) * (dist * (pondBaseRadiusZ / pondBaseRadiusX));

        reedDummy.position.set(rx, 0, rz);
        reedDummy.rotation.set((Math.random() - 0.5) * 0.15, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.15);
        const s = 0.8 + Math.random() * 0.5;
        reedDummy.scale.set(s, s, s);
        reedDummy.updateMatrix();
        reedInstancedMesh.setMatrixAt(reedIdx, reedDummy.matrix);
        reedIdx++;
    }
});
reedInstancedMesh.instanceMatrix.needsUpdate = true;
scene.add(reedInstancedMesh);

// Ana göletin yakınındaki tek küçük eş gölet.
const decorativePondsGroup = new THREE.Group();
scene.add(decorativePondsGroup);

function createOrganicPond(config) {
    const group = new THREE.Group();
    group.position.set(config.x, 0, config.z);
    const points = 40;

    function buildShape(expansion = 0) {
        const shape = new THREE.Shape();
        for (let i = 0; i < points; i++) {
            const theta = (i / points) * Math.PI * 2;
            const shorelineNoise =
                Math.sin(theta * 3 + config.seed) * 0.48 +
                Math.cos(theta * 5 - config.seed * 0.7) * 0.30 +
                Math.sin(theta * 7 + config.seed * 1.3) * 0.16;
            const px = Math.cos(theta) * (config.radiusX + shorelineNoise + expansion);
            const pz = Math.sin(theta) * (config.radiusZ + shorelineNoise * 0.72 + expansion * 0.72);
            if (i === 0) shape.moveTo(px, pz);
            else shape.lineTo(px, pz);
        }
        shape.closePath();
        return shape;
    }

    const shoreGeom = new THREE.ShapeGeometry(buildShape(0.95));
    const shoreMat = new THREE.MeshStandardMaterial({
        color: 0x4c5140,
        roughness: 0.97,
        metalness: 0.0,
        side: THREE.DoubleSide
    });
    const shore = new THREE.Mesh(shoreGeom, shoreMat);
    shore.rotation.x = -Math.PI / 2;
    shore.position.y = 0.018;
    shore.receiveShadow = true;
    group.add(shore);

    const waterGeom = new THREE.ShapeGeometry(buildShape(0));
    const waterMat = new THREE.MeshStandardMaterial({
        color: config.color,
        roughness: 0.30,
        metalness: 0.025,
        transparent: true,
        opacity: 0.84,
        side: THREE.DoubleSide,
        depthWrite: true
    });
    const water = new THREE.Mesh(waterGeom, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.045;
    water.receiveShadow = true;
    group.add(water);

    return group;
}

decorativePondConfigs.forEach((config) => {
    decorativePondsGroup.add(createOrganicPond(config));
});

// ======================================================
// 15.2. KESİNTİSİZ 3 KATMANLI DOĞAL DAĞ ŞELALESİ VE AKARSU AKIŞI
// ======================================================

// Referans kompozisyon: geniş rezervuar, organik kıyı, adacıklar ve uzak baraj.
pondGroup.visible = false;
decorativePondsGroup.visible = false;
reedInstancedMesh.visible = false;

const reservoirGroup = new THREE.Group();
scene.add(reservoirGroup);

function buildReservoirShape(expansion = 0) {
    const shape = new THREE.Shape();
    const outline = [
        // Ön kıyı platformdan güvenli mesafede kalırken yan koylar ve iki arka
        // kol rezervuar alanını yaklaşık iki katına çıkarır.
        [0, -36], [46, -34], [91, -27], [82, -10], [65, 2],
        [105, 8], [138, 24], [146, 53], [128, 74], [117, 113],
        [99, 150], [76, 119], [60, 137], [41, 184], [12, 173],
        [-9, 128], [-39, 145], [-79, 189], [-106, 165], [-116, 121],
        [-136, 93], [-149, 56], [-137, 24], [-103, 10], [-79, -2],
        [-92, -17], [-55, -31]
    ];
    const shorelineScale = 1 + expansion / 105;
    const curve = new THREE.CatmullRomCurve3(
        outline.map(([x, z]) => new THREE.Vector3(x * shorelineScale, z * shorelineScale, 0)),
        true,
        "centripetal",
        0.38
    );
    const points = curve.getPoints(159);
    points.forEach((point, index) => {
        const edgeOffset = expansion === 0 ? Math.sin(index * 0.47) * 0.32 : 0;
        const x = point.x + edgeOffset;
        const z = point.y + edgeOffset * 0.35;
        if (index === 0) shape.moveTo(x, z);
        else shape.lineTo(x, z);
    });
    shape.closePath();
    return shape;
}

function createReservoirRingGeometry(outerExpansion, innerExpansion) {
    const outerShape = buildReservoirShape(outerExpansion);
    const outerPoints = outerShape.getPoints();
    let innerPoints = buildReservoirShape(innerExpansion).getPoints();

    // ShapeGeometry deliğinin dış konturun tersi yönde çizilmesi gerekir.
    if (THREE.ShapeUtils.isClockWise(outerPoints) === THREE.ShapeUtils.isClockWise(innerPoints)) {
        innerPoints = [...innerPoints].reverse();
    }
    const hole = new THREE.Path();
    innerPoints.forEach((point, index) => {
        if (index === 0) hole.moveTo(point.x, point.y);
        else hole.lineTo(point.x, point.y);
    });
    hole.closePath();
    outerShape.holes.push(hole);
    return new THREE.ShapeGeometry(outerShape);
}

// Tek renkli keskin sınır yerine üç kademeli kıyı: kuru yamaç, taşlı geçiş ve
// suyun sürekli ıslattığı koyu şerit. Katmanlar suya doğru incelir.
const reservoirOuterShore = new THREE.Mesh(
    new THREE.ShapeGeometry(buildReservoirShape(5.4)),
    new THREE.MeshStandardMaterial({ color: 0x667253, roughness: 1.0, flatShading: false, side: THREE.DoubleSide })
);
reservoirOuterShore.rotation.x = -Math.PI / 2;
reservoirOuterShore.position.set(0, 0.052, -56.0);
reservoirOuterShore.receiveShadow = true;

const reservoirStoneShore = new THREE.Mesh(
    new THREE.ShapeGeometry(buildReservoirShape(3.45)),
    new THREE.MeshStandardMaterial({ color: 0x8b8668, roughness: 0.99, flatShading: false, side: THREE.DoubleSide })
);
reservoirStoneShore.rotation.x = -Math.PI / 2;
reservoirStoneShore.position.set(0, 0.073, -56.0);
reservoirStoneShore.receiveShadow = true;

const reservoirShore = new THREE.Mesh(
    new THREE.ShapeGeometry(buildReservoirShape(1.65)),
    new THREE.MeshStandardMaterial({ color: 0x596f67, roughness: 0.88, flatShading: false, side: THREE.DoubleSide })
);
reservoirShore.rotation.x = -Math.PI / 2;
reservoirShore.position.set(0, 0.096, -56.0);
reservoirShore.receiveShadow = true;
reservoirGroup.add(reservoirOuterShore, reservoirStoneShore, reservoirShore);

function createReservoirNormalTexture() {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = Math.cos(x * 0.22 + y * 0.035) * 0.18 + Math.cos((x + y) * 0.11) * 0.08;
            const dy = -Math.sin(y * 0.19 - x * 0.028) * 0.16 + Math.cos((x - y) * 0.09) * 0.07;
            const normal = new THREE.Vector3(-dx, -dy, 1).normalize();
            const index = (y * size + x) * 4;
            image.data[index] = Math.round((normal.x * 0.5 + 0.5) * 255);
            image.data[index + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
            image.data[index + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
            image.data[index + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(7.5, 4.5);
    return texture;
}

function createReservoirColorTexture() {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const depthGradient = ctx.createRadialGradient(size * 0.52, size * 0.50, size * 0.08, size * 0.52, size * 0.50, size * 0.72);
    depthGradient.addColorStop(0, "#185a6b");
    depthGradient.addColorStop(0.50, "#226f7e");
    depthGradient.addColorStop(0.82, "#398a91");
    depthGradient.addColorStop(1, "#69a8a1");
    ctx.fillStyle = depthGradient;
    ctx.fillRect(0, 0, size, size);

    const distanceTint = ctx.createLinearGradient(0, 0, 0, size);
    distanceTint.addColorStop(0, "rgba(20, 75, 94, 0.22)");
    distanceTint.addColorStop(0.58, "rgba(25, 85, 98, 0.05)");
    distanceTint.addColorStop(1, "rgba(92, 164, 155, 0.16)");
    ctx.fillStyle = distanceTint;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.translate(size * 0.67, size * 0.26);
    ctx.rotate(-0.30);
    ctx.scale(2.7, 0.48);
    const sunGlint = ctx.createRadialGradient(0, 0, 2, 0, 0, 62);
    sunGlint.addColorStop(0, "rgba(255, 245, 203, 0.42)");
    sunGlint.addColorStop(0.30, "rgba(231, 243, 219, 0.20)");
    sunGlint.addColorStop(1, "rgba(220, 241, 224, 0)");
    ctx.fillStyle = sunGlint;
    ctx.beginPath();
    ctx.arc(0, 0, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function createReservoirGlintTexture() {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    let seed = 9137;
    const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };

    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < 115; i++) {
        const x = random() * size;
        const y = random() * size;
        const length = 8 + random() * 42;
        const alpha = 0.10 + random() * 0.34;
        const gradient = ctx.createLinearGradient(x - length, y, x + length, y);
        gradient.addColorStop(0, "rgba(255,255,255,0)");
        gradient.addColorStop(0.50, `rgba(234,250,255,${alpha})`);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 0.8 + random() * 2.2;
        ctx.beginPath();
        ctx.moveTo(x - length, y);
        ctx.quadraticCurveTo(x, y + (random() - 0.5) * 3.5, x + length, y);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.6, 3.4);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function createShoreWaveMaskTexture() {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    let seed = 27551;
    const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };

    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < 58; i++) {
        const x = random() * size;
        const y = random() * size;
        const radius = 13 + random() * 34;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(255,255,255,${0.50 + random() * 0.42})`);
        gradient.addColorStop(0.58, `rgba(255,255,255,${0.18 + random() * 0.22})`);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1.8 + random() * 1.4, 0.55 + random() * 0.45);
        ctx.translate(-x, -y);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.4, 2.0);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function createReservoirGeometry(expansion = 0) {
    const geometry = new THREE.ShapeGeometry(buildReservoirShape(expansion));
    geometry.computeBoundingBox();
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const bounds = geometry.boundingBox;
    const width = Math.max(bounds.max.x - bounds.min.x, 0.001);
    const height = Math.max(bounds.max.y - bounds.min.y, 0.001);
    for (let i = 0; i < position.count; i++) {
        uv.setXY(
            i,
            (position.getX(i) - bounds.min.x) / width,
            (position.getY(i) - bounds.min.y) / height
        );
    }
    uv.needsUpdate = true;
    return geometry;
}

const reservoirNormalTexture = createReservoirNormalTexture();
const reservoirColorTexture = createReservoirColorTexture();
const reservoirGlintTexture = createReservoirGlintTexture();
const reservoirShoreWaveMaskTexture = createShoreWaveMaskTexture();

const reservoirWaterMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: reservoirColorTexture,
    roughness: 0.14,
    metalness: 0.02,
    clearcoat: 0.52,
    clearcoatRoughness: 0.19,
    normalMap: reservoirNormalTexture,
    normalScale: new THREE.Vector2(0.24, 0.24),
    transparent: true,
    opacity: 0.94,
    side: THREE.DoubleSide,
    depthWrite: true
});
const reservoirWater = new THREE.Mesh(createReservoirGeometry(0), reservoirWaterMat);
reservoirWater.rotation.x = -Math.PI / 2;
reservoirWater.position.set(0, 0.12, -56.0);
reservoirWater.receiveShadow = true;
reservoirGroup.add(reservoirWater);

// Rüzgârla yer değiştiren ince güneş parıltıları. Additive katman yalnızca
// açık çizgileri gösterir; ana su rengini veya derinlik hissini örtmez.
const reservoirGlintMaterial = new THREE.MeshBasicMaterial({
    map: reservoirGlintTexture,
    color: 0xe9fbff,
    transparent: true,
    opacity: 0.20,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
});
const reservoirGlint = new THREE.Mesh(createReservoirGeometry(-0.10), reservoirGlintMaterial);
reservoirGlint.rotation.x = -Math.PI / 2;
reservoirGlint.position.set(0, 0.148, -56.0);
reservoirGlint.renderOrder = 3;
reservoirGroup.add(reservoirGlint);

// Kıyıya çarpan üç ince dalga cephesi. Çok küçük ölçek büyümesi çizgiyi dışarı
// taşırken saydamlık döngüsü dalganın kıyıda sönmesi hissini verir.
const reservoirShoreWaves = [];
[
    { outer: 0.48, inner: -0.16, y: 0.154, opacity: 0.31, phase: 0.0, speed: 1.00 },
    { outer: 1.02, inner: 0.56, y: 0.151, opacity: 0.21, phase: 2.1, speed: 0.86 },
    { outer: 1.62, inner: 1.18, y: 0.149, opacity: 0.13, phase: 4.2, speed: 0.74 }
].forEach((config, index) => {
    const waveTexture = reservoirShoreWaveMaskTexture.clone();
    waveTexture.offset.set(index * 0.19, index * 0.13);
    waveTexture.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({
        map: waveTexture,
        color: index === 0 ? 0xe7fbff : 0xbfe8ee,
        transparent: true,
        opacity: config.opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(
        createReservoirRingGeometry(config.outer, config.inner),
        material
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, config.y, -56.0);
    mesh.renderOrder = 4 + index;
    reservoirGroup.add(mesh);
    reservoirShoreWaves.push({ mesh, material, waveTexture, ...config });
});

function createReservoirIsland(x, z, radiusX, radiusZ, seed) {
    const island = new THREE.Group();
    island.position.set(x, 0, z);
    const shore = new THREE.Mesh(
        new THREE.CylinderGeometry(1.08, 1.18, 0.34, 14),
        new THREE.MeshStandardMaterial({ color: 0x9b9462, roughness: 0.96, flatShading: true })
    );
    shore.scale.set(radiusX, 1, radiusZ);
    shore.position.y = 0.20;
    shore.receiveShadow = true;
    island.add(shore);

    const top = new THREE.Mesh(
        new THREE.CylinderGeometry(1.0, 1.08, 0.30, 14),
        new THREE.MeshStandardMaterial({ color: 0x4f823b, roughness: 0.94, flatShading: true })
    );
    top.scale.set(radiusX, 1, radiusZ);
    top.position.y = 0.42;
    top.receiveShadow = true;
    island.add(top);

    const crownMat = new THREE.MeshStandardMaterial({ color: 0x356f30, roughness: 0.92, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e5330, roughness: 1.0 });
    const treeCount = Math.max(3, Math.round(radiusX * 0.75));
    for (let i = 0; i < treeCount; i++) {
        const angle = seed + i * 2.399;
        const distance = 0.24 + ((i * 0.37) % 0.48);
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.8, 6), trunkMat);
        trunk.position.y = 0.8;
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62 + (i % 3) * 0.09, 1), crownMat);
        crown.scale.y = 1.18;
        crown.position.y = 1.55;
        tree.add(trunk, crown);
        tree.position.set(Math.cos(angle) * radiusX * distance, 0.50, Math.sin(angle) * radiusZ * distance);
        tree.rotation.y = angle;
        island.add(tree);
    }
    reservoirGroup.add(island);
}

createReservoirIsland(-22, -57, 8.0, 3.4, 0.7);
createReservoirIsland(18, -70, 11.0, 4.2, 1.8);
createReservoirIsland(-3, -84, 5.5, 2.4, 2.6);

const distantDamGroup = new THREE.Group();
distantDamGroup.position.set(DAM_ENVIRONMENT.x, 1.35, DAM_ENVIRONMENT.z);
distantDamGroup.rotation.y = DAM_ENVIRONMENT.rotationY;
distantDamGroup.scale.setScalar(1.08);
const damConcreteMat = new THREE.MeshStandardMaterial({ color: 0xaab3b6, roughness: 0.80, metalness: 0.02, flatShading: false });
const damFaceMat = new THREE.MeshStandardMaterial({ color: 0x7d898e, roughness: 0.88, metalness: 0.01, flatShading: false });
const damShadowMat = new THREE.MeshStandardMaterial({ color: 0x657278, roughness: 0.90, metalness: 0.01, flatShading: false });
const damSegmentCount = 12;
const damSpan = 54;
const damSegmentWidth = damSpan / damSegmentCount;

// Yapının altındaki kesintisiz beton servis/apron yatağı yeşil terrain'i
// örter ve barajın zemine gömülmeden, sağlam bir temel üstünde okunmasını sağlar.
const damClearBed = new THREE.Mesh(
    new THREE.BoxGeometry(damSpan + 8.5, 0.55, 16.0),
    new THREE.MeshStandardMaterial({ color: 0x777e7d, roughness: 0.96, metalness: 0 })
);
damClearBed.position.set(0, 0.30, 2.4);
damClearBed.castShadow = true;
damClearBed.receiveShadow = true;
distantDamGroup.add(damClearBed);

for (let i = 0; i < damSegmentCount; i++) {
    const t = (i + 0.5) / damSegmentCount * 2 - 1;
    const x = t * damSpan * 0.5;
    const curveZ = 5.0 * t * t;
    const tangentYaw = -Math.atan((10.0 * t) / damSpan);

    const foundation = new THREE.Mesh(new THREE.BoxGeometry(damSegmentWidth + 0.42, 3.8, 7.6), damShadowMat);
    foundation.position.set(x, -1.0, curveZ + 0.25);
    foundation.rotation.y = tangentYaw;
    foundation.castShadow = true;
    foundation.receiveShadow = true;
    distantDamGroup.add(foundation);

    const wall = new THREE.Mesh(new THREE.BoxGeometry(damSegmentWidth + 0.28, 10.4, 6.2), damFaceMat);
    wall.position.set(x, 5.65, curveZ);
    wall.rotation.y = tangentYaw;
    wall.castShadow = true;
    wall.receiveShadow = true;
    distantDamGroup.add(wall);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(damSegmentWidth + 0.44, 0.52, 6.8), damConcreteMat);
    deck.position.set(x, 10.98, curveZ);
    deck.rotation.y = tangentYaw;
    deck.castShadow = true;
    deck.receiveShadow = true;
    distantDamGroup.add(deck);

    const frontButtress = new THREE.Mesh(new THREE.BoxGeometry(0.70, 8.8, 6.3), damShadowMat);
    frontButtress.position.set(x - damSegmentWidth * 0.47, 4.65, curveZ + 4.05);
    frontButtress.rotation.set(-0.13, tangentYaw, 0);
    frontButtress.castShadow = true;
    frontButtress.receiveShadow = true;
    distantDamGroup.add(frontButtress);

    for (const side of [-1, 1]) {
        const parapet = new THREE.Mesh(new THREE.BoxGeometry(damSegmentWidth + 0.38, 0.42, 0.30), damConcreteMat);
        parapet.position.set(x, 11.38, curveZ + side * 3.38);
        parapet.rotation.y = tangentYaw;
        parapet.castShadow = true;
        distantDamGroup.add(parapet);
    }
}

for (const side of [-1, 1]) {
    const endTower = new THREE.Mesh(new THREE.BoxGeometry(2.6, 12.0, 8.2), damConcreteMat);
    endTower.position.set(side * (damSpan * 0.5 + 0.4), 6.0, 4.8);
    endTower.castShadow = true;
    endTower.receiveShadow = true;
    distantDamGroup.add(endTower);
}

// Üst servis yapısı ölçeği bozmadan barajın mühendislik yapısı olarak
// ilk bakışta ayırt edilmesini güçlendirir.
const damControlHouse = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.5, 5.0), damConcreteMat);
damControlHouse.position.set(7.5, 12.35, 2.2);
damControlHouse.castShadow = true;
damControlHouse.receiveShadow = true;
distantDamGroup.add(damControlHouse);
const damControlRoof = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.35, 5.6), damShadowMat);
damControlRoof.position.set(7.5, 13.77, 2.2);
damControlRoof.castShadow = true;
distantDamGroup.add(damControlRoof);
reservoirGroup.add(distantDamGroup);

// Referanstaki çoklu savak görünümü: her su perdesi iki beton payandanın
// arasında kalır, duvarın önünden akar ve apronun dış kenarında rezervuara iner.
function damWaterRandom(seed) {
    let value = seed >>> 0;
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 4294967296;
    };
}

function createDamFlowTexture(type = "body") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    const random = damWaterRandom(type === "foam" ? 7319 : 4171);

    if (type === "foam") {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Köpük tek parça beyaz bir şerit yerine, akış boyunca kırılan yumuşak
        // damarlar ve küçük kabarcık kümeleri olarak çizilir.
        for (let strand = 0; strand < 17; strand++) {
            const startX = 34 + random() * 444;
            const width = 5 + random() * 15;
            ctx.beginPath();
            for (let y = -90; y <= 1110; y += 26) {
                const x = startX
                    + Math.sin(y * (0.010 + random() * 0.002) + strand) * (8 + random() * 11)
                    + Math.sin(y * 0.031 + strand * 1.7) * 3;
                if (y === -90) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = `rgba(242, 252, 255, ${0.12 + random() * 0.20})`;
            ctx.lineWidth = width;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.stroke();
        }

        for (let i = 0; i < 150; i++) {
            const x = 24 + random() * 464;
            const y = random() * 1024;
            const radiusX = 3 + random() * 12;
            const radiusY = 7 + random() * 24;
            const bubble = ctx.createRadialGradient(x, y, 0, x, y, radiusY);
            bubble.addColorStop(0, `rgba(255,255,255,${0.12 + random() * 0.26})`);
            bubble.addColorStop(1, "rgba(230,249,255,0)");
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(radiusX / radiusY, 1);
            ctx.translate(-x, -y);
            ctx.fillStyle = bubble;
            ctx.beginPath();
            ctx.arc(x, y, radiusY, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    } else {
        const bodyGradient = ctx.createLinearGradient(0, 0, 512, 0);
        bodyGradient.addColorStop(0, "rgba(65, 174, 204, 0.38)");
        bodyGradient.addColorStop(0.10, "rgba(57, 185, 216, 0.92)");
        bodyGradient.addColorStop(0.36, "rgba(83, 205, 229, 0.98)");
        bodyGradient.addColorStop(0.64, "rgba(68, 194, 222, 0.98)");
        bodyGradient.addColorStop(0.90, "rgba(43, 164, 199, 0.92)");
        bodyGradient.addColorStop(1, "rgba(49, 151, 188, 0.38)");
        ctx.fillStyle = bodyGradient;
        ctx.fillRect(0, 0, 512, 1024);

        // Geniş, yarı saydam ton bantları yüzeyi hacimli tutar; ince çizgi üretmez.
        for (let band = 0; band < 24; band++) {
            const x = random() * 512;
            const width = 24 + random() * 64;
            const gradient = ctx.createLinearGradient(x - width, 0, x + width, 0);
            gradient.addColorStop(0, "rgba(210,248,255,0)");
            gradient.addColorStop(0.5, `rgba(215,250,255,${0.035 + random() * 0.075})`);
            gradient.addColorStop(1, "rgba(210,248,255,0)");
            ctx.fillStyle = gradient;
            ctx.fillRect(x - width, 0, width * 2, 1024);
        }

        for (let y = -80; y < 1100; y += 92) {
            const alpha = 0.035 + random() * 0.045;
            ctx.strokeStyle = `rgba(226,251,255,${alpha})`;
            ctx.lineWidth = 18 + random() * 28;
            ctx.beginPath();
            ctx.moveTo(-30, y + random() * 30);
            ctx.bezierCurveTo(130, y - 20, 340, y + 42, 550, y + random() * 28);
            ctx.stroke();
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, type === "foam" ? 2.15 : 1.75);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

const damSpillwayTexture = createDamFlowTexture("body");
const damSpillwayFoamTexture = createDamFlowTexture("foam");

// Uzaktan bakışta ince köpük damarlarının hareketi seçilemeyebiliyor. Bu doku,
// su perdesi boyunca aşağı yürüyen az sayıda geniş kırılma çizgisi üretir.
// Çizgiler sürekli beyaz bantlar değildir; iki yana doğru yumuşayıp parçalanır.
function createDamSurgeTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    const random = damWaterRandom(18821);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let crest = 0; crest < 7; crest++) {
        const baseY = 52 + crest * 151 + random() * 34;
        const widthGradient = ctx.createLinearGradient(28, 0, 484, 0);
        widthGradient.addColorStop(0, "rgba(235,251,255,0)");
        widthGradient.addColorStop(0.16, "rgba(241,253,255,0.34)");
        widthGradient.addColorStop(0.50, "rgba(255,255,255,0.86)");
        widthGradient.addColorStop(0.84, "rgba(241,253,255,0.34)");
        widthGradient.addColorStop(1, "rgba(235,251,255,0)");

        ctx.beginPath();
        for (let x = 22; x <= 490; x += 18) {
            const y = baseY
                + Math.sin(x * 0.021 + crest * 1.7) * (9 + random() * 4)
                + Math.sin(x * 0.057 + crest) * 3;
            if (x === 22) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = widthGradient;
        ctx.lineWidth = 19 + random() * 10;
        ctx.lineCap = "round";
        ctx.stroke();

        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 42 + random() * 16;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1.18);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

const damSpillwaySurgeTexture = createDamSurgeTexture();

function createDamSpillwayNormalTexture() {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const nx = Math.sin(x * 0.31 + y * 0.07) * 0.18 + Math.cos(y * 0.23) * 0.07;
            const ny = Math.sin(y * 0.42 - x * 0.05) * 0.28 + Math.cos((x + y) * 0.16) * 0.08;
            const normal = new THREE.Vector3(-nx, -ny, 1).normalize();
            const index = (y * size + x) * 4;
            image.data[index] = Math.round((normal.x * 0.5 + 0.5) * 255);
            image.data[index + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
            image.data[index + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
            image.data[index + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3.5, 7.0);
    return texture;
}

const damSpillwayNormalTexture = createDamSpillwayNormalTexture();

function createDamSpillwayDepthTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    // Koyu kenarlar su perdesini betonun önünde hacimli gösterirken açık merkez,
    // mevcut stilize turkuaz rengin kaybolmasını önler.
    const edgeShade = ctx.createLinearGradient(0, 0, canvas.width, 0);
    edgeShade.addColorStop(0, "rgba(7, 58, 82, 0.96)");
    edgeShade.addColorStop(0.18, "rgba(13, 91, 118, 0.82)");
    edgeShade.addColorStop(0.50, "rgba(39, 142, 168, 0.62)");
    edgeShade.addColorStop(0.82, "rgba(12, 86, 112, 0.84)");
    edgeShade.addColorStop(1, "rgba(6, 51, 75, 0.97)");
    ctx.fillStyle = edgeShade;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const fallShade = ctx.createLinearGradient(0, 0, 0, canvas.height);
    fallShade.addColorStop(0, "rgba(8, 42, 61, 0.04)");
    fallShade.addColorStop(0.58, "rgba(8, 42, 61, 0.13)");
    fallShade.addColorStop(1, "rgba(4, 30, 48, 0.34)");
    ctx.fillStyle = fallShade;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1.35);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

const damSpillwayDepthTexture = createDamSpillwayDepthTexture();

const damSpillwayMat = new THREE.MeshStandardMaterial({
    map: damSpillwayTexture,
    normalMap: damSpillwayNormalTexture,
    normalScale: new THREE.Vector2(0.22, 0.48),
    color: 0xbbeffc,
    transparent: true,
    opacity: 0.96,
    roughness: 0.24,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false
});
const damSpillwayFoamMat = new THREE.MeshStandardMaterial({
    map: damSpillwayFoamTexture,
    color: 0xeaf8ff,
    transparent: true,
    opacity: 0.72,
    roughness: 0.34,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false
});

function buildDamSpillwayGeometry(width, surfaceOffset = 0, xOffset = 0) {
    const rows = 42;
    const columns = 8;
    const vertices = [];
    const uvs = [];
    const indices = [];

    function spillwayPath(t) {
        if (t < 0.78) {
            const p = t / 0.78;
            return {
                y: THREE.MathUtils.lerp(9.35, 0.78, Math.pow(p, 1.04)),
                z: THREE.MathUtils.lerp(3.28, 8.15, Math.pow(p, 1.42))
            };
        }
        if (t < 0.91) {
            const p = (t - 0.78) / 0.13;
            return {
                y: THREE.MathUtils.lerp(0.78, 0.68, p),
                z: THREE.MathUtils.lerp(8.15, 10.58, p)
            };
        }
        const p = (t - 0.91) / 0.09;
        return {
            y: THREE.MathUtils.lerp(0.68, -1.05, Math.pow(p, 1.08)),
            z: THREE.MathUtils.lerp(10.58, 11.18, Math.pow(p, 0.82))
        };
    }

    for (let row = 0; row <= rows; row++) {
        const t = row / rows;
        const path = spillwayPath(t);
        for (let column = 0; column <= columns; column++) {
            const u = column / columns;
            const edgeSoftening = Math.sin(u * Math.PI);
            const bottomSpread = THREE.MathUtils.smoothstep(t, 0.54, 1.0);
            const widthScale = THREE.MathUtils.lerp(0.94, 1.17, bottomSpread);
            const lateralTurbulence = Math.sin(t * 19 + u * 7) * 0.030 * edgeSoftening;
            const x = xOffset + (u - 0.5) * width * widthScale + lateralTurbulence;
            const surfaceTurbulence = (
                Math.sin(t * 31 + u * 7.5) * 0.030
                + Math.sin(t * 13 - u * 11) * 0.018
            ) * edgeSoftening;
            const softenedEnd = t > 0.92 ? Math.sin(u * Math.PI) * (t - 0.92) * 0.12 : 0;
            vertices.push(x, path.y - softenedEnd, path.z + surfaceOffset + surfaceTurbulence);
            uvs.push(u, t * 2.8);
        }
    }

    const stride = columns + 1;
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const a = row * stride + column;
            const b = a + 1;
            const c = a + stride;
            const d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

function createDamImpactFoamTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(128, 128, 5, 128, 128, 124);
    gradient.addColorStop(0, "rgba(255,255,255,0.98)");
    gradient.addColorStop(0.36, "rgba(235,249,255,0.88)");
    gradient.addColorStop(0.72, "rgba(190,232,250,0.38)");
    gradient.addColorStop(1, "rgba(170,220,245,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    const random = damWaterRandom(9021);
    for (let i = 0; i < 58; i++) {
        const x = 22 + random() * 212;
        const y = 30 + random() * 196;
        const radius = 4 + random() * 17;
        const bubble = ctx.createRadialGradient(x, y, 0, x, y, radius);
        bubble.addColorStop(0, `rgba(255,255,255,${0.22 + random() * 0.42})`);
        bubble.addColorStop(1, "rgba(225,247,255,0)");
        ctx.fillStyle = bubble;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
}

const damImpactFoamMat = new THREE.MeshBasicMaterial({
    map: createDamImpactFoamTexture(),
    color: 0xffffff,
    transparent: true,
    opacity: 0.90,
    depthWrite: false,
    side: THREE.DoubleSide
});
function createDamSplashTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.32, "rgba(226,248,255,0.72)");
    gradient.addColorStop(1, "rgba(205,239,250,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
}

const damSplashMat = new THREE.PointsMaterial({
    map: createDamSplashTexture(),
    color: 0xeafaff,
    transparent: true,
    opacity: 0.62,
    size: 0.34,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
});
const damSpillwayBodyGeometry = buildDamSpillwayGeometry(3.72, -0.025);
const damSpillwayDepthGeometry = buildDamSpillwayGeometry(3.92, -0.105);
const damSpillwayGeometry = buildDamSpillwayGeometry(3.52, 0.055);
const damSpillwayFoamGeometry = buildDamSpillwayGeometry(2.65, 0.105);
const damSpillwaySurgeGeometry = buildDamSpillwayGeometry(3.22, 0.165);
const damSpillwayHighlightGeometry = buildDamSpillwayGeometry(1.58, 0.145, 0.18);
const damSpillwayEdgeLeftGeometry = buildDamSpillwayGeometry(0.34, 0.115, -1.58);
const damSpillwayEdgeRightGeometry = buildDamSpillwayGeometry(0.34, 0.115, 1.58);
const damSpillwaySegmentIndices = [2, 4, 7, 9];
const damSpillwayFlows = [];

for (const segmentIndex of damSpillwaySegmentIndices) {
    const t = (segmentIndex + 0.5) / damSegmentCount * 2 - 1;
    const x = t * damSpan * 0.5;
    const curveZ = 5.0 * t * t;
    const tangentYaw = -Math.atan((10.0 * t) / damSpan);
    const spillway = new THREE.Group();
    spillway.position.set(x, 0, curveZ);
    spillway.rotation.y = tangentYaw;

    const flowIndex = damSpillwayFlows.length;
    const waterTexture = damSpillwayTexture.clone();
    waterTexture.offset.y = flowIndex * 0.137;
    waterTexture.needsUpdate = true;
    const foamTexture = damSpillwayFoamTexture.clone();
    foamTexture.offset.y = flowIndex * 0.193;
    foamTexture.needsUpdate = true;
    const highlightTexture = damSpillwayFoamTexture.clone();
    highlightTexture.repeat.set(1.25, 2.75);
    highlightTexture.offset.set(0.08 + flowIndex * 0.11, flowIndex * 0.237);
    highlightTexture.needsUpdate = true;
    const surgeTexture = damSpillwaySurgeTexture.clone();
    surgeTexture.offset.y = flowIndex * 0.217;
    surgeTexture.needsUpdate = true;
    const normalTexture = damSpillwayNormalTexture.clone();
    normalTexture.offset.y = flowIndex * 0.071;
    normalTexture.needsUpdate = true;

    const waterMaterial = damSpillwayMat.clone();
    waterMaterial.map = waterTexture;
    waterMaterial.normalMap = normalTexture;
    const foamMaterial = damSpillwayFoamMat.clone();
    foamMaterial.map = foamTexture;
    const highlightMaterial = damSpillwayFoamMat.clone();
    highlightMaterial.map = highlightTexture;
    highlightMaterial.color.setHex(0xf3fcff);
    highlightMaterial.opacity = 0.34;
    highlightMaterial.blending = THREE.AdditiveBlending;
    const surgeMaterial = new THREE.MeshBasicMaterial({
        map: surgeTexture,
        color: 0xf4fdff,
        transparent: true,
        opacity: 0.76,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const bodyMaterial = waterMaterial.clone();
    bodyMaterial.color.setHex(0x2f9fbd);
    bodyMaterial.opacity = 0.82;
    bodyMaterial.roughness = 0.36;
    bodyMaterial.normalScale.set(0.18, 0.54);

    const depthMaterial = new THREE.MeshStandardMaterial({
        map: damSpillwayDepthTexture,
        normalMap: normalTexture,
        normalScale: new THREE.Vector2(0.12, 0.38),
        color: 0x3a9bb3,
        transparent: true,
        opacity: 0.56,
        roughness: 0.48,
        metalness: 0,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const depthLayer = new THREE.Mesh(damSpillwayDepthGeometry, depthMaterial);
    depthLayer.renderOrder = 4;

    const waterBody = new THREE.Mesh(damSpillwayBodyGeometry, bodyMaterial);
    waterBody.renderOrder = 5;

    const waterSheet = new THREE.Mesh(damSpillwayGeometry, waterMaterial);
    waterSheet.renderOrder = 6;
    const foamVeins = new THREE.Mesh(damSpillwayFoamGeometry, foamMaterial);
    foamVeins.renderOrder = 7;
    const surgeCrests = new THREE.Mesh(damSpillwaySurgeGeometry, surgeMaterial);
    surgeCrests.renderOrder = 9;
    const flowHighlight = new THREE.Mesh(damSpillwayHighlightGeometry, highlightMaterial);
    flowHighlight.renderOrder = 8;
    const leftEdgeFoam = new THREE.Mesh(damSpillwayEdgeLeftGeometry, foamMaterial);
    const rightEdgeFoam = new THREE.Mesh(damSpillwayEdgeRightGeometry, foamMaterial);
    leftEdgeFoam.renderOrder = 7;
    rightEdgeFoam.renderOrder = 7;

    const impactFoamMaterial = damImpactFoamMat.clone();
    const impactFoam = new THREE.Mesh(new THREE.PlaneGeometry(6.9, 5.15), impactFoamMaterial);
    impactFoam.rotation.x = -Math.PI / 2;
    impactFoam.position.set(0, -1.08, 11.72);
    impactFoam.renderOrder = 8;

    const mixingFoamMaterial = impactFoamMaterial.clone();
    mixingFoamMaterial.opacity = 0.52;
    const mixingFoam = new THREE.Mesh(new THREE.PlaneGeometry(8.1, 7.15), mixingFoamMaterial);
    mixingFoam.rotation.x = -Math.PI / 2;
    mixingFoam.position.set(0, -1.10, 13.72);
    mixingFoam.renderOrder = 7;

    const sprayMaterial = impactFoamMaterial.clone();
    sprayMaterial.opacity = 0.62;
    const impactSpray = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 2.15), sprayMaterial);
    impactSpray.position.set(0, -0.18, 10.86);
    impactSpray.renderOrder = 9;

    // Savak tabanındaki tek, genişleyen halka uzaktan dahi suyun beton aprona
    // çarpıp göle yayıldığını anlatır. Her göz farklı fazda çalışır.
    const pulseRingMaterial = new THREE.MeshBasicMaterial({
        color: 0xe8fbff,
        transparent: true,
        opacity: 0.58,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const pulseRing = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.28, 40), pulseRingMaterial);
    pulseRing.rotation.x = -Math.PI / 2;
    pulseRing.position.set(0, -1.035, 12.4);
    pulseRing.scale.set(1.35, 2.25, 1);
    pulseRing.renderOrder = 10;

    // Her savakta az sayıda, kısa ömürlü parçacık çarpma enerjisini destekler.
    // Düşük adet ve ortak materyal, efektin sakin kalmasını ve performansı korur.
    const splashCount = 12;
    const splashPositions = new Float32Array(splashCount * 3);
    const splashData = [];
    const splashRandom = damWaterRandom(12031 + flowIndex * 977);
    for (let i = 0; i < splashCount; i++) {
        splashData.push({
            age: splashRandom() * 0.9,
            life: 0.62 + splashRandom() * 0.42,
            startX: (splashRandom() - 0.5) * 2.5,
            startZ: 10.82 + (splashRandom() - 0.5) * 1.25,
            velocityX: (splashRandom() - 0.5) * 1.15,
            velocityY: 1.25 + splashRandom() * 1.35,
            velocityZ: 0.45 + splashRandom() * 0.85
        });
    }
    const splashGeometry = new THREE.BufferGeometry();
    splashGeometry.setAttribute("position", new THREE.BufferAttribute(splashPositions, 3));
    splashGeometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(splashCount * 2), 2));
    const splashPoints = new THREE.Points(splashGeometry, damSplashMat);
    splashPoints.renderOrder = 10;

    spillway.add(depthLayer, waterBody, waterSheet, foamVeins, surgeCrests, flowHighlight, leftEdgeFoam, rightEdgeFoam, mixingFoam, impactFoam, impactSpray, pulseRing, splashPoints);
    distantDamGroup.add(spillway);
    damSpillwayFlows.push({
        waterTexture,
        foamTexture,
        surgeTexture,
        highlightTexture,
        normalTexture,
        depthLayer,
        waterSheet,
        waterBody,
        foamVeins,
        surgeCrests,
        flowHighlight,
        leftEdgeFoam,
        rightEdgeFoam,
        impactFoam,
        mixingFoam,
        impactSpray,
        pulseRing,
        splashGeometry,
        splashData,
        phase: flowIndex * 0.83,
        flowSpeed: 1.52 + flowIndex * 0.05,
        foamSpeed: 2.02 + flowIndex * 0.065,
        surgeSpeed: 1.48 + flowIndex * 0.055,
        highlightSpeed: 2.34 + flowIndex * 0.07
    });
}

function createDamAbutment(x, z, radiusX, radiusZ, height, seed) {
    let geometry = new THREE.PlaneGeometry(radiusX * 2, radiusZ * 2, 18, 14);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = [];
    const low = new THREE.Color(0x527546);
    const high = new THREE.Color(0x3f6843);
    for (let i = 0; i < position.count; i++) {
        const px = position.getX(i) / radiusX;
        const pz = position.getZ(i) / radiusZ;
        const d = Math.min(1, Math.hypot(px, pz));
        const shoulder = Math.pow(1 - d, 1.65);
        let y = shoulder * height * (0.92 + Math.sin(px * 4.0 + seed) * 0.08);

        // Abutment yüzeyini baraj koridorunda fiziksel olarak düzleştir.
        // Böylece yeşil terrain geometrisi beton gövdenin önüne giremez.
        const worldX = x + position.getX(i);
        const worldZ = z + position.getZ(i);
        const dx = worldX - DAM_ENVIRONMENT.x;
        const dz = worldZ - DAM_ENVIRONMENT.z;
        const cos = Math.cos(DAM_ENVIRONMENT.rotationY);
        const sin = Math.sin(DAM_ENVIRONMENT.rotationY);
        const localX = cos * dx - sin * dz;
        const localZ = sin * dx + cos * dz;
        if (
            Math.abs(localX) < DAM_ENVIRONMENT.halfSpan + 1.8 &&
            Math.abs(localZ) < DAM_ENVIRONMENT.halfDepth + 1.5
        ) {
            y = Math.min(y, 0.08);
        }
        position.setY(i, y);
        const tone = low.clone().lerp(high, THREE.MathUtils.clamp(y / height, 0, 1));
        colors.push(tone.r, tone.g, tone.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry = carveDamClearance(geometry, x, z, 1.1, 1.1);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95 }));
    mesh.position.set(x, 0.05, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    reservoirGroup.add(mesh);
}

createDamAbutment(-78.0, -48.0, 34, 21, 2.6, 3.4);
createDamAbutment(83.0, -52.0, 34, 22, 2.9, 4.6);
createDamAbutment(23.0, -126.0, 27, 27, 8.0, 0.8);
createDamAbutment(85.0, -95.0, 27, 26, 9.0, 2.1);

const waterfallGroup = new THREE.Group();

const waterfallX = -38.0;
const cliffLedgeZ = -28.0;
const impactZ = -24.8;

function createWaterfallTexture(type = "deep") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");

    if (type === "foam") {
        const bgGrad = ctx.createLinearGradient(0, 0, 512, 0);
        bgGrad.addColorStop(0, "rgba(255, 255, 255, 0.0)");
        bgGrad.addColorStop(0.2, "rgba(255, 255, 255, 0.70)");
        bgGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.95)");
        bgGrad.addColorStop(0.8, "rgba(255, 255, 255, 0.70)");
        bgGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 512, 1024);

        for (let i = 0; i < 90; i++) {
            const x = Math.random() * 512;
            const w = 3 + Math.random() * 8;
            const h = 90 + Math.random() * 260;
            const y = Math.random() * 1024;
            const alpha = 0.35 + Math.random() * 0.65;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fillRect(x, y, w, h);
        }
    } else if (type === "mid") {
        const bgGrad = ctx.createLinearGradient(0, 0, 512, 0);
        bgGrad.addColorStop(0, "rgba(160, 220, 255, 0.0)");
        bgGrad.addColorStop(0.25, "rgba(190, 235, 255, 0.65)");
        bgGrad.addColorStop(0.5, "rgba(230, 248, 255, 0.90)");
        bgGrad.addColorStop(0.75, "rgba(190, 235, 255, 0.65)");
        bgGrad.addColorStop(1, "rgba(160, 220, 255, 0.0)");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 512, 1024);

        for (let i = 0; i < 70; i++) {
            const x = Math.random() * 512;
            const w = 3 + Math.random() * 7;
            const h = 80 + Math.random() * 220;
            const y = Math.random() * 1024;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + Math.random() * 0.6})`;
            ctx.fillRect(x, y, w, h);
        }
    } else {
        const bgGrad = ctx.createLinearGradient(0, 0, 512, 0);
        bgGrad.addColorStop(0, "rgba(90, 185, 255, 0.0)");
        bgGrad.addColorStop(0.25, "rgba(125, 205, 255, 0.65)");
        bgGrad.addColorStop(0.5, "rgba(180, 230, 255, 0.90)");
        bgGrad.addColorStop(0.75, "rgba(125, 205, 255, 0.65)");
        bgGrad.addColorStop(1, "rgba(90, 185, 255, 0.0)");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 512, 1024);

        for (let i = 0; i < 60; i++) {
            const x = Math.random() * 512;
            const w = 4 + Math.random() * 7;
            const h = 70 + Math.random() * 200;
            const y = Math.random() * 1024;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + Math.random() * 0.55})`;
            ctx.fillRect(x, y, w, h);
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 3.0);
    return tex;
}

const waterfallTexDeep = createWaterfallTexture("deep");
const waterfallTexMid = createWaterfallTexture("mid");
const waterfallTexFoam = createWaterfallTexture("foam");

// Parametrik Kesintisiz Dağ Zirvesi & Şelale Su Geometrisi Üreteci (Yeşil Dağın Tepesinden Gölete)
function buildWaterfallLayerGeometry(widthScale = 1.0, depthOffset = 0.0) {
    const numRows = 64;
    const numCols = 10;
    const vertices = [];
    const uvs = [];
    const indices = [];

    const cliffZ = -28.0;
    const startZ = -48.0; // Dağın zirve/tepe noktası (Y ≈ 30.5m)
    const cliffH = getMountainHeight(-38.0, cliffZ);

    for (let r = 0; r <= numRows; r++) {
        const t = r / numRows; // 0.0 (Dağ Tepesi) -> 1.0 (Gölet Girişi)
        let centerZ, centerY, baseWidth, centerX;

        if (t <= 0.55) {
            // 1. Dağın Tepesindeki Yeşil Çimenli Yamaçtan Aşağı Doğan Akarsu (Z: -48.0 -> -28.0)
            const st = t / 0.55;
            centerZ = startZ + st * (cliffZ - startZ);
            centerX = -38.0;
            baseWidth = (3.4 + st * 0.8) * widthScale;
            // Yeşil çimenli dağ yamacının üstünde doğal olarak akar
            centerY = getMountainHeight(centerX, centerZ) + 0.16 + depthOffset;
        } else {
            // 2. Şelale Serbest Düşüş Perdesi (Z: -28.0 -> -24.8, Y: cliffH -> 0.05)
            const ft = (t - 0.55) / 0.45;
            centerZ = cliffZ + ft * (impactZ - cliffZ) + depthOffset * 0.12;
            centerX = -38.0;
            const startH = cliffH + 0.16 + depthOffset;
            centerY = THREE.MathUtils.lerp(startH, 0.05, Math.pow(ft, 1.05));
            centerY = Math.max(centerY, 0.05);
            baseWidth = (4.2 + ft * 1.8) * widthScale;
        }

        for (let c = 0; c <= numCols; c++) {
            const u = c / numCols;
            const localX = (u - 0.5) * baseWidth;
            const vertexX = centerX + localX;
            let vertexY = centerY;

            if (t <= 0.55) {
                vertexY = getMountainHeight(vertexX, centerZ) + 0.16 + depthOffset;
            }

            vertices.push(vertexX, vertexY, centerZ);
            uvs.push(u, t);
        }
    }

    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            const i0 = r * (numCols + 1) + c;
            const i1 = i0 + 1;
            const i2 = (r + 1) * (numCols + 1) + c;
            const i3 = i2 + 1;
            indices.push(i0, i2, i1);
            indices.push(i1, i2, i3);
        }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
}

// Layer 1: Ana Geniş Transparan Su Perdesi
const waterfallGeomDeep = buildWaterfallLayerGeometry(1.0, 0.05);
const waterfallMatDeep = new THREE.MeshStandardMaterial({
    map: waterfallTexDeep,
    color: 0x76c3f8,
    transparent: true,
    opacity: 0.85,
    roughness: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false
});
const waterfallMeshDeep = new THREE.Mesh(waterfallGeomDeep, waterfallMatDeep);
waterfallMeshDeep.renderOrder = 3;

// Layer 2: Orta Hızlı Mavi-Beyaz Akış
const waterfallGeomMid = buildWaterfallLayerGeometry(0.85, 0.11);
const waterfallMatMid = new THREE.MeshStandardMaterial({
    map: waterfallTexMid,
    color: 0xc0e8ff,
    transparent: true,
    opacity: 0.80,
    roughness: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false
});
const waterfallMeshMid = new THREE.Mesh(waterfallGeomMid, waterfallMatMid);
waterfallMeshMid.renderOrder = 4;

// Layer 3: Ön Parçalı Köpüklü Çırpıntı
const waterfallGeomFoam = buildWaterfallLayerGeometry(0.68, 0.17);
const waterfallMatFoam = new THREE.MeshStandardMaterial({
    map: waterfallTexFoam,
    color: 0xffffff,
    transparent: true,
    opacity: 0.74,
    roughness: 0.20,
    side: THREE.DoubleSide,
    depthWrite: false
});
const waterfallMeshFoam = new THREE.Mesh(waterfallGeomFoam, waterfallMatFoam);
waterfallMeshFoam.renderOrder = 5;

// ======================================================
// 15.3. GÜÇLÜ ÇARPMA KÖPÜĞÜ, SU RIPPLE HALKALARI, SPLASH & LOKAL MIST
// ======================================================

// 1. Gölet Üstündeki Geniş Beyaz Köpük Alanı (6.6m x 4.8m Çalkantı)
const foamTextureCanvas = document.createElement("canvas");
foamTextureCanvas.width = 512;
foamTextureCanvas.height = 512;
const foamCtx = foamTextureCanvas.getContext("2d");
const fGrad = foamCtx.createRadialGradient(256, 256, 20, 256, 256, 256);
fGrad.addColorStop(0.0, "rgba(255, 255, 255, 0.98)");
fGrad.addColorStop(0.45, "rgba(255, 255, 255, 0.78)");
fGrad.addColorStop(0.75, "rgba(220, 245, 255, 0.35)");
fGrad.addColorStop(1.0, "rgba(200, 235, 255, 0.0)");
foamCtx.fillStyle = fGrad;
foamCtx.beginPath();
foamCtx.arc(256, 256, 256, 0, Math.PI * 2);
foamCtx.fill();

const foamTex = new THREE.CanvasTexture(foamTextureCanvas);
const foamGeom = new THREE.PlaneGeometry(6.6, 4.8);
const foamMat = new THREE.MeshBasicMaterial({
    map: foamTex,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
});
const foamMesh = new THREE.Mesh(foamGeom, foamMat);
foamMesh.rotation.x = -Math.PI / 2;
foamMesh.position.set(waterfallX, 0.055, impactZ);

// 2. Gölet Üzerinde Genişleyen Su Halkaları (Ripple Rings)
const rippleCount = 3;
const rippleMeshes = [];
const rippleRingGeom = new THREE.RingGeometry(0.8, 1.15, 32);
rippleRingGeom.rotateX(-Math.PI / 2);

for (let i = 0; i < rippleCount; i++) {
    const rMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const rMesh = new THREE.Mesh(rippleRingGeom, rMat);
    rMesh.position.set(waterfallX, 0.058, impactZ);
    rippleMeshes.push({ mesh: rMesh, mat: rMat, phase: i / rippleCount });
}

// 3. Su Damlacıkları Sıçrama Sistemi (Splash Particles - Parabolik Yerçekimi)
const SPLASH_COUNT = 40;
const splashPositions = new Float32Array(SPLASH_COUNT * 3);
const splashData = [];
const splashOriginX = waterfallX;
const splashOriginY = 0.08;
const splashOriginZ = impactZ;

for (let i = 0; i < SPLASH_COUNT; i++) {
    const life = 0.4 + Math.random() * 0.5;
    const sp = {
        age: Math.random() * life,
        lifetime: life,
        vx: (Math.random() - 0.5) * 3.2,
        vy: 2.2 + Math.random() * 2.8,
        vz: (Math.random() - 0.5) * 2.6 + 0.5,
        startX: splashOriginX + (Math.random() - 0.5) * 2.4,
        startY: splashOriginY,
        startZ: splashOriginZ + (Math.random() - 0.5) * 1.6
    };
    splashData.push(sp);
    splashPositions[i * 3] = sp.startX;
    splashPositions[i * 3 + 1] = sp.startY;
    splashPositions[i * 3 + 2] = sp.startZ;
}

const splashGeom = new THREE.BufferGeometry();
splashGeom.setAttribute("position", new THREE.BufferAttribute(splashPositions, 3));
const splashMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.45,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
});
const splashPoints = new THREE.Points(splashGeom, splashMat);

// 4. Yoğun Lokal Su Spreyi / Mist Partikül Sistemi (120 Partikül, NO scene.fog!)
function createMistParticleTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.0, "rgba(255, 255, 255, 0.92)");
    grad.addColorStop(0.35, "rgba(240, 250, 255, 0.55)");
    grad.addColorStop(0.70, "rgba(220, 245, 255, 0.18)");
    grad.addColorStop(1.0, "rgba(200, 235, 255, 0.0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(64, 64, 64, 0, Math.PI * 2);
    ctx.fill();

    return new THREE.CanvasTexture(canvas);
}

const MIST_COUNT = 120;
const mistPositions = new Float32Array(MIST_COUNT * 3);
const mistData = [];

const mistOriginX = waterfallX;
const mistOriginY = 0.15;
const mistOriginZ = impactZ;

for (let i = 0; i < MIST_COUNT; i++) {
    const lifetime = 1.2 + Math.random() * 1.5;
    const p = {
        age: Math.random() * lifetime,
        lifetime: lifetime,
        vx: (Math.random() - 0.5) * 2.4,
        vy: 1.2 + Math.random() * 2.0,
        vz: (Math.random() - 0.5) * 2.0 + 0.4,
        startX: mistOriginX + (Math.random() - 0.5) * 3.8,
        startY: mistOriginY,
        startZ: mistOriginZ + (Math.random() - 0.5) * 2.2
    };
    mistData.push(p);

    mistPositions[i * 3] = p.startX;
    mistPositions[i * 3 + 1] = p.startY;
    mistPositions[i * 3 + 2] = p.startZ;
}

const mistGeom = new THREE.BufferGeometry();
mistGeom.setAttribute("position", new THREE.BufferAttribute(mistPositions, 3));

const mistMat = new THREE.PointsMaterial({
    map: createMistParticleTexture(),
    size: 2.6,
    transparent: true,
    opacity: 0.40,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
});
const mistPoints = new THREE.Points(mistGeom, mistMat);

// The legacy waterfall system is fully removed from the scene and GPU memory.
scene.remove(waterfallGroup, foamMesh, splashPoints, mistPoints);
for (const ripple of rippleMeshes) {
    scene.remove(ripple.mesh);
    ripple.mesh.geometry.dispose();
    ripple.mat.dispose();
}
for (const mesh of [waterfallMeshDeep, waterfallMeshMid, waterfallMeshFoam]) {
    waterfallGroup.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
}
waterfallTexDeep.dispose();
waterfallTexMid.dispose();
waterfallTexFoam.dispose();
foamTex.dispose();
foamGeom.dispose();
foamMat.dispose();
splashGeom.dispose();
splashMat.dispose();
mistGeom.dispose();
mistMat.map?.dispose();
mistMat.dispose();

// ======================================================
// 15.4. MERA ALANI VE OTLAYAN HAYVANLAR (KOYUNLAR & İNEKLER)
// ======================================================

const pastureGroup = new THREE.Group();
scene.add(pastureGroup);

const animatedCreatures = [];

// Low-Poly Koyun Üreteci
function createSheep(x, z, rotY) {
    const sheep = new THREE.Group();
    const groundY = getMountainHeight(x, z);
    sheep.position.set(x, groundY, z);
    sheep.rotation.y = rotY;

    // Gövde (Yünlü kabarık gövde)
    const bodyGeom = new THREE.DodecahedronGeometry(0.55, 1);
    const woolMat = new THREE.MeshStandardMaterial({
        color: 0xf4eee5,
        roughness: 0.95,
        metalness: 0.02
    });
    const bodyMesh = new THREE.Mesh(bodyGeom, woolMat);
    bodyMesh.scale.set(1.0, 0.85, 1.35);
    bodyMesh.position.y = 0.72;
    bodyMesh.castShadow = true;
    sheep.add(bodyMesh);

    // Kafa Grubu (Otlamak için animasyonlu eğilir)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.80, 0.62);

    const headGeom = new THREE.DodecahedronGeometry(0.24, 0);
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2724, roughness: 0.85 });
    const headMesh = new THREE.Mesh(headGeom, darkMat);
    headMesh.scale.set(0.8, 0.9, 1.1);
    headGroup.add(headMesh);

    // Minik Kulaklar
    const earGeom = new THREE.BoxGeometry(0.16, 0.06, 0.08);
    const earL = new THREE.Mesh(earGeom, darkMat);
    earL.position.set(-0.20, 0.08, -0.05);
    earL.rotation.z = -0.3;
    const earR = new THREE.Mesh(earGeom, darkMat);
    earR.position.set(0.20, 0.08, -0.05);
    earR.rotation.z = 0.3;
    headGroup.add(earL);
    headGroup.add(earR);

    sheep.add(headGroup);

    // 4 Bacak
    const legGeom = new THREE.CylinderGeometry(0.055, 0.05, 0.45, 6);
    const legPositions = [
        [-0.22, 0.225, 0.35],
        [0.22, 0.225, 0.35],
        [-0.22, 0.225, -0.35],
        [0.22, 0.225, -0.35]
    ];
    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeom, darkMat);
        leg.position.set(...pos);
        leg.castShadow = true;
        sheep.add(leg);
    });

    sheep.userData = {
        type: "sheep",
        headGroup: headGroup,
        baseX: x,
        baseZ: z,
        targetX: x,
        targetZ: z,
        speed: 0.35,
        grazePhase: Math.random() * Math.PI * 2,
        grazeSpeed: 0.8 + Math.random() * 0.6,
        wanderTimer: Math.random() * 5.0
    };

    return sheep;
}

// Low-Poly İnek Üreteci
function createCow(x, z, rotY, isBrown = false) {
    const cow = new THREE.Group();
    const groundY = getMountainHeight(x, z);
    cow.position.set(x, groundY, z);
    cow.rotation.y = rotY;

    const cowHideColor = isBrown ? 0x6e3c1e : 0x222428;
    const cowBaseMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.85 });
    const spotMat = new THREE.MeshStandardMaterial({ color: cowHideColor, roughness: 0.85 });
    const muzzleMat = new THREE.MeshStandardMaterial({ color: 0xe5aba0, roughness: 0.85 });
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xded2be, roughness: 0.65 });

    // Gövde
    const bodyGeom = new THREE.BoxGeometry(0.95, 0.90, 1.85);
    const bodyMesh = new THREE.Mesh(bodyGeom, cowBaseMat);
    bodyMesh.position.y = 1.05;
    bodyMesh.castShadow = true;
    cow.add(bodyMesh);

    // Gövde Lekeleri
    const spotGeom1 = new THREE.BoxGeometry(0.97, 0.45, 0.65);
    const spot1 = new THREE.Mesh(spotGeom1, spotMat);
    spot1.position.set(0.01, 1.15, 0.2);
    cow.add(spot1);

    const spotGeom2 = new THREE.BoxGeometry(0.97, 0.40, 0.50);
    const spot2 = new THREE.Mesh(spotGeom2, spotMat);
    spot2.position.set(-0.01, 0.95, -0.45);
    cow.add(spot2);

    // Kafa Grubu
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.30, 1.05);

    const headGeom = new THREE.BoxGeometry(0.55, 0.55, 0.65);
    const headMesh = new THREE.Mesh(headGeom, spotMat);
    headGroup.add(headMesh);

    // Burun / Ağız (Muzzle)
    const muzzleGeom = new THREE.BoxGeometry(0.48, 0.28, 0.32);
    const muzzleMesh = new THREE.Mesh(muzzleGeom, muzzleMat);
    muzzleMesh.position.set(0, -0.14, 0.38);
    headGroup.add(muzzleMesh);

    // Boynuzlar
    const hornGeom = new THREE.ConeGeometry(0.06, 0.24, 5);
    const hornL = new THREE.Mesh(hornGeom, hornMat);
    hornL.position.set(-0.24, 0.32, -0.05);
    hornL.rotation.z = -0.4;
    hornL.rotation.x = -0.2;
    const hornR = new THREE.Mesh(hornGeom, hornMat);
    hornR.position.set(0.24, 0.32, -0.05);
    hornR.rotation.z = 0.4;
    hornR.rotation.x = -0.2;
    headGroup.add(hornL);
    headGroup.add(hornR);

    cow.add(headGroup);

    // 4 Bacak
    const legGeom = new THREE.BoxGeometry(0.18, 0.65, 0.18);
    const legPositions = [
        [-0.32, 0.325, 0.65],
        [0.32, 0.325, 0.65],
        [-0.32, 0.325, -0.65],
        [0.32, 0.325, -0.65]
    ];
    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeom, cowBaseMat);
        leg.position.set(...pos);
        leg.castShadow = true;
        cow.add(leg);
    });

    cow.userData = {
        type: "cow",
        headGroup: headGroup,
        baseX: x,
        baseZ: z,
        targetX: x,
        targetZ: z,
        speed: 0.22,
        grazePhase: Math.random() * Math.PI * 2,
        grazeSpeed: 0.5 + Math.random() * 0.4,
        wanderTimer: Math.random() * 7.0
    };

    return cow;
}

// Mera Alanına Hayvanları Yerleştirme (Sağ Arka Bölge: X in [25, 46], Z in [-30, -12])
// 3 Doğal Küme: Kuzeydoğu Yamacı, Orta Mera Düzlüğü, Güney Çayır (Toplam 11 Koyun + 5 İnek)
const PASTURE_BOUNDS = Object.freeze({ minX: 54, maxX: 76, minZ: -16, maxZ: 6 });
const pastureAnimals = [
    createSheep(58.0, -8.5, 0.8),
    createSheep(61.5, -11.0, -1.2),
    createSheep(64.0, -6.5, 2.1),
    createCow(66.5, -10.0, -1.6, false),
    createSheep(69.0, -4.0, 1.4),
    createSheep(72.0, -8.0, -0.6),
    createCow(73.5, -2.5, 0.7, true),
    createSheep(62.5, 0.5, 0.5),
    createCow(68.0, 1.5, -2.4, false)
];

pastureAnimals.forEach(animal => {
    pastureGroup.add(animal);
    animatedCreatures.push(animal);
});

// ======================================================
// 16. MERKEZ DİKDÖRTGEN BİLGİ PANELİ (3D VE DİNAMİK YÜZEY)
// ======================================================

const centerGroup = new THREE.Group();
scene.add(centerGroup);

const centerPanelWidth = 14.5;
const centerPanelDepth = 5.2;
const centerPanelHeight = 0.16;

// 1. Panel Alt Koyu Antrasit Tabanı (Bordür)
const centerBaseGeom = new THREE.BoxGeometry(centerPanelWidth + 0.45, 0.08, centerPanelDepth + 0.45);
const centerBaseMat = new THREE.MeshStandardMaterial({
    color: 0x24272e,
    roughness: 0.70,
    metalness: 0.14
});
const centerBaseMesh = new THREE.Mesh(centerBaseGeom, centerBaseMat);
centerBaseMesh.position.y = 0.04;
centerBaseMesh.receiveShadow = true;
centerBaseMesh.castShadow = true;
centerGroup.add(centerBaseMesh);

// 2. Panel Ana Gövdesi
const centerBodyGeom = new THREE.BoxGeometry(centerPanelWidth, centerPanelHeight, centerPanelDepth);
const centerBodyMat = new THREE.MeshStandardMaterial({
    color: 0x14161a,
    roughness: 0.65,
    metalness: 0.10
});
const centerBodyMesh = new THREE.Mesh(centerBodyGeom, centerBodyMat);
centerBodyMesh.position.y = centerPanelHeight / 2 + 0.01;
centerBodyMesh.receiveShadow = true;
centerBodyMesh.castShadow = true;
centerGroup.add(centerBodyMesh);

// 3. Yüksek Çözünürlüklü ve Kristal Netliğinde 2K Canvas
const centerCanvas = document.createElement("canvas");
centerCanvas.width = 2048;
centerCanvas.height = 734;
const centerCtx = centerCanvas.getContext("2d");

function renderCenterGauge(averageStr = "%--", accentColor = "#138fe8") {
    const w = 2048;
    const h = 734;
    centerCtx.clearRect(0, 0, w, h);

    // Arka Plan Gradient
    const bgGrad = centerCtx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, "#0f1217");
    bgGrad.addColorStop(0.5, "#151821");
    bgGrad.addColorStop(1, "#0d1015");
    centerCtx.fillStyle = bgGrad;
    centerCtx.fillRect(0, 0, w, h);

    // Dış İnce Çerçeve
    centerCtx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    centerCtx.lineWidth = 4;
    centerCtx.strokeRect(16, 16, w - 32, h - 32);

    // İç Çerçeve
    centerCtx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    centerCtx.lineWidth = 2;
    centerCtx.strokeRect(28, 28, w - 56, h - 56);

    // SOL BÖLÜM: Sade ve Güçlü "İZMİR BARAJLARI" Başlığı (Gereksiz küçük yazılar kaldırıldı)
    centerCtx.fillStyle = "#ffffff";
    centerCtx.font = "900 88px 'Nunito', 'Segoe UI', sans-serif";
    centerCtx.letterSpacing = "3px";
    centerCtx.textAlign = "center";
    centerCtx.fillText("İZMİR BARAJLARI", 580, 390);

    // İnce Ayırıcı Dikey Çizgi
    const divGrad = centerCtx.createLinearGradient(1140, 70, 1140, 660);
    divGrad.addColorStop(0, "rgba(255, 255, 255, 0.0)");
    divGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.28)");
    divGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");
    centerCtx.fillStyle = divGrad;
    centerCtx.fillRect(1140, 70, 3, 590);

    // SAĞ BÖLÜM: Yüksek Kontrastlı Dev Yüzde Kartı
    centerCtx.fillStyle = "rgba(255, 255, 255, 0.04)";
    centerCtx.fillRect(1210, 70, 750, 594);
    centerCtx.strokeStyle = "rgba(255, 255, 255, 0.10)";
    centerCtx.lineWidth = 2;
    centerCtx.strokeRect(1210, 70, 750, 594);

    // Kart Üst Vurgu Çizgisi
    centerCtx.fillStyle = accentColor;
    centerCtx.fillRect(1210, 70, 750, 8);

    centerCtx.fillStyle = "#94a3b8";
    centerCtx.font = "900 42px 'Nunito', 'Segoe UI', sans-serif";
    centerCtx.letterSpacing = "1px";
    centerCtx.textAlign = "center";
    centerCtx.fillText("TOPLAM DOLULUK ORANI", 1585, 182);

    // Dev Yüzde Metni
    centerCtx.fillStyle = accentColor;
    const desiredPercentageSize = 210;
    centerCtx.font = `900 ${desiredPercentageSize}px 'Nunito', 'Segoe UI', sans-serif`;
    const percentageWidth = centerCtx.measureText(averageStr).width;
    const fittedPercentageSize = percentageWidth > 680
        ? desiredPercentageSize * (680 / percentageWidth)
        : desiredPercentageSize;
    centerCtx.font = `900 ${fittedPercentageSize}px 'Nunito', 'Segoe UI', sans-serif`;
    centerCtx.shadowColor = accentColor;
    centerCtx.shadowBlur = 20;
    centerCtx.fillText(averageStr, 1585, 420);
    centerCtx.shadowBlur = 0; // reset shadow
}

function renderCenterComparison(previousAverage, currentAverage, previousYear, currentYear) {
    renderCenterGauge("", "#49b7e8");
    centerCtx.fillStyle = "rgba(15, 18, 24, 0.96)";
    centerCtx.fillRect(1212, 82, 746, 570);

    const columns = [
        { x: 1395, year: previousYear, value: previousAverage },
        { x: 1775, year: currentYear, value: currentAverage }
    ];
    centerCtx.fillStyle = "rgba(255,255,255,0.15)";
    centerCtx.fillRect(1583, 125, 3, 430);
    columns.forEach((column) => {
        const tone = dolulukRengi(column.value).hex;
        centerCtx.textAlign = "center";
        centerCtx.fillStyle = "#9eabba";
        centerCtx.font = "900 38px 'Nunito', 'Segoe UI', sans-serif";
        centerCtx.fillText(String(column.year || "—"), column.x, 190);
        centerCtx.fillStyle = tone;
        centerCtx.font = "900 92px 'Nunito', 'Segoe UI', sans-serif";
        centerCtx.fillText(Number.isFinite(column.value) ? `%${column.value.toFixed(2)}` : "VERİ YOK", column.x, 330);
        centerCtx.fillStyle = tone;
        centerCtx.fillRect(column.x - 118, 380, 236, 7);
        centerCtx.fillStyle = "#ffffff";
        centerCtx.font = "800 27px 'Nunito', 'Segoe UI', sans-serif";
        centerCtx.fillText("ORTALAMA", column.x, 455);
    });
}

renderCenterGauge("%--", "#138fe8");

const centerTexture = new THREE.CanvasTexture(centerCanvas);
centerTexture.generateMipmaps = true;
centerTexture.minFilter = THREE.LinearMipmapLinearFilter;
centerTexture.magFilter = THREE.LinearFilter;
centerTexture.anisotropy = 16;
centerTexture.wrapS = THREE.ClampToEdgeWrapping;
centerTexture.wrapT = THREE.ClampToEdgeWrapping;

// Üst Yüzey Dokusu Mesh (Dikdörtgen Düzlem)
const centerTopGeom = new THREE.PlaneGeometry(centerPanelWidth, centerPanelDepth);
const centerTopMat = new THREE.MeshBasicMaterial({
    map: centerTexture,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
});

const centerTopMesh = new THREE.Mesh(centerTopGeom, centerTopMat);
centerTopMesh.rotation.x = -Math.PI / 2;
centerTopMesh.position.y = centerPanelHeight + 0.015;
centerGroup.add(centerTopMesh);

// Göstergeyi dikdörtgen platformun ön-orta kısmına konumlandır
const centerPanelTilt = THREE.MathUtils.degToRad(27);
centerGroup.rotation.x = centerPanelTilt;
centerGroup.position.set(
    0,
    platformHeight + 0.12 + Math.sin(centerPanelTilt) * (centerPanelDepth / 2),
    9.4
);

// 5 Tanktan Merkez Göstergeye İnce Bağlantı Kılavuz Çizgileri
const tankGuideLines = [];
for (let i = 0; i < 5; i++) {
    const tPos = getTankPosition(i);
    const linePoints = [
        new THREE.Vector3(tPos.x, platformHeight + 0.035, tPos.z + 1.8),
        new THREE.Vector3(tPos.x * 0.55, platformHeight + 0.035, 3.0),
        new THREE.Vector3(tPos.x * 0.35, platformHeight + 0.035, 5.0 - centerPanelDepth / 2)
    ];
    const lineGeom = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.18
    });
    const guideLine = new THREE.Line(lineGeom, lineMat);
    scene.add(guideLine);
    tankGuideLines.push(guideLine);
}

// ======================================================
// 17. SU DALGA SHADER & HOMOJEN OPAKLIK MATERYALİ
// ======================================================

const wave1Angle = positionLocal.x.mul(3.1).add(time.mul(1.35));
const wave1 = sin(wave1Angle).mul(0.055);

const wave2Angle = positionLocal.y.mul(4.25).sub(time.mul(1.06));
const wave2 = cos(wave2Angle).mul(0.032);

const wave3Angle = positionLocal.x.add(positionLocal.y.mul(0.85)).mul(5.15).add(time.mul(1.72));
const wave3 = sin(wave3Angle).mul(0.020);

const wave4Angle = positionLocal.x.mul(0.65).sub(positionLocal.y).mul(7.1).add(time.mul(0.80));
const wave4 = cos(wave4Angle).mul(0.012);

const wave5Angle = positionLocal.x.mul(1.3).add(positionLocal.y.mul(0.35)).mul(9.2).sub(time.mul(2.15));
const wave5 = sin(wave5Angle).mul(0.007);

const toplamDalga = wave1.add(wave2).add(wave3).add(wave4).add(wave5);
const dalgaliPozisyon = positionLocal.add(vec3(0, 0, toplamDalga));

const dx1 = cos(wave1Angle).mul(3.1 * 0.055);
const dx3 = cos(wave3Angle).mul(5.15 * 0.020);
const dx4 = sin(wave4Angle).mul(-(0.65 * 7.1 * 0.012));
const dx5 = cos(wave5Angle).mul(1.3 * 9.2 * 0.007);
const dHdx = dx1.add(dx3).add(dx4).add(dx5);

const dy2 = sin(wave2Angle).mul(-(4.25 * 0.032));
const dy3 = cos(wave3Angle).mul(0.85 * 5.15 * 0.020);
const dy4 = sin(wave4Angle).mul(7.1 * 0.012);
const dy5 = cos(wave5Angle).mul(0.35 * 9.2 * 0.007);
const dHdy = dy2.add(dy3).add(dy4).add(dy5);

const dalgaNormalLocal = normalize(vec3(dHdx.mul(-1), dHdy.mul(-1), 1));
const dalgaNormalView = normalize(modelNormalMatrix.mul(dalgaNormalLocal));
const dalgaNormalWorld = transformDirection(dalgaNormalLocal, modelWorldMatrix);

const shaderSunDirection = normalize(vec3(35, 55, 40));
const viewDirection = normalize(cameraPosition.sub(positionWorld));
const halfDirection = normalize(shaderSunDirection.add(viewDirection));
const ndoth = max(dot(dalgaNormalWorld, halfDirection), 0);
const ndotv = max(dot(dalgaNormalWorld, viewDirection), 0);
const fresnel = pow(ndotv.mul(-1).add(1), 3);

function suYuzeyiGeometryOlustur(yaricap, segmentSayisi = 64, halkaSayisi = 20) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [0, 0, 0];
    const uvs = [0.5, 0.5];
    const indices = [];

    for (let halka = 1; halka <= halkaSayisi; halka++) {
        const r = yaricap * (halka / halkaSayisi);
        for (let i = 0; i < segmentSayisi; i++) {
            const aci = (i / segmentSayisi) * Math.PI * 2;
            const x = Math.cos(aci) * r;
            const y = Math.sin(aci) * r;
            vertices.push(x, y, 0);
            uvs.push(x / (yaricap * 2) + 0.5, y / (yaricap * 2) + 0.5);
        }
    }

    for (let i = 0; i < segmentSayisi; i++) {
        indices.push(0, 1 + i, 1 + ((i + 1) % segmentSayisi));
    }

    for (let halka = 1; halka < halkaSayisi; halka++) {
        const oncekiBaslangic = 1 + (halka - 1) * segmentSayisi;
        const yeniBaslangic = 1 + halka * segmentSayisi;
        for (let i = 0; i < segmentSayisi; i++) {
            const sonraki = (i + 1) % segmentSayisi;
            indices.push(oncekiBaslangic + i, yeniBaslangic + i, oncekiBaslangic + sonraki);
            indices.push(oncekiBaslangic + sonraki, yeniBaslangic + i, yeniBaslangic + sonraki);
        }
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

function yarimSuYuzeyiGeometryOlustur(yaricap, taraf, segmentSayisi = 32, halkaSayisi = 20) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [0, 0, 0];
    const uvs = [0.5, 0.5];
    const indices = [];
    const aciBaslangici = taraf === "left" ? Math.PI / 2 : -Math.PI / 2;

    for (let halka = 1; halka <= halkaSayisi; halka++) {
        const r = yaricap * (halka / halkaSayisi);
        for (let i = 0; i <= segmentSayisi; i++) {
            const aci = aciBaslangici + (i / segmentSayisi) * Math.PI;
            const x = Math.cos(aci) * r;
            const y = Math.sin(aci) * r;
            vertices.push(x, y, 0);
            uvs.push(x / (yaricap * 2) + 0.5, y / (yaricap * 2) + 0.5);
        }
    }

    const ringStride = segmentSayisi + 1;
    for (let i = 0; i < segmentSayisi; i++) indices.push(0, 1 + i, 1 + i + 1);
    for (let halka = 1; halka < halkaSayisi; halka++) {
        const onceki = 1 + (halka - 1) * ringStride;
        const sonraki = 1 + halka * ringStride;
        for (let i = 0; i < segmentSayisi; i++) {
            indices.push(onceki + i, sonraki + i, onceki + i + 1);
            indices.push(onceki + i + 1, sonraki + i, sonraki + i + 1);
        }
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

const WATER_BODY_OPACITY = 2;
const WATER_SURFACE_OPACITY = 0.90;

function suYuzeyiMaterialOlustur(renk = 0x138fe8) {
    const material = new THREE.MeshStandardNodeMaterial({
        color: renk,
        transparent: true,
        opacity: WATER_SURFACE_OPACITY,
        roughness: 0.08,
        metalness: 0.02,
        side: THREE.FrontSide,
        depthWrite: false
    });

    material.positionNode = dalgaliPozisyon;
    material.normalNode = dalgaNormalView;

    const sunColor = vec3(1.0, 0.96, 0.88);
    const highlightColor = mix(materialColor, sunColor, 0.65);
    const tightSpecular = pow(ndoth, 56).mul(0.35);
    const softSpecular = pow(ndoth, 13).mul(0.08);
    const sunContribution = highlightColor.mul(tightSpecular.add(softSpecular));
    const skyColor = vec3(0.55, 0.78, 1.0);
    const fresnelContribution = skyColor.mul(fresnel).mul(0.06);

    material.emissiveNode = sunContribution.add(fresnelContribution);
    return material;
}

function suGovdesiMaterialOlustur(renk = 0x138fe8) {
    return new THREE.MeshStandardNodeMaterial({
        color: renk,
        transparent: true,
        opacity: WATER_BODY_OPACITY,
        roughness: 0.12,
        metalness: 0.02,
        side: THREE.FrontSide,
        depthWrite: false
    });
}

function labelOlustur(className, text) {
    const element = document.createElement("div");
    element.className = `dam-label ${className}`;
    element.textContent = text;
    const object = new CSS2DObject(element);
    return { element, object };
}

// ======================================================
// 18. BARAJ METADATA
// ======================================================

const damMetadata = {
    tahtali: {
        id: "tahtali",
        name: "Tahtalı Barajı",
        location: "Menderes, İzmir",
        capacityNum: 306650000,
        capacityFormatted: "306.650.000 m³",
        image: null,
        description: "İzmir'in en büyük içme suyu kaynağı olan Tahtalı Barajı, kentin su ihtiyacının önemli bir bölümünü karşılamaktadır."
    },
    balcova: {
        id: "balcova",
        name: "Balçova Barajı",
        location: "Balçova, İzmir",
        capacityNum: 7759000,
        capacityFormatted: "7.759.000 m³",
        image: null,
        description: "Balçova ve Narlıdere çevresine su sağlayan baraj, İzmir'in en stratejik ve köklü içme suyu rezervuarlarındandır."
    },
    gordes: {
        id: "gordes",
        name: "Gördes Barajı",
        location: "Gördes, Manisa (İzmir İletim Hattı)",
        capacityNum: 453380000,
        capacityFormatted: "453.380.000 m³",
        image: null,
        description: "Gördes Çayı üzerinde kurulu olan baraj, hem tarımsal sulama hem de kente içme suyu takviyesi sağlar."
    },
    urkmez: {
        id: "urkmez",
        name: "Ürkmez Barajı",
        location: "Seferihisar, İzmir",
        capacityNum: 8012000,
        capacityFormatted: "8.012.000 m³",
        image: null,
        description: "Seferihisar ve Ürkmez bölgesinin içme ve sulama suyunu temin eden stratejik bir barajdır."
    },
    alacati: {
        id: "alacati",
        name: "Alaçatı Kutlu Aktaş Barajı",
        location: "Çeşme, İzmir",
        capacityNum: 16500000,
        capacityFormatted: "16.500.000 m³",
        image: null,
        description: "Çeşme Yarımadası ve Alaçatı'nın yaz-kış içme suyu ihtiyacını karşılayan temel kaynaktır."
    }
};

// ======================================================
// 19. BARAJ SİLİNDİRİ VE PODYUM ÜRETECİ
// ======================================================

const clickableTanks = [];

function barajOlustur(x = 0, y = tankY, z = 0, damId = "", damIndex = 0) {
    const meta = damMetadata[damId];
    const grup = new THREE.Group();

    grup.userData.type = "dam";
    grup.userData.damId = damId;
    grup.userData.damName = meta.name;
    grup.userData.damIndex = damIndex;
    grup.userData.baseScale = TANK_SCALE;
    grup.userData.currentScale = TANK_SCALE;
    grup.userData.targetScale = TANK_SCALE;

    const hazneYuksekligi = TANK_HEIGHT;
    const disYaricap = 1.5;
    const camKalinligi = 0.09;
    const icYaricap = disYaricap - camKalinligi;
    const suYaricapi = icYaricap - 0.035;

    // Podyum
    const podiumRadius = disYaricap * 1.25;
    const podiumLocalH = PODIUM_HEIGHT / TANK_SCALE;
    const podiumGeom = new THREE.CylinderGeometry(podiumRadius, podiumRadius * 1.04, podiumLocalH, 64);
    const podiumMat = new THREE.MeshStandardMaterial({
        color: 0x2a2c32,
        roughness: 0.72,
        metalness: 0.12
    });
    const podiumMesh = new THREE.Mesh(podiumGeom, podiumMat);
    podiumMesh.position.y = -hazneYuksekligi / 2 - podiumLocalH / 2;
    podiumMesh.receiveShadow = true;
    podiumMesh.renderOrder = 0;
    grup.add(podiumMesh);

    // Durum LED Halkası
    const ringGeom = new THREE.RingGeometry(podiumRadius * 0.96, podiumRadius * 1.02, 64);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x138fe8,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = -hazneYuksekligi / 2 + 0.003;
    grup.add(ringMesh);

    // Cam Silindir
    const camMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transmission: 0.92,
        transparent: true,
        opacity: 0.25,
        roughness: 0.06,
        metalness: 0,
        ior: 1.45,
        thickness: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const disHazneGeometry = new THREE.CylinderGeometry(disYaricap, disYaricap, hazneYuksekligi, 72, 1, true);
    const disHazne = new THREE.Mesh(disHazneGeometry, camMaterial);
    disHazne.renderOrder = 3;
    grup.add(disHazne);

    const icHazneGeometry = new THREE.CylinderGeometry(icYaricap, icYaricap, hazneYuksekligi, 72, 1, true);
    const icHazne = new THREE.Mesh(icHazneGeometry, camMaterial);
    icHazne.renderOrder = 3;
    grup.add(icHazne);

    const agizGeometry = new THREE.RingGeometry(icYaricap, disYaricap, 72);
    const agizMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.45,
        transmission: 0.85,
        roughness: 0.05,
        metalness: 0,
        ior: 1.45,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const agiz = new THREE.Mesh(agizGeometry, agizMaterial);
    agiz.rotation.x = -Math.PI / 2;
    agiz.position.y = hazneYuksekligi / 2;
    agiz.renderOrder = 4;
    grup.add(agiz);

    const tabanGeometry = new THREE.CircleGeometry(disYaricap, 72);
    const taban = new THREE.Mesh(tabanGeometry, camMaterial);
    taban.rotation.x = -Math.PI / 2;
    taban.position.y = -hazneYuksekligi / 2;
    taban.renderOrder = 0;
    grup.add(taban);

    const kenarGeometry = new THREE.EdgesGeometry(disHazneGeometry, 20);
    const kenarMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.32
    });
    const hazneKenarlari = new THREE.LineSegments(kenarGeometry, kenarMaterial);
    grup.add(hazneKenarlari);

    // Su Gövdesi
    const suGeometry = new THREE.CylinderGeometry(suYaricapi, suYaricapi, hazneYuksekligi, 72, 1, true);
    const suMaterial = suGovdesiMaterialOlustur(0x138fe8);
    const su = new THREE.Mesh(suGeometry, suMaterial);
    su.scale.y = 0;
    su.renderOrder = 1;
    grup.add(su);

    // Su Üst Yüzeyi
    const suYuzeyiGeometry = suYuzeyiGeometryOlustur(suYaricapi, 64, 20);
    const suYuzeyiMaterial = suYuzeyiMaterialOlustur(0x138fe8);
    const suYuzeyi = new THREE.Mesh(suYuzeyiGeometry, suYuzeyiMaterial);
    suYuzeyi.rotation.x = -Math.PI / 2;
    suYuzeyi.visible = false;
    suYuzeyi.renderOrder = 2;
    grup.add(suYuzeyi);

    // Karşılaştırma modu: aynı cam hazne içinde çakışmayan gerçek iki yarım su hacmi.
    const comparisonGroup = new THREE.Group();
    comparisonGroup.visible = false;
    const comparisonRadius = suYaricapi - 0.012;
    const leftWater = new THREE.Mesh(
        new THREE.CylinderGeometry(comparisonRadius, comparisonRadius, hazneYuksekligi, 40, 1, true, Math.PI, Math.PI),
        suGovdesiMaterialOlustur(0x138fe8)
    );
    const rightWater = new THREE.Mesh(
        new THREE.CylinderGeometry(comparisonRadius, comparisonRadius, hazneYuksekligi, 40, 1, true, 0, Math.PI),
        suGovdesiMaterialOlustur(0x138fe8)
    );
    leftWater.scale.y = 0;
    rightWater.scale.y = 0;
    leftWater.renderOrder = 1;
    rightWater.renderOrder = 1;
    comparisonGroup.add(leftWater, rightWater);

    const leftSurface = new THREE.Mesh(
        yarimSuYuzeyiGeometryOlustur(comparisonRadius, "left", 36, 18),
        suYuzeyiMaterialOlustur(0x138fe8)
    );
    const rightSurface = new THREE.Mesh(
        yarimSuYuzeyiGeometryOlustur(comparisonRadius, "right", 36, 18),
        suYuzeyiMaterialOlustur(0x138fe8)
    );
    [leftSurface, rightSurface].forEach((surface) => {
        surface.rotation.x = -Math.PI / 2;
        surface.visible = false;
        surface.renderOrder = 2;
        comparisonGroup.add(surface);
    });

    const separator = new THREE.Mesh(
        new THREE.PlaneGeometry(comparisonRadius * 1.94, hazneYuksekligi * 0.97),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    );
    separator.rotation.y = Math.PI / 2;
    separator.renderOrder = 2;
    comparisonGroup.add(separator);
    grup.add(comparisonGroup);

    const percentageLabel = labelOlustur("percentage-label", "%--");
    percentageLabel.object.position.set(0, hazneYuksekligi / 2 + 0.38 / TANK_SCALE, 0);
    percentageLabel.element.style.setProperty("--accent", "#138fe8");
    grup.add(percentageLabel.object);
    grup.userData.percentageElement = percentageLabel.element;

    const comparisonElement = document.createElement("div");
    comparisonElement.className = "dam-label comparison-label";
    comparisonElement.innerHTML = `
        <div class="comparison-label-column" data-side="previous"><span class="comparison-year">—</span><strong class="comparison-value">—</strong><i class="comparison-accent"></i></div>
        <div class="comparison-label-column" data-side="current"><span class="comparison-year">—</span><strong class="comparison-value">—</strong><i class="comparison-accent"></i></div>`;
    const comparisonLabelObject = new CSS2DObject(comparisonElement);
    comparisonLabelObject.position.set(0, hazneYuksekligi / 2 + 0.38 / TANK_SCALE, 0);
    comparisonLabelObject.visible = false;
    grup.add(comparisonLabelObject);
    grup.userData.comparisonElement = comparisonElement;

    const bottomContainer = document.createElement("div");
    bottomContainer.className = "dam-bottom-card";

    const nameElement = document.createElement("div");
    nameElement.className = "dam-label dam-name-label";
    nameElement.textContent = meta.name;

    bottomContainer.appendChild(nameElement);

    const bottomCardObject = new CSS2DObject(bottomContainer);
    bottomCardObject.position.set(0, -hazneYuksekligi / 2 - 0.45 / TANK_SCALE, 0);
    grup.add(bottomCardObject);

    grup.traverse((child) => {
        if (child.isMesh && child !== ringMesh) {
            child.castShadow = true;
        }
    });

    grup.scale.setScalar(TANK_SCALE);
    grup.position.set(x, y + platformHeight, z);
    grup.rotation.y = 0;

    scene.add(grup);
    clickableTanks.push(grup);

    const tankSpot = new THREE.SpotLight(0xfff8ee, 1.4, 22, Math.PI / 5.5, 0.75, 1.0);
    tankSpot.position.set(x, 14, z);
    tankSpot.target.position.set(x, y + platformHeight, z);
    tankSpot.castShadow = false;
    scene.add(tankSpot);
    scene.add(tankSpot.target);

    return {
        grup,
        su,
        suYuzeyi,
        ringMesh,
        hazneYuksekligi,
        percentageElement: percentageLabel.element,
        percentageObject: percentageLabel.object,
        comparison: { group: comparisonGroup, leftWater, rightWater, leftSurface, rightSurface, separator, labelObject: comparisonLabelObject, labelElement: comparisonElement },
        nameElement: nameElement,
        spotLight: tankSpot,
        spotTarget: tankSpot.target,
        latestData: null
    };
}

// ======================================================
// 20. 5 BARAJI YATAY DÜZLEME YERLEŞTİRME
// ======================================================

const pos0 = getTankPosition(0);
const pos1 = getTankPosition(1);
const pos2 = getTankPosition(2);
const pos3 = getTankPosition(3);
const pos4 = getTankPosition(4);

const barajlar = {
    tahtali: barajOlustur(pos0.x, tankY, pos0.z, "tahtali", 0),
    balcova: barajOlustur(pos1.x, tankY, pos1.z, "balcova", 1),
    gordes: barajOlustur(pos2.x, tankY, pos2.z, "gordes", 2),
    urkmez: barajOlustur(pos3.x, tankY, pos3.z, "urkmez", 3),
    alacati: barajOlustur(pos4.x, tankY, pos4.z, "alacati", 4)
};

let compactSceneActive = null;

function kilavuzCizgisiniGuncelle(line, position) {
    if (!line) return;
    line.geometry.setFromPoints([
        new THREE.Vector3(position.x, platformHeight + 0.035, position.z + 1.8),
        new THREE.Vector3(position.x * 0.55, platformHeight + 0.035, 3.0),
        new THREE.Vector3(position.x * 0.35, platformHeight + 0.035, 5.0 - centerPanelDepth / 2)
    ]);
}

function responsiveSahneDuzeniniGuncelle({ force = false } = {}) {
    const compact = window.innerWidth <= 700 && window.innerHeight > window.innerWidth;
    if (!force && compactSceneActive === compact) return;
    compactSceneActive = compact;

    const positions = compact ? mobileTankPositions : tankPositions;
    const responsiveTankScale = compact ? MOBILE_TANK_SCALE : TANK_SCALE;
    Object.values(barajlar).forEach((dam, index) => {
        const position = positions[index];
        dam.grup.position.x = position.x;
        dam.grup.position.y = platformHeight
            + (TANK_HEIGHT / 2 + PODIUM_HEIGHT / TANK_SCALE) * responsiveTankScale;
        dam.grup.position.z = position.z;
        dam.grup.userData.baseScale = responsiveTankScale;
        dam.grup.userData.currentScale = responsiveTankScale;
        dam.grup.userData.targetScale = responsiveTankScale;
        dam.grup.scale.setScalar(responsiveTankScale);
        dam.spotLight.position.x = position.x;
        dam.spotLight.position.z = position.z;
        dam.spotTarget.position.x = position.x;
        dam.spotTarget.position.y = dam.grup.position.y;
        dam.spotTarget.position.z = position.z;
        kilavuzCizgisiniGuncelle(tankGuideLines[index], position);
    });

    const viewportAspect = Math.max(window.innerWidth / Math.max(window.innerHeight, 1), 0.3);
    const mobileCameraZ = THREE.MathUtils.clamp(
        14 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * viewportAspect),
        74,
        130
    );
    centerGroup.position.z = 9.4;
    DEFAULT_CAMERA_POS.set(0, compact ? 15.5 : 13.5, compact ? mobileCameraZ : 30.5);
    DEFAULT_CONTROLS_TARGET.set(0, compact ? 2.2 : 2.8, compact ? -1.0 : 0);
    camera.position.copy(DEFAULT_CAMERA_POS);
    controls.target.copy(DEFAULT_CONTROLS_TARGET);
    camera.lookAt(DEFAULT_CONTROLS_TARGET);
    controls.update();
}

responsiveSahneDuzeniniGuncelle({ force: true });

// ======================================================
// 21. GÜNCEL RESMİ YEDEK VERİLER VE API ÇEKİMİ
// ======================================================

const YEDEK_VERILER = {
    tahtali: { DOLULUK_ORANI: 53.04, BARAJ_KUYU_ADI: "Tahtalı Barajı", DURUM_TARIHI: "2026-04-13T00:00:00" },
    balcova: { DOLULUK_ORANI: 97.70, BARAJ_KUYU_ADI: "Balçova Barajı", DURUM_TARIHI: "2026-04-13T00:00:00" },
    gordes: { DOLULUK_ORANI: 40.07, BARAJ_KUYU_ADI: "Gördes Barajı", DURUM_TARIHI: "2026-04-13T00:00:00" },
    urkmez: { DOLULUK_ORANI: 97.55, BARAJ_KUYU_ADI: "Ürkmez Barajı", DURUM_TARIHI: "2026-04-13T00:00:00" },
    alacati: { DOLULUK_ORANI: 81.77, BARAJ_KUYU_ADI: "Alaçatı Kutlu Aktaş Barajı", DURUM_TARIHI: "2026-04-13T00:00:00" }
};

const BIZIZMIR_RESOURCE_ID = "5c2ad5b0-f681-45a6-b72c-170791ea8f50";
const BIZIZMIR_BARAJ_ADLARI = Object.freeze({
    tahtali: "Tahtalı Barajı",
    balcova: "Balçova Barajı",
    gordes: "Gördes Barajı",
    urkmez: "Ürkmez Barajı",
    alacati: "Alaçatı Kutlu Aktaş Barajı"
});
const BIZIZMIR_DIRECT_APIS = Object.fromEntries(
    Object.entries(BIZIZMIR_BARAJ_ADLARI).map(([id, name]) => [
        id,
        `https://acikveri.bizizmir.com/tr/api/3/action/datastore_search?resource_id=${BIZIZMIR_RESOURCE_ID}&filters=${encodeURIComponent(JSON.stringify({ BARAJ_KUYU_ADI: name }))}`
    ])
);

const LOCAL_BARAJ_ENDPOINTLERI = Object.freeze({
    tahtali: "/api/tahtali",
    balcova: "/api/balcova",
    gordes: "/api/gordes",
    urkmez: "/api/urkmez",
    alacati: "/api/alacati"
});

const LAST_SUCCESSFUL_DATA_KEY = "lastSuccessfulDamData:v2";
const currentCalendarDate = isoGun(new Date());
const previousCalendarDate = birYilOncesi(currentCalendarDate);
let latestDataDate = null;
let selectedDateMode = "latest";
let selectedTargetDate = currentCalendarDate;
let selectedReferenceDate = null;
let currentDataSource = "fallback";
let dateLoadSequence = 0;
const dateModeCache = new Map();
let comparisonData = {
    previousTargetDate: previousCalendarDate,
    currentTargetDate: currentCalendarDate,
    previousDate: null,
    currentDate: null,
    previous: {},
    current: {}
};

function oranOku(record) {
    const value = parseFloat(String(record?.DOLULUK_ORANI ?? "").replace(',', '.'));
    return Number.isFinite(value) ? value : null;
}

function dolulukRengi(oran) {
    if (oran >= 70) return { color: 0x138fe8, hex: "#138fe8" };
    if (oran >= 55) return { color: 0x00b6c7, hex: "#00b6c7" };
    if (oran >= 40) return { color: 0xd59b00, hex: "#d59b00" };
    return { color: 0xc92f35, hex: "#c92f35" };
}

function genelOrtalamaGuncelle() {
    let toplam = 0;
    let sayi = 0;

    Object.keys(barajlar).forEach((id) => {
        const data = barajlar[id].latestData || YEDEK_VERILER[id];
        if (data) {
            const rawOran = String(data.DOLULUK_ORANI).replace(',', '.');
            const oran = parseFloat(rawOran);
            if (!isNaN(oran)) {
                toplam += oran;
                sayi++;
            }
        }
    });

    if (sayi > 0) {
        const ortalama = toplam / sayi;
        let accentHex = "#138fe8";
        if (ortalama >= 70) accentHex = "#138fe8";
        else if (ortalama >= 55) accentHex = "#00b6c7";
        else if (ortalama >= 40) accentHex = "#d59b00";
        else accentHex = "#c92f35";

        renderCenterGauge(`%${ortalama.toFixed(2)}`, accentHex);
        centerTexture.needsUpdate = true;
    }

}

function barajVerisiniUygula(id, baraj) {
    const aktifBaraj = barajlar[id];
    if (!aktifBaraj || !baraj) return;

    aktifBaraj.latestData = baraj;

    const su = aktifBaraj.su;
    const suYuzeyi = aktifBaraj.suYuzeyi;
    const ringMesh = aktifBaraj.ringMesh;
    const hazneYuksekligi = aktifBaraj.hazneYuksekligi;

    const rawOran = String(baraj.DOLULUK_ORANI).replace(',', '.');
    const oranSayi = parseFloat(rawOran);

    if (isNaN(oranSayi)) return;

    const dolulukOrani = THREE.MathUtils.clamp(oranSayi / 100, 0, 1);

    const bottomY = -hazneYuksekligi / 2;
    const gercekSuYuksekligi = hazneYuksekligi * dolulukOrani;
    const bindirmePayi = 0.07;
    const govdeYuksekligi = Math.min(
        hazneYuksekligi,
        gercekSuYuksekligi + bindirmePayi
    );

    su.scale.y = govdeYuksekligi / hazneYuksekligi;
    su.position.y = bottomY + govdeYuksekligi / 2;

    const suYuzeyiY = bottomY + gercekSuYuksekligi;
    suYuzeyi.position.y = suYuzeyiY;
    suYuzeyi.visible = dolulukOrani > 0.001;

    const { color: suRengi, hex: accentHex } = dolulukRengi(oranSayi);

    su.material.color.set(suRengi);
    suYuzeyi.material.color.set(suRengi);
    if (ringMesh) ringMesh.material.color.set(suRengi);

    aktifBaraj.percentageElement.textContent = `%${oranSayi.toFixed(2)}`;
    aktifBaraj.percentageElement.style.setProperty("--accent", accentHex);

    if (baraj.BARAJ_KUYU_ADI) {
        aktifBaraj.nameElement.textContent = baraj.BARAJ_KUYU_ADI;
    }

    genelOrtalamaGuncelle();
}

function isoGun(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
}

function birYilOncesi(isoDate) {
    const date = new Date(`${isoDate}T12:00:00`);
    date.setFullYear(date.getFullYear() - 1);
    return isoGun(date);
}

function kisaTarih(isoDate) {
    if (!isoDate) return "—";
    return new Intl.DateTimeFormat("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(new Date(`${isoDate}T12:00:00`));
}

function kaydinSlugunuBul(record) {
    if (record?.slug && barajlar[record.slug]) return record.slug;
    const name = String(record?.BARAJ_KUYU_ADI || "").toLocaleLowerCase("tr-TR");
    if (name.includes("taht")) return "tahtali";
    if (name.includes("bal")) return "balcova";
    if (name.includes("ürk") || name.includes("urk")) return "urkmez";
    if (name.includes("gör") || name.includes("gor")) return "gordes";
    if (name.includes("ala") || name.includes("kutlu")) return "alacati";
    return null;
}

function kayitlariSlugMapineCevir(records) {
    return records.reduce((map, record) => {
        const slug = kaydinSlugunuBul(record);
        if (slug) map[slug] = record;
        return map;
    }, {});
}

function kayitlarinGercekTarihi(records, fallback = null) {
    return records.map((record) => isoGun(record.DURUM_TARIHI)).filter(Boolean).sort().at(-1) || fallback;
}

function enGuncelKayitlariSec(records) {
    const latestBySlug = {};
    (Array.isArray(records) ? records : []).forEach((record) => {
        const slug = kaydinSlugunuBul(record);
        const recordDate = isoGun(record?.DURUM_TARIHI);
        if (!slug || !recordDate) return;
        const existingDate = isoGun(latestBySlug[slug]?.DURUM_TARIHI);
        if (!existingDate || recordDate > existingDate) latestBySlug[slug] = record;
    });
    return Object.values(latestBySlug);
}

function apiYanitindanBarajKaydiSec(payload, id) {
    const candidates = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.result?.records)
            ? payload.result.records
            : payload && typeof payload === "object"
                ? [payload]
                : [];

    const validRecords = candidates.filter((record) => oranOku(record) !== null);
    return validRecords.find((record) => kaydinSlugunuBul(record) === id)
        || (validRecords.length === 1 ? validRecords[0] : null);
}

async function barajVerisiniGetir(endpoint, id) {
    console.info(`[${id}] Local API deneniyor`);
    try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (response.ok) {
            const record = apiYanitindanBarajKaydiSec(await response.json(), id);
            if (record) {
                barajVerisiniUygula(id, record);
                console.info(`[${id}] Local API başarılı`);
                return { record, source: "live" };
            }
        }
        console.warn(`[${id}] Local API başarısız`);
    } catch (_error) {
        console.warn(`[${id}] Local API başarısız`);
    }

    console.info(`[${id}] Direct API deneniyor`);
    try {
        const response = await fetch(BIZIZMIR_DIRECT_APIS[id], { cache: "no-store" });
        if (response.ok) {
            const record = apiYanitindanBarajKaydiSec(await response.json(), id);
            if (record) {
                barajVerisiniUygula(id, record);
                console.info(`[${id}] Direct API başarılı`);
                return { record, source: "direct" };
            }
        }
        console.warn(`[${id}] Direct API başarısız`);
    } catch (_error) {
        console.warn(`[${id}] Direct API başarısız`);
    }

    console.warn(`[${id}] Tüm API'ler başarısız, YEDEK veri korunuyor`);
    return { record: barajlar[id].latestData || YEDEK_VERILER[id], source: "fallback" };
}

async function guncelBarajVerileriniGetir() {
    const results = await Promise.all(
        Object.entries(LOCAL_BARAJ_ENDPOINTLERI).map(([id, endpoint]) => barajVerisiniGetir(endpoint, id))
    );
    const records = results.map((result) => result.record).filter(Boolean);
    const hasLiveData = results.some((result) => result.source === "live" || result.source === "direct");
    return {
        records,
        actualDate: kayitlarinGercekTarihi(records, kayitlarinGercekTarihi(Object.values(YEDEK_VERILER))),
        source: hasLiveData ? "live" : "fallback"
    };
}

function sonBasariliVeriyiOku() {
    try {
        const payload = JSON.parse(localStorage.getItem(LAST_SUCCESSFUL_DATA_KEY) || "null");
        if (!payload || !Array.isArray(payload.records) || !payload.records.length) return null;
        const records = enGuncelKayitlariSec(payload.records);
        if (!records.length) return null;
        return { records, savedAt: payload.savedAt || null };
    } catch (_error) {
        return null;
    }
}

function sonBasariliVeriyiKaydet(records) {
    try {
        localStorage.setItem(LAST_SUCCESSFUL_DATA_KEY, JSON.stringify({
            records,
            latestDataDate: kayitlarinGercekTarihi(records),
            savedAt: new Date().toISOString()
        }));
    } catch (_error) {
        // Gizli gezinme / depolama engeli canlı verinin kullanılmasını engellemez.
    }
}

function veriKaynagiArayuzunuGuncelle() {
    if (latestDataDateLabel) latestDataDateLabel.textContent = kisaTarih(latestDataDate);
    if (dataSourceBadge) {
        dataSourceBadge.classList.toggle("is-stored", currentDataSource === "cache");
        dataSourceBadge.classList.toggle("is-fallback", currentDataSource === "fallback");
        dataSourceBadge.textContent = currentDataSource === "live"
            ? "Güncel Veri"
            : currentDataSource === "cache"
                ? "Son Kayıtlı Veri"
                : "Yerleşik Yedek Veri";
    }
    if (usedDataDateLabel) {
        if (selectedDateMode === "compare") {
            usedDataDateLabel.textContent = `Kullanılan veriler: ${kisaTarih(comparisonData.previousDate)} ↔ ${kisaTarih(comparisonData.currentDate)}`;
        } else {
            const targetText = kisaTarih(selectedTargetDate);
            const actualText = kisaTarih(selectedReferenceDate);
            usedDataDateLabel.textContent = selectedTargetDate && selectedReferenceDate && selectedTargetDate !== selectedReferenceDate
                ? `Hedef: ${targetText} • Kullanılan veri: ${actualText}`
                : `Kullanılan veri: ${actualText}`;
        }
    }
}

async function enGuncelVeriyiGetir() {
    if (dateModeCache.has("latest")) return dateModeCache.get("latest");
    const result = await guncelBarajVerileriniGetir();
    dateModeCache.set("latest", result);
    return result;
}

function gunKaydir(isoDate, amount) {
    const date = new Date(`${isoDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
}

async function tarihliKayitlariGetir(targetDate, searchBackDays = 10) {
    const cacheKey = `date:${targetDate}`;
    if (dateModeCache.has(cacheKey)) return dateModeCache.get(cacheKey);

    const candidateDates = Array.from({ length: searchBackDays + 1 }, (_, offset) => gunKaydir(targetDate, -offset));
    for (const candidateDate of candidateDates) {
        try {
            const response = await fetch(`/api/barajlar?date=${encodeURIComponent(candidateDate)}`);
            if (!response.ok) continue;
            const responseRecords = await response.json();
            const exactRecords = enGuncelKayitlariSec(responseRecords).filter(
                (record) => isoGun(record.DURUM_TARIHI) === candidateDate
            );
            // Beş tanktan herhangi biri eksikse mevcut sahneyi yarım veriyle
            // değiştirme; fallback zincirindeki önceki güne devam et.
            if (exactRecords.length >= Object.keys(barajlar).length) {
                const result = { records: exactRecords, actualDate: candidateDate, targetDate, source: "live" };
                dateModeCache.set(cacheKey, result);
                return result;
            }
        } catch (_error) {
            // Bir günün isteği başarısızsa fallback zincirindeki önceki güne geç.
        }
    }

    // Resmî kaynakta geçmiş gün yoksa bu beklenen bir "veri yok" durumudur;
    // ağ/sunucu hatası gibi fırlatılıp konsolu kirletilmez.
    dateModeCache.set(cacheKey, null);
    return null;
}

const startupRecords = Object.values(YEDEK_VERILER).map((record) => ({ ...record }));
currentDataSource = "fallback";
latestDataDate = kayitlarinGercekTarihi(startupRecords);
selectedReferenceDate = latestDataDate;
Object.entries(YEDEK_VERILER).forEach(([id, record]) => {
    barajVerisiniUygula(id, { ...record });
    console.info(`[${id}] YEDEK veri uygulandı`);
});
genelOrtalamaGuncelle();

function comparisonVisibility(active) {
    Object.values(barajlar).forEach((tank) => {
        tank.su.visible = !active;
        tank.suYuzeyi.visible = !active && (oranOku(tank.latestData) || 0) > 0;
        tank.percentageObject.visible = !active;
        tank.comparison.group.visible = active;
        tank.comparison.labelObject.visible = active;
        if (!active) {
            tank.comparison.leftSurface.visible = false;
            tank.comparison.rightSurface.visible = false;
        }
    });
}

const comparisonCameraDirection = new THREE.Vector3();
const comparisonCameraRight = new THREE.Vector3();
let comparisonLabelsReversed = false;

function karsilastirmaEtiketYonunuGuncelle() {
    camera.getWorldDirection(comparisonCameraDirection);
    comparisonCameraRight.crossVectors(comparisonCameraDirection, camera.up).normalize();

    // Kamera tam yandan bakarken iki yarım ekranda neredeyse üst üste gelir.
    // Küçük bir ölü bölge, sınırda sütunların sürekli yer değiştirmesini önler.
    let nextReversed = comparisonLabelsReversed;
    if (comparisonCameraRight.x < -0.08) nextReversed = true;
    else if (comparisonCameraRight.x > 0.08) nextReversed = false;
    if (nextReversed === comparisonLabelsReversed) return;

    comparisonLabelsReversed = nextReversed;
    Object.values(barajlar).forEach((tank) => {
        tank.comparison.labelElement.classList.toggle("is-view-reversed", nextReversed);
    });
}

function yarimSuVerisiniUygula(tank, side, record) {
    const water = side === "left" ? tank.comparison.leftWater : tank.comparison.rightWater;
    const surface = side === "left" ? tank.comparison.leftSurface : tank.comparison.rightSurface;
    const column = tank.comparison.labelElement.querySelector(`[data-side="${side === "left" ? "previous" : "current"}"]`);
    const ratio = oranOku(record);
    const bottomY = -tank.hazneYuksekligi / 2;
    if (ratio === null) {
        // Geçersiz istek mevcut karşılaştırma state'ini temizlemesin.
        return;
    }
    const fraction = THREE.MathUtils.clamp(ratio / 100, 0, 1);
    const realHeight = tank.hazneYuksekligi * fraction;
    const bodyHeight = Math.min(tank.hazneYuksekligi, realHeight + 0.07);
    water.scale.y = bodyHeight / tank.hazneYuksekligi;
    water.position.y = bottomY + bodyHeight / 2;
    surface.position.y = bottomY + realHeight;
    surface.visible = fraction > 0.001;
    const tone = dolulukRengi(ratio);
    water.material.color.set(tone.color);
    surface.material.color.set(tone.color);
    column.querySelector(".comparison-value").textContent = `%${ratio.toFixed(2)}`;
    column.style.setProperty("--accent", tone.hex);
}

function karsilastirmaSahnesiniGuncelle() {
    comparisonVisibility(true);
    const previousYear = comparisonData.previousTargetDate.slice(0, 4);
    const currentYear = comparisonData.currentTargetDate.slice(0, 4);
    const previousRatios = [];
    const currentRatios = [];

    Object.entries(barajlar).forEach(([id, tank]) => {
        const previous = comparisonData.previous[id];
        const current = comparisonData.current[id];
        yarimSuVerisiniUygula(tank, "left", previous);
        yarimSuVerisiniUygula(tank, "right", current);
        tank.comparison.labelElement.querySelector('[data-side="previous"] .comparison-year').textContent = previousYear;
        tank.comparison.labelElement.querySelector('[data-side="current"] .comparison-year').textContent = currentYear;
        const previousRatio = oranOku(previous);
        const currentRatio = oranOku(current);
        if (previousRatio !== null) previousRatios.push(previousRatio);
        if (currentRatio !== null) currentRatios.push(currentRatio);
        if (currentRatio !== null) tank.ringMesh.material.color.set(dolulukRengi(currentRatio).color);
    });

    const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
    renderCenterComparison(average(previousRatios), average(currentRatios), previousYear, currentYear);
    centerTexture.needsUpdate = true;
}

function tarihSeciciEtiketleriniGuncelle() {
    if (latestDateOptionLabel) latestDateOptionLabel.textContent = kisaTarih(currentCalendarDate);
    if (lastYearDateOptionLabel) lastYearDateOptionLabel.textContent = kisaTarih(previousCalendarDate);
    if (compareDateOptionLabel) compareDateOptionLabel.textContent = `${currentCalendarDate.slice(0, 4) - 1} ↔ ${currentCalendarDate.slice(0, 4)}`;
    if (galleryUpdateDateLabelEl) {
        galleryUpdateDateLabelEl.textContent = selectedDateMode === "last-year"
            ? "Tarih Seçimi: Geçen Sene Bugün"
            : selectedDateMode === "compare"
                ? "Tarih Seçimi: Karşılaştırma"
                : "Tarih Seçimi: Bugün";
    }
    dateModeOptions.forEach((option) => {
        option.classList.toggle("active", option.dataset.dateMode === selectedDateMode);
    });
    veriKaynagiArayuzunuGuncelle();
}

async function veriModunuYukle(mode, { closePopover = true } = {}) {
    const requestId = ++dateLoadSequence;
    const previousMode = selectedDateMode;
    const previousTargetDate = selectedTargetDate;
    const previousReferenceDate = selectedReferenceDate;
    selectedDateMode = ["latest", "last-year", "compare"].includes(mode) ? mode : "latest";
    selectedTargetDate = selectedDateMode === "last-year" ? previousCalendarDate : currentCalendarDate;
    tarihSeciciEtiketleriniGuncelle();
    if (dateSelectorStatus) dateSelectorStatus.textContent = "Veriler güncelleniyor…";
    dateModeOptions.forEach((option) => { option.disabled = true; });

    try {
        if (selectedDateMode === "compare") {
            const currentResult = await enGuncelVeriyiGetir();
            let previousResult = null;
            try {
                previousResult = await tarihliKayitlariGetir(previousCalendarDate);
            } catch (_error) {
                previousResult = null;
            }
            if (requestId !== dateLoadSequence) return;
            if (!previousResult) {
                selectedDateMode = previousMode;
                selectedTargetDate = previousTargetDate;
                selectedReferenceDate = previousReferenceDate;
                if (selectedDateMode === "compare") karsilastirmaSahnesiniGuncelle();
                else comparisonVisibility(false);
                tarihSeciciEtiketleriniGuncelle();
                if (dateSelectorStatus) {
                    dateSelectorStatus.textContent = `${kisaTarih(previousCalendarDate)} için beş barajın tamamına ait doğrulanmış kayıt bulunamadı; mevcut veriler korundu.`;
                }
                return;
            }

            latestDataDate = currentResult.actualDate;
            currentDataSource = currentResult.source;
            comparisonData = {
                previousTargetDate: previousCalendarDate,
                currentTargetDate: currentCalendarDate,
                previousDate: previousResult?.actualDate || null,
                currentDate: currentResult.actualDate,
                previous: kayitlariSlugMapineCevir(previousResult.records),
                current: kayitlariSlugMapineCevir(currentResult.records)
            };
            Object.entries(comparisonData.current).forEach(([slug, record]) => {
                if (barajlar[slug]) barajlar[slug].latestData = record;
            });
            selectedReferenceDate = comparisonData.currentDate;
            karsilastirmaSahnesiniGuncelle();
            tarihSeciciEtiketleriniGuncelle();
            if (dateSelectorStatus) {
                dateSelectorStatus.textContent = `Hedef ${kisaTarih(previousCalendarDate)} ↔ ${kisaTarih(currentCalendarDate)} • Kullanılan ${kisaTarih(comparisonData.previousDate)} ↔ ${kisaTarih(comparisonData.currentDate)}`;
            }
            if (isModalOpen && activeModalDamId) openDamModal(activeModalDamId);
            return;
        }

        comparisonVisibility(false);
        const result = selectedDateMode === "last-year"
            ? await tarihliKayitlariGetir(previousCalendarDate)
            : await enGuncelVeriyiGetir();

        if (requestId !== dateLoadSequence) return;
        if (!result) {
            selectedDateMode = previousMode;
            selectedTargetDate = previousTargetDate;
            selectedReferenceDate = previousReferenceDate;
            if (selectedDateMode === "compare") karsilastirmaSahnesiniGuncelle();
            else comparisonVisibility(false);
            tarihSeciciEtiketleriniGuncelle();
            if (dateSelectorStatus) {
                dateSelectorStatus.textContent = `${kisaTarih(previousCalendarDate)} ve önceki 10 gün için resmî kayıt bulunamadı; mevcut görünüm korundu.`;
            }
            return;
        }
        if (selectedDateMode === "latest") {
            latestDataDate = result.actualDate;
            currentDataSource = result.source;
        }
        selectedReferenceDate = result.actualDate;

        result.records.forEach((record) => {
            const slug = kaydinSlugunuBul(record);
            if (slug) barajVerisiniUygula(slug, record);
        });
        genelOrtalamaGuncelle();
        tarihSeciciEtiketleriniGuncelle();
        if (dateSelectorStatus) {
            dateSelectorStatus.textContent = selectedDateMode === "latest"
                ? `${currentDataSource === "live" ? "API verisi" : "Canlı API yerine kayıtlı/yedek veri"} gösteriliyor. Veri tarihi: ${kisaTarih(selectedReferenceDate)}.`
                : `Hedef: ${kisaTarih(previousCalendarDate)} • Kullanılan veri: ${kisaTarih(selectedReferenceDate)}.`;
        }

        if (isModalOpen && activeModalDamId) openDamModal(activeModalDamId);
    } catch (error) {
        // Gerçek ağ/sunucu arızalarında mevcut görünümü koru. Beklenen tarihsel
        // "veri yok" durumu yukarıda ayrıca ele alındığı için buraya düşmez.
        console.warn("Tarih bazlı veri şu anda alınamıyor; mevcut görünüm korundu.", error?.message || error);
        selectedDateMode = previousMode;
        selectedTargetDate = previousTargetDate;
        selectedReferenceDate = previousReferenceDate;
        if (selectedDateMode === "compare") karsilastirmaSahnesiniGuncelle();
        else comparisonVisibility(false);
        tarihSeciciEtiketleriniGuncelle();
        if (dateSelectorStatus) dateSelectorStatus.textContent = "Veri alınamadı; mevcut görünüm korundu.";
    } finally {
        if (requestId === dateLoadSequence) {
            dateModeOptions.forEach((option) => { option.disabled = false; });
        }
        if (closePopover) setTimeout(() => setDatePopoverOpen(false), 180);
    }
}

function setDatePopoverOpen(open) {
    if (!dateSelectorPopover || !galleryUpdateDateEl) return;
    dateSelectorPopover.classList.toggle("open", open);
    dateSelectorPopover.setAttribute("aria-hidden", String(!open));
    galleryUpdateDateEl.setAttribute("aria-expanded", String(open));
}

if (galleryUpdateDateEl) {
    galleryUpdateDateEl.addEventListener("click", (event) => {
        event.stopPropagation();
        setDatePopoverOpen(!dateSelectorPopover?.classList.contains("open"));
    });
}

dateModeOptions.forEach((option) => {
    option.addEventListener("click", () => veriModunuYukle(option.dataset.dateMode));
});

document.addEventListener("click", (event) => {
    if (!event.target.closest(".date-selector")) setDatePopoverOpen(false);
});

veriModunuYukle("latest", { closePopover: false });

// ======================================================
// 22. DETAY MODAL YÖNETİMİ
// ======================================================

const modalBackdrop = document.getElementById("dam-modal-backdrop");
const modalCloseBtn = document.getElementById("modal-close-btn");
const modalBgImage = document.getElementById("modal-bg-image");
const modalTitle = document.getElementById("modal-dam-name");
const modalLocation = document.getElementById("modal-dam-location");
const modalStatusText = document.getElementById("modal-dam-status-text");
const modalStatusDot = document.querySelector(".status-dot");
const modalStatOccupancy = document.getElementById("modal-stat-occupancy");
const modalStatCapacity = document.getElementById("modal-stat-capacity");
const modalStatVolume = document.getElementById("modal-stat-volume");
const modalStatDate = document.getElementById("modal-stat-date");
const modalDescription = document.getElementById("modal-dam-description");
const modalProgressBar = document.getElementById("modal-progress-bar");
const modalProgressPercentage = document.getElementById("modal-progress-percentage");
const modalChartPanel = document.querySelector(".modal-chart-panel");
const modalChartRange = document.getElementById("modal-chart-range");
const modalChartContainer = document.getElementById("modal-chart-container");
const modalTrendChart = document.getElementById("modal-trend-chart");
const modalChartLoading = document.getElementById("modal-chart-loading");
const modalChartTooltip = document.getElementById("modal-chart-tooltip");
const modalChartLatestValue = document.getElementById("modal-chart-latest-value");
const modalComparisonSummary = document.getElementById("modal-comparison-summary");
const modalComparePreviousDate = document.getElementById("modal-compare-previous-date");
const modalComparePreviousValue = document.getElementById("modal-compare-previous-value");
const modalCompareCurrentDate = document.getElementById("modal-compare-current-date");
const modalCompareCurrentValue = document.getElementById("modal-compare-current-value");
const modalCompareChange = document.getElementById("modal-compare-change");

let isModalOpen = false;
let activeModalDamId = null;
let trendLoadSequence = 0;
let barajKonumlariPromise = null;

function ayrintiliKonumMetni(meta) {
    const geo = meta?.geoLocation;
    if (!geo?.district || !geo?.neighborhood) return meta?.location || "";
    return `${geo.neighborhood} Mahallesi, ${geo.district}, İzmir`;
}

function modalKonumunuGuncelle(damId) {
    const meta = damMetadata[damId];
    if (!meta) return;
    const locationText = ayrintiliKonumMetni(meta);
    if (modalLocation) modalLocation.textContent = locationText;
    if (modalDescription) {
        modalDescription.textContent = meta.geoLocation
            ? `${meta.description} Konum: ${locationText}.`
            : meta.description || "";
    }
}

async function barajKonumlariniYukle() {
    if (barajKonumlariPromise) return barajKonumlariPromise;
    barajKonumlariPromise = fetch("/api/baraj-konumlari", { cache: "no-store" })
        .then((response) => {
            if (!response.ok) throw new Error(`Konum API HTTP ${response.status}`);
            return response.json();
        })
        .then((locations) => {
            Object.entries(locations || {}).forEach(([slug, location]) => {
                if (damMetadata[slug]) damMetadata[slug].geoLocation = location;
            });
            if (isModalOpen && activeModalDamId) modalKonumunuGuncelle(activeModalDamId);
            return locations;
        })
        .catch((error) => {
            console.warn("Baraj konum bilgileri alınamadı; mevcut konumlar korunuyor.", error?.message || error);
            return {};
        });
    return barajKonumlariPromise;
}

barajKonumlariniYukle();

function formatDateString(dateStr) {
    if (!dateStr) return "—";
    try {
        const dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) return String(dateStr);

        const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
        const gun = dateObj.getDate();
        const ay = aylar[dateObj.getMonth()];
        const yil = dateObj.getFullYear();
        const formattedDate = `${gun} ${ay} ${yil}`;

        const hours = dateObj.getHours();
        const minutes = dateObj.getMinutes();
        if (hours !== 0 || minutes !== 0) {
            const hh = String(hours).padStart(2, '0');
            const mm = String(minutes).padStart(2, '0');
            return `${formattedDate} • ${hh}:${mm}`;
        }
        return formattedDate;
    } catch (e) {
        return String(dateStr);
    }
}

function grafikTarihi(isoDate) {
    const date = new Date(`${isoDate}T12:00:00`);
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit" }).format(date);
}

function trendGrafiginiCiz(points, accentColor) {
    if (!modalTrendChart || !points.length) return;
    const width = 520;
    const height = 270;
    const padding = { left: 42, right: 16, top: 18, bottom: 34 };
    const values = points.map((point) => Number(point.occupancy));
    let minValue = Math.max(0, Math.floor(Math.min(...values) - 5));
    let maxValue = Math.min(100, Math.ceil(Math.max(...values) + 5));
    if (maxValue - minValue < 10) {
        const center = (maxValue + minValue) / 2;
        minValue = Math.max(0, center - 5);
        maxValue = Math.min(100, center + 5);
    }

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const xFor = (index) => padding.left + (index / Math.max(points.length - 1, 1)) * chartWidth;
    const yFor = (value) => padding.top + ((maxValue - value) / Math.max(maxValue - minValue, 1)) * chartHeight;
    const coords = points.map((point, index) => [xFor(index), yFor(Number(point.occupancy))]);
    const linePath = coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const areaPath = `${linePath} L${coords.at(-1)[0].toFixed(2)},${(padding.top + chartHeight).toFixed(2)} L${coords[0][0].toFixed(2)},${(padding.top + chartHeight).toFixed(2)} Z`;
    const gradientId = `trend-gradient-${Math.random().toString(36).slice(2)}`;

    const grid = Array.from({ length: 5 }, (_, index) => {
        const ratio = index / 4;
        const y = padding.top + ratio * chartHeight;
        const value = maxValue - ratio * (maxValue - minValue);
        return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,.09)" stroke-width="1"/><text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" fill="#8090a2" font-size="10">${value.toFixed(0)}%</text>`;
    }).join("");
    const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
    const xLabels = labelIndexes.map((index) => `<text x="${xFor(index)}" y="${height - 10}" text-anchor="middle" fill="#8090a2" font-size="10">${grafikTarihi(points[index].date)}</text>`).join("");
    const dots = coords.map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="${index === coords.length - 1 ? 4 : 2.2}" fill="${accentColor}" opacity="${index === coords.length - 1 ? 1 : 0.5}"/>`).join("");

    modalTrendChart.setAttribute("viewBox", `0 0 ${width} ${height}`);
    modalTrendChart.innerHTML = `
        <defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${accentColor}" stop-opacity=".34"/><stop offset="100%" stop-color="${accentColor}" stop-opacity="0"/></linearGradient></defs>
        ${grid}
        <path d="${areaPath}" fill="url(#${gradientId})"/>
        <path d="${linePath}" fill="none" stroke="${accentColor}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}${xLabels}`;

    if (modalChartRange) modalChartRange.textContent = `${grafikTarihi(points[0].date)} – ${grafikTarihi(points.at(-1).date)}`;
    if (modalChartLatestValue) modalChartLatestValue.textContent = `Son: %${values.at(-1).toFixed(2)}`;
    if (modalChartPanel) modalChartPanel.style.setProperty("--chart-accent", accentColor);

    modalTrendChart.onpointermove = (event) => {
        if (!modalChartTooltip || !modalChartContainer) return;
        const rect = modalTrendChart.getBoundingClientRect();
        const pointerX = ((event.clientX - rect.left) / rect.width) * width;
        const index = Math.max(0, Math.min(points.length - 1, Math.round(((pointerX - padding.left) / chartWidth) * (points.length - 1))));
        const containerRect = modalChartContainer.getBoundingClientRect();
        modalChartTooltip.textContent = `${grafikTarihi(points[index].date)} • %${Number(points[index].occupancy).toFixed(2)}`;
        modalChartTooltip.style.left = `${event.clientX - containerRect.left}px`;
        modalChartTooltip.style.top = `${event.clientY - containerRect.top}px`;
        modalChartTooltip.style.opacity = "1";
    };
    modalTrendChart.onpointerleave = () => {
        if (modalChartTooltip) modalChartTooltip.style.opacity = "0";
    };
}

const trendClientCache = new Map();

function sonOtuzGun(endDate) {
    const end = new Date(`${endDate}T12:00:00Z`);
    return Array.from({ length: 30 }, (_, index) => {
        const date = new Date(end);
        date.setUTCDate(end.getUTCDate() - (29 - index));
        return date.toISOString().slice(0, 10);
    });
}

async function tarihliKayitlariTrendIcinGetir(damId, endDate) {
    const cacheKey = `${damId}:${endDate}`;
    if (trendClientCache.has(cacheKey)) return trendClientCache.get(cacheKey);

    try {
        const trendResponse = await fetch(`/api/trend/${encodeURIComponent(damId)}?endDate=${encodeURIComponent(endDate)}`);
        if (trendResponse.ok) {
            const payload = await trendResponse.json();
            const serverPoints = (Array.isArray(payload?.points) ? payload.points : [])
                .map((point) => ({
                    date: isoGun(point.date),
                    occupancy: Number(point.occupancy),
                    volume: Number(point.volume || 0)
                }))
                .filter((point) => point.date && Number.isFinite(point.occupancy))
                .sort((a, b) => a.date.localeCompare(b.date));
            if (serverPoints.length >= 2) {
                trendClientCache.set(cacheKey, serverPoints);
                return serverPoints;
            }
        }
    } catch (_error) {
        // Eski sunucular için aşağıdaki tarih bazlı istemci akışına düş.
    }

    const dates = sonOtuzGun(endDate);
    const points = [];
    const batchSize = 6;

    for (let start = 0; start < dates.length; start += batchSize) {
        const batch = dates.slice(start, start + batchSize);
        const results = await Promise.all(batch.map(async (date) => {
            const response = await fetch(`/api/barajlar?date=${encodeURIComponent(date)}`);
            if (!response.ok) throw new Error(`Tarihsel API HTTP ${response.status}`);
            const records = await response.json();
            const record = records.find((item) => kaydinSlugunuBul(item) === damId);
            if (!record || isoGun(record.DURUM_TARIHI) !== date) return null;
            return {
                date,
                occupancy: Number(record.DOLULUK_ORANI),
                volume: Number(record.SU_DURUMU || 0)
            };
        }));
        results.forEach((point) => { if (point) points.push(point); });
    }

    if (points.length < 2) {
        throw new Error("Seçilen tarih için grafik verisi bulunamadı.");
    }
    points.sort((a, b) => a.date.localeCompare(b.date));
    trendClientCache.set(cacheKey, points);
    return points;
}

async function trendGrafiginiYukle(damId, accentColor) {
    const requestId = ++trendLoadSequence;
    if (modalChartLoading) {
        modalChartLoading.textContent = "Grafik yükleniyor…";
        modalChartLoading.classList.remove("hidden");
    }
    if (modalTrendChart) modalTrendChart.innerHTML = "";
    if (modalChartTooltip) modalChartTooltip.style.opacity = "0";

    const fallbackDate = isoGun(barajlar[damId]?.latestData?.DURUM_TARIHI);
    const endDate = selectedReferenceDate || fallbackDate;
    try {
        const points = await tarihliKayitlariTrendIcinGetir(damId, endDate);
        if (requestId !== trendLoadSequence || activeModalDamId !== damId) return;
        trendGrafiginiCiz(points, accentColor);
        if (modalChartLoading) modalChartLoading.classList.add("hidden");
    } catch (error) {
        if (requestId === trendLoadSequence && modalChartLoading) {
            modalChartLoading.textContent = "Grafik verisi şu anda alınamıyor.";
        }
    }
}

function openDamModal(damId) {
    const meta = damMetadata[damId];
    const aktifBaraj = barajlar[damId];
    if (!meta || !aktifBaraj) return;

    const data = aktifBaraj.latestData || YEDEK_VERILER[damId];
    const rawOran = String(data.DOLULUK_ORANI).replace(',', '.');
    const oran = parseFloat(rawOran) || 0;

    const guncelHacim = Number(data.SU_DURUMU) || Math.round(meta.capacityNum * (oran / 100));
    const formattedVolume = new Intl.NumberFormat('tr-TR').format(guncelHacim) + " m³";

    let statusText = "Yüksek Doluluk";
    let accentColor = "#138fe8";

    if (oran >= 70) {
        statusText = "Yüksek Doluluk";
        accentColor = "#138fe8";
    } else if (oran >= 55) {
        statusText = "Orta - İyi Seviye";
        accentColor = "#00b6c7";
    } else if (oran >= 40) {
        statusText = "Orta Seviye";
        accentColor = "#d59b00";
    } else {
        statusText = "Kritik Seviye";
        accentColor = "#c92f35";
    }

    if (modalComparisonSummary) {
        const previousRecord = comparisonData.previous[damId];
        const currentRecord = comparisonData.current[damId];
        const previousRatio = oranOku(previousRecord);
        const currentRatio = oranOku(currentRecord);
        const isComparison = selectedDateMode === "compare";
        modalComparisonSummary.hidden = !isComparison;
        if (isComparison) {
            if (modalComparePreviousDate) modalComparePreviousDate.textContent = kisaTarih(comparisonData.previousDate);
            if (modalCompareCurrentDate) modalCompareCurrentDate.textContent = kisaTarih(comparisonData.currentDate);
            if (modalComparePreviousValue && previousRatio !== null) modalComparePreviousValue.textContent = `%${previousRatio.toFixed(2)}`;
            if (modalCompareCurrentValue && currentRatio !== null) modalCompareCurrentValue.textContent = `%${currentRatio.toFixed(2)}`;
            if (modalCompareChange) {
                modalCompareChange.classList.remove("positive", "negative");
                if (previousRatio === null || currentRatio === null) {
                    modalCompareChange.textContent = "Hesaplanamadı";
                } else {
                    const change = currentRatio - previousRatio;
                    modalCompareChange.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}`;
                    modalCompareChange.classList.add(change >= 0 ? "positive" : "negative");
                }
            }
        }
    }

    modalTitle.textContent = meta.name;
    modalKonumunuGuncelle(damId);
    modalStatOccupancy.textContent = `%${oran.toFixed(2)}`;
    modalStatOccupancy.style.color = accentColor;
    modalStatCapacity.textContent = meta.capacityFormatted;
    modalStatVolume.textContent = formattedVolume;
    modalStatDate.textContent = formatDateString(data.DURUM_TARIHI);
    modalStatusText.textContent = statusText;
    if (modalStatusDot) modalStatusDot.style.backgroundColor = accentColor;

    if (modalBgImage) {
        modalBgImage.style.backgroundImage = meta.image
            ? `url("${meta.image}")`
            : "radial-gradient(circle at 78% 28%, rgba(73, 183, 232, 0.36), transparent 34%), linear-gradient(135deg, #162735 0%, #183e50 48%, #0c1720 100%)";
    }

    if (modalProgressPercentage) modalProgressPercentage.textContent = `%${oran.toFixed(2)}`;
    if (modalProgressBar) {
        modalProgressBar.style.backgroundColor = accentColor;
        modalProgressBar.style.width = "0%";
    }

    if (modalBackdrop) modalBackdrop.classList.add("active");
    isModalOpen = true;
    activeModalDamId = damId;
    controls.enabled = false;
    if (resetViewBtn) resetViewBtn.style.display = "none";
    const legendEl = document.querySelector(".occupancy-legend");
    if (legendEl) legendEl.style.display = "none";

    setTimeout(() => {
        if (modalProgressBar) modalProgressBar.style.width = `${Math.min(oran, 100)}%`;
    }, 50);
    trendGrafiginiYukle(damId, accentColor);
}

function closeDamModal() {
    if (!isModalOpen) return;
    if (modalBackdrop) modalBackdrop.classList.remove("active");
    isModalOpen = false;
    activeModalDamId = null;
    trendLoadSequence++;
    controls.enabled = true;
    if (resetViewBtn) resetViewBtn.style.display = "flex";
    const legendEl = document.querySelector(".occupancy-legend");
    if (legendEl) legendEl.style.display = "block";
}

if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeDamModal);

if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (event) => {
        if (event.target === modalBackdrop) {
            closeDamModal();
        }
    });
}

window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isModalOpen) {
        closeDamModal();
    }
});

// ======================================================
// 23. RAYCASTER İLE HOVER VE CLICK ETKİLEŞİMİ
// ======================================================

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDownX = 0;
let pointerDownY = 0;
let hoveredDamGroup = null;
const coarsePointerQuery = window.matchMedia("(hover: none), (pointer: coarse)");

function barajGrubunuBul(object) {
    let current = object;
    while (current) {
        if (current.userData.type === "dam") return current;
        current = current.parent;
    }
    return null;
}

renderer.domElement.addEventListener("pointermove", (event) => {
    if (isModalOpen || isResettingView || coarsePointerQuery.matches) return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(clickableTanks, true);

    if (intersects.length > 0) {
        const damGroup = barajGrubunuBul(intersects[0].object);
        if (damGroup) {
            renderer.domElement.style.cursor = "pointer";
            if (hoveredDamGroup !== damGroup) {
                if (hoveredDamGroup) {
                    hoveredDamGroup.userData.targetScale = hoveredDamGroup.userData.baseScale;
                    const prevRing = hoveredDamGroup.children.find(c => c.isMesh && c.geometry && c.geometry.type === "RingGeometry");
                    if (prevRing) prevRing.material.opacity = 0.45;
                    if (hoveredDamGroup.userData.percentageElement) {
                        hoveredDamGroup.userData.percentageElement.classList.remove("is-hovered");
                    }
                    hoveredDamGroup.userData.comparisonElement?.classList.remove("is-hovered");
                }
                hoveredDamGroup = damGroup;
                hoveredDamGroup.userData.targetScale = hoveredDamGroup.userData.baseScale * 1.02;
                const ring = hoveredDamGroup.children.find(c => c.isMesh && c.geometry && c.geometry.type === "RingGeometry");
                if (ring) ring.material.opacity = 0.90;
                if (hoveredDamGroup.userData.percentageElement) {
                    hoveredDamGroup.userData.percentageElement.classList.add("is-hovered");
                }
                hoveredDamGroup.userData.comparisonElement?.classList.add("is-hovered");
            }
            return;
        }
    }

    if (hoveredDamGroup) {
        hoveredDamGroup.userData.targetScale = hoveredDamGroup.userData.baseScale;
        const ring = hoveredDamGroup.children.find(c => c.isMesh && c.geometry && c.geometry.type === "RingGeometry");
        if (ring) ring.material.opacity = 0.45;
        if (hoveredDamGroup.userData.percentageElement) {
            hoveredDamGroup.userData.percentageElement.classList.remove("is-hovered");
        }
        hoveredDamGroup.userData.comparisonElement?.classList.remove("is-hovered");
        hoveredDamGroup = null;
    }
    renderer.domElement.style.cursor = "grab";
});

renderer.domElement.addEventListener("pointerdown", (event) => {
    pointerDownX = event.clientX;
    pointerDownY = event.clientY;
});

renderer.domElement.addEventListener("pointerup", (event) => {
    if (isModalOpen || isResettingView) return;

    const hareket = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
    if (hareket > 6) return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(clickableTanks, true);

    if (intersects.length > 0) {
        const damGroup = barajGrubunuBul(intersects[0].object);
        if (damGroup && damGroup.userData.damId) {
            openDamModal(damGroup.userData.damId);
        }
    }
});

// ======================================================
// 24. EKRAN BOYUTU GÜNCELLEME (RESIZE)
// ======================================================

let viewportResizeTimer = null;
let viewportResizeInProgress = false;
let lastViewportWidth = window.innerWidth;
let lastViewportHeight = window.innerHeight;

async function viewportBoyutunuUygula() {
    if (viewportResizeInProgress) return;

    const width = Math.max(1, Math.round(window.innerWidth));
    const height = Math.max(1, Math.round(window.innerHeight));
    if (width === lastViewportWidth && height === lastViewportHeight) return;

    viewportResizeInProgress = true;
    try {
        // WebGPU önceki kareyi hâlâ Queue.Submit içinde kullanırken setSize()
        // çağrılırsa Three.js eski renk dokusunu erkenden yok edebilir. Render
        // döngüsü aşağıda duraklatılır; daha önce gönderilen işler bittikten sonra
        // yeni çizim tamponu güvenle oluşturulur.
        const gpuQueue = renderer.backend?.device?.queue;
        if (gpuQueue?.onSubmittedWorkDone) {
            await gpuQueue.onSubmittedWorkDone();
        }

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        // Canvas ilk açılıştaki inline piksel boyutunda kalmamalı. Çizim
        // tamponuyla birlikte CSS boyutunu da güncelleyerek mobil/masaüstü
        // geçişlerinde sahnenin tüm viewport'u kaplamasını sağla.
        renderer.setSize(width, height, true);
        labelRenderer.setSize(width, height);
        responsiveSahneDuzeniniGuncelle();
        lastViewportWidth = width;
        lastViewportHeight = height;
    } catch (error) {
        console.warn("Ekran boyutu güvenli biçimde güncellenemedi.", error);
    } finally {
        viewportResizeInProgress = false;

        // GPU kuyruğu beklenirken ekran yeniden değiştiyse yalnızca son ölçüyü
        // uygula; ara boyutlar için render dokusu oluşturma.
        if (window.innerWidth !== lastViewportWidth || window.innerHeight !== lastViewportHeight) {
            clearTimeout(viewportResizeTimer);
            viewportResizeTimer = setTimeout(viewportBoyutunuUygula, 120);
        }
    }
}

function viewportBoyutlandirmasiniPlanla() {
    clearTimeout(viewportResizeTimer);
    viewportResizeTimer = setTimeout(viewportBoyutunuUygula, 120);
}

window.addEventListener("resize", viewportBoyutlandirmasiniPlanla, { passive: true });
window.visualViewport?.addEventListener("resize", viewportBoyutlandirmasiniPlanla, { passive: true });

// ======================================================
// 25. ANA RENDER DÖNGÜSÜ (RÜZGÂR + SENKRON RESET LERP + CLOUDS)
// ======================================================

const timer = new THREE.Timer();
timer.connect(document);

function animate(timestamp) {
    timer.update(timestamp);
    const delta = timer.getDelta();
    const elapsed = timer.getElapsed();

    // İki farklı yöndeki hareket su yüzeyini sakin tutarken rüzgârın yönünü
    // görünür kılar. Parıltılar normal dalgalarından biraz daha hızlı kayar.
    reservoirNormalTexture.offset.x = (elapsed * 0.012) % 1;
    reservoirNormalTexture.offset.y = (elapsed * 0.0065) % 1;
    reservoirGlintTexture.offset.x = (elapsed * 0.0105) % 1;
    reservoirGlintTexture.offset.y = (elapsed * 0.0042) % 1;
    reservoirGlintMaterial.opacity = 0.17 + Math.sin(elapsed * 0.72) * 0.035;
    reservoirWaterMat.roughness = 0.14 + Math.sin(elapsed * 0.42) * 0.012;
    reservoirWaterMat.clearcoatRoughness = 0.19 + Math.cos(elapsed * 0.38) * 0.018;

    for (const wave of reservoirShoreWaves) {
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * wave.speed + wave.phase);
        const outwardScale = 1 + pulse * (0.0015 + wave.opacity * 0.0024);
        wave.mesh.scale.setScalar(outwardScale);
        wave.material.opacity = wave.opacity * (0.42 + pulse * 0.58);
        wave.waveTexture.offset.x = (elapsed * 0.0045 * wave.speed + wave.phase * 0.07) % 1;
        wave.waveTexture.offset.y = (elapsed * 0.0022 * wave.speed + wave.phase * 0.05) % 1;
    }
    for (const flow of damSpillwayFlows) {
        flow.waterTexture.offset.y = (flow.waterTexture.offset.y - delta * flow.flowSpeed) % 1;
        flow.foamTexture.offset.y = (flow.foamTexture.offset.y - delta * flow.foamSpeed) % 1;
        flow.surgeTexture.offset.y = (flow.surgeTexture.offset.y - delta * flow.surgeSpeed) % 1;
        flow.highlightTexture.offset.y = (flow.highlightTexture.offset.y - delta * flow.highlightSpeed) % 1;
        flow.highlightTexture.offset.x = 0.08 + Math.sin(elapsed * 0.72 + flow.phase) * 0.035;
        flow.normalTexture.offset.y = (flow.normalTexture.offset.y - delta * 0.72) % 1;
        flow.normalTexture.offset.x = Math.sin(elapsed * 0.68 + flow.phase) * 0.055;

        // Ana perde daima yukarıdan aşağı akar; çok küçük genişlik ve opaklık
        // değişimleri yalnızca doğal yüzey basıncı/türbülansı hissi verir.
        const surfacePulse = Math.sin(elapsed * 1.55 + flow.phase);
        const fineTurbulence = Math.sin(elapsed * 3.1 + flow.phase * 1.7);
        flow.waterSheet.position.x = surfacePulse * 0.025 + fineTurbulence * 0.009;
        flow.waterSheet.scale.x = 1.0 + surfacePulse * 0.016;
        flow.depthLayer.position.x = -surfacePulse * 0.014;
        flow.depthLayer.scale.x = 1.0 - fineTurbulence * 0.008;
        flow.depthLayer.material.opacity = 0.54 + surfacePulse * 0.025;
        flow.waterBody.scale.x = 1.0 - surfacePulse * 0.009;
        flow.waterSheet.material.opacity = 0.93 + surfacePulse * 0.023 + fineTurbulence * 0.008;
        flow.foamVeins.position.x = -surfacePulse * 0.018;
        flow.foamVeins.material.opacity = 0.73 + fineTurbulence * 0.055;
        flow.flowHighlight.position.x = Math.sin(elapsed * 0.92 + flow.phase * 1.3) * 0.12;
        flow.flowHighlight.material.opacity = 0.29 + Math.abs(fineTurbulence) * 0.10;
        flow.leftEdgeFoam.scale.x = 0.94 + Math.sin(elapsed * 1.8 + flow.phase) * 0.07;
        flow.rightEdgeFoam.scale.x = 0.94 + Math.cos(elapsed * 1.72 + flow.phase) * 0.07;

        const foamPulse = Math.sin(elapsed * 2.28 + flow.phase);
        const foamRipple = Math.sin(elapsed * 3.65 + flow.phase * 1.4);
        flow.impactFoam.scale.set(1.04 + foamPulse * 0.085, 1.03 - foamPulse * 0.05, 1.0);
        flow.impactFoam.rotation.z = Math.sin(elapsed * 0.52 + flow.phase) * 0.035;
        flow.impactFoam.material.opacity = 0.86 + foamPulse * 0.075;
        flow.mixingFoam.scale.set(1.03 - foamPulse * 0.04, 1.04 + foamPulse * 0.068, 1.0);
        flow.mixingFoam.rotation.z = Math.sin(elapsed * 0.38 + flow.phase) * 0.055;
        flow.mixingFoam.material.opacity = 0.54 + foamPulse * 0.065 + foamRipple * 0.025;
        flow.impactSpray.scale.set(1.02 + foamPulse * 0.075, 1.02 + Math.abs(foamPulse) * 0.11, 1.0);
        flow.impactSpray.material.opacity = 0.57 + Math.abs(foamPulse) * 0.14;

        // 1.15 saniyelik döngü; halka büyürken hızla saydamlaşır. Faz farkı
        // dört savağın tek bir mekanik animasyon gibi görünmesini engeller.
        const ringProgress = (elapsed * 0.87 + flow.phase * 0.29) % 1;
        const ringScale = 1.0 + ringProgress * 1.85;
        flow.pulseRing.scale.set(1.35 * ringScale, 2.25 * ringScale, 1);
        flow.pulseRing.material.opacity = Math.pow(1 - ringProgress, 1.45) * 0.62;

        const splashPositions = flow.splashGeometry.attributes.position;
        for (let i = 0; i < flow.splashData.length; i++) {
            const splash = flow.splashData[i];
            splash.age += delta;
            if (splash.age >= splash.life) splash.age %= splash.life;
            const age = splash.age;
            const x = splash.startX + splash.velocityX * age;
            const y = -0.96 + splash.velocityY * age - 2.35 * age * age;
            const z = splash.startZ + splash.velocityZ * age;
            splashPositions.setXYZ(i, x, Math.max(-1.04, y), z);
        }
        splashPositions.needsUpdate = true;
    }

    // Etiketlerin Kamera Uzaklığına Göre Akıllı Ölçeklenmesi (Çakışmayı Önler)
    const camDist = camera.position.distanceTo(controls.target);
    const labelScale = THREE.MathUtils.clamp(1.12 - (camDist - 25) * 0.0075, 0.78, 1.05);
    if (labelRenderer && labelRenderer.domElement) {
        labelRenderer.domElement.style.setProperty("--label-scale", labelScale.toFixed(3));
    }

    // Legacy waterfall animation is permanently disabled; its objects are disposed above.
    if (false) {
        // Dağ Deresi & Şelale Aşağı Doğru Akış Animasyonu (YUKARIDAN AŞAĞIYA DOĞRU)
        waterfallTexDeep.offset.y -= delta * 0.9;
        waterfallTexMid.offset.y -= delta * 1.3;
        waterfallTexFoam.offset.y -= delta * 1.8;

        // Şelale Dibi Çarpma Köpüğü Nabız Hareketi
        foamMesh.scale.set(
            1.0 + Math.sin(elapsed * 2.4) * 0.06,
            1.0 + Math.cos(elapsed * 2.0) * 0.06,
            1.0
        );

        // Gölet Üzerinde Genişleyen Su Halkaları Animasyonu (Ripple Rings)
        for (let i = 0; i < rippleMeshes.length; i++) {
            const r = rippleMeshes[i];
            r.phase += delta * 0.45;
            if (r.phase > 1.0) r.phase -= 1.0;
            const currentScale = 1.0 + r.phase * 5.0;
            r.mesh.scale.set(currentScale, 1.0, currentScale * 0.75);
            r.mat.opacity = Math.sin(r.phase * Math.PI) * 0.40;
        }

        // Su Damlacıkları Sıçrama Animasyonu (Splash Particles)
        const splashPosAttr = splashGeom.attributes.position;
        for (let i = 0; i < SPLASH_COUNT; i++) {
            const sp = splashData[i];
            sp.age += delta;
            if (sp.age >= sp.lifetime) {
                sp.age = 0;
                sp.startX = splashOriginX + (Math.random() - 0.5) * 2.2;
                sp.startY = splashOriginY;
                sp.startZ = splashOriginZ + (Math.random() - 0.5) * 1.5;
                sp.vx = (Math.random() - 0.5) * 3.2;
                sp.vy = 2.2 + Math.random() * 2.6;
                sp.vz = (Math.random() - 0.5) * 2.6 + 0.4;
            }

            const curX = sp.startX + sp.vx * sp.age;
            const curY = sp.startY + sp.vy * sp.age - 0.5 * 9.8 * sp.age * sp.age;
            const curZ = sp.startZ + sp.vz * sp.age;

            splashPosAttr.setXYZ(i, curX, Math.max(curY, splashOriginY), curZ);
        }
        splashPosAttr.needsUpdate = true;

        // Şelale Dibi Yoğun Lokal Mist / Spray Partikül Animasyonu (Lokal Sis & Su Damlacıkları)
        const mistPosAttr = mistGeom.attributes.position;
        for (let i = 0; i < MIST_COUNT; i++) {
            const p = mistData[i];
            p.age += delta;
            if (p.age >= p.lifetime) {
                p.age = 0;
                p.startX = mistOriginX + (Math.random() - 0.5) * 3.6;
                p.startY = mistOriginY;
                p.startZ = mistOriginZ + (Math.random() - 0.5) * 2.2;
                p.vx = (Math.random() - 0.5) * 2.4;
                p.vy = 1.2 + Math.random() * 2.0;
                p.vz = (Math.random() - 0.5) * 2.0 + 0.4;
            }

            const curX = p.startX + p.vx * p.age;
            const curY = p.startY + p.vy * p.age - 0.28 * (p.age * p.age);
            const curZ = p.startZ + p.vz * p.age;

            mistPosAttr.setXYZ(i, curX, Math.max(curY, mistOriginY), curZ);
        }
        mistPosAttr.needsUpdate = true;
    }

    // Mera Hayvanları (Otlayan Koyunlar & İnekler)
    for (let i = 0; i < animatedCreatures.length; i++) {
        const creature = animatedCreatures[i];
        const u = creature.userData;

        // Otlama / Baş Hareketi
        const headAngle = Math.sin(elapsed * u.grazeSpeed + u.grazePhase) * 0.35 + 0.25;
        if (u.headGroup) {
            u.headGroup.rotation.x = headAngle;
        }

        // Yavaş Doğal Gezinme (Wander)
        u.wanderTimer -= delta;
        if (u.wanderTimer <= 0) {
            u.wanderTimer = 6.0 + Math.random() * 8.0;
            const wanderRadius = u.type === "sheep" ? 3.5 : 4.5;
            u.targetX = THREE.MathUtils.clamp(u.baseX + (Math.random() - 0.5) * wanderRadius, PASTURE_BOUNDS.minX, PASTURE_BOUNDS.maxX);
            u.targetZ = THREE.MathUtils.clamp(u.baseZ + (Math.random() - 0.5) * wanderRadius, PASTURE_BOUNDS.minZ, PASTURE_BOUNDS.maxZ);
        }

        const dx = u.targetX - creature.position.x;
        const dz = u.targetZ - creature.position.z;
        const distToTarget = Math.hypot(dx, dz);

        if (distToTarget > 0.08) {
            const moveStep = Math.min(u.speed * delta, distToTarget);
            creature.position.x += (dx / distToTarget) * moveStep;
            creature.position.z += (dz / distToTarget) * moveStep;

            const targetAngle = Math.atan2(dx, dz);
            creature.rotation.y = THREE.MathUtils.lerp(creature.rotation.y, targetAngle, 0.05);
        }

        // Zemin Yüksekliğini Anlık Güncelle (Terrain'e Tam Oturtur, Asla Gömülmez)
        creature.position.y = getMountainHeight(creature.position.x, creature.position.z);
    }

    // 2. Bulutların Atmosferik Hareketi
    cloudClusters.forEach(cloud => {
        cloud.position.addScaledVector(cloud.userData.velocity, delta);

        if (cloud.position.x > 620) {
            cloud.position.x = -620;
            cloud.position.z = cloud.userData.initialZ + (Math.random() - 0.5) * 80;
            cloud.position.y = cloud.userData.initialY + (Math.random() - 0.5) * 4;
        }

        cloud.position.y = cloud.userData.initialY + Math.sin(elapsed * 0.4 + cloud.userData.bobPhase) * 0.35;
    });

    // 3. Asenkron Çalı Rüzgâr Sway Hareketi (Multi-Axis X & Z)
    for (let i = 0; i < animatedShrubs.length; i++) {
        const shrub = animatedShrubs[i];
        const u = shrub.userData;
        const swayX = Math.sin(elapsed * u.windSpeed + u.windPhase) * u.windAmpX;
        const swayZ = Math.cos(elapsed * (u.windSpeed * 0.82) + u.windPhase) * u.windAmpZ;
        shrub.rotation.x = swayX;
        shrub.rotation.z = swayZ;
    }

    // 4. Ağaç Yaprak/Kron (Canopy) Rüzgâr Hareketi (Gövde Sabit)
    for (let i = 0; i < animatedTrees.length; i++) {
        const tree = animatedTrees[i];
        const u = tree.userData;

        if (u.canopy1) {
            u.canopy1.rotation.z = Math.sin(elapsed * u.windSpeed + u.windPhase) * u.windAmplitude;
            u.canopy1.rotation.x = Math.cos(elapsed * (u.windSpeed * 0.9) + u.windPhase) * (u.windAmplitude * 0.5);
        }
        if (u.canopy2) {
            u.canopy2.rotation.z = Math.sin(elapsed * (u.windSpeed * 1.08) + u.windPhase + 0.4) * (u.windAmplitude * 1.25);
            u.canopy2.rotation.x = Math.cos(elapsed * (u.windSpeed * 0.95) + u.windPhase + 0.3) * (u.windAmplitude * 0.6);
        }
    }

    // 5. Tank Hover Ölçek Yumuşatması
    for (let i = 0; i < clickableTanks.length; i++) {
        const group = clickableTanks[i];
        if (Math.abs(group.userData.currentScale - group.userData.targetScale) > 0.001) {
            group.userData.currentScale = THREE.MathUtils.lerp(
                group.userData.currentScale,
                group.userData.targetScale,
                0.15
            );
            group.scale.setScalar(group.userData.currentScale);
        }
    }

    // 6. Görünümü Sıfırla (Zaman Parametreli, Tek ve Senkron Eased Lerp)
    if (isResettingView) {
        const elapsedReset = performance.now() - resetStartTime;
        const t = Math.min(elapsedReset / RESET_DURATION, 1.0);
        const easedT = easeInOutCubic(t);

        camera.position.lerpVectors(resetStartPosition, DEFAULT_CAMERA_POS, easedT);
        controls.target.lerpVectors(resetStartTarget, DEFAULT_CONTROLS_TARGET, easedT);
        camera.lookAt(controls.target);

        if (t >= 1.0) {
            camera.position.copy(DEFAULT_CAMERA_POS);
            controls.target.copy(DEFAULT_CONTROLS_TARGET);
            camera.lookAt(DEFAULT_CONTROLS_TARGET);
            controls.update();

            isResettingView = false;
            controls.enabled = true;
        }
    } else if (!isModalOpen) {
        controls.update();
    }

    karsilastirmaEtiketYonunuGuncelle();

    // 7. Render
    if (!viewportResizeInProgress) {
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
    }
}

renderer.setAnimationLoop(animate);
