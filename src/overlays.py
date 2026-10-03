"""MeteorSmall brand placements.

Each placement is an object with a time window and `draw(canvas, ctx)`.  Where a
placement is "in the world" (wall mural, billboard) it is anchored in source
coordinates and follows the shot through a feature tracker + the per-frame
affine, so it stays stuck to the scenery through zooms, shakes and flips.
"""
import math
import os

import cv2
import numpy as np

from engine import SH, SRC_FPS, SW, Source
import cutlist
from cutlist import PERIOD, bt
from logo import FONTS, OUT as LOGO_DIR, text_mask

WORK = os.environ.get("METEOR_WORK", "/tmp/claude-0/-home-user-Meteor/7a41ece5-687c-5ded-81c1-f19d4b1a19d8/scratchpad")

NEON = (255, 226, 70)     # BGR electric cyan
HOT = (235, 250, 255)     # BGR warm white
ORANGE = (40, 140, 255)   # BGR meteor orange


# ----------------------------------------------------------------------------- basics
def smooth(x):
    x = float(np.clip(x, 0, 1))
    return x * x * (3 - 2 * x)


def env_ar(t, t0, t1, att=0.04, rel=0.12):
    if t < t0 or t > t1:
        return 0.0
    return smooth((t - t0) / att) * (1 - smooth((t - (t1 - rel)) / rel))


def beat_pulse(t, floor=0.7, tau=0.11):
    rel = (t - cutlist.PHASE) / PERIOD
    dt = (rel - math.floor(rel)) * PERIOD
    return floor + (1 - floor) * math.exp(-dt / tau)


_masks = {}


def logo_mask(name):
    if name not in _masks:
        im = cv2.imread(os.path.join(LOGO_DIR, name + ".png"), cv2.IMREAD_UNCHANGED)
        _masks[name] = im[..., 3].astype(np.float32) / 255.0
    return _masks[name]


_text = {}


def txt(text, fontfile, px, tracking=0.0):
    key = (text, fontfile, px, tracking)
    if key not in _text:
        _text[key] = text_mask(text, os.path.join(FONTS, fontfile), px, tracking)
    return _text[key]


def mask_w(name, w):
    """logo mask resized to width w (px)."""
    m = logo_mask(name)
    w = max(4, int(w))
    h = max(2, int(round(m.shape[0] * w / m.shape[1])))
    return cv2.resize(m, (w, h), interpolation=cv2.INTER_AREA if w < m.shape[1] else cv2.INTER_CUBIC)


def blit_comet(canvas, x_head, y_head, w, k=1.0, glow=True, s=1.0):
    """Draw the MeteorSmall comet with its head centred on (x_head, y_head); w = icon width in px."""
    ic = mask_w("icon", w)
    heat = cv2.resize(logo_mask("icon_heat"), (ic.shape[1], ic.shape[0]), interpolation=cv2.INTER_AREA)
    # head sits at about (0.66, 0.66) of the cropped icon
    ix, iy = int(x_head - ic.shape[1] * 0.80), int(y_head - ic.shape[0] * 0.80)
    col = np.zeros(ic.shape + (3,), np.float32)
    col[...] = np.array(ORANGE, np.float32) * (1 - heat[..., None]) + np.array((235, 245, 255), np.float32) * heat[..., None]
    if glow:
        pad = int(24 * s)
        g = cv2.GaussianBlur(np.pad(ic, pad), (0, 0), 8 * s)
        blit(canvas, g, ix - pad, iy - pad, ORANGE, "add", 0.9 * k)
    blit(canvas, ic, ix, iy, col, "normal", min(1.0, 0.98 * k))


def place_mask(mask, quad, shape):
    """Perspective-warp `mask` into the canvas quad (TL,TR,BR,BL px). Returns (alpha, x0, y0) or None."""
    H, W = shape[:2]
    q = np.asarray(quad, np.float32)
    x0 = int(max(0, math.floor(q[:, 0].min()) - 2))
    x1 = int(min(W, math.ceil(q[:, 0].max()) + 2))
    y0 = int(max(0, math.floor(q[:, 1].min()) - 2))
    y1 = int(min(H, math.ceil(q[:, 1].max()) + 2))
    if x1 - x0 < 2 or y1 - y0 < 2:
        return None
    tw = float(np.linalg.norm(q[1] - q[0]))
    h, w = mask.shape
    if tw < w * 0.7:
        nw = max(4, int(tw * 1.4))
        mask = cv2.resize(mask, (nw, max(2, int(h * nw / w))), interpolation=cv2.INTER_AREA)
        h, w = mask.shape
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    Hm = cv2.getPerspectiveTransform(src, q - np.float32([x0, y0]))
    a = cv2.warpPerspective(mask, Hm, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR)
    return a, x0, y0


def rect_quad(cx, cy, w, h, ang_deg=0.0):
    a = math.radians(ang_deg)
    c, s = math.cos(a), math.sin(a)
    pts = np.array([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], np.float32)
    R = np.array([[c, -s], [s, c]], np.float32)
    return (pts @ R.T) + np.float32([cx, cy])


def blit(canvas, a, x0, y0, color, mode="add", gain=1.0):
    h, w = a.shape
    H, W = canvas.shape[:2]
    xa, ya = max(0, x0), max(0, y0)
    xb, yb = min(W, x0 + w), min(H, y0 + h)
    if xb <= xa or yb <= ya:
        return
    sub = a[ya - y0:yb - y0, xa - x0:xb - x0, None] * gain
    roi = canvas[ya:yb, xa:xb].astype(np.float32)
    col = np.asarray(color, np.float32)
    if col.ndim == 3:
        col = col[ya - y0:yb - y0, xa - x0:xb - x0]
    if mode == "add":
        roi += sub * col
    elif mode == "normal":
        s = np.clip(sub, 0, 1)
        roi = roi * (1 - s) + col * s
    elif mode == "screen":
        s = np.clip(sub, 0, 1)
        roi = 255 - (255 - roi) * (255 - col * s) / 255
    elif mode == "multiply":
        s = np.clip(sub, 0, 1)
        roi = roi * (1 - s + s * col / 255.0)
    canvas[ya:yb, xa:xb] = np.clip(roi, 0, 255).astype(np.uint8)


def neon(canvas, a, x0, y0, color=NEON, k=1.0, core=0.9, sig=(2.5, 8.0, 22.0), gains=(0.9, 0.6, 0.45), scale=1.0):
    """Neon-tube look: tinted multi-radius glow + white-hot core."""
    pad = int(3 * max(sig) * scale) + 2
    ap = np.pad(a, pad)
    g = np.zeros_like(ap)
    for s, gn in zip(sig, gains):
        g += gn * cv2.GaussianBlur(ap, (0, 0), s * scale)
    blit(canvas, g, x0 - pad, y0 - pad, color, "add", k * 0.9)
    blit(canvas, a, x0, y0, (255, 255, 255), "add", k * core)
    blit(canvas, a, x0, y0, color, "add", k * 0.35)


# ----------------------------------------------------------------------------- tracker
class Tracker:
    """Similarity tracks of background features around a region (ref frame -> any frame in range)."""

    def __init__(self, source, t_ref, t_lo, t_hi, roi_poly):
        self.T = {}
        i_ref = int(round(t_ref * SRC_FPS))
        lo, hi = int(round(t_lo * SRC_FPS)), int(round(t_hi * SRC_FPS))
        poly = np.asarray(roi_poly, np.float32)
        self.T[i_ref] = np.eye(3)

        def gray(i):
            return cv2.cvtColor(np.asarray(source.mm[i]), cv2.COLOR_BGR2GRAY)

        for d in (1, -1):
            T = np.eye(3)
            prev = gray(i_ref)
            i = i_ref
            while lo <= i + d <= hi:
                cur = gray(i + d)
                mask = np.zeros((SH, SW), np.uint8)
                p = (T[:2] @ np.hstack([poly, np.ones((len(poly), 1), np.float32)]).T).T
                cv2.fillPoly(mask, [p.astype(np.int32)], 255)
                pts = cv2.goodFeaturesToTrack(prev, 250, 0.008, 6, mask=mask)
                S = np.eye(3)
                if pts is not None and len(pts) >= 10:
                    nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev, cur, pts, None, winSize=(25, 25), maxLevel=3)
                    ok = st.reshape(-1) == 1
                    if ok.sum() >= 8:
                        M, inl = cv2.estimateAffinePartial2D(pts[ok], nxt[ok], method=cv2.RANSAC, ransacReprojThreshold=2.0)
                        if M is not None:
                            S = np.vstack([M, [0, 0, 1]])
                T = S @ T
                i += d
                self.T[i] = T
                prev = cur

    def get(self, src_t):
        x = src_t * SRC_FPS
        i0 = int(math.floor(x))
        f = x - i0
        keys = sorted(self.T)
        i0c = min(max(i0, keys[0]), keys[-1])
        i1c = min(max(i0 + 1, keys[0]), keys[-1])
        A, B = self.T[i0c], self.T[i1c]
        return A * (1 - f) + B * f

    def map_pts(self, src_t, pts):
        T = self.get(src_t)
        p = np.asarray(pts, np.float32).reshape(-1, 2)
        return (T[:2] @ np.hstack([p, np.ones((len(p), 1), np.float32)]).T).T


# ----------------------------------------------------------------------------- placements
class Overlay:
    t0 = 0.0
    t1 = 0.0

    def draw(self, canvas, ctx):
        raise NotImplementedError


class BootText(Overlay):
    """Black pre-roll: METEORSMALL types itself on a CRT line before the reactor ignites."""

    def __init__(self, t1):
        self.t0, self.t1 = 0.0, t1

    def draw(self, canvas, ctx):
        if ctx.cut is not None:
            return
        t, (h, w) = ctx.T, canvas.shape[:2]
        s = ctx.scale
        label = "METEORSMALL"
        n = int(np.clip((t - 0.06) / 0.035, 0, len(label)))
        if n > 0:
            a = txt(label[:n], "orbitron-700.ttf", 64)
            a = cv2.resize(a, (max(2, int(a.shape[1] * s * 1.0)), max(2, int(a.shape[0] * s * 1.0))), interpolation=cv2.INTER_AREA)
            full = txt(label, "orbitron-700.ttf", 64)
            fw = int(full.shape[1] * s)
            x0 = int(w / 2 - fw / 2)
            y0 = int(h * 0.5 - a.shape[0] / 2)
            fl = 0.75 + 0.25 * math.sin(t * 90) if n >= len(label) else 1.0
            neon(canvas, a, x0, y0, NEON, k=fl, scale=s * 0.6)
            # blinking caret
            if int(t * 14) % 2 == 0:
                cx = x0 + a.shape[1] + int(8 * s)
                cv2.rectangle(canvas, (cx, y0), (cx + int(7 * s), y0 + a.shape[0]), NEON, -1)
        # growing scan line
        ln = smooth((t - 0.02) / 0.25)
        yy = int(h * 0.5 + 56 * s)
        half = int(w * 0.36 * ln)
        if half > 2:
            cv2.line(canvas, (w // 2 - half, yy), (w // 2 + half, yy), (140, 120, 30), max(1, int(2 * s)))
            sub = txt("SYSTEM ONLINE", "rajdhani-500.ttf", 30, 0.25)
            sub = cv2.resize(sub, (max(2, int(sub.shape[1] * s)), max(2, int(sub.shape[0] * s))), interpolation=cv2.INTER_AREA)
            blit(canvas, sub, w // 2 - sub.shape[1] // 2, yy + int(14 * s), NEON, "add", 0.7 * smooth((t - 0.3) / 0.1))
        # CRT scanlines
        canvas[::3] = (canvas[::3] * 0.75).astype(np.uint8)


class TypedTag(Overlay):
    """Tiny typed '| MADE BY METEORSMALL' credit near the bottom, like a creator watermark."""

    def __init__(self, t0, t1):
        self.t0, self.t1 = t0, t1

    def draw(self, canvas, ctx):
        t, (h, w) = ctx.T, canvas.shape[:2]
        s = ctx.scale
        label = "MADE BY METEORSMALL"
        n = int(np.clip((t - self.t0) / 0.035, 0, len(label)))
        fade = smooth((self.t1 - t) / 0.2)
        if n == 0 or fade <= 0:
            return
        full = txt(label, "rajdhani-700.ttf", 34, 0.34)
        a = txt(label[:n], "rajdhani-700.ttf", 34, 0.34)
        k = 0.62 * s
        fw = int(full.shape[1] * k)
        x0 = int(w / 2 - fw / 2)
        aa = cv2.resize(a, (max(2, int(a.shape[1] * k)), max(2, int(a.shape[0] * k))), interpolation=cv2.INTER_AREA)
        y0 = int(h * 0.935)
        blit(canvas, aa, x0 + 1, y0 + 1, (0, 0, 0), "normal", 0.55 * fade)
        blit(canvas, aa, x0, y0, (255, 255, 255), "normal", 0.82 * fade)
        if (n < len(label)) or int(t * 3) % 2 == 0:
            cx = x0 - int(10 * s) if n == len(label) else x0 + aa.shape[1] + int(4 * s)
            cv2.rectangle(canvas, (cx, y0 - int(2 * s)), (cx + max(1, int(2 * s)), y0 + aa.shape[0] + int(2 * s)),
                          (255, 255, 255), -1)


def _blobs(canvas, roi_px, kind="eye", min_area=40, max_area=None, rank="area"):
    """Bright blobs inside roi_px=(x0,y0,x1,y1) of the canvas. kind: eye (cyan-white) | glint (blue)."""
    x0, y0, x1, y1 = [int(v) for v in roi_px]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(canvas.shape[1], x1), min(canvas.shape[0], y1)
    if x1 - x0 < 4 or y1 - y0 < 4:
        return []
    sub = canvas[y0:y1, x0:x1].astype(np.int32)
    b, g, r = sub[..., 0], sub[..., 1], sub[..., 2]
    if kind == "eye":
        m = (b > 200) & (g > 195) & (b - r > 42)
    elif kind == "eyew":   # near-white eyes (front-facing shots)
        m = (b > 225) & (g > 220) & (b - r > 8)
    else:  # glint: saturated bright blue/cyan
        m = (b > 190) & (b - r > 60)
    m = m.astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, lab, stats, cent = cv2.connectedComponentsWithStats(m, 8)
    out = []
    bright = (sub[..., 0] + sub[..., 1])
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area >= min_area and (max_area is None or area <= max_area):
            key = float(bright[lab == i].max()) if rank == "bright" else float(area)
            out.append((key, cent[i][0] + x0, cent[i][1] + y0, w, h))
    out.sort(reverse=True)
    return out


class EyeFlare(Overlay):
    """Iron Man's eyes ignite into the MeteorSmall mark: comet in each eye + wordmark riding the lens streak."""

    def __init__(self, t0, t1, roi_src, n_eyes=2, word_dy=1.0, word_w=0.84, plate=False):
        self.t0, self.t1 = t0, t1
        self.roi_src = roi_src  # (x0,y0,x1,y1) fractions of the source frame
        self.n_eyes, self.word_dy, self.word_w, self.plate = n_eyes, word_dy, word_w, plate

    def draw(self, canvas, ctx):
        t, (h, w) = ctx.T, canvas.shape[:2]
        e = env_ar(t, self.t0, self.t1, 0.03, 0.14) * beat_pulse(t, 0.8, 0.12)
        if e <= 0.01:
            return
        s = ctx.scale
        rx0, ry0, rx1, ry1 = self.roi_src
        pts = ctx.map([(rx0 * SW, ry0 * SH), (rx1 * SW, ry1 * SH)])
        roi = (min(pts[:, 0]), min(pts[:, 1]), max(pts[:, 0]), max(pts[:, 1]))
        blobs = _blobs(canvas, roi, "eye", min_area=int(60 * s * s))
        blobs = [b for b in blobs if b[3] > 1.3 * b[4]][: self.n_eyes]
        if not blobs:
            return
        ys = [b[2] for b in blobs]
        xs = [b[1] for b in blobs]
        cy = float(np.mean(ys))
        cx = float(np.mean(xs))
        for area, bx, by, bw, bh in blobs:
            pad = int(40 * s)
            a = np.zeros((int(bh * 3 + 2 * pad), int(bw * 2 + 2 * pad)), np.float32)
            cv2.ellipse(a, (a.shape[1] // 2, a.shape[0] // 2), (max(2, int(bw * 0.5)), max(2, int(bh * 0.55))), 0, 0, 360, 1.0, -1, cv2.LINE_AA)
            ax, ay = int(bx - a.shape[1] / 2), int(by - a.shape[0] / 2)
            blit(canvas, cv2.GaussianBlur(a, (0, 0), 7 * s), ax, ay, NEON, "add", 1.5 * e)
            blit(canvas, a, ax, ay, (255, 255, 255), "add", 0.22 * e)
            # comet icon inside the eye: white-hot head sits on the eye, orange tail streaks away
            blit_comet(canvas, bx, by, int(max(bh * 4.2, 90 * s)), e, True, s)
        # anamorphic streak through the eyes
        streak = np.zeros((int(10 * s) + 6, int(w * 1.0)), np.float32)
        gx = np.linspace(-1, 1, streak.shape[1])
        streak[:] = np.exp(-(gx ** 2) * 3.2)[None, :]
        streak = cv2.GaussianBlur(streak, (0, 0), 1.4 * s)
        blit(canvas, streak, int(cx - streak.shape[1] / 2), int(cy - streak.shape[0] / 2), NEON, "add", 0.9 * e)
        # wordmark riding the streak, wiped in from the centre
        ww = int(w * self.word_w)
        wm = mask_w("wordmark", ww)
        reveal = smooth((t - self.t0) / 0.14)
        xs_ = np.abs(np.linspace(-1, 1, wm.shape[1]))
        wm = wm * (xs_ < reveal)[None, :]
        wy = int(np.clip(cy + self.word_dy * (50 * s + wm.shape[0] * 0.5), wm.shape[0], h - wm.shape[0] * 1.5 - 90 * s))
        wx = int(w / 2 - wm.shape[1] / 2)
        if self.plate:   # dark band so the wordmark survives bright specular highlights on the helmet
            px0, px1 = max(0, wx - int(0.03 * w)), min(w, wx + wm.shape[1] + int(0.03 * w))
            py0, py1 = max(0, wy - int(wm.shape[0] * 0.55)), min(h, wy + int(wm.shape[0] * 1.55))
            roi_ = canvas[py0:py1, px0:px1]
            dark = np.full_like(roi_, (22, 14, 8))
            cv2.addWeighted(dark, 0.72 * e, roi_, 1 - 0.72 * e, 0, roi_)
            cv2.rectangle(canvas, (px0, py0), (px1 - 1, py1 - 1), tuple(int(c * e * 0.9) for c in NEON), max(1, int(2 * s)), cv2.LINE_AA)
        neon(canvas, wm, wx, wy, NEON, k=e, scale=s * 0.8)


class FaceCatch(Overlay):
    """Tiny MeteorSmall comet reflected in the blue glint of Tony's eye."""

    def __init__(self, t0, t1, roi_src=(0.0, 0.0, 1.0, 0.5)):
        self.t0, self.t1 = t0, t1
        self.roi_src = roi_src

    def draw(self, canvas, ctx):
        t, (h, w) = ctx.T, canvas.shape[:2]
        e = env_ar(t, self.t0, self.t1, 0.12, 0.2)
        if e <= 0.01:
            return
        s = ctx.scale
        rx0, ry0, rx1, ry1 = self.roi_src
        pts = ctx.map([(rx0 * SW, ry0 * SH), (rx1 * SW, ry1 * SH)])
        roi = (min(pts[:, 0]), min(pts[:, 1]), max(pts[:, 0]), max(pts[:, 1]))
        bl = _blobs(canvas, roi, "glint", min_area=int(14 * s * s), max_area=int(2600 * s * s), rank="bright")
        if not bl:
            return
        _, bx, by, bw, bh = bl[0]
        grow = 0.7 + 0.3 * smooth((t - self.t0) / 0.5)
        iw = int(max(105 * s, bw * 3.4) * grow)
        blit_comet(canvas, bx, by, iw, e, True, s)


class NeonSwap(Overlay):
    """The out-of-focus 'JUICE' neon sign behind Iron Man now reads METEORSMALL."""

    def __init__(self, t0, t1, roi_src=(0.35, 0.0, 1.0, 0.32)):
        self.t0, self.t1 = t0, t1
        self.roi_src = roi_src

    def draw(self, canvas, ctx):
        t, (h, w) = ctx.T, canvas.shape[:2]
        e = env_ar(t, self.t0, self.t1, 0.06, 0.06)
        if e <= 0.01:
            return
        s = ctx.scale
        rx0, ry0, rx1, ry1 = self.roi_src
        pts = ctx.map([(rx0 * SW, ry0 * SH), (rx1 * SW, ry1 * SH)])
        x0, y0 = int(max(0, min(pts[:, 0]))), int(max(0, min(pts[:, 1])))
        x1, y1 = int(min(w, max(pts[:, 0]))), int(min(h, max(pts[:, 1])))
        if x1 - x0 < 8 or y1 - y0 < 8:
            return
        sub = canvas[y0:y1, x0:x1]
        b, g, r = [sub[..., i].astype(np.int32) for i in range(3)]
        m = ((g > 85) & (g - r > 22) & (g - b > 22)).astype(np.uint8) * 255
        m = cv2.dilate(m, np.ones((int(13 * s) | 1, int(13 * s) | 1), np.uint8))
        n, lab, stats, cent = cv2.connectedComponentsWithStats(m, 8)
        keep = [i for i in range(1, n) if stats[i][4] > 150 * s * s]
        if not keep:
            return
        xs = [stats[i][0] for i in keep] + [stats[i][0] + stats[i][2] for i in keep]
        ys = [stats[i][1] for i in keep] + [stats[i][1] + stats[i][3] for i in keep]
        bx0, bx1, by0, by1 = min(xs), max(xs), min(ys), max(ys)
        mm = np.isin(lab, keep).astype(np.uint8) * 255
        mm = cv2.dilate(mm, np.ones((int(15 * s) | 1, int(15 * s) | 1), np.uint8))
        # remove the old sign: inpaint on a down-scaled copy then blend back through the mask
        small = cv2.resize(sub, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
        msm = cv2.resize(mm, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_NEAREST)
        painted = cv2.inpaint(small, msm, 5, cv2.INPAINT_TELEA)
        painted = cv2.resize(painted, (sub.shape[1], sub.shape[0]), interpolation=cv2.INTER_CUBIC)
        soft = cv2.GaussianBlur(mm, (0, 0), 3 * s).astype(np.float32)[..., None] / 255.0
        canvas[y0:y1, x0:x1] = (sub * (1 - soft) + painted * soft).astype(np.uint8)
        # new neon: fit METEORSMALL (wordmark) into the old box, softly out of focus like the original
        bw = max(40, bx1 - bx0)
        wm = mask_w("wordmark", int(min(bw * 1.7, w * 0.62)))
        cxm, cym = x0 + (bx0 + bx1) / 2, y0 + (by0 + by1) / 2
        cxm = float(np.clip(cxm, w * 0.04 + int(min(bw * 1.7, w * 0.62)) / 2, w * 0.96 - int(min(bw * 1.7, w * 0.62)) / 2))
        wm = cv2.GaussianBlur(wm, (0, 0), 1.2 * s)
        flick = 1.0 if (int(t * 24) % 11) else 0.55   # tube flicker
        neon(canvas, wm, int(cxm - wm.shape[1] / 2), int(cym - wm.shape[0] / 2), (255, 70, 235), k=e * flick,
             sig=(3, 9, 24), gains=(1.0, 0.8, 0.6), scale=s * 0.7)



class TrackedSign(Overlay):
    """A sign that lives in the scene: anchored to a source-space quad and carried by the feature tracker."""

    def __init__(self, t0, t1, tracker, quad_ref, mask="wordmark", style="holo", att=0.08, rel=0.1):
        self.t0, self.t1 = t0, t1
        self.tracker, self.quad_ref, self.style = tracker, np.asarray(quad_ref, np.float32), style
        self.mask = mask_w(mask, 760)
        self.att, self.rel = att, rel

    def draw(self, canvas, ctx):
        if ctx.cut is None:
            return
        t, s = ctx.T, ctx.scale
        e = env_ar(t, self.t0, self.t1, self.att, self.rel)
        if e <= 0.01:
            return
        q = ctx.map_quad(self.tracker.map_pts(ctx.src_t, self.quad_ref))
        r = place_mask(self.mask, q, canvas.shape)
        if r is None:
            return
        a, x0, y0 = r
        if self.style == "holo":
            self._holo(canvas, a, x0, y0, q, t, e, s)
        else:
            self._paint(canvas, a, x0, y0, t, e, s)

    def _holo(self, canvas, a, x0, y0, q, t, e, s):
        # dark holographic plate behind the sign so it reads even against bright haze
        tl, tr_, br, bl = [np.asarray(p, np.float32) for p in q]
        cen = (tl + tr_ + br + bl) / 4
        ex = lambda p, kx, ky: cen + (p - cen) * np.array([kx, ky], np.float32)
        plate = np.array([ex(tl, 1.16, 2.5), ex(tr_, 1.16, 2.5), ex(br, 1.16, 2.5), ex(bl, 1.16, 2.5)], np.float32)
        bx0, by0 = int(max(0, plate[:, 0].min() - 6)), int(max(0, plate[:, 1].min() - 6))
        bx1, by1 = int(min(canvas.shape[1], plate[:, 0].max() + 6)), int(min(canvas.shape[0], plate[:, 1].max() + 6))
        if bx1 > bx0 and by1 > by0:
            roi = canvas[by0:by1, bx0:bx1]
            ov = roi.copy()
            pl = (plate - np.float32([bx0, by0])).astype(np.int32)
            cv2.fillConvexPoly(ov, pl, (26, 16, 8))
            cv2.addWeighted(ov, 0.70 * e, roi, 1 - 0.70 * e, 0, roi)
            edge = np.zeros(roi.shape[:2], np.float32)
            cv2.polylines(edge, [pl], True, 1.0, max(1, int(2 * s)), cv2.LINE_AA)
            blit(canvas, cv2.GaussianBlur(edge, (0, 0), 3 * s) * 1.4 + edge, bx0, by0, NEON, "add", 0.75 * e)
        yy = np.arange(a.shape[0], dtype=np.float32)[:, None]
        scan = 0.82 + 0.18 * np.sin((yy + t * 70) / (1.7 * max(s, 0.4)))
        flick = 0.92 + 0.08 * math.sin(t * 51) - (0.4 if (int(t * 30) % 13 == 0) else 0.0)
        a = cv2.GaussianBlur(a, (0, 0), 0.8 * s) * scan
        neon(canvas, a, x0, y0, NEON, k=e * flick, sig=(2.5, 8, 22), gains=(0.8, 0.55, 0.4), scale=s)

    def _paint(self, canvas, a, x0, y0, t, e, s):
        h, w = a.shape
        H, W = canvas.shape[:2]
        xa, ya, xb, yb = max(0, x0), max(0, y0), min(W, x0 + w), min(H, y0 + h)
        if xb <= xa or yb <= ya:
            return
        a = a[ya - y0:yb - y0, xa - x0:xb - x0]
        roi = canvas[ya:yb, xa:xb].astype(np.float32)
        b_, g_, r_ = roi[..., 0], roi[..., 1], roi[..., 2]
        matte = np.clip((r_ - b_ - 6) / 26.0, 0, 1)                       # warm suit pixels stay in front of the wall
        matte = cv2.GaussianBlur(matte, (0, 0), 1.5 * s)
        rough = cv2.GaussianBlur(np.random.default_rng(3).random(a.shape).astype(np.float32), (0, 0), 1.2 * s)
        a2 = cv2.GaussianBlur(a, (0, 0), 0.9 * s) * (0.9 + 0.2 * rough) * (1 - matte)
        halo = cv2.GaussianBlur(a, (0, 0), 6 * s) * 0.30 * (1 - matte)
        luma = cv2.GaussianBlur(roi.mean(axis=2), (0, 0), 2.5 * s) / 255.0
        L = np.clip(0.50 + luma * 1.6, 0.5, 1.25)[..., None]
        grow = smooth((t - self.t0) / 0.18)                               # spray in left-to-right
        xs = np.linspace(0, 1, a2.shape[1])[None, :]
        wipe = np.clip((grow * 1.25 - xs) * 6, 0, 1)
        paint = np.array((232, 244, 255), np.float32)
        orange = np.array(ORANGE, np.float32)
        outline = np.clip(cv2.dilate(a2, np.ones((int(5 * s) | 1,) * 2, np.uint8)) - a2, 0, 1)
        k = e * wipe
        out = roi * (1 - (a2 * 0.93 * k)[..., None]) + paint * L * (a2 * 0.93 * k)[..., None]
        out = out * (1 - (outline * 0.8 * k)[..., None]) + orange * L * (outline * 0.8 * k)[..., None]
        out = out * (1 - (halo * k)[..., None]) + paint * L * 0.55 * (halo * k)[..., None]
        canvas[ya:yb, xa:xb] = np.clip(out, 0, 255).astype(np.uint8)


class ReactorEtch(Overlay):
    """Stacked MeteorSmall etched dark into the bright arc-reactor glass, lit at the rim."""

    def __init__(self, t0, t1, centre_src, width_src, angle=0.0):
        self.t0, self.t1 = t0, t1
        self.c, self.w, self.ang = centre_src, width_src, angle
        self.mask = mask_w("stack", 700)

    def draw(self, canvas, ctx):
        t, s = ctx.T, ctx.scale
        e = env_ar(t, self.t0, self.t1, 0.05, 0.06)
        if e <= 0.01:
            return
        w = self.w * SW
        h = w * self.mask.shape[0] / self.mask.shape[1]
        q = ctx.map_quad(rect_quad(self.c[0] * SW, self.c[1] * SH, w, h, self.ang))
        r = place_mask(self.mask, q, canvas.shape)
        if r is None:
            return
        a, x0, y0 = r
        flick = 1.0 if (t - self.t0) > 0.12 else (0.35 if int(t * 40) % 2 else 1.0)
        reveal = smooth((t - self.t0) / 0.14)
        ys = np.linspace(0, 1, a.shape[0])[:, None]
        a = a * (ys < reveal)
        a = cv2.GaussianBlur(a, (0, 0), 0.7 * s)
        blit(canvas, a, x0, y0, (40, 22, 10), "normal", 0.9 * e * flick)
        rim = np.clip(cv2.GaussianBlur(a, (0, 0), 2.2 * s) - a * 0.8, 0, 1)
        blit(canvas, rim, x0, y0, NEON, "add", 1.3 * e * flick)


class ReactorSlam(Overlay):
    """On the drop the arc reactor throws the logo: shock ring, light cone, stacked mark slams onto the chest."""

    def __init__(self, t0, t1, roi_src=(0.25, 0.3, 0.75, 0.85)):
        self.t0, self.t1, self.roi_src = t0, t1, roi_src
        self.mask = mask_w("stack", 700)

    def draw(self, canvas, ctx):
        t, (h, w) = ctx.T, canvas.shape[:2]
        s = ctx.scale
        e = env_ar(t, self.t0, self.t1, 0.02, 0.18)
        if e <= 0.01:
            return
        rx0, ry0, rx1, ry1 = self.roi_src
        pts = ctx.map([(rx0 * SW, ry0 * SH), (rx1 * SW, ry1 * SH)])
        roi = (min(pts[:, 0]), min(pts[:, 1]), max(pts[:, 0]), max(pts[:, 1]))
        sub = canvas[int(roi[1]):int(roi[3]), int(roi[0]):int(roi[2])]
        if sub.size == 0:
            return
        lum = sub.min(axis=2)
        m = (lum > 235).astype(np.uint8) * 255
        n, lab, st, ce = cv2.connectedComponentsWithStats(m, 8)
        if n < 2:
            return
        i = 1 + int(np.argmax(st[1:, 4]))
        rcx, rcy = ce[i][0] + roi[0], ce[i][1] + roi[1]
        age = t - self.t0
        # shock ring
        rad = (0.05 + 0.9 * smooth(age / 0.45)) * w
        ring = np.zeros((int(rad * 2 + 30), int(rad * 2 + 30)), np.float32)
        cv2.circle(ring, (ring.shape[1] // 2, ring.shape[0] // 2), int(rad), 1.0, max(2, int(5 * s)), cv2.LINE_AA)
        ring = cv2.GaussianBlur(ring, (0, 0), 2.0 * s)
        blit(canvas, ring, int(rcx - ring.shape[1] / 2), int(rcy - ring.shape[0] / 2), NEON, "add", 1.4 * (1 - smooth(age / 0.5)) * e)
        # logo slams onto the chest below the reactor
        k = 1.0 + 0.45 * math.exp(-age / 0.07)
        lw = int(w * 0.72 * k)
        m2 = cv2.resize(self.mask, (lw, int(lw * self.mask.shape[0] / self.mask.shape[1])), interpolation=cv2.INTER_AREA)
        cy = min(rcy + h * 0.17, h * 0.84)
        x0, y0 = int(w / 2 - m2.shape[1] / 2), int(cy - m2.shape[0] / 2)
        # light cone from the reactor to the logo
        cone = np.zeros((h, w), np.float32)
        poly = np.array([[rcx - 8 * s, rcy], [rcx + 8 * s, rcy], [x0 + m2.shape[1], cy], [x0, cy]], np.int32)
        cv2.fillConvexPoly(cone, poly, 1.0)
        cone = cv2.GaussianBlur(cone, (0, 0), 14 * s)
        blit(canvas, cone, 0, 0, NEON, "add", 0.16 * e)
        flick = 0.9 + 0.1 * math.sin(t * 61)
        neon(canvas, m2, x0, y0, NEON, k=e * flick, sig=(3, 10, 26), gains=(0.9, 0.7, 0.5), scale=s)


class NightComet(Overlay):
    """The distant reactor flare becomes the head of a MeteorSmall comet; the wordmark lights up beneath it."""

    def __init__(self, t0, t1):
        self.t0, self.t1 = t0, t1

    def draw(self, canvas, ctx):
        t, (h, w) = ctx.T, canvas.shape[:2]
        s = ctx.scale
        e = env_ar(t, self.t0, self.t1, 0.05, 0.08)
        if e <= 0.01:
            return
        lum = canvas.min(axis=2)
        m = (lum > 240).astype(np.uint8) * 255
        n, lab, st, ce = cv2.connectedComponentsWithStats(m, 8)
        if n < 2:
            return
        i = 1 + int(np.argmax(st[1:, 4]))
        cx, cy = ce[i]
        d = max(st[i][2], st[i][3])
        blit_comet(canvas, cx, cy, int(max(d * 4.4, w * 0.45)), e, True, s)
        reveal = smooth((t - self.t0) / 0.2)
        wm = mask_w("wordmark", int(w * 0.80))
        xs_ = np.linspace(0, 1, wm.shape[1])
        wm = wm * (xs_ < reveal)[None, :]
        wy = int(min(h * 0.80, cy + d * 0.7 + h * 0.12))
        neon(canvas, wm, int(w / 2 - wm.shape[1] / 2), wy, HOT, k=e, sig=(3, 10, 26), gains=(0.8, 0.6, 0.5), scale=s * 0.8)


class HudLock(Overlay):
    """Iron Man's targeting HUD locks onto the helmet and names the target."""

    def __init__(self, t0, t1, roi_src=(0.1, 0.1, 0.9, 0.5)):
        self.t0, self.t1, self.roi_src = t0, t1, roi_src

    def draw(self, canvas, ctx):
        t, (h, w) = ctx.T, canvas.shape[:2]
        s = ctx.scale
        e = env_ar(t, self.t0, self.t1, 0.05, 0.1)
        if e <= 0.01:
            return
        rx0, ry0, rx1, ry1 = self.roi_src
        pts = ctx.map([(rx0 * SW, ry0 * SH), (rx1 * SW, ry1 * SH)])
        roi = (min(pts[:, 0]), min(pts[:, 1]), max(pts[:, 0]), max(pts[:, 1]))
        # centre on the gold helmet (robust when only one eye is visible)
        x0, y0, x1, y1 = [int(v) for v in roi]
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
        if x1 - x0 < 8 or y1 - y0 < 8:
            return
        hsv = cv2.cvtColor(canvas[y0:y1, x0:x1], cv2.COLOR_BGR2HSV)
        gold = ((hsv[..., 0] >= 10) & (hsv[..., 0] <= 32) & (hsv[..., 1] > 90) & (hsv[..., 2] > 110)).astype(np.uint8) * 255
        gold = cv2.morphologyEx(gold, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        n, lab, st, ce = cv2.connectedComponentsWithStats(gold, 8)
        if n < 2:
            return
        i = 1 + int(np.argmax(st[1:, 4]))
        if st[i][4] < 400 * s * s:
            return
        cx = ce[i][0] + x0
        cy = ce[i][1] + y0 + 0.02 * h
        age = t - self.t0
        half = w * (0.20 + 0.25 * math.exp(-age / 0.09))          # brackets snap in from wide
        col = tuple(int(c * e) for c in NEON)
        th = max(1, int(3 * s))
        arm = half * 0.38
        for sx in (-1, 1):
            for sy in (-1, 1):
                px, py = cx + sx * half, cy + sy * half * 1.15
                cv2.line(canvas, (int(px), int(py)), (int(px - sx * arm), int(py)), col, th, cv2.LINE_AA)
                cv2.line(canvas, (int(px), int(py)), (int(px), int(py - sy * arm * 1.1)), col, th, cv2.LINE_AA)
        # rotating ring
        for k in range(4):
            a0 = (age * 220 + k * 90) % 360
            cv2.ellipse(canvas, (int(cx), int(cy)), (int(half * 0.62),) * 2, 0, a0, a0 + 38, col, th, cv2.LINE_AA)
        cv2.drawMarker(canvas, (int(cx), int(cy)), col, cv2.MARKER_CROSS, int(26 * s), th, cv2.LINE_AA)
        lab = txt("TARGET // METEORSMALL", "rajdhani-700.ttf", 40, 0.18)
        lw = int(half * 1.9)
        lab = cv2.resize(lab, (lw, max(2, int(lab.shape[0] * lw / lab.shape[1]))), interpolation=cv2.INTER_AREA)
        blit(canvas, lab, int(cx - lw / 2), int(cy + half * 1.15 + 18 * s), NEON, "add", 0.95 * e)
        lock = txt("LOCK 100%", "rajdhani-500.ttf", 30, 0.2)
        lk = cv2.resize(lock, (int(lw * 0.36), max(2, int(lock.shape[0] * lw * 0.36 / lock.shape[1]))), interpolation=cv2.INTER_AREA)
        blit(canvas, lk, int(cx - lw / 2), int(cy - half * 1.15 - 10 * s - lk.shape[0]), NEON, "add", 0.8 * e)


class EndCard(Overlay):
    """The sky goes dark, a meteor streaks in from the corner and lands as the final lock-up."""

    def __init__(self, t_dark, t_hit, t1):
        self.t0, self.t_hit, self.t1 = t_dark, t_hit, t1
        self.mask = mask_w("stack", 760)

    def draw(self, canvas, ctx):
        t, (h, w) = ctx.T, canvas.shape[:2]
        s = ctx.scale
        if t < self.t0:
            return
        dark = 1.0 - 0.86 * smooth((t - self.t0) / 0.42)
        canvas[...] = (canvas.astype(np.float32) * dark).astype(np.uint8)
        # meteor streak into the landing point
        land = np.array([w * 0.5, h * 0.40])
        if t < self.t_hit:
            u = smooth((t - self.t0) / (self.t_hit - self.t0))
            start = np.array([-w * 0.12, -h * 0.10])
            head = start + (land - start) * u
            blit_comet(canvas, head[0], head[1], int(w * 0.50), 1.0, True, s)
            return
        age = t - self.t_hit
        k = 1.0 + 0.35 * math.exp(-age / 0.06)
        lw = int(w * 0.70 * k)
        m = cv2.resize(self.mask, (lw, int(lw * self.mask.shape[0] / self.mask.shape[1])), interpolation=cv2.INTER_AREA)
        flick = 0.92 + 0.08 * math.sin(t * 55)
        cy = int(h * 0.52)
        neon(canvas, m, int(w / 2 - m.shape[1] / 2), int(cy - m.shape[0] / 2), HOT, k=flick, sig=(3, 10, 28), gains=(0.9, 0.7, 0.5), scale=s)
        # comet icon above the lock-up
        blit_comet(canvas, w * 0.5 + w * 0.12, h * 0.34, int(w * 0.30), 1.0 * smooth(age / 0.1), True, s)
        # ring shock on impact
        rad = (0.04 + 0.7 * smooth(age / 0.4)) * w
        ring = np.zeros((int(rad * 2 + 30), int(rad * 2 + 30)), np.float32)
        cv2.circle(ring, (ring.shape[1] // 2, ring.shape[0] // 2), int(rad), 1.0, max(2, int(4 * s)), cv2.LINE_AA)
        ring = cv2.GaussianBlur(ring, (0, 0), 2.0 * s)
        blit(canvas, ring, int(w / 2 - ring.shape[1] / 2), int(cy - ring.shape[0] / 2), NEON, "add", 1.1 * (1 - smooth(age / 0.45)))



class MeteorFlyby(Overlay):
    """A MeteorSmall comet streaks across the frame on a whip beat (the brand as a shooting star)."""

    def __init__(self, t0, dur, p0, p1, size=0.5):
        self.t0, self.t1 = t0, t0 + dur
        self.p0, self.p1, self.size = np.array(p0, np.float32), np.array(p1, np.float32), size

    def draw(self, canvas, ctx):
        t, (h, w) = ctx.T, canvas.shape[:2]
        if not (self.t0 <= t <= self.t1):
            return
        u = (t - self.t0) / (self.t1 - self.t0)
        pos = self.p0 + (self.p1 - self.p0) * (u * u * (3 - 2 * u))
        k = math.sin(math.pi * min(max(u, 0), 1)) ** 0.6
        blit_comet(canvas, pos[0] * w, pos[1] * h, int(w * self.size), k, True, ctx.scale)


class RingText(Overlay):
    """'METEORSMALL' orbits the arc reactor like a HUD ring."""

    def __init__(self, t0, t1, roi_src=(0.25, 0.3, 0.75, 0.85), radius=0.26):
        self.t0, self.t1, self.roi_src, self.radius = t0, t1, roi_src, radius
        line = txt("METEORSMALL  +  METEORSMALL  +  METEORSMALL  +  ", "orbitron-700.ttf", 80, 0.18)
        self.line = line

    def draw(self, canvas, ctx):
        t, (h, w) = ctx.T, canvas.shape[:2]
        s = ctx.scale
        e = env_ar(t, self.t0, self.t1, 0.08, 0.12)
        if e <= 0.01:
            return
        rx0, ry0, rx1, ry1 = self.roi_src
        pts = ctx.map([(rx0 * SW, ry0 * SH), (rx1 * SW, ry1 * SH)])
        x0, y0 = int(max(0, min(pts[:, 0]))), int(max(0, min(pts[:, 1])))
        x1, y1 = int(min(w, max(pts[:, 0]))), int(min(h, max(pts[:, 1])))
        sub = canvas[y0:y1, x0:x1]
        if sub.size == 0:
            return
        m = (sub.min(axis=2) > 232).astype(np.uint8) * 255
        n, lab, st, ce = cv2.connectedComponentsWithStats(m, 8)
        if n < 2:
            return
        i = 1 + int(np.argmax(st[1:, 4]))
        cx, cy = ce[i][0] + x0, ce[i][1] + y0
        R = int(w * self.radius * (0.8 + 0.2 * smooth((t - self.t0) / 0.25)))
        band = max(10, int(R * 0.16))
        rows = 720
        polar = np.zeros((rows, R + band + 4), np.float32)
        ln = cv2.resize(self.line, (rows, band), interpolation=cv2.INTER_AREA)   # text runs along the angle axis
        ln = np.roll(ln, int((t - self.t0) * 140), axis=1)
        polar[:, R:R + band] = ln.T[:, ::-1]
        ring = cv2.warpPolar(polar, (2 * (R + band + 4), 2 * (R + band + 4)), (R + band + 4, R + band + 4), R + band + 4,
                             cv2.WARP_INVERSE_MAP | cv2.WARP_POLAR_LINEAR | cv2.INTER_LINEAR)
        ring = np.clip(np.nan_to_num(ring, nan=0.0, posinf=0.0, neginf=0.0), 0, 1)
        ox, oy = int(cx - ring.shape[1] / 2), int(cy - ring.shape[0] / 2)
        neon(canvas, ring, ox, oy, NEON, k=e, sig=(2, 7, 18), gains=(0.8, 0.5, 0.35), scale=s * 0.8)
        # thin guide circles
        col = tuple(int(c * e * 0.8) for c in NEON)
        cv2.circle(canvas, (int(cx), int(cy)), R - int(4 * s), col, max(1, int(2 * s)), cv2.LINE_AA)
        cv2.circle(canvas, (int(cx), int(cy)), R + band + int(4 * s), col, max(1, int(2 * s)), cv2.LINE_AA)


def build_overlays(scale):
    src = Source(os.path.join(WORK, "src.raw"))
    ov = []
    ov.append(BootText(bt(0)))
    ov.append(TypedTag(bt(8), bt(65)))

    # --- the arc reactor wears the mark (intro + the build into the drop)
    ov.append(ReactorEtch(bt(0) + 0.0, bt(1) - 0.03, centre_src=(0.36, 0.50), width_src=0.52, angle=-12))
    ov.append(ReactorEtch(bt(7), bt(8) - 0.03, centre_src=(0.33, 0.50), width_src=0.46, angle=-8))

    # --- Iron Man's eyes ignite into the mark
    ov.append(EyeFlare(bt(3) + 0.02, bt(4) - 0.04, roi_src=(0.0, 0.3, 0.9, 0.8), n_eyes=1))
    ov.append(EyeFlare(bt(32), bt(32.5), roi_src=(0.0, 0.2, 1.0, 0.9), n_eyes=2, plate=True))
    ov.append(EyeFlare(bt(42), bt(43) - 0.05, roi_src=(0.0, 0.3, 0.9, 0.8), n_eyes=1))
    ov.append(FaceCatch(bt(45), bt(48) - 0.02))

    # --- in the world: hologram billboard over the street, spray-paint mural on the wall, neon sign swap
    poly_street = [(0.10 * SW, 0.0), (0.95 * SW, 0.0), (0.95 * SW, 0.27 * SH), (0.10 * SW, 0.27 * SH)]
    trk_street = Tracker(src, 8.62, 8.60, 10.30, poly_street)
    quad_street = [(0.20 * SW, 0.075 * SH), (0.80 * SW, 0.075 * SH), (0.80 * SW, 0.075 * SH + 0.60 * SW * 0.0735), (0.20 * SW, 0.075 * SH + 0.60 * SW * 0.0735)]
    ov.append(TrackedSign(bt(12) + 0.04, bt(14) - 0.02, trk_street, quad_street, "wordmark", "holo"))
    ov.append(NeonSwap(bt(16), bt(18)))
    poly_wall = [(0.03 * SW, 0.30 * SH), (0.55 * SW, 0.30 * SH), (0.55 * SW, 0.75 * SH), (0.03 * SW, 0.75 * SH)]
    trk_wall = Tracker(src, 14.72, 14.70, 15.30, poly_wall)
    mw = 0.40 * SW
    quad_wall = [(0.07 * SW, 0.46 * SH), (0.07 * SW + mw, 0.46 * SH), (0.07 * SW + mw, 0.46 * SH + mw * 0.279), (0.07 * SW, 0.46 * SH + mw * 0.279)]
    ov.append(TrackedSign(bt(23) + 0.02, bt(24) - 0.02, trk_wall, quad_wall, "stack", "paint", att=0.05, rel=0.10))

    # --- HUD lock-on, reactor slam on the drop, the night-sky comet, and the end card
    ov.append(HudLock(bt(30), bt(32) - 0.03))
    ov.append(ReactorSlam(bt(48), bt(49) + 0.25))
    ov.append(NightComet(bt(58) + 0.02, bt(59) - 0.03))
    # --- brand-as-shooting-star on whip beats, and the orbiting ring on the second hero beat
    ov.append(MeteorFlyby(bt(9) - 0.05, 0.36, (-0.15, 0.10), (1.15, 0.80), 0.50))
    ov.append(MeteorFlyby(bt(29) - 0.05, 0.36, (1.15, 0.05), (-0.15, 0.85), 0.46))
    ov.append(MeteorFlyby(bt(54) - 0.05, 0.36, (-0.15, 0.30), (1.15, 0.95), 0.50))
    ov.append(MeteorFlyby(bt(61) - 0.05, 0.36, (1.15, 0.15), (-0.15, 0.70), 0.46))
    ov.append(RingText(bt(50), bt(51) + 0.22))
    ov.append(EndCard(bt(65) + 0.12, bt(66), cutlist.TOTAL))
    return ov
