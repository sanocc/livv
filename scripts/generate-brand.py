"""Derive official PNG assets without redrawing. Requires Pillow; not a deploy dependency."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops
ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "brand/poai-logo.png"
image = Image.open(SOURCE).convert("RGBA")
assert image.size == (1983, 793), "Review extraction coordinates when the official source changes"
assert all(image.getpixel(point)[3] == 0 for point in [(0,0),(1982,0),(0,792),(1982,792)])
# Follow the transparent diagonal gap between the complete PO∞ and A.
# No color, shape, gradient or source pixels inside PO∞ are retouched.
mask = Image.new("L", image.size, 0)
ImageDraw.Draw(mask).polygon([(0,0),(1350,0),(1350,330),(1340,420),(1295,500),(1230,580),(1200,650),(1200,793),(0,793)], fill=255)
icon = image.copy()
icon.putalpha(ImageChops.multiply(image.getchannel("A"), mask))
icon = icon.crop(icon.getbbox())
size = max(icon.size)
padding = round(size * .045)
square = Image.new("RGBA", (size + padding * 2, size + padding * 2), (0,0,0,0))
square.paste(icon, ((square.width-icon.width)//2,(square.height-icon.height)//2))
square.save(ROOT / "brand/poai-icon.png")
for size in [16,32,48,128]:
    small = square.resize((size,size), Image.Resampling.LANCZOS)
    small.save(ROOT / f"brand/icon-{size}.png")
    if size != 128: small.save(ROOT / f"brand/favicon-{size}.png")
square.save(ROOT / "brand/favicon.ico", sizes=[(16,16),(32,32),(48,48)])
print("Official transparent PNG assets derived; source unchanged")
