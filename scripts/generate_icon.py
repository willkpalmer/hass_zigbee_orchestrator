"""Generate the 'Zigbee Orchestrator' icon, in WP Log Doctor's style: a
glossy tile with a Zigbee mesh on it - a coordinator in the middle, routers
around it and end devices at the edge, linked by lines.

Palette (as WP Log Doctor's icon):
  NAVY_DARK  - tile gradient dark stop / outlines
  BLUE_LIGHT - tile gradient light stop
  PAPER      - routers, links
  RED        - accent: the coordinator
  SLATE      - end devices

Run: python scripts/generate_icon.py (needs Pillow).
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

BRAND_DIR = (
    Path(__file__).resolve().parent.parent
    / "custom_components" / "zigbee_orchestrator" / "brand"
)

# Home Assistant's brand image spec: icon.png at 256x256, plus a 512x512
# icon@2x.png for hDPI displays. https://developers.home-assistant.io/docs/core/integration/brand_images
S = 512

NAVY_DARK = (16, 38, 68, 255)
BLUE_LIGHT = (86, 150, 210, 255)
PAPER = (248, 245, 236, 255)
SLATE = (150, 160, 172, 255)
RED = (199, 62, 62, 255)


def solid(color):
    return Image.new("RGBA", (S, S), color)


def linear_gradient_mask(angle_deg):
    base = Image.linear_gradient("L").resize((S * 2, S * 2)).rotate(angle_deg)
    return base.crop((S // 2, S // 2, S // 2 + S, S // 2 + S))


def tile() -> Image.Image:
    radius = int(S * 0.22)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=255)
    grad = Image.composite(solid(BLUE_LIGHT), solid(NAVY_DARK), linear_gradient_mask(35))

    # Darker edge for depth.
    edge = Image.new("L", (S, S), 0)
    ImageDraw.Draw(edge).rounded_rectangle(
        [0, 0, S - 1, S - 1], radius=radius, outline=255, width=int(S * 0.03)
    )
    edge = edge.filter(ImageFilter.GaussianBlur(S * 0.02))
    overlay = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    overlay.paste(solid((0, 0, 0, 70)), (0, 0), edge)
    grad = Image.alpha_composite(grad, overlay)

    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)

    # Gloss: a soft bright ellipse over the top.
    gloss = Image.new("L", (S, S), 0)
    ImageDraw.Draw(gloss).ellipse([S * 0.05, -S * 0.25, S * 0.95, S * 0.55], fill=110)
    gloss = gloss.filter(ImageFilter.GaussianBlur(S * 0.05))
    shine = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    shine.paste(solid((255, 255, 255, 255)), (0, 0), gloss)
    clipped = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    clipped.paste(shine, (0, 0), mask)
    return Image.alpha_composite(out, clipped)


def mesh() -> Image.Image:
    c = S / 2
    routers = [
        (c + S * 0.24 * math.cos(math.radians(a)), c + S * 0.24 * math.sin(math.radians(a)))
        for a in (-90, 30, 150)
    ]
    ends = [
        (c + S * 0.36 * math.cos(math.radians(a)), c + S * 0.36 * math.sin(math.radians(a)))
        for a in (-30, 90, 210)
    ]
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    link = int(S * 0.022)
    # Coordinator to each router, routers to each other, each end device
    # to its two nearest routers.
    for r in routers:
        d.line([(c, c), r], fill=PAPER, width=link)
    for i, r in enumerate(routers):
        d.line([r, routers[(i + 1) % 3]], fill=(*PAPER[:3], 150), width=link // 2)
    for e in ends:
        for r in sorted(routers, key=lambda r: math.dist(r, e))[:2]:
            d.line([r, e], fill=(*PAPER[:3], 170), width=link // 2)

    def node(xy, radius, fill):
        x, y = xy
        d.ellipse([x - radius, y - radius, x + radius, y + radius], fill=fill,
                  outline=NAVY_DARK, width=max(2, int(S * 0.008)))

    for e in ends:
        node(e, S * 0.045, SLATE)
    for r in routers:
        node(r, S * 0.065, PAPER)
    node((c, c), S * 0.1, RED)

    # Drop shadow under the whole mesh.
    alpha = layer.split()[3]
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    shadow.paste(solid((0, 0, 0, 120)), (int(S * 0.015), int(S * 0.025)), alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(S * 0.02))
    return Image.alpha_composite(shadow, layer)


def main() -> None:
    img = Image.alpha_composite(tile(), mesh())
    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    img.save(BRAND_DIR / "icon@2x.png")
    img.resize((256, 256), Image.LANCZOS).save(BRAND_DIR / "icon.png")


if __name__ == "__main__":
    main()
