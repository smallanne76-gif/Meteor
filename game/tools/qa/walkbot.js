// Walk a path with real movement keys; report where progress stalls.
window.__walk = async (game, pts, { maxSec = 400, hunt = false, label = '' } = {}) => {
  const P = game.player, I = game.input, S = game.chapter && game.chapter.searcher;
  if (S && !hunt) { S.opts.noHunt = true; S.vanish && S.vanish(); }
  const stalls = []; let i = 0, t = 0, lastProg = 0, lastPos = P.pos.clone(), stillT = 0;
  I.virtual.add('KeyW');
  while (i < pts.length && t < maxSec) {
    const [tx, tz] = pts[i];
    const dx = tx - P.pos.x, dz = tz - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 1.6) { i++; continue; }
    P.yaw = Math.atan2(-dx, -dz); P.pitch = 0;
    if (game.mode !== 'free') { I.virtual.delete('KeyW'); await game.advance(0.5, 1 / 30, false); I.virtual.add('KeyW'); t += 0.5; continue; }
    await game.advance(0.25, 1 / 30, false); t += 0.25;
    const moved = P.pos.distanceTo(lastPos); lastPos.copy(P.pos);
    if (moved < 0.05) { stillT += 0.25; if (stillT > 2.5) { stalls.push({ at: [+P.pos.x.toFixed(1), +P.pos.y.toFixed(2), +P.pos.z.toFixed(1)], target: [tx, tz].map((v) => +v.toFixed(1)), idx: i }); break; } } else stillT = 0;
  }
  I.virtual.delete('KeyW');
  return { label, reached: i >= pts.length, idx: i, of: pts.length, t: +t.toFixed(1), pos: [P.pos.x, P.pos.z].map((v) => +v.toFixed(1)), stalls, mode: game.mode, phase: game.flags.phase };
};
