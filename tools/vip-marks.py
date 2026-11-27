#!/usr/bin/env python3
"""Cut the VIP list icons into the panel's agent marks.

Reads vip-icons.png, a strip of 12x12 icons whose first cell is blank, and
writes one PNG per mark in marks.js: the icon with hard edges and a 1 px dark
outline, so it stands out on light themes too, doubled with nearest sampling so
it stays sharp at 14 px and at 28. Needs Pillow.
"""

from pathlib import Path
import re

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
MOD = ROOT / "mods/agents-tibia"
CELL = 12
OUTLINED = CELL + 2
SCALE = 2
OUTLINE = (40, 40, 40)
SOLID_ALPHA = 96  # Softer pixels than this are dropped.
EDGE_PADDING = 3  # The transparent border of the macOS copies, as in main.js.


def outlined(icon):
    image = Image.new("RGBA", (OUTLINED, OUTLINED))
    image.paste(icon, (1, 1))
    solid = image.getchannel("A").point(lambda alpha: 255 if alpha >= SOLID_ALPHA else 0)
    image.putalpha(solid)
    outline = Image.new("RGBA", image.size, OUTLINE)
    outline.putalpha(solid.filter(ImageFilter.MaxFilter(3)))
    outline.alpha_composite(image)
    return outline


def main():
    names = re.findall(r'\["(\w+)",', (MOD / "marks.js").read_text())
    sheet = Image.open(ROOT / "tools/vip-icons.png").convert("RGBA")
    if sheet.size != ((len(names) + 1) * CELL, CELL):
        raise SystemExit(f"The sheet is {sheet.size}, but marks.js lists {len(names)} marks.")
    plain, padded = MOD / "sprites/marks", MOD / "sprites/padded/marks"
    for directory in (plain, padded):
        directory.mkdir(parents=True, exist_ok=True)
        for stale in directory.glob("*.png"):
            stale.unlink()
    size = OUTLINED * SCALE
    for index, name in enumerate(names, 1):
        icon = sheet.crop((index * CELL, 0, (index + 1) * CELL, CELL))
        image = outlined(icon).resize((size, size), Image.Resampling.NEAREST)
        image.save(plain / f"{name}.png")
        border = Image.new("RGBA", (size + 2 * EDGE_PADDING,) * 2)
        border.paste(image, (EDGE_PADDING, EDGE_PADDING))
        border.save(padded / f"{name}.png")
    print(f"wrote {len(names)} marks to {plain}")


if __name__ == "__main__":
    main()
