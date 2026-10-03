#!/usr/bin/env python3
"""
Procedural PBR texture baker for LEAVE THE LIGHT ON.

Every texture in the game is generated here from noise - there are no downloaded or scanned assets.
Output (assets/tex/):
    <name>_c.jpg    albedo (sRGB)
    <name>_n.jpg    tangent-space normal (OpenGL / +Y up, as three.js expects)
    <name>_o.jpg    ORM-ish: R = ambient occlusion, G = roughness, B = 0 (non-metal) / metalness
    cards: <name>.png (RGBA) for foliage / decals

Usage:  python3 tools/gen_textures.py [name ...]
"""
import sys, os, math, time
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'tex')
os.makedirs(OUT, exist_ok=True)
RNG = np.random.default_rng(1138)


# ----------------------------------------------------------------------------------------------------------------------
# tileable noise toolkit
# ----------------------------------------------------------------------------------------------------------------------
def tnoise(n, period, seed=None, order=3):
    """Tileable smooth noise in [0,1], n x n, with `period` lattice cells across."""
    r = np.random.default_rng(seed) if seed is not None else RNG
    g = r.random((period, period))
    z = n / period
    out = ndi.zoom(g, z, order=order, mode='grid-wrap', grid_mode=True)
    out = out[:n, :n]
    return np.clip(out, 0, 1)


def tnoise_aniso(n, px, py, seed=None):
    r = np.random.default_rng(seed) if seed is not None else RNG
    g = r.random((py, px))
    out = ndi.zoom(g, (n / py, n / px), order=3, mode='grid-wrap', grid_mode=True)
    return np.clip(out[:n, :n], 0, 1)


def fbm(n, base=4, octaves=5, gain=0.5, seed=None, lac=2):
    r = np.random.default_rng(seed) if seed is not None else RNG
    tot = np.zeros((n, n)); amp = 1.0; norm = 0.0; p = base
    for _ in range(octaves):
        tot += amp * tnoise(n, p, seed=int(r.integers(1 << 30)))
        norm += amp; amp *= gain; p *= lac
        if p > n: break
    t = tot / norm
    # contrast-normalise so fbm uses the full range
    t = (t - t.min()) / max(1e-6, t.max() - t.min())
    return t


def voronoi(n, cells, seed=None, wrap=True):
    """returns (F1 distance, F2-F1, cell id random) tileable."""
    r = np.random.default_rng(seed) if seed is not None else RNG
    pts = r.random((cells, cells, 2))
    ys, xs = np.mgrid[0:n, 0:n] / n * cells
    cy = np.floor(ys).astype(int); cx = np.floor(xs).astype(int)
    d1 = np.full((n, n), 9.0); d2 = np.full((n, n), 9.0); cid = np.zeros((n, n))
    ids = r.random((cells, cells))
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            ny = (cy + oy) % cells; nx = (cx + ox) % cells
            px = (cx + ox) + pts[ny, nx, 0]; py = (cy + oy) + pts[ny, nx, 1]
            d = np.hypot(xs - px, ys - py)
            closer = d < d1
            d2 = np.where(closer, d1, np.minimum(d2, d))
            cid = np.where(closer, ids[ny, nx], cid)
            d1 = np.where(closer, d, d1)
    return d1 / 1.0, (d2 - d1), cid


def warp(img, n, amt, base=3, seed=None):
    dx = (tnoise(n, base, seed) - .5) * 2 * amt
    dy = (tnoise(n, base, None if seed is None else seed + 7) - .5) * 2 * amt
    ys, xs = np.mgrid[0:n, 0:n].astype(float)
    return ndi.map_coordinates(img, [(ys + dy) % n, (xs + dx) % n], order=1, mode='grid-wrap')


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def grad_normal(h, strength=2.0):
    """height (0..1) -> normal map RGB uint8, tileable."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx = -dx * strength * h.shape[0] / 64
    ny = dy * strength * h.shape[0] / 64   # +Y up (flip because image y grows downward)
    nz = np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5
    return (n * 255).astype(np.uint8)


def ao_from_height(h, k=1.0):
    blur = ndi.gaussian_filter(h, 3, mode='wrap')
    ao = np.clip(1.0 - np.clip(blur - h, 0, 1) * 4.0 * k, 0, 1)
    return ao


def hexcol(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def mix3(a, b, t):
    return a[None, None, :] * (1 - t[..., None]) + b[None, None, :] * t[..., None]


def to_srgb(lin):
    return np.clip(lin, 0, 1) ** (1 / 2.2)


def save(name, albedo, height, rough, ao=None, nstrength=2.0, metal=None, quality=90, albedo_is_srgb=True):
    a = albedo if albedo_is_srgb else to_srgb(albedo)
    Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, f'{name}_c.jpg'), quality=quality, subsampling=0)
    Image.fromarray(grad_normal(height, nstrength)).save(os.path.join(OUT, f'{name}_n.jpg'), quality=94, subsampling=0)
    if ao is None: ao = ao_from_height(height)
    m = np.zeros_like(rough) if metal is None else metal
    orm = np.stack([ao, np.clip(rough, 0, 1), m], -1)
    Image.fromarray((orm * 255).astype(np.uint8)).save(os.path.join(OUT, f'{name}_o.jpg'), quality=quality, subsampling=0)
    print('  baked', name, albedo.shape[0])


# ----------------------------------------------------------------------------------------------------------------------
# recipes
# ----------------------------------------------------------------------------------------------------------------------
def snow(n=1024):
    base = fbm(n, 3, 6, .55)
    drift = warp(fbm(n, 2, 3, .5), n, 40)
    ripple = np.sin((np.mgrid[0:n, 0:n][1] / n * 14 + warp(fbm(n, 4, 3), n, 80) * 5) * math.pi * 2) * .5 + .5
    grain = tnoise(n, n // 2, None, 1)
    h = .55 * base + .25 * drift + .1 * ripple * smooth(drift, .4, .8) + .12 * grain
    col = mix3(hexcol('#d9e2ee'), hexcol('#f6f9ff'), smooth(h, .3, .8))
    # cold blue shadows in the dips
    col = col * (0.93 + 0.07 * h[..., None])
    col = col * np.array([.97, .985, 1.0])
    rough = .55 + .35 * (1 - grain) * .6 + .1 * base
    save('snow', col, h, rough, nstrength=3.2)


def snow_packed(n=1024):
    """packed road snow w/ tyre ruts and grit"""
    base = fbm(n, 4, 6, .55)
    ys, xs = np.mgrid[0:n, 0:n] / n
    rut = np.exp(-((xs - .28) ** 2) / .0012) + np.exp(-((xs - .72) ** 2) / .0012)
    rut = warp(rut, n, 18, 3)
    grit = (tnoise(n, n // 2, None, 1) > .93).astype(float) * .6
    h = .6 * base - .35 * rut
    col = mix3(hexcol('#b9c4d2'), hexcol('#eef3fa'), smooth(base, .3, .8))
    col = col * (1 - .25 * rut[..., None]) * (1 - .35 * grit[..., None])
    rough = .62 + .25 * base - .12 * rut
    save('snow_packed', col, h, rough, nstrength=2.4)


def forest_floor(n=1024):
    """frozen dirt, pine needles and leaf litter, patchy thin snow"""
    base = fbm(n, 4, 6, .55)
    # needles = many short oriented strokes: oriented noise
    ang = tnoise(n, 8) * math.pi
    needles = np.zeros((n, n))
    for k in range(5):
        a = RNG.random() * math.pi
        line = tnoise_aniso(n, int(n / 3), int(n / 40))
        line = ndi.rotate(np.tile(line, (2, 2)), a * 57.3, reshape=False, order=1, mode='wrap')[:n, :n]
        needles += line
    needles /= 5
    litter = fbm(n, 8, 4, .5)
    dirt = mix3(hexcol('#3a2e24'), hexcol('#5b4838'), base)
    needlecol = mix3(hexcol('#5c4128'), hexcol('#8a6a3c'), needles)
    col = mix3(np.zeros(3), np.ones(3), np.zeros((n, n)))
    col = dirt * (1 - smooth(needles, .45, .6)[..., None]) + needlecol * smooth(needles, .45, .6)[..., None]
    col *= (.7 + .5 * litter[..., None])
    h = .5 * base + .35 * needles + .2 * litter
    rough = np.full((n, n), .9) - .1 * needles
    save('forest_floor', col, h, rough, nstrength=2.8)


def bark(n=1024):
    """pine bark: long vertical furrows, flaky plates, lichen"""
    r1 = 1 - np.abs(warp(tnoise_aniso(n, 9, 2), n, 40, 4) * 2 - 1)
    r2 = 1 - np.abs(warp(tnoise_aniso(n, 22, 5), n, 25, 5) * 2 - 1)
    r3 = 1 - np.abs(tnoise_aniso(n, 48, 14) * 2 - 1)
    plates = smooth(tnoise_aniso(n, 8, 18), .45, .65)
    h = .5 * r1 + .28 * r2 + .12 * r3 + .25 * plates
    h = (h - h.min()) / (h.max() - h.min())
    col = mix3(hexcol('#1f1812'), hexcol('#6a5846'), smooth(h, .25, .95))
    col *= (.8 + .35 * fbm(n, 6, 3)[..., None])
    grey = smooth(fbm(n, 4, 4), .55, .8)
    col = col * (1 - .35 * grey[..., None]) + grey[..., None] * np.array([.30, .29, .27]) * .35
    lich = smooth(fbm(n, 7, 5, .6), .72, .85)
    col = col * (1 - .5 * lich[..., None]) + lich[..., None] * np.array([.30, .36, .22]) * .5
    save('bark', col, h, .92 - .12 * h, nstrength=4.5)


def wood_planks(name='wood_floor', n=1024, planks=6, dark='#2b1a10', light='#6a4528', wear=1.0, paint=None, seed=None):
    r = np.random.default_rng(seed) if seed is not None else RNG
    ys, xs = np.mgrid[0:n, 0:n]
    ph = n // planks
    h = np.zeros((n, n)); col = np.zeros((n, n, 3)); rough = np.zeros((n, n)); gap = np.zeros((n, n))
    d, l = hexcol(dark), hexcol(light)
    for i in range(planks):
        y0, y1 = i * ph, (i + 1) * ph
        tone = r.random()
        offs = int(r.integers(n))
        # grain: stretched noise + ring sine pattern
        g = tnoise_aniso(n, 3, 40, seed=int(r.integers(1 << 30)))
        g2 = tnoise_aniso(n, 2, 90, seed=int(r.integers(1 << 30)))
        w = tnoise(n, 3, seed=int(r.integers(1 << 30)))
        rings = np.sin((ys / n * (20 + 12 * r.random()) + w * 3 + g * 2) * math.pi * 2) * .5 + .5
        grain = .5 * g + .3 * g2 + .35 * rings
        grain = np.roll(grain, offs, 1)
        sl = slice(y0, y1)
        t = np.clip(grain[sl] * (.8 + .4 * tone), 0, 1)
        c = mix3(d, l, t)
        c *= (.8 + .35 * tone)
        # planks' butt joints
        jx = int(r.integers(n))
        col[sl] = c; h[sl] = grain[sl]
        rough[sl] = .55 + .35 * (1 - grain[sl])
        gap[y0:y0 + 3] = 1; gap[y1 - 2:y1] = 1
        bj = ((xs[sl] - jx) % n) < 3
        gap[sl] = np.maximum(gap[sl], bj.astype(float))
    gap = ndi.gaussian_filter(gap, 1.2, mode='wrap')
    wearmap = fbm(n, 5, 5)
    scuff = smooth(wearmap, .55, .85) * wear
    col = col * (1 - .55 * gap[..., None])
    col = col * (1 - .22 * scuff[..., None]) + scuff[..., None] * .06
    if paint:
        pc = hexcol(paint)
        chip = smooth(fbm(n, 8, 5, .6), .84, .92)
        pcol = pc[None, None, :] * (.9 + .15 * fbm(n, 9, 3)[..., None])
        col = pcol * (1 - chip[..., None]) + col * chip[..., None] * .7
        rough = rough * chip + .5 * (1 - chip)
    h = h * .5 - gap * .9 + .1 * wearmap
    rough = np.clip(rough + .1 * scuff, 0, 1)
    save(name, col, h, rough, ao=np.clip(1 - gap * .9, 0, 1), nstrength=2.4)


def log_wall(n=1024):
    """horizontal squared-log cabin wall: 4 logs per tile with chinking"""
    logs = 4
    ph = n // logs
    ys, xs = np.mgrid[0:n, 0:n]
    h = np.zeros((n, n)); col = np.zeros((n, n, 3)); rough = np.zeros((n, n))
    d, l = hexcol('#3e2614'), hexcol('#8a5a30')
    for i in range(logs):
        y0 = i * ph
        v = (ys[y0:y0 + ph] - y0) / ph  # 0..1 across log
        prof = np.sqrt(np.clip(1 - ((v - .5) * 2) ** 2, 0, 1)) ** .6  # rounded
        g = tnoise_aniso(n, 3, 36)[y0:y0 + ph]
        g2 = tnoise_aniso(n, 2, 100)[y0:y0 + ph]
        w = tnoise(n, 3)[y0:y0 + ph]
        rings = np.sin((v * 10 + w * 4 + g * 2) * math.pi) * .5 + .5
        cr = smooth(voronoi(n, 4)[1][y0:y0 + ph], 0, .08)
        grain = .45 * g + .3 * g2 + .3 * rings
        t = np.clip(grain * (.8 + .4 * RNG.random()), 0, 1)
        c = mix3(d, l, t) * (.55 + .6 * prof[..., None])
        col[y0:y0 + ph] = c
        h[y0:y0 + ph] = prof * .8 + .2 * grain - .15 * (1 - cr)
        rough[y0:y0 + ph] = .7 + .25 * (1 - prof)
    # chinking: lime-grey strip between logs
    edge = np.zeros(n)
    for i in range(logs):
        edge[(i * ph) % n:(i * ph) % n + 10] = 1
        edge[(i * ph - 8) % n:(i * ph) % n or n] = 1
    e2 = ndi.gaussian_filter(np.tile(edge[:, None], (1, n)), 1.5, mode='wrap')
    chink = np.array([.52, .5, .46]) * (.8 + .3 * fbm(n, 12, 3)[..., None])
    col = col * (1 - e2[..., None]) + chink * e2[..., None]
    h = h * (1 - e2) - .5 * e2
    save('log_wall', col, h, rough, nstrength=3.0)


def plaster(n=1024):
    base = fbm(n, 3, 6, .55)
    stain = smooth(fbm(n, 2, 5, .6), .55, .95) * .6
    streak = tnoise_aniso(n, 14, 2)
    streak = warp(streak, n, 12, 5)
    mold = smooth(fbm(n, 5, 6, .6), .78, .92) * .55
    col = np.broadcast_to(hexcol('#c8bda8'), (n, n, 3)).copy()
    col *= (.85 + .2 * base[..., None])
    col = col * (1 - .35 * stain[..., None] * (.6 + .8 * streak[..., None]))
    col = col * (1 - .5 * mold[..., None]) + mold[..., None] * hexcol('#3b4132') * .5
    cracks = smooth(voronoi(n, 9, seed=3)[1], 0, .012)
    col *= (1 - .08 * (1 - cracks))[..., None]
    h = .5 * base + .15 * fbm(n, 24, 3) - .12 * (1 - cracks)
    rough = np.full((n, n), .85) + .1 * base
    save('plaster', col, h, rough, nstrength=1.6)


def wallpaper(n=1024):
    ys, xs = np.mgrid[0:n, 0:n] / n
    # faded stripe + small sprig motif
    stripes = (np.sin(xs * math.pi * 2 * 12) * .5 + .5)
    sprig = np.zeros((n, n))
    r = np.random.default_rng(5)
    for gx in range(4):
        for gy in range(4):
            cx, cy = (gx + .5 + .5 * (gy % 2)) / 4 % 1, (gy + .5) / 4
            dx = ((xs - cx + .5) % 1) - .5; dy = ((ys - cy + .5) % 1) - .5
            rad = np.hypot(dx, dy)
            ang = np.arctan2(dy, dx)
            petal = np.clip(1 - rad / (.05 + .02 * np.cos(5 * ang)), 0, 1)
            sprig += petal
    sprig = np.clip(sprig, 0, 1)
    base = mix3(hexcol('#b8a98a'), hexcol('#c9bb9c'), stripes)
    ink = hexcol('#6a7a62')
    col = base * (1 - .5 * sprig[..., None]) + ink * .5 * sprig[..., None]
    age = fbm(n, 3, 6, .55)
    stain = smooth(fbm(n, 2, 5, .6), .6, .95) * .7
    col *= (.82 + .25 * age[..., None])
    col = col * (1 - .3 * stain[..., None]) + stain[..., None] * hexcol('#7a5a2a') * .25
    peel = smooth(fbm(n, 6, 6, .6), .87, .93)
    col = col * (1 - peel[..., None] * .8) + peel[..., None] * hexcol('#8d8472') * .8
    h = .1 * sprig + .06 * stripes + .3 * age - .3 * peel
    save('wallpaper', col, h, np.full((n, n), .8), nstrength=1.2)


def concrete(n=1024):
    base = fbm(n, 4, 7, .55)
    pores = smooth(tnoise(n, n // 4, None, 1), .86, .95)
    stain = smooth(fbm(n, 3, 5, .6), .5, .9)
    streak = warp(tnoise_aniso(n, 12, 2), n, 20, 4)
    col = np.broadcast_to(hexcol('#7c7b78'), (n, n, 3)).copy() * (.78 + .35 * base[..., None])
    col *= (1 - .3 * stain[..., None] * (.5 + streak[..., None]))
    col *= (1 - .5 * pores[..., None])
    col += np.array([0, .01, 0]) * fbm(n, 6, 3)[..., None]
    h = .5 * base + .25 * fbm(n, 32, 3) - .5 * pores
    save('concrete', col, h, .82 + .1 * base, nstrength=2.2)


def brick(n=1024):
    rows, cols = 12, 6
    ys, xs = np.mgrid[0:n, 0:n]
    bh = n // rows; bw = n // cols
    row = ys // bh
    xo = (xs + (row % 2) * bw // 2) % n
    lx = (xo % bw) / bw; ly = (ys % bh) / bh
    mortar_w = .09
    edge = np.minimum(np.minimum(lx, 1 - lx) * bw, np.minimum(ly, 1 - ly) * bh)
    mortar = smooth(1 - edge / (bh * mortar_w * 2), .0, .9)
    mortar = ndi.gaussian_filter(mortar, 1.2, mode='wrap')
    cid = ((xo // bw) + 7 * row) % 31 / 31.0
    ct = .5 * cid + .5 * fbm(n, 4, 4)
    col = mix3(hexcol('#5e2d22'), hexcol('#8f5240'), np.clip(ct, 0, 1)) * (.8 + .4 * fbm(n, 10, 4)[..., None])
    soot = smooth(fbm(n, 3, 5), .5, .9)
    col *= (1 - .45 * soot[..., None])
    mcol = np.array([.45, .43, .39]) * (.8 + .3 * fbm(n, 20, 3)[..., None])
    col = col * (1 - mortar[..., None]) + mcol * mortar[..., None]
    eff = smooth(fbm(n, 5, 4), .72, .9) * (1 - mortar) * .07
    col += eff[..., None]  # salt efflorescence
    h = .6 * (1 - mortar) + .2 * fbm(n, 20, 3) - .0
    save('brick', col, h, .85 - .15 * mortar, nstrength=3.5)


def rock(n=1024):
    v = voronoi(n, 6, seed=9)
    base = fbm(n, 4, 7, .55)
    cracks = smooth(v[1], 0, .12)
    h = .55 * base + .35 * cracks + .12 * fbm(n, 24, 3)
    col = mix3(hexcol('#3d3f42'), hexcol('#8a8884'), np.clip(base, 0, 1))
    lichen = smooth(fbm(n, 8, 5, .6), .66, .82)
    col = col * (1 - lichen[..., None]) + lichen[..., None] * hexcol('#7d8a5c') * .75
    col *= (.7 + .45 * cracks[..., None])
    save('rock', col, h, .8 - .15 * base, nstrength=4.0)


def metal_rust(n=1024):
    base = fbm(n, 4, 6, .6)
    rust = smooth(warp(fbm(n, 3, 7, .6), n, 24), .42, .72)
    pit = smooth(tnoise(n, n // 3, None, 1), .8, .95)
    steel = np.array([.3, .31, .32]) * (.8 + .4 * base[..., None])
    rcol = mix3(hexcol('#4a2410'), hexcol('#a4501f'), fbm(n, 12, 4))
    col = steel * (1 - rust[..., None]) + rcol * rust[..., None]
    h = .3 * base + .35 * rust + .2 * fbm(n, 30, 3) - .2 * pit
    rough = .35 + .55 * rust + .1 * base
    metal = (1 - rust) * .85
    save('metal_rust', col, h, rough, nstrength=2.0, metal=metal)


def fabric(name='fabric_wool', n=1024, color='#5a2e2a', plaid=True, weave=96):
    ys, xs = np.mgrid[0:n, 0:n] / n
    wx = np.sin(xs * math.pi * 2 * weave) * .5 + .5
    wy = np.sin(ys * math.pi * 2 * weave) * .5 + .5
    w = ((np.floor(xs * weave) + np.floor(ys * weave)) % 2)
    fiber = tnoise(n, n // 2, None, 1)
    cloth = .5 * (wx * w + wy * (1 - w)) + .3 * fiber
    c = hexcol(color)
    col = np.broadcast_to(c, (n, n, 3)).copy()
    if plaid:
        sx = (np.sin(xs * math.pi * 2 * 4) * .5 + .5) ** 3
        sy = (np.sin(ys * math.pi * 2 * 4) * .5 + .5) ** 3
        band = np.clip(sx + sy, 0, 1)
        col = col * (1 - .45 * band[..., None]) + band[..., None] * hexcol('#1a1612') * .45
        thin = (np.sin(xs * math.pi * 2 * 16) > .93) | (np.sin(ys * math.pi * 2 * 16) > .93)
        col = col * (1 - .7 * thin[..., None]) + thin[..., None] * hexcol('#d8c9a0') * .6
    col *= (.7 + .45 * cloth[..., None])
    col *= (.85 + .25 * fbm(n, 4, 4)[..., None])
    save(name, col, cloth * .6, np.full((n, n), .95), nstrength=2.0)


def parka(n=1024):
    """quilted ripstop nylon, grey-green"""
    ys, xs = np.mgrid[0:n, 0:n] / n
    q = 5
    bx = (xs * q) % 1; by = (ys * q) % 1
    puff = np.sin(bx * math.pi) * np.sin(by * math.pi)
    puff = puff ** .5
    seam = 1 - smooth(puff, .0, .35)
    rip = ((np.floor(xs * 220) % 6 == 0) | (np.floor(ys * 220) % 6 == 0)).astype(float) * .12
    base = np.array([.22, .26, .22]) * (.85 + .3 * fbm(n, 4, 4)[..., None])
    col = base * (.7 + .5 * puff[..., None]) * (1 + rip[..., None])
    col *= (1 - .3 * smooth(fbm(n, 5, 5), .55, .85)[..., None] * 1)   # dirt/wet
    h = puff * .8 + rip * .3
    save('parka', col, h, .55 + .25 * seam, nstrength=3.0)


def wool_knit(n=1024):
    ys, xs = np.mgrid[0:n, 0:n] / n
    cols = 28
    u = (xs * cols) % 1; v = (ys * cols * 1.4) % 1
    stitch = np.sin(u * math.pi) ** 1.4 * (1 - np.abs(v - .5) * 1.3)
    stitch = np.clip(stitch, 0, 1)
    fuzz = tnoise(n, n // 2, None, 1)
    col = np.broadcast_to(hexcol('#2e3a2c'), (n, n, 3)).copy() * (.55 + .7 * stitch[..., None]) * (.85 + .3 * fuzz[..., None])
    save('wool_knit', col, stitch, np.full((n, n), .98), nstrength=3.5)


def tile(n=1024):
    ys, xs = np.mgrid[0:n, 0:n]
    cnt = 8
    t = n // cnt
    lx = (xs % t) / t; ly = (ys % t) / t
    edge = np.minimum(np.minimum(lx, 1 - lx), np.minimum(ly, 1 - ly))
    grout = 1 - smooth(edge, .0, .045)
    grout = ndi.gaussian_filter(grout, 1.0, mode='wrap')
    chk = ((xs // t + ys // t) % 2).astype(float)
    base = mix3(hexcol('#c9cbc4'), hexcol('#2f3a3a'), chk * .0 + .0 * chk)
    grime = smooth(fbm(n, 4, 6), .5, .9)
    col = base * (.85 + .2 * fbm(n, 6, 3)[..., None])
    col = col * (1 - .4 * grime[..., None]) * (1 - .1 * (chk[..., None]))
    gcol = np.array([.25, .24, .22])
    col = col * (1 - grout[..., None]) + gcol * grout[..., None]
    crazing = smooth(voronoi(n, 40, seed=2)[1], 0, .02)
    col *= (.9 + .1 * crazing[..., None])
    h = (1 - grout) * .6 + .05 * fbm(n, 6, 3)
    save('tile', col, h, .25 + .5 * grime + .3 * grout, nstrength=3.0)


def ice(n=1024):
    base = fbm(n, 2, 5, .5)
    v = voronoi(n, 5, seed=17)
    cracks = 1 - smooth(v[1], 0, .035)
    v2 = voronoi(n, 14, seed=18)
    fine = 1 - smooth(v2[1], 0, .02)
    air = smooth(tnoise(n, n // 3, None, 1), .85, .97)
    col = np.broadcast_to(hexcol('#2a4048'), (n, n, 3)).copy() * (.7 + .5 * base[..., None])
    col += cracks[..., None] * np.array([.25, .3, .32]) * .5 + fine[..., None] * np.array([.12, .15, .16]) * .6
    col += air[..., None] * .12
    h = .12 * base - .4 * cracks - .15 * fine
    rough = .08 + .25 * cracks + .1 * base
    save('ice', col, h, rough, nstrength=2.0)


def water_n(n=512):
    h = .6 * fbm(n, 8, 4, .5) + .4 * fbm(n, 16, 3, .5)
    save('water', np.broadcast_to(hexcol('#10222a'), (n, n, 3)).copy(), h, np.full((n, n), .05), nstrength=2.6)


def grass(n=1024):
    base = fbm(n, 6, 6, .55)
    blades = tnoise_aniso(n, n // 3, n // 20)
    blades2 = tnoise_aniso(n, n // 2, n // 30)
    clump = fbm(n, 5, 3)
    h = .4 * blades + .3 * blades2 + .3 * base
    col = mix3(hexcol('#2f4a1c'), hexcol('#7da83a'), np.clip(.6 * blades2 + .4 * clump, 0, 1))
    col *= (.8 + .35 * base[..., None])
    dry = smooth(fbm(n, 4, 4), .6, .85)
    col = col * (1 - .4 * dry[..., None]) + dry[..., None] * hexcol('#9c8a4a') * .4
    save('grass', col, h, np.full((n, n), .85), nstrength=3.0)


def gravel_road(n=1024):
    v = voronoi(n, 48, seed=33)
    base = fbm(n, 4, 5)
    stones = smooth(v[0], .0, .9)
    cid = v[2]
    col = mix3(hexcol('#53504a'), hexcol('#a39c8f'), cid) * (.75 + .4 * (1 - stones[..., None]))
    col *= (.8 + .3 * base[..., None])
    dust = smooth(fbm(n, 3, 5), .5, .85)
    col = col * (1 - .3 * dust[..., None]) + dust[..., None] * hexcol('#8c7c60') * .3
    h = (1 - stones) * .8 + .2 * base
    save('gravel', col, h, np.full((n, n), .85), nstrength=3.5)


def paper(n=1024):
    base = fbm(n, 6, 5, .5)
    fib = tnoise_aniso(n, n // 2, n // 40) * .5 + tnoise_aniso(n, n // 40, n // 2) * .5
    stain = smooth(fbm(n, 3, 5, .6), .55, .85)
    edge = np.zeros((n, n)); ys, xs = np.mgrid[0:n, 0:n] / n
    d = np.minimum(np.minimum(xs, 1 - xs), np.minimum(ys, 1 - ys))
    edge = 1 - smooth(d, 0, .08)
    col = np.broadcast_to(hexcol('#d9ceb2'), (n, n, 3)).copy() * (.9 + .12 * fib[..., None]) * (.95 + .08 * base[..., None])
    col = col * (1 - .3 * stain[..., None]) + stain[..., None] * hexcol('#8a6a34') * .22
    col *= (1 - .25 * edge[..., None] * (.4 + .6 * base[..., None]))
    fold1 = np.exp(-((xs - .5) ** 2) / .00015) * .1; fold2 = np.exp(-((ys - .5) ** 2) / .00015) * .1
    col *= (1 - fold1 - fold2)[..., None]
    save('paper', col, .2 * fib + .1 * base, np.full((n, n), .92), nstrength=1.0)


def skin(n=512):
    pores = smooth(tnoise(n, n // 3, None, 1), .6, .9)
    fine = tnoise(n, n // 2, None, 1)
    base = fbm(n, 5, 4)
    col = np.broadcast_to(np.array([.80, .60, .50]), (n, n, 3)).copy() * (.93 + .1 * base[..., None])
    col += np.array([.07, -.02, -.02]) * smooth(fbm(n, 3, 3), .5, .9)[..., None]
    col *= (1 - .1 * pores[..., None])
    save('skin', col, .5 * pores + .5 * fine * .3, np.full((n, n), .45), nstrength=1.0)


def cardboard_boxes(n=512):
    pass


# --- alpha cards ---------------------------------------------------------------------------------------------------
def save_rgba(name, rgb, alpha):
    arr = np.dstack([np.clip(rgb, 0, 1), np.clip(alpha, 0, 1)])
    Image.fromarray((arr * 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, f'{name}.png'))
    print('  baked', name, arr.shape)


def pine_card(w=512, h=256, snowy=False, seed=1):
    """a drooping pine branch seen from above: central stem + needle fringe. u along branch, v across."""
    r = np.random.default_rng(seed)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    from PIL import ImageDraw
    # draw high-res then downsample for soft edges
    S = 2
    big = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    dr = ImageDraw.Draw(big)
    cy = h * S / 2
    for i in range(520):
        t = r.random()
        x0 = t * w * S * .96
        # needles fan out with length falling toward the tip
        L = (1 - t) ** .7 * h * S * .46 + 6
        side = 1 if r.random() < .5 else -1
        ang = side * (0.5 + 0.7 * r.random()) + .15 * (r.random() - .5)
        x1 = x0 + math.sin(ang) * L * .55
        y1 = cy + math.cos(ang) * L * side * .9 * (1 if side > 0 else 1) * 0 + side * math.cos(ang) * L
        g = r.random()
        base = np.array([.07, .20 + .08 * g, .10 + .05 * g])
        if snowy:
            base = np.array([.8, .86, .94]) * (.9 + .1 * g)
        cc = tuple(int(255 * v) for v in base) + (255,)
        dr.line([(x0, cy), (x1, y1)], fill=cc, width=int(3 + 3 * r.random()))
    dr.line([(0, cy), (w * S * .96, cy)], fill=(70, 50, 30, 255) if not snowy else (200, 210, 225, 255), width=7)
    big = big.resize((w, h), Image.LANCZOS)
    big.save(os.path.join(OUT, f'{name_for(snowy)}.png'))
    print('  baked', name_for(snowy))


def name_for(snowy): return 'pine_snow_card' if snowy else 'pine_card'


def leaf_card(w=256, h=256, seed=3):
    from PIL import ImageDraw
    r = np.random.default_rng(seed)
    S = 2
    big = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0)); dr = ImageDraw.Draw(big)
    for i in range(70):
        cx = (.1 + .8 * r.random()) * w * S; cy = (.1 + .8 * r.random()) * h * S
        L = (14 + 16 * r.random()) * S; a = r.random() * math.tau
        g = r.random()
        col = (int(255 * (.16 + .15 * g)), int(255 * (.35 + .25 * g)), int(255 * (.08 + .06 * g)), 255)
        pts = [(cx + math.cos(a) * L, cy + math.sin(a) * L), (cx + math.cos(a + 1.3) * L * .45, cy + math.sin(a + 1.3) * L * .45),
               (cx, cy), (cx + math.cos(a - 1.3) * L * .45, cy + math.sin(a - 1.3) * L * .45)]
        dr.polygon(pts, fill=col)
    big = big.resize((w, h), Image.LANCZOS); big.save(os.path.join(OUT, 'leaf_card.png')); print('  baked leaf_card')


def grass_card(w=256, h=256, seed=4):
    from PIL import ImageDraw
    r = np.random.default_rng(seed)
    S = 2
    big = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0)); dr = ImageDraw.Draw(big)
    for i in range(46):
        x = (.08 + .84 * r.random()) * w * S
        hh = (.35 + .6 * r.random()) * h * S
        bend = (r.random() - .5) * w * S * .35
        g = r.random()
        col = (int(255 * (.18 + .25 * g)), int(255 * (.34 + .35 * g)), int(255 * (.08 + .1 * g)), 255)
        wd = 5 * S
        pts = [(x - wd, h * S), (x + bend * .35, h * S - hh * .6), (x + bend, h * S - hh), (x + bend * .35 + wd * .4, h * S - hh * .6), (x + wd, h * S)]
        dr.polygon(pts, fill=col)
    big = big.resize((w, h), Image.LANCZOS); big.save(os.path.join(OUT, 'grass_card.png')); print('  baked grass_card')


def flower_card(w=128, h=128):
    from PIL import ImageDraw
    S = 4
    big = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0)); dr = ImageDraw.Draw(big)
    c = (w * S / 2, h * S / 2)
    for k in range(6):
        a = k / 6 * math.tau
        px, py = c[0] + math.cos(a) * 26 * S / 2, c[1] + math.sin(a) * 26 * S / 2
        dr.ellipse([px - 12 * S / 2, py - 12 * S / 2, px + 12 * S / 2, py + 12 * S / 2], fill=(250, 250, 244, 255))
    dr.ellipse([c[0] - 7 * S / 2, c[1] - 7 * S / 2, c[0] + 7 * S / 2, c[1] + 7 * S / 2], fill=(238, 190, 40, 255))
    big = big.resize((w, h), Image.LANCZOS); big.save(os.path.join(OUT, 'flower_card.png')); print('  baked flower_card')


def soft_dot(n=64):
    ys, xs = np.mgrid[0:n, 0:n] / (n - 1) * 2 - 1
    r = np.hypot(xs, ys)
    a = np.clip(1 - r, 0, 1) ** 2
    rgb = np.ones((n, n, 3))
    save_rgba('soft_dot', rgb, a)


def flake(n=64):
    ys, xs = np.mgrid[0:n, 0:n] / (n - 1) * 2 - 1
    r = np.hypot(xs, ys)
    a = np.clip(1 - r, 0, 1) ** 1.2
    a = a * (0.65 + .35 * smooth(1 - r, .2, .6))
    save_rgba('flake', np.ones((n, n, 3)), a)


def footprint(n=128):
    """boot print: height mask (alpha) + normal-ish shading baked into rgb"""
    ys, xs = np.mgrid[0:n, 0:n] / (n - 1)
    # sole (elongated ellipse) + heel
    sole = (((xs - .5) / .24) ** 2 + ((ys - .36) / .34) ** 2) < 1
    heel = (((xs - .5) / .2) ** 2 + ((ys - .8) / .16) ** 2) < 1
    m = (sole | heel).astype(float)
    # tread: horizontal bars
    tread = (np.sin(ys * math.pi * 2 * 9) > .15).astype(float)
    m_t = m * (.72 + .28 * tread)
    m = ndi.gaussian_filter(m_t, 1.0)
    edge = m - ndi.gaussian_filter(m, 3)
    rgb = np.dstack([.5 + edge * 2, .5 + edge * 2, .5 + edge * 2])
    save_rgba('footprint', np.clip(rgb, 0, 1), np.clip(m * 1.2, 0, 1))


def stain_decal(n=256):
    r = fbm(n, 3, 5, .6)
    ys, xs = np.mgrid[0:n, 0:n] / (n - 1) * 2 - 1
    rr = np.hypot(xs, ys)
    streak = tnoise_aniso(n, 14, 3)
    a = smooth(1 - rr * (0.7 + .5 * r), .0, .45) * (.4 + .6 * streak)
    a *= smooth(ys + 1, 0, .6) * 0 + 1
    rgb = np.broadcast_to(np.array([.2, .15, .08]), (n, n, 3)).copy()
    save_rgba('stain', rgb, a * .55)


def scratch_decal(n=256):
    from PIL import ImageDraw
    img = Image.new('L', (n, n), 0); d = ImageDraw.Draw(img)
    r = np.random.default_rng(12)
    for _ in range(18):
        x0, y0 = r.random(2) * n; a = r.random() * math.pi
        L = 60 + r.random() * 160
        d.line([(x0, y0), (x0 + math.cos(a) * L, y0 + math.sin(a) * L)], fill=int(130 + 120 * r.random()), width=int(1 + 2 * r.random()))
    a = np.asarray(img) / 255.0
    save_rgba('scratch', np.broadcast_to(np.array([.04, .03, .03]), (n, n, 3)).copy(), a)


def cloud_noise(n=512):
    c = fbm(n, 4, 6, .55)
    Image.fromarray((c * 255).astype(np.uint8)).save(os.path.join(OUT, 'noise.jpg'), quality=95)
    print('  baked noise')


def books(n=1024):
    """atlas of bookshelf spines: 1024 x 256 colour strip"""
    r = np.random.default_rng(21)
    w, h = n, 256
    img = np.zeros((h, w, 3))
    x = 0
    pal = ['#5a2a22', '#2f4a3a', '#1f2f4a', '#6b5a2a', '#3a2a4a', '#7a3a2a', '#2a3a3a', '#8a7a5a', '#4a2a2a', '#2a2a2a']
    while x < w:
        bw = int(18 + r.random() * 30)
        c = hexcol(pal[int(r.integers(len(pal)))]) * (.7 + .5 * r.random())
        img[:, x:x + bw] = c
        img[:, x:x + 2] *= .5
        img[:, min(w - 1, x + bw - 1):x + bw] *= .4
        # label band + gold lines
        by = int(30 + r.random() * 70)
        img[by:by + 30, x + 3:x + bw - 3] = np.array([.8, .75, .6]) * (.8 + .2 * r.random())
        img[h - 50:h - 46, x + 2:x + bw - 2] = np.array([.75, .6, .25])
        x += bw
    img *= (.85 + .3 * fbm(w, 8, 3)[:h, :w, None] if False else 1)
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, 'books.jpg'), quality=90)
    print('  baked books')


JOBS = {
    'snow': snow, 'snow_packed': snow_packed, 'forest_floor': forest_floor, 'bark': bark,
    'wood_floor': lambda: wood_planks('wood_floor', 1024, 6, '#2b1a10', '#6a4528', 1.0, None, 11),
    'wood_pale': lambda: wood_planks('wood_pale', 1024, 8, '#6a4e32', '#c09a64', .6, None, 12),
    'wood_paint': lambda: wood_planks('wood_paint', 1024, 8, '#5a4026', '#9a7a4a', .4, '#6b7a68', 13),
    'wood_dark': lambda: wood_planks('wood_dark', 1024, 4, '#1e120a', '#46291a', .5, None, 14),
    'log_wall': log_wall, 'plaster': plaster, 'wallpaper': wallpaper, 'concrete': concrete, 'brick': brick,
    'rock': rock, 'metal_rust': metal_rust,
    'fabric_wool': lambda: fabric('fabric_wool', 1024, '#5a2e2a', True, 80),
    'fabric_green': lambda: fabric('fabric_green', 1024, '#2f4a3a', False, 90),
    'canvas': lambda: fabric('canvas', 1024, '#8a8a6a', False, 60),
    'parka': parka, 'wool_knit': wool_knit, 'tile': tile, 'ice': ice, 'water': water_n, 'grass': grass, 'gravel': gravel_road,
    'paper': paper, 'skin': skin, 'noise': cloud_noise, 'books': books,
    'cards': lambda: (pine_card(seed=1), pine_card(snowy=True, seed=1), leaf_card(), grass_card(), flower_card(),
                      soft_dot(), flake(), footprint(), stain_decal(), scratch_decal()),
}

if __name__ == '__main__':
    names = sys.argv[1:] or list(JOBS)
    t0 = time.time()
    for k in names:
        t = time.time(); print(k); JOBS[k](); print(f'   {time.time() - t:.1f}s')
    print(f'done in {time.time() - t0:.1f}s')
