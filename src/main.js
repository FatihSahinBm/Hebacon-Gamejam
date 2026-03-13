import './style.css';
import * as THREE from 'three';

// 1. Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue
scene.fog = new THREE.Fog(0x87ceeb, 20, 100);

// 2. Camera setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// 3. Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.querySelector('#app').appendChild(renderer.domElement);

// Third Person Camera State & Pointer Lock
let cameraYaw = 0;
let cameraPitch = 0.2;
const cameraDistance = 12;

const instructions = document.createElement('div');
instructions.style.position = 'absolute';
instructions.style.top = '50%';
instructions.style.width = '100%';
instructions.style.textAlign = 'center';
instructions.style.color = 'white';
instructions.style.backgroundColor = 'rgba(0,0,0,0.5)';
instructions.style.padding = '20px';
instructions.style.cursor = 'pointer';
instructions.style.fontFamily = 'sans-serif';
instructions.innerHTML = 'Click to Start<br/>(W, A, S, D = Move, Mouse = Look)';
document.body.appendChild(instructions);

instructions.addEventListener('click', () => {
  document.body.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === document.body) {
    instructions.style.display = 'none';
  } else {
    instructions.style.display = 'block';
  }
});

document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement === document.body) {
    cameraYaw -= event.movementX * 0.003;
    cameraPitch -= event.movementY * 0.003;
    // Sınırlandırma (Yerin altına veya karakterin tam tepesine çıkmayı engelle)
    cameraPitch = Math.max(-0.1, Math.min(Math.PI / 2.5, cameraPitch));
  }
});

// 4. Lighting (Improved)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

// Hemisphere light for realistic sky/ground color blending
const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x4a7c59, 0.6);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff4e6, 1.4);
dirLight.position.set(50, 80, 30);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 4096;
dirLight.shadow.mapSize.height = 4096;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 250;
const d = 80;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
dirLight.shadow.bias = -0.001;
scene.add(dirLight);

// Fill light from opposite side
const fillLight = new THREE.DirectionalLight(0x8ec4e8, 0.4);
fillLight.position.set(-40, 50, -30);
scene.add(fillLight);

// 5. Open World Map (Hilly ground with procedural textures)

// --- Procedural texture helper ---
function makeCanvasTexture(w, h, drawFn, repeatX, repeatY) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  drawFn(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

// Grass Color texture
const grassTexture = makeCanvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#3d6b45';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 20000; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const g = 50 + Math.floor(Math.random() * 70);
    ctx.fillStyle = `rgb(${25 + Math.floor(Math.random() * 35)},${g},${15 + Math.floor(Math.random() * 25)})`;
    ctx.fillRect(x, y, Math.random() * 3 + 0.5, Math.random() * 3 + 0.5);
  }
  // Grass blade lines
  ctx.strokeStyle = 'rgba(30, 80, 30, 0.3)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 3, y - Math.random() * 6);
    ctx.stroke();
  }
  // Dirt patches
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(90, 60, 30, ${Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 10 + 2, Math.random() * 10 + 2);
  }
}, 25, 25);

// Grass bump/normal-like texture (stores as a bumpMap)
const grassBump = makeCanvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 8000; i++) {
    const v = 100 + Math.floor(Math.random() * 56);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 2 + 0.5, Math.random() * 4 + 1);
  }
}, 25, 25);

// --- Terrain heightmap function (subtle undulation) ---
const TERRAIN_SIZE = 200;
const TERRAIN_SEGMENTS = 80;

function terrainHeight(x, z) {
  // Very subtle rolling — just enough to look natural, not enough to break gameplay
  return (
    Math.sin(x * 0.04) * Math.cos(z * 0.05) * 0.3 +
    Math.sin(x * 0.08 + 1.3) * Math.cos(z * 0.06 + 0.8) * 0.15 +
    Math.cos(x * 0.03 + z * 0.03) * 0.1
  );
}

// Create hilly ground
const groundGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
groundGeo.rotateX(-Math.PI / 2);

// Displace vertices
const pos = groundGeo.attributes.position;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  const z = pos.getZ(i);
  // Flatten near center (spawn area)
  const distFromCenter = Math.sqrt(x * x + z * z);
  const flattenFactor = Math.min(1, Math.max(0, (distFromCenter - 15) / 20));
  pos.setY(i, terrainHeight(x, z) * flattenFactor);
}
groundGeo.computeVertexNormals(); // Recalculate normals for lighting

const groundMat = new THREE.MeshStandardMaterial({
  map: grassTexture,
  bumpMap: grassBump,
  bumpScale: 0.3,
  roughness: 0.95,
  metalness: 0.0
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
scene.add(ground);

// Path / dirt road through center
const pathGeo = new THREE.PlaneGeometry(4, 80);
const pathMat = new THREE.MeshStandardMaterial({ color: 0x7a6040, roughness: 1.0 });
const path1 = new THREE.Mesh(pathGeo, pathMat);
path1.rotation.x = -Math.PI / 2;
path1.position.set(0, 0.15, 0);
path1.receiveShadow = true;
scene.add(path1);
const path2 = new THREE.Mesh(pathGeo, pathMat);
path2.rotation.x = -Math.PI / 2;
path2.rotation.z = Math.PI / 2;
path2.position.set(0, 0.15, 0);
path2.receiveShadow = true;
scene.add(path2);

// 6. Map Design — Open world with hiding spots
const obstacles = [];

// Materials (Upgraded with procedural textures)
const brickTex = makeCanvasTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#8a4a2a';
  ctx.fillRect(0, 0, w, h);
  for (let row = 0; row < 8; row++) {
    const offset = row % 2 === 0 ? 0 : w / 8;
    for (let col = 0; col < 5; col++) {
      const bx = col * (w / 4) + offset;
      const by = row * (h / 8);
      const r = 120 + Math.floor(Math.random() * 50);
      const g = 55 + Math.floor(Math.random() * 30);
      ctx.fillStyle = `rgb(${r},${g},${Math.floor(g * 0.6)})`;
      ctx.fillRect(bx + 1, by + 1, w / 4 - 2, h / 8 - 2);
    }
  }
}, 2, 2);
const brickMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9 });

const stoneTex = makeCanvasTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#707070';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2000; i++) {
    const v = 90 + Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 4 + 1, Math.random() * 4 + 1);
  }
}, 2, 2);
const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.75 });

const woodTex = makeCanvasTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) {
    const y = Math.random() * h;
    ctx.strokeStyle = `rgba(${40 + Math.floor(Math.random() * 30)}, ${25 + Math.floor(Math.random() * 15)}, 10, 0.4)`;
    ctx.lineWidth = Math.random() * 2 + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + (Math.random() - 0.5) * 5); ctx.stroke();
  }
}, 2, 2);
const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 1.0 });

const darkGreenMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 0.8 });
const crateMat = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xccaa55, roughness: 0.7 });
const concreteMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0xbbbbbb, roughness: 0.5 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x8B0000, roughness: 0.7 });
const waterMat = new THREE.MeshStandardMaterial({ color: 0x2277cc, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.7 });
const bushMat = new THREE.MeshStandardMaterial({ color: 0x2a6e1a, roughness: 0.9 });
const bushDarkMat = new THREE.MeshStandardMaterial({ color: 0x1d4e10, roughness: 0.95 });

function addObs(geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  obstacles.push(mesh);
  return mesh;
}

// Decorative only (no collision)
function addDeco(geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// ========== A) LARGE HOUSE (4 walls with door gaps) ==========
// House at (40, 0, 40), size 16x8x12
const houseWallThick = 1;
// Back wall (full)
addObs(new THREE.BoxGeometry(16, 8, houseWallThick), brickMat, 40, 4, 46);
// Front wall left part
addObs(new THREE.BoxGeometry(5, 8, houseWallThick), brickMat, 35.5, 4, 34);
// Front wall right part (door gap in middle)
addObs(new THREE.BoxGeometry(5, 8, houseWallThick), brickMat, 44.5, 4, 34);
// Left wall
addObs(new THREE.BoxGeometry(houseWallThick, 8, 12), brickMat, 32, 4, 40);
// Right wall with window gap
addObs(new THREE.BoxGeometry(houseWallThick, 8, 4), brickMat, 48, 4, 36);
addObs(new THREE.BoxGeometry(houseWallThick, 8, 4), brickMat, 48, 4, 44);
// Roof
addDeco(new THREE.BoxGeometry(18, 0.5, 14), roofMat, 40, 8.25, 40);
// Interior table
addObs(new THREE.BoxGeometry(4, 1, 2), woodMat, 40, 0.5, 40);

// ========== B) SMALL SHED ==========
// Shed at (-40, 0, -40)
addObs(new THREE.BoxGeometry(8, 5, 1), woodMat, -40, 2.5, -44);
addObs(new THREE.BoxGeometry(8, 5, 1), woodMat, -40, 2.5, -36);
addObs(new THREE.BoxGeometry(1, 5, 8), woodMat, -44, 2.5, -40);
// Right wall with door gap
addObs(new THREE.BoxGeometry(1, 5, 2.5), woodMat, -36, 2.5, -42.75);
addObs(new THREE.BoxGeometry(1, 5, 2.5), woodMat, -36, 2.5, -37.25);
addDeco(new THREE.BoxGeometry(10, 0.3, 10), roofMat, -40, 5.15, -40);

// ========== C) BRIDGE OVER RIVER ==========
// River (decorative blue strip)
const riverGeo = new THREE.PlaneGeometry(8, 100);
const river = new THREE.Mesh(riverGeo, waterMat);
river.rotation.x = -Math.PI / 2;
river.position.set(-15, 0.05, 0);
scene.add(river);

// River banks (collision walls so you can't just walk through water)
addObs(new THREE.BoxGeometry(1, 1, 100), stoneMat, -11, 0.5, 0); // east bank
addObs(new THREE.BoxGeometry(1, 1, 100), stoneMat, -19, 0.5, 0); // west bank

// Bridge deck
addDeco(new THREE.BoxGeometry(10, 0.5, 6), woodMat, -15, 1.2, 0);
// Bridge railings
addObs(new THREE.BoxGeometry(0.3, 2, 6), woodMat, -10.2, 1.5, 0);
addObs(new THREE.BoxGeometry(0.3, 2, 6), woodMat, -19.8, 1.5, 0);
// Open the bank walls where bridge is
// (We'll manage this by splitting the bank walls - actually simpler to leave banks lower and bridge higher)

// ========== D) HIDING TUNNELS (Low walls you can hide behind) ==========
// Tunnel 1 at (20, 0, -30): Two parallel walls
addObs(new THREE.BoxGeometry(1, 3, 10), concreteMat, 18, 1.5, -30);
addObs(new THREE.BoxGeometry(1, 3, 10), concreteMat, 22, 1.5, -30);
addDeco(new THREE.BoxGeometry(5, 0.5, 10), concreteMat, 20, 3.25, -30); // roof

// Tunnel 2 at (-50, 0, 20)
addObs(new THREE.BoxGeometry(10, 3, 1), concreteMat, -50, 1.5, 18);
addObs(new THREE.BoxGeometry(10, 3, 1), concreteMat, -50, 1.5, 22);
addDeco(new THREE.BoxGeometry(10, 0.5, 5), concreteMat, -50, 3.25, 20);

// ========== E) WALLS & CORRIDORS (All axis-aligned) ==========
addObs(new THREE.BoxGeometry(20, 5, 1.5), concreteMat, 0, 2.5, 20);
addObs(new THREE.BoxGeometry(1.5, 5, 18), concreteMat, 25, 2.5, -10);
addObs(new THREE.BoxGeometry(12, 4, 1.5), concreteMat, -30, 2, 5);
addObs(new THREE.BoxGeometry(1.5, 4, 12), concreteMat, -60, 2, -20);
addObs(new THREE.BoxGeometry(15, 3, 1.5), concreteMat, 60, 1.5, -45);
addObs(new THREE.BoxGeometry(1.5, 4, 10), concreteMat, 70, 2, 15);

// L-shaped walls (all axis-aligned)
addObs(new THREE.BoxGeometry(10, 4, 1.5), stoneMat, 10, 2, 55);
addObs(new THREE.BoxGeometry(1.5, 4, 8), stoneMat, 15, 2, 59);

addObs(new THREE.BoxGeometry(10, 4, 1.5), stoneMat, -55, 2, 45);
addObs(new THREE.BoxGeometry(1.5, 4, 8), stoneMat, -50, 2, 49);

// ========== F) TREES ==========
const trunkGeo = new THREE.CylinderGeometry(0.4, 0.5, 4, 8);
const canopyGeo = new THREE.SphereGeometry(2.5, 8, 6);

function addTree(x, z) {
  addObs(trunkGeo, woodMat, x, 2, z);
  addDeco(canopyGeo, darkGreenMat, x, 5.5, z);
}

const treePositions = [
  [55, 15], [58, 18], [53, 12],
  [-65, -10], [-62, -8], [-67, -13],
  [35, -55], [38, -52], [33, -58],
  [-45, 55], [-42, 58],
  [75, -5], [72, -8],
  [-80, 30], [-78, 33],
  [10, -80], [13, -77], [8, -82],
  [-30, 70], [-27, 73],
  [80, 40], [83, 43],
];
treePositions.forEach(([x, z]) => addTree(x, z));

// ========== G) CRATES & BARRELS ==========
const crateGeo = new THREE.BoxGeometry(2, 2, 2);
const barrelGeo = new THREE.CylinderGeometry(0.8, 0.8, 2, 10);

[[5, 1, -5], [25, 1, 5], [-8, 1, 15], [45, 1, 15],
 [-30, 1, 50], [60, 1, 30], [-50, 1, 10],
 [0, 1, -50], [20, 1, -65], [-40, 1, -55], [70, 1, -30]
].forEach(([x, y, z]) => addObs(crateGeo, crateMat, x, y, z));

[[7, 1, -3], [28, 1, 8], [-12, 1, -22], [42, 1, 18],
 [-48, 1, 12], [62, 1, 32], [22, 1, -52]
].forEach(([x, y, z]) => addObs(barrelGeo, stoneMat, x, y, z));

// ========== H) CENTRAL PLAZA ==========
const fountainBase = new THREE.CylinderGeometry(4, 4, 1, 16);
const fountainPillar = new THREE.CylinderGeometry(0.8, 1, 3, 8);
addObs(fountainBase, concreteMat, 0, 0.5, 0);
addObs(fountainPillar, stoneMat, 0, 2, 0);

// ========== I) SCATTERED ROCKS ==========
const rockGeo = new THREE.DodecahedronGeometry(1.5, 0);
[[15, 1, 25], [-25, 1, -10], [45, 1, -15], [-55, 1, 35],
 [80, 1, 10], [-75, 1, -30], [30, 1, 70], [-30, 1, -75],
 [65, 1, -60], [-85, 1, 5]
].forEach(([x, y, z]) => addObs(rockGeo, stoneMat, x, y, z));

// ========== J) BIG RUINS (open spaces to hide in) ==========
// Ruins at (70, 0, -60)
addObs(new THREE.BoxGeometry(12, 6, 1), stoneMat, 70, 3, -66);
addObs(new THREE.BoxGeometry(1, 6, 12), stoneMat, 64, 3, -60);
addObs(new THREE.BoxGeometry(5, 6, 1), stoneMat, 73.5, 3, -54);
// Broken pillar
addObs(new THREE.CylinderGeometry(1, 1.2, 4, 8), stoneMat, 68, 2, -57);

// ========== ZEUGMA MÜZESİ (Gaziantep) ==========
// Museum center at (-65, 0, 55), size ~30x30
const museumX = -65, museumZ = 55;
const marbleMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.3, metalness: 0.1 });
const mosaicMat = new THREE.MeshStandardMaterial({ color: 0xc4956a, roughness: 0.4 });
const columnMat = new THREE.MeshStandardMaterial({ color: 0xddd5c0, roughness: 0.35, metalness: 0.05 });
const pedestalMat = new THREE.MeshStandardMaterial({ color: 0xb8a88a, roughness: 0.5 });

// --- Mosaic Floor ---
const mosaicCanvas = document.createElement('canvas');
mosaicCanvas.width = 256; mosaicCanvas.height = 256;
const mctx = mosaicCanvas.getContext('2d');
mctx.fillStyle = '#c4956a';
mctx.fillRect(0, 0, 256, 256);
// Mosaic tile pattern
const mColors = ['#b8860b', '#8b6914', '#d4a96a', '#a0522d', '#cd853f', '#deb887', '#c19a6b'];
for (let row = 0; row < 16; row++) {
  for (let col = 0; col < 16; col++) {
    mctx.fillStyle = mColors[Math.floor(Math.random() * mColors.length)];
    mctx.fillRect(col * 16 + 1, row * 16 + 1, 14, 14);
  }
}
// Central medallion circle
mctx.fillStyle = '#8b4513';
mctx.beginPath(); mctx.arc(128, 128, 50, 0, Math.PI * 2); mctx.fill();
mctx.fillStyle = '#d4a96a';
mctx.beginPath(); mctx.arc(128, 128, 35, 0, Math.PI * 2); mctx.fill();
mctx.fillStyle = '#cd853f';
mctx.beginPath(); mctx.arc(128, 128, 20, 0, Math.PI * 2); mctx.fill();

const mosaicTex = new THREE.CanvasTexture(mosaicCanvas);
mosaicTex.wrapS = THREE.RepeatWrapping;
mosaicTex.wrapT = THREE.RepeatWrapping;
mosaicTex.repeat.set(3, 3);

const museumFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ map: mosaicTex, roughness: 0.4 })
);
museumFloor.rotation.x = -Math.PI / 2;
museumFloor.position.set(museumX, 0.05, museumZ);
museumFloor.receiveShadow = true;
scene.add(museumFloor);

// --- Outer Walls (with door gaps) ---
// North wall (full)
addObs(new THREE.BoxGeometry(32, 8, 1), marbleMat, museumX, 4, museumZ + 15);
// South wall (two parts with central door)
addObs(new THREE.BoxGeometry(12, 8, 1), marbleMat, museumX - 10, 4, museumZ - 15);
addObs(new THREE.BoxGeometry(12, 8, 1), marbleMat, museumX + 10, 4, museumZ - 15);
// West wall (with side door)
addObs(new THREE.BoxGeometry(1, 8, 10), marbleMat, museumX - 15, 4, museumZ + 10);
addObs(new THREE.BoxGeometry(1, 8, 10), marbleMat, museumX - 15, 4, museumZ - 10);
// East wall (with side door)
addObs(new THREE.BoxGeometry(1, 8, 12), marbleMat, museumX + 15, 4, museumZ + 9);
addObs(new THREE.BoxGeometry(1, 8, 10), marbleMat, museumX + 15, 4, museumZ - 10);

// --- Interior Divider Walls (create rooms) ---
// Horizontal divider (creates north/south rooms, with passage)
addObs(new THREE.BoxGeometry(10, 6, 0.8), marbleMat, museumX - 7, 3, museumZ);
addObs(new THREE.BoxGeometry(10, 6, 0.8), marbleMat, museumX + 7, 3, museumZ);
// Vertical divider in north room
addObs(new THREE.BoxGeometry(0.8, 6, 8), marbleMat, museumX - 5, 3, museumZ + 10);

// --- Roman Columns (Antik sütunlar) ---
const columnGeo = new THREE.CylinderGeometry(0.5, 0.6, 7, 12);
const columnCapGeo = new THREE.CylinderGeometry(0.8, 0.5, 0.5, 12);
const columnBaseGeo = new THREE.CylinderGeometry(0.7, 0.8, 0.4, 12);

function addColumn(cx, cz) {
  addObs(columnGeo, columnMat, cx, 3.5, cz);
  addDeco(columnCapGeo, columnMat, cx, 7.25, cz);
  addDeco(columnBaseGeo, columnMat, cx, 0.2, cz);
}

// Column row at entrance
addColumn(museumX - 5, museumZ - 14);
addColumn(museumX + 5, museumZ - 14);
// Interior columns
addColumn(museumX - 8, museumZ + 5);
addColumn(museumX + 8, museumZ + 5);
addColumn(museumX - 8, museumZ - 5);
addColumn(museumX + 8, museumZ - 5);
// Back columns
addColumn(museumX - 10, museumZ + 12);
addColumn(museumX + 10, museumZ + 12);

// --- Display Pedestals with "artifacts" ---
const pedestalGeo = new THREE.BoxGeometry(1.5, 2, 1.5);

function addPedestal(px, pz) {
  addObs(pedestalGeo, pedestalMat, px, 1, pz);
  // Small artifact on top (varied shapes)
  const artType = Math.random();
  if (artType < 0.33) {
    // Vase
    addDeco(new THREE.CylinderGeometry(0.2, 0.35, 1.2, 8), mosaicMat, px, 2.6, pz);
  } else if (artType < 0.66) {
    // Small bust/sphere
    addDeco(new THREE.SphereGeometry(0.4, 8, 6), columnMat, px, 2.4, pz);
  } else {
    // Stone tablet
    addDeco(new THREE.BoxGeometry(0.8, 1, 0.2), stoneMat, px, 2.5, pz);
  }
}

// Pedestals in different rooms
addPedestal(museumX - 10, museumZ + 8);
addPedestal(museumX + 3, museumZ + 10);
addPedestal(museumX + 10, museumZ + 8);
addPedestal(museumX - 3, museumZ - 8);
addPedestal(museumX + 3, museumZ - 8);
addPedestal(museumX - 10, museumZ - 5);
addPedestal(museumX + 10, museumZ - 5);

// --- Roof ---
addDeco(new THREE.BoxGeometry(34, 0.5, 32), marbleMat, museumX, 8.25, museumZ);

// --- Museum Sign (above south entrance) ---
const signCanvas = document.createElement('canvas');
signCanvas.width = 512; signCanvas.height = 128;
const sctx = signCanvas.getContext('2d');
// Background
sctx.fillStyle = '#1a1a2e';
sctx.fillRect(0, 0, 512, 128);
// Gold border
sctx.strokeStyle = '#c9a84c';
sctx.lineWidth = 6;
sctx.strokeRect(8, 8, 496, 112);
sctx.strokeRect(14, 14, 484, 100);
// Title text
sctx.fillStyle = '#c9a84c';
sctx.font = 'bold 42px serif';
sctx.textAlign = 'center';
sctx.fillText('ZEUGMA', 256, 55);
sctx.font = 'bold 30px serif';
sctx.fillText('M \u00dc Z E S \u0130', 256, 95);
const signTex = new THREE.CanvasTexture(signCanvas);

const signMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 3.5),
  new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.3, side: THREE.DoubleSide })
);
signMesh.position.set(museumX, 7, museumZ - 18);
signMesh.rotation.y = Math.PI;
scene.add(signMesh);

// --- "Çingene Kızı" mosaic portrait (back wall) ---
const gkCanvas = document.createElement('canvas');
gkCanvas.width = 256; gkCanvas.height = 256;
const gkctx = gkCanvas.getContext('2d');

// Mosaic background tiles
gkctx.fillStyle = '#b8860b';
gkctx.fillRect(0, 0, 256, 256);
const tileColors = ['#a0522d', '#cd853f', '#b8860b', '#deb887', '#8b6914'];
for (let ty = 0; ty < 32; ty++) {
  for (let tx = 0; tx < 32; tx++) {
    gkctx.fillStyle = tileColors[Math.floor(Math.random() * tileColors.length)];
    gkctx.fillRect(tx * 8 + 0.5, ty * 8 + 0.5, 7, 7);
  }
}

// Face oval
gkctx.fillStyle = '#deb887';
gkctx.beginPath(); gkctx.ellipse(128, 110, 48, 58, 0, 0, Math.PI * 2); gkctx.fill();
// Face shadow
gkctx.fillStyle = '#c4956a';
gkctx.beginPath(); gkctx.ellipse(128, 115, 44, 54, 0, 0, Math.PI * 2); gkctx.fill();
// Skin tone
gkctx.fillStyle = '#d4a96a';
gkctx.beginPath(); gkctx.ellipse(128, 108, 42, 52, 0, 0, Math.PI * 2); gkctx.fill();

// Hair (dark brown flowing)
gkctx.fillStyle = '#3a1f0a';
gkctx.beginPath(); gkctx.ellipse(128, 75, 55, 45, 0, 0, Math.PI * 2); gkctx.fill();
gkctx.beginPath(); gkctx.ellipse(90, 100, 20, 40, -0.3, 0, Math.PI * 2); gkctx.fill();
gkctx.beginPath(); gkctx.ellipse(166, 100, 20, 40, 0.3, 0, Math.PI * 2); gkctx.fill();

// Face skin again (on top of hair edges)
gkctx.fillStyle = '#d4a96a';
gkctx.beginPath(); gkctx.ellipse(128, 108, 38, 46, 0, 0, Math.PI * 2); gkctx.fill();

// Eyes
gkctx.fillStyle = '#ffffff';
gkctx.beginPath(); gkctx.ellipse(110, 102, 10, 7, 0, 0, Math.PI * 2); gkctx.fill();
gkctx.beginPath(); gkctx.ellipse(146, 102, 10, 7, 0, 0, Math.PI * 2); gkctx.fill();
// Irises (the famous deep green-brown eyes)
gkctx.fillStyle = '#2d5a1e';
gkctx.beginPath(); gkctx.arc(111, 102, 6, 0, Math.PI * 2); gkctx.fill();
gkctx.beginPath(); gkctx.arc(147, 102, 6, 0, Math.PI * 2); gkctx.fill();
// Pupils
gkctx.fillStyle = '#0a0a0a';
gkctx.beginPath(); gkctx.arc(111, 102, 3, 0, Math.PI * 2); gkctx.fill();
gkctx.beginPath(); gkctx.arc(147, 102, 3, 0, Math.PI * 2); gkctx.fill();
// Eye highlights
gkctx.fillStyle = '#ffffff';
gkctx.beginPath(); gkctx.arc(113, 100, 1.5, 0, Math.PI * 2); gkctx.fill();
gkctx.beginPath(); gkctx.arc(149, 100, 1.5, 0, Math.PI * 2); gkctx.fill();

// Eyebrows
gkctx.strokeStyle = '#2a1505';
gkctx.lineWidth = 3;
gkctx.beginPath(); gkctx.arc(110, 92, 12, Math.PI + 0.3, Math.PI * 2 - 0.3); gkctx.stroke();
gkctx.beginPath(); gkctx.arc(146, 92, 12, Math.PI + 0.3, Math.PI * 2 - 0.3); gkctx.stroke();

// Nose
gkctx.strokeStyle = '#b8860b';
gkctx.lineWidth = 2;
gkctx.beginPath(); gkctx.moveTo(128, 100); gkctx.lineTo(125, 118); gkctx.lineTo(131, 118); gkctx.stroke();

// Lips
gkctx.fillStyle = '#a0522d';
gkctx.beginPath(); gkctx.ellipse(128, 130, 12, 5, 0, 0, Math.PI * 2); gkctx.fill();
gkctx.fillStyle = '#cd6a5a';
gkctx.beginPath(); gkctx.ellipse(128, 129, 10, 4, 0, 0, Math.PI); gkctx.fill();

// Decorative border frame
gkctx.strokeStyle = '#8b4513';
gkctx.lineWidth = 8;
gkctx.strokeRect(10, 10, 236, 236);
gkctx.strokeStyle = '#c9a84c';
gkctx.lineWidth = 3;
gkctx.strokeRect(16, 16, 224, 224);

// "Mosaic" overlay effect
for (let i = 0; i < 2000; i++) {
  const v = Math.random() * 0.08;
  gkctx.fillStyle = `rgba(0,0,0,${v})`;
  gkctx.fillRect(Math.random() * 256, Math.random() * 256, 4, 4);
}

const gkTex = new THREE.CanvasTexture(gkCanvas);

// Large portrait on back wall
const mosaicPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(6, 6),
  new THREE.MeshStandardMaterial({ map: gkTex, roughness: 0.4 })
);
mosaicPanel.position.set(museumX, 4.5, museumZ + 14.4);
mosaicPanel.rotation.y = Math.PI;
scene.add(mosaicPanel);

// Small info plate below portrait
const infoCanvas = document.createElement('canvas');
infoCanvas.width = 256; infoCanvas.height = 64;
const ictx = infoCanvas.getContext('2d');
ictx.fillStyle = '#1a1a1a';
ictx.fillRect(0, 0, 256, 64);
ictx.fillStyle = '#c9a84c';
ictx.font = 'bold 22px serif';
ictx.textAlign = 'center';
ictx.fillText('The Gypsy Girl', 128, 42);
const infoTex = new THREE.CanvasTexture(infoCanvas);
const infoPlate = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 0.8),
  new THREE.MeshStandardMaterial({ map: infoTex, roughness: 0.3 })
);
infoPlate.position.set(museumX, 1.2, museumZ + 14.4);
infoPlate.rotation.y = Math.PI;
scene.add(infoPlate);

// ========== K) BUSHES (Can hide inside!) ==========
const bushGeo1 = new THREE.SphereGeometry(1.5, 8, 6);
const bushGeo2 = new THREE.SphereGeometry(1.2, 7, 5);
const bushGeo3 = new THREE.SphereGeometry(1.8, 8, 6);

function addBushCluster(x, z) {
  const th = terrainHeight(x, z) * Math.min(1, Math.max(0, (Math.sqrt(x*x+z*z) - 15) / 20));
  addDeco(bushGeo1, bushMat, x, th + 1.2, z);
  addDeco(bushGeo2, bushDarkMat, x + 1.5, th + 0.9, z + 1);
  addDeco(bushGeo3, bushMat, x - 1, th + 1.4, z - 0.8);
  addDeco(bushGeo2, bushDarkMat, x + 0.5, th + 0.7, z + 2);
}

const bushPositions = [
  [-25, 15], [20, 35], [-10, -30], [50, 5],
  [-35, 50], [65, -10], [-70, -35], [35, -70],
  [-55, -5], [80, 25], [-20, -55], [45, 60],
  [-75, 45], [15, 70], [-5, -70], [55, -40],
  [-85, -15], [25, -15], [-45, 25], [60, 55],
];
bushPositions.forEach(([x, z]) => addBushCluster(x, z));

// ========== L) TRAP PALLETS (Runner can knock these over!) ==========
const trapPalletGeo = new THREE.BoxGeometry(2, 4, 0.5);
const trapPalletMat = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xddaa55, roughness: 0.8 });

const traps = [];
const trapPositions = [
  [12, 0, -8], [-6, 0, 12], [30, 0, -5], [-20, 0, -18],
  [50, 0, 10], [-35, 0, 15], [18, 0, 25], [-10, 0, -45],
  [40, 0, -30], [-25, 0, 35], [60, 0, -15], [-45, 0, -10],
];

trapPositions.forEach(([x, y, z]) => {
  const pallet = new THREE.Mesh(trapPalletGeo, trapPalletMat);
  pallet.position.set(x, 2, z); // Standing upright
  pallet.castShadow = true;
  pallet.receiveShadow = true;
  scene.add(pallet);
  traps.push({
    mesh: pallet,
    state: 'standing', // standing, falling, fallen
    fallTimer: 0,
    fallDirection: new THREE.Vector3(),
    originPos: new THREE.Vector3(x, 2, z),
  });
});

// Stun state
let isStunned = false;
let stunTimer = 0;
const stunDuration = 2.0;

// UI: Stun overlay
const stunOverlay = document.createElement('div');
stunOverlay.style.position = 'absolute';
stunOverlay.style.top = '0';
stunOverlay.style.left = '0';
stunOverlay.style.width = '100%';
stunOverlay.style.height = '100%';
stunOverlay.style.backgroundColor = 'rgba(255, 200, 0, 0.25)';
stunOverlay.style.pointerEvents = 'none';
stunOverlay.style.display = 'none';
stunOverlay.style.zIndex = '5';
document.body.appendChild(stunOverlay);

// UI: Stun text
const stunText = document.createElement('div');
stunText.style.position = 'absolute';
stunText.style.top = '60%';
stunText.style.width = '100%';
stunText.style.textAlign = 'center';
stunText.style.color = '#ffcc00';
stunText.style.fontSize = '32px';
stunText.style.fontFamily = 'sans-serif';
stunText.style.fontWeight = 'bold';
stunText.style.textShadow = '2px 2px 6px rgba(0,0,0,0.8)';
stunText.style.display = 'none';
stunText.innerHTML = '⚠️ SERSEMLEDİN!';
document.body.appendChild(stunText);

// 7. Player Character
const playerGroup = new THREE.Group();
playerGroup.position.set(8, 0, 8); // Spawn away from fountain
scene.add(playerGroup);

const playerGeo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
const playerMat = new THREE.MeshStandardMaterial({ color: 0xff4444 }); 
const playerMesh = new THREE.Mesh(playerGeo, playerMat);
playerMesh.position.y = 1; // Sit on ground
playerMesh.castShadow = true;
playerGroup.add(playerMesh);

// Add a pointer to show which way player faces
const noseGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
const noseMat = new THREE.MeshStandardMaterial({ color: 0xffff00 });
const nose = new THREE.Mesh(noseGeo, noseMat);
nose.position.set(0, 1.5, -0.5);
playerGroup.add(nose);

// 7.5 Runner (NPC) Character
const runnerGroup = new THREE.Group();
runnerGroup.position.set(30, 0, -25); // Spawn in open area
scene.add(runnerGroup);

const runnerGeo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
const runnerMat = new THREE.MeshStandardMaterial({ color: 0x4444ff }); // Blue character
const runnerMesh = new THREE.Mesh(runnerGeo, runnerMat);
runnerMesh.position.y = 1; 
runnerMesh.castShadow = true;
runnerGroup.add(runnerMesh);

const runnerNoseMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const runnerNose = new THREE.Mesh(noseGeo, runnerNoseMat);
runnerNose.position.set(0, 1.5, -0.5);
runnerGroup.add(runnerNose);

const runnerSpeed = 10;
let runnerCaught = false;
let score = 0;
const catchDistance = 3; // Must be within 3 units to catch

// UI: Score display
const scoreDisplay = document.createElement('div');
scoreDisplay.style.position = 'absolute';
scoreDisplay.style.top = '20px';
scoreDisplay.style.right = '20px';
scoreDisplay.style.color = 'white';
scoreDisplay.style.fontSize = '24px';
scoreDisplay.style.fontFamily = 'sans-serif';
scoreDisplay.style.textShadow = '2px 2px 4px rgba(0,0,0,0.7)';
scoreDisplay.innerHTML = 'Score: 0';
document.body.appendChild(scoreDisplay);

// UI: Catch message
const catchMessage = document.createElement('div');
catchMessage.style.position = 'absolute';
catchMessage.style.top = '50%';
catchMessage.style.left = '50%';
catchMessage.style.transform = 'translate(-50%, -50%)';
catchMessage.style.color = '#00ff88';
catchMessage.style.fontSize = '48px';
catchMessage.style.fontFamily = 'sans-serif';
catchMessage.style.fontWeight = 'bold';
catchMessage.style.textShadow = '3px 3px 6px rgba(0,0,0,0.8)';
catchMessage.style.display = 'none';
catchMessage.innerHTML = 'YAKALADIN!';
document.body.appendChild(catchMessage);

// UI: Crosshair (Minimal)
const crosshair = document.createElement('div');
crosshair.style.position = 'absolute';
crosshair.style.top = '44%';
crosshair.style.left = '50%';
crosshair.style.transform = 'translate(-50%, -50%)';
crosshair.style.width = '20px';
crosshair.style.height = '20px';
crosshair.style.pointerEvents = 'none';
crosshair.innerHTML = `
  <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="1.5" fill="white" class="ch-dot"/>
    <rect x="9.5" y="2" width="1" height="5" fill="white" class="ch-line" opacity="0.7"/>
    <rect x="9.5" y="13" width="1" height="5" fill="white" class="ch-line" opacity="0.7"/>
    <rect x="2" y="9.5" width="5" height="1" fill="white" class="ch-line" opacity="0.7"/>
    <rect x="13" y="9.5" width="5" height="1" fill="white" class="ch-line" opacity="0.7"/>
  </svg>
`;
document.body.appendChild(crosshair);

// Helper to update crosshair color
function setCrosshairColor(color) {
  crosshair.querySelectorAll('.ch-dot').forEach(el => el.setAttribute('fill', color));
  crosshair.querySelectorAll('.ch-line').forEach(el => el.setAttribute('fill', color));
}

// Left click to catch
window.addEventListener('mousedown', (e) => {
  if (e.button === 0 && document.pointerLockElement === document.body) {
    const dist = playerGroup.position.distanceTo(runnerGroup.position);
    if (dist < catchDistance && !runnerCaught) {
      runnerCaught = true;
      score++;
      scoreDisplay.innerHTML = 'Score: ' + score;
      catchMessage.style.display = 'block';
      
      // Respawn runner after 2 seconds at a random location
      setTimeout(() => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 40;
        runnerGroup.position.set(
          Math.cos(angle) * dist,
          0,
          Math.sin(angle) * dist
        );
        runnerCaught = false;
        catchMessage.style.display = 'none';
      }, 2000);
    }
  }
});

// 8. Player Movement Input
const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  space: false
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyW' || e.key === 'w' || e.key === 'W') keys.w = true;
  if (e.code === 'KeyA' || e.key === 'a' || e.key === 'A') keys.a = true;
  if (e.code === 'KeyS' || e.key === 's' || e.key === 'S') keys.s = true;
  if (e.code === 'KeyD' || e.key === 'd' || e.key === 'D') keys.d = true;
  if (e.code === 'Space') keys.space = true;
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW' || e.key === 'w' || e.key === 'W') keys.w = false;
  if (e.code === 'KeyA' || e.key === 'a' || e.key === 'A') keys.a = false;
  if (e.code === 'KeyS' || e.key === 's' || e.key === 'S') keys.s = false;
  if (e.code === 'KeyD' || e.key === 'd' || e.key === 'D') keys.d = false;
  if (e.code === 'Space') keys.space = false;
});

// Window resize handling
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 9. Game Loop
const clock = new THREE.Clock();
const playerSpeed = 12;

// Physics logic
let playerVelocityY = 0;
const gravity = -30;
const jumpStrength = 15;
let isGrounded = true;

// Collision Detection (Box3 world-space — handles all shapes)
const playerRadius = 0.6;
const runnerRadius = 0.6;
const _box3 = new THREE.Box3();
const _playerBox = new THREE.Box3();

function checkCollision(position, radius) {
  // Create a small box around the character position
  _playerBox.min.set(position.x - radius, position.y, position.z - radius);
  _playerBox.max.set(position.x + radius, position.y + 2, position.z + radius);
  
  for (const obs of obstacles) {
    _box3.setFromObject(obs);
    if (_playerBox.intersectsBox(_box3)) {
      return true;
    }
  }
  return false;
}

// Find the highest surface (ground/terrain or obstacle top) below the player
function getGroundHeight(position, radius) {
  // Sample terrain height at player position
  let highest = terrainHeight(position.x, position.z) *
    Math.min(1, Math.max(0, (Math.sqrt(position.x * position.x + position.z * position.z) - 15) / 20));
  
  for (const obs of obstacles) {
    _box3.setFromObject(obs);
    
    // Check if player is above this obstacle (within XZ bounds)
    if (
      position.x + radius > _box3.min.x && position.x - radius < _box3.max.x &&
      position.z + radius > _box3.min.z && position.z - radius < _box3.max.z
    ) {
      const obsTop = _box3.max.y;
      if (obsTop > highest && position.y >= obsTop - 0.5) {
        highest = obsTop;
      }
    }
  }
  return highest;
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Handle Gravity and Jumping
  playerVelocityY += gravity * delta;
  playerGroup.position.y += playerVelocityY * delta;

  // Floor / obstacle-top collision check
  const groundLevel = getGroundHeight(playerGroup.position, playerRadius);
  if (playerGroup.position.y <= groundLevel) {
    playerVelocityY = 0;
    playerGroup.position.y = groundLevel;
    isGrounded = true;
  } else {
    isGrounded = false;
  }

  // Jump logic
  if (keys.space && isGrounded) {
    playerVelocityY = jumpStrength;
    isGrounded = false;
  }

  // Stun timer
  if (isStunned) {
    stunTimer -= delta;
    if (stunTimer <= 0) {
      isStunned = false;
      stunOverlay.style.display = 'none';
      stunText.style.display = 'none';
    }
  }

  // Current player speed (halved when stunned)
  const currentSpeed = isStunned ? playerSpeed * 0.3 : playerSpeed;

  // 1. Calculate Orbit Camera Position (Spherical Coordinates)
  const horizontalDistance = cameraDistance * Math.cos(cameraPitch);
  const verticalDistance = cameraDistance * Math.sin(cameraPitch);
  
  const camX = playerGroup.position.x - horizontalDistance * Math.sin(cameraYaw);
  const camZ = playerGroup.position.z - horizontalDistance * Math.cos(cameraYaw);
  const camY = playerGroup.position.y + verticalDistance + 2; // +2 offset for looking at head
  
  camera.position.set(camX, camY, camZ);
  camera.lookAt(playerGroup.position.x, playerGroup.position.y + 2, playerGroup.position.z);

  // 2. Handle Movement Logic (Relative to Camera)
  const camForward = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw)).normalize();
  const camRight = new THREE.Vector3(camForward.z, 0, -camForward.x);

  const direction = new THREE.Vector3(0, 0, 0);
  if (keys.w) direction.add(camForward);
  if (keys.s) direction.sub(camForward);
  if (keys.a) direction.add(camRight);
  if (keys.d) direction.sub(camRight);

  if (direction.length() > 0) {
    direction.normalize();
    const moveVec = direction.clone().multiplyScalar(currentSpeed * delta);
    
    // Try X movement
    const testPosX = playerGroup.position.clone();
    testPosX.x += moveVec.x;
    if (!checkCollision(testPosX, playerRadius)) {
      playerGroup.position.x = testPosX.x;
    }
    
    // Try Z movement
    const testPosZ = playerGroup.position.clone();
    testPosZ.z += moveVec.z;
    if (!checkCollision(testPosZ, playerRadius)) {
      playerGroup.position.z = testPosZ.z;
    }
    
    // Rotate player to face movement direction smoothly
    const targetAngle = Math.atan2(direction.x, direction.z);
    
    // Simple rotation interpolation
    let diff = targetAngle - playerGroup.rotation.y;
    // Normalize difference to -PI to PI to take shortest turn path
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    playerGroup.rotation.y += diff * 10 * delta;
  }

  // Runner AI Logic
  if (!runnerCaught) {
    const distanceToPlayer = runnerGroup.position.distanceTo(playerGroup.position);
    if (distanceToPlayer < 15) {
      // Player is close, run away!
      const runDirection = new THREE.Vector3().subVectors(runnerGroup.position, playerGroup.position);
      runDirection.y = 0; // Ensure it stays on the ground
      
      if (runDirection.length() > 0) {
        runDirection.normalize();
        
        // Runner collision check
        const runMoveVec = runDirection.clone().multiplyScalar(runnerSpeed * delta);
        const testRunX = runnerGroup.position.clone();
        testRunX.x += runMoveVec.x;
        if (!checkCollision(testRunX, runnerRadius)) {
          runnerGroup.position.x = testRunX.x;
        }
        const testRunZ = runnerGroup.position.clone();
        testRunZ.z += runMoveVec.z;
        if (!checkCollision(testRunZ, runnerRadius)) {
          runnerGroup.position.z = testRunZ.z;
        }
        
        // Face the direction it's running
        const targetAngle = Math.atan2(runDirection.x, runDirection.z);
        let diff = targetAngle - runnerGroup.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        runnerGroup.rotation.y += diff * 10 * delta;
        
        // Clamp position to not run outside the ground boundaries
        runnerGroup.position.x = Math.max(-95, Math.min(95, runnerGroup.position.x));
        runnerGroup.position.z = Math.max(-95, Math.min(95, runnerGroup.position.z));
      }
    }

    // Crosshair hint: change color when close enough to catch
    const catchDist = playerGroup.position.distanceTo(runnerGroup.position);
    if (catchDist < catchDistance) {
      setCrosshairColor('#00ff88');
    } else {
      setCrosshairColor('white');
    }

    // Runner triggers traps when passing near them
    for (const trap of traps) {
      if (trap.state === 'standing') {
        const distToRunner = new THREE.Vector2(
          trap.mesh.position.x - runnerGroup.position.x,
          trap.mesh.position.z - runnerGroup.position.z
        ).length();
        
        if (distToRunner < 3) {
          // Runner knocks the pallet!
          trap.state = 'falling';
          trap.fallTimer = 0;
          // Fall direction: away from runner towards player
          trap.fallDirection.subVectors(playerGroup.position, runnerGroup.position).normalize();
        }
      }
    }
  }

  // Update trap pallets
  for (const trap of traps) {
    if (trap.state === 'falling') {
      trap.fallTimer += delta * 3;
      
      // Rotate the pallet to fall over
      const fallAngle = Math.min(trap.fallTimer * (Math.PI / 2), Math.PI / 2);
      trap.mesh.rotation.x = fallAngle * trap.fallDirection.z;
      trap.mesh.rotation.z = -fallAngle * trap.fallDirection.x;
      
      // Lower the Y as it falls
      trap.mesh.position.y = trap.originPos.y * Math.cos(fallAngle);
      
      if (fallAngle >= Math.PI / 2) {
        trap.state = 'fallen';
        trap.fallTimer = 0;
        
        // Check if pallet landed on/near player
        const distToPlayer = new THREE.Vector2(
          trap.mesh.position.x - playerGroup.position.x,
          trap.mesh.position.z - playerGroup.position.z
        ).length();
        
        if (distToPlayer < 3 && !isStunned) {
          isStunned = true;
          stunTimer = stunDuration;
          stunOverlay.style.display = 'block';
          stunText.style.display = 'block';
        }
      }
    }
    
    // Reset fallen traps after a while
    if (trap.state === 'fallen') {
      trap.fallTimer += delta;
      if (trap.fallTimer > 8) {
        // Reset pallet
        trap.state = 'standing';
        trap.mesh.position.copy(trap.originPos);
        trap.mesh.rotation.set(0, 0, 0);
      }
    }
  }

  renderer.render(scene, camera);
}

// Start loop
animate();
