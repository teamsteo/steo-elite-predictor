#!/usr/bin/env python3
"""Affine les couleurs: peak (pixel le plus éloigné du fond) par zone + bordures."""
from PIL import Image
from collections import Counter
import os

UP = '/home/z/my-project/upload'
WIN = os.path.join(UP, 'IMG_20261008_192748.jpg')
LOSS = os.path.join(UP, 'IMG_20261008_192823.jpg')
img_w = Image.open(WIN).convert('RGB')
img_l = Image.open(LOSS).convert('RGB')

def peak_color(img, box, bg, label):
    """Pixel le plus éloigné du fond = couleur pleine du texte/objet."""
    region = img.crop(box)
    px = list(region.getdata())
    def d2(c):
        return sum((a-b)**2 for a, b in zip(c, bg))
    far = sorted(px, key=d2, reverse=True)
    top = far[:max(30, len(far)//200)]  # top 0.5%
    r = sum(p[0] for p in top)//len(top)
    g = sum(p[1] for p in top)//len(top)
    b = sum(p[2] for p in top)//len(top)
    print(f"  {label:<34} peak #{r:02x}{g:02x}{b:02x}")

CARD = (0x14, 0x18, 0x2c)
print("═══ PEAKS (image gagné) ═══")
peak_color(img_w, (135, 222, 540, 268), CARD, 'pick gagné vert')
peak_color(img_w, (135, 280, 475, 316), CARD, 'market blanc')
peak_color(img_w, (878, 60, 1018, 112), CARD, 'badge Gagné: bg')
peak_color(img_w, (880, 238, 1000, 295), CARD, 'cote 1,70 blanc')
peak_color(img_w, (90, 483, 340, 522), CARD, 'perdant grisé')
peak_color(img_w, (868, 1052, 1012, 1138), CARD, 'pastille jaune bg')
peak_color(img_w, (870, 1252, 1022, 1312), CARD, 'gains vert')
peak_color(img_w, (66, 92, 122, 142), CARD, 'trophée cercle vert')
peak_color(img_w, (60, 215, 112, 270), CARD, 'balle tennis')

print("═══ PEAKS (image perdu) ═══")
peak_color(img_l, (120, 205, 330, 252), CARD, 'pick perdu saumon')
peak_color(img_l, (870, 60, 1020, 115), CARD, 'badge Perdu bg')
peak_color(img_l, (915, 1328, 1022, 1390), (0x04, 0x04, 0x10), 'gains 0F rouge')
peak_color(img_l, (58, 90, 118, 145), CARD, 'croix cercle rouge')

# Bordure de boîte : scan horizontal au milieu de la boîte 1 (y≈460)
print("═══ BORDURE BOÎTE (scan x, y=460) ═══")
row = [img_w.getpixel((x, 460)) for x in range(55, 120)]
prev = None
for x, c in enumerate(row, start=55):
    if c != prev:
        print(f"   x={x}: #{c[0]:02x}{c[1]:02x}{c[2]:02x}")
        prev = c

# Bordure: scan vertical sur le haut de la boîte (x=540, y 400-425)
print("═══ BORDURE BOÎTE (scan y, x=540) ═══")
prev = None
for y in range(395, 430):
    c = img_w.getpixel((540, y))
    if c != prev:
        print(f"   y={y}: #{c[0]:02x}{c[1]:02x}{c[2]:02x}")
        prev = c

# Couleurs du score (blanc) et heure grise
peak_color(img_w, (905, 400, 995, 445), CARD, 'score 6 6 blanc')
peak_color(img_w, (408, 350, 672, 390), CARD, "heure 'Aujourd'hui 06:45' gris")

# Badge Gagné: dimensions approx via scan du bg vert
print("═══ BADGE GAGNÉ extent (scan y=86) ═══")
xs = [x for x in range(800, 1080) if img_w.getpixel((x, 86))[1] > 0x30 and img_w.getpixel((x, 86))[0] < 0x40]
print(f"   x range: {min(xs)}..{max(xs)}" if xs else "  rien")
ys = [y for y in range(40, 140) if img_w.getpixel((950, y))[1] > 0x30]
print(f"   y range: {min(ys)}..{max(ys)}" if ys else "  rien")
