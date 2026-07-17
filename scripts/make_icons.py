"""Generate favicon, apple-touch-icon and OG social card for Nightline."""
import os

import matplotlib
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

ROOT = "/Users/robertogulisano/Desktop/Project 12/LofiRadio/public"
FONTS = os.path.join(matplotlib.get_data_path(), "fonts", "ttf")
BOLD = os.path.join(FONTS, "DejaVuSans-Bold.ttf")
REGULAR = os.path.join(FONTS, "DejaVuSans.ttf")

# ---------------------------------------------------------------- favicon ---
car = Image.open(f"{ROOT}/train-carriage.png").convert("RGB")
# Square crop: left seat with white headrest cover against the warm wood wall
icon_crop = car.crop((235, 385, 595, 745))
icon_crop.resize((64, 64), Image.LANCZOS).save(f"{ROOT}/favicon.png")
icon_crop.resize((180, 180), Image.LANCZOS).save(f"{ROOT}/apple-touch-icon.png")

# ------------------------------------------------------------- og-image ---
W, H = 1200, 630
base = Image.open(f"{ROOT}/scenes/milano-centrale-golden.jpg").convert("RGB")
# cover-crop to 1200x630
scale = max(W / base.width, H / base.height)
resized = base.resize((round(base.width * scale), round(base.height * scale)), Image.LANCZOS)
left = (resized.width - W) // 2
top = (resized.height - H) // 2
card = resized.crop((left, top, left + W, top + H))
card = ImageEnhance.Brightness(card).enhance(0.82)

# bottom gradient for text legibility
gradient = Image.new("L", (1, H))
for y in range(H):
    t = max(0.0, (y - H * 0.35) / (H * 0.65))
    gradient.putpixel((0, y), int(200 * t))
gradient = gradient.resize((W, H))
card.paste(Image.new("RGB", (W, H), (10, 12, 16)), (0, 0), gradient)

draw = ImageDraw.Draw(card)
warm_white = (245, 230, 208)
amber = (255, 196, 120)

# small tag
tag_font = ImageFont.truetype(BOLD, 26)
draw.text((64, H - 196), "LOFI · LIVE · NIGHT TRAIN", font=tag_font, fill=amber)
# title
title_font = ImageFont.truetype(BOLD, 88)
draw.text((60, H - 170), "NIGHTLINE", font=title_font, fill=warm_white)
# subtitle
sub_font = ImageFont.truetype(REGULAR, 32)
draw.text((64, H - 66), "A lofi train journey through Europe", font=sub_font, fill=(226, 214, 198))

card.save(f"{ROOT}/og-image.jpg", quality=88)
print("done:", os.listdir(ROOT)[:0] or "favicon.png, apple-touch-icon.png, og-image.jpg")
