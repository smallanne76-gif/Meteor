"""Render the remake: python3 src/render.py [--scale 0.35] [--out file.mp4] [--frames a:b] [--still T]

Frames are rendered in parallel, piped to ffmpeg (x264) and muxed with the
original track so the audio is untouched.
"""
import argparse
import multiprocessing as mp
import os
import subprocess
import sys
import time

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from engine import FPS, H0, W0, Renderer, Source  # noqa: E402
import cutlist  # noqa: E402

WORK = os.environ.get("METEOR_WORK", "/tmp/claude-0/-home-user-Meteor/7a41ece5-687c-5ded-81c1-f19d4b1a19d8/scratchpad")
SRC_RAW = os.path.join(WORK, "src.raw")
SRC_VIDEO = os.path.join(WORK, "src", "edit_current.mp4")

_R = None


def _init(scale):
    global _R
    from overlays import build_overlays  # local import so workers share the same code path
    _R = Renderer(Source(SRC_RAW), cutlist.build(), build_overlays(scale), scale=scale)


def _work(fn):
    return fn, _R.render(fn)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--out", default=os.path.join(HERE, "..", "output", "meteorsmall_ironman_remake.mp4"))
    ap.add_argument("--frames", default=None, help="a:b frame range")
    ap.add_argument("--still", type=float, default=None, help="render one still at time T (s) to --out png")
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--procs", type=int, default=4)
    ap.add_argument("--no-audio", action="store_true")
    a = ap.parse_args()

    n_total = int(round(cutlist.TOTAL * FPS))
    if a.still is not None:
        _init(a.scale)
        img = _R.render(int(round(a.still * FPS)))
        cv2.imwrite(a.out, img)
        print("wrote", a.out)
        return
    f0, f1 = 0, n_total
    if a.frames:
        f0, f1 = [int(x) for x in a.frames.split(":")]
    cw, ch = int(round(W0 * a.scale)), int(round(H0 * a.scale))
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{cw}x{ch}", "-r", str(FPS), "-i", "-"]
    if not a.no_audio:
        cmd += ["-ss", f"{f0 / FPS:.3f}", "-t", f"{(f1 - f0) / FPS:.3f}", "-i", SRC_VIDEO, "-map", "0:v", "-map", "1:a",
                "-c:a", "aac", "-b:a", "256k"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", str(a.crf), "-maxrate", "9M", "-bufsize", "18M", "-pix_fmt", "yuv420p",
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", a.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t0 = time.time()
    with mp.Pool(a.procs, initializer=_init, initargs=(a.scale,)) as pool:
        for k, (fn, img) in enumerate(pool.imap(_work, range(f0, f1), chunksize=4)):
            proc.stdin.write(img.tobytes())
            if k % 60 == 0:
                el = time.time() - t0
                print(f"frame {fn}/{f1}  {el:.0f}s elapsed  eta {el / (k + 1) * (f1 - f0 - k - 1):.0f}s", flush=True)
    proc.stdin.close()
    proc.wait()
    print("done", a.out, f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
