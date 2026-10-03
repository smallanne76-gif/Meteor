"""Beat-synced render engine for the MeteorSmall Iron Man remake.

The edit is a list of `Cut`s on a beat grid. Each output frame is composed as:
    source frame -> affine (flip / zoom / roll / pan / shake) with a soft
    blurred edge-extension so shots can sit *wider* than the original crop
    -> brand overlays (anchored in source space, so they follow the shot)
    -> transitions (whip, card flip, spin, glitch, flash, invert)
    -> global grade (beat pulse, bloom, vignette, grain, sharpen).
"""
import bisect
import json
import math
import os
from dataclasses import dataclass, field

import cv2
import numpy as np

SW, SH = 808, 1292            # source (recording) size
W0, H0 = 1080, 1728           # master output size (same 5:8 aspect as the recording)
FPS = 30
SRC_FPS = 30.030825546671803  # measured fps of the recording

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


# --------------------------------------------------------------------------- source
class Source:
    def __init__(self, path, n=1247):
        self.n = n
        self.mm = np.memmap(path, dtype=np.uint8, mode="r", shape=(n, SH, SW, 3))

    def idx(self, t):
        return float(np.clip(t * SRC_FPS, 0, self.n - 1.001))

    def frame(self, t):
        x = self.idx(t)
        i = int(x)
        f = x - i
        a = np.asarray(self.mm[i])
        if f < 0.06:
            return a
        b = np.asarray(self.mm[i + 1])
        return cv2.addWeighted(a, 1 - f, b, f, 0)


# --------------------------------------------------------------------------- data model
@dataclass
class Cut:
    t0: float                     # output start (s)
    dur: float                    # output duration (s)
    s0: float                     # source time at start (s)
    s1: float                     # source time at end (s); s1 < s0 plays in reverse
    tag: str = ""                 # shot name (shown in the Resolve export)
    ramp: str = "lin"             # lin | in (slow->fast) | out (fast->slow) | inout
    z0: float = 1.0               # zoom multiplier relative to "fit" (1.0 = full recording frame)
    z1: float = 1.0
    flip: str = ""                # '' | h | v | hv
    rot0: float = 0.0             # roll in degrees
    rot1: float = 0.0
    pan0: tuple = (0.0, 0.0)      # fraction of canvas size
    pan1: tuple = (0.0, 0.0)
    shake: float = 0.0            # px (at 1080 wide) of decaying shake at the cut
    punch: float = 0.0            # extra zoom (fraction) that decays after the cut
    tr: list = field(default_factory=list)   # transitions: (kind, pre_frames, post_frames, strength)
    exposure: float = 1.0
    sat: float = 1.0
    note: str = ""

    @property
    def t1(self):
        return self.t0 + self.dur


def ease(u, kind):
    u = min(max(u, 0.0), 1.0)
    if kind == "in":
        return u * u
    if kind == "out":
        return 1 - (1 - u) * (1 - u)
    if kind == "inout":
        return u * u * (3 - 2 * u)
    return u


class Ctx:
    """Per-frame information handed to overlays."""

    def __init__(self, T, u, cut, M, flipped, src, scale, cw, ch, src_t, frame_no):
        self.T, self.u, self.cut, self.M = T, u, cut, M
        self.flipped, self.src, self.scale = flipped, src, scale
        self.cw, self.ch, self.src_t, self.frame_no = cw, ch, src_t, frame_no

    def map(self, pts):
        p = np.asarray(pts, np.float32).reshape(-1, 2)
        ones = np.ones((len(p), 1), np.float32)
        q = (self.M @ np.hstack([p, ones]).T).T
        return q[:, :2]

    def map_quad(self, quad):
        """Map a TL,TR,BR,BL source quad to the canvas, keeping text unmirrored on flipped cuts."""
        q = self.map(quad)
        if self.flipped:  # an odd number of mirror flips -> swap so text still reads correctly
            q = q[[1, 0, 3, 2]]
        return q


# --------------------------------------------------------------------------- helpers
def _affine(cut, u, scale, rng):
    cw, ch = int(round(W0 * scale)), int(round(H0 * scale))
    fit = cw / SW
    z = cut.z0 + (cut.z1 - cut.z0) * ease(u, "inout")
    if cut.punch:
        z *= 1.0 + cut.punch * math.exp(-u * cut.dur / 0.11)
    rot = cut.rot0 + (cut.rot1 - cut.rot0) * ease(u, "inout")
    px = (cut.pan0[0] + (cut.pan1[0] - cut.pan0[0]) * ease(u, "inout")) * cw
    py = (cut.pan0[1] + (cut.pan1[1] - cut.pan0[1]) * ease(u, "inout")) * ch
    if cut.shake:
        decay = math.exp(-u * cut.dur / 0.14) * cut.shake * scale
        px += rng.uniform(-1, 1) * decay
        py += rng.uniform(-1, 1) * decay
        rot += rng.uniform(-1, 1) * decay * 0.02
    fx = -1.0 if "h" in cut.flip else 1.0
    fy = -1.0 if "v" in cut.flip else 1.0
    a = math.radians(rot)
    c, s = math.cos(a), math.sin(a)
    S = np.array([[fit * z * fx, 0, 0], [0, fit * z * fy, 0], [0, 0, 1]], np.float64)
    R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], np.float64)
    T1 = np.array([[1, 0, -SW / 2], [0, 1, -SH / 2], [0, 0, 1]], np.float64)
    T2 = np.array([[1, 0, cw / 2 + px], [0, 1, ch / 2 + py], [0, 0, 1]], np.float64)
    M = T2 @ R @ S @ T1
    return M, (fx * fy) < 0, cw, ch


def _warp_with_extension(src, M, cw, ch, need_ext):
    out = cv2.warpAffine(src, M[:2], (cw, ch), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT_101)
    if not need_ext:
        return out
    ones = np.full((SH, SW), 255, np.uint8)
    cov = cv2.warpAffine(ones, M[:2], (cw, ch), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    if cov.min() > 250:
        return out
    # mirrored content beyond the frame edge, heavily blurred -> a soft, same-colour fill
    small = cv2.resize(out, (cw // 8, ch // 8), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), 3.0)
    ext = cv2.resize(small, (cw, ch), interpolation=cv2.INTER_CUBIC)
    ext = (ext.astype(np.float32) * 0.86)
    # fade the sharp image into the fill over a band just inside its edge (no hard "picture frame")
    dist = cv2.distanceTransform((cov > 127).astype(np.uint8), cv2.DIST_L2, 3)
    feather = max(6.0, 0.05 * cw)
    a = np.clip(dist / feather, 0, 1)
    a = (a * a * (3 - 2 * a))[..., None]
    return (out.astype(np.float32) * a + ext * (1 - a)).astype(np.uint8)


def radial_blur(img, strength, center=(0.5, 0.5), n=9):
    if strength <= 0.01:
        return img
    h, w = img.shape[:2]
    cx, cy = center[0] * w, center[1] * h
    acc = np.zeros(img.shape, np.float32)
    for k in range(n):
        s = 1.0 + strength * 0.16 * k / (n - 1)
        Mx = cv2.getRotationMatrix2D((cx, cy), 0, s)
        acc += cv2.warpAffine(img, Mx, (w, h), borderMode=cv2.BORDER_REFLECT)
    return (acc / n).astype(np.uint8)


def card_flip(img, sx, vertical=False, side=1):
    """Fake 3D card flip: squeeze about the centre axis with a little perspective."""
    h, w = img.shape[:2]
    bg = cv2.resize(cv2.GaussianBlur(cv2.resize(img, (w // 8, h // 8)), (0, 0), 3), (w, h)).astype(np.float32) * 0.18
    bg = bg.astype(np.uint8)
    sx = max(sx, 0.004)
    if not vertical:
        cx, half = w / 2, w / 2 * sx
        near = 0.0
        far = 0.10 * (1 - sx)
        l, r = (far, near) if side > 0 else (near, far)
        dst = np.float32([[cx - half, h * l], [cx + half, h * r], [cx + half, h * (1 - r)], [cx - half, h * (1 - l)]])
    else:
        cy, half = h / 2, h / 2 * sx
        far = 0.10 * (1 - sx)
        dst = np.float32([[w * far, cy - half], [w * (1 - far), cy - half], [w, cy + half], [0, cy + half]])
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    Hm = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(img, Hm, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    m = cv2.warpPerspective(np.full((h, w), 255, np.uint8), Hm, (w, h), flags=cv2.INTER_LINEAR)
    m = (m.astype(np.float32) / 255.0)[..., None]
    shade = 0.55 + 0.45 * sx  # darken as the card turns edge-on
    return (warped.astype(np.float32) * shade * m + bg.astype(np.float32) * (1 - m)).astype(np.uint8)


def glitch(img, rng, amount, bands=7):
    h, w = img.shape[:2]
    out = img.copy()
    for _ in range(bands):
        y = rng.integers(0, h - 4)
        bh = int(rng.integers(max(2, h // 90), max(4, h // 14)))
        dx = int(rng.integers(-w // 9, w // 9) * amount)
        out[y:y + bh] = np.roll(img[y:y + bh], dx, axis=1)
    sh = max(1, int(w * 0.012 * amount))
    out[..., 2] = np.roll(out[..., 2], sh, axis=1)
    out[..., 0] = np.roll(out[..., 0], -sh, axis=1)
    return out


def chroma(img, px):
    if px < 0.5:
        return img
    px = int(round(px))
    out = img.copy()
    out[..., 2] = np.roll(img[..., 2], px, axis=1)
    out[..., 0] = np.roll(img[..., 0], -px, axis=1)
    return out


def bloom(img, amount=0.18, thresh=185):
    h, w = img.shape[:2]
    sm = cv2.resize(img, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
    lum = sm.max(axis=2)
    mask = np.clip((lum.astype(np.float32) - thresh) / (255 - thresh), 0, 1)[..., None]
    glow = sm.astype(np.float32) * mask
    glow = cv2.GaussianBlur(glow, (0, 0), 7) + 0.6 * cv2.GaussianBlur(glow, (0, 0), 18)
    glow = cv2.resize(glow, (w, h), interpolation=cv2.INTER_CUBIC)
    return np.clip(img.astype(np.float32) + glow * amount * 2.2, 0, 255).astype(np.uint8)


def sharpen(img, amount=0.55, sigma=1.3):
    blur = cv2.GaussianBlur(img, (0, 0), sigma)
    return cv2.addWeighted(img, 1 + amount, blur, -amount, 0)


_VIG = {}


def vignette(img, strength=0.32):
    h, w = img.shape[:2]
    key = (h, w, strength)
    if key not in _VIG:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / 1.35
        _VIG[key] = (1 - strength * np.clip(d, 0, 1) ** 2.2)[..., None]
    return np.clip(img.astype(np.float32) * _VIG[key], 0, 255).astype(np.uint8)


_LUT = None


def grade_lut():
    global _LUT
    if _LUT is None:
        x = np.arange(256, dtype=np.float32) / 255.0
        s = x * x * (3 - 2 * x)
        y = x + 0.28 * (s - x)          # gentle S-curve for punchier contrast
        y = np.clip(y * 1.02, 0, 1)
        _LUT = (y * 255).astype(np.uint8)
    return _LUT


# --------------------------------------------------------------------------- renderer
class Renderer:
    def __init__(self, source, cuts, overlays=None, beat_period=0.6124, beat_phase=0.552,
                 scale=1.0, total=41.536, pulse=0.10, grain=0.014, seed=7):
        self.src = source
        self.cuts = sorted(cuts, key=lambda c: c.t0)
        self.starts = [c.t0 for c in self.cuts]
        self.overlays = overlays or []
        self.P, self.ph = beat_period, beat_phase
        self.scale = scale
        self.total = total
        self.pulse = pulse
        self.grain = grain
        self.seed = seed

    # -- lookup
    def cut_at(self, T):
        i = bisect.bisect_right(self.starts, T + 1e-6) - 1
        return max(i, 0)

    def src_time(self, cut, u):
        return cut.s0 + (cut.s1 - cut.s0) * ease(u, cut.ramp)

    # -- main entry
    def render(self, frame_no):
        T = (frame_no + 0.5) / FPS    # centre of the frame's display interval
        rng = np.random.default_rng(self.seed * 100003 + frame_no)
        cw, ch = int(round(W0 * self.scale)), int(round(H0 * self.scale))
        if not self.cuts or T < self.cuts[0].t0 - 1e-6:
            canvas = np.zeros((ch, cw, 3), np.uint8)
            u, cut, M, flipped, srcf, st = 0.0, None, None, False, None, 0.0
            ctx = Ctx(T, 0.0, None, np.eye(3)[:2], False, None, self.scale, cw, ch, 0.0, frame_no)
            self._draw_overlays(canvas, ctx, pre_cut=True)
            return self._finish(canvas, T, rng, None, None)
        ci = self.cut_at(T)
        cut = self.cuts[ci]
        nxt = self.cuts[ci + 1] if ci + 1 < len(self.cuts) else None
        u = max(0.0, (T - cut.t0) / cut.dur)
        st = self.src_time(cut, min(u, 1.0))
        srcf = self.src.frame(st)
        M, flipped, cw, ch = _affine(cut, u, self.scale, rng)
        zmin = min(cut.z0, cut.z1)
        need_ext = zmin < 0.999 or abs(cut.rot0) > 0.01 or abs(cut.rot1) > 0.01 or cut.shake > 0 or \
            max(abs(cut.pan0[0]), abs(cut.pan0[1]), abs(cut.pan1[0]), abs(cut.pan1[1])) > 0.002
        canvas = _warp_with_extension(srcf, M, cw, ch, need_ext)
        if cut.exposure != 1.0 or cut.sat != 1.0:
            canvas = self._expo_sat(canvas, cut.exposure, cut.sat)
        ctx = Ctx(T, u, cut, M[:2], flipped, srcf, self.scale, cw, ch, st, frame_no)
        self._draw_overlays(canvas, ctx)
        canvas = self._transitions(canvas, T, cut, nxt, rng)
        return self._finish(canvas, T, rng, cut, nxt)

    def _expo_sat(self, img, expo, sat):
        f = img.astype(np.float32) * expo
        if sat != 1.0:
            g = f.mean(axis=2, keepdims=True)
            f = g + (f - g) * sat
        return np.clip(f, 0, 255).astype(np.uint8)

    def _draw_overlays(self, canvas, ctx, pre_cut=False):
        for ov in self.overlays:
            if ov.t0 - 1e-6 <= ctx.T < ov.t1 + 1e-6:
                ov.draw(canvas, ctx)

    # -- transitions
    def _transitions(self, img, T, cut, nxt, rng):
        fr = 1.0 / FPS
        for kind, pre, post, k in cut.tr:  # post effects (incoming transition of this cut)
            dt = (T - cut.t0) / fr
            if dt < post - 1e-6 and post > 0:
                img = self._apply_tr(img, kind, 1.0 - dt / post, "post", k, rng)
        if nxt is not None:
            for kind, pre, post, k in nxt.tr:  # pre effects (build-up before the next cut)
                dt = (nxt.t0 - T) / fr
                if 0 < dt <= pre + 1e-6 and pre > 0:
                    img = self._apply_tr(img, kind, 1.0 - (dt - 1) / pre, "pre", k, rng)
        return img

    def _apply_tr(self, img, kind, a, phase, k, rng):
        a = float(np.clip(a, 0, 1))
        if kind == "flash":
            f = (a ** 1.7) * k
            return np.clip(img.astype(np.float32) * (1 - f * 0.35) + 255 * f, 0, 255).astype(np.uint8)
        if kind == "whip":
            return radial_blur(chroma(img, 14 * a * k * self.scale), a * k)
        if kind == "flip":   # card flip about the vertical axis: pre closes the card, post opens the next one
            return card_flip(img, 1 - a, vertical=False, side=1 if phase == "pre" else -1)
        if kind == "vflip":
            return card_flip(img, 1 - a, vertical=True)
        if kind == "spin":
            h, w = img.shape[:2]
            ang = (a * 90.0 * k) * (1 if phase == "pre" else -1)
            Mx = cv2.getRotationMatrix2D((w / 2, h / 2), ang, 1.0 + 0.15 * a)
            return cv2.warpAffine(img, Mx, (w, h), borderMode=cv2.BORDER_REFLECT)
        if kind == "glitch":
            return glitch(chroma(img, 10 * a * self.scale), rng, a * k)
        if kind == "invert":
            return 255 - img if a > 0.55 else img
        if kind == "strobe":
            return np.clip(img.astype(np.float32) + 255 * 0.8 * k, 0, 255).astype(np.uint8) if int(a * 6) % 2 == 0 else img
        if kind == "dip":
            return (img.astype(np.float32) * (1 - a * k)).astype(np.uint8)
        return img

    # -- global finish
    def _finish(self, img, T, rng, cut, nxt):
        h, w = img.shape[:2]
        # beat pulse (exposure bump on every beat)
        rel = (T - self.ph) / self.P
        dt = (rel - math.floor(rel)) * self.P if rel >= 0 else 1.0
        if rel >= -0.02:
            g = 1.0 + self.pulse * math.exp(-dt / 0.075)
        else:
            g = 1.0
        img = cv2.LUT(img, grade_lut())
        if g > 1.003:
            img = np.clip(img.astype(np.float32) * g, 0, 255).astype(np.uint8)
        img = bloom(img, 0.16)
        img = sharpen(img, 0.45, 1.2 * max(self.scale, 0.5))
        img = vignette(img, 0.30)
        if self.grain:
            n = rng.normal(0, self.grain * 255, (h // 2, w // 2, 1)).astype(np.float32)
            n = cv2.resize(n, (w, h), interpolation=cv2.INTER_LINEAR)[..., None] if n.ndim == 2 else cv2.resize(n[..., 0], (w, h))[..., None]
            img = np.clip(img.astype(np.float32) + n, 0, 255).astype(np.uint8)
        # global fades
        fade = 1.0
        if T > self.total - 0.35:
            fade = max(0.0, (self.total - T) / 0.35)
        if fade < 1.0:
            img = (img.astype(np.float32) * fade).astype(np.uint8)
        return img
