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

// ---------- Racing circuit ----------
const trackPoints = [
  [-10, 0.2, -4], [-4, 0.4, -5.2], [2, 0.55, -5.5], [7, 0.45, -4.7], [10.6, 0.25, -2.4],
  [10, 0.7, 0.6], [7.4, 1.0, 2.0], [8.4, 0.8, 4.1], [5.8, 0.5, 5.5],
  [2, 0.7, 4.2], [-1.6, 1.1, 5.3], [-5, 0.9, 4.4], [-7.6, 0.6, 5.1], [-10.6, 0.35, 3], [-11.2, 0.25, -0.6],
].map((p) => new THREE.Vector3(...p));

const curve = new THREE.CatmullRomCurve3(trackPoints, true, "catmullrom", 0.6);

// Core racing line
const lineGeo = new THREE.TubeGeometry(curve, 360, 0.05, 6, true);
const lineMat = new THREE.MeshBasicMaterial({ color: COLORS.red });
world.add(new THREE.Mesh(lineGeo, lineMat));

// Soft glow sheath around the line (additive, faint)
const glowGeo = new THREE.TubeGeometry(curve, 240, 0.2, 6, true);
const glowMat = new THREE.MeshBasicMaterial({
  color: COLORS.red,
  transparent: true,
  opacity: 0.12,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
world.add(new THREE.Mesh(glowGeo, glowMat));

// Start/finish gate: two thin posts at t=0
const gatePos = curve.getPointAt(0);
const gateMat = new THREE.MeshBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0.5 });
for (const side of [-0.45, 0.45]) {
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.1, 0.05), gateMat);
  post.position.set(gatePos.x + side, gatePos.y + 0.55, gatePos.z);
  world.add(post);
}

// ---------- The car (a bright light tracing the lap) ----------
const car = new THREE.Mesh(
  new THREE.SphereGeometry(0.14, 12, 12),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
const carGlow = new THREE.Mesh(
  new THREE.SphereGeometry(0.42, 12, 12),
  new THREE.MeshBasicMaterial({
    color: COLORS.amber,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
world.add(car, carGlow);

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
  size: 0.16,
  vertexColors: true,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
});
world.add(new THREE.Points(trailGeo, trailMat));
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

// ---------- Sizing ----------
function resize() {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize);

// ---------- Animation loop ----------
let lapT = 0;
let running = true;
const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  // Car: advance along the lap, braking into corners
  const profileIdx = Math.floor(lapT * CURV_SAMPLES) % CURV_SAMPLES;
  lapT = (lapT + dt * 0.035 * (0.45 + speedProfile[profileIdx])) % 1;
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
