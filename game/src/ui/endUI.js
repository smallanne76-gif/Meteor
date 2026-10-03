// UI for the quiet moments: spoken-line choices, the credits roll, and the post-credit voicemail.
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

/** Jo's full voicemail, 4:07. Mara only ever heard the first ten seconds. */
export const VOICEMAIL = [
  { t: 0, text: '(wind. a thin, falling tone, far off.)', who: '' },
  { t: 4, text: 'Mar. You’re gonna hate that I’m calling at three in the morning.', who: 'JO' },
  { t: 11, text: 'But listen. Just — listen.', who: 'JO' },
  { t: 16, text: '(the lake sings: one long note, falling, and under it a lower one.)', who: '' },
  { t: 34, text: 'Hear that? That’s the whole bay. It’s doing the laser thing, but lower. Like the whole lake is a cello. Dad was right.', who: 'JO' },
  { t: 52, text: 'It isn’t breaking. It’s stretching.', who: 'JO' },
  { t: 61, text: 'I’m gonna walk out a little further, get a cleaner take. I’ve got the recorder. It’s, like, forty centimetres of ice. Dad measured it.', who: 'JO' },
  { t: 80, text: 'It’s for your birthday. Don’t say you don’t want a present, you always say that. I’m getting you one anyway.', who: 'JO' },
  { t: 98, text: 'Leave the porch light on? So I can find the shore when I come back.', who: 'JO' },
  { t: 105, text: '(ice ticking under his boots. he hums seven notes, and stops.)', who: '' },
  { t: 150, text: 'I still don’t have the last note.', who: 'JO' },
  { t: 156, text: '…Maybe you do.', who: 'JO' },
  { t: 161, text: '(the lake sings for a long time. his breathing. a small laugh, just for himself.)', who: '' },
  { t: 232, text: 'Happy birthday, Mar.', who: 'JO' },
  { t: 238, text: 'Call me back. No rush.', who: 'JO' },
  { t: 247, text: '(end of message)', who: '' },
];

export function installEndUI(UI) {
  /** present spoken-line options; resolves with the chosen index. 1/2/3 or ↑↓ + Enter/E; click if the pointer is free. */
  UI.prototype.choice = function (options) {
    const g = this.game;
    return new Promise((resolve) => {
      const box = el('div', 'choice'); box.id = 'choice'; let sel = 0;
      const items = options.map((o, i) => { const d = el('div', 'opt', `<span class="n">${i + 1}</span><span class="tx">${o}</span>`); d.onclick = () => done(i); d.onmouseenter = () => { sel = i; paint(); }; box.appendChild(d); return d; });
      const paint = () => items.forEach((d, i) => d.classList.toggle('on', i === sel));
      const done = (i) => { removeEventListener('keydown', onKey, true); box.classList.remove('show'); setTimeout(() => box.remove(), 600); g.audio && g.audio.sfx('click', { vol: 0.35 }); resolve(i); };
      const onKey = (e) => {
        if (/^Digit[1-9]$/.test(e.code) && +e.code.slice(5) <= options.length) { done(+e.code.slice(5) - 1); e.preventDefault(); e.stopPropagation(); }
        else if (e.code === 'ArrowUp' || e.code === 'KeyW') { sel = (sel + options.length - 1) % options.length; paint(); e.preventDefault(); }
        else if (e.code === 'ArrowDown' || e.code === 'KeyS') { sel = (sel + 1) % options.length; paint(); e.preventDefault(); }
        else if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') { done(sel); e.preventDefault(); e.stopPropagation(); }
      };
      addEventListener('keydown', onKey, true);
      paint(); this.root.appendChild(box); requestAnimationFrame(() => box.classList.add('show'));
    });
  };

  /** the credits: slow, mostly dark, motifs drawn in CSS */
  UI.prototype.playCredits = function () {
    const g = this.game;
    return new Promise((resolve) => {
      const layer = el('div', 'layer credits'); layer.id = 'credits';
      const motif = (kind) => {
        if (kind === 'porch') return '<div class="mo porch"><i></i></div>';
        if (kind === 'notes') return '<div class="mo notes">' + [0, 3, 7, 5, 3, 2, 0].map((n, i) => `<b style="left:${i * 26}px;bottom:${n * 4}px"></b>`).join('') + '<b class="eighth" style="left:182px;bottom:36px"></b></div>';
        if (kind === 'owl') return '<div class="mo owl"><span>◔</span><span>◔</span></div>';
        if (kind === 'lake') return '<div class="mo lakeline"></div>';
        return '';
      };
      const body = [
        ['m', 'porch'], ['t', 'LEAVE THE LIGHT ON'], ['s', 'A story about a missed call.'], ['g'],
        ['h', 'A story in seven chapters'], ['g'],
        ['h', 'Story'], ['p', 'Mara Linden<br>Jonah “Jo” Linden<br>Walter Linden<br>and the part of her that never stopped searching'], ['g'],
        ['m', 'owl'], ['h', 'Captain Owl'], ['p', 'drawn, as always, in the margins<br>“Who? — Whoo.”'], ['g'],
        ['m', 'notes'], ['h', 'The Seven Notes'], ['p', 'D · F · A · G · F · E · D<br>and one more, going up'], ['g'],
        ['h', 'Sound'], ['p', 'Every sound in this game — the ice, the wind, the voices, the hum — was synthesised live as you listened.<br>There are no recordings of a real lake in it.<br>It still sounds like one, a little.'], ['g'],
        ['h', 'World'], ['p', 'Every texture, tree, plank and snowflake was generated from numbers.<br>No scanned or borrowed art.'], ['g'],
        ['h', 'Made with'], ['p', 'three.js (MIT)<br>Cormorant Garamond · Special Elite · Caveat · IM Fell English (SIL OFL)'], ['g'],
        ['m', 'lake'], ['h', 'For'], ['p', 'everyone who ever let it go to voicemail,<br>meaning to call back.'], ['g'],
        ['p', 'Call them.<br>Or don’t. There’s no rush.'], ['g'], ['g'],
      ];
      const roll = el('div', 'roll'); roll.innerHTML = body.map(([k, a]) => k === 'g' ? '<div class="gap"></div>' : k === 'm' ? motif(a) : k === 't' ? `<h1>${a}</h1>` : k === 's' ? `<div class="tag">${a}</div>` : k === 'h' ? `<h3>${a}</h3>` : `<p>${a}</p>`).join('');
      layer.appendChild(roll); this.root.appendChild(layer);
      const skip = el('div', 'skip', 'Hold E to skip'); layer.appendChild(skip);
      let y = innerHeight, t = 0, hold = 0, ended = false; const speed = 46;
      const h = (dt) => {
        if (ended) return; t += dt; y -= speed * dt; roll.style.transform = `translateY(${y}px)`;
        if (g.input.isDown('interact') && t > 4) { hold += dt; skip.style.opacity = 1; } else { hold = Math.max(0, hold - dt * 2); skip.style.opacity = t > 4 ? 0.35 : 0; }
        if (hold > 1.4 || y < -roll.scrollHeight - 80) { ended = true; g.off('update', h); layer.style.transition = 'opacity 2s'; layer.style.opacity = 0; setTimeout(() => { layer.remove(); resolve(); }, 2100); }
      };
      g.on('update', h);
    });
  };

  /** a phone in the dark. the whole message, at last. then: call back? */
  UI.prototype.postCredit = async function (onLine) {
    const g = this.game;
    const layer = el('div', 'layer postcredit'); layer.id = 'postcredit';
    layer.innerHTML = `<div class="phone"><div class="status">Voicemail</div><div class="who">Jo</div><div class="meta">Mon, Feb 11 · 3:12 AM · 4:07</div><div class="vm"></div><div class="calls"><button class="call" style="display:none">Call back</button></div></div>`;
    this.root.appendChild(layer); layer.style.opacity = 0; await g.wait(0.3); layer.style.transition = 'opacity 2.5s'; layer.style.opacity = 1; await g.wait(3);
    const vm = layer.querySelector('.vm'); const start = g.time;
    for (const line of VOICEMAIL) {
      const wait = start + line.t * 0.42 - g.time;   // 4:07 compressed: the message is read, not performed note for note
      if (wait > 0) await g.wait(wait);
      onLine && onLine(line); const d = el('div', 'ln' + (line.who ? '' : ' amb'), line.text); vm.appendChild(d); requestAnimationFrame(() => d.classList.add('show'));
      while (vm.children.length > 5) vm.firstChild.remove();
    }
    await g.wait(3);
    const btn = layer.querySelector('.call'); btn.style.display = ''; btn.classList.add('show');
    await new Promise((res) => { btn.onclick = res; const k = (e) => { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') { removeEventListener('keydown', k); res(); } }; addEventListener('keydown', k); });
    btn.disabled = true; layer.querySelector('.status').textContent = 'Calling…'; layer.querySelector('.who').textContent = 'Jo'; vm.innerHTML = '';
    return layer;
  };
}
