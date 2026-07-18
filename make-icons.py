# make-icons.py
"""Regenerates the Home Manual icon set.

Draws a simple house outline with a brass check mark on the shop-notebook
green-black ground, at the three sizes the manifest declares.

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

    # House: gable + walls.
    apex = (size / 2, pad + w * 0.02)
    eave_l = (pad + w * 0.05, pad + w * 0.42)
    eave_r = (size - pad - w * 0.05, pad + w * 0.42)
    wall_l = (pad + w * 0.16, pad + w * 0.42)
    wall_r = (size - pad - w * 0.16, pad + w * 0.42)
    base_l = (wall_l[0], pad + w * 0.95)
    base_r = (wall_r[0], pad + w * 0.95)

    d.line([eave_l, apex, eave_r], fill=PAPER, width=stroke, joint="curve")
    d.line([wall_l, base_l, base_r, wall_r], fill=PAPER, width=stroke, joint="curve")

    # Brass check mark inside the house.
    cx, cy = size / 2, pad + w * 0.68
    s = w * 0.30
    d.line(
        [(cx - s * 0.55, cy), (cx - s * 0.12, cy + s * 0.42), (cx + s * 0.62, cy - s * 0.45)],
        fill=BRASS,
        width=int(stroke * 1.4),
        joint="curve",
    )
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    draw_icon(192, 0.14).save(OUT / "icon-192.png")
    draw_icon(512, 0.14).save(OUT / "icon-512.png")
    # Maskable: extra margin so Android's shape masks don't clip the glyph.
    draw_icon(512, 0.24).save(OUT / "icon-maskable-512.png")
    print(f"Wrote icons to {OUT}")


if __name__ == "__main__":
    main()
