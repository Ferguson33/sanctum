#!/usr/bin/env python3
"""Cut a paired sculpture photo (left = white host, right = black host)
into two transparent PNGs. Used when adding a new piece set.

Usage:
  python3 scripts/isolate-set.py <photo> <out-dir> <w-k.png> <b-k.png>
"""
from pathlib import Path
import sys
from PIL import Image
from rembg import new_session, remove

MAX_H = 720


def isolate(im: Image.Image, dest: Path) -> None:
    session = isolate.session  # type: ignore[attr-defined]
    cut = remove(im, session=session)
    if cut.mode != "RGBA":
        cut = cut.convert("RGBA")
    bbox = cut.split()[-1].getbbox()
    if bbox:
        pad = 8
        x0, y0, x1, y1 = bbox
        x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
        x1, y1 = min(cut.width, x1 + pad), min(cut.height, y1 + pad)
        cut = cut.crop((x0, y0, x1, y1))
    if cut.height > MAX_H:
        w = int(cut.width * MAX_H / cut.height)
        cut = cut.resize((w, MAX_H), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    cut.save(dest, optimize=True)


def main() -> None:
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)
    src, out_dir, left_name, right_name = sys.argv[1:]
    isolate.session = new_session("u2net")  # type: ignore[attr-defined]
    im = Image.open(src).convert("RGB")
    w, h = im.size
    gap = 12
    mid = w // 2
    out = Path(out_dir)
    isolate(im.crop((0, 0, mid - gap, h)), out / left_name)
    isolate(im.crop((mid + gap, 0, w, h)), out / right_name)


if __name__ == "__main__":
    main()
