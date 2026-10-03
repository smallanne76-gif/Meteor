// Procedural head: sculpted from an ellipsoid with analytic feature fields (brow, nose, lips, chin, cheekbones),
// morph targets for expression, glossy eyes with iris detail + eyelids, ears, and strand hair.
import * as THREE from 'three';
import { RNG, smooth, clamp, lerp } from '../core/util.js';
import { pbr, solid } from '../gfx/materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const g = (x, s) => Math.exp(-(x * x) / (2 * s * s));
const g2 = (x, y, sx, sy) => Math.exp(-((x * x) / (2 * sx * sx) + (y * y) / (2 * sy * sy)));

export const FACE_PRESETS = {
  jo: { rx: 0.073, ry: 0.103, rz: 0.088, jaw: 0.0, brow: 1.0, nose: 1.0, lips: 1.0, cheek: 0.8, chin: 0.9, skin: 0xd9a583, eye: 0x5b7f5a, hair: 0x4b3523, hairLen: 0.04, hairStyle: 'messy', freckles: 0.3 },
  mara: { rx: 0.068, ry: 0.1, rz: 0.084, jaw: 0.25, brow: 0.8, nose: 0.9, lips: 1.2, cheek: 1.0, chin: 0.8, skin: 0xdcae92, eye: 0x4a3a2a, hair: 0x2c2018, hairLen: 0.2, hairStyle: 'long', freckles: 0.1 },
  searcher: { rx: 0.07, ry: 0.108, rz: 0.088, jaw: 0.15, brow: 1.1, nose: 1.0, lips: 0.8, cheek: 0.7, chin: 1.0, skin: 0xb9b5b0, eye: 0x20262c, hair: 0x201a16, hairLen: 0.16, hairStyle: 'wet', freckles: 0 },
};

/** displaced ellipsoid head in head space (origin: centre of the skull, +Y up, +Z front) */
export function buildHeadGeometry(p, seg = 64, rings = 48) {
  const geo = new THREE.SphereGeometry(1, seg, rings);
  const pos = geo.attributes.position; const n = pos.count;
  const base = new Float32Array(n * 3);
  const smileD = new Float32Array(n * 3), sadD = new Float32Array(n * 3), openD = new Float32Array(n * 3), browUpD = new Float32Array(n * 3), frownD = new Float32Array(n * 3);
  const dir = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    let x = dir.x * p.rx, y = dir.y * p.ry, z = dir.z * p.rz;
    // jaw taper: narrower and slightly forward below the cheeks
    const lowK = smooth(-0.02, -0.095, y);
    const jawW = 1 - lowK * (0.17 - p.jaw * 0.1);
    x *= jawW;
    const front = smooth(0.0, 0.6, dir.z);     // only the face side gets sculpted
    // chin forward
    z += front * lowK * 0.006 * p.chin; y -= front * g(y + 0.098, 0.02) * g(x, 0.025) * 0.003;
    const ax = Math.abs(x);
    let dz = 0;
    // brow ridge
    dz += p.brow * 0.0085 * g(y - 0.026, 0.011) * g(ax - 0.03, 0.026) * front;
    // eye sockets (dent) and under-eye
    dz -= 0.0075 * g(y - 0.012, 0.0125) * g(ax - 0.032, 0.0125) * front;
    // nose: bridge, tip, wings
    dz += p.nose * (0.016 * g(x, 0.0085) * smooth(0.02, -0.03, y) * smooth(-0.045, -0.03, y)) * front;
    dz += p.nose * 0.015 * g2(x, y + 0.035, 0.0105, 0.009) * front;
    dz += p.nose * 0.006 * g2(ax - 0.0125, y + 0.042, 0.0065, 0.0075) * front;
    dz -= 0.004 * g2(ax - 0.008, y + 0.0475, 0.0036, 0.0036) * front;          // nostrils
    // philtrum groove
    dz -= 0.0015 * g2(x, y + 0.053, 0.004, 0.007) * front;
    // cheekbones
    dz += p.cheek * 0.0075 * g2(ax - 0.05, y + 0.003, 0.016, 0.013) * front;
    // cheeks hollow under bone
    dz -= 0.002 * g2(ax - 0.048, y + 0.04, 0.014, 0.014) * front;
    // lips: upper + lower, groove between
    dz += p.lips * 0.0058 * g2(x, y + 0.0615, 0.018, 0.0062) * front;
    dz += p.lips * 0.0072 * g2(x, y + 0.0755, 0.017, 0.0068) * front;
    dz -= 0.0028 * g2(x, y + 0.0675, 0.02, 0.0016) * front;                      // mouth line
    // chin dimple + mentolabial groove
    dz -= 0.0022 * g2(x, y + 0.0865, 0.014, 0.0036) * front;
    dz += p.chin * 0.0065 * g2(x, y + 0.097, 0.018, 0.012) * front;
    // forehead
    dz += 0.003 * g2(x, y - 0.06, 0.04, 0.03) * front;
    // temple hollows
    x += 0;
    const rr = Math.hypot(x / p.rx, y / p.ry, z / p.rz) || 1;
    const nx = x, ny = y, nz = z + dz;
    base[i * 3] = nx; base[i * 3 + 1] = ny; base[i * 3 + 2] = nz;
    // ---- morph targets (deltas) ----
    const mouthY = -0.0675;
    const corner = g2(ax - 0.026, y - mouthY, 0.013, 0.012) * front;
    const sgn = Math.sign(x) || 1;
    // smile: mouth corners lift + widen, cheeks rise
    smileD[i * 3] = sgn * 0.0042 * corner; smileD[i * 3 + 1] = 0.0068 * corner + 0.0022 * g2(ax - 0.05, y + 0.005, 0.02, 0.016) * front; smileD[i * 3 + 2] = 0.0012 * corner;
    // sad: corners drop, inner brows rise
    sadD[i * 3] = -sgn * 0.0014 * corner; sadD[i * 3 + 1] = -0.0058 * corner + 0.0036 * g2(ax - 0.014, y - 0.036, 0.011, 0.007) * front; sadD[i * 3 + 2] = 0.0;
    // open mouth: jaw swings down
    const jaw = smooth(-0.056, -0.085, y) * front;
    openD[i * 3 + 1] = -0.026 * jaw; openD[i * 3 + 2] = -0.004 * jaw;
    // brows up / frown
    const brow = g2(ax - 0.03, y - 0.043, 0.024, 0.01) * front;
    browUpD[i * 3 + 1] = 0.0075 * brow; frownD[i * 3 + 1] = -0.0042 * g2(ax - 0.025, y - 0.043, 0.02, 0.009) * front; frownD[i * 3] = -sgn * 0.0024 * g2(ax - 0.012, y - 0.043, 0.01, 0.01) * front;
  }
  for (let i = 0; i < n; i++) pos.setXYZ(i, base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
  const mk = (arr) => { const a = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) a[i] = pos.array[i] + arr[i]; return new THREE.BufferAttribute(a, 3); };
  // morph targets store absolute positions in three (relative=false) — we use deltas via `morphTargetsRelative`
  geo.morphAttributes.position = [new THREE.BufferAttribute(smileD, 3), new THREE.BufferAttribute(sadD, 3), new THREE.BufferAttribute(openD, 3), new THREE.BufferAttribute(browUpD, 3), new THREE.BufferAttribute(frownD, 3)];
  geo.morphTargetsRelative = true;
  {
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); const ax = Math.abs(x); const front = smooth(0.0, 0.5, z / p.rz);
      let r = 1, gg = 1, b = 1;
      const lip = g2(x, y + 0.069, 0.019, 0.0095) * front;                      // lips: warmer, darker
      r *= 1 - lip * 0.0; gg *= 1 - lip * 0.34; b *= 1 - lip * 0.3;
      const blush = g2(ax - 0.045, y + 0.012, 0.022, 0.018) * front;            // cheeks
      gg *= 1 - blush * 0.12; b *= 1 - blush * 0.1;
      const socket = g2(ax - 0.032, y - 0.012, 0.016, 0.012) * front;            // eye sockets slightly darker
      r *= 1 - socket * 0.18; gg *= 1 - socket * 0.22; b *= 1 - socket * 0.15;
      const nosetip = g2(x, y + 0.04, 0.012, 0.01) * front; gg *= 1 - nosetip * 0.08; b *= 1 - nosetip * 0.08;
      const under = g2(ax - 0.03, y + 0.003, 0.015, 0.006) * front; r *= 1 - under * 0.08; gg *= 1 - under * 0.12; b *= 1 - under * 0.08;
      const stubble = smooth(-0.045, -0.095, y) * front * (p.stubble || 0); r *= 1 - stubble * 0.14; gg *= 1 - stubble * 0.16; b *= 1 - stubble * 0.14;
      const v = 0.94 + 0.06 * Math.sin(x * 190) * Math.sin(y * 210);              // very faint mottling
      col[i * 3] = r * v; col[i * 3 + 1] = gg * v; col[i * 3 + 2] = b * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  geo.computeVertexNormals();
  // procedural UVs: planar front projection blended to spherical for the back
  const uv = geo.attributes.uv; for (let i = 0; i < n; i++) { uv.setXY(i, 0.5 + pos.getX(i) / (p.rx * 2.4), 0.5 + pos.getY(i) / (p.ry * 2.4)); }
  return geo;
}
export const MORPH = { smile: 0, sad: 1, open: 2, browUp: 3, frown: 4 };

let irisTexCache = {};
function irisTexture(color) {
  const key = color; if (irisTexCache[key]) return irisTexCache[key];
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#f2efe9'; x.fillRect(0, 0, 256, 256);
  const col = new THREE.Color(color); const base = `rgb(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)})`;
  // sclera veins
  x.strokeStyle = 'rgba(190,90,80,0.25)'; x.lineWidth = 1; for (let i = 0; i < 18; i++) { x.beginPath(); const a = Math.random() * 6.28; x.moveTo(128 + Math.cos(a) * 120, 128 + Math.sin(a) * 120); x.lineTo(128 + Math.cos(a + 0.2) * 70, 128 + Math.sin(a + 0.2) * 70); x.stroke(); }
  const r = x.createRadialGradient(128, 128, 8, 128, 128, 62); r.addColorStop(0, '#0b0b0c'); r.addColorStop(0.28, '#0b0b0c'); r.addColorStop(0.32, base); r.addColorStop(0.8, base); r.addColorStop(1, '#1b1f1c');
  x.fillStyle = r; x.beginPath(); x.arc(128, 128, 62, 0, 7); x.fill();
  for (let i = 0; i < 90; i++) { const a = Math.random() * 6.28, l0 = 14 + Math.random() * 8, l1 = 40 + Math.random() * 20; x.strokeStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${0.06 + Math.random() * 0.1})`; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); x.moveTo(128 + Math.cos(a) * l0, 128 + Math.sin(a) * l0); x.lineTo(128 + Math.cos(a) * l1, 128 + Math.sin(a) * l1); x.stroke(); }
  x.strokeStyle = '#141414'; x.lineWidth = 3; x.beginPath(); x.arc(128, 128, 62, 0, 7); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; irisTexCache[key] = t; return t;
}

export function skinMaterial(color, { wet = 0, pale = 0 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: new THREE.Color(color), roughness: 0.52 - wet * 0.3, metalness: 0, sheen: 0.7, sheenColor: new THREE.Color(0xd96a5a), sheenRoughness: 0.55, clearcoat: wet * 0.5, clearcoatRoughness: 0.4 });
  m.emissive = new THREE.Color(0x2a0d08).multiplyScalar(1 - pale); m.emissiveIntensity = 0.12;   // faint inner warmth (subsurface stand-in)
  const sk = pbr('skin', { key: 'skinbase' }); m.normalMap = sk.normalMap; m.normalScale = new THREE.Vector2(0.45, 0.45);
  m.userData.shared = false; return m;
}

/** returns a Group: head mesh + eyes + lids + ears + hair + brows + lashes, with .setExpression(), .lookAt(), .blink() */
export function buildHead(kind = 'jo', over = {}) {
  const p = { ...FACE_PRESETS[kind], ...over };
  const root = new THREE.Group(); root.name = 'head:' + kind;
  const skin = skinMaterial(p.skin, { wet: p.wet || 0, pale: p.pale || 0 });
  const geo = buildHeadGeometry(p);
  const head = new THREE.Mesh(geo, skin); head.castShadow = true; head.receiveShadow = true; head.morphTargetInfluences = [0, 0, 0, 0, 0]; root.add(head);
  // eyes
  const eyes = new THREE.Group(); root.add(eyes);
  const eyeR = 0.0118; const ex = 0.0315, ey = 0.014, ez = p.rz * 0.84;
  const sclera = new THREE.MeshPhysicalMaterial({ map: irisTexture(p.eye), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.03 });
  const pivots = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * ex, ey, ez - 0.001); root.add(piv);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 24, 18), sclera); ball.rotation.y = -Math.PI / 2; ball.castShadow = false; piv.add(ball);   // texture front faces +Z
    const cornea = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.04, 20, 14, 0, Math.PI * 2, 0, 1.0), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.02, clearcoat: 1, transmission: 0 })); cornea.rotation.x = Math.PI / 2; piv.add(cornea);
    pivots.push(piv);
  }
  // eyelids: skin shells that rotate to close
  const lidMat = skin;
  const lids = [];
  for (const s of [-1, 1]) {
    const up = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), lidMat); up.position.set(s * ex, ey, ez - 0.001); up.rotation.x = -Math.PI * 0.62; up.castShadow = false;
    const lo = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.1, 16, 10, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), lidMat); lo.position.copy(up.position); lo.rotation.x = 0.0; lo.castShadow = false;
    root.add(up, lo); lids.push({ up, lo });
  }
  // brows
  const browMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.hair).multiplyScalar(0.9), roughness: 0.8 });
  const brows = [];
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0065, 0.006), browMat); b.position.set(s * 0.034, 0.037, p.rz * 0.93); b.rotation.set(-0.15, 0, s * -0.12); b.castShadow = false; root.add(b); brows.push(b); }
  // ears
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), skin); e.scale.set(0.35, 1.0, 0.7); e.position.set(s * (p.rx * 0.98), -0.004, -0.006); e.rotation.z = s * 0.12; e.castShadow = true; root.add(e); }
  // neck stub
  // hair
  const hair = buildHair(p); root.add(hair);
  // freckles (tiny dots) handled via skin tint; skipped
  const api = {
    root, head, skin, eyes: pivots, lids, brows, hair, preset: p, blinkT: 0, blinkAmt: 0, nextBlink: 1.5 + Math.random() * 3, expr: { smile: 0, sad: 0, open: 0, browUp: 0, frown: 0 }, exprT: { smile: 0, sad: 0, open: 0, browUp: 0, frown: 0 },
    gaze: new THREE.Vector2(0, 0), gazeT: new THREE.Vector2(0, 0), saccadeT: 0, closed: 0,
    set(name, v) { api.exprT[name] = v; },
    setAll(o) { for (const k of Object.keys(api.exprT)) api.exprT[k] = o[k] || 0; },
    update(dt, t) {
      // expressions ease
      const k = 1 - Math.exp(-7 * dt);
      for (const key of Object.keys(api.expr)) { api.expr[key] += (api.exprT[key] - api.expr[key]) * k; head.morphTargetInfluences[MORPH[key]] = api.expr[key]; }
      // brows follow
      brows.forEach((b, i) => { const s = i === 0 ? -1 : 1; b.position.y = 0.037 + api.expr.browUp * 0.007 - api.expr.frown * 0.004 + api.expr.sad * 0.002; b.rotation.z = s * (-0.12 - api.expr.sad * 0.25 + api.expr.frown * 0.2); });
      // blink
      api.nextBlink -= dt; if (api.nextBlink <= 0 && api.blinkT <= 0) { api.blinkT = 0.16; api.nextBlink = 2.4 + Math.random() * 4.2; if (Math.random() < 0.15) api.nextBlink = 0.35; }
      let bl = 0; if (api.blinkT > 0) { api.blinkT -= dt; const u = 1 - api.blinkT / 0.16; bl = Math.sin(clamp(u) * Math.PI); }
      const close = Math.max(bl, api.closed);
      lids.forEach((l) => { l.up.rotation.x = -Math.PI * 0.62 + close * Math.PI * 0.55 + api.expr.sad * 0.12 - api.expr.smile * 0.05; l.lo.rotation.x = -close * 0.2 - api.expr.smile * 0.08; });
      // gaze: gentle saccades toward gazeT
      api.saccadeT -= dt; if (api.saccadeT <= 0) { api.saccadeT = 0.6 + Math.random() * 1.6; api.gaze.x = api.gazeT.x + (Math.random() - 0.5) * 0.06; api.gaze.y = api.gazeT.y + (Math.random() - 0.5) * 0.04; }
      pivots.forEach((pv) => { pv.rotation.y += ((api.gaze.x) - pv.rotation.y) * Math.min(1, dt * 18); pv.rotation.x += ((-api.gaze.y) - pv.rotation.x) * Math.min(1, dt * 18); });
    },
  };
  return api;
}

/** hair: a cap with a real hairline + strands that lie along the scalp (and hang for longer styles) */
export function buildHair(p) {
  const group = new THREE.Group(); group.name = 'hair';
  const rng = new RNG(p.hairStyle === 'messy' ? 77 : (p.hairStyle === 'long' ? 11 : 99));
  const col = new THREE.Color(p.hair);
  const wet = p.hairStyle === 'wet';
  const matShell = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.9), roughness: wet ? 0.3 : 0.6, metalness: 0 });
  const matStrand = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(1.25), roughness: wet ? 0.28 : 0.46, metalness: 0.08 });
  const RX = p.rx + 0.004, RY = p.ry + 0.005, RZ = p.rz + 0.004;
  // hairline as a function of azimuth (0 = straight ahead): high on the forehead, low at the nape and over the ears
  const hairlineTheta = (az) => { const f = Math.max(0, Math.cos(az)); return lerp(Math.PI * 0.66, Math.PI * 0.30, Math.pow(f, 1.6)) + (Math.abs(Math.sin(az)) > 0.85 ? 0.0 : 0); };
  // cap
  const seg = 56, rings = 22; const pos = [], idx = [];
  for (let i = 0; i <= rings; i++) for (let k = 0; k <= seg; k++) {
    const az = (k / seg) * Math.PI * 2 - Math.PI; const th = (i / rings) * hairlineTheta(az);
    const x = Math.sin(th) * Math.sin(az), y = Math.cos(th), z = Math.sin(th) * Math.cos(az);
    pos.push(x * RX, y * RY, z * RZ);
  }
  for (let i = 0; i < rings; i++) for (let k = 0; k < seg; k++) { const a = i * (seg + 1) + k, b = a + 1, c = a + seg + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const shell = new THREE.BufferGeometry(); shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); shell.setIndex(idx); shell.computeVertexNormals();
  const cap = new THREE.Mesh(shell, matShell); cap.castShadow = true; cap.receiveShadow = true; group.add(cap);
  // strands that follow the scalp
  const geos = []; const n = p.hairStyle === 'long' ? 700 : (p.hairStyle === 'messy' ? 640 : 560);
  const ell = (dir, off) => new THREE.Vector3(dir.x * (p.rx + off), dir.y * (p.ry + off), dir.z * (p.rz + off));
  for (let sI = 0; sI < n; sI++) {
    const az = rng.range(-Math.PI, Math.PI); const hl = hairlineTheta(az);
    let th = rng.range(0.02, hl * 0.97);
    let dir = new THREE.Vector3(Math.sin(th) * Math.sin(az), Math.cos(th), Math.sin(th) * Math.cos(az)).normalize();
    const pts = []; let off = 0.0035 + rng.range(0, 0.003);
    const steps = 9; const len = p.hairLen * rng.range(0.7, 1.25);
    const part = p.hairStyle === 'messy' ? rng.range(-0.6, 0.6) : (p.hairStyle === 'long' ? 0.0 : 0.0);
    for (let k = 0; k <= steps; k++) {
      pts.push(ell(dir, off));
      // flow: away from the crown along the meridian, swept sideways a little
      const up = new THREE.Vector3(0, 1, 0); const tang = up.clone().addScaledVector(dir, -up.dot(dir)); if (tang.lengthSq() < 1e-6) tang.set(0, 0, -1);
      tang.normalize().negate();
      const side = new THREE.Vector3().crossVectors(dir, tang).normalize();
      const sweep = p.hairStyle === 'messy' ? (0.35 * Math.sin(az * 2.0 + sI * 0.37) + part * 0.25) : 0.05 * Math.sin(az * 3.0);
      const fwd = (az > -0.9 && az < 0.9) ? 0.35 : 0; // fringe falls forward over the forehead
      const fl = tang.clone().multiplyScalar(1).addScaledVector(side, sweep).addScaledVector(new THREE.Vector3(0, 0, 1), fwd * Math.max(0, 1 - k / 6) * (th < hl * 0.7 ? 1 : 0.2));
      const stepL = len / steps / ((p.rx + p.ry) * 0.5);
      dir.addScaledVector(fl.normalize(), stepL).normalize();
      // below the hairline: leave the skull and hang (long) or tuck (short)
      if (Math.acos(clamp(dir.y, -1, 1)) > hl) { if (p.hairStyle === 'long') { off += len / steps * 0.5; dir.y = Math.max(dir.y - 0.05, -0.2); dir.normalize(); } else { off = Math.max(0.0015, off - 0.002); } }
      else if (p.hairStyle === 'messy' && k > 3) off += rng.range(0, 0.0022);
    }
    // long hair: hang the tip down
    const curve = new THREE.CatmullRomCurve3(pts);
    const rad = (p.hairStyle === 'long' ? 0.0026 : 0.0032) * rng.range(0.8, 1.3);
    const tube = new THREE.TubeGeometry(curve, steps, rad, 4, false); const tp = tube.attributes.position;
    for (let i = 0; i < tp.count; i++) { const ring = Math.floor(i / 5); const taper = 1 - (ring / (steps + 1)) * 0.8; const c = curve.getPoint(Math.min(1, ring / steps)); tp.setXYZ(i, c.x + (tp.getX(i) - c.x) * taper, c.y + (tp.getY(i) - c.y) * taper, c.z + (tp.getZ(i) - c.z) * taper); }
    tube.deleteAttribute('uv'); geos.push(tube);
  }
  const merged = mergeGeometries(geos); const m = new THREE.Mesh(merged, matStrand); m.castShadow = true; group.add(m);
  return group;
}

