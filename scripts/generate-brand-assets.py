"""Generates DIONER Keyboardist brand assets (white-and-blue identity).

Mark: a rounded blue tile holding a stylised keyboard (four white keys, three
dark-blue black keys) with a small pitch "pulse" above it, tying together the
keyboard and Live Keys.

Run from the repo root:  python scripts/generate-brand-assets.py
Requires Pillow. Outputs go to assets/.
"""

from pathlib import Path

from PIL import Image, ImageDraw

BLUE = (37, 99, 235, 255)  # #2563EB primary
BLUE_DARK = (29, 78, 216, 255)  # #1D4ED8
NAVY = (23, 37, 84, 255)  # #172554 text
PALE = (219, 234, 254, 255)  # #DBEAFE
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)

OUT = Path(__file__).resolve().parent.parent / "assets"
SS = 4  # supersampling factor for smooth edges


def draw_mark(size: int, *, tile: bool, mono: bool = False) -> Image.Image:
    """The keyboard + pulse mark. tile=True draws the blue rounded tile behind it."""
    s = size * SS
    img = Image.new("RGBA", (s, s), CLEAR)
    d = ImageDraw.Draw(img)
    fg = WHITE if not mono else WHITE
    black_key = BLUE_DARK if tile else NAVY
    if tile:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BLUE)

    # Keyboard block (centred, lower half).
    kb_w, kb_h = s * 0.62, s * 0.36
    x0 = (s - kb_w) / 2
    y0 = s * 0.46
    gap = s * 0.012
    key_w = (kb_w - gap * 3) / 4
    radius = int(s * 0.03)
    key_color = fg if (tile or mono) else BLUE
    for i in range(4):
        kx = x0 + i * (key_w + gap)
        d.rounded_rectangle([kx, y0, kx + key_w, y0 + kb_h], radius=radius, fill=key_color)
    # Black keys between white keys 1-2, 2-3, 3-4.
    bk_w, bk_h = key_w * 0.55, kb_h * 0.58
    for i in range(1, 4):
        cx = x0 + i * (key_w + gap) - gap / 2
        if mono:
            # Monochrome: cut the black keys out of the white silhouette.
            d.rounded_rectangle([cx - bk_w / 2, y0 - 1, cx + bk_w / 2, y0 + bk_h], radius=radius, fill=CLEAR)
        else:
            d.rounded_rectangle([cx - bk_w / 2, y0, cx + bk_w / 2, y0 + bk_h], radius=radius, fill=black_key)

    # Pitch pulse above the keyboard.
    line = fg if (tile or mono) else BLUE
    pw = s * 0.62
    px0 = (s - pw) / 2
    base = s * 0.33
    amp = s * 0.11
    pts = [
        (px0, base),
        (px0 + pw * 0.22, base),
        (px0 + pw * 0.32, base - amp),
        (px0 + pw * 0.45, base + amp * 0.8),
        (px0 + pw * 0.56, base - amp * 0.55),
        (px0 + pw * 0.66, base),
        (px0 + pw, base),
    ]
    d.line(pts, fill=line, width=int(s * 0.035), joint="curve")
    r = s * 0.0175
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=line)

    return img.resize((size, size), Image.LANCZOS)


def padded(mark: Image.Image, canvas: int, scale: float, bg=CLEAR) -> Image.Image:
    """Places the mark at `scale` of the canvas, centred (Android adaptive-icon safe zone)."""
    out = Image.new("RGBA", (canvas, canvas), bg)
    m = mark.resize((int(canvas * scale), int(canvas * scale)), Image.LANCZOS)
    off = (canvas - m.width) // 2
    out.alpha_composite(m, (off, off))
    return out


def main() -> None:
    OUT.mkdir(exist_ok=True)
    tile = draw_mark(1024, tile=True)

    # App icon (iOS / legacy Android / stores): full-bleed blue tile on white.
    icon = Image.new("RGBA", (1024, 1024), WHITE)
    icon.alpha_composite(tile)
    icon.convert("RGB").save(OUT / "icon.png")

    # Android adaptive icon: blue background layer + white mark foreground; the mark has its own padding, so
    # 0.92 keeps the artwork (~60 % of the canvas) inside the 66 % safe zone.
    Image.new("RGBA", (512, 512), BLUE).save(OUT / "android-icon-background.png")
    fg_mark = draw_mark(1024, tile=False, mono=True)
    padded(fg_mark, 512, 0.92).save(OUT / "android-icon-foreground.png")
    # Monochrome (themed icons): white silhouette, Android tints it.
    padded(fg_mark, 432, 0.92).save(OUT / "android-icon-monochrome.png")

    # Splash: the tile on transparent; background colour comes from app.json (white).
    padded(tile, 1024, 0.5).save(OUT / "splash-icon.png")

    # Web favicon.
    icon.resize((48, 48), Image.LANCZOS).save(OUT / "favicon.png")
    print("Brand assets written to", OUT)


if __name__ == "__main__":
    main()
