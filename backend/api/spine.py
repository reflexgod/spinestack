"""Find and cut the spine out of a wrap-around scan (back | spine | front).

DVD wraps are about 273 x 183 mm with a ~14 mm spine in the middle, so the
spine sits near 48-52 % of the width. Book wraps vary more. We look for the
two strongest vertical colour edges near the middle and treat the strip
between them as the spine.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image


@dataclass
class SpineCut:
    left: int
    right: int
    score: float          # edge strength; higher = more confident
    spine: Image.Image
    front: Image.Image


def _column_means(img: Image.Image, width: int = 600) -> np.ndarray:
    h = max(40, round(width * img.height / img.width))
    small = np.asarray(img.convert("RGB").resize((width, h)), dtype=np.float32)
    band = small[int(h * 0.1): int(h * 0.9)]          # skip top/bottom bleed
    return band.mean(axis=0)                           # (width, 3)


def find_spine(img: Image.Image, kind: str = "movie") -> SpineCut | None:
    """Return the spine strip, or None if the image doesn't look like a wrap."""
    w, h = img.size
    aspect = w / h
    lo, hi = (1.3, 1.75) if kind == "movie" else (1.2, 2.4)
    if not lo <= aspect <= hi:
        return None

    cols = _column_means(img)
    cw = cols.shape[0]
    diff = np.zeros(cw)
    diff[1:] = np.linalg.norm(cols[1:] - cols[:-1], axis=1)

    best = None
    min_gap, max_gap = int(cw * 0.02), int(cw * (0.09 if kind == "movie" else 0.14))
    for left in range(int(cw * 0.38), int(cw * 0.53)):
        for right in range(left + min_gap, min(cw - 1, left + max_gap) + 1):
            s = diff[left] + diff[right]
            if best is None or s > best[0]:
                best = (s, left, right)

    if best is None or best[0] < 40:            # no clear spine edges
        return None
    score, left, right = best
    k = w / cw
    l_px, r_px = round(left * k), round(right * k)
    spine = img.crop((l_px, 0, r_px, h))
    front = img.crop((r_px, 0, w, h))
    return SpineCut(l_px, r_px, float(score), spine, front)
