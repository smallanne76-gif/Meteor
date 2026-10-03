"""Generate the MeteorSmall placeholder mark (icon + wordmark + lockup).

No official logo file was supplied, so this builds a comet icon and an
Orbitron-based wordmark. Every placement in the edit reads these PNGs as
alpha masks and tints them, so swapping in the real logo is just replacing
assets/logo/*.png (white shape on transparent background).
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "assets", "fonts")
OUT = os.path.join(ROOT, "assets", "logo")


def comet_icon(size=512):
    """Falling meteor: bright head bottom-right, tapered tail to the upper-left."""
    s = size
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    head = np.array([0.66 * s, 0.66 * s], np.float32)
    ang = np.deg2rad(225.0)  # tail direction (toward upper-left)
    d = np.array([np.cos(ang), np.sin(ang)], np.float32)
    n = np.array([-d[1], d[0]], np.float32)
    px, py = xx - head[0], yy - head[1]
    along = px * d[0] + py * d[1]
    perp = px * n[0] + py * n[1]
    r = 0.105 * s
    L = 0.78 * s
    alpha = np.zeros((s, s), np.float32)
    # main tail + two thinner side streaks
    for off, wscale, lscale, a in ((0.0, 1.0, 1.0, 1.0), (-0.115 * s, 0.34, 0.72, 0.85), (0.105 * s, 0.30, 0.6, 0.8)):
        t = np.clip(along / (L * lscale), 0, 1)
        w = r * wscale * (1 - t) ** 1.25 + 1e-3
        pp = perp - off * (1 - 0.5 * t)
        m = np.clip(1.0 - np.abs(pp) / w, 0, 1) ** 0.8
        m *= (along > 0) * (1 - t) ** 0.55
        alpha = np.maximum(alpha, m * a)
    # head
    dist = np.sqrt(px * px + py * py)
    alpha = np.maximum(alpha, np.clip((r - dist) / 3.0 + 0.5, 0, 1))
    # hot-core ring cut-out for a "lens" look
    ring = np.clip(1 - np.abs(dist - r * 1.45) / 2.2, 0, 1) * 0.9
    alpha = np.maximum(alpha, ring)
    return np.clip(alpha, 0, 1)


def text_mask(text, font_path, px, tracking=0.0):
    font = ImageFont.truetype(font_path, px)
    # measure with tracking
    widths = [font.getlength(ch) for ch in text]
    track = tracking * px
    W = int(sum(widths) + track * (len(text) - 1) + px * 0.6)
    H = int(px * 1.5)
    im = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(im)
    x = px * 0.3
    for ch, w in zip(text, widths):
        d.text((x, px * 0.15), ch, font=font, fill=255)
        x += w + track
    a = np.asarray(im, np.float32) / 255.0
    ys, xs = np.where(a > 0.02)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def pad_to(a, h):
    if a.shape[0] >= h:
        return a
    top = (h - a.shape[0]) // 2
    out = np.zeros((h, a.shape[1]), np.float32)
    out[top:top + a.shape[0]] = a
    return out


def save(a, name):
    rgba = np.zeros(a.shape + (4,), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (np.clip(a, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(os.path.join(OUT, name))


def main():
    os.makedirs(OUT, exist_ok=True)
    icon = comet_icon(512)
    ys, xs = np.where(icon > 0.03)
    icon = icon[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    save(icon, "icon.png")
    # heat map: white-hot head fading to orange tail (head sits at ~(0.66,0.66) of the uncropped canvas)
    full = comet_icon(512)
    ys0, xs0 = np.where(full > 0.03)
    hy, hx = 0.66 * 512 - ys0.min(), 0.66 * 512 - xs0.min()
    yy, xx = np.mgrid[0:icon.shape[0], 0:icon.shape[1]].astype(np.float32)
    heat = np.clip(1.0 - np.sqrt((xx - hx) ** 2 + (yy - hy) ** 2) / (0.30 * icon.shape[0]), 0, 1) ** 1.2
    save(heat, "icon_heat.png")

    # wordmark: METEOR (heavy) + SMALL (light), single line
    meteor = text_mask("METEOR", os.path.join(FONTS, "orbitron-900.ttf"), 220, 0.06)
    small = text_mask("SMALL", os.path.join(FONTS, "orbitron-500.ttf"), 220, 0.14)
    h = max(meteor.shape[0], small.shape[0])
    gap = np.zeros((h, int(h * 0.24)), np.float32)
    word = np.hstack([pad_to(meteor, h), gap, pad_to(small, h)])
    save(word, "wordmark.png")

    # lockup: icon left of wordmark, icon height = 1.9x cap height
    ih = int(h * 1.9)
    icon_img = Image.fromarray((icon * 255).astype(np.uint8)).resize((int(ih * icon.shape[1] / icon.shape[0]), ih), Image.LANCZOS)
    icon_r = np.asarray(icon_img, np.float32) / 255.0
    H = ih
    word_p = np.zeros((H, word.shape[1]), np.float32)
    top = (H - h) // 2
    word_p[top:top + h] = word
    sep = np.zeros((H, int(H * 0.12)), np.float32)
    lock = np.hstack([icon_r, sep, word_p])
    save(lock, "lockup.png")
    # stacked variant for portrait placements: METEOR over a tracked-out SMALL of equal width
    m2 = text_mask("METEOR", os.path.join(FONTS, "orbitron-900.ttf"), 220, 0.06)
    W = m2.shape[1]
    f_small = os.path.join(FONTS, "orbitron-500.ttf")
    lo, hi = 0.0, 1.2
    for _ in range(18):  # binary-search the tracking so SMALL spans exactly the width of METEOR
        mid = (lo + hi) / 2
        w = text_mask("SMALL", f_small, 150, mid).shape[1]
        lo, hi = (mid, hi) if w < W else (lo, mid)
    s2 = text_mask("SMALL", f_small, 150, (lo + hi) / 2)
    s2 = np.asarray(Image.fromarray((s2 * 255).astype(np.uint8)).resize((W, int(s2.shape[0] * W / s2.shape[1])), Image.LANCZOS), np.float32) / 255.0
    vgap = np.zeros((int(m2.shape[0] * 0.28), W), np.float32)
    stack = np.vstack([m2, vgap, s2])
    save(stack, "stack.png")
    print("icon", icon.shape, "wordmark", word.shape, "lockup", lock.shape, "stack", stack.shape)

    # preview on dark bg
    prev = np.zeros((lock.shape[0] + 160, lock.shape[1] + 160, 3), np.float32)
    prev[...] = (0.05, 0.05, 0.07)
    col = np.array([0.2, 0.55, 1.0], np.float32)  # BGR-ish tint preview (orange)
    y0, x0 = 80, 80
    prev[y0:y0 + lock.shape[0], x0:x0 + lock.shape[1]] += lock[..., None] * col
    Image.fromarray((np.clip(prev, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, "preview.png"))


if __name__ == "__main__":
    main()
