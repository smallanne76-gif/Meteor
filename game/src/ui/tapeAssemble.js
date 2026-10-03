// The splicing desk: four reels, three slots. Put the pieces of Jo's message in the order he said them. (One reel is not his.)
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export function assembleTapes(game, reels, correct) {
  return new Promise((resolve) => {
    const root = game.ui.root; const layer = el('div', 'layer'); layer.style.cssText = 'z-index:27;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.78)';
    const panel = el('div', 'panel'); panel.style.cssText = 'width:min(94vw,1100px);padding:28px 34px;text-align:center';
    panel.innerHTML = `<div style="letter-spacing:.4em;text-transform:uppercase;color:var(--amber);font-size:16px;margin-bottom:6px">The splicing desk</div>
      <div style="font-style:italic;color:#a8a398;font-size:18px;margin-bottom:16px">Dad labelled everything wrong, on purpose. Listen. Put what Jo said in the order he said it. One reel is not his.</div>
      <div class="cards" style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap"></div>
      <div style="margin:20px 0 6px;letter-spacing:.3em;font-size:14px;color:#8d887c;text-transform:uppercase">The tape, in order</div>
      <div class="slots" style="display:flex;gap:12px;justify-content:center"></div>
      <div class="msg" style="min-height:1.6em;margin-top:14px;font-style:italic;color:#c9a96b;font-size:18px"></div>
      <div style="display:flex;gap:26px;justify-content:center;margin-top:10px"><button class="btn small" data-a="play">Play</button><button class="btn small" data-a="clear">Clear</button><button class="btn small" data-a="leave">Leave it</button></div>`;
    layer.appendChild(panel); root.appendChild(layer);
    const cards = panel.querySelector('.cards'), slots = panel.querySelector('.slots'), msg = panel.querySelector('.msg'); const chosen = [];
    const paint = () => {
      slots.innerHTML = ''; for (let i = 0; i < 3; i++) { const id = chosen[i]; const r = reels.find((x) => x.id === id); const d = el('div', '', r ? `<b>${i + 1}</b> ${r.label}` : `<b>${i + 1}</b> —`); d.style.cssText = `min-width:220px;padding:12px 14px;border:1px solid ${r ? 'rgba(255,196,107,.5)' : 'rgba(255,255,255,.12)'};color:${r ? '#f0e6cc' : '#6d6a60'};cursor:${r ? 'pointer' : 'default'};font-size:17px`; if (r) d.onclick = () => { chosen.splice(i, 1); paint(); }; slots.appendChild(d); }
      [...cards.children].forEach((c) => { c.style.opacity = chosen.includes(c.dataset.id) ? 0.3 : 1; });
    };
    reels.forEach((r) => {
      const c = el('div', '', `<div style="letter-spacing:.14em;color:var(--amber);font-size:15px;margin-bottom:8px">${r.label}</div><div style="font-size:16px;line-height:1.45;font-style:italic;color:#d5cfbd;margin-bottom:10px">${r.text}</div><button class="btn small" style="padding:4px 14px">Listen</button>`);
      c.dataset.id = r.id; c.style.cssText = 'width:240px;padding:16px;border:1px solid rgba(255,255,255,.14);background:rgba(20,18,14,.7);cursor:pointer;text-align:left;transition:opacity .3s,border-color .3s';
      c.onmouseenter = () => (c.style.borderColor = 'rgba(255,196,107,.5)'); c.onmouseleave = () => (c.style.borderColor = 'rgba(255,255,255,.14)');
      c.querySelector('button').onclick = (e) => { e.stopPropagation(); r.listen && r.listen(); };
      c.onclick = () => { if (chosen.includes(r.id) || chosen.length >= 3) return; chosen.push(r.id); game.audio && game.audio.sfx('click', { vol: 0.4 }); paint(); };
      cards.appendChild(c);
    });
    const done = (v) => { removeEventListener('keydown', onKey, true); layer.remove(); resolve(v); };
    const onKey = (e) => { if (e.code === 'Escape') { done('cancel'); e.stopPropagation(); e.preventDefault(); } };
    addEventListener('keydown', onKey, true);
    panel.querySelector('[data-a=leave]').onclick = () => done('cancel');
    panel.querySelector('[data-a=clear]').onclick = () => { chosen.length = 0; msg.textContent = ''; paint(); };
    panel.querySelector('[data-a=play]').onclick = () => {
      if (chosen.length < 3) { msg.textContent = 'Three pieces. Put three on the tape.'; return; }
      if (chosen.every((id, i) => id === correct[i])) { done('ok'); return; }
      game.audio && (game.audio.sfx('static', { dur: 1.2, vol: 0.4 }), game.audio.sfx('reel', { vol: 0.5 }));
      msg.textContent = chosen.includes(reels.find((r) => r.decoy)?.id) ? 'That one is a stranger’s voice. It doesn’t belong on this tape.' : 'The splice doesn’t hold. The sentences don’t meet.';
    };
    game.input.unlock && game.input.unlock(); paint();
  });
}
