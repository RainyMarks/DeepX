from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


SIZES = [16, 24, 32, 48, 64, 128, 256, 512]


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: python make-icon.py <source-png> <output-dir>", file=sys.stderr)
        return 2

    src = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    image = Image.open(src).convert("RGBA")
    side = min(image.size)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    image = image.crop((left, top, left + side, top + side))

    rendered = []
    for size in SIZES:
        resized = image.resize((size, size), Image.Resampling.LANCZOS)
        target = out_dir / f"icon-{size}.png"
        resized.save(target)
        rendered.append(resized)

    rendered[-1].save(out_dir / "icon.png")
    image.save(
        out_dir / "icon.ico",
        sizes=[(s, s) for s in SIZES if s <= 256],
    )
    print(out_dir / "icon.ico")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
