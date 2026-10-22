// ============================================================
// Hero 3D scene — "The Data Circuit"
// A glowing racing line lapped by a car light with a telemetry
// trail, beneath a floating neural-network node cloud.
// Three.js via CDN import map. Degrades silently without WebGL.
// ============================================================
import * as THREE from "three";

const canvas = document.getElementById("hero-canvas");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 768px)").matches;

const COLORS = {
  bg: 0x0a0a0b,
  red: 0xe10600,
  redBright: 0xff2a1f,
  amber: 0xffb000,
  white: 0xf2f1ed,
  grid: 0x1a1a1c,
};

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch {
  // No WebGL — the CSS background carries the hero on its own.
  canvas.remove();
  throw new Error("WebGL unavailable; hero falls back to flat background");
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(COLORS.bg, 16, 38);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
camera.position.set(0, 5.6, 15);
camera.lookAt(0, 1, 0);

// World group — gets the mouse-parallax rotation
const world = new THREE.Group();
scene.add(world);

// ---------- Floor grid (fades into fog) ----------
const grid = new THREE.GridHelper(64, 56, COLORS.grid, COLORS.grid);
grid.position.y = -1.7;
grid.material.transparent = true;
grid.material.opacity = 0.55;
world.add(grid);

// ---------- Racing circuit: a real track map ----------
// The circuit comes from data/last-race.json (the last or next MotoGP venue,
// refreshed daily with PyMotoGP), falling back to Sepang, then to a sketch.
// Outlines are normalised to [-1, 1] with north = +y, start/finish first,
// in racing direction. Everything below lives in a unit-sized track group
// that layout() scales and places on screen.
const LEGACY_SKETCH = [[-0.91, 0.36], [-0.36, 0.47], [0.18, 0.5], [0.64, 0.43], [0.96, 0.22], [0.91, -0.05], [0.67, -0.18],
  [0.76, -0.37], [0.53, -0.5], [0.18, -0.38], [-0.15, -0.48], [-0.45, -0.4], [-0.69, -0.46], [-0.96, -0.27], [-1, 0.05]];

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((r) => setTimeout(() => r(null), ms))]);
let outline = (await withTimeout(window.lastRace ?? Promise.resolve(null), 2500))?.track?.points;
if (!outline) {
  outline = await withTimeout(
    fetch("data/circuits.json").then((r) => r.json()).then((d) => d.circuits.sepang.points).catch(() => null), 2500);
}
outline ??= LEGACY_SKETCH;

const track = new THREE.Group();
world.add(track);

const curve = new THREE.CatmullRomCurve3(outline.map(([x, y]) => new THREE.Vector3(x, 0, -y)), true, "centripetal");

// Racing line coloured by sector (S1 red, S2 amber, S3 green — same as the strip below)
const SECTOR_COLORS = [COLORS.red, COLORS.amber, 0x00d26a];
const lineMats = [];
SECTOR_COLORS.forEach((color, s) => {
  const pts = [];
  for (let i = 0; i <= 120; i++) pts.push(curve.getPointAt(Math.min((s + i / 120) / 3, 1)));
  const sectorCurve = new THREE.CatmullRomCurve3(pts);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, fog: false });
  lineMats.push(mat);
  track.add(new THREE.Mesh(new THREE.TubeGeometry(sectorCurve, 160, 0.011, 6, false), mat));
});

// Soft glow sheath around the line (additive, faint)
const glowMat = new THREE.MeshBasicMaterial({
  color: COLORS.red,
  fog: false,
  transparent: true,
  opacity: 0.12,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
track.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 320, 0.04, 6, true), glowMat));

// Start/finish gate: two thin posts across the track at t=0
const gatePos = curve.getPointAt(0);
const across = new THREE.Vector3().crossVectors(curve.getTangentAt(0), new THREE.Vector3(0, 1, 0)).normalize();
const gateMat = new THREE.MeshBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0.6 });
for (const side of [-0.07, 0.07]) {
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.16, 0.008), gateMat);
  post.position.copy(gatePos).addScaledVector(across, side).setY(0.08);
  track.add(post);
}

// ---------- The car (a bright light tracing the lap) ----------
const car = new THREE.Mesh(
  new THREE.SphereGeometry(0.026, 12, 12),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
const carGlow = new THREE.Mesh(
  new THREE.SphereGeometry(0.055, 12, 12),
  new THREE.MeshBasicMaterial({
    color: COLORS.amber,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
track.add(car, carGlow);

// Precompute a curvature profile so the car brakes for corners
const CURV_SAMPLES = 720;
const speedProfile = new Float32Array(CURV_SAMPLES);
{
  let maxCurv = 0;
  const curvs = new Float32Array(CURV_SAMPLES);
  for (let i = 0; i < CURV_SAMPLES; i++) {
    const t0 = i / CURV_SAMPLES;
    const t1 = (i + 1) / CURV_SAMPLES;
    const a = curve.getTangentAt(t0);
    const b = curve.getTangentAt(t1 % 1);
    curvs[i] = a.angleTo(b);
    maxCurv = Math.max(maxCurv, curvs[i]);
  }
  for (let i = 0; i < CURV_SAMPLES; i++) {
    // Smooth over a small window so braking starts before the apex
    let c = 0;
    for (let k = -6; k <= 10; k++) c = Math.max(c, curvs[(i + k + CURV_SAMPLES) % CURV_SAMPLES]);
    speedProfile[i] = 1 - 0.72 * Math.min(c / maxCurv, 1);
  }
}

// ---------- Telemetry trail behind the car ----------
const TRAIL_LEN = isMobile ? 70 : 130;
const trailPositions = new Float32Array(TRAIL_LEN * 3);
const trailColors = new Float32Array(TRAIL_LEN * 3);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
trailGeo.setAttribute("color", new THREE.BufferAttribute(trailColors, 3));
const trailMat = new THREE.PointsMaterial({
  size: 0.12,
  vertexColors: true,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
});
track.add(new THREE.Points(trailGeo, trailMat));
const trailHistory = [];
const amberColor = new THREE.Color(COLORS.amber);

// ---------- Neural network cloud ----------
const NODE_COUNT = isMobile ? 42 : 76;
const nodesGroup = new THREE.Group();
nodesGroup.position.y = 5.2;
world.add(nodesGroup);

const nodePositions = [];
for (let i = 0; i < NODE_COUNT; i++) {
  nodePositions.push(new THREE.Vector3(
    (Math.random() - 0.5) * 22,
    (Math.random() - 0.5) * 6,
    (Math.random() - 0.5) * 10
  ));
}

const nodeGeo = new THREE.BufferGeometry().setFromPoints(nodePositions);
const nodeMat = new THREE.PointsMaterial({
  color: COLORS.white,
  size: 0.09,
  transparent: true,
  opacity: 0.75,
  sizeAttenuation: true,
});
nodesGroup.add(new THREE.Points(nodeGeo, nodeMat));

// Connect nearby nodes
const edges = [];
const edgeVerts = [];
for (let i = 0; i < NODE_COUNT; i++) {
  for (let j = i + 1; j < NODE_COUNT; j++) {
    if (nodePositions[i].distanceTo(nodePositions[j]) < 3.4) {
      edges.push([i, j]);
      edgeVerts.push(nodePositions[i], nodePositions[j]);
    }
  }
}
const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgeVerts);
const edgeMat = new THREE.LineBasicMaterial({
  color: COLORS.amber,
  transparent: true,
  opacity: 0.09,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
nodesGroup.add(new THREE.LineSegments(edgeGeo, edgeMat));

// Signals firing across random edges — the network "thinking"
const SIGNAL_COUNT = isMobile ? 6 : 12;
const signals = [];
const signalGeo = new THREE.BufferGeometry();
const signalPositions = new Float32Array(SIGNAL_COUNT * 3);
signalGeo.setAttribute("position", new THREE.BufferAttribute(signalPositions, 3));
const signalMat = new THREE.PointsMaterial({
  color: COLORS.redBright,
  size: 0.17,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
nodesGroup.add(new THREE.Points(signalGeo, signalMat));
for (let i = 0; i < SIGNAL_COUNT; i++) {
  signals.push({ edge: Math.floor(Math.random() * edges.length), t: Math.random(), speed: 0.4 + Math.random() * 0.9 });
}

// ---------- Mouse parallax ----------
const pointer = { x: 0, y: 0 };
window.addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
}, { passive: true });

// ---------- Layout: where the track map sits on screen ----------
// Wide screens: the free space right of the hero text (above the race board),
// measured from the DOM. Narrow screens: low and dimmed behind the content.
// The map is fitted with real projections from the resting camera.
const BASE_CAM = new THREE.Vector3(0, 5.6, 15);
const raycaster = new THREE.Raycaster();
// The map is anchored on an upright plane through the origin (constant distance,
// clear of the fog) and tilted so it always reads at about the same angle.
const trackPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const MAP_VIEW_ANGLE = 1.1; // radians between the line of sight and the map plane
const xs = outline.map((p) => p[0]);
const ys = outline.map((p) => p[1]);
const corners = [];
for (const x of [Math.min(...xs), Math.max(...xs)]) {
  for (const y of [Math.min(...ys), Math.max(...ys)]) corners.push(new THREE.Vector3(x, 0, -y));
}

function layout() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const hero = canvas.parentElement.getBoundingClientRect();
  const rects = (sel) => [...document.querySelectorAll(sel)].flatMap((n) => [...n.getClientRects()]).filter((r) => r.width);
  const textRight = Math.max(0, ...rects(".hero-kicker, .hero-headline .race-only, .hero-sub.race-only").map((r) => r.right - hero.left));
  const board = document.getElementById("race-board");
  const boardShown = board && !board.hidden && board.offsetWidth > 0;
  const boardFloats = boardShown && getComputedStyle(board).position === "absolute";
  const boardBox = boardShown ? board.getBoundingClientRect() : null;
  const sectors = document.querySelector(".hero-sectors")?.getBoundingClientRect();
  const navH = document.querySelector(".nav-wrap")?.offsetHeight || 72;
  const hint = document.getElementById("mode-hint");
  const hintBottom = hint?.isConnected && hint.offsetWidth ? hint.getBoundingClientRect().bottom - hero.top : 0;
  const fits = (b) => b.right - b.left >= 220 && b.bottom - b.top >= 160;

  // 1) right of the hero text, above a floating board
  let box = {
    left: textRight + 40,
    right: w - Math.max(32, (w - 1160) / 4),
    top: Math.max(navH + 28, hintBottom + 16),
    bottom: (boardFloats ? boardBox.top : sectors ? sectors.top : hero.bottom) - hero.top - 28,
  };
  // 2) beside the board once it has joined the flow (tablets)
  if (!(camera.aspect >= 1.15 && fits(box)) && boardShown && !boardFloats) {
    box = { left: boardBox.right - hero.left + 32, right: w - 32, top: boardBox.top - hero.top, bottom: boardBox.bottom - hero.top };
  }
  // 3) no room (phones): main.js's flat mini map in the board takes over
  const placed = fits(box);
  track.visible = placed;
  canvas.parentElement.classList.toggle("map-3d", placed);
  if (!placed) return;

  const resting = camera.position.clone();
  camera.position.copy(BASE_CAM);
  camera.lookAt(0, 1.2, 0);
  camera.updateMatrixWorld();
  const toNdc = (px, py) => new THREE.Vector2((px / w) * 2 - 1, 1 - (py / h) * 2);
  const projected = () => {
    track.updateMatrixWorld(true);
    const p = corners.map((c) => c.clone().applyMatrix4(track.matrixWorld).project(camera));
    const px = p.map((v) => ((v.x + 1) / 2) * w);
    const py = p.map((v) => ((1 - v.y) / 2) * h);
    return { w: Math.max(...px) - Math.min(...px), h: Math.max(...py) - Math.min(...py),
      cx: (Math.max(...px) + Math.min(...px)) / 2, cy: (Math.max(...py) + Math.min(...py)) / 2 };
  };
  const target = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
  const hitAt = (px, py) => {
    raycaster.setFromCamera(toNdc(px, py), camera);
    return raycaster.ray.intersectPlane(trackPlane, new THREE.Vector3());
  };
  const start = hitAt(target.x, target.y);
  if (start) {
    track.position.copy(start);
    track.rotation.x = Math.max(0, MAP_VIEW_ANGLE - Math.atan2(BASE_CAM.y - start.y, BASE_CAM.z - start.z));
    track.scale.setScalar(1);
    for (let pass = 0; pass < 3; pass++) {
      const size = projected();
      track.scale.multiplyScalar(Math.min((box.right - box.left) / size.w, (box.bottom - box.top) / size.h));
      // re-centre: the tilted map's far half is foreshortened, so its middle drifts
      const after = projected();
      const from = hitAt(after.cx, after.cy);
      const to = hitAt(target.x, target.y);
      if (from && to) track.position.add(to.sub(from));
    }
  }
  camera.position.copy(resting);
  camera.lookAt(0, 1.2, 0);
}
document.addEventListener("tr-hero-layout", layout);

// ---------- Sizing ----------
function resize() {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  layout();
}
resize();
window.addEventListener("resize", resize);

// ---------- Animation loop ----------
let lapT = 0;
let lap = 1;
let running = true;

// Sector strip + lap counter in the hero follow the car
const sectorEls = [...document.querySelectorAll("[data-sector]")];
const lapEl = document.querySelector('[data-rb="lap"]');
const miniCar = document.querySelector(".rb-minimap circle"); // phones: the car laps the flat map instead
if (!prefersReducedMotion) document.querySelector(".hero-sectors")?.classList.add("is-live");
const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  // Car: advance along the lap, braking into corners
  const profileIdx = Math.floor(lapT * CURV_SAMPLES) % CURV_SAMPLES;
  const prevT = lapT;
  lapT = (lapT + dt * 0.035 * (0.45 + speedProfile[profileIdx])) % 1;
  if (lapT < prevT && lapEl) lapEl.textContent = ++lap;
  const sectorPos = lapT * 3;
  const current = Math.floor(sectorPos);
  sectorEls.forEach((el, i) =>
    el.style.setProperty("--p", i < current ? 1 : i > current ? 0 : (sectorPos - current).toFixed(3)));
  if (miniCar && !track.visible) {
    const [mx, my] = outline[Math.floor(lapT * outline.length) % outline.length];
    miniCar.setAttribute("cx", mx);
    miniCar.setAttribute("cy", -my);
  }
  const carPos = curve.getPointAt(lapT);
  car.position.copy(carPos);
  carGlow.position.copy(carPos);
  carGlow.scale.setScalar(1 + 0.6 * speedProfile[profileIdx]);

  // Trail: record position history, fade with age
  trailHistory.unshift(carPos.clone());
  if (trailHistory.length > TRAIL_LEN) trailHistory.pop();
  for (let i = 0; i < TRAIL_LEN; i++) {
    const p = trailHistory[i] || carPos;
    trailPositions[i * 3] = p.x;
    trailPositions[i * 3 + 1] = p.y;
    trailPositions[i * 3 + 2] = p.z;
    const fade = 1 - i / TRAIL_LEN;
    trailColors[i * 3] = amberColor.r * fade;
    trailColors[i * 3 + 1] = amberColor.g * fade * 0.85;
    trailColors[i * 3 + 2] = amberColor.b * fade * 0.4;
  }
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.color.needsUpdate = true;

  // Neural cloud: slow drift + breathing
  nodesGroup.rotation.y = elapsed * 0.045;
  nodesGroup.position.y = 5.2 + Math.sin(elapsed * 0.5) * 0.25;
  edgeMat.opacity = 0.07 + 0.04 * (0.5 + 0.5 * Math.sin(elapsed * 0.8));

  // Signals travelling along edges
  for (let i = 0; i < SIGNAL_COUNT; i++) {
    const s = signals[i];
    s.t += dt * s.speed;
    if (s.t >= 1) {
      s.t = 0;
      s.edge = Math.floor(Math.random() * edges.length);
      s.speed = 0.4 + Math.random() * 0.9;
    }
    const [a, b] = edges[s.edge];
    signalPositions[i * 3] = THREE.MathUtils.lerp(nodePositions[a].x, nodePositions[b].x, s.t);
    signalPositions[i * 3 + 1] = THREE.MathUtils.lerp(nodePositions[a].y, nodePositions[b].y, s.t);
    signalPositions[i * 3 + 2] = THREE.MathUtils.lerp(nodePositions[a].z, nodePositions[b].z, s.t);
  }
  signalGeo.attributes.position.needsUpdate = true;

  // Camera parallax toward pointer
  camera.position.x += (pointer.x * 1.6 - camera.position.x) * 0.03;
  camera.position.y += (5.6 - pointer.y * 0.8 - camera.position.y) * 0.03;
  camera.lookAt(0, 1.2, 0);

  renderer.render(scene, camera);
  if (running && !prefersReducedMotion) requestAnimationFrame(frame);
}

// Pause when hero is off-screen, tab hidden, or street mode active — no wasted GPU
let heroVisible = true;
const isStreet = () => document.documentElement.dataset.theme === "street";

function updateRunning() {
  const should = heroVisible && !document.hidden && !isStreet();
  if (should && !running) {
    running = true;
    clock.getDelta(); // swallow the pause so the car doesn't teleport
    if (!prefersReducedMotion) requestAnimationFrame(frame);
  } else if (!should) {
    running = false;
  }
}

const visObserver = new IntersectionObserver(([entry]) => {
  heroVisible = entry.isIntersecting;
  updateRunning();
});
visObserver.observe(canvas);

document.addEventListener("visibilitychange", updateRunning);
document.addEventListener("tr-theme-change", () => {
  resize(); // canvas may have been hidden during a viewport change
  updateRunning();
});

running = !isStreet();
requestAnimationFrame(frame); // single static render even when paused or reduced-motion
