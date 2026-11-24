// Interactive surface-result viewer for SU2 output (three.js, no build step).
// Data format (written by tools/export_surface.py):
//   <name>.json : { nVerts, nTris, bounds, fields: { cp:[min,max], mach:[min,max] } }
//   <name>.bin  : float32 xyz[nVerts*3] | uint32 tri[nTris*3] | float32 cp[nVerts] | float32 mach[nVerts]
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const cfg = window.VIEWER_CONFIG;

// ParaView's default "Cool to Warm" diverging map (Moreland), sampled at 9 points
const COOLWARM = [
  [59, 76, 192], [98, 130, 234], [141, 176, 254], [184, 208, 249], [221, 221, 221],
  [245, 196, 173], [244, 154, 123], [222, 96, 77], [180, 4, 38],
].map(c => c.map(v => v / 255));

function coolwarm(t) {
  t = Math.min(1, Math.max(0, t)) * (COOLWARM.length - 1);
  const i = Math.min(COOLWARM.length - 2, Math.floor(t)), f = t - i;
  const a = COOLWARM[i], b = COOLWARM[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

// Each field is centred on a physically meaningful value (white = that value):
// Cp = 0 is free-stream pressure, Mach = 1 is the speed of sound.
const FIELDS = {
  cp:   { label: 'Pressure coefficient', short: 'Cp',   centre: 0, centreLabel: 'free-stream pressure', digits: 2 },
  mach: { label: 'Mach number',          short: 'Mach', centre: 1, centreLabel: 'speed of sound',       digits: 2 },
};

function mapValue(v, lo, c, hi) {
  return v <= c ? 0.5 * (v - lo) / (c - lo) : 0.5 + 0.5 * (v - c) / (hi - c);
}

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2733);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
camera.up.set(0, 0, 1);                              // SU2 cases here use z as "up"
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.9));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
scene.add(sun);

let mesh, data, field = 'cp';

async function load() {
  const [meta, buf] = await Promise.all([
    fetch(cfg.data + '.json').then(r => r.json()),
    fetch(cfg.data + '.bin').then(r => r.arrayBuffer()),
  ]);
  const nV = meta.nVerts, nT = meta.nTris;
  let o = 0;
  const pos = new Float32Array(buf, o, nV * 3); o += nV * 12;
  const idx = new Uint32Array(buf, o, nT * 3); o += nT * 12;
  const cp = new Float32Array(buf, o, nV); o += nV * 4;
  const mach = new Float32Array(buf, o, nV);
  data = { meta, values: { cp, mach } };

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nV * 3), 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !!cfg.flatShading, side: THREE.DoubleSide });
  mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  // frame the model
  const [mn, mx] = meta.bounds;
  const centre = new THREE.Vector3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
  const size = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  controls.target.copy(centre);
  const v = cfg.view || [-0.9, -1.1, 0.8];
  camera.position.copy(centre).add(new THREE.Vector3(...v).normalize().multiplyScalar(size * (cfg.distance || 1.9) * Math.max(1, 1.1 / camera.aspect)));
  camera.near = size / 100; camera.far = size * 50; camera.updateProjectionMatrix();
  sun.position.copy(centre).add(new THREE.Vector3(-1, -0.6, 2).multiplyScalar(size));
  home = { pos: camera.position.clone(), target: centre.clone() };

  setField('cp');
  document.body.classList.add('ready');
}

let home;

function setField(name) {
  field = name;
  const f = FIELDS[name], [lo, hi] = data.meta.fields[name];
  const vals = data.values[name], col = mesh.geometry.attributes.color.array;
  const tmp = new THREE.Color();
  for (let i = 0; i < vals.length; i++) {
    const c = coolwarm(mapValue(vals[i], lo, f.centre, hi));
    tmp.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);   // colour map is defined in sRGB
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  mesh.geometry.attributes.color.needsUpdate = true;
  document.querySelectorAll('[data-field]').forEach(b => b.setAttribute('aria-pressed', b.dataset.field === name));
  drawColourBar(lo, hi, f);
}

function niceTicks(lo, hi, n = 6) {
  const span = hi - lo, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => span / s <= n);
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(+t.toFixed(6));
  return out;
}

function drawColourBar(lo, hi, f) {
  const bar = document.getElementById('bar'), ctx = bar.getContext('2d');
  const W = bar.width, H = bar.height;
  for (let y = 0; y < H; y++) {
    const v = hi - (y / (H - 1)) * (hi - lo);
    const c = coolwarm(mapValue(v, lo, f.centre, hi));
    ctx.fillStyle = `rgb(${c.map(x => Math.round(x * 255)).join(',')})`;
    ctx.fillRect(0, y, W, 1);
  }
  const ticks = document.getElementById('ticks');
  ticks.innerHTML = '';
  const yOf = v => ((hi - v) / (hi - lo)) * 100;
  for (const t of niceTicks(lo, hi)) {
    if (Math.abs(t - f.centre) < 1e-9) continue;
    const el = document.createElement('span');
    el.style.top = yOf(t) + '%';
    el.textContent = t.toFixed(1).replace('-', '−');
    ticks.appendChild(el);
  }
  const c = document.createElement('span');
  c.className = 'centre';
  c.style.top = yOf(f.centre) + '%';
  c.innerHTML = `<b>${f.centre}</b> ${f.centreLabel}`;
  ticks.appendChild(c);
  document.getElementById('bar-title').textContent = f.label;
  document.getElementById('range').textContent =
    `${f.short} ranges from ${lo.toFixed(f.digits).replace('-', '−')} to ${hi.toFixed(f.digits).replace('-', '−')} on this surface`;
}

// Probe: show the value under the pointer (interpolated inside the triangle)
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
const probe = document.getElementById('probe');
canvas.addEventListener('pointermove', e => {
  if (!mesh) return;
  const r = canvas.getBoundingClientRect();
  ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObject(mesh)[0];
  if (!hit) { probe.hidden = true; return; }
  const { a, b, c } = hit.face, vals = data.values[field];
  const bc = new THREE.Vector3();
  THREE.Triangle.getBarycoord(hit.point,
    new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, a),
    new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, b),
    new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, c), bc);
  const v = vals[a] * bc.x + vals[b] * bc.y + vals[c] * bc.z;
  const f = FIELDS[field];
  probe.hidden = false;
  probe.style.left = (e.clientX - r.left + 14) + 'px';
  probe.style.top = (e.clientY - r.top + 14) + 'px';
  probe.textContent = `${f.short} ${v.toFixed(f.digits).replace('-', '−')}`;
});
canvas.addEventListener('pointerleave', () => { probe.hidden = true; });

document.querySelectorAll('[data-field]').forEach(b => b.addEventListener('click', () => setField(b.dataset.field)));
document.getElementById('reset').addEventListener('click', () => {
  camera.position.copy(home.pos); controls.target.copy(home.target); controls.update();
});

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
load().catch(err => {
  document.getElementById('status').textContent =
    'The result files could not be loaded. Open this page through GitHub Pages or a local web server, not directly from disk.';
  console.error(err);
});
