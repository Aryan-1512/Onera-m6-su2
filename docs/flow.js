// Animated streamlines around the aircraft (three.js, no build step).
// Streaks travel along precomputed SU2 streamlines; their speed follows the
// solver's integration time, so they genuinely speed up where the air does.
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const cfg = window.FLOW_CONFIG;

const COOLWARM = [
  [59, 76, 192], [98, 130, 234], [141, 176, 254], [184, 208, 249], [221, 221, 221],
  [245, 196, 173], [244, 154, 123], [222, 96, 77], [180, 4, 38],
];

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2733);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
scene.add(sun);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Colour map as a small texture the shader can sample
const cmapData = new Uint8Array(256 * 4);
for (let i = 0; i < 256; i++) {
  const t = (i / 255) * (COOLWARM.length - 1), k = Math.min(COOLWARM.length - 2, Math.floor(t)), f = t - k;
  for (let c = 0; c < 3; c++) cmapData[i * 4 + c] = Math.round(COOLWARM[k][c] + (COOLWARM[k + 1][c] - COOLWARM[k][c]) * f);
  cmapData[i * 4 + 3] = 255;
}
const cmap = new THREE.DataTexture(cmapData, 256, 1);
cmap.colorSpace = THREE.SRGBColorSpace;
cmap.magFilter = THREE.LinearFilter; cmap.needsUpdate = true;

const uniforms = {
  uTime: { value: 0 }, uRate: { value: 1 }, uSpacing: { value: 1 },
  uLo: { value: 0 }, uHi: { value: 2 }, uMap: { value: cmap },
};

const lineMaterial = new THREE.ShaderMaterial({
  uniforms, transparent: true, depthWrite: false,
  vertexShader: `
    attribute float aT; attribute float aMach; attribute float aOffset;
    varying float vT; varying float vMach; varying float vOffset;
    void main() { vT = aT; vMach = aMach; vOffset = aOffset;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float uTime, uRate, uSpacing, uLo, uHi; uniform sampler2D uMap;
    varying float vT; varying float vMach; varying float vOffset;
    void main() {
      // centre the colour scale on Mach 1 (white = speed of sound)
      float m = vMach < 1.0 ? 0.5 * (vMach - uLo) / (1.0 - uLo) : 0.5 + 0.5 * (vMach - 1.0) / (uHi - 1.0);
      vec3 col = texture2D(uMap, vec2(clamp(m, 0.0, 1.0), 0.5)).rgb;
      // distance (in flow time) behind the nearest streak head
      float d = fract((uTime * uRate + vOffset - vT) / uSpacing);
      float streak = exp(-d * 9.0);
      gl_FragColor = vec4(col, 0.05 + 0.95 * streak);
    }`,
});

async function getBin(name) {
  const [meta, buf] = await Promise.all([
    fetch(name + '.json').then(r => r.json()), fetch(name + '.bin').then(r => r.arrayBuffer())]);
  return { meta, buf };
}

async function load() {
  const surf = await getBin(cfg.surface);
  const nV = surf.meta.nVerts, nT = surf.meta.nTris;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(surf.buf, 0, nV * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(surf.buf, nV * 12, nT * 3), 1));
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x9aa6b2, flatShading: !!cfg.flatShading, side: THREE.DoubleSide }));
  scene.add(body);

  const sl = await getBin(cfg.streamlines);
  const { nLines, nPts, tMax, mach } = sl.meta;
  const A = new Float32Array(sl.buf);              // nLines * nPts * (x,y,z,t,mach)
  const nSeg = nLines * (nPts - 1);
  const pos = new Float32Array(nSeg * 6), tA = new Float32Array(nSeg * 2), mA = new Float32Array(nSeg * 2), oA = new Float32Array(nSeg * 2);
  let s = 0;
  for (let l = 0; l < nLines; l++) {
    const off = Math.random() * tMax;              // stagger streaks between lines
    for (let p = 0; p < nPts - 1; p++, s++) {
      for (let e = 0; e < 2; e++) {
        const b = (l * nPts + p + e) * 5;
        pos.set([A[b], A[b + 1], A[b + 2]], (s * 2 + e) * 3);
        tA[s * 2 + e] = A[b + 3]; mA[s * 2 + e] = A[b + 4]; oA[s * 2 + e] = off;
      }
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  lg.setAttribute('aT', new THREE.BufferAttribute(tA, 1));
  lg.setAttribute('aMach', new THREE.BufferAttribute(mA, 1));
  lg.setAttribute('aOffset', new THREE.BufferAttribute(oA, 1));
  scene.add(new THREE.LineSegments(lg, lineMaterial));

  uniforms.uLo.value = Math.min(mach[0], 0.5);
  uniforms.uHi.value = Math.max(mach[1], 1.3);
  uniforms.uRate.value = tMax / (cfg.crossSeconds || 6);   // free-stream crosses the scene in ~6 s
  uniforms.uSpacing.value = tMax / (cfg.streaks || 7);

  // frame on the aircraft
  const [mn, mx] = surf.meta.bounds;
  const c = new THREE.Vector3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
  const size = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  controls.target.copy(c);
  camera.position.copy(c).add(new THREE.Vector3(...(cfg.view || [-1, -1, 0.8])).normalize()
    .multiplyScalar(size * (cfg.distance || 2.2) * Math.max(1, 1.1 / camera.aspect)));
  camera.near = size / 100; camera.far = size * 60; camera.updateProjectionMatrix();
  sun.position.copy(c).add(new THREE.Vector3(-1, -0.6, 2).multiplyScalar(size));

  drawLegend(uniforms.uLo.value, uniforms.uHi.value);
  document.body.classList.add('ready');
}

function drawLegend(lo, hi) {
  const bar = document.getElementById('bar'), ctx = bar.getContext('2d');
  for (let x = 0; x < bar.width; x++) {
    const v = lo + (x / (bar.width - 1)) * (hi - lo);
    const m = v < 1 ? 0.5 * (v - lo) / (1 - lo) : 0.5 + 0.5 * (v - 1) / (hi - 1);
    const i = Math.round(Math.min(1, Math.max(0, m)) * 255) * 4;
    ctx.fillStyle = `rgb(${cmapData[i]},${cmapData[i + 1]},${cmapData[i + 2]})`;
    ctx.fillRect(x, 0, 1, bar.height);
  }
  document.getElementById('lo').textContent = lo.toFixed(1);
  document.getElementById('hi').textContent = hi.toFixed(1);
  document.getElementById('one').style.left = ((1 - lo) / (hi - lo) * 100) + '%';
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  // with reduced motion the streaks stay still, but the model can still be rotated
  if (!reduceMotion) uniforms.uTime.value = clock.getElapsedTime();
  controls.update(); renderer.render(scene, camera);
});
load().catch(err => {
  document.getElementById('status').textContent = 'The flow data could not be loaded. Open this page through GitHub Pages or a local web server.';
  console.error(err);
});
