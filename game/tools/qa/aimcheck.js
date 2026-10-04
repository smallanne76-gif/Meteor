// For every interaction: find a free standing spot near it, aim at it, and see whether the real interaction system picks it.
window.__aimcheck = async (game, { floors = [0, 2.85], skip = [] } = {}) => {
  const P = game.player, I = game.interact, THREE = window.__T;
  const res = { ok: [], bad: [] };
  const list = I.list.slice();
  for (const h of list) {
    const label = String(typeof h.label === 'function' ? h.label(game) : h.label);
    if (!label || skip.includes(label)) continue;
    const c = new THREE.Vector3(); I.center(h, c);
    // floor level under the object
    let floorY = 0; for (const f of floors) if (c.y >= f - 0.2) floorY = f;
    if (floors.length === 0) {
      const inLodge = c.x > -7.6 && c.x < 7.6 && c.z > -5.6 && c.z < 5.6;
      if (inLodge) floorY = c.y >= 2.6 ? 2.85 : 0;
      else { const g0 = game.collision.groundAt(c.x, c.z, c.y + 0.2, 4); if (g0) floorY = g0.y; }
    }
    const gnd = (x, z) => { const g = game.collision.groundAt(x, z, floorY + 0.6, 0.6); return g ? g.y : floorY; };
    const saveEn = h.enabled, saveUsed = h.used; h.enabled = true; h.used = false;
    let found = null;
    outer: for (const r of [0.9, 1.2, 1.5, 1.8]) {
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2; const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        const gy = gnd(x, z); if (Math.abs(gy - floorY) > 1.2) continue;
        P.teleport(x, gy, z, 0); P.vel && P.vel.set(0, 0, 0);
        await game.advance(0.1, 1 / 30, false);
        if (Math.hypot(P.pos.x - x, P.pos.z - z) > 0.08 || Math.abs(P.pos.y - gy) > 0.35) continue;   // not a free spot
        const eye = new THREE.Vector3(); game.camera.getWorldPosition(eye);
        const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
        P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        await game.advance(1 / 15, 1 / 30, false);
        if (I.target === h) { found = [+x.toFixed(2), +z.toFixed(2)]; break outer; }
      }
    }
    h.enabled = saveEn; h.used = saveUsed;
    (found ? res.ok : res.bad).push(found ? label : { label, at: [c.x, c.y, c.z].map((v) => +v.toFixed(2)) });
  }
  return { okCount: res.ok.length, bad: res.bad };
};
