"""Edit decision list: every cut sits on the 97.98 BPM beat grid of the track.

Beat b starts at  t = PHASE + b * PERIOD  (fitted from the audio, <=8 ms drift).
Source times are seconds in the original recording (edit_current.mp4).
Each shot below is a *safe range* that never straddles a cut of the old edit.
"""
from engine import Cut

PERIOD = 0.6124
PHASE = 0.552
TOTAL = 41.536


def bt(b):
    return PHASE + PERIOD * b


# shot library: name -> (first, last) source second, plus a short description
LIB = {
    "rx_hand_a":  (0.22, 0.55, "arc reactor held in hand (intro)"),
    "bark_a":     (0.62, 2.95, "gold helmet half-face against bark"),
    "dark_rx":    (3.02, 5.00, "dark suit, reactor glow rising"),
    "rx_hand_b":  (5.12, 5.44, "arc reactor in hand (reveal)"),
    "tony_walk":  (5.52, 6.05, "Tony walking in, nano suit, Strange behind"),
    "nano":       (6.25, 7.88, "nano-armour forming, extreme close-up"),
    "tony_prof":  (7.98, 8.52, "Tony profile"),
    "wide":       (8.60, 10.30, "widest street shot, Iron Man saluting"),
    "helm_fire":  (10.40, 11.58, "helmet turn, neon sign + fire behind"),
    "dark_mk":    (11.66, 12.80, "dark armour, reactor + sparks"),
    "flare_fist": (12.90, 14.02, "gauntlet fist with lens flare"),
    "lunge":      (14.10, 14.62, "Iron Man lunging, motion blur"),
    "run_tree":   (14.70, 15.85, "running past the wall and tree"),
    "shoulder":   (15.92, 16.50, "shoulder + reactor close-up on grass"),
    "whip_blue":  (16.56, 17.70, "blue whip-pan armour"),
    "leap":       (17.76, 18.92, "leaping across the grass"),
    "front1":     (19.00, 20.12, "Iron Man facing camera, eyes lit"),
    "helm_close": (20.20, 20.72, "helmet extreme close-up, eye slit"),
    "bleed":      (20.85, 22.00, "violet-reactor suit"),
    "hulk":       (22.10, 23.18, "helmet + hand against the grass"),
    "blue_suit":  (23.28, 24.42, "blue-lit suit, white reactor"),
    "front2":     (24.50, 25.65, "Iron Man facing camera (street)"),
    "bark_b":     (25.74, 27.88, "helmet vs bark, eye slit glowing"),
    "face":       (27.98, 29.92, "Tony's face, blue light in the eyes"),
    "chest_hero": (30.06, 32.98, "chest + reactor hero shot"),
    "chest_med":  (33.08, 34.82, "chest/helmet medium"),
    "arms_out":   (34.90, 36.05, "arms-out power pose"),
    "night":      (36.14, 36.85, "night street, reactor flare in the distance"),
    "arm_flash":  (36.95, 37.28, "gauntlet flash"),
    "forest":     (37.36, 39.70, "Iron Man in the trees, frontal"),
    "boost":      (39.82, 40.38, "boosters igniting"),
    "fly":        (40.46, 41.50, "flying off into the clouds"),
}

FLASH = ("flash", 0, 4, 1.0)
FLASH_S = ("flash", 0, 3, 0.55)
WHIP = ("whip", 2, 3, 1.0)
WHIP_S = ("whip", 1, 2, 0.7)
GLITCH = ("glitch", 0, 3, 1.0)
SPIN = ("spin", 2, 2, 1.0)
FLIP = ("flip", 2, 3, 1.0)
VFLIP = ("vflip", 3, 3, 1.0)
STROBE = ("strobe", 0, 6, 0.5)
INVERT = ("invert", 0, 2, 1.0)


def build():
    cuts = []

    def add(b, n, shot, s0, s1, **kw):
        lo, hi, _ = LIB[shot]
        assert lo - 1e-6 <= min(s0, s1) and max(s0, s1) <= hi + 1e-6, (shot, s0, s1, lo, hi)
        t0 = bt(b)
        dur = n * PERIOD
        if t0 + dur > TOTAL:
            dur = TOTAL - t0
        kw.setdefault("tag", shot)
        cuts.append(Cut(t0=t0, dur=dur, s0=s0, s1=s1, **kw))

    # ---- INTRO (b0-b3): reactor ignites, helmet glimpses ------------------------------------
    add(0, 1, "rx_hand_a", 0.22, 0.55, z0=0.92, z1=0.98, tr=[FLASH], note="reactor ignites on beat 1")
    add(1, 1, "bark_a", 0.70, 1.30, z0=0.86, z1=0.90, tr=[WHIP_S], punch=0.03)
    add(2, 1, "bark_a", 1.55, 2.15, z0=0.88, z1=0.92, flip="h", tr=[GLITCH])
    add(3, 1, "bark_a", 2.30, 2.90, z0=0.88, z1=0.94, tr=[WHIP_S], note="eye slit hit")

    # ---- BREAKDOWN (b4-b7): dark, reactor rising ---------------------------------------------
    add(4, 1, "dark_rx", 3.05, 3.60, z0=0.90, z1=0.96, exposure=1.45, tr=[("dip", 0, 4, 0.5)])
    add(5, 1, "dark_rx", 3.65, 4.15, z0=0.86, z1=0.92, flip="v", exposure=1.45, tr=[WHIP_S])
    add(6, 1, "dark_rx", 4.25, 4.75, z0=0.94, z1=1.02, exposure=1.3, tr=[WHIP_S, FLASH_S])
    add(7, 1, "rx_hand_b", 5.12, 5.44, z0=0.90, z1=0.98, tr=[("whip", 3, 3, 1.0)], note="reactor hologram")

    # ---- DROP + VERSE (b8-b15) ---------------------------------------------------------------
    add(8, 0.5, "tony_walk", 5.55, 5.80, z0=0.92, z1=1.0, shake=16, tr=[FLASH], note="DROP")
    add(8.5, 0.5, "tony_walk", 5.80, 6.05, z0=0.95, z1=1.0, flip="h", tr=[GLITCH])
    add(9, 1, "nano", 6.30, 6.75, z0=0.88, z1=0.95, tr=[WHIP])
    add(10, 1, "nano", 6.80, 7.25, z0=0.88, z1=0.95, flip="hv", tr=[FLASH_S])
    add(11, 0.5, "nano", 7.40, 7.82, z0=0.9, z1=0.96, tr=[WHIP_S])
    add(11.5, 0.5, "tony_prof", 8.02, 8.30, z0=0.95, z1=1.0, flip="h", tr=[FLASH_S])
    add(12, 1, "wide", 8.62, 9.12, z0=1.0, z1=1.0, tr=[FLASH], punch=0.03, note="street sign / wall placement")
    add(13, 1, "wide", 9.12, 9.62, z0=1.0, z1=1.0, flip="h", tr=[FLIP], note="street sign / wall placement")
    add(14, 1, "wide", 9.62, 10.10, z0=1.0, z1=1.0, tr=[WHIP_S])
    add(15, 0.5, "tony_prof", 8.05, 8.30, z0=0.95, z1=1.0, tr=[FLASH_S])
    add(15.5, 0.5, "tony_prof", 8.30, 8.50, z0=1.0, z1=1.05, flip="h", tr=[INVERT])

    # ---- MAIN A (b16-b31) --------------------------------------------------------------------
    add(16, 1, "helm_fire", 10.44, 10.88, z0=0.90, z1=0.95, shake=14, tr=[FLASH], note="neon sign swap")
    add(17, 1, "helm_fire", 10.88, 11.50, z0=0.92, z1=0.97, flip="h", tr=[FLIP], note="neon sign swap")
    add(18, 1, "dark_mk", 11.70, 12.30, z0=0.95, z1=1.0, tr=[FLASH_S])
    add(19, 0.5, "dark_mk", 12.30, 12.55, z0=0.95, z1=1.0, flip="h", tr=[GLITCH])
    add(19.5, 0.5, "dark_mk", 12.55, 12.78, z0=1.0, z1=1.04, tr=[WHIP_S])
    add(20, 1, "flare_fist", 12.92, 13.50, z0=0.95, z1=1.0, shake=10, tr=[FLASH])
    add(21, 1, "flare_fist", 13.50, 14.00, z0=0.95, z1=1.0, flip="h", tr=[FLIP])
    add(22, 1, "lunge", 14.12, 14.60, z0=0.92, z1=1.0, tr=[SPIN])
    add(23, 1, "run_tree", 14.72, 15.28, z0=1.0, z1=1.0, tr=[FLASH_S], note="wall mural")
    add(24, 1, "run_tree", 15.28, 15.85, z0=1.0, z1=1.0, flip="h", tr=[WHIP_S], note="wall mural")
    add(25, 1, "shoulder", 15.95, 16.45, z0=0.86, z1=0.92, tr=[FLASH_S])
    add(26, 0.5, "whip_blue", 16.58, 16.95, z0=0.95, z1=1.0, flip="h", tr=[GLITCH])
    add(26.5, 0.5, "whip_blue", 17.05, 17.40, z0=0.95, z1=1.0, tr=[WHIP_S])
    add(27, 1, "whip_blue", 17.40, 17.68, z0=0.95, z1=1.05, tr=[FLASH_S])
    add(28, 1, "leap", 17.78, 18.30, z0=0.95, z1=1.0, tr=[FLASH])
    add(29, 1, "leap", 18.30, 18.90, z0=0.95, z1=1.0, flip="h", tr=[WHIP])
    add(30, 1, "front1", 19.02, 19.58, z0=1.0, z1=1.0, tr=[FLASH], punch=0.03)
    add(31, 1, "front1", 19.58, 20.10, z0=1.0, z1=1.0, flip="h", tr=[("whip", 3, 2, 1.0)], note="HUD lock-on")

    # ---- HIT (b32): quarter-beat stutter on the biggest low-end hit ---------------------------
    add(32, 0.5, "helm_close", 20.24, 20.50, z0=0.88, z1=0.95, shake=22, tr=[FLASH], note="eye flare on the hit")
    add(32.5, 0.25, "helm_close", 20.50, 20.62, z0=0.9, z1=0.94, flip="h", tr=[INVERT])
    add(32.75, 0.25, "helm_close", 20.62, 20.70, z0=0.9, z1=0.96, flip="hv", tr=[GLITCH])
    add(33, 1, "bleed", 20.88, 21.45, z0=0.95, z1=1.0, tr=[FLASH_S])
    add(34, 1, "bleed", 21.45, 22.00, z0=0.95, z1=1.0, flip="h", tr=[WHIP])
    add(35, 1, "hulk", 22.12, 22.70, z0=0.9, z1=0.96, tr=[FLASH_S])
    add(36, 1, "hulk", 22.70, 23.15, z0=0.9, z1=0.96, flip="h", tr=[SPIN])
    add(37, 1, "blue_suit", 23.30, 23.85, z0=0.95, z1=1.0, tr=[FLASH])
    add(38, 1, "blue_suit", 23.85, 24.40, z0=0.95, z1=1.0, flip="h", tr=[WHIP_S])
    add(39, 1, "front2", 24.52, 25.05, z0=1.0, z1=1.0, tr=[FLASH], punch=0.03)
    add(40, 1, "front2", 25.05, 25.62, z0=1.0, z1=1.0, flip="h", tr=[FLIP])
    add(41, 1, "bark_b", 25.76, 26.30, z0=0.88, z1=0.93, tr=[FLASH_S])
    add(42, 1, "bark_b", 26.30, 26.85, z0=0.88, z1=0.93, flip="h", tr=[GLITCH], note="eye slit flare")
    add(43, 1, "bark_b", 26.85, 27.40, z0=0.9, z1=0.96, tr=[WHIP_S])
    add(44, 0.5, "bark_b", 27.40, 27.62, z0=0.95, z1=1.0, flip="h", tr=[FLASH_S])
    add(44.5, 0.5, "bark_b", 27.62, 27.86, z0=0.95, z1=1.0, tr=[INVERT])

    # ---- BREAKDOWN 2 (b45-b47): Tony's eyes ---------------------------------------------------
    add(45, 1, "face", 28.00, 28.55, z0=0.82, z1=0.88, tr=[("dip", 0, 5, 0.6)], note="eye catchlight")
    add(46, 1, "face", 28.60, 29.10, z0=0.82, z1=0.88, flip="h", tr=[WHIP_S], note="eye catchlight")
    add(47, 1, "face", 29.15, 29.88, z0=0.84, z1=0.95, tr=[("whip", 3, 3, 1.0)], note="eye catchlight")

    # ---- DROP 2 (b48-b66) ---------------------------------------------------------------------
    add(48, 1, "chest_hero", 30.08, 30.60, z0=0.95, z1=1.0, shake=20, tr=[FLASH], note="reactor projection")
    add(49, 1, "chest_hero", 30.60, 31.15, z0=0.92, z1=0.97, flip="h", tr=[WHIP_S])
    add(50, 1, "chest_hero", 31.15, 31.70, z0=0.88, z1=0.93, tr=[FLASH_S])
    add(51, 0.5, "front2", 25.50, 25.20, z0=1.0, z1=1.0, flip="h", tr=[GLITCH])
    add(51.5, 0.5, "front1", 19.50, 19.80, z0=1.0, z1=1.0, tr=[FLASH_S])
    add(52, 1, "chest_med", 33.10, 33.62, z0=0.95, z1=1.0, tr=[FLASH])
    add(53, 1, "chest_med", 33.62, 34.12, z0=0.95, z1=1.0, flip="h", tr=[FLIP])
    add(54, 1, "chest_med", 34.12, 34.78, z0=0.92, z1=1.0, tr=[WHIP_S])
    add(55, 1, "arms_out", 34.95, 35.45, z0=1.0, z1=1.0, shake=16, tr=[FLASH])
    add(56, 1, "arms_out", 35.45, 36.00, z0=1.0, z1=1.0, flip="h", tr=[GLITCH])
    add(57, 1, "forest", 37.40, 37.95, z0=0.95, z1=1.0, tr=[FLASH_S])
    add(58, 1, "night", 36.16, 36.82, z0=1.0, z1=1.0, tr=[("whip", 2, 3, 1.0)], note="meteor signal beam")
    add(59, 0.5, "arm_flash", 36.97, 37.20, z0=0.9, z1=1.0, tr=[FLASH])
    add(59.5, 0.5, "boost", 39.84, 40.10, z0=0.95, z1=1.0, flip="h", tr=[INVERT])
    add(60, 1, "forest", 37.70, 38.20, z0=0.95, z1=1.0, shake=14, tr=[FLASH])
    add(61, 1, "forest", 38.20, 38.75, z0=0.95, z1=1.0, flip="h", tr=[WHIP_S])
    add(62, 1, "front2", 24.60, 25.15, z0=1.0, z1=1.0, tr=[FLASH_S])
    add(63, 0.5, "forest", 38.80, 39.05, z0=0.95, z1=1.0, flip="h", tr=[GLITCH])
    add(63.5, 0.5, "forest", 39.10, 39.66, z0=0.95, z1=1.03, tr=[STROBE])
    add(64, 1, "boost", 39.86, 40.36, z0=1.0, z1=1.0, tr=[FLASH, SPIN])
    add(65, 1, "fly", 40.50, 41.00, z0=1.0, z1=1.0, tr=[WHIP], note="sky-writing")
    add(66, 0.93, "fly", 41.00, 41.50, z0=1.0, z1=1.0, tr=[], note="end card")
    return cuts


if __name__ == "__main__":
    cs = build()
    print(len(cs), "cuts; last ends", round(cs[-1].t1, 3))
    gaps = [round(b.t0 - a.t1, 4) for a, b in zip(cs, cs[1:]) if abs(b.t0 - a.t1) > 1e-3]
    print("gaps/overlaps:", gaps)
