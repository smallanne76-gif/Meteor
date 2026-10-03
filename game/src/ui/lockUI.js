// A small combination-lock overlay: four dials. Resolves with the entered code, or null if cancelled.
export function askCode(game, { title = 'Combination', digits = 4, hint = '', initial = '0000' } = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById('ui');
    const el = document.createElement('div'); el.className = 'layer'; el.style.cssText = 'z-index:27;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72)';
    el.innerHTML = `<div class="panel" style="padding:34px 54px;text-align:center"><div style="letter-spacing:.4em;text-transform:uppercase;color:var(--amber);font-size:16px;margin-bottom:18px">${title}</div>
      <div class="dials" style="display:flex;gap:14px;justify-content:center"></div>
      <div style="margin-top:20px;font-style:italic;color:#a8a398;font-size:18px;min-height:1.4em">${hint}</div>
      <div style="margin-top:18px;display:flex;gap:26px;justify-content:center"><button class="btn small" data-a="ok">Try</button><button class="btn small" data-a="cancel">Leave it</button></div></div>`;
    const dials = el.querySelector('.dials'); const vals = initial.split('').map(Number);
    const cols = vals.map((v, i) => {
      const c = document.createElement('div'); c.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px';
      const up = document.createElement('button'); up.textContent = '▲'; const dn = document.createElement('button'); dn.textContent = '▼';
      for (const b of [up, dn]) b.style.cssText = 'background:none;border:1px solid rgba(255,196,107,.3);color:#c89548;width:58px;height:26px;cursor:pointer;font-size:12px';
      const num = document.createElement('div'); num.style.cssText = "width:58px;height:84px;display:flex;align-items:center;justify-content:center;font:600 46px 'Elite',monospace;color:#f0e6cc;background:#14110d;border:1px solid rgba(255,196,107,.35);box-shadow:inset 0 0 18px #000";
      const upd = () => { num.textContent = vals[i]; game.audio && game.audio.sfx('click', { vol: 0.5 }); };
      up.onclick = () => { vals[i] = (vals[i] + 1) % 10; upd(); }; dn.onclick = () => { vals[i] = (vals[i] + 9) % 10; upd(); }; num.textContent = vals[i];
      num.onwheel = (e) => { vals[i] = (vals[i] + (e.deltaY < 0 ? 1 : 9)) % 10; upd(); e.preventDefault(); };
      c.append(up, num, dn); dials.appendChild(c); return c;
    });
    root.appendChild(el);
    const done = (v) => { removeEventListener('keydown', onKey, true); el.remove(); resolve(v); };
    const onKey = (e) => {
      if (e.code === 'Escape') { done(null); e.stopPropagation(); e.preventDefault(); }
      else if (e.code === 'Enter') { done(vals.join('')); e.stopPropagation(); e.preventDefault(); }
      else if (/^Digit\d$/.test(e.code)) { /* shift digits left */ vals.shift(); vals.push(+e.code.slice(5)); dials.querySelectorAll('div > div:nth-child(2)').forEach((n, i) => { n.textContent = vals[i]; }); e.stopPropagation(); e.preventDefault(); }
    };
    addEventListener('keydown', onKey, true);
    el.querySelector('[data-a=ok]').onclick = () => done(vals.join('')); el.querySelector('[data-a=cancel]').onclick = () => done(null);
    game.input.unlock && game.input.unlock();
  });
}
