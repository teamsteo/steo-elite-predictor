#!/usr/bin/env python3
"""Échantillonne les couleurs exactes des captures Betclic utilisateur (Task 38).
Génère aussi des crops zoomés pour identification de la police."""
from PIL import Image
from collections import Counter
import os

UP = '/home/z/my-project/upload'
OUT = '/home/z/my-project/scripts/betclic_analysis'
os.makedirs(OUT, exist_ok=True)

WIN = os.path.join(UP, 'IMG_20261008_192748.jpg')   # Combiné (2) Gagné
LOSS = os.path.join(UP, 'IMG_20261008_192823.jpg')  # Combiné (3) Perdu

img_w = Image.open(WIN).convert('RGB')
img_l = Image.open(LOSS).convert('RGB')
print(f"gagné: {img_w.size}, perdu: {img_l.size}")

def top_colors(img, box, n=4, label=''):
    """Couleurs les plus fréquentes dans une région."""
    region = img.crop(box)
    px = list(region.getdata())
    # quantifier à 4 près pour absorber le bruit JPEG
    q = Counter((r//4*4, g//4*4, b//4*4) for r, g, b in px)
    total = len(px)
    res = [(f'#{r:02x}{g:02x}{b:02x}', round(100*c/total, 1)) for (r, g, b), c in q.most_common(n)]
    print(f"  {label:<28} {res}")
    return res

def hexs(c):
    return f'#{c[0]:02x}{c[1]:02x}{c[2]:02x}'

def avg(img, box, label='', exclude_bright=False):
    """Couleur moyenne d'une région."""
    region = img.crop(box)
    px = [p for p in region.getdata()
          if not exclude_bright or (p[0]+p[1]+p[2]) < 400]
    if not px:
        px = list(region.getdata())
    r = sum(p[0] for p in px)//len(px)
    g = sum(p[1] for p in px)//len(px)
    b = sum(p[2] for p in px)//len(px)
    print(f"  {label:<28} avg #{r:02x}{g:02x}{b:02x}")
    return (r, g, b)

W, H = img_w.size
WL, HL = img_l.size

print("\n═══ IMAGE GAGNÉ (échelle 1080) ═══")
# proportions basées sur l'affichage 1080x1344
s = H / 1344.0
print(" [fonds]")
top_colors(img_w, (0, 0, int(30*s), H), 3, 'fond extérieur')
top_colors(img_w, (int(500*s), int(170*s), int(650*s), int(195*s)), 2, 'carte (entre header/leg)')
top_colors(img_w, (int(300*s), int(500*s), int(700*s), int(545*s)), 3, 'boîte match (zone vide)')
print(" [textes]")
top_colors(img_w, (int(135*s), int(222*s), int(540*s), int(268*s)), 4, 'pick gagné (vert)', )
top_colors(img_w, (int(135*s), int(280*s), int(475*s), int(316*s)), 3, 'market (blanc)')
top_colors(img_w, (int(880*s), int(238*s), int(1000*s), int(295*s)), 4, 'cote 1,70 (blanc italique)')
top_colors(img_w, (int(90*s), int(483*s), int(340*s), int(522*s)), 4, 'perdant grisé')
avg(img_w, (int(905*s), int(400*s), int(995*s), int(445*s)), 'score gagnant (blanc)')
print(" [badges & accents]")
top_colors(img_w, (int(878*s), int(60*s), int(1018*s), int(112*s)), 5, 'badge Gagné (bg+texte)')
top_colors(img_w, (int(868*s), int(1052*s), int(1012*s), int(1138*s)), 5, 'pastille jaune (bg+texte)')
top_colors(img_w, (int(870*s), int(1252*s), int(1022*s), int(1312*s)), 4, 'gains 1240 F (vert)')
top_colors(img_w, (int(66*s), int(92*s), int(122*s), int(142*s)), 4, 'icône trophée 1')
top_colors(img_w, (int(110*s), int(92*s), int(165*s), int(142*s)), 4, 'icône trophée 2')
top_colors(img_w, (int(60*s), int(215*s), int(112*s), int(270*s)), 3, 'balle tennis')

print("\n═══ IMAGE PERDU ═══")
s2 = HL / 1584.0
print(" [textes]")
top_colors(img_l, (int(120*s2), int(205*s2), int(330*s2), int(252*s2)), 4, 'pick perdu (saumon)')
top_colors(img_l, (int(915*s2), int(1328*s2), int(1022*s2), int(1390*s2)), 4, 'gains 0 F (rouge)')
top_colors(img_l, (int(85*s2), int(395*s2), int(340*s2), int(430*s2)), 4, 'perdant grisé (gauff)')
top_colors(img_l, (int(120*s2), int(575*s2), int(210*s2), int(625*s2)), 4, 'pick "Oui" gagné (vert)')
print(" [badges & accents]")
top_colors(img_l, (int(870*s2), int(60*s2), int(1020*s2), int(115*s2)), 5, 'badge Perdu (bg+texte)')
top_colors(img_l, (int(58*s2), int(90*s2), int(118*s2), int(145*s2)), 4, 'icône croix rouge')
top_colors(img_l, (int(125*s2), int(90*s2), int(180*s2), int(145*s2)), 3, 'icône trophée (perdu)')
top_colors(img_l, (int(855*s2), int(1330*s2), int(1025*s2), int(1420*s2)), 5, 'pastille jaune (perdu)')

# ─── Crops zoomés pour identification police ───
crops = [
    (img_w, (60, 30, 560, 160), 'header_combine.png', 2),      # "Combiné (2)" + icônes
    (img_w, (860, 230, 1010, 300), 'odds_170.png', 4),         # 1,70 italique
    (img_w, (130, 215, 560, 320), 'pick_market.png', 2),       # nom + Vainqueur du match
    (img_w, (860, 1045, 1020, 1145), 'yellow_badge.png', 3),   # 2,48 jaune
    (img_w, (60, 1030, 560, 1330), 'footer.png', 1),           # Cote totale/Mise/Gains
    (img_w, (60, 375, 1020, 545), 'matchbox.png', 1),          # boîte match complète
    (img_l, (860, 55, 1025, 120), 'badge_perdu.png', 3),       # Perdu badge
    (img_l, (115, 195, 560, 300), 'pick_perdu.png', 2),        # Coco Gauff rouge
    (img_w, (870, 45, 1030, 125), 'badge_gagne.png', 3),       # Gagné badge
]
for im, box, name, zoom in crops:
    c = im.crop(box)
    c = c.resize((c.width*zoom, c.height*zoom), Image.LANCZOS)
    c.save(os.path.join(OUT, name))
print(f"\n✅ Crops sauvegardés dans {OUT}")
