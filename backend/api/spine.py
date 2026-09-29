"""Find and cut the spine out of a wrap-around scan (back | spine | front).

DVD wraps are about 273 x 183 mm with a ~14 mm spine in the middle, so the
spine sits near 48-52 % of the width and is 3-7 % wide. Book wraps vary more.
We look for two clear vertical colour edges near the middle, prefer strips
with a DVD-like width and an even colour down their height, then move each
edge inward past columns that still carry the back or front cover's colour.

This mirrors findSpine() in index.html; keep the two in step.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from PIL import Image


@dataclass
class SpineCut:
    left: int
    right: int
    score: float          # 0-100: how sure we are this is a clean spine
    spine: Image.Image
    front: Image.Image
    parts: dict = field(default_factory=dict)   # what went into the score, for debugging


def _small(img: Image.Image, width: int = 600) -> np.ndarray:
    h = max(40, round(width * img.height / img.width))
    return np.asarray(img.convert("RGB").resize((width, h)), dtype=np.float32)


def _dist(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))


def find_spine(img: Image.Image, kind: str = "movie") -> SpineCut | None:
    """Return the spine strip, or None if the image doesn't look like a wrap."""
    w, h = img.size
    aspect = w / h
    lo, hi = (1.3, 1.9) if kind == "movie" else (1.2, 2.4)
    if not lo <= aspect <= hi:
        return None

    px = _small(img)
    ch, cw = px.shape[:2]
    y0, y1 = int(ch * 0.08), int(ch * 0.92)
    cols = px[y0:y1:2].mean(axis=0)                                  # (cw, 3)

    # a photo of a case or book on a table has a plain background down both sides; a scan runs to the edge
    band = max(4, cw // 50)
    border = (px[:, :band].reshape(-1, 3).std(axis=0).mean() + px[:, -band:].reshape(-1, 3).std(axis=0).mean()) / 2
    if border < 10:
        return None

    def avg(a: int, b: int) -> np.ndarray:
        return cols[a:b + 1].mean(axis=0)

    # colour step between the 3 columns left and right of x: scans have soft, blurred edges
    edge = np.zeros(cw)
    for i in range(3, cw - 3):
        edge[i] = _dist(avg(i - 3, i - 1), avg(i + 1, i + 3))

    film = kind == "movie"
    min_w, max_w = round(cw * (0.025 if film else 0.02)), round(cw * (0.09 if film else 0.14))
    cands = []
    for left in range(int(cw * 0.36), int(cw * 0.56) + 1):
        for right in range(left + min_w, min(cw - 4, left + max_w) + 1):
            lo_e, hi_e = sorted((edge[left], edge[right]))
            if lo_e < 10 or hi_e < 25:                               # one edge can be soft (spine and front alike), not both
                continue
            e = 0.6 * lo_e + 0.4 * hi_e
            wf, off = (right - left) / cw, abs((left + right) / 2 / cw - 0.5)
            if film:                                                 # DVD: 129 | 14 | 129 mm; Blu-ray runs wider, spine thinner
                full = 0.03 <= wf <= 0.07 or (aspect >= 1.65 and 0.025 <= wf <= 0.06)
                fit = (1 if full else 0.75) * float(np.exp(-0.5 * (off / 0.035) ** 2))
            else:
                fit = float(np.exp(-0.5 * (off / 0.1) ** 2))
            cands.append((e * fit, left, right, e, fit))
    if not cands:
        return None
    cands.sort(key=lambda c: -c[0])

    # among the best, prefer an even colour down the height (a spine, not a slice of a photo)
    def evenness(left: int, right: int) -> float:
        rows = px[y0:y1:2, left + 1:right].mean(axis=1)             # (rows, 3)
        med = np.median(rows, axis=0)
        return float((np.linalg.norm(rows - med, axis=1) < 60).mean())

    best = None
    for s, left, right, e, fit in cands[:40]:
        u = evenness(left, right)
        f = s * (0.5 + 0.5 * u)
        if best is None or f > best[0]:
            best = (f, left, right, e, fit, u)
    _, bl, br, e, fit, u = best

    # move each edge inward past columns that look more like the back or front cover than the spine
    q = (br - bl) // 4
    inner, cap = np.median(cols[bl + q:br - q + 1], axis=0), max(2, round(cw * 0.02))
    left, right = bl, br
    while left - bl < cap and right - left > min_w and _dist(cols[left], inner) > _dist(cols[left], avg(max(0, bl - 5), bl - 2)):
        left += 1
    while br - right < cap and right - left > min_w and _dist(cols[right], inner) > _dist(cols[right], avg(br + 2, min(cw - 1, br + 5))):
        right -= 1
    # spine and cover the same colour (Gummo: yellow on yellow) leave a soft edge that lettering can beat:
    # widen a thin film spine over columns that still match it, up to a DVD spine's usual 5 %
    while film and (right - left) / cw < 0.05:
        r = right < cw - 4 and _dist(cols[right + 1], inner) < 35
        l = left > 3 and _dist(cols[left - 1], inner) < 35
        if not r and not l:
            break
        if r:
            right += 1
        if l and (right - left) / cw < 0.05:
            left -= 1
    left, right = left + 1, right - 1                                # one more column for the soft edge itself

    # a spine carries lettering: rows change as they cross it. A blank strip is a gap or a case hinge.
    g = px[y0:y1, left + 1:right].mean(axis=(1, 2))
    text = float(np.abs(np.diff(g)).mean()) if len(g) > 1 else 0.0
    penalty = (0.6 if abs(aspect - 4 / 3) < 0.012 else 1) * (0.7 if text < 2.0 else 1)   # 4:3 is a phone photo, not a scan

    # Books: scans are rare and look-alikes common (3D mock-ups, a strip of one cover, two books side by side,
    # wooden boards for "Norwegian Wood"). Keep only a flat scan: a busy edge all round, clear edges on both
    # sides of the spine, straight up and down, and an even colour top to bottom.
    if not film:
        at = lambda x: float(edge[max(0, x - 3):x + 4].max())
        def drift(x: int) -> float:
            pos = []
            for a, b in ((0.1, 0.4), (0.6, 0.9)):
                band = px[int(ch * a):int(ch * b):2].mean(axis=0)
                lo_i, hi_i = max(3, x - 12), min(cw - 4, x + 12)
                e = [_dist(band[i + 1:i + 4].mean(axis=0), band[i - 3:i].mean(axis=0)) for i in range(lo_i, hi_i + 1)]
                pos.append(lo_i + int(np.argmax(e)))
            return abs(pos[0] - pos[1]) / cw
        if border < 20 or min(at(bl), at(br)) < 25 or u < 0.9 or max(drift(bl), drift(br)) > 0.012:
            return None

    score = round(100 * min(1, e / 60) * fit * (0.5 + 0.5 * u) * penalty)
    if score < 20:
        return None
    # drop plain margins above and below the wrap (rows that are one flat colour right across the scan)
    flat = px[:, ::2].mean(axis=2).std(axis=1) < 6
    top, bot = 0, ch - 1
    while top < ch * 0.15 and flat[top]:
        top += 1
    while bot > ch * 0.85 and flat[bot]:
        bot -= 1
    k, ky = w / cw, h / ch
    l_px, r_px, front_x = round(left * k), round((right + 1) * k), round((br + 1) * k)
    t_px, b_px = round(top * ky), round((bot + 1) * ky)
    return SpineCut(l_px, r_px, float(score), img.crop((l_px, t_px, r_px, b_px)), img.crop((front_x, t_px, w, b_px)),
                    {"edge": round(e, 1), "fit": round(fit, 2), "even": round(u, 2), "text": round(text, 1), "border": round(float(border), 1), "penalty": penalty})
