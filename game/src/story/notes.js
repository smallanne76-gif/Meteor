// Every readable document in the game. Never explain everything: let the player connect the dots.
import { comicStrip, childDrawing, photoDock, owlKeys } from './draw.js';

const tbl = (rows, head) => `<table>${head ? `<tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>` : ''}${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;

export const NOTES = {
  // ---------------------------------------------------------------- PROLOGUE
  voicemail_jo: {
    kind: 'recording', title: 'Voicemail — Jo', list: 'Voicemail · Jo · 3:12 AM',
    audio: 'voicemail_corrupt',
    html: `<p>Mon, Feb 11 · 3:12 AM · 4:07</p><p>[0:00] <i>(wind. A thin, falling tone, like a laser a long way off.)</i></p><p>[0:04] "Mar. You're gonna hate that I'm calling at —"</p><p>[0:08] <i>(static)</i></p><p>[0:09] "— no, listen. Just <i>listen</i> to —"</p><p>[0:12] <b>FILE DAMAGED</b></p>`,
  },
  mailbox: {
    kind: 'note', style: 'print', title: 'LINDEN — 41 Halden Lake Rd.', rot: 1.2, list: 'The mailbox',
    html: `<p>The box is packed solid. Winter-clearance flyers, sun-bleached to the colour of tea. A seed catalogue. Something from the county.</p>
      <p style="border:1px dashed #5a4a30;padding:10px"><b>HALDEN POST OFFICE</b><br>Box full. Delivery suspended.<br>Held mail will be returned to sender.<br><br>Notice date: <b>Jan 17, 2020</b></p>
      <p style="font-style:italic;color:#5a4a30">He never did pick up the mail.</p>`,
  },
  note_jo: {
    kind: 'note', style: 'hand', rot: -1.4, list: 'Note from Jo (kitchen)',
    html: `<p>Mar —</p><p>Happy (early) birthday!!<br>DO NOT open it till tomorrow. <span class="strike">(I know you.)</span> Wait anyway.</p>
      <p>Gone out to the north bay. It's twenty below and the whole lake is singing. I'm going to get it for you before it stops.</p>
      <p>I'll call from the ice so you can hear it live. <b>PICK UP.</b> (I know you're in the booth. Pick up anyway.)</p>
      <p>Back by 4. Leave the porch light on?</p><p class="sig">— J</p><p style="font-size:.75em">p.s. the one shaped like Ohio is mine.</p>`,
    stain: true,
  },
  note_breaker: {
    kind: 'note', style: 'hand', rot: 0.8, list: 'Note on the breaker box',
    html: `<p style="font-size:1.15em"><b>KEEP THE LIGHTS ON.</b></p><p>It doesn't come where it's lit.<br>Don't go to the lake.<br>Go back to the house. Sit by the fire. Wait.</p><p class="sig">— M</p><p style="opacity:.6;font-size:.8em;margin-top:1.4em">(I know. I know.)</p>`,
  },
  note_door: {
    kind: 'note', style: 'hand', rot: -0.6, list: 'Note on the front door',
    html: `<p>If you're reading this — don't turn the porch light off.</p><p style="margin-top:.6em"><span class="strike">He's coming back.</span><br><span class="strike">He's late.</span><br>He said back by four.</p>`,
  },
  tape_switch: {
    kind: 'note', style: 'hand', rot: 0, list: 'Tape on the porch switch',
    html: `<p style="font-size:1.1em">LEAVE IT ON.</p><p style="opacity:.55;font-size:.7em">— the masking tape has been replaced many times. Underneath it, older tape. Older still.</p>`,
  },

  // ---------------------------------------------------------------- LODGE
  comic_pun: { kind: 'drawing', title: 'Captain Owl #14', list: 'Captain Owl — "Who"', w: 1200, h: 560, rot: -0.6, render: (c, w, h) => comicStrip(c, w, h, 'pun') },
  comic_night: { kind: 'drawing', title: 'Captain Owl #31', list: 'Captain Owl — "It\'s stretching"', w: 1200, h: 560, rot: 0.4, render: (c, w, h) => comicStrip(c, w, h, 'night') },
  comic_unfinished: { kind: 'drawing', title: 'Captain Owl #40', list: 'Captain Owl — unfinished', w: 1200, h: 560, rot: -0.3, render: (c, w, h) => comicStrip(c, w, h, 'unfinished') },
  drawing_lake: { kind: 'drawing', title: 'The Singing Lake', list: 'A child\'s drawing', w: 1100, h: 780, rot: 0.8, render: (c, w, h) => childDrawing(c, w, h) },
  photo_scratched: { kind: 'photo', list: 'Photograph — the dock', w: 1100, h: 800, caption: 'Mar + J. Dock, July.', render: (c, w, h) => photoDock(c, w, h, { scratched: true }) },
  photo_whole: { kind: 'photo', list: 'Photograph — the dock (whole)', w: 1100, h: 800, caption: 'Mar + J. Dock, July.', render: (c, w, h) => photoDock(c, w, h, { scratched: false }) },
  owl_keys: { kind: 'drawing', title: 'For Mar', list: 'Owls on the keys', w: 1100, h: 640, rot: -0.5, render: (c, w, h) => owlKeys(c, w, h) },
  bracelet: {
    kind: 'note', style: 'type', rot: 0.5, list: 'Hospital bracelet',
    html: `<p style="border:2px solid #5a4a30;padding:12px;letter-spacing:.06em"><b>HALDEN COUNTY GENERAL</b><br><br>LINDEN, BABY BOY<br>DOB &nbsp;<b>03 / 12 / 1996</b><br>7 lb 2 oz<br>MOTHER: A. LINDEN</p><p style="font-size:.85em;opacity:.7">Dad kept it in the tin on the study shelf until Mar took it. She was five and a half years too old to hold a baby, and held him anyway. — (in Dad's pencil, on the back)</p>`,
  },
  tin_note: {
    kind: 'note', style: 'hand', rot: 1.4, list: 'Label on Dad\'s tin',
    html: `<p>For the boy who always wants to know what time it is.</p><p>(month first, then the day.)</p><p class="sig">— W.</p>`,
  },
  field_log: {
    kind: 'note', style: 'type', rot: -0.5, list: 'Dad\'s field log',
    html: `<h3>FIELD LOG — W. LINDEN — HALDEN LAKE</h3>
      ${tbl([
        ['02/03/03', '−24°', '41 cm', 'Took the kids out at 3. Jo (7) says the lake is "talking in laser." Mara recorded 11 min without breathing.'],
        ['02/09/04', '−19°', '37 cm', 'Quiet. Mara furious. Jo asleep on the sled.'],
        ['02/14/05', '−26°', '44 cm', 'Best night yet. 3:12 AM, north bay. It sang for six minutes straight. Wrote down the pitch. D, falling.'],
      ], ['Date', 'Air', 'Ice', 'Notes'])}
      <p style="margin-top:1em">Told them again: <i>it isn't breaking. It's stretching. Everything's singing if you wait.</i></p>`,
  },
  note_jo_room: {
    kind: 'note', style: 'hand', rot: 0.7, list: 'Pinned above Jo\'s desk',
    html: `<p><b>THINGS TO DO</b></p><p>☐ finish the song<br>☐ find the last note<br>☐ hydrophone — wrap it so it doesn't look like a hydrophone<br>☐ ask Mar to stay one more day (don't ask. she'll say yes, then leave)<br>☐ buy owl-shaped pancake mould (does this exist?)<br>☒ tell Mar the comics are good (she already did, kind of)</p>`,
  },
  tally: {
    kind: 'note', style: 'hand', rot: 0, list: 'Marks on the doorframe',
    html: `<p>Six pencil marks on the inside of the doorframe, at shoulder height. Each one has a date. Every one of them is <b>Feb 11</b>.</p><p style="opacity:.7">The first is a long time ago. The last is dated <i>this year</i> — and the pencil is still bright.</p>`,
  },

  // ---------------------------------------------------------------- GENERIC
  gift: {
    kind: 'note', style: 'hand', rot: -1, list: 'The gift',
    html: `<p>Wrapped in the Sunday comics. Twine. A card tucked under it.<br>The paper has gone soft and yellow at the folds.</p>`,
  },
};
