"""
Génère le bar chart comparatif des performances par ligue (football).
Style sobre, palette cascade, police Noto Sans SC pour accents français.
"""
import matplotlib.font_manager as fm
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')

import matplotlib.pyplot as plt
import numpy as np

# Le français n'utilise pas de CJK, DejaVu Sans suffit amplement
plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# Palette cascade (identique au PDF)
ACCENT       = '#2e81ab'   # XS — série principale
ACCENT_2     = '#c3765d'   # XS — série secondaire
TEXT_PRIMARY = '#222526'
TEXT_MUTED   = '#777e81'
BORDER       = '#b5bfc4'
PAGE_BG      = '#f3f4f4'

# Données (depuis ml/last_training_result.json + data/ml-training-report.json)
leagues = ['Premier\nLeague', 'Champions\nLeague', 'Bundesliga', 'La Liga', 'Ligue 1', 'Serie A']
accuracy = [99.07, 97.37, 89.52, 89.85, 89.60, 87.95]
roi = [42.59, 35.09, 34.40, 38.72, 37.75, 36.71]

x = np.arange(len(leagues))
width = 0.38

fig, ax1 = plt.subplots(figsize=(9.0, 4.2), constrained_layout=True)

# Bar 1: Accuracy
bars1 = ax1.bar(x - width/2, accuracy, width, label='Accuracy (%)',
                color=ACCENT, edgecolor='white', linewidth=0.6)
# Bar 2: ROI
ax2 = ax1.twinx()
bars2 = ax2.bar(x + width/2, roi, width, label='ROI simulé (%)',
                color=ACCENT_2, edgecolor='white', linewidth=0.6)

# Axes
ax1.set_ylim(80, 105)
ax2.set_ylim(25, 50)
ax1.set_xticks(x)
ax1.set_xticklabels(leagues, fontsize=9, color=TEXT_PRIMARY)
ax1.set_ylabel('Accuracy CV (%)', fontsize=10, color=TEXT_PRIMARY, fontweight='medium')
ax2.set_ylabel('ROI simulé (%)', fontsize=10, color=TEXT_PRIMARY, fontweight='medium')

# Couleur des axes / spines
for spine in ax1.spines.values():
    spine.set_color(BORDER)
    spine.set_linewidth(0.6)
for spine in ax2.spines.values():
    spine.set_color(BORDER)
    spine.set_linewidth(0.6)
ax1.tick_params(axis='y', colors=TEXT_MUTED, labelsize=8)
ax2.tick_params(axis='y', colors=TEXT_MUTED, labelsize=8)
ax1.tick_params(axis='x', colors=TEXT_PRIMARY, labelsize=9)
ax1.grid(axis='y', color=BORDER, alpha=0.35, linewidth=0.5, linestyle='--')
ax1.set_axisbelow(True)

# Valeurs au-dessus des barres
for b, v in zip(bars1, accuracy):
    ax1.text(b.get_x() + b.get_width()/2, v + 0.4, f'{v:.1f}',
             ha='center', va='bottom', fontsize=8, color=TEXT_PRIMARY, fontweight='medium')
for b, v in zip(bars2, roi):
    ax2.text(b.get_x() + b.get_width()/2, v + 0.4, f'+{v:.1f}',
             ha='center', va='bottom', fontsize=8, color=TEXT_PRIMARY, fontweight='medium')

# Légende combinée
lines1, labels1 = ax1.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax1.legend(lines1 + lines2, labels1 + labels2,
           loc='upper right', frameon=False, fontsize=9,
           labelcolor=TEXT_PRIMARY)

# Titre sobre
ax1.set_title('Performance par ligue — Football (CV accuracy & ROI simulé)',
              fontsize=11, color=TEXT_PRIMARY, pad=12, fontweight='medium', loc='left')

# Fond
fig.patch.set_facecolor('white')
ax1.set_facecolor('white')

# Sauvegarde
out = '/home/z/my-project/download/ml_perf_chart.png'
plt.savefig(out, dpi=180, facecolor='white')
print(f'✅ Chart saved: {out}')
