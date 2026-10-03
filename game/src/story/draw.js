// Canvas "hand-drawn" art for the story documents: Jo's Captain Owl comics, a child's crayon drawing, a photograph.
import { mulberry32 } from '../core/util.js';

const INK = '#2b2217';

function wob(r, a) { return (r() - 0.5) * a; }

export function paperFill(ctx, w, h, tint = '#efe6cf') {
  ctx.fillStyle = tint; ctx.fillRect(0, 0, w, h);
  const r = mulberry32(7);
  for (let i = 0; i < 1400; i++) { ctx.fillStyle = `rgba(110,85,40,${r() * 0.05})`; ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
}

export function wobblyRect(ctx, x, y, w, h, seed = 1, lw = 4) {
  const r = mulberry32(seed); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  const j = 3;
  ctx.moveTo(x + wob(r, j), y + wob(r, j)); ctx.lineTo(x + w * 0.5 + wob(r, j), y + wob(r, j)); ctx.lineTo(x + w + wob(r, j), y + wob(r, j));
  ctx.lineTo(x + w + wob(r, j), y + h * 0.5 + wob(r, j)); ctx.lineTo(x + w + wob(r, j), y + h + wob(r, j));
  ctx.lineTo(x + w * 0.5 + wob(r, j), y + h + wob(r, j)); ctx.lineTo(x + wob(r, j), y + h + wob(r, j)); ctx.lineTo(x + wob(r, j), y + h * 0.5 + wob(r, j)); ctx.closePath(); ctx.stroke();
}

function ell(ctx, x, y, rx, ry, fill, stroke = INK, lw = 3) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

/** Captain Owl: round, serious, wearing a yellow cape. mood: 'proud' | 'worried' | 'sad' | 'shout' */
export function owl(ctx, cx, cy, s = 1, mood = 'proud', cape = true) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (cape) { ctx.beginPath(); ctx.moveTo(-46, -20); ctx.quadraticCurveTo(-95, 40, -70, 105); ctx.lineTo(70, 105); ctx.quadraticCurveTo(95, 40, 46, -20); ctx.closePath(); ctx.fillStyle = '#e9b930'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); }
  ell(ctx, 0, 40, 56, 66, '#9a6b3c');                       // body
  ell(ctx, 0, 58, 36, 44, '#e6d0a0', INK, 2.5);             // belly
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 40 + i * 12, 10, 0.2, Math.PI - 0.2); ctx.strokeStyle = 'rgba(60,40,20,.5)'; ctx.lineWidth = 2; ctx.stroke(); }
  ell(ctx, 0, -28, 52, 46, '#a8774a');                        // head
  ctx.beginPath(); ctx.moveTo(-40, -62); ctx.lineTo(-52, -92); ctx.lineTo(-18, -70); ctx.closePath(); ctx.fillStyle = '#8a5d33'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(40, -62); ctx.lineTo(52, -92); ctx.lineTo(18, -70); ctx.closePath(); ctx.fill(); ctx.stroke();
  ell(ctx, -20, -28, 20, 21, '#f6ecd0'); ell(ctx, 20, -28, 20, 21, '#f6ecd0');       // eyes
  const dy = mood === 'sad' ? 5 : 0, pr = mood === 'shout' ? 6 : 9;
  ell(ctx, -20, -26 + dy, pr, pr, INK, null); ell(ctx, 20, -26 + dy, pr, pr, INK, null);
  ell(ctx, -17, -30 + dy, 3, 3, '#fff', null); ell(ctx, 23, -30 + dy, 3, 3, '#fff', null);
  ctx.strokeStyle = INK; ctx.lineWidth = 4;                                                  // brows
  const by = mood === 'worried' || mood === 'sad' ? [-2, 6] : (mood === 'shout' ? [-8, -8] : [-4, -4]);
  ctx.beginPath(); ctx.moveTo(-34, -52 + by[0]); ctx.lineTo(-8, -50 + by[1]); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(34, -52 + by[0]); ctx.lineTo(8, -50 + by[1]); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(8, -14); ctx.lineTo(0, 2); ctx.closePath(); ctx.fillStyle = '#e0912a'; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke(); // beak
  ctx.beginPath(); ctx.moveTo(-50, 20); ctx.quadraticCurveTo(-86, 50, -60, 92); ctx.quadraticCurveTo(-48, 60, -46, 30); ctx.fillStyle = '#8a5d33'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); // wings
  ctx.beginPath(); ctx.moveTo(50, 20); ctx.quadraticCurveTo(86, 50, 60, 92); ctx.quadraticCurveTo(48, 60, 46, 30); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-18, 104); ctx.lineTo(-24, 120); ctx.moveTo(-8, 106); ctx.lineTo(-8, 122); ctx.moveTo(18, 104); ctx.lineTo(24, 120); ctx.moveTo(8, 106); ctx.lineTo(8, 122); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
}

export function moth(ctx, cx, cy, s = 1) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.beginPath(); ctx.ellipse(-24, -6, 26, 18, -0.5, 0, Math.PI * 2); ctx.fillStyle = '#d8d0c0'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(24, -6, 26, 18, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ell(ctx, 0, 6, 11, 20, '#b9a98a', INK, 2.5); ell(ctx, 0, -18, 9, 9, '#cbbd9d', INK, 2.5);
  ctx.beginPath(); ctx.moveTo(-3, -26); ctx.quadraticCurveTo(-10, -40, -18, -38); ctx.moveTo(3, -26); ctx.quadraticCurveTo(10, -40, 18, -38); ctx.stroke();
  ell(ctx, -3, -19, 1.6, 1.6, INK, null); ell(ctx, 3, -19, 1.6, 1.6, INK, null);
  ctx.restore();
}

export function balloon(ctx, x, y, w, h, text, tail = [x + 20, y + h + 28], size = 30) {
  ctx.save();
  ctx.beginPath(); const r = 18;
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + 50, y + h); ctx.lineTo(tail[0], tail[1]); ctx.lineTo(x + 30, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = INK; ctx.font = `${size}px Caveat, cursive`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = text.split('\n'); const lh = size * 1.05;
  lines.forEach((l, i) => ctx.fillText(l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * lh));
  ctx.restore();
}

export function caption(ctx, x, y, w, h, text, size = 26) {
  ctx.save(); ctx.fillStyle = '#f6e7a8'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = INK; ctx.font = `${size}px Caveat, cursive`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  text.split('\n').forEach((l, i) => ctx.fillText(l, x + 10, y + 8 + i * size));
  ctx.restore();
}

function night(ctx, x, y, w, h, c1 = '#27406b', c2 = '#4d6b9c') {
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}

/** 3-panel strips: id selects which story */
export function comicStrip(ctx, w, h, which) {
  paperFill(ctx, w, h, '#f3ead2');
  const pw = (w - 80) / 3, ph = h - 190, y0 = 80;
  ctx.fillStyle = INK; ctx.font = '600 44px Caveat, cursive'; ctx.textAlign = 'left'; ctx.fillText('CAPTAIN OWL', 36, 54);
  ctx.font = '26px Caveat, cursive'; ctx.fillStyle = '#6b5a40';
  const panels = [0, 1, 2].map((i) => ({ x: 24 + i * (pw + 16), y: y0, w: pw, h: ph }));
  const sty = (p, c1, c2) => { night(ctx, p.x, p.y, p.w, p.h, c1, c2); };
  if (which === 'pun') {
    panels.forEach((p, i) => { sty(p, '#274372', '#5a7db0'); wobblyRect(ctx, p.x, p.y, p.w, p.h, 10 + i); });
    owl(ctx, panels[0].x + 130, panels[0].y + 230, 1.0, 'shout'); balloon(ctx, panels[0].x + 20, panels[0].y + 14, 270, 90, 'WHO is responsible\nfor this?!', [panels[0].x + 130, panels[0].y + 150]);
    owl(ctx, panels[1].x + 90, panels[1].y + 250, 0.8, 'worried'); moth(ctx, panels[1].x + 250, panels[1].y + 200, 0.9);
    balloon(ctx, panels[1].x + 150, panels[1].y + 18, 180, 80, 'Um. "Whoo"\nis not a name.', [panels[1].x + 250, panels[1].y + 140], 26);
    owl(ctx, panels[2].x + 130, panels[2].y + 250, 0.8, 'sad'); moth(ctx, panels[2].x + 250, panels[2].y + 200, 0.9);
    balloon(ctx, panels[2].x + 14, panels[2].y + 14, 300, 100, 'I know. I\'ve been\nasking all night.', [panels[2].x + 130, panels[2].y + 160], 26);
    caption(ctx, 24, h - 86, w - 48, 54, '— moth says: this is why nobody invites us to the forest.', 28);
  } else if (which === 'night') {
    panels.forEach((p, i) => { sty(p, '#0f1b36', '#2b4170'); wobblyRect(ctx, p.x, p.y, p.w, p.h, 20 + i); });
    for (let i = 0; i < 3; i++) { const p = panels[i]; for (let k = 0; k < 14; k++) { ctx.fillStyle = '#fff6c8'; ctx.fillRect(p.x + 20 + ((k * 53 + i * 31) % (p.w - 40)), p.y + 14 + ((k * 37) % 120), 3, 3); } }
    ctx.fillStyle = '#e8e2c8'; ctx.beginPath(); ctx.arc(panels[0].x + 240, panels[0].y + 70, 36, 0, Math.PI * 2); ctx.fill();
    owl(ctx, panels[0].x + 110, panels[0].y + 250, 0.8, 'proud');
    balloon(ctx, panels[1].x + 24, panels[1].y + 18, 280, 90, 'The lake is singing\ntonight, Moth.', [panels[1].x + 150, panels[1].y + 160], 26); owl(ctx, panels[1].x + 150, panels[1].y + 260, 0.7, 'proud'); moth(ctx, panels[1].x + 260, panels[1].y + 230, 0.8);
    balloon(ctx, panels[2].x + 14, panels[2].y + 14, 300, 100, 'Sir, that is\nthe ice cracking.', [panels[2].x + 250, panels[2].y + 160], 26); owl(ctx, panels[2].x + 100, panels[2].y + 250, 0.7, 'proud'); moth(ctx, panels[2].x + 250, panels[2].y + 220, 0.8);
    caption(ctx, 24, h - 86, w - 48, 54, '— Captain Owl: "It\'s stretching. Pay attention."', 28);
  } else if (which === 'unfinished') {
    panels.forEach((p, i) => { sty(p, '#1b2a4c', '#3a5688'); wobblyRect(ctx, p.x, p.y, p.w, p.h, 30 + i); });
    owl(ctx, panels[0].x + 160, panels[0].y + 230, 0.95, 'sad');
    balloon(ctx, panels[0].x + 24, panels[0].y + 16, 280, 90, 'Moth? ... Moth?', [panels[0].x + 130, panels[0].y + 150], 28);
    owl(ctx, panels[1].x + 160, panels[1].y + 235, 0.95, 'sad');
    ctx.fillStyle = '#e6d9a8'; ctx.font = '24px Caveat, cursive'; ctx.fillText('(a light in the window, far away)', panels[1].x + 16, panels[1].y + 36);
    ctx.fillStyle = '#ffd36b'; ctx.fillRect(panels[1].x + 250, panels[1].y + 150, 22, 18);
    // panel 3: empty — only a pencil outline of an owl
    ctx.fillStyle = '#f3ead2'; ctx.fillRect(panels[2].x, panels[2].y, panels[2].w, panels[2].h); wobblyRect(ctx, panels[2].x, panels[2].y, panels[2].w, panels[2].h, 33);
    ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = '#555'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.ellipse(panels[2].x + 160, panels[2].y + 200, 56, 66, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#7b6a4a'; ctx.font = '28px Caveat, cursive'; ctx.textAlign = 'center'; ctx.fillText('ending: ask Mar', panels[2].x + panels[2].w / 2, panels[2].y + panels[2].h / 2 - 20);
    ctx.textAlign = 'left';
    caption(ctx, 24, h - 86, w - 48, 54, 'TO BE CONTINUED. (She\'ll know how it ends. She always knows the last note.)', 26);
  }
}

/** a child's crayon drawing: "The Singing Lake" */
export function childDrawing(ctx, w, h) {
  paperFill(ctx, w, h, '#f2ecdc');
  const r = mulberry32(99);
  const crayon = (pts, col, lw = 9) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = 0.85;
    ctx.beginPath(); pts.forEach((p, i) => { const x = p[0] + wob(r, 4), y = p[1] + wob(r, 4); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.globalAlpha = 1; };
  const scribble = (x, y, ww, hh, col, n = 26) => { for (let i = 0; i < n; i++) { const yy = y + (i / n) * hh; crayon([[x + wob(r, 8), yy], [x + ww + wob(r, 8), yy + wob(r, 10)]], col, 10); } };
  scribble(60, h * 0.52, w - 120, h * 0.38, '#5b9bd8', 34);                    // lake
  crayon([[90, h * 0.62], [190, h * 0.58], [300, h * 0.66], [420, h * 0.6]], '#2d6fb0', 6);
  // sun
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(w - 180, 150, 64, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; crayon([[w - 180 + Math.cos(a) * 82, 150 + Math.sin(a) * 82], [w - 180 + Math.cos(a) * 124, 150 + Math.sin(a) * 124]], '#ffb300', 8); }
  // house with a lit window
  crayon([[90, 340], [90, 230], [200, 160], [310, 230], [310, 340], [90, 340]], '#a0522d', 10);
  scribble(130, 260, 60, 60, '#ffe14d', 8);
  // three figures on the ice: big, medium, small (yellow coat)
  const fig = (x, y, s, col) => { crayon([[x, y], [x, y + 90 * s]], col, 10); crayon([[x, y + 20 * s], [x - 34 * s, y + 60 * s]], col, 9); crayon([[x, y + 20 * s], [x + 34 * s, y + 60 * s]], col, 9); crayon([[x, y + 90 * s], [x - 24 * s, y + 150 * s]], col, 9); crayon([[x, y + 90 * s], [x + 24 * s, y + 150 * s]], col, 9);
    ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(x, y - 22 * s, 24 * s, 0, Math.PI * 2); ctx.stroke(); };
  fig(w * 0.42, h * 0.42, 1.25, '#3b3b3b'); fig(w * 0.56, h * 0.47, 1.05, '#c0392b'); fig(w * 0.69, h * 0.53, 0.82, '#f2c500');
  // music notes coming out of the ice
  ctx.fillStyle = '#7b2d8e'; ctx.font = 'bold 64px Caveat, cursive'; ['♪', '♫', '♪', '♬'].forEach((t, i) => ctx.fillText(t, 360 + i * 110, h * 0.78 + Math.sin(i * 1.7) * 26));
  ctx.fillStyle = '#4a3f2e'; ctx.font = '600 52px Caveat, cursive'; ctx.fillText('THE SINGING LAKE', 60, h - 80);
  ctx.font = '38px Caveat, cursive'; ctx.fillStyle = '#6b5a40'; ctx.fillText('by Jo (age 7).  Me, Mar & Dad.  I am the small one.', 60, h - 34);
}

/** a dock photograph; one person's face scratched out */
export function photoDock(ctx, w, h, { scratched = true, warm = true } = {}) {
  const r = mulberry32(5);
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.6); g.addColorStop(0, '#f4b982'); g.addColorStop(0.55, '#f9d9a8'); g.addColorStop(1, '#f5e6c8'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e9b98d'; ctx.beginPath(); ctx.arc(w * 0.72, h * 0.46, 54, 0, Math.PI * 2); ctx.fill();
  const lake = ctx.createLinearGradient(0, h * 0.52, 0, h); lake.addColorStop(0, '#f1c89a'); lake.addColorStop(1, '#5f7f99'); ctx.fillStyle = lake; ctx.fillRect(0, h * 0.52, w, h * 0.48);
  ctx.fillStyle = '#3d4a3a'; ctx.beginPath(); ctx.moveTo(0, h * 0.52); for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * 0.5 - Math.abs(Math.sin(x * 0.02 + 1)) * 36 - r() * 6); ctx.lineTo(w, h * 0.52); ctx.fill();
  // dock planks
  ctx.fillStyle = '#6b4a2e'; ctx.fillRect(0, h * 0.74, w, h * 0.06);
  for (let x = 0; x < w; x += 46) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x, h * 0.74, 3, h * 0.06); }
  // two people sitting, backs half-turned, feet over the edge
  const person = (x, col, hair, scratchedFace) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x - 52, h * 0.52, 104, h * 0.24, 30); ctx.fill();
    ctx.fillStyle = '#d4a07a'; ctx.beginPath(); ctx.arc(x, h * 0.47, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(x, h * 0.45, 42, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillRect(x - 42, h * 0.44, 84, 12);
    ctx.fillStyle = '#2c241c'; ctx.beginPath(); ctx.arc(x - 14, h * 0.47, 3.4, 0, 6.3); ctx.arc(x + 14, h * 0.47, 3.4, 0, 6.3); ctx.fill();
    ctx.strokeStyle = '#7c3d2c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, h * 0.485, 14, 0.2, Math.PI - 0.2); ctx.stroke();
    if (scratchedFace) {
      ctx.save(); ctx.beginPath(); ctx.arc(x, h * 0.47, 46, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#e3d6bd'; ctx.fillRect(x - 50, h * 0.40, 100, 90);
      ctx.strokeStyle = 'rgba(240,235,225,.95)'; ctx.lineWidth = 3;
      for (let i = 0; i < 46; i++) { ctx.beginPath(); const a = r() * 100 - 50, b = r() * 90; ctx.moveTo(x + a, h * 0.4 + b); ctx.lineTo(x + a + (r() * 60 - 30), h * 0.4 + b + (r() * 50 - 25)); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(70,55,40,.9)'; ctx.lineWidth = 1.8;
      for (let i = 0; i < 30; i++) { ctx.beginPath(); const a = r() * 100 - 50, b = r() * 90; ctx.moveTo(x + a, h * 0.4 + b); ctx.lineTo(x + a + (r() * 70 - 35), h * 0.4 + b + (r() * 50 - 25)); ctx.stroke(); }
      ctx.restore();
    }
  };
  person(w * 0.36, '#2f4a6a', '#4a2f1d', false);
  person(w * 0.55, '#e0b020', '#6b4a2e', scratched);
  // grain + vignette + fade
  for (let i = 0; i < 9000; i++) { ctx.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '40,30,20'},${r() * 0.09})`; ctx.fillRect(r() * w, r() * h, 1.5, 1.5); }
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,35,10,.5)'); ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  // creases
  ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w * 0.1, 0); ctx.lineTo(w * 0.16, h); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.moveTo(0, h * 0.7); ctx.lineTo(w, h * 0.66); ctx.stroke();
}

/** piano score drawn as owls perched on keys, numbered 1..7; the 8th perch is empty */
export function owlKeys(ctx, w, h) {
  paperFill(ctx, w, h, '#f1e8cf');
  ctx.fillStyle = INK; ctx.font = '600 40px Caveat, cursive'; ctx.textAlign = 'left'; ctx.fillText('for Mar — (not finished)', 30, 54);
  const keys = 8, kx = 40, kw = (w - 80) / keys, ky = h * 0.5, kh = h * 0.42;
  // white keys C D E F G A B C
  for (let i = 0; i < keys; i++) { ctx.fillStyle = '#fffdf6'; ctx.fillRect(kx + i * kw, ky, kw, kh); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(kx + i * kw, ky, kw, kh); }
  [0, 1, 3, 4, 5].forEach((i) => { ctx.fillStyle = '#1e1a16'; ctx.fillRect(kx + (i + 1) * kw - kw * 0.3, ky, kw * 0.6, kh * 0.6); });
  // the tune on white keys: D F A G F E D (indices on C-based octave: C0 D1 E2 F3 G4 A5 B6 C7)
  const seq = [1, 3, 5, 4, 3, 2, 1];
  seq.forEach((k, n) => {
    const x = kx + k * kw + kw / 2, y = ky - 22;
    owl(ctx, x, y - 40 + (n % 2) * 4, 0.34, 'proud', false);
    ctx.fillStyle = '#b3261e'; ctx.font = '600 38px Caveat, cursive'; ctx.textAlign = 'center'; ctx.fillText(String(n + 1), x, y - 128 + (n % 2) * 4);
    if (n < 6) { const k2 = seq[n + 1]; ctx.strokeStyle = 'rgba(179,38,30,.35)'; ctx.lineWidth = 2; ctx.setLineDash([5, 6]); ctx.beginPath(); ctx.moveTo(x, y - 142); ctx.quadraticCurveTo((x + kx + k2 * kw + kw / 2) / 2, y - 190, kx + k2 * kw + kw / 2, y - 144); ctx.stroke(); ctx.setLineDash([]); }
  });
  // eighth perch is empty: dashed circle with a question mark
  const ex = kx + 2 * kw + kw / 2; // E
  ctx.strokeStyle = 'rgba(40,30,20,.5)'; ctx.setLineDash([5, 6]); ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(kx + 7 * kw + kw / 2, ky - 62, 22, 28, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#8b7a58'; ctx.font = '600 44px Caveat, cursive'; ctx.textAlign = 'center'; ctx.fillText('?', kx + 7 * kw + kw / 2, ky - 52);
  ctx.textAlign = 'left'; ctx.fillStyle = '#6b5a40'; ctx.font = '26px Caveat, cursive'; ctx.fillText('one owl per key, in order. the last one hasn\'t landed yet.', 30, h - 18);
}

/** a photocopied MISSING flyer, weathered: halftone portrait, tear-off tabs all gone but one */
export function flyer(ctx, w, h) {
  paperFill(ctx, w, h, '#efe9d8');
  ctx.fillStyle = '#161616'; ctx.textAlign = 'center';
  ctx.font = "900 150px 'Special Elite', Impact, monospace"; ctx.fillText('MISSING', w / 2, 170);
  // halftone portrait
  const px = w / 2 - 210, py = 205, pw = 420, ph = 470; const step = 7;
  const rr = (() => { let a = 99; return () => (a = (a * 16807) % 2147483647) / 2147483647; })();
  for (let y = 0; y < ph; y += step) for (let x = 0; x < pw; x += step) {
    const nx = (x / pw - 0.5) * 2, ny = (y / ph - 0.5) * 2;
    let lum = 0.88;                                                              // paper
    const head = (nx / 0.46) ** 2 + ((ny + 0.28) / 0.5) ** 2;                    // head
    const hair = (nx / 0.52) ** 2 + ((ny + 0.42) / 0.36) ** 2;                   // curls
    const shoulders = ny > 0.35 && Math.abs(nx) < 0.95 - (ny - 0.35) * 0.1;      // coat
    const neck = Math.abs(nx) < 0.17 && ny > 0.12 && ny < 0.45;
    if (shoulders) lum = 0.28; else if (hair < 1 && ny < -0.3) lum = 0.18; else if (head < 1) lum = 0.62 + (nx > 0.1 ? -0.12 : 0.04); else if (neck) lum = 0.55;
    if (head < 1 && ny > -0.2 && ny < -0.1 && Math.abs(Math.abs(nx) - 0.18) < 0.07) lum = 0.4;   // eyes: a smudge, never a face
    lum += (rr() - 0.5) * 0.18; const r = (1 - Math.min(1, Math.max(0, lum))) * step * 0.62;
    if (r > 0.4) { ctx.beginPath(); ctx.arc(px + x, py + y, r, 0, 7); ctx.fill(); }
  }
  ctx.strokeStyle = '#161616'; ctx.lineWidth = 5; ctx.strokeRect(px - 4, py - 4, pw + 8, ph + 8);
  ctx.font = "700 44px 'Special Elite', monospace"; ctx.fillText('JONAH “JO” LINDEN, 22', w / 2, 735);
  ctx.font = "26px 'Special Elite', monospace";
  ['Last seen Mon. Feb 11, about 3 AM,', 'north bay, Halden Lake. 5′11″, brown curly hair.', 'Yellow rain jacket. Hums when he walks.', 'He is not in any trouble. He is just late.'].forEach((t, i) => ctx.fillText(t, w / 2, 785 + i * 36));
  ctx.font = "600 34px 'Special Elite', monospace"; ctx.fillText('Call Mara — 555 0143', w / 2, 960);
  // hand-written, later, in a different pen
  ctx.fillStyle = '#26358a'; ctx.font = "34px Caveat, cursive"; ctx.save(); ctx.translate(w / 2, 1005); ctx.rotate(-0.02); ctx.fillText('(porch light is on)', 0, 0); ctx.restore();
  // tear-off tabs, all gone but one
  ctx.fillStyle = '#161616'; const tw = (w - 60) / 8; ctx.font = "16px 'Special Elite', monospace";
  for (let i = 0; i < 8; i++) { const x0 = 30 + i * tw; ctx.strokeStyle = '#555'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(x0, 1030); ctx.lineTo(x0, h); ctx.stroke(); ctx.setLineDash([]);
    if (i === 5) { ctx.save(); ctx.translate(x0 + tw / 2, 1085); ctx.rotate(-Math.PI / 2); ctx.fillText('MARA 555 0143', 0, 0); ctx.restore(); } else { ctx.fillStyle = '#d9d2bd'; ctx.fillRect(x0 + 2, 1032, tw - 4, h - 1032); ctx.fillStyle = '#161616'; } }
  ctx.textAlign = 'left';
}
