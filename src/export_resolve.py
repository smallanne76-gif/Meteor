"""Export the edit decision list for DaVinci Resolve.

Writes, next to the rendered video:
  resolve/meteorsmall_remake.edl     CMX3600 cut list (record TC on the 30 fps timeline, source TC in the recording)
  resolve/cutlist.json               every cut: beat, record/source range, flip, zoom, transitions, notes
  resolve/beats.csv                  the fitted beat grid (use as markers)
  resolve/build_in_resolve.py        run inside Resolve to rebuild the timeline + beat markers + per-clip flips/zoom

Note: the EDL/script reproduce the *cut structure* (every beat, flips, framing, source ranges, beat markers).
Speed ramps, the bespoke brand overlays and the transitions are rendered by src/render.py and are listed in
cutlist.json so they can be rebuilt as Resolve Fusion/Edit-page effects.
"""
import csv
import json
import os

import cutlist
from cutlist import PERIOD, PHASE, TOTAL, build

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "resolve")
FPS = 30
SRC_CLIP = "edit_current.mp4"


def tc(frames):
    frames = int(round(frames))
    f = frames % FPS
    s = (frames // FPS) % 60
    m = (frames // (FPS * 60)) % 60
    h = frames // (FPS * 3600)
    return f"{h:02d}:{m:02d}:{s:02d}:{f:02d}"


def beat_label(t0):
    b = (t0 - PHASE) / PERIOD
    return f"{b:.2f}".rstrip("0").rstrip(".")


def main():
    os.makedirs(OUT, exist_ok=True)
    cuts = build()
    rows = []
    edl = ["TITLE: METEORSMALL_IRONMAN_REMAKE", "FCM: NON-DROP FRAME", ""]
    for i, c in enumerate(cuts, 1):
        rec_in, rec_out = round(c.t0 * FPS), round(c.t1 * FPS)
        if i == len(cuts):
            rec_out = round(TOTAL * FPS)
        rec_n = max(1, rec_out - rec_in)
        lo, hi = min(c.s0, c.s1), max(c.s0, c.s1)
        src_in, src_out = round(lo * FPS), round(hi * FPS)
        src_n = max(1, src_out - src_in)
        speed = src_n / rec_n * (-1 if c.s1 < c.s0 else 1)
        retimed = abs(abs(speed) - 1.0) > 0.03 or speed < 0
        # source range actually written to the EDL: if retimed, keep the true source range and let M2 retime it
        edl.append(f"{i:03d}  SRC      V     C        {tc(src_in)} {tc(src_out)} {tc(rec_in)} {tc(rec_out)}")
        if retimed:
            edl.append(f"M2   SRC        {abs(speed) * FPS:05.1f}                {tc(src_in)}")
        edl.append(f"* FROM CLIP NAME: {SRC_CLIP}")
        note = f"beat {beat_label(c.t0)} | shot {c.tag} | flip {c.flip or '-'} | zoom {c.z0:.2f}->{c.z1:.2f}"
        if speed < 0:
            note += " | REVERSE (play backwards in Resolve: Change Clip Speed > Reverse)"
        edl.append(f"* COMMENT: {note}")
        edl.append("")
        rows.append({
            "n": i, "beat": float(beat_label(c.t0)), "shot": c.tag, "record_in": rec_in, "record_out": rec_out,
            "source_in": src_in, "source_out": src_out, "speed": round(speed, 3), "flip": c.flip,
            "zoom": [c.z0, c.z1], "roll": [c.rot0, c.rot1], "shake_px": c.shake, "punch": c.punch,
            "exposure": c.exposure, "transitions": [list(t) for t in c.tr], "note": c.note,
        })
    open(os.path.join(OUT, "meteorsmall_remake.edl"), "w").write("\n".join(edl))
    json.dump({"fps": FPS, "bpm": round(60 / PERIOD, 2), "beat_period_s": PERIOD, "first_beat_s": PHASE,
               "source": SRC_CLIP, "cuts": rows}, open(os.path.join(OUT, "cutlist.json"), "w"), indent=1)
    with open(os.path.join(OUT, "beats.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["beat", "time_s", "frame_30fps", "timecode"])
        for b in range(0, 67):
            t = PHASE + PERIOD * b
            w.writerow([b, f"{t:.3f}", round(t * FPS), tc(round(t * FPS))])
    print(f"{len(rows)} events, {sum(1 for r in rows if r['flip'])} flipped, written to {OUT}")


if __name__ == "__main__":
    main()
