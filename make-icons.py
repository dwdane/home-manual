# make-icons.py
"""Regenerates the Home Manual icon set.

Draws a simple house outline with a brass check mark on the shop-notebook
green-black ground, at the three sizes the manifest declares. The maskable
variant carries extra padding because Android crops adaptive icons.

Usage:
    uv run --with pillow make-icons.py
Writes the three PNGs beside this script.
"""

from pathlib import Path

from PIL import Image, ImageDraw

INK = (16, 19, 18, 255)        # --ink
BRASS = (216, 160, 61, 255)    # --brass
PAPER = (233, 228, 216, 255)   # --paper

OUT = Path(__file__).resolve().parent


def draw_icon(size: int, pad_ratio: float) -> Image.Image:
    """Render the glyph at `size` px with `pad_ratio` of empty margin."""
    img = Image.new("RGBA", (size, size), INK)
    d = ImageDraw.Draw(img)

    pad = size * pad_ratio
    w = size - 2 * pad
    stroke = max(3, int(size * 0.045))

    # House: gable + walls
    apex = (size / 2, pad + w * 0.02)
    eave_l = (pad + w * 0.06, pad + w * 0.42)
    eave_r = (size - pad - w * 0.06, pad + w * 0.42)
    base_l = (pad + w * 0.16, size - pad - w * 0.04)
    base_r = (size - pad - w * 0.16, size - pad - w * 0.04)
    wall_l = (pad + w * 0.16, pad + w * 0.34)
    wall_r = (size - pad - w * 0.16, pad + w * 0.34)

    d.line([eave_l, apex, eave_r], fill=PAPER, width=stroke, joint="curve")
    d.line([wall_l, base_l, base_r, wall_r], fill=PAPER, width=stroke, joint="curve")

    # Brass check inside
    c1 = (size / 2 - w * 0.16, pad + w * 0.58)
    c2 = (size / 2 - w * 0.04, pad + w * 0.72)
    c3 = (size / 2 + w * 0.20, pad + w * 0.42)
    d.line([c1, c2, c3], fill=BRASS, width=int(stroke * 1.35), joint="curve")

    return img


def main() -> None:
    """Write the three icons the manifest expects."""
    draw_icon(192, 0.16).save(OUT / "icon-192.png")
    draw_icon(512, 0.16).save(OUT / "icon-512.png")
    draw_icon(512, 0.26).save(OUT / "icon-maskable-512.png")
    print(f"Wrote icons to {OUT}")


if __name__ == "__main__":
    main()
