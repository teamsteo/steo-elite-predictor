#!/usr/bin/env python3
"""Planche de comparaison: crops réels Betclic vs 4 polices candidates (v2)."""
from PIL import Image, ImageDraw, ImageFont
import os

BASE = '/home/z/my-project/scripts/betclic_analysis'
FD = os.path.join(BASE, 'fonts')
UP = '/home/z/my-project/upload'

img_w = Image.open(os.path.join(UP, 'IMG_20261008_192748.jpg')).convert('RGB')
CARD = (0x14, 0x18, 0x2c)
GREEN = (0x8b, 0xd1, 0xb4)
GREY_LBL = (150, 155, 175)
FONTS = ['roboto', 'inter', 'figtree', 'dmsans']
LBL = ImageFont.truetype(os.path.join(FD, 'roboto-400.ttf'), 16)

def fnt(key, weight, size):
    return ImageFont.truetype(os.path.join(FD, f'{key}-{weight}.ttf'), size)

# ── Planche A: pick name + market ──
real_a = img_w.crop((130, 218, 700, 320))
fonts_used = FONTS
row_h = 100
canv_a = Image.new('RGB', (570, row_h * len(FONTS) + 10), CARD)
d = ImageDraw.Draw(canv_a)
y = 5
for key in FONTS:
    d.text((6, y + 2), 'Adolfo Daniel Vallejo', font=fnt(key, '700', 42), fill=GREEN)
    d.text((6, y + 56), 'Vainqueur du match', font=fnt(key, '400', 38), fill=(255,255,255))
    d.text((430, y + 30), key, font=LBL, fill=GREY_LBL)
    y += row_h

# ── Planche B: cotes italiques ──
real_b = img_w.crop((880, 235, 1010, 300))
canv_b = Image.new('RGB', (130, 130 * len(FONTS) + 10), CARD)
d = ImageDraw.Draw(canv_b)
y = 8
for key in FONTS:
    d.text((10, y), '1,70', font=fnt(key, 'i700', 56), fill=(255,255,255))
    d.text((10, y + 68), key, font=LBL, fill=GREY_LBL)
    y += 130

# ── Planche C: header + Gagné ──
real_c = img_w.crop((60, 42, 560, 100))
canv_c = Image.new('RGB', (500, 66 * len(FONTS) + 10), CARD)
d = ImageDraw.Draw(canv_c)
y = 6
for key in FONTS:
    d.text((6, y), "Combiné (2)", font=fnt(key, '500', 38), fill=(255,255,255))
    d.text((260, y), "Gagné", font=fnt(key, '700', 30), fill=GREEN)
    d.text((400, y + 10), key, font=LBL, fill=GREY_LBL)
    y += 66

# empilement vertical: [réel | rendus] par planche
blocks = [('A', real_a, canv_a), ('B', real_b, canv_b), ('C', real_c, canv_c)]
W = max(r.width + c.width + 130 for _, r, c in blocks)
H = sum(max(r.height, c.height) + 30 for _, r, c in blocks) + 10
sheet = Image.new('RGB', (W, H), (8, 8, 12))
d = ImageDraw.Draw(sheet)
y = 5
for name, r, c in blocks:
    d.text((8, y + 4), f'{name} RÉEL →', font=LBL, fill=(255, 210, 60))
    sheet.paste(r, (95, y))
    d.text((95 + r.width + 8, y + 4), 'RENDU →', font=LBL, fill=(120, 220, 255))
    sheet.paste(c, (95 + r.width + 90, y))
    y += max(r.height, c.height) + 30
sheet.save(os.path.join(BASE, 'font_compare.png'))
print(f'✅ font_compare.png {sheet.size}')
