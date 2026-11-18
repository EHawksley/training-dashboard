#!/usr/bin/env python3
"""Draw the Training home-screen icon."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"


def stroke(draw, points, color, width):
    draw.line(points, fill=color, width=width, joint="curve")
    radius = width / 2
    for x, y in points:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)


def draw(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), "#0c1118")
    glow = Image.new("RGB", (size, size), "#0c1118")
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((size * 0.16, size * 0.1, size * 0.88, size * 0.8), fill="#14352d")
    glow = glow.filter(ImageFilter.GaussianBlur(radius=max(1, int(size * 0.055))))
    img = Image.blend(img, glow, 0.9)
    pen = ImageDraw.Draw(img)

    def xy(px, py):
        return (px / 100 * size, py / 100 * size)

    width = max(3, int(round(size * 0.062)))
    stroke(pen, [xy(24, 66), xy(40, 54), xy(56, 46), xy(74, 30)], "#3ee0b0", width)
    cx, cy = xy(74, 30)
    radius = size * 0.048
    pen.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill="#ffb020")
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    master = draw(1024)
    for name, px in (
        ("icon-512.png", 512),
        ("icon-192.png", 192),
        ("apple-touch-icon.png", 180),
        ("favicon-32.png", 32),
    ):
        master.resize((px, px), Image.Resampling.LANCZOS).save(OUT / name, optimize=True)


if __name__ == "__main__":
    main()
