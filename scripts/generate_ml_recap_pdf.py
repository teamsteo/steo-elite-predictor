"""
Génère le PDF "Pipeline ML Steo Elite — Récapitulatif Technique"
Style: Technique sobre (ingénieur) — palette cascade bleu/orange, tableaux denses.
4-5 pages.
"""
import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image,
    PageBreak, KeepTogether, HRFlowable, ListFlowable, ListItem,
)
from reportlab.platypus.flowables import Flowable

# ============================================
# 1. POLICES (ReportLab)
# ============================================
FONT_DIR = '/usr/share/fonts'

# Noto Serif SC pour le corps (rendu propre du français + ponctuation)
pdfmetrics.registerFont(TTFont('NotoSerifSC',
    f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold',
    f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')

# Noto Sans SC pour les titres
pdfmetrics.registerFont(TTFont('NotoSansSC',
    f'{FONT_DIR}/truetype/chinese/SarasaMonoSC-Bold.ttf'))  # fallback
# En fait, pour les titres on utilise Noto Serif SC Bold pour cohérence

# Police monospace pour code
pdfmetrics.registerFont(TTFont('Mono',
    f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
pdfmetrics.registerFont(TTFont('Mono-Bold',
    f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono-Bold.ttf'))
registerFontFamily('Mono', normal='Mono', bold='Mono-Bold')

# ============================================
# 2. PALETTE CASCADE (générée par palette.cascade)
# ============================================
PAGE_BG       = colors.HexColor('#f3f4f4')
SECTION_BG    = colors.HexColor('#eeeff0')
CARD_BG       = colors.HexColor('#e8eaeb')
TABLE_STRIPE  = colors.HexColor('#f0f2f2')
HEADER_FILL   = colors.HexColor('#4d646f')
COVER_BLOCK   = colors.HexColor('#3e5561')
BORDER        = colors.HexColor('#b5bfc4')
ICON          = colors.HexColor('#4281a0')
ACCENT        = colors.HexColor('#2e81ab')
ACCENT_2      = colors.HexColor('#c3765d')
TEXT_PRIMARY  = colors.HexColor('#222526')
TEXT_MUTED    = colors.HexColor('#777e81')
SEM_SUCCESS   = colors.HexColor('#449c62')
SEM_WARNING   = colors.HexColor('#ac8a45')
SEM_ERROR     = colors.HexColor('#9f5852')
SEM_INFO      = colors.HexColor('#456f9a')

# ============================================
# 3. STYLES
# ============================================
styles = getSampleStyleSheet()

H1 = ParagraphStyle('H1', parent=styles['Heading1'],
    fontName='NotoSerifSC-Bold', fontSize=18, leading=22,
    textColor=TEXT_PRIMARY, spaceBefore=8, spaceAfter=12, alignment=TA_LEFT)

H2 = ParagraphStyle('H2', parent=styles['Heading2'],
    fontName='NotoSerifSC-Bold', fontSize=13, leading=17,
    textColor=ACCENT, spaceBefore=14, spaceAfter=6, alignment=TA_LEFT)

H3 = ParagraphStyle('H3', parent=styles['Heading3'],
    fontName='NotoSerifSC-Bold', fontSize=11, leading=14,
    textColor=COVER_BLOCK, spaceBefore=10, spaceAfter=4, alignment=TA_LEFT)

BODY = ParagraphStyle('Body', parent=styles['BodyText'],
    fontName='NotoSerifSC', fontSize=9.5, leading=14,
    textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=6,
    alignment=TA_JUSTIFY, firstLineIndent=0)

BODY_TIGHT = ParagraphStyle('BodyTight', parent=BODY,
    fontSize=9, leading=12, spaceAfter=3)

CAPTION = ParagraphStyle('Caption', parent=BODY,
    fontName='NotoSerifSC', fontSize=8, leading=10,
    textColor=TEXT_MUTED, spaceBefore=2, spaceAfter=10,
    alignment=TA_CENTER)

CODE = ParagraphStyle('Code', parent=BODY,
    fontName='Mono', fontSize=8, leading=11,
    textColor=COVER_BLOCK, spaceBefore=4, spaceAfter=6,
    backColor=CARD_BG, borderColor=BORDER, borderWidth=0.4,
    borderPadding=4, leftIndent=0, rightIndent=0)

# Style pour cellules de tableau (texte court)
TBL_CELL = ParagraphStyle('TblCell', parent=BODY,
    fontName='NotoSerifSC', fontSize=8.5, leading=11,
    textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=0,
    alignment=TA_LEFT)

TBL_CELL_BOLD = ParagraphStyle('TblCellBold', parent=TBL_CELL,
    fontName='NotoSerifSC-Bold')

TBL_CELL_CENTER = ParagraphStyle('TblCellCenter', parent=TBL_CELL,
    alignment=TA_CENTER)

TBL_CELL_NUM = ParagraphStyle('TblCellNum', parent=TBL_CELL,
    fontName='Mono', fontSize=8.5, alignment=TA_CENTER)

TBL_HEADER = ParagraphStyle('TblHeader', parent=TBL_CELL,
    fontName='NotoSerifSC-Bold', fontSize=8.5, leading=11,
    textColor=colors.white, alignment=TA_LEFT)

TBL_HEADER_CENTER = ParagraphStyle('TblHeaderCenter', parent=TBL_HEADER,
    alignment=TA_CENTER)

# ============================================
# 4. HELPERS
# ============================================
def P(text, style=BODY):
    """Paragraph helper"""
    return Paragraph(text, style)

def TC(text, style=TBL_CELL):
    """Table cell helper"""
    return Paragraph(text, style)

def hr(color=BORDER, width=0.6, space=6):
    """Horizontal rule"""
    return HRFlowable(width='100%', thickness=width, color=color,
                      spaceBefore=space, spaceAfter=space)

def styled_table(data, col_widths, header_rows=1, repeat_rows=1):
    """Table avec style cascade standard"""
    t = Table(data, colWidths=col_widths, repeatRows=repeat_rows)
    style_cmds = [
        # Header
        ('BACKGROUND', (0, 0), (-1, header_rows - 1), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, header_rows - 1), colors.white),
        ('FONTNAME', (0, 0), (-1, header_rows - 1), 'NotoSerifSC-Bold'),
        ('FONTSIZE', (0, 0), (-1, header_rows - 1), 8.5),
        # Body
        ('FONTNAME', (0, header_rows), (-1, -1), 'NotoSerifSC'),
        ('FONTSIZE', (0, header_rows), (-1, -1), 8.5),
        ('TEXTCOLOR', (0, header_rows), (-1, -1), TEXT_PRIMARY),
        # Bordures
        ('GRID', (0, 0), (-1, -1), 0.3, BORDER),
        ('LINEBELOW', (0, header_rows - 1), (-1, header_rows - 1), 0.6, COVER_BLOCK),
        # Padding
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        # Alignement vertical centré
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]
    # Zebra striping
    for i in range(header_rows, len(data)):
        if (i - header_rows) % 2 == 1:
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), TABLE_STRIPE))
    t.setStyle(TableStyle(style_cmds))
    return t


# ============================================
# 5. EN-TÊTE / PIED DE PAGE
# ============================================
def header_footer(canvas, doc):
    canvas.saveState()
    page_num = canvas.getPageNumber()
    # En-tête: ligne fine + titre courant
    if page_num > 1:
        canvas.setFont('NotoSerifSC', 7.5)
        canvas.setFillColor(TEXT_MUTED)
        canvas.drawString(20*mm, A4[1] - 12*mm,
            'Pipeline ML Steo Elite — Récapitulatif Technique')
        canvas.drawRightString(A4[0] - 20*mm, A4[1] - 12*mm, 'v13 · 26 juillet 2026')
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.3)
        canvas.line(20*mm, A4[1] - 14*mm, A4[0] - 20*mm, A4[1] - 14*mm)
    # Pied de page: numéro de page
    canvas.setFont('NotoSerifSC', 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawRightString(A4[0] - 20*mm, 12*mm, f'{page_num}')
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.3)
    canvas.line(20*mm, 15*mm, A4[0] - 20*mm, 15*mm)
    canvas.restoreState()


# ============================================
# 6. CONTENU DU DOCUMENT
# ============================================
story = []

# ============================================
# PAGE 1 — Titre + Sommaire exécutif
# ============================================

# Bandeau de titre
title_band_data = [[
    Paragraph(
        '<font name="NotoSerifSC-Bold" size="9" color="#b5bfc4">DOCUMENT INTERNE — INGÉNIERIE ML</font>',
        BODY_TIGHT)
]]
title_band = Table(title_band_data, colWidths=[170*mm])
title_band.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), COVER_BLOCK),
    ('LEFTPADDING', (0, 0), (-1, -1), 12),
    ('RIGHTPADDING', (0, 0), (-1, -1), 12),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
]))
story.append(title_band)
story.append(Spacer(1, 14))

# Titre principal
story.append(P('Pipeline ML Steo Elite', H1))
story.append(P('<font color="#2e81ab">Récapitulatif Technique — Features &amp; Performance par Sport</font>',
    ParagraphStyle('Sub', parent=H2, fontSize=12, textColor=ACCENT, spaceBefore=0, spaceAfter=10)))

# Méta
meta_data = [
    [TC('<b>Version</b>', TBL_CELL_BOLD), TC('v13 (cron v13 — 10 pronostics max, cotes réelles, tennis intégré)'),
     TC('<b>Date</b>', TBL_CELL_BOLD), TC('26 juillet 2026')],
    [TC('<b>Entraînement</b>', TBL_CELL_BOLD), TC('Python 3.12 · XGBoost 2.1+ · GitHub Actions 05:00 UTC'),
     TC('<b>Inférence</b>', TBL_CELL_BOLD), TC('TypeScript · Vercel · 60% heuristique + 40% XGBoost')],
    [TC('<b>Sports couverts</b>', TBL_CELL_BOLD), TC('Football, Basketball, Hockey, Baseball, Tennis'),
     TC('<b>Échantillons</b>', TBL_CELL_BOLD), TC('2 741 matchs (football, calibré)')],
]
meta_table = Table(meta_data, colWidths=[24*mm, 65*mm, 22*mm, 59*mm])
meta_table.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, -1), 'NotoSerifSC'),
    ('FONTSIZE', (0, 0), (-1, -1), 8),
    ('BACKGROUND', (0, 0), (0, -1), TABLE_STRIPE),
    ('BACKGROUND', (2, 0), (2, -1), TABLE_STRIPE),
    ('TEXTCOLOR', (0, 0), (-1, -1), TEXT_PRIMARY),
    ('GRID', (0, 0), (-1, -1), 0.3, BORDER),
    ('LEFTPADDING', (0, 0), (-1, -1), 4),
    ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ('TOPPADDING', (0, 0), (-1, -1), 3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
]))
story.append(meta_table)
story.append(Spacer(1, 18))

# Section 1: Sommaire exécutif
story.append(P('1. Sommaire exécutif', H2))
story.append(hr(ACCENT, 1.5, 2))

story.append(P(
    'Le pipeline ML de Steo Elite combine un entraînement Python hors-ligne (XGBoost 2.1+) '
    'avec une inférence TypeScript sur Vercel. L\'entraînement tourne quotidiennement à 05:00 UTC '
    'via GitHub Actions, persiste les paramètres dans Supabase (<font name="Mono">ml_model.xgboost_params</font> JSONB), '
    'et l\'inférence Vercel applique ces poids sous forme de somme pondérée '
    '(60% heuristiques + 40% XGBoost — Vercel n\'héberge pas de runtime Python). '
    'Cette architecture hybride permet de bénéficier des capacités d\'apprentissage de XGBoost '
    'tout en respectant les contraintes cold-start de Vercel (60s max).', BODY))

story.append(P(
    'Le football est le sport le plus abouti avec <b>77,71% de CV accuracy</b> (5-fold, ±1,74pp), '
    'un <b>edge de +44,37pp</b> par rapport à la baseline aléatoire, et une précision au seuil 0,74 '
    'de <b>99,9%</b>. Le Brier score passe de 0,0376 à <b>0,0137</b> après calibration Platt, '
    'soit une amélioration de 63%. Les autres sports (basketball, hockey, MLB) sont chargés '
    'mais neutralisés par l\'anti-leakage : leurs cotes estimées étant quasi-constantes, '
    'le garde-fou « 3+ features informatives (std &gt; 0,01) » les skip automatiquement.', BODY))

# Tableau chiffres clés
story.append(P('Chiffres clés (dernier run — 25 juillet 2026, version xgb-20260725)', H3))
key_metrics = [
    [TC('Métrique', TBL_HEADER), TC('Football', TBL_HEADER_CENTER), TC('Basketball', TBL_HEADER_CENTER),
     TC('Hockey', TBL_HEADER_CENTER), TC('MLB', TBL_HEADER_CENTER)],
    [TC('Échantillons entraînés'), TC('2 741', TBL_CELL_NUM), TC('408', TBL_CELL_NUM),
     TC('1 400', TBL_CELL_NUM), TC('4 935', TBL_CELL_NUM)],
    [TC('Features informatives'), TC('47', TBL_CELL_NUM), TC('0 (skip)', TBL_CELL_NUM),
     TC('0 (skip)', TBL_CELL_NUM), TC('0 (skip)', TBL_CELL_NUM)],
    [TC('CV accuracy (5-fold)'), TC('<b>77,71%</b> ± 1,74', TBL_CELL_NUM), TC('—', TBL_CELL_NUM),
     TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM)],
    [TC('Edge vs random'), TC('+44,37pp', TBL_CELL_NUM), TC('—', TBL_CELL_NUM),
     TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM)],
    [TC('Seuil de confiance optimal'), TC('0,74', TBL_CELL_NUM), TC('—', TBL_CELL_NUM),
     TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM)],
    [TC('Précision au seuil'), TC('<b>99,9%</b>', TBL_CELL_NUM), TC('—', TBL_CELL_NUM),
     TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM)],
    [TC('Brier (avant → après Platt)'), TC('0,0376 → <b>0,0137</b>', TBL_CELL_NUM), TC('—', TBL_CELL_NUM),
     TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM)],
]
story.append(styled_table(key_metrics, [55*mm, 30*mm, 28*mm, 28*mm, 28*mm]))
story.append(Spacer(1, 8))

story.append(P(
    'Trois axes d\'optimisation ont été récemment ajoutés : '
    '(1) <b>backtest CLV/slippage</b> avec 3 scénarios de glissement (1%, 3%, 5%) et validation '
    'de l\'alignement CLV ; '
    '(2) <b>objectif custom XGBoost natif</b> <font name="Mono">asymmetric_logloss_obj</font> qui '
    'pénalise davantage les erreurs à haute confiance (une erreur à p=0,85 coûte ~3× une erreur à p=0,55) ; '
    '(3) <b>données arbitres</b> depuis football-data.co.uk (73 profils, 6 features injectées). '
    'L\'invariant critique du pipeline : les pronostics LOW confidence sont automatiquement rejetés '
    '(0-3% de win rate historique, vs 100% pour HIGH), ce qui a ajouté <b>+605€ de profit</b> '
    'sur le backtest de 200 paris.', BODY))

story.append(Spacer(1, 12))

# ============================================
# Architecture du pipeline ML
# ============================================
story.append(P('2. Architecture du pipeline ML', H2))
story.append(hr(ACCENT, 1.5, 2))

story.append(P(
    'L\'architecture est scindée en deux temps. Côté entraînement, un script Python '
    '(<font name="Mono">ml/train_xgboost.py</font>, 1 704 LOC) charge les données historiques '
    'depuis Supabase (tables <font name="Mono">predictions</font> et <font name="Mono">matches</font>) '
    'et quatre fichiers CSV locaux (saisons passées), engineerise les features par sport, '
    'entraîne XGBoost avec validation croisée 5-fold stratifiée, applique la calibration Platt, '
    'simule un backtest Monte-Carlo Poisson (10 000 simulations par sport), puis exporte les '
    'paramètres vers Supabase. Côté inférence, le service TypeScript '
    '<font name="Mono">unifiedPredictionService.ts</font> récupère les poids via '
    '<font name="Mono">unifiedMLService.scoreWithXGBoost()</font> et applique une somme pondérée '
    'normalisée (pas de runtime XGBoost natif côté Vercel).', BODY))

story.append(P('Fichiers principaux', H3))
files_data = [
    [TC('Fichier', TBL_HEADER), TC('LOC', TBL_HEADER_CENTER), TC('Rôle', TBL_HEADER)],
    [TC('<font name="Mono">ml/train_xgboost.py</font>'), TC('1 704', TBL_CELL_NUM),
     TC('Pipeline principal — features, entraînement, calibration, backtest, export Supabase')],
    [TC('<font name="Mono">ml/football_data_enricher.py</font>'), TC('889', TBL_CELL_NUM),
     TC('Télécharge CSVs football-data.co.uk → CLV, profils arbitres, proxies tactiques')],
    [TC('<font name="Mono">src/lib/unifiedPredictionService.ts</font>'), TC('630', TBL_CELL_NUM),
     TC('Orchestrateur — fusion 4 sources (marché + Dixon-Coles + contexte + ML)')],
    [TC('<font name="Mono">src/lib/matchContextService.ts</font>'), TC('1 264', TBL_CELL_NUM),
     TC('Agrégateur contexte parallèle — FBref, transfermarkt, NBA, météo, news')],
    [TC('<font name="Mono">src/lib/matchImportanceService.ts</font>'), TC('960', TBL_CELL_NUM),
     TC('Détection enjeu + phase saison + contextSummary (1-2 lignes pour Telegram)')],
    [TC('<font name="Mono">src/lib/adaptiveThresholdsML.ts</font>'), TC('826', TBL_CELL_NUM),
     TC('Hook ML runtime — mélange 60% heuristique + 40% XGBoost, clamp ±15%')],
    [TC('<font name="Mono">src/lib/dixonColesModel.ts</font>'), TC('675', TBL_CELL_NUM),
     TC('Modèle Dixon-Coles (1997) — λ/μ Poisson, ajustement ρ bas-score, decay temporel')],
    [TC('<font name="Mono">src/lib/matchFactorsService.ts</font>'), TC('720', TBL_CELL_NUM),
     TC('5 facteurs capés (anti-bruit) — home advantage, rest days, derby, crowd, referee')],
]
story.append(styled_table(files_data, [70*mm, 18*mm, 82*mm]))
story.append(Spacer(1, 10))

story.append(P('Les cinq piliers d\'enrichissement', H3))
story.append(P(
    'Le pipeline repose sur cinq piliers qui s\'empilent au-dessus des features de base '
    '(cotes, xG, confiance, league one-hot) :', BODY))

pillars_data = [
    [TC('Pilier', TBL_HEADER), TC('Source', TBL_HEADER), TC('Features injectées', TBL_HEADER),
     TC('Statut', TBL_HEADER_CENTER)],
    [TC('<b>1. CLV</b> (Closing Line Value)'), TC('football-data.co.uk CSVs'),
     TC('<font name="Mono">clv_home_team, clv_away_team, clv_diff</font>'), TC('Actif', TBL_CELL_CENTER)],
    [TC('<b>2. Proxy tactique</b>'), TC('football-data.co.uk CSVs'),
     TC('<font name="Mono">shots_ratio, goal_conv, def_compact, tactical_mismatch</font>'),
     TC('Actif', TBL_CELL_CENTER)],
    [TC('<b>3. Arbitres</b>'), TC('football-data.co.uk CSVs'),
     TC('<font name="Mono">referee_severity, cards_pm, home_bias, card_variance, foul_card_ratio, match_tension</font>'),
     TC('Actif', TBL_CELL_CENTER)],
    [TC('<b>4. Calibration</b>'), TC('scikit-learn'),
     TC('Platt Scaling (sigmoid) post-fit via <font name="Mono">CalibratedClassifierCV</font>'),
     TC('Actif', TBL_CELL_CENTER)],
    [TC('<b>5. Monte-Carlo</b>'), TC('scipy (Poisson)'),
     TC('10 000 simulations par sport — λ=xG (foot) ou moyenne (autres)'),
     TC('Actif', TBL_CELL_CENTER)],
]
story.append(styled_table(pillars_data, [40*mm, 35*mm, 75*mm, 20*mm]))
story.append(Spacer(1, 10))

story.append(P('Sources de données d\'entraînement', H3))
story.append(P(
    'Les données historiques proviennent de deux sources fusionnées et dédupliquées par '
    'identifiant de match. La base Supabase contient les pronostics passés avec résultats ; '
    'quatre CSVs locaux apportent des saisons supplémentaires avec features avancées : '
    '<font name="Mono">football_matches.csv</font> (2 741 lignes, xG + cartons + corners + cotes), '
    '<font name="Mono">basketball_matches.csv</font> (408 lignes, q-scores + FG%/3P%/FT% + rebounds), '
    '<font name="Mono">nhl_matches.csv</font> (1 400 lignes, shots + SOG + PPG + PIM), '
    '<font name="Mono">mlb_matches.csv</font> (4 935 lignes, hits + errors + HR + pitcher ERA). '
    'L\'anti-leakage (<font name="Mono">train_xgboost.py</font> lignes 459-467 et 745-754) supprime '
    'les colonnes <font name="Mono">predicted_result, actual_result, pred_*</font> et neutralise les '
    'cotes estimées à 2.0 pour éviter que les cotes dérivées du score final ne fuitent le résultat.', BODY))

story.append(Spacer(1, 14))

# ============================================
# Features ML par sport
# ============================================
story.append(P('3. Features ML par sport', H2))
story.append(hr(ACCENT, 1.5, 2))

story.append(P(
    'Le schéma de features est partagé entre tous les sports : '
    '<font name="Mono">engineer_features()</font> génère le même ensemble de colonnes, '
    'puis <font name="Mono">get_feature_columns()</font> filtre sur les colonnes numériques. '
    'La différenciation par sport se fait via des flags one-hot (<font name="Mono">is_football, '
    'is_basketball, is_hockey, is_baseball, is_tennis</font>) et des colonnes calculées '
    'sport-spécifiques. Les enrichissements (CLV, tactique, arbitres) ne s\'appliquent qu\'au '
    'football car ils proviennent exclusivement de football-data.co.uk.', BODY))

story.append(P('Décompte des features par sport', H3))
features_count = [
    [TC('Groupe', TBL_HEADER), TC('Détail', TBL_HEADER), TC('Foot', TBL_HEADER_CENTER),
     TC('Basket', TBL_HEADER_CENTER), TC('NHL', TBL_HEADER_CENTER), TC('MLB', TBL_HEADER_CENTER)],
    [TC('Cotes'), TC('prob_*, overround, odds_ratio, log_odds_ratio, favorite_strength'), TC('7', TBL_CELL_NUM),
     TC('7', TBL_CELL_NUM), TC('7', TBL_CELL_NUM), TC('7', TBL_CELL_NUM)],
    [TC('xG'), TC('xg_home, xg_away, xg_diff, xg_total'), TC('4', TBL_CELL_NUM),
     TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM)],
    [TC('Confiance'), TC('confidence_numeric, estimated_odds_flag'), TC('2', TBL_CELL_NUM),
     TC('2', TBL_CELL_NUM), TC('2', TBL_CELL_NUM), TC('2', TBL_CELL_NUM)],
    [TC('Flags sport'), TC('is_*, heavy_favorite, underdog_match, draw_signal'), TC('8', TBL_CELL_NUM),
     TC('7', TBL_CELL_NUM), TC('7', TBL_CELL_NUM), TC('7', TBL_CELL_NUM)],
    [TC('League one-hot'), TC('Top-20 ligues + league_rare fallback'), TC('7', TBL_CELL_NUM),
     TC('3', TBL_CELL_NUM), TC('2', TBL_CELL_NUM), TC('2', TBL_CELL_NUM)],
    [TC('Temporel'), TC('day_of_week, month, is_weekend'), TC('3', TBL_CELL_NUM),
     TC('3', TBL_CELL_NUM), TC('3', TBL_CELL_NUM), TC('3', TBL_CELL_NUM)],
    [TC('Interactions'), TC('odds_confidence, favorite_confidence'), TC('2', TBL_CELL_NUM),
     TC('2', TBL_CELL_NUM), TC('2', TBL_CELL_NUM), TC('2', TBL_CELL_NUM)],
    [TC('<b>CLV (Pilier 1)</b>'), TC('clv_home_team, clv_away_team, clv_diff'), TC('3', TBL_CELL_NUM),
     TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM)],
    [TC('<b>Tactique (Pilier 2)</b>'), TC('shots_ratio, goal_conv, def_compact, mismatch (+3 home/away)'),
     TC('7', TBL_CELL_NUM), TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM)],
    [TC('<b>Arbitres (Pilier 3)</b>'), TC('severity, cards_pm, home_bias, variance, foul_card_ratio, tension'),
     TC('6', TBL_CELL_NUM), TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM)],
    [TC('<b>Total</b>'), TC(''), TC('<b>47</b>', TBL_CELL_NUM), TC('<b>26</b>', TBL_CELL_NUM),
     TC('<b>23</b>', TBL_CELL_NUM), TC('<b>23</b>', TBL_CELL_NUM)],
    [TC('Informatives (std &gt; 0,01)'), TC('Après anti-leakage'), TC('<b>47</b>', TBL_CELL_NUM),
     TC('<b>0</b>', TBL_CELL_NUM), TC('<b>0</b>', TBL_CELL_NUM), TC('<b>0</b>', TBL_CELL_NUM)],
    [TC('Modèle entraîné'), TC(''), TC('<b>Oui</b>', TBL_CELL_CENTER), TC('Skip', TBL_CELL_CENTER),
     TC('Skip', TBL_CELL_CENTER), TC('Skip', TBL_CELL_CENTER)],
]
story.append(styled_table(features_count, [33*mm, 70*mm, 17*mm, 17*mm, 17*mm, 17*mm]))
story.append(Spacer(1, 10))

story.append(P('Pourquoi hockey/baseball sont-ils skip ?', H3))
story.append(P(
    'Le problème n\'est pas un manque de données (4 935 matchs MLB, 1 400 matchs NHL) mais '
    'la nature quasi-constante des cotes après anti-leakage. Pour MLB, le marché est extrêmement '
    'efficient : les cotes oscillent dans une fourchette très étroite (1.80-2.20), et la colonne '
    '<font name="Mono">favorite_strength</font> a un écart-type &lt; 0,01. Le garde-fou (3+ features '
    'informatives) déclenche alors un skip propre plutôt que d\'entraîner un modèle dégénéré qui '
    'apprendrait uniquement le biais dominant. Pour le basketball (408 échantillons), le problème '
    'est similaire : les cotes estimées sont neutralisées à 2.0 par l\'anti-leakage, et les features '
    'sport-spécifiques (FG%, rebounds) ne sont pas incluses dans le CSV d\'entraînement unifié. '
    'L\'extension à ces sports nécessiterait soit d\'ajouter un enrichissement spécifique (par '
    'exemple stats avancées basketball-reference), soit de relâcher la neutralisation anti-leakage '
    'pour les sports où le risque de fuite est moindre.', BODY))

story.append(Spacer(1, 14))

# ============================================
# Les 3 axes d'optimisation
# ============================================
story.append(P('4. Trois axes d\'optimisation récents', H2))
story.append(hr(ACCENT, 1.5, 2))

# Axe 1
story.append(P('4.1 Axe 1 — Backtest CLV/slippage', H3))
story.append(P(
    'Le backtest simule un ROI réaliste sous trois scénarios de glissement de cote : '
    '<font name="Mono">optimiste (1%)</font>, <font name="Mono">réaliste (3%)</font>, '
    '<font name="Mono">pessimiste (5%)</font>. Pour chaque scénario, avec une bankroll de départ '
    'de 1 000u et un demi-Kelly plafonné à 10%, le pipeline ne parie que lorsque '
    'proba ≥ seuil_optimal ET edge ≥ 2%. La cote glissée est calculée comme '
    '<font name="Mono">slipped_odds = base_odds × (1 - slippage_rate)</font>. Le suivi inclut '
    'max drawdown, série max de victoires/défaites, et ROI par bucket de confiance '
    '(0,50-0,60 / 0,60-0,70 / 0,70-0,80 / 0,80+). La validation CLV vérifie l\'alignement : '
    'si la CLV d\'une équipe est positive et que notre pari sur cette équipe gagne, c\'est compté '
    'comme une confirmation. Le verdict <font name="Mono">slippage_resistant = true</font> exige '
    'que <font name="Mono">realistic_roi &gt; 0</font> ET <font name="Mono">worst_roi &gt; -20%</font>.', BODY))

# Axe 2
story.append(P('4.2 Axe 2 — Objectif custom XGBoost natif (asymmetric_logloss_obj)', H3))
story.append(P(
    'Pas une simple métrique d\'éval — un véritable <b>objectif custom</b> qui remplace les '
    'gradient/hessian que XGBoost optimise. La fonction pénalise davantage les erreurs à haute '
    'confiance :', BODY))
story.append(P(
    '<font name="Mono">Loss = -[y·log(p) + (1-y)·log(1-p)] + α·conf²·|p-y|</font><br/>'
    '<font name="Mono">avec conf = |2p - 1|   (0 à p=0,5 ; 1 à p∈{0,1})   et α = 0,5</font>', CODE))
story.append(P(
    'Effet : une erreur à p=0,85 coûte environ 3× une erreur à p=0,55. Le modèle custom '
    '<b>remplace</b> le modèle standard uniquement si les trois conditions suivantes sont remplies : '
    '(1) <font name="Mono">false_confident_extreme_custom &lt; false_confident_extreme_orig</font> '
    '(réduction des fausses certitudes extrêmes, p&gt;0,80 mais y=0) ; '
    '(2) <font name="Mono">brier_custom ≤ brier_orig × 1,02</font> (dégradation Brier ≤ 2%) ; '
    '(3) <font name="Mono">acc_custom ≥ acc_orig - 0,01</font> (perte d\'accuracy ≤ 1pp). '
    'Cette signature <font name="Mono">fn(y_true, preds)</font> est compatible XGBoost 2.x '
    'avec un fallback DMatrix pour la rétro-compatibilité.', BODY))

# Axe 3
story.append(P('4.3 Axe 3 — Données arbitres (football-data.co.uk)', H3))
story.append(P(
    '<font name="Mono">football_data_enricher.py</font> télécharge les CSVs gratuits de '
    'football-data.co.uk (22 divisions, 11 pays) et construit deux types de profils : '
    '<b>73 profils arbitres</b> (top 200 retenus, min 10 matchs) avec '
    '<font name="Mono">yellow_per_match, red_per_match, severity_index, severity_normalized</font> '
    '(échelle 0-10), <font name="Mono">home_win_pct, home_advantage_pct</font>, et les nouveaux '
    'champs <font name="Mono">card_std, card_variance, foul_to_card_ratio</font> ; '
    '<b>4 agrégats ligue</b> (SC0, E0, E1, _global) pour appliquer les features arbitres au '
    'niveau ligue même quand l\'arbitre spécifique est inconnu. Six features arbitres sont '
    'injectées dans l\'entraînement football : '
    '<font name="Mono">referee_severity, referee_cards_pm, referee_home_bias, '
    'referee_card_variance, referee_foul_card_ratio, match_tension</font>. '
    'Le mapping des noms de ligue vers les codes football-data.co.uk gère 30+ alias avec '
    'normalisation Unicode (NFKD) pour les accents (« Série A » → « serie a » → code I1).', BODY))

# Snapshot enrichment
story.append(P('Snapshot de l\'enrichissement (26 juillet 2026)', H3))
enrich_data = [
    [TC('Type', TBL_HEADER), TC('Quantité', TBL_HEADER_CENTER), TC('Détail', TBL_HEADER)],
    [TC('Profils arbitres'), TC('73', TBL_CELL_NUM), TC('Top 200 retenus, min 10 matchs arbitrés')],
    [TC('Profils tactiques équipes'), TC('351', TBL_CELL_NUM),
     TC('shots_ratio, goal_conversion, defensive_compactness, win_pct — par équipe')],
    [TC('Entrées CLV par équipe'), TC('118', TBL_CELL_NUM),
     TC('Top 300, min 5 matchs — leaders : Fenerbahce (+0,0163), Porto (+0,0147), Galatasaray (+0,0145)')],
    [TC('Agrégats arbitres ligue'), TC('4', TBL_CELL_NUM),
     TC('SC0 (Scottish), E0 (PL), E1 (Championship), _global (fallback)')],
]
story.append(styled_table(enrich_data, [45*mm, 22*mm, 103*mm]))

story.append(PageBreak())

# ============================================
# PAGE 5 — Performance par sport
# ============================================
story.append(P('5. Performance par sport', H2))
story.append(hr(ACCENT, 1.5, 2))

story.append(P('5.1 Performance globale (dernier run XGBoost)', H3))
perf_global = [
    [TC('Sport', TBL_HEADER), TC('Samples', TBL_HEADER_CENTER), TC('CV Acc', TBL_HEADER_CENTER),
     TC('Edge', TBL_HEADER_CENTER), TC('Seuil', TBL_HEADER_CENTER),
     TC('Précision seuil', TBL_HEADER_CENTER), TC('Brier avant→après', TBL_HEADER_CENTER)],
    [TC('<b>Football</b>'), TC('2 741', TBL_CELL_NUM), TC('<b>77,71%</b>', TBL_CELL_NUM),
     TC('+44,37pp', TBL_CELL_NUM), TC('0,74', TBL_CELL_NUM), TC('99,9%', TBL_CELL_NUM),
     TC('0,0376 → 0,0137', TBL_CELL_NUM)],
    [TC('Basketball'), TC('408', TBL_CELL_NUM), TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM),
     TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM), TC('skip (0 feat.)', TBL_CELL_NUM)],
    [TC('Hockey'), TC('1 400', TBL_CELL_NUM), TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM),
     TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM), TC('skip (0 feat.)', TBL_CELL_NUM)],
    [TC('Baseball'), TC('4 935', TBL_CELL_NUM), TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM),
     TC('—', TBL_CELL_NUM), TC('—', TBL_CELL_NUM), TC('skip (0 feat.)', TBL_CELL_NUM)],
]
story.append(styled_table(perf_global, [22*mm, 22*mm, 22*mm, 22*mm, 18*mm, 28*mm, 36*mm]))
story.append(Spacer(1, 10))

story.append(P('5.2 Performance football par ligue', H3))
league_data = [
    [TC('Ligue', TBL_HEADER), TC('Samples', TBL_HEADER_CENTER), TC('Accuracy', TBL_HEADER_CENTER),
     TC('ROI simulé', TBL_HEADER_CENTER), TC('Recommandation', TBL_HEADER_CENTER)],
    [TC('Premier League'), TC('216', TBL_CELL_NUM), TC('<b>99,07%</b>', TBL_CELL_NUM),
     TC('+42,59%', TBL_CELL_NUM), TC('strong', TBL_CELL_CENTER)],
    [TC('Champions League'), TC('228', TBL_CELL_NUM), TC('97,37%', TBL_CELL_NUM),
     TC('+35,09%', TBL_CELL_NUM), TC('strong', TBL_CELL_CENTER)],
    [TC('La Liga'), TC('532', TBL_CELL_NUM), TC('89,85%', TBL_CELL_NUM),
     TC('+38,72%', TBL_CELL_NUM), TC('strong', TBL_CELL_CENTER)],
    [TC('Ligue 1'), TC('596', TBL_CELL_NUM), TC('89,60%', TBL_CELL_NUM),
     TC('+37,75%', TBL_CELL_NUM), TC('strong', TBL_CELL_CENTER)],
    [TC('Bundesliga'), TC('439', TBL_CELL_NUM), TC('89,52%', TBL_CELL_NUM),
     TC('+34,40%', TBL_CELL_NUM), TC('strong', TBL_CELL_CENTER)],
    [TC('Serie A'), TC('730', TBL_CELL_NUM), TC('87,95%', TBL_CELL_NUM),
     TC('+36,71%', TBL_CELL_NUM), TC('strong', TBL_CELL_CENTER)],
]
story.append(styled_table(league_data, [40*mm, 25*mm, 25*mm, 28*mm, 32*mm]))
story.append(Spacer(1, 14))

# Bar chart
chart_path = '/home/z/my-project/download/ml_perf_chart.png'
if os.path.exists(chart_path):
    story.append(Spacer(1, 8))
    story.append(Image(chart_path, width=160*mm, height=72*mm))
    story.append(P('Figure 1 — Performance par ligue (CV accuracy et ROI simulé)', CAPTION))
    story.append(Spacer(1, 8))

# Top features
story.append(P('5.3 Top 15 features (football)', H3))
top_features = [
    [TC('Rang', TBL_HEADER_CENTER), TC('Feature', TBL_HEADER), TC('Importance', TBL_HEADER_CENTER),
     TC('Groupe', TBL_HEADER)],
    [TC('1', TBL_CELL_NUM), TC('<font name="Mono">log_odds_ratio</font>'), TC('0,148', TBL_CELL_NUM), TC('Cotes')],
    [TC('2', TBL_CELL_NUM), TC('<font name="Mono">odds_ratio</font>'), TC('0,075', TBL_CELL_NUM), TC('Cotes')],
    [TC('3', TBL_CELL_NUM), TC('<font name="Mono">xg_away</font>'), TC('0,067', TBL_CELL_NUM), TC('xG')],
    [TC('4', TBL_CELL_NUM), TC('<font name="Mono">xg_diff</font>'), TC('0,067', TBL_CELL_NUM), TC('xG')],
    [TC('5', TBL_CELL_NUM), TC('<font name="Mono">xg_home</font>'), TC('0,065', TBL_CELL_NUM), TC('xG')],
    [TC('6', TBL_CELL_NUM), TC('<font name="Mono">prob_home</font>'), TC('0,062', TBL_CELL_NUM), TC('Cotes')],
    [TC('7', TBL_CELL_NUM), TC('<font name="Mono">favorite_strength</font>'), TC('0,047', TBL_CELL_NUM), TC('Cotes')],
    [TC('8', TBL_CELL_NUM), TC('<font name="Mono">is_home_favorite</font>'), TC('0,034', TBL_CELL_NUM), TC('Flags')],
    [TC('9', TBL_CELL_NUM), TC('<font name="Mono">prob_draw</font>'), TC('0,032', TBL_CELL_NUM), TC('Cotes')],
    [TC('10', TBL_CELL_NUM), TC('<font name="Mono">odds_home</font>'), TC('0,026', TBL_CELL_NUM), TC('Cotes')],
    [TC('11', TBL_CELL_NUM), TC('<font name="Mono">xg_total</font>'), TC('0,024', TBL_CELL_NUM), TC('xG')],
    [TC('12', TBL_CELL_NUM), TC('<font name="Mono">favorite_confidence</font>'), TC('0,022', TBL_CELL_NUM), TC('Interactions')],
    [TC('13', TBL_CELL_NUM), TC('<font name="Mono">odds_draw</font>'), TC('0,018', TBL_CELL_NUM), TC('Cotes')],
    [TC('14', TBL_CELL_NUM), TC('<font name="Mono">home_goal_conv</font>'), TC('0,017', TBL_CELL_NUM), TC('<b>Pilier 2 — Tactique</b>')],
    [TC('15', TBL_CELL_NUM), TC('<font name="Mono">clv_away_team</font>'), TC('0,017', TBL_CELL_NUM), TC('<b>Pilier 1 — CLV</b>')],
]
story.append(styled_table(top_features, [14*mm, 65*mm, 25*mm, 46*mm]))
story.append(Spacer(1, 8))

story.append(P(
    'À noter la présence aux rangs 14-15 de deux features issues des piliers d\'enrichissement '
    '(<font name="Mono">home_goal_conv</font> et <font name="Mono">clv_away_team</font>), ce qui '
    'valide l\'apport des axes 1 et 2. Les features arbitres (Pilier 3) ont une importance '
    'individuelle plus modeste mais contribuent collectivement à la réduction du Brier score.', BODY))

story.append(Spacer(1, 14))

# ============================================
# Backtest critique & conclusion
# ============================================
story.append(P('5.4 Backtest critique — Pourquoi LOW est auto-rejeté', H3))
story.append(P(
    'Le backtest historique (200 paris à 10u, mars 2026) a révélé une asymétrie critique dans '
    'les taux de réussite par niveau de confiance. Cette asymétrie est l\'invariant le plus '
    'important du pipeline : elle justifie le rejet automatique des pronostics LOW à la fois '
    'dans <font name="Mono">unifiedPredictionService.ts</font> (ligne 506) et dans le cron Telegram '
    '(ligne 1684).', BODY))

backtest_critical = [
    [TC('Sport + Confiance', TBL_HEADER), TC('Paris', TBL_HEADER_CENTER), TC('Victoires', TBL_HEADER_CENTER),
     TC('Win rate', TBL_HEADER_CENTER), TC('Profit', TBL_HEADER_CENTER)],
    [TC('Football — LOW'), TC('59', TBL_CELL_NUM), TC('2', TBL_CELL_NUM),
     TC('<font color="#9f5852"><b>3%</b></font>', TBL_CELL_NUM), TC('-524u', TBL_CELL_NUM)],
    [TC('Football — HIGH'), TC('21', TBL_CELL_NUM), TC('21', TBL_CELL_NUM),
     TC('<font color="#449c62"><b>100%</b></font>', TBL_CELL_NUM), TC('+128u', TBL_CELL_NUM)],
    [TC('Basketball — LOW'), TC('47', TBL_CELL_NUM), TC('0', TBL_CELL_NUM),
     TC('<font color="#9f5852"><b>0%</b></font>', TBL_CELL_NUM), TC('-470u', TBL_CELL_NUM)],
    [TC('Basketball — HIGH'), TC('39', TBL_CELL_NUM), TC('39', TBL_CELL_NUM),
     TC('<font color="#449c62"><b>100%</b></font>', TBL_CELL_NUM), TC('+200u', TBL_CELL_NUM)],
]
story.append(styled_table(backtest_critical, [50*mm, 22*mm, 25*mm, 30*mm, 25*mm]))
story.append(Spacer(1, 8))

story.append(P(
    'Impact du filtrage LOW (backtest-filter, 21 mars 2026) : passage de 200 à 134 paris, '
    '135 → 133 victoires, profit <b>+550u → +1 156u</b> (+605€ additionnels), ROI <b>+28% → +86%</b>. '
    'Le pipeline applique désormais un triple filtre : '
    '(1) exclusion des cotes estimées ; '
    '(2) exclusion des pronostics risque &gt; 40% (paramètre <font name="Mono">TIGHT_MAX_RISK</font>) ; '
    '(3) exclusion des probabilités &lt; 56% (<font name="Mono">MIN_WIN_PROBABILITY</font>) ; '
    '(4) plafond à 10 pronostics/jour et max 4 par sport.', BODY))

story.append(P('5.5 Patterns football découverts', H3))
patterns_data = [
    [TC('Pattern', TBL_HEADER), TC('Condition', TBL_HEADER), TC('Samples', TBL_HEADER_CENTER),
     TC('Succès', TBL_HEADER_CENTER), TC('Confiance', TBL_HEADER_CENTER)],
    [TC('<font name="Mono">home_favorite_low</font>'), TC('cotes &lt; 1.5 → victoire domicile'), TC('40', TBL_CELL_NUM),
     TC('88%', TBL_CELL_NUM), TC('—', TBL_CELL_NUM)],
    [TC('<font name="Mono">xg_differential</font>'), TC('|xg_diff| &gt; 0.5 → favori xG gagne'), TC('540', TBL_CELL_NUM),
     TC('<b>93%</b>', TBL_CELL_NUM), TC('0,9', TBL_CELL_NUM)],
    [TC('<font name="Mono">over_xg_threshold</font>'), TC('xG total &gt; 2.8 → Over 2.5'), TC('567', TBL_CELL_NUM),
     TC('84%', TBL_CELL_NUM), TC('—', TBL_CELL_NUM)],
    [TC('<font name="Mono">under_xg_threshold</font>'), TC('xG total &lt; 2.2 → Under 2.5'), TC('115', TBL_CELL_NUM),
     TC('<b>100%</b>', TBL_CELL_NUM), TC('—', TBL_CELL_NUM)],
]
story.append(styled_table(patterns_data, [42*mm, 60*mm, 22*mm, 22*mm, 24*mm]))

story.append(Spacer(1, 18))

# ============================================
# 6. CONCLUSION
# ============================================
story.append(P('6. Conclusion &amp; limites connues', H2))
story.append(hr(ACCENT, 1.5, 2))

story.append(P('Forces du pipeline', H3))
story.append(P(
    'Le pipeline ML présente plusieurs forces notables. La calibration Platt est particulièrement '
    'efficace sur le football : le Brier score passe de 0,0376 à 0,0137, soit une amélioration '
    'de 63%, et les bins de fiabilité post-calibration suivent très étroitement les taux réels. '
    'L\'anti-leakage est robuste : il supprime explicitement les colonnes '
    '<font name="Mono">predicted_result, actual_result, pred_*</font> et neutralise les cotes '
    'estimées à 2.0, ce qui empêche le modèle d\'apprendre le résultat à partir de features dérivées '
    'du score final. Le pipeline async du contexte match est optimisé : '
    '<font name="Mono">matchContextService.ts</font> fetch 5 sources en parallèle via '
    '<font name="Mono">Promise.all</font> (blessures, FBref/NBA, météo, news, teamNews) avec cache '
    '30 minutes en mémoire, ce qui maintient le cold-start Vercel sous 60s. Enfin, l\'architecture '
    'hybride Python training + TS inference est pragmatique : XGBoost tourne hors Vercel pour '
    'profiter de la lib native, et l\'inférence applique les poids en TS pur sans dépendance runtime.', BODY))

story.append(P('Limites identifiées', H3))
limits_data = [
    [TC('Limite', TBL_HEADER), TC('Impact', TBL_HEADER), TC('Piste d\'amélioration', TBL_HEADER)],
    [TC('Basketball/Hockey/MLB : 0 features informatives'),
     TC('Skip automatique — modèles non entraînés'),
     TC('Enrichissement spécifique par sport (basketball-reference pour NBA, etc.)')],
    [TC('Standings non disponibles dans fbrefScraper'),
     TC('Enjeu dynamique générique (fallback sur type de compétition seulement)'),
     TC('Intégrer football-data.co.uk CSVs de classements, ou API standings dédiée')],
    [TC('Enrichissement referee football-only'),
     TC('Pas de features arbitres pour autres sports'),
     TC('Étendre à NBA refs (basketball-reference) et NHL refs (hockeyrefs.com)')],
    [TC('ScoreWithXGBoost simulé côté TS (somme pondérée)'),
     TC('Perte de fidélité vs XGBoost natif (pas de arbres)'),
     TC('Edge function Vercel Python, ou ONNX runtime pour inférence fidèle')],
    [TC('Cache context 30 min en mémoire'),
     TC('Perdu à chaque cold-start Vercel'),
     TC('Migration cache vers Redis (Upstash) pour persistance multi-instances')],
]
story.append(styled_table(limits_data, [50*mm, 45*mm, 75*mm]))
story.append(Spacer(1, 10))

story.append(P('Perspectives', H3))
story.append(P(
    'Trois pistes sont prioritaires. Premièrement, l\'ajout d\'une source de standings '
    '(classements) permettrait d\'activer <font name="Mono">calculateDynamicStake()</font> '
    'qui détecte les « matches à 6 points » (deux équipes en zone de relégation), les matches '
    'de titre (top 2), et les qualifyings européens — actuellement l\'enjeu retombe sur '
    '<font name="Mono">getStakeFromBase()</font> qui ne connaît que le type de compétition. '
    'Deuxièmement, l\'intégration de features LLM (résumé d\'actualité via '
    '<font name="Mono">z-ai-web-dev-sdk</font>) pourrait remplacer le keyword-matching du '
    '<font name="Mono">teamNewsService</font> par une analyse sémantique plus fine des '
    'news coach/conflit/blessure. Troisièmement, l\'extension de l\'enrichissement referee aux '
    'autres sports (NBA, NHL) permettrait de sortir basketball et hockey du statut « skip » '
    'et de réactiver leurs modèles.', BODY))


# ============================================
# 7. BUILD
# ============================================
output_path = '/home/z/my-project/download/pipeline_ml_recap.pdf'

doc = SimpleDocTemplate(
    output_path,
    pagesize=A4,
    leftMargin=20*mm,
    rightMargin=20*mm,
    topMargin=20*mm,
    bottomMargin=20*mm,
    title='Pipeline ML Steo Elite — Récapitulatif Technique',
    author='Z.ai',
    subject='Récapitulatif technique des fonctionnalités et performances du pipeline ML',
    creator='Z.ai PDF Skill (ReportLab)',
)

doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)

print(f'✅ PDF generated: {output_path}')
print(f'   Size: {os.path.getsize(output_path) / 1024:.1f} KB')
