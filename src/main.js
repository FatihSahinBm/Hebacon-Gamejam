import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { io } from 'socket.io-client';

// Game State
let gameState = 'MENU'; // 'MENU', 'LOBBY', 'PLAYING_SP', 'PLAYING_MP'
let socket = null;
let roomId = null;
let myTeam = 'runner'; // 'runner' or 'chaser'
let remotePlayers = {}; // id -> { group, mesh, team, isStunned, targetPos }

// Video elements
const videoOverlay = document.getElementById('video-overlay');
const proxVideo = document.getElementById('proximity-video');
let videoTriggered = false;
let videoPlaying = false;

if (proxVideo) {
  proxVideo.onended = () => {
    videoOverlay.style.display = 'none';
    videoPlaying = false;
  };
}

// Scream sound for baklava
const screamSound = new Audio('/bagirma.mp3');
screamSound.volume = 0.5;

const bakSound = new Audio('/bak.mp3');
bakSound.volume = 0.7;

const museumSound = new Audio('/got.mp3');
museumSound.volume = 0.4;
museumSound.loop = true;
let museumMusicPlaying = false;

const recepSound = new Audio('/Recep İvedik gülüşü.mp3');
recepSound.volume = 0.8;

// ========== QUEST SYSTEM ==========
let currentQuestIndex = 0;
const quests = [
    { id: 'baklava', title: 'Baklava Şöleni', description: '1 adet Baklava ye.', target: 1, current: 0 },
    { id: 'doner', title: 'Döner Ziyafeti', description: '1 tam Döner bitir.', target: 1, current: 0 },
    { id: 'museum_piece', title: 'Tarih Avcısı', description: 'Müzedeki gizli mozaiği bul.', target: 1, current: 0 },
    { id: 'wilson', title: 'Yalnız Dost', description: 'Issız bir köşede Wilson\'ı bul.', target: 1, current: 0 },
    { id: 'bus_stop', title: 'Yolcu', description: 'TA3 Otobüs Durağı\'nı ziyaret et.', target: 1, current: 0 },
    { id: 'runner', title: 'Usta Avcı', description: 'Meşhur Nohutçu\'yu 2 kez yakala.', target: 2, current: 0 },
    { id: 'final_door', title: 'Son Kapı', description: 'Parıldayan kapıya ulaş (60 puan).', target: 1, current: 0 }
];

// Quest HUD UI
const questHUD = document.createElement('div');
questHUD.style.position = 'absolute';
questHUD.style.top = '100px';
questHUD.style.left = '20px';
questHUD.style.backgroundColor = 'rgba(0,0,0,0.6)';
questHUD.style.color = 'white';
questHUD.style.padding = '15px';
questHUD.style.borderRadius = '10px';
questHUD.style.fontFamily = 'sans-serif';
questHUD.style.minWidth = '220px';
questHUD.style.border = '2px solid #ffcc00';
questHUD.style.zIndex = '10';
questHUD.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
document.body.appendChild(questHUD);

function updateQuestHUD() {
    if (currentQuestIndex >= quests.length) {
        questHUD.innerHTML = '<h3 style="color: #00ff00; margin: 0; text-align:center;">🏆 TÜM GÖREVLER TAMAMLANDI! 🏆</h3>';
        return;
    }
    const q = quests[currentQuestIndex];
    questHUD.innerHTML = `
        <h3 style="margin: 0 0 5px 0; color: #ffcc00; font-size: 16px; text-transform: uppercase;">MEVCUT GÖREV</h3>
        <div style="font-weight: bold; font-size: 18px; margin-bottom: 2px;">${q.title}</div>
        <div style="font-size: 13px; opacity: 0.8; margin-bottom: 8px;">${q.description}</div>
        <div style="height: 6px; background: #333; border-radius: 3px; overflow: hidden;">
            <div style="width: ${(q.current / q.target) * 100}%; height: 100%; background: #ffcc00; transition: width 0.3s;"></div>
        </div>
        <div style="font-size: 14px; font-weight: bold; margin-top: 5px; text-align: right;">
            ${q.current} / ${q.target}
        </div>
    `;
}

function advanceQuest(questId, amount = 1) {
    if (currentQuestIndex >= quests.length) return;
    const q = quests[currentQuestIndex];
    if (q.id === questId) {
        q.current += amount;
        if (q.current >= q.target) {
            q.current = q.target;
            currentQuestIndex++;
            score += 10;
            if (typeof scoreDisplay !== 'undefined') scoreDisplay.innerHTML = 'Score: ' + score;
            
            // Quest complete effect
            const label = document.createElement('div');
            label.style.position = 'absolute';
            label.style.top = '40%';
            label.style.left = '50%';
            label.style.transform = 'translate(-50%, -50%)';
            label.style.color = '#00ff00';
            label.style.fontSize = '40px';
            label.style.fontWeight = 'bold';
            label.style.textShadow = '0 0 10px black, 2px 2px 0px #000';
            label.style.zIndex = '2000';
            label.style.pointerEvents = 'none';
            label.innerHTML = 'GÖREV TAMAMLANDI!<br/><span style="font-size: 24px;">+10 PUAN</span>';
            label.style.textAlign = 'center';
            document.body.appendChild(label);
            setTimeout(() => {
                label.style.transition = 'opacity 0.5s, transform 0.5s';
                label.style.opacity = '0';
                label.style.transform = 'translate(-50%, -100%)';
                setTimeout(() => label.remove(), 500);
            }, 1500);
        }
        updateQuestHUD();
    }
}

updateQuestHUD();

window.DEBUG_GAME = {
  get socket() { return socket; },
  get myTeam() { return myTeam; },
  get remotePlayers() { return remotePlayers; }
};

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
let firstPerson = false; // V key toggles this

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
instructions.innerHTML = 'Oyuna Devam Etmek İçin Tıklayın<br/>(W, A, S, D = Hareket, Mouse = Bakış)';
instructions.style.display = 'none'; // Only show during game
document.body.appendChild(instructions);

// DOM Elements
const mainMenu = document.getElementById('main-menu');
const mpLobby = document.getElementById('mp-lobby');
const btnSp = document.getElementById('btn-sp');
const btnMp = document.getElementById('btn-mp');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const btnStartMp = document.getElementById('btn-start-mp');
const inputRoomId = document.getElementById('input-room-id');
const roomInfo = document.getElementById('room-info');
const roomCodeDisplay = document.getElementById('room-code-display');

// ========== WATERMELON INTRO GAME ==========
function startIntroGame() {
  const introOverlay = document.getElementById('intro-overlay');
  const introCanvas = document.getElementById('intro-canvas');
  const introFlash = document.getElementById('intro-flash');
  const introFinalText = document.getElementById('intro-final-text');
  const introCounter = document.getElementById('intro-click-counter');
  const introEsmaVid = document.getElementById('intro-esma-video');

  introOverlay.style.display = 'block';

  // Three.js setup for intro
  const iScene = new THREE.Scene();
  iScene.background = new THREE.Color(0x0a0a0a);
  iScene.fog = new THREE.Fog(0x0a0a0a, 5, 20);

  const iCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  iCamera.position.set(0, 1, 8);

  const iRenderer = new THREE.WebGLRenderer({ antialias: true });
  iRenderer.setSize(window.innerWidth, window.innerHeight);
  iRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  iRenderer.shadowMap.enabled = true;
  introCanvas.appendChild(iRenderer.domElement);

  const iAmbient = new THREE.AmbientLight(0xffffff, 0.4);
  iScene.add(iAmbient);
  const iSpot = new THREE.SpotLight(0xffffff, 1.8);
  iSpot.position.set(2, 8, 5);
  iSpot.angle = Math.PI / 4;
  iSpot.penumbra = 0.5;
  iSpot.castShadow = true;
  iScene.add(iSpot);

  // Watermelon texture
  const wCanvas = document.createElement('canvas');
  wCanvas.width = 1024; wCanvas.height = 512;
  const wCtx = wCanvas.getContext('2d');
  wCtx.fillStyle = '#1e5e2f';
  wCtx.fillRect(0, 0, 1024, 512);
  wCtx.fillStyle = '#0b2b13';
  for (let i = 0; i < 14; i++) {
    const x = (i / 14) * 1024;
    wCtx.beginPath();
    wCtx.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 20) {
      wCtx.lineTo(x + Math.sin(y * 0.1) * 15 + Math.random() * 5 + 15, y);
    }
    wCtx.lineTo(x - 15, 512);
    for (let y = 512; y >= 0; y -= 20) {
      wCtx.lineTo(x + Math.sin(y * 0.1) * 15 + Math.random() * 5 - 15, y);
    }
    wCtx.fill();
  }
  const wTex = new THREE.CanvasTexture(wCanvas);

  const wGeo = new THREE.SphereGeometry(2, 64, 64);
  const wPos = wGeo.attributes.position;
  for (let i = 0; i < wPos.count; i++) wPos.setY(i, wPos.getY(i) * 0.85);
  wGeo.computeVertexNormals();

  const wMat = new THREE.MeshStandardMaterial({ map: wTex, roughness: 0.35, metalness: 0.1 });
  const watermelon = new THREE.Mesh(wGeo, wMat);
  watermelon.castShadow = true;
  iScene.add(watermelon);

  let iClicks = 0;
  const iMaxClicks = 5;
  let iBroken = false;
  let iTricked = false;
  let iScaleTarget = 1;
  let iCurrentScale = 1;
  const iFragments = [];
  const iRay = new THREE.Raycaster();
  const iMouse = new THREE.Vector2();

  introCanvas.addEventListener('mousedown', (ev) => {
    if (iBroken) return;
    iMouse.x = (ev.clientX / window.innerWidth) * 2 - 1;
    iMouse.y = -(ev.clientY / window.innerHeight) * 2 + 1;
    iRay.setFromCamera(iMouse, iCamera);
    const hits = iRay.intersectObject(watermelon);
    if (hits.length > 0) {
      iClicks++;
      if (iClicks === 4 && !iTricked) {
        iTricked = true;
        iClicks = 1;
        document.querySelector('#intro-ui h1').innerText = "Hahaha Yeniden Başlıyorsun! 😜";
        introEsmaVid.style.opacity = '0.6';
        introEsmaVid.play().catch(() => {});
        introEsmaVid.onended = () => { introEsmaVid.style.opacity = '0'; };
      }
      introCounter.innerText = `${iClicks} / ${iMaxClicks}`;
      if (iClicks >= iMaxClicks) {
        shatterIntroWatermelon();
      } else {
        iScaleTarget = 1 + iClicks * 0.1;
        watermelon.position.x = (Math.random() - 0.5) * 0.8;
        watermelon.position.y = (Math.random() - 0.5) * 0.8;
        iScene.background.lerp(new THREE.Color(0x330000), 0.2);
        iScene.fog.color.copy(iScene.background);
      }
    }
  });

  function shatterIntroWatermelon() {
    iBroken = true;
    iScene.remove(watermelon);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xe3242b, roughness: 0.6 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x1e5e2f, roughness: 0.5 });
    const seedsMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

    for (let i = 0; i < 200; i++) {
      const r = Math.random();
      const mat = r > 0.8 ? greenMat : r > 0.75 ? seedsMat : redMat;
      const rad = Math.random() * 0.3 + 0.05;
      const bg = new THREE.DodecahedronGeometry(rad, 0);
      const p = bg.attributes.position;
      for (let j = 0; j < p.count; j++) {
        p.setX(j, p.getX(j) * (Math.random() * 0.5 + 0.5));
        p.setY(j, p.getY(j) * (Math.random() * 0.5 + 0.5));
        p.setZ(j, p.getZ(j) * (Math.random() * 0.5 + 0.5));
      }
      bg.computeVertexNormals();
      const frag = new THREE.Mesh(bg, mat);
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const rd = Math.random() * 1.8;
      frag.position.set(rd * Math.sin(ph) * Math.cos(th), rd * Math.cos(ph) * 0.85, rd * Math.sin(ph) * Math.sin(th));
      const ep = Math.random() * 1.5 + 0.5;
      frag.userData.velocity = frag.position.clone().normalize().multiplyScalar(ep);
      frag.userData.velocity.y += Math.random() * 0.8;
      frag.userData.rotSpeed = new THREE.Vector3((Math.random()-0.5)*0.4,(Math.random()-0.5)*0.4,(Math.random()-0.5)*0.4);
      iScene.add(frag);
      iFragments.push(frag);
    }

    introFlash.style.opacity = '1';
    introFlash.style.pointerEvents = 'all';

    const flashAudio = new Audio('/flas.mp3');
    const triggerRecep = () => {
      const recepAudio = new Audio('/recep.mp3');
      recepAudio.onended = () => {
        // Intro finished! Start the actual game
        introOverlay.style.display = 'none';
        iRenderer.dispose();
        introCanvas.innerHTML = '';
        gameState = 'PLAYING_SP';
        mainMenu.style.display = 'none';
        document.body.requestPointerLock();
      };
      recepAudio.onerror = recepAudio.onended;
      recepAudio.play().catch(() => { recepAudio.onended(); });
    };
    flashAudio.onended = triggerRecep;
    flashAudio.onerror = triggerRecep;
    flashAudio.play().catch(() => triggerRecep());

    setTimeout(() => { introFinalText.style.opacity = '1'; introFinalText.style.transform = 'scale(1)'; }, 500);
  }

  const iClock = new THREE.Clock();
  function introAnimate() {
    if (introOverlay.style.display === 'none') return;
    requestAnimationFrame(introAnimate);
    const d = iClock.getDelta();
    if (!iBroken) {
      watermelon.rotation.y += d * 0.3;
      watermelon.rotation.z = Math.sin(iClock.elapsedTime) * 0.05;
      watermelon.position.lerp(new THREE.Vector3(0,0,0), 0.1);
      iCurrentScale += (iScaleTarget - iCurrentScale) * 0.1;
      watermelon.scale.set(iCurrentScale, iCurrentScale, iCurrentScale);
    } else {
      for (const f of iFragments) {
        f.position.x += f.userData.velocity.x * d * 5;
        f.position.y += f.userData.velocity.y * d * 5;
        f.position.z += f.userData.velocity.z * d * 5;
        f.userData.velocity.y -= d * 3;
        f.rotation.x += f.userData.rotSpeed.x;
        f.rotation.y += f.userData.rotSpeed.y;
        f.rotation.z += f.userData.rotSpeed.z;
      }
    }
    iRenderer.render(iScene, iCamera);
  }
  introAnimate();
}

// Menu Event Listeners
btnSp.addEventListener('click', () => {
  mainMenu.style.display = 'none';
  startIntroGame();
});

btnMp.addEventListener('click', () => {
  gameState = 'LOBBY';
  mainMenu.style.display = 'none';
  mpLobby.style.display = 'flex';
  
  if (!socket) {
    socket = io(); // Connects to same host/port if served together, or needs specific URL
    // Actually vite runs frontend, so we must point to backend port precisely
    socket = io('http://localhost:3001');
    
    socket.on('roomCreated', (id) => {
      roomId = id;
      roomCodeDisplay.innerText = id;
      roomInfo.style.display = 'block';
    });
    
    socket.on('roomJoined', (id) => {
      roomId = id;
      roomCodeDisplay.innerText = id;
      roomInfo.style.display = 'block';
    });
    
    socket.on('assignedTeam', (team) => {
      myTeam = team;
      // We will set our player color later once playerMesh is defined
    });

    socket.on('errorMsg', (msg) => alert(msg));
    
    socket.on('playerList', (players) => {
      Object.keys(players).forEach(id => {
        if (id !== socket.id && !remotePlayers[id]) {
          createRemotePlayer(id, players[id].team);
        }
      });
    });

    socket.on('playerMoved', (data) => {
      if (remotePlayers[data.id]) {
        remotePlayers[data.id].targetPos = { x: data.x, y: data.y, z: data.z, r: data.r };
        remotePlayers[data.id].isStunned = data.isStunned;
      } else if (data.team) {
        createRemotePlayer(data.id, data.team);
      }
    });

    socket.on('playerDisconnected', (id) => {
      if (remotePlayers[id]) {
        scene.remove(remotePlayers[id].group);
        delete remotePlayers[id];
      }
    });
  }
});

btnCreateRoom.addEventListener('click', () => {
  if(socket) socket.emit('createRoom');
});

btnJoinRoom.addEventListener('click', () => {
  const joinId = inputRoomId.value.trim();
  if (joinId && socket) socket.emit('joinRoom', joinId);
});

btnStartMp.addEventListener('click', () => {
  gameState = 'PLAYING_MP';
  mpLobby.style.display = 'none';
  // Update my character color based on team (Blue for runner, Thanos Purple for chaser)
  // Update my character color based on team (Blue for runner, Thanos Purple for chaser)
  if (playerMesh && playerMesh.material) {
    if (myTeam === 'runner') {
      playerMesh.material.color.setHex(0x4444ff);
      if (playerThanos) playerThanos.visible = false;
      playerMesh.visible = !firstPerson;
      if (nose) nose.visible = !firstPerson;
    } else {
      playerMesh.material.color.setHex(0x8a2be2);
      applyThanosToPlayer();
    }
  }
  document.body.requestPointerLock();
});

// Remove global click pointer lock trigger. 
// We only lock when buttons are clicked or when clicking the "instructions" screen.

// Helper to apply Thanos to local player
function applyThanosToPlayer() {
  if (!thanosModel || myTeam === 'runner' || !playerGroup) return;
  if (!playerThanos) {
    playerThanos = thanosModel.clone();
    playerGroup.add(playerThanos);
  }
  playerThanos.visible = !firstPerson;
  playerMesh.visible = false;
  if (nose) nose.visible = false;
}

// Global Thanos Model Cache
let thanosModel = null;
const gltfLoader = new GLTFLoader();
gltfLoader.load('/thanos__the_endgame.glb', (gltf) => {
  const rawModel = gltf.scene;
  
  // Auto-scale and center the model!
  const box = new THREE.Box3().setFromObject(rawModel);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  // Capsule is roughly 2.0 tall. Fit the model to this height.
  const targetHeight = 2.0; 
  const scale = targetHeight / (maxDim || 1);
  
  rawModel.scale.set(scale, scale, scale);
  
  // Recenter (center x/z, place bottom at y=0)
  const center = box.getCenter(new THREE.Vector3());
  rawModel.position.x = -center.x * scale;
  rawModel.position.z = -center.z * scale;
  rawModel.position.y = -box.min.y * scale; 
  
  // Create a clean container for the model to preserve position offsets
  thanosModel = new THREE.Group();
  thanosModel.add(rawModel);

  // Make sure it casts shadows
  thanosModel.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  
  // Apply to local player immediately if chaser in single-player or already in game
  if (myTeam !== 'runner') {
    applyThanosToPlayer();
  }
  
  // Apply to existing remote players
  for (const id in remotePlayers) {
    const rp = remotePlayers[id];
    if (rp.team === 'chaser' && !rp.hasThanos) {
      const tModel = thanosModel.clone();
      rp.group.add(tModel);
      rp.mesh.visible = false;
      rp.nose.visible = false;
      rp.hasThanos = true;
    }
  }
});


// Remote player mesh helper
function createRemotePlayer(id, team) {
  const group = new THREE.Group();
  const geo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
  const mat = new THREE.MeshStandardMaterial({ color: team === 'runner' ? 0x4444ff : 0x8a2be2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 1;
  mesh.castShadow = true;
  group.add(mesh);
  
  const noseMat = new THREE.MeshStandardMaterial({ color: team === 'runner' ? 0x00ff00 : 0xffd700 });
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), noseMat);
  nose.position.set(0, 1.5, -0.5);
  group.add(nose);
  
  // Add Thanos model if Chaser
  let hasThanos = false;
  if (team === 'chaser' && thanosModel) {
    const tModel = thanosModel.clone();
    group.add(tModel);
    mesh.visible = false;
    nose.visible = false;
    hasThanos = true;
  }
  
  scene.add(group);
  remotePlayers[id] = { group, mesh, nose, team, isStunned: false, targetPos: null, hasThanos };
}

instructions.addEventListener('click', (e) => {
  // Prevent catching clicks intended for menu overlays
  if (gameState === 'PLAYING_SP' || gameState === 'PLAYING_MP') {
    document.body.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  if (gameState === 'PLAYING_SP' || gameState === 'PLAYING_MP') {
    if (document.pointerLockElement === document.body) {
      instructions.style.display = 'none';
      if(gameState === 'PLAYING_SP' || gameState === 'PLAYING_MP') {
         // resume
      }
    } else {
      // Pause overlay
      instructions.style.display = 'flex';
      instructions.style.alignItems = 'center';
      instructions.style.justifyContent = 'center';
    }
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
const waterMat = new THREE.MeshStandardMaterial({ 
  color: 0x2277cc, 
  roughness: 0.1, 
  metalness: 0.2, 
  transparent: true, 
  opacity: 0.85, 
  emissive: 0x113355, 
  emissiveIntensity: 0.2 
});
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
// River (decorative blue strip) - Expanded to match full map size (200)
const riverGeo = new THREE.PlaneGeometry(8, 200);
const river = new THREE.Mesh(riverGeo, waterMat);
river.rotation.x = -Math.PI / 2;
river.position.set(-15, 0.4, 0); // Raised from 0.05 to 0.4 to fill the canal
scene.add(river);

// River banks (collision walls) - Expanded to match full map size (200)
addObs(new THREE.BoxGeometry(1, 1, 200), stoneMat, -11, 0.5, 0); // east bank
addObs(new THREE.BoxGeometry(1, 1, 200), stoneMat, -19, 0.5, 0); // west bank

// Bridge deck
addDeco(new THREE.BoxGeometry(10, 0.5, 6), woodMat, -15, 1.2, 0);
// Bridge railings
addObs(new THREE.BoxGeometry(0.3, 2, 6), woodMat, -10.2, 1.5, 0);
addObs(new THREE.BoxGeometry(0.3, 2, 6), woodMat, -19.8, 1.5, 0);

// --- Chicken on a Board (near the bridge) ---
const boardBaseY = 0.5; // Raised to stay above the 0.4 water level
const boardMesh = addObs(new THREE.BoxGeometry(2, 0.2, 2), woodMat, -15, boardBaseY, 6); 
const chickenGroup = new THREE.Group();
chickenGroup.position.set(-15, boardBaseY + 0.15, 6);
scene.add(chickenGroup);

// Chicken body (round sphere)
const chickenMat = new THREE.MeshStandardMaterial({ color: 0xffffff }); // White chicken
const cBody = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), chickenMat);
cBody.position.y = 0.4;
chickenGroup.add(cBody);

// Chicken head
const cHead = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), chickenMat);
cHead.position.set(0, 0.8, 0.2);
chickenGroup.add(cHead);

// Beak (small orange cone)
const beakMat = new THREE.MeshStandardMaterial({ color: 0xffa500 });
const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), beakMat);
beak.position.set(0, 0.8, 0.45);
beak.rotation.x = Math.PI / 2;
chickenGroup.add(beak);

// Comb (red bit on top)
const combMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const comb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.2), combMat);
comb.position.set(0, 1.05, 0.2);
chickenGroup.add(comb);

// Simple animation loop update for chicken (gentle bobbing)
function animateChicken() {
  if (chickenGroup) {
      const t = Date.now() * 0.005;
      chickenGroup.position.y = 0.65 + Math.sin(t) * 0.05; // Bobbing relative to new height
      boardMesh.position.y = 0.5 + Math.sin(t) * 0.02;     // Bobbing relative to new height
  }
}

// Wilson name label (floating above chicken head)
const wilsonLabelCanvas = document.createElement('canvas');
wilsonLabelCanvas.width = 256; wilsonLabelCanvas.height = 64;
const wlc = wilsonLabelCanvas.getContext('2d');
wlc.fillStyle = 'rgba(0,0,0,0.7)';
wlc.roundRect(0, 0, 256, 64, 10);
wlc.fill();
wlc.fillStyle = '#ff6600';
wlc.font = 'bold 30px sans-serif';
wlc.textAlign = 'center';
wlc.fillText('Wilson 🐔', 128, 42);
const wilsonLabelTex = new THREE.CanvasTexture(wilsonLabelCanvas);
const wilsonLabel = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 0.5),
  new THREE.MeshStandardMaterial({ map: wilsonLabelTex, transparent: true, side: THREE.DoubleSide })
);
wilsonLabel.position.set(-15, 2, 6);
scene.add(wilsonLabel);

let wilsonCollected = false;
const wilsonPos = new THREE.Vector3(-15, 0, 6); // Chicken position for quest check

// ========== FINAL GLOWING DOOR ==========
const doorX = -90, doorZ = -90;
const doorGlowMat = new THREE.MeshStandardMaterial({
  color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 2,
  transparent: true, opacity: 0.9, side: THREE.DoubleSide
});
const finalDoorFrameMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.8 });

// Door frame
addDeco(new THREE.BoxGeometry(0.3, 6, 0.3), finalDoorFrameMat, doorX - 1.5, 3, doorZ);
addDeco(new THREE.BoxGeometry(0.3, 6, 0.3), finalDoorFrameMat, doorX + 1.5, 3, doorZ);
addDeco(new THREE.BoxGeometry(3.3, 0.3, 0.3), finalDoorFrameMat, doorX, 6, doorZ);

// Glowing door panel
const doorPanel = new THREE.Mesh(new THREE.PlaneGeometry(3, 6), doorGlowMat);
doorPanel.position.set(doorX, 3, doorZ);
scene.add(doorPanel);

// Door point light
const doorLight = new THREE.PointLight(0xffd700, 3, 15);
doorLight.position.set(doorX, 4, doorZ + 1);
scene.add(doorLight);

// Door label
const doorLabelCanvas = document.createElement('canvas');
doorLabelCanvas.width = 256; doorLabelCanvas.height = 64;
const dlc = doorLabelCanvas.getContext('2d');
dlc.fillStyle = 'rgba(0,0,0,0.7)';
dlc.roundRect(0, 0, 256, 64, 10);
dlc.fill();
dlc.fillStyle = '#ffd700';
dlc.font = 'bold 22px sans-serif';
dlc.textAlign = 'center';
dlc.fillText('🚪 SON KAPI 🚪', 128, 42);
const doorLabelTex = new THREE.CanvasTexture(doorLabelCanvas);
const doorLabel = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 0.75),
  new THREE.MeshStandardMaterial({ map: doorLabelTex, transparent: true, side: THREE.DoubleSide })
);
doorLabel.position.set(doorX, 7, doorZ);
scene.add(doorLabel);

let finalDoorOpen = false;
const doorPos = new THREE.Vector3(doorX, 0, doorZ);

// White screen overlay for ending
const whiteScreenOverlay = document.createElement('div');
whiteScreenOverlay.style.position = 'absolute';
whiteScreenOverlay.style.top = '0'; whiteScreenOverlay.style.left = '0';
whiteScreenOverlay.style.width = '100%'; whiteScreenOverlay.style.height = '100%';
whiteScreenOverlay.style.backgroundColor = 'white';
whiteScreenOverlay.style.display = 'none';
whiteScreenOverlay.style.zIndex = '9999';
whiteScreenOverlay.style.justifyContent = 'center';
whiteScreenOverlay.style.alignItems = 'center';
whiteScreenOverlay.style.flexDirection = 'column';
whiteScreenOverlay.innerHTML = '<h1 style="font-size: 60px; color: #333; font-family: sans-serif;">TEBRİKLER!</h1><p style="font-size: 30px; color: #666; font-family: sans-serif;">Tüm görevleri tamamladın! 🏆</p>';
document.body.appendChild(whiteScreenOverlay);

function triggerFinalEnding() {
  finalDoorOpen = true;
  advanceQuest('final_door');
  // White screen
  whiteScreenOverlay.style.display = 'flex';
  // Play Recep İvedik laugh
  recepSound.currentTime = 0;
  recepSound.play().catch(e => console.log("Recep audio failed:", e));
  // Stop all other sounds
  museumSound.pause();
  document.exitPointerLock();

  // After laugh finishes, show dans.mp4
  recepSound.onended = () => {
    whiteScreenOverlay.innerHTML = '';
    const dansVideo = document.createElement('video');
    dansVideo.src = '/dans.mp4';
    dansVideo.style.width = '100%';
    dansVideo.style.height = '100%';
    dansVideo.style.objectFit = 'contain';
    dansVideo.autoplay = true;
    dansVideo.playsInline = true;
    whiteScreenOverlay.style.background = 'black';
    whiteScreenOverlay.appendChild(dansVideo);
    dansVideo.play().catch(e => console.log("Dans video failed:", e));
  };
}

// Add to animate loop later or just hard-code bob in animate()

// ========== D) HIDING TUNNELS (Low walls you can hide behind) ==========
// Tunnel 1 at (20, 0, -30): Two parallel walls
addObs(new THREE.BoxGeometry(1, 3, 10), concreteMat, 18, 1.5, -30);
addObs(new THREE.BoxGeometry(1, 3, 10), concreteMat, 22, 1.5, -30);
addDeco(new THREE.BoxGeometry(5, 0.5, 10), concreteMat, 20, 3.25, -30); // roof

// Tunnel 2 at (-50, 0, 20)
addObs(new THREE.BoxGeometry(10, 3, 1), concreteMat, -50, 1.5, 18);
addObs(new THREE.BoxGeometry(10, 3, 1), concreteMat, -50, 1.5, 22);
addDeco(new THREE.BoxGeometry(10, 0.5, 5), concreteMat, -50, 3.25, 20);

// ========== E) ORANGE "TA3" BUS ==========
const busX = 15, busZ = -50;
const busGroup = new THREE.Group();
busGroup.position.set(busX, 0, busZ);
scene.add(busGroup);

// Bus Body (Orange)
const busBodyMat = new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.5 });
const busBody = addObs(new THREE.BoxGeometry(4, 3, 9), busBodyMat, busX, 2, busZ);

// Bus Windows
const winMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6 });
addDeco(new THREE.BoxGeometry(4.1, 1, 7), winMat, busX, 2.5, busZ); // Side windows
addDeco(new THREE.BoxGeometry(3.5, 1.5, 0.1), winMat, busX, 2.5, busZ - 4.5); // Front windshield

// Bus Wheels
const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.6, 12);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
[[-1.8, 0.6, 3], [1.8, 0.6, 3], [-1.8, 0.6, -3], [1.8, 0.6, -3]].forEach(([wx, wy, wz]) => {
  const wheel = addDeco(wheelGeo, wheelMat, busX + wx, wy, busZ + wz);
  wheel.rotation.z = Math.PI / 2;
});

// "TA3" Signage (Canvas Texture)
const ta3Canvas = document.createElement('canvas');
ta3Canvas.width = 256; ta3Canvas.height = 128;
const ta3Ctx = ta3Canvas.getContext('2d');
ta3Ctx.fillStyle = '#ff8800';
ta3Ctx.fillRect(0, 0, 256, 128);
ta3Ctx.fillStyle = 'white';
ta3Ctx.font = 'bold 80px sans-serif';
ta3Ctx.textAlign = 'center';
ta3Ctx.fillText('TA3', 128, 90);
const ta3Tex = new THREE.CanvasTexture(ta3Canvas);
const ta3Mat = new THREE.MeshStandardMaterial({ map: ta3Tex, transparent: true });

// Apply sign to sides
const signGeo = new THREE.PlaneGeometry(3, 1.5);
const signL = addDeco(signGeo, ta3Mat, busX - 2.05, 1.8, busZ);
signL.rotation.y = -Math.PI / 2;
const signR = addDeco(signGeo, ta3Mat, busX + 2.05, 1.8, busZ);
signR.rotation.y = Math.PI / 2;

// --- Realism Additions: Headlights, Taillights, Bumpers, Mirrors ---
const bumperMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
const lightMatFront = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 });
const lightMatBack = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.8 });

// Bumpers
addDeco(new THREE.BoxGeometry(4.2, 0.4, 0.4), bumperMat, busX, 0.7, busZ - 4.6); // Front
addDeco(new THREE.BoxGeometry(4.2, 0.4, 0.4), bumperMat, busX, 0.7, busZ + 4.6); // Back

// Headlights (Front)
addDeco(new THREE.BoxGeometry(0.6, 0.4, 0.2), lightMatFront, busX - 1.4, 1.2, busZ - 4.5);
addDeco(new THREE.BoxGeometry(0.6, 0.4, 0.2), lightMatFront, busX + 1.4, 1.2, busZ - 4.5);

// Taillights (Back)
addDeco(new THREE.BoxGeometry(0.6, 0.3, 0.2), lightMatBack, busX - 1.4, 1.2, busZ + 4.5);
addDeco(new THREE.BoxGeometry(0.6, 0.3, 0.2), lightMatBack, busX + 1.4, 1.2, busZ + 4.5);

// ========== E2) TA3 BUS STOP (Otobüs Durağı) ==========
const stopX = busX + 7, stopZ = busZ;
const stopMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0xaaccff, transparent: true, opacity: 0.4 });
const benchMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.8 });

// Stop Platform
addObs(new THREE.BoxGeometry(6, 0.3, 10), concreteMat, stopX, 0.15, stopZ);

// Pillars
[[-2.8, -4.8], [2.8, -4.8], [-2.8, 4.8], [2.8, 4.8]].forEach(([px, pz]) => {
  addObs(new THREE.CylinderGeometry(0.1, 0.1, 3.5, 8), stopMat, stopX + px, 1.75, stopZ + pz);
});

// Back Wall (Glass)
addDeco(new THREE.BoxGeometry(0.1, 3, 9.6), glassMat, stopX + 2.8, 1.5, stopZ);

// Side Walls (Glass)
addDeco(new THREE.BoxGeometry(5.6, 3, 0.1), glassMat, stopX, 1.5, stopZ - 4.8);
addDeco(new THREE.BoxGeometry(5.6, 3, 0.1), glassMat, stopX, 1.5, stopZ + 4.8);

// Roof
addDeco(new THREE.BoxGeometry(6.2, 0.2, 10.2), stopMat, stopX, 3.5, stopZ);

// Bench
addObs(new THREE.BoxGeometry(1, 0.5, 4), benchMat, stopX + 2, 0.5, stopZ);
addObs(new THREE.BoxGeometry(0.1, 1, 0.5), stopMat, stopX + 2, 0.25, stopZ - 1.5);
addObs(new THREE.BoxGeometry(0.1, 1, 0.5), stopMat, stopX + 2, 0.25, stopZ + 1.5);

// "TA3 DURAK" Signage
const durakCanvas = document.createElement('canvas');
durakCanvas.width = 256; durakCanvas.height = 128;
const durakCtx = durakCanvas.getContext('2d');
durakCtx.fillStyle = '#ff8800';
durakCtx.fillRect(0, 0, 256, 128);
durakCtx.fillStyle = 'white';
durakCtx.font = 'bold 50px sans-serif';
durakCtx.textAlign = 'center';
durakCtx.fillText('TA3', 128, 55);
durakCtx.font = 'bold 40px sans-serif';
durakCtx.fillText('DURAK', 128, 100);
const durakTex = new THREE.CanvasTexture(durakCanvas);
const durakMat = new THREE.MeshStandardMaterial({ map: durakTex });

const durakSign = addDeco(new THREE.PlaneGeometry(2, 1), durakMat, stopX - 2.8, 2.5, stopZ);
durakSign.rotation.y = Math.PI / 2;
const durakSignBack = addDeco(new THREE.PlaneGeometry(2, 1), durakMat, stopX - 2.8, 2.5, stopZ);
durakSignBack.rotation.y = -Math.PI / 2;

// Side Mirrors
const mirrorGeo = new THREE.BoxGeometry(0.1, 0.6, 0.4);
addDeco(mirrorGeo, busBodyMat, busX - 2.1, 2.5, busZ - 3.8); // Left mirror arm
addDeco(mirrorGeo, busBodyMat, busX + 2.1, 2.5, busZ - 3.8); // Right mirror arm
addDeco(new THREE.BoxGeometry(0.1, 0.5, 0.3), winMat, busX - 2.2, 2.5, busZ - 3.8); // Left glass
addDeco(new THREE.BoxGeometry(0.1, 0.5, 0.3), winMat, busX + 2.2, 2.5, busZ - 3.8); // Right glass


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

// ========== F) TREES (REMOVED AS REQUESTED) ==========
// Tall trees removed completely.

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

// ========== COLLECTIBLES (Quests) ==========
const collectibles = [];

// Gypsy Girl Mosaic Piece (Collectible for quest)
const gypsyPiece = new THREE.Mesh(
  new THREE.BoxGeometry(1.2, 1.2, 0.2),
  new THREE.MeshStandardMaterial({ map: gkTex, roughness: 0.3 })
);
gypsyPiece.position.set(museumX - 10, 2.5, museumZ + 14.2); 
gypsyPiece.userData = { id: 'museum_piece', collected: false };
scene.add(gypsyPiece);
collectibles.push(gypsyPiece);

// Wilson is the chicken! (No separate sphere needed)


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

// Filter out bush clusters that are too close to buildings or spawn
const SHOP_X = 30, SHOP_Z = -60, BUSH_CLEAR_RADIUS = 22;
const MUSEUM_X = -65, MUSEUM_Z = 55, MUSEUM_CLEAR_RADIUS = 35;
const SPAWN_CLEAR_RADIUS = 20;

// Generate random bushes avoiding buildings
const numBushesToSpawn = 25;
let spawnedBushes = 0;
let attempts = 0;

while (spawnedBushes < numBushesToSpawn && attempts < 200) {
  attempts++;
  // Random position between -90 and 90
  const x = (Math.random() - 0.5) * 180;
  const z = (Math.random() - 0.5) * 180;
  
  // Check distances to restricted zones
  const distToShop = Math.hypot(x - SHOP_X, z - SHOP_Z);
  const distToMuseum = Math.hypot(x - MUSEUM_X, z - MUSEUM_Z);
  const distToSpawn = Math.hypot(x, z);
  
  if (distToShop > BUSH_CLEAR_RADIUS && 
      distToMuseum > MUSEUM_CLEAR_RADIUS && 
      distToSpawn > SPAWN_CLEAR_RADIUS) {
    addBushCluster(x, z);
    spawnedBushes++;
  }
}

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

// ========== DÖNERCİ DÜKKANI (Red Toned) ==========
const donerShopX = 75, donerShopZ = 40; // Moved to a new visible area

const donerShopWallMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.6 }); // Red toned
const donerShopRoofMat = new THREE.MeshStandardMaterial({ color: 0x880000, roughness: 0.5 });
const donerShopFloorMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.9 });

// Shop Floor
const donerShopFloor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 8), donerShopFloorMat);
donerShopFloor.position.set(donerShopX, 0.1, donerShopZ);
donerShopFloor.receiveShadow = true;
scene.add(donerShopFloor);

// Shop Walls (Red)
addObs(new THREE.BoxGeometry(10, 5, 0.4), donerShopWallMat, donerShopX, 2.5, donerShopZ - 4); // back
addObs(new THREE.BoxGeometry(0.4, 5, 8), donerShopWallMat, donerShopX - 5, 2.5, donerShopZ); // left
addObs(new THREE.BoxGeometry(0.4, 5, 8), donerShopWallMat, donerShopX + 5, 2.5, donerShopZ); // right
// Front wall with opening
addObs(new THREE.BoxGeometry(3, 5, 0.4), donerShopWallMat, donerShopX - 3.5, 2.5, donerShopZ + 4);
addObs(new THREE.BoxGeometry(3, 5, 0.4), donerShopWallMat, donerShopX + 3.5, 2.5, donerShopZ + 4);
addDeco(new THREE.BoxGeometry(4, 1, 0.4), donerShopWallMat, donerShopX, 4.5, donerShopZ + 4);

// Shop Roof
addDeco(new THREE.BoxGeometry(11, 0.5, 9), donerShopRoofMat, donerShopX, 5.25, donerShopZ);

// Döner Sign
const donerSignCanvas = document.createElement('canvas');
donerSignCanvas.width = 512; donerSignCanvas.height = 128;
const dsCtx = donerSignCanvas.getContext('2d');
dsCtx.fillStyle = '#ff0000';
dsCtx.fillRect(0, 0, 512, 128);
dsCtx.strokeStyle = '#ffffff';
dsCtx.lineWidth = 8;
dsCtx.strokeRect(10, 10, 492, 108);
dsCtx.fillStyle = '#ffffff';
dsCtx.font = 'bold 60px sans-serif';
dsCtx.textAlign = 'center';
dsCtx.fillText('DÖNERCİ', 256, 85);
const donerSignTex = new THREE.CanvasTexture(donerSignCanvas);
const donerSignMesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshStandardMaterial({ map: donerSignTex }));
donerSignMesh.position.set(donerShopX, 4, donerShopZ + 4.25);
scene.add(donerSignMesh);

// The Döner Vertical Rotisserie (Decorative)
const rotisserieGroup = new THREE.Group();
rotisserieGroup.position.set(donerShopX + 2, 0.5, donerShopZ - 1);
scene.add(rotisserieGroup);
const meatGeo = new THREE.CylinderGeometry(0.5, 0.4, 3, 12);
const meatMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
const meat = new THREE.Mesh(meatGeo, meatMat);
meat.position.y = 1.5;
rotisserieGroup.add(meat);
const standGeo = new THREE.CylinderGeometry(0.1, 0.1, 4, 8);
const standMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
const stand = new THREE.Mesh(standGeo, standMat);
stand.position.y = 2;
rotisserieGroup.add(stand);

// Interaction Logic
const miniGameOverlay = document.getElementById('mini-game-overlay');
const donerList = document.getElementById('doner-list');
const donerScrollView = document.getElementById('doner-scroll-view');
const btnExitMiniGame = document.getElementById('btn-exit-mini-game');
const donerAssetImg = '/doner_kebab_2d_1773464547109.png';

const tiltMessages = [
  "Afiyet olsun hıyarto!",
  "Doymadın mı obez?",
  "Bir tane daha? Yuh!",
  "Miden bayram ediyor...",
  "Eşşek eti de lezzetliymiş ha!",
  "Hala mı yiyorsun?",
  "Daha kaç tane?",
  "Göm bakalım...",
  "Sırada ne var? Fil mi?",
  "Döner bitse sen bitmezsin!",
  "Ustaya selam, yemeğe devam!",
  "Çıkış butonu sağda, zorlama istersen..."
];

let activeDonerIndex = -1;
let activeBiteIndex = 0;
const segmentsPerDoner = 10;
let doners = [];

function createDonerElement() {
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.width = '300px';
  container.style.height = '500px';
  container.style.flexShrink = '0';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.cursor = 'pointer';
  
  const segments = [];
  for (let i = 0; i < segmentsPerDoner; i++) {
    const seg = document.createElement('div');
    seg.style.width = '100%';
    seg.style.height = `${500 / segmentsPerDoner}px`;
    seg.style.backgroundImage = `url(${donerAssetImg})`;
    seg.style.backgroundSize = '300px 500px';
    seg.style.backgroundPosition = `0px -${i * (500 / segmentsPerDoner)}px`;
    seg.style.transition = 'opacity 0.15s, transform 0.25s';
    seg.style.pointerEvents = 'none';
    container.appendChild(seg);
    segments.push(seg);
  }
  
  donerList.appendChild(container);
  return { container, segments };
}

function spawnNewDoner() {
  const newDoner = createDonerElement();
  doners.push(newDoner);
  activeDonerIndex = doners.length - 1;
  activeBiteIndex = 0;
  
  // Scroll to focus on the new doner
  setTimeout(() => {
    donerScrollView.scrollTo({
      left: donerList.scrollWidth,
      behavior: 'smooth'
    });
    
    // Show tilt message
    showTiltMessage();
  }, 50);
}

function showTiltMessage() {
  const msg = tiltMessages[Math.floor(Math.random() * tiltMessages.length)];
  const label = document.createElement('div');
  label.style.position = 'absolute';
  label.style.top = `${20 + Math.random() * 60}%`;
  label.style.left = `${10 + Math.random() * 80}%`;
  label.style.transform = `translate(-50%, -50%) rotate(${(Math.random() - 0.5) * 30}deg)`;
  label.style.fontSize = `${30 + Math.random() * 20}px`;
  label.style.fontWeight = 'bold';
  label.style.color = `hsl(${Math.random() * 360}, 100%, 70%)`;
  label.style.textShadow = '3px 3px 0px black';
  label.style.pointerEvents = 'none';
  label.style.zIndex = '1000';
  label.style.whiteSpace = 'nowrap';
  label.style.transition = 'opacity 0.5s, transform 0.5s';
  label.innerHTML = msg;
  
  miniGameOverlay.appendChild(label);
  
  // Animation: floating up and fading
  setTimeout(() => {
    label.style.opacity = '0';
    label.style.transform = 'translate(-50%, -150%) scale(1.5)';
    setTimeout(() => label.remove(), 500);
  }, 1000);
}

function startMiniGame() {
  gameState = 'MINI_GAME';
  miniGameOverlay.style.display = 'flex';
  document.exitPointerLock();
  
  // Reset game state
  donerList.innerHTML = '';
  doners = [];
  spawnNewDoner();
}

btnExitMiniGame.addEventListener('click', (e) => {
    e.stopPropagation();
    miniGameOverlay.style.display = 'none';
    gameState = 'PLAYING_SP';
    document.body.requestPointerLock();
});

miniGameOverlay.addEventListener('click', (e) => {
    if (gameState !== 'MINI_GAME') return;
    
    if (activeDonerIndex >= 0) {
        const currentDoner = doners[activeDonerIndex];
        if (activeBiteIndex < segmentsPerDoner) {
            // Hide segments one by one (top to bottom)
            currentDoner.segments[activeBiteIndex].style.opacity = '0';
            currentDoner.segments[activeBiteIndex].style.transform = 'translate(20px, -10px) rotate(5deg)';
            activeBiteIndex++;
            
            // Check if finished
            if (activeBiteIndex >= segmentsPerDoner) {
                // Play finish sound
                bakSound.currentTime = 0;
                bakSound.play().catch(e => console.log("Audio play failed:", e));
                advanceQuest('doner');

                // User requirement: "azalsın bitmek üzere oldugunda bütün parçalar tekrar gelsin ve yeni bir tanede yanında oluşsun"
                setTimeout(() => {
                    // Reset current doner to look whole again
                    currentDoner.segments.forEach(seg => {
                        seg.style.opacity = '1';
                        seg.style.transform = 'none';
                    });
                    
                    // Spawn a new one next to it
                    spawnNewDoner();
                }, 300);
            }
        }
    }
});


// ========== YAKUP OSTAN'IN DÜKKANI ==========

const shopX = 30, shopZ = -60;  // Moved: near the trees, south-east area

// Shop building materials
const shopWallMat = new THREE.MeshStandardMaterial({ color: 0xf5e6c8, roughness: 0.7 });
const shopRoofMat = new THREE.MeshStandardMaterial({ color: 0x8B2500, roughness: 0.6 });
const shopFloorMat = new THREE.MeshStandardMaterial({ color: 0xc8a870, roughness: 0.9 });

// Floor
const shopFloor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 10), shopFloorMat);
shopFloor.position.set(shopX, 0.1, shopZ);
shopFloor.receiveShadow = true;
scene.add(shopFloor);

// Walls - front wall has a door gap in the center (door faces +Z = toward spawn)
addObs(new THREE.BoxGeometry(12, 6, 0.4), shopWallMat, shopX, 3, shopZ - 5);  // back wall
// Front wall: left part + right part (door gap in middle = 4 units wide)
addObs(new THREE.BoxGeometry(4, 6, 0.4), shopWallMat, shopX - 4, 3, shopZ + 5);  // front left
addObs(new THREE.BoxGeometry(4, 6, 0.4), shopWallMat, shopX + 4, 3, shopZ + 5);  // front right
// Door lintel above gap
addDeco(new THREE.BoxGeometry(4, 0.7, 0.4), shopWallMat, shopX, 6.6 - 0.35, shopZ + 5);
addObs(new THREE.BoxGeometry(0.4, 6, 10), shopWallMat, shopX - 6, 3, shopZ); // left wall
addObs(new THREE.BoxGeometry(0.4, 6, 10), shopWallMat, shopX + 6, 3, shopZ); // right wall

// Door frame (wooden) - decorative
const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x6B3A1F, roughness: 0.7 });
addDeco(new THREE.BoxGeometry(0.25, 6, 0.25), doorFrameMat, shopX - 2, 3, shopZ + 5); // left frame
addDeco(new THREE.BoxGeometry(0.25, 6, 0.25), doorFrameMat, shopX + 2, 3, shopZ + 5); // right frame

// Roof
addDeco(new THREE.BoxGeometry(13, 0.4, 11), shopRoofMat, shopX, 6.2, shopZ);
// Peaked top to look like Turkish shop
addDeco(new THREE.ConeGeometry(8.5, 2, 4), shopRoofMat, shopX, 7.6, shopZ);

// Counter inside
const counterMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.6 });
addObs(new THREE.BoxGeometry(6, 1.2, 1), counterMat, shopX + 1, 0.6, shopZ - 3);

// Shop sign (above door)
const shopSignCanvas = document.createElement('canvas');
shopSignCanvas.width = 768; shopSignCanvas.height = 160;  // bigger canvas so text doesn't clip
const ssc = shopSignCanvas.getContext('2d');
// Background gradient
const grad = ssc.createLinearGradient(0, 0, 768, 0);
grad.addColorStop(0, '#3a1800');
grad.addColorStop(0.5, '#5c2800');
grad.addColorStop(1, '#3a1800');
ssc.fillStyle = grad;
ssc.fillRect(0, 0, 768, 160);
ssc.strokeStyle = '#FFD700';
ssc.lineWidth = 6;
ssc.strokeRect(6, 6, 756, 148);
ssc.strokeStyle = '#FF8C00';
ssc.lineWidth = 2;
ssc.strokeRect(14, 14, 740, 132);
ssc.fillStyle = '#FFD700';
ssc.font = 'bold 40px serif';
ssc.textAlign = 'center';
ssc.fillText('YAKUP OSTAN\'IN DÜKKANI', 384, 68);
ssc.font = '26px serif';
ssc.fillStyle = '#FFA500';
ssc.fillText('Eşşek Etli Tatlı Dükkanı  —  Gaziantep Baklavası', 384, 118);
const shopSignTex = new THREE.CanvasTexture(shopSignCanvas);
const shopSign = new THREE.Mesh(
  new THREE.PlaneGeometry(11, 2.2),  // wider so text fits
  new THREE.MeshStandardMaterial({ map: shopSignTex, roughness: 0.3, side: THREE.DoubleSide })
);
shopSign.position.set(shopX, 5.5, shopZ + 5.4);
shopSign.rotation.y = 0; // faces +Z outward (toward player spawn)
scene.add(shopSign);

// ========== BAKLAVA ITEM ==========
const baklavas = [];
const baklavaMat = new THREE.MeshStandardMaterial({ color: 0xDAA520, roughness: 0.4, metalness: 0.1 });
const baklavaSyrupMat = new THREE.MeshStandardMaterial({ color: 0xFF8C00, roughness: 0.2, metalness: 0.2 });

function createBaklava(bx, by, bz) {
  const group = new THREE.Group();
  // Diamond rhombus shape (rotated box)
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), baklavaMat);
  base.rotation.y = Math.PI / 4;
  group.add(base);
  // Syrup drizzle layer on top
  const syrup = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.65), baklavaSyrupMat);
  syrup.rotation.y = Math.PI / 4;
  syrup.position.y = 0.18;
  group.add(syrup);
  // Pistachio dot on top
  const pistGeo = new THREE.SphereGeometry(0.12, 6, 4);
  const pistMat = new THREE.MeshStandardMaterial({ color: 0x5a8a3a, roughness: 0.6 });
  const pist = new THREE.Mesh(pistGeo, pistMat);
  pist.position.y = 0.25;
  group.add(pist);
  
  group.position.set(bx, by, bz);
  group.castShadow = true;
  scene.add(group);
  baklavas.push({ group, active: true });
}

// Place baklavas on the counter top (counter Y=0.6, height=1.2 -> top at Y=1.2; baklava base H=0.3 -> center at Y=1.35)
for (let i = 0; i < 4; i++) {
  createBaklava(shopX - 1 + i * 0.9, 1.35, shopZ - 3);
}

// Interaction UI hint
const interactHint = document.createElement('div');
interactHint.style.position = 'absolute';
interactHint.style.bottom = '80px';
interactHint.style.width = '100%';
interactHint.style.textAlign = 'center';
interactHint.style.color = '#FFD700';
interactHint.style.fontSize = '22px';
interactHint.style.fontFamily = 'sans-serif';
interactHint.style.fontWeight = 'bold';
interactHint.style.textShadow = '2px 2px 5px rgba(0,0,0,0.9)';
interactHint.style.display = 'none';
interactHint.style.pointerEvents = 'none';
interactHint.innerHTML = '[E] Baklava Ye 🥮';
document.body.appendChild(interactHint);

// ========== DRAGON BALL POWER-UP SYSTEM ==========
let isPoweredUp = false;
let powerUpTimer = 0;
const powerUpDuration = 10.0; // 10 seconds
const auraParticles = [];
const auraGroup = new THREE.Group();
scene.add(auraGroup);

// Particle materials - golden glow
const auraMat = new THREE.MeshStandardMaterial({
  color: 0xFFD700,
  emissive: 0xFFAA00,
  emissiveIntensity: 2.0,
  transparent: true,
  opacity: 0.9
});

// Create aura particle system (attached to player)
function createAuraParticles() {
  auraGroup.clear();
  for (let i = 0; i < 30; i++) {
    const size = 0.1 + Math.random() * 0.25;
    const pGeo = new THREE.SphereGeometry(size, 4, 4);
    const pMesh = new THREE.Mesh(pGeo, auraMat.clone());
    // Random position within aura radius
    const angle = Math.random() * Math.PI * 2;
    const r = 0.4 + Math.random() * 0.8;
    const h = Math.random() * 3;
    pMesh.position.set(Math.cos(angle) * r, h, Math.sin(angle) * r);
    pMesh.userData = {
      angle,
      radius: r,
      heightStart: Math.random() * 3,
      speed: 0.5 + Math.random() * 2.0,
      phase: Math.random() * Math.PI * 2
    };
    auraGroup.add(pMesh);
    auraParticles.push(pMesh);
  }
  auraGroup.visible = false;
}
createAuraParticles();

// Power-up flash overlay (screen flash effect)
const powerFlash = document.createElement('div');
powerFlash.style.position = 'absolute';
powerFlash.style.top = '0'; powerFlash.style.left = '0';
powerFlash.style.width = '100%'; powerFlash.style.height = '100%';
powerFlash.style.backgroundColor = 'rgba(255,215,0,0)';
powerFlash.style.pointerEvents = 'none';
powerFlash.style.zIndex = '6';
powerFlash.style.transition = 'background-color 0.1s ease';
document.body.appendChild(powerFlash);

// Power-up UI indicator
const powerUpUI = document.createElement('div');
powerUpUI.style.position = 'absolute';
powerUpUI.style.top = '60px';
powerUpUI.style.left = '50%';
powerUpUI.style.transform = 'translateX(-50%)';
powerUpUI.style.padding = '8px 22px';
powerUpUI.style.borderRadius = '30px';
powerUpUI.style.background = 'linear-gradient(90deg, #FFD700, #FF8C00, #FFD700)';
powerUpUI.style.color = '#1a0000';
powerUpUI.style.fontWeight = 'bold';
powerUpUI.style.fontSize = '20px';
powerUpUI.style.fontFamily = 'sans-serif';
powerUpUI.style.display = 'none';
powerUpUI.style.boxShadow = '0 0 20px 5px rgba(255,215,0,0.8)';
powerUpUI.style.animation = 'pulse 0.5s ease-in-out infinite alternate';
powerUpUI.innerHTML = '⚡ GÜÇLENME AKTİF ⚡';
document.body.appendChild(powerUpUI);

// UI: "Güç seninle" overlay text
const gucOverlay = document.createElement('div');
gucOverlay.style.position = 'absolute';
gucOverlay.style.top = '40%';
gucOverlay.style.left = '50%';
gucOverlay.style.transform = 'translate(-50%, -50%)';
gucOverlay.style.color = '#FFD700'; // Gold
gucOverlay.style.fontSize = '80px';
gucOverlay.style.fontFamily = 'Impact, sans-serif';
gucOverlay.style.fontWeight = 'bold';
gucOverlay.style.textShadow = '0 0 20px #ff0000, 4px 4px 8px black';
gucOverlay.style.display = 'none';
gucOverlay.style.zIndex = '1000';
gucOverlay.style.pointerEvents = 'none';
gucOverlay.innerHTML = 'GÜÇ SENİNLE!';
document.body.appendChild(gucOverlay);

// Add CSS animation for pulsing
const styleEl = document.createElement('style');
styleEl.textContent = `
  @keyframes pulse {
    from { box-shadow: 0 0 15px 3px rgba(255,215,0,0.7); transform: translateX(-50%) scale(1); }
    to { box-shadow: 0 0 30px 10px rgba(255,165,0,0.9); transform: translateX(-50%) scale(1.05); }
  }
  @keyframes auraFlash {
    0%   { background-color: rgba(255,215,0,0); }
    30%  { background-color: rgba(255,215,0,0.5); }
    60%  { background-color: rgba(255,255,100,0.3); }
    100% { background-color: rgba(255,215,0,0); }
  }
`;
document.head.appendChild(styleEl);

function activatePowerUp() {
  if (isPoweredUp) { powerUpTimer = powerUpDuration; return; }
  isPoweredUp = true;
  powerUpTimer = powerUpDuration;
  auraGroup.visible = true;
  powerUpUI.style.display = 'block';
  
  // Show "Güç seninle" text
  gucOverlay.style.display = 'block';
  setTimeout(() => { gucOverlay.style.display = 'none'; }, 2000);

  // Play scream sound
  screamSound.currentTime = 0;
  screamSound.play().catch(e => console.log("Audio play failed:", e));

  // Screen flash like Dragon Ball
  powerFlash.style.animation = 'auraFlash 0.6s ease-out forwards';
  setTimeout(() => { powerFlash.style.animation = ''; }, 700);
}

function deactivatePowerUp() {
  isPoweredUp = false;
  auraGroup.visible = false;
  powerUpUI.style.display = 'none';
}

// ========== YAKOP NPC CHARACTER (2D SPRITE) ==========
// We use a THREE.Sprite so it always faces the camera (billboarding)
const yakopSpriteMap = new THREE.TextureLoader().load('/yakup_sprite.png');
// Make sure pixel filtering looks good for sprites
yakopSpriteMap.colorSpace = THREE.SRGBColorSpace;
const yakopSpriteMat = new THREE.SpriteMaterial({ map: yakopSpriteMap, color: 0xffffff });
const yakopGroup = new THREE.Sprite(yakopSpriteMat); // Keep name yakopGroup so labels still work
// The original image is ~512x512, let's scale it to fit a person's height (~3.5 units tall here because it's a half-body shot mainly)
yakopGroup.scale.set(3.5, 3.5, 1);
// Position him correctly on the ground (since sprite center is at the middle, we raise it by half its scale)
// Moved slightly left (shopX - 1.5) as requested
yakopGroup.position.set(shopX - 1.5, 1.75, shopZ - 2); 
scene.add(yakopGroup);

// Yakop name label (floating above head)
const yakopLabelCanvas = document.createElement('canvas');
yakopLabelCanvas.width = 384; yakopLabelCanvas.height = 64;
const ylc = yakopLabelCanvas.getContext('2d');
ylc.fillStyle = 'rgba(0,0,0,0.75)';
ylc.roundRect(0, 0, 384, 64, 10);
ylc.fill();
ylc.fillStyle = '#FFD700';
ylc.font = 'bold 26px sans-serif';
ylc.textAlign = 'center';
ylc.fillText('Yakup Ostan', 192, 30);
ylc.fillStyle = '#aaa';
ylc.font = '18px sans-serif';
ylc.fillText('Baklava Ustası', 192, 54);
const yakopLabelTex = new THREE.CanvasTexture(yakopLabelCanvas);
const yakopLabel = new THREE.Mesh(
  new THREE.PlaneGeometry(2.5, 0.42),
  new THREE.MeshStandardMaterial({ map: yakopLabelTex, transparent: true, side: THREE.DoubleSide })
);
yakopLabel.position.set(shopX - 1.5, 3.2, shopZ - 2);
scene.add(yakopLabel);

// Baklava interaction variables
let nearBaklava = false;

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

// 7. Player Character (Default is Chaser/Thanos in singleplayer)
const playerGroup = new THREE.Group();
playerGroup.position.set(8, 0, 8); // Spawn away from fountain
scene.add(playerGroup);

let playerThanos = null; // Will hold the Thanos GLTF model once loaded

const playerGeo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
const playerMat = new THREE.MeshStandardMaterial({ color: 0x8a2be2 }); // Thanos Purple
const playerMesh = new THREE.Mesh(playerGeo, playerMat);
playerMesh.position.y = 1; // Sit on ground
playerMesh.castShadow = true;
playerGroup.add(playerMesh);

// Add a pointer to show which way player faces
const noseGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
const noseMat = new THREE.MeshStandardMaterial({ color: 0xffd700 }); // Thanos Gold
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
runnerMesh.visible = false; // Hidden, face photo replaces it
runnerGroup.add(runnerMesh);

const runnerNoseMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const runnerNose = new THREE.Mesh(noseGeo, runnerNoseMat);
runnerNose.position.set(0, 1.5, -0.5);
runnerNose.visible = false; // Hidden
runnerGroup.add(runnerNose);

// Runner face texture (maxresdefault.jpg) - always faces the player
const runnerFaceTex = new THREE.TextureLoader().load('/maxresdefault.jpg');
const runnerFace = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3),
  new THREE.MeshStandardMaterial({ map: runnerFaceTex, transparent: true, side: THREE.DoubleSide })
);
runnerFace.position.set(0, 2, 0);
runnerGroup.add(runnerFace);

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
const yaniyAudio = new Audio('/yaniy.mp3');

window.addEventListener('mousedown', (e) => {
  if (e.button === 0 && document.pointerLockElement === document.body) {
    if (gameState === 'PLAYING_SP') {
      const dist = playerGroup.position.distanceTo(runnerGroup.position);
      if (dist < catchDistance && !runnerCaught) {
        runnerCaught = true;
        
        yaniyAudio.currentTime = 0;
        yaniyAudio.play().catch(e => console.log('Yaniy sound error:', e));

        score++;
        advanceQuest('runner');
        if (typeof scoreDisplay !== 'undefined') scoreDisplay.innerHTML = 'Score: ' + score;
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
    } else if (gameState === 'PLAYING_MP' && myTeam === 'chaser') {
      for (const id in remotePlayers) {
        const rp = remotePlayers[id];
        if (rp.team === 'runner') {
          const dist = playerGroup.position.distanceTo(rp.group.position);
          if (dist < catchDistance) {
            yaniyAudio.currentTime = 0;
            yaniyAudio.play().catch(e => console.log('Yaniy sound error:', e));
            socket.emit('catchRunner'); // Tells server
            break; // Stop after first catch
          }
        }
      }
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
  // E key: eat baklava!
  if ((e.code === 'KeyE' || e.key === 'e' || e.key === 'E')) {
    if (nearBaklava) {
        // Find the first active baklava
        const baklavaEntry = baklavas.find(b => b.active);
        if (baklavaEntry) {
        baklavaEntry.active = false;
        baklavaEntry.group.visible = false; // Eaten!
        activatePowerUp();
        advanceQuest('baklava');
        }
    }
    // Check for Dönerci
    const distToDoner = playerGroup.position.distanceTo(new THREE.Vector3(donerShopX, 0, donerShopZ + 4));
    if (distToDoner < 4) {
        startMiniGame();
    }
    // Check for Wilson (chicken)
    if (!wilsonCollected) {
      const distToWilson = playerGroup.position.distanceTo(wilsonPos);
      if (distToWilson < 4) {
        wilsonCollected = true;
        advanceQuest('wilson');
      }
    }
    // Check for Final Door
    if (!finalDoorOpen && score >= 60) {
      const distToDoor = playerGroup.position.distanceTo(doorPos);
      if (distToDoor < 5) {
        triggerFinalEnding();
      }
    }
  }

  // V key: toggle first / third person
  if (e.code === 'KeyV' || e.key === 'v' || e.key === 'V') {
    firstPerson = !firstPerson;
    // Hide/show player mesh in first-person (avoid seeing your own capsule or Thanos)
    if (myTeam === 'runner') {
      playerMesh.visible = !firstPerson;
      if (nose) nose.visible = !firstPerson;
    } else {
      if (playerThanos) playerThanos.visible = !firstPerson;
      playerMesh.visible = false;
      if (nose) nose.visible = false;
    }
  }
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
  animateChicken();

  const delta = clock.getDelta();

  // Interpolate remote players
  if (gameState === 'PLAYING_MP') {
    for (const id in remotePlayers) {
      const rp = remotePlayers[id];
      if (rp.targetPos) {
        rp.group.position.lerp(new THREE.Vector3(rp.targetPos.x, rp.targetPos.y, rp.targetPos.z), 0.2);
        // Optimize rotation
        let diff = rp.targetPos.r - rp.group.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        rp.group.rotation.y += diff * 10 * delta;
      }
    }
  }

  // Always render the scene so the background isn't black
  renderer.render(scene, camera);

  if (gameState !== 'PLAYING_SP' && gameState !== 'PLAYING_MP') {
    return; // Stop physics/movement if in menu
  }

  // ========== BAKLAVA PROXIMITY CHECK ==========
  const baklavaCenterX = shopX - 1 + 1.5; // center of baklava row
  const baklavaCenterZ = shopZ - 3; // counter is now at shopZ-3
  const distToBaklava = Math.sqrt(
    Math.pow(playerGroup.position.x - baklavaCenterX, 2) +
    Math.pow(playerGroup.position.z - baklavaCenterZ, 2)
  );
  const hasBaklava = baklavas.some(b => b.active);
  nearBaklava = distToBaklava < 4 && hasBaklava;
  interactHint.style.display = nearBaklava ? 'block' : 'none';

  // ========== VIDEO PROXIMITY CHECK ==========
  if (playerGroup) {
      const bridgePos = new THREE.Vector3(-15, 0, 0);
      const distToBridge = playerGroup.position.distanceTo(bridgePos);
      
      if (distToBridge < 8) {
        if (!videoTriggered && !videoPlaying && videoOverlay && proxVideo) {
          videoTriggered = true;
          videoPlaying = true;
          videoOverlay.style.display = 'flex';
          proxVideo.currentTime = 0;
          proxVideo.play().catch(e => {
            console.log("Video play failed:", e);
            videoTriggered = false;
            videoPlaying = false;
            videoOverlay.style.display = 'none';
          });
        }
      } else {
        if (!videoPlaying) videoTriggered = false;
      }

      // ========== MUSEUM MUSIC PROXIMITY CHECK ==========
      const distToMuseumRect = Math.max(Math.abs(playerGroup.position.x - museumX), Math.abs(playerGroup.position.z - museumZ));
      if (distToMuseumRect < 15) { // Inside the 30x30 museum
        if (!museumMusicPlaying) {
          museumSound.play().catch(e => console.log("Museum music play failed:", e));
          museumMusicPlaying = true;
        }
      } else {
        if (museumMusicPlaying) {
          museumSound.pause();
          museumSound.currentTime = 0; // Reset as requested (or just stay paused)
          museumMusicPlaying = false;
        }
      }
      
      // ========== QUEST PROXIMITY CHECKS ==========
      // 1. Museum Piece
      if (typeof gypsyPiece !== 'undefined' && !gypsyPiece.userData.collected) {
        const distToPiece = playerGroup.position.distanceTo(gypsyPiece.position);
        if (distToPiece < 3) {
          gypsyPiece.userData.collected = true;
          gypsyPiece.visible = false;
          advanceQuest('museum_piece');
        }
      }

      // 2. Wilson (chicken) - show hint, collect with E key
      if (!wilsonCollected) {
        const distToWilson = playerGroup.position.distanceTo(wilsonPos);
        if (distToWilson < 4) {
          interactHint.style.display = 'block';
          interactHint.innerHTML = '[E] Wilson\'u Ziyaret Et 🐔';
        }
      }

      // 3. TA3 Bus Stop
      if (typeof stopX !== 'undefined') {
        const distToStop = playerGroup.position.distanceTo(new THREE.Vector3(stopX, 0, stopZ));
        if (distToStop < 6) {
          advanceQuest('bus_stop');
        }
      }
  }

  // Animate baklavas (gentle bob)
  const baklavaBob = Math.sin(clock.elapsedTime * 2) * 0.05;
  baklavas.forEach(b => { if (b.active) b.group.position.y = 1.4 + baklavaBob; });

  // ========== POWER-UP UPDATE ==========
  if (isPoweredUp) {
    powerUpTimer -= delta;
    
    // Update aura particle positions (spiral rising)
    auraGroup.position.copy(playerGroup.position);
    const t = clock.elapsedTime;
    auraParticles.forEach((p, i) => {
      const d = p.userData;
      const spiralAngle = d.angle + t * d.speed;
      const spiralR = d.radius * (0.7 + Math.sin(t * d.speed + d.phase) * 0.3);
      const h = ((d.heightStart + t * d.speed * 0.5) % 3.2);
      p.position.set(Math.cos(spiralAngle) * spiralR, h, Math.sin(spiralAngle) * spiralR);
      // Fade out near top
      p.material.opacity = h > 2.5 ? (1 - (h - 2.5) / 0.7) * 0.9 : 0.9;
    });
    
    // Make player slightly glow yellow while powered up
    if (playerMesh && playerMesh.material) {
      playerMesh.material.emissive = playerMesh.material.emissive || new THREE.Color();
      playerMesh.material.emissiveIntensity = 0.3 + Math.sin(t * 8) * 0.2;
      if (!playerMesh.material._originalColor) {
        playerMesh.material._originalColor = playerMesh.material.color.clone();
      }
      playerMesh.material.emissive.setHex(0xFFD700);
    }

    if (powerUpTimer <= 0) {
      deactivatePowerUp();
      // Reset player glow
      if (playerMesh && playerMesh.material) {
        playerMesh.material.emissiveIntensity = 0;
      }
    }
  }

  // Yakop label always faces camera
  if (yakopLabel) {
    yakopLabel.lookAt(camera.position);
  }

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

  // 1. Camera (First Person or Third Person)
  if (firstPerson) {
    // First-person: eye level at head height, looking in cameraYaw direction
    const eyeHeight = 1.7; // eye height above ground
    const fpEyeX = playerGroup.position.x;
    const fpEyeY = playerGroup.position.y + eyeHeight;
    const fpEyeZ = playerGroup.position.z;
    camera.position.set(fpEyeX, fpEyeY, fpEyeZ);
    // Look direction must use same sign as camForward (+sin, +cos) so WASD stays consistent
    const lookDirX = Math.sin(cameraYaw) * Math.cos(cameraPitch);
    const lookDirY = -Math.sin(cameraPitch);
    const lookDirZ = Math.cos(cameraYaw) * Math.cos(cameraPitch);
    camera.lookAt(fpEyeX + lookDirX, fpEyeY + lookDirY, fpEyeZ + lookDirZ);
  } else {
    // Third-person orbit camera
    const horizontalDistance = cameraDistance * Math.cos(cameraPitch);
    const verticalDistance = cameraDistance * Math.sin(cameraPitch);
    const camX = playerGroup.position.x - horizontalDistance * Math.sin(cameraYaw);
    const camZ = playerGroup.position.z - horizontalDistance * Math.cos(cameraYaw);
    const camY = playerGroup.position.y + verticalDistance + 2;
    camera.position.set(camX, camY, camZ);
    camera.lookAt(playerGroup.position.x, playerGroup.position.y + 2, playerGroup.position.z);
  }

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

  // AI & Multiplayer Sync Logic
  if (gameState === 'PLAYING_SP') {
    runnerGroup.visible = true;
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
  } else if (gameState === 'PLAYING_MP') {
    runnerGroup.visible = false; // Hide AI

    // Crosshair hint for MP
    if (myTeam === 'chaser') {
      let canCatch = false;
      for (const id in remotePlayers) {
        const rp = remotePlayers[id];
        if (rp.team === 'runner') {
          const dist = playerGroup.position.distanceTo(rp.group.position);
          if (dist < catchDistance) {
            canCatch = true;
            break;
          }
        }
      }
      setCrosshairColor(canCatch ? '#00ff88' : 'white');
    } else {
      setCrosshairColor('white');
    }

    // Broadcast position
    if (socket) {
      socket.emit('playerMove', {
        x: playerGroup.position.x,
        y: playerGroup.position.y,
        z: playerGroup.position.z,
        r: playerGroup.rotation.y,
        isStunned: isStunned
      });
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

  // Döner Shop Proximity Hint
  const distToDoner = playerGroup.position.distanceTo(new THREE.Vector3(donerShopX, 0, donerShopZ + 4));
  const nearWilson = !wilsonCollected && playerGroup.position.distanceTo(wilsonPos) < 4;
  if (distToDoner < 4 && gameState !== 'MINI_GAME') {
    interactHint.style.display = 'block';
    interactHint.innerHTML = '[E] Döner Ye 🌯';
  } else if (nearWilson) {
    interactHint.style.display = 'block';
    interactHint.innerHTML = '[E] Wilson\'u Ziyaret Et 🐔';
  } else if (!nearBaklava) {
    interactHint.style.display = 'none';
  }

  // Final Door proximity hint
  if (!finalDoorOpen) {
    const distToDoor = playerGroup.position.distanceTo(doorPos);
    if (distToDoor < 6) {
      interactHint.style.display = 'block';
      if (score >= 60) {
        interactHint.innerHTML = '[E] Kapıyı Aç 🚪✨';
      } else {
        interactHint.innerHTML = '🔒 Kapı Kilitli (60 puan gerekli)';
      }
    }
  }

  // Final Door pulsing animation
  if (doorPanel && !finalDoorOpen) {
    const pulse = Math.sin(clock.elapsedTime * 3) * 0.5 + 1.5;
    doorGlowMat.emissiveIntensity = pulse;
    doorLight.intensity = pulse * 2;
  }

  // Wilson label faces camera
  if (wilsonLabel && !wilsonCollected) {
    wilsonLabel.lookAt(camera.position);
  }
  // Runner face always faces camera
  if (runnerFace) {
    const faceWorldPos = new THREE.Vector3();
    runnerFace.getWorldPosition(faceWorldPos);
    runnerFace.lookAt(camera.position);
  }
  // Door label faces camera
  if (doorLabel) {
    doorLabel.lookAt(camera.position);
  }

  // Mini Game Rotation (Rotisserie)
  if (rotisserieGroup) {
    rotisserieGroup.rotation.y += delta * 2;
  }

  renderer.render(scene, camera);

}

// Start loop
animate();
