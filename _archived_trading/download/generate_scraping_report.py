#!/usr/bin/env python3
"""
Report on Web Scraping Issues and Free Sports API Alternatives
"""

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.lib.units import cm
import os

# Register fonts
pdfmetrics.registerFont(TTFont('SimHei', '/usr/share/fonts/truetype/chinese/SimHei.ttf'))
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
registerFontFamily('SimHei', normal='SimHei', bold='SimHei')
registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')

# Create document
output_path = '/home/z/my-project/download/scraping_analysis_report.pdf'
doc = SimpleDocTemplate(
    output_path,
    pagesize=A4,
    title='scraping_analysis_report',
    author='Z.ai',
    creator='Z.ai',
    subject='Analyse des problemes de web scraping et alternatives gratuites pour APIs sportives'
)

# Styles
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    name='Title',
    fontName='Times New Roman',
    fontSize=24,
    leading=30,
    alignment=TA_CENTER,
    spaceAfter=20
)

subtitle_style = ParagraphStyle(
    name='Subtitle',
    fontName='Times New Roman',
    fontSize=14,
    leading=20,
    alignment=TA_CENTER,
    spaceAfter=30
)

heading1_style = ParagraphStyle(
    name='Heading1',
    fontName='Times New Roman',
    fontSize=16,
    leading=22,
    alignment=TA_LEFT,
    spaceBefore=20,
    spaceAfter=12
)

heading2_style = ParagraphStyle(
    name='Heading2',
    fontName='Times New Roman',
    fontSize=13,
    leading=18,
    alignment=TA_LEFT,
    spaceBefore=15,
    spaceAfter=8
)

body_style = ParagraphStyle(
    name='Body',
    fontName='Times New Roman',
    fontSize=11,
    leading=16,
    alignment=TA_JUSTIFY,
    spaceAfter=10
)

bullet_style = ParagraphStyle(
    name='Bullet',
    fontName='Times New Roman',
    fontSize=11,
    leading=16,
    alignment=TA_LEFT,
    leftIndent=20,
    spaceAfter=6
)

code_style = ParagraphStyle(
    name='Code',
    fontName='Times New Roman',
    fontSize=10,
    leading=14,
    alignment=TA_LEFT,
    leftIndent=20,
    backColor=colors.HexColor('#f5f5f5'),
    spaceAfter=10
)

# Table styles
header_style = ParagraphStyle(
    name='TableHeader',
    fontName='Times New Roman',
    fontSize=10,
    textColor=colors.white,
    alignment=TA_CENTER
)

cell_style = ParagraphStyle(
    name='TableCell',
    fontName='Times New Roman',
    fontSize=9,
    alignment=TA_LEFT
)

story = []

# Title
story.append(Paragraph('<b>Analyse des Problemes de Web Scraping</b>', title_style))
story.append(Paragraph('Alternatives Gratuites pour les APIs Sportives', subtitle_style))
story.append(Spacer(1, 20))

# Section 1: Why Scraping Stopped Working
story.append(Paragraph('<b>1. Pourquoi les Scrapers ne Fonctionnent Plus</b>', heading1_style))

story.append(Paragraph(
    "Les sites web sportifs comme FBref, Transfermarkt et d'autres sources de donnees sportives ont mis en place "
    "des protections de plus en plus sophistiquees contre le scraping automatise. Ce phenomene n'est pas une coincidence "
    "mais le resultat d'une evolution technologique majeure dans la protection des contenus web. Comprendre ces "
    "mecanismes est essentiel pour apprecier pourquoi les solutions basees sur le scraping sont devenues non fiables "
    "et pourquoi il est necessaire d'adopter des approches differentes pour obtenir des donnees sportives de qualite.",
    body_style
))

story.append(Paragraph('<b>1.1 Protections Anti-Bot Modernes</b>', heading2_style))

story.append(Paragraph(
    "<b>Cloudflare et Services Similaires:</b> La majorite des sites sportifs populaires utilisent desormais Cloudflare "
    "ou des services equivalents pour detecter et bloquer les requetes automatisees. Ces systemes analysent le comportement "
    "des visiteurs en temps reel et utilisent des techniques avancees pour distinguer les humains des robots. Le resultat "
    "est que les scrapers traditionnels sont systematiquement bloques, meme s'ils utilisent des techniques de rotation "
    "d'adresses IP ou de simulation de navigateur. Cloudflare utilise notamment le challenge JavaScript Turnstile qui "
    "necessite une interaction humaine pour resoudre des puzzles cryptographiques invisibles, rendant le scraping "
    "virtuellement impossible sans infrastructure couteuse.",
    body_style
))

story.append(Paragraph(
    "<b>Rate Limiting (Limitation de Debit):</b> Les serveurs des sites sportifs limitent strictement le nombre de "
    "requetes par adresse IP et par periode de temps. Un scraper qui tente d'acceder a plusieurs pages rapidement "
    "se voit bloque automatiquement. Cette protection est particulierement efficace contre les scrapers agressifs "
    "qui tentent de recuperer de grandes quantites de donnees en peu de temps. Les limites sont souvent configurees "
    "pour permettre un usage humain normal tout en bloquant les comportements suspects.",
    body_style
))

story.append(Paragraph(
    "<b>Detention Comportementale:</b> Les systemes modernes analysent les patterns de navigation pour identifier "
    "les comportements robotiques. Un scraper qui accede systematiquement aux memes pages, qui ne charge pas les images, "
    "ou qui n'execute pas JavaScript est facilement identifiable. Ces systemes utilisent l'apprentissage automatique "
    "pour detecter les patterns suspects avec une precision croissante, rendant meme les scrapers sophistiques "
    "vulnerables a la detection.",
    body_style
))

story.append(Paragraph('<b>1.2 Changements de Structure HTML</b>', heading2_style))

story.append(Paragraph(
    "Les sites web mettent frequemment a jour leur structure HTML, ce qui casse les selecteurs CSS et XPath utilises "
    "par les scrapers. FBref par exemple change regulierement ses classes CSS et la structure de ses tableaux de donnees. "
    "Transfermarkt modifie periodiquement l'organisation de ses pages de joueurs et d'equipes. Ces changements sont "
    "souvent faits intentionnellement pour perturber les scrapers, meme si les sites pretendent que c'est pour ameliorer "
    "l'experience utilisateur. Un scraper fonctionnel peut donc devenir inoperable du jour au lendemain sans aucun "
    "changement de votre cote.",
    body_style
))

story.append(Paragraph('<b>1.3 Limitations de Vercel Serverless</b>', heading2_style))

story.append(Paragraph(
    "Votre application est deployee sur Vercel avec des fonctions serverless qui presentent des limitations specifiques "
    "pour le scraping web. Ces contraintes architecturales rendent le scraping particulierement difficile dans cet "
    "environnement. La duree d'execution maximale est de 10 secondes pour le plan gratuit et 60 secondes pour les plans "
    "payants, ce qui est souvent insuffisant pour charger des pages protegees. L'absence de navigateur headless natif "
    "signifie que l'execution JavaScript est impossible, empechant le chargement de contenu dynamique. Les fonctions "
    "serverless n'ont pas d'adresse IP persistante, ce qui peut declencher des protections geo-ip. Enfin, le User-Agent "
    "par defaut de Vercel est facilement identifiable comme automatique par les systemes de protection.",
    body_style
))

story.append(Paragraph('<b>1.4 Pourquoi Soudainement en Panne</b>', heading2_style))

story.append(Paragraph(
    "Ce n'est pas de la magie noire mais le resultat d'une convergence de facteurs techniques qui ont rendu votre "
    "solution obsolete. Les sites sportifs ont considerablement renforce leurs protections au cours des derniers mois, "
    "particulierement apres avoir constate l'augmentation du trafic automatise. Cloudflare a deploye de nouvelles "
    "versions de son systeme de protection, plus agressives et plus difficiles a contourner. Les sites ont egalement "
    "adopte le rendu JavaScript cote client, ce qui signifie que les donnees ne sont plus presentes dans le HTML "
    "initial mais chargees dynamiquement, necessitant un navigateur complet pour y acceder.",
    body_style
))

story.append(PageBreak())

# Section 2: Free Alternatives
story.append(Paragraph('<b>2. Alternatives Gratuites pour les Donnees Sportives</b>', heading1_style))

story.append(Paragraph(
    "Heureusement, il existe plusieurs APIs sportives gratuites qui offrent des donnees fiables sans necessiter "
    "de web scraping. Ces solutions sont plus stables, plus rapides et legalement conformes. Voici les meilleures "
    "options disponibles pour votre application de pronostics sportifs, avec une analyse detaillee de leurs capacites "
    "et limitations.",
    body_style
))

story.append(Paragraph('<b>2.1 TheSportsDB (Recommande - 100% Gratuit)</b>', heading2_style))

story.append(Paragraph(
    "<b>Site:</b> https://www.thesportsdb.com/ - Cette API communautaire represente l'une des meilleures options "
    "pour une utilisation totalement gratuite. Les donnees sont generees et maintenues par une communaute active de "
    "contributeurs passionnes de sport.",
    body_style
))

story.append(Paragraph('<b>Caracteristiques principales:</b>', body_style))
story.append(Paragraph("- Aucune inscription requise pour l'utilisation de base", bullet_style))
story.append(Paragraph("- Couvre 60+ sports differents dont football, basketball, tennis", bullet_style))
story.append(Paragraph("- Resultats en direct et calendriers de matchs mis a jour en temps reel", bullet_style))
story.append(Paragraph("- Statistiques d'equipes et de joueurs avec historique", bullet_style))
story.append(Paragraph("- Images et logos d'equipes disponibles gratuitement", bullet_style))

story.append(Paragraph(
    "<b>Limites:</b> L'API gratuite permet environ 100 requetes par heure, ce qui peut etre etendu en contribuant "
    "a la base de donnees. Les donnees sont communautaires et peuvent parfois manquer de precision sur les details "
    "mineurs, mais restent excellentes pour les pronostics generaux.",
    body_style
))

story.append(Paragraph('<b>2.2 API-Football (Freemium - Generoux)</b>', heading2_style))

story.append(Paragraph(
    "<b>Site:</b> https://www.api-football.com/ - Cette API specialisee dans le football offre l'un des plans "
    "gratuits les plus generieux du marche, avec des donnees extremement detaillees.",
    body_style
))

story.append(Paragraph('<b>Plan gratuit:</b>', body_style))
story.append(Paragraph("- 100 requetes par jour gratuitement", bullet_style))
story.append(Paragraph("- Statistiques detaillees des matchs avec plus de 200 metriques", bullet_style))
story.append(Paragraph("- Informations sur les blessures et suspensions", bullet_style))
story.append(Paragraph("- Forme recente des equipes sur les 5 derniers matchs", bullet_style))
story.append(Paragraph("- Cotes des bookmakers integrees", bullet_style))
story.append(Paragraph("- Historique des confrontations directes (H2H)", bullet_style))

story.append(Paragraph(
    "<b>Avantage majeur:</b> Les donnees de blessures et la forme recente sont exactement ce dont vous avez besoin "
    "pour vos pronostics. L'API couvre plus de 1000 ligues dans le monde, des championnats majeurs aux ligues regionales. "
    "La qualite des donnees est professionnelle, comparable aux services payants.",
    body_style
))

story.append(Paragraph('<b>2.3 Basketball-Reference API Non Officielle</b>', heading2_style))

story.append(Paragraph(
    "<b>Acces:</b> Via endpoints non officiels ou scraping autorise - Basketball-Reference est une reference mondiale "
    "pour les statistiques NBA et basketball international.",
    body_style
))

story.append(Paragraph('<b>Donnees disponibles:</b>', body_style))
story.append(Paragraph("- Statistiques complete NBA, WNBA, G-League", bullet_style))
story.append(Paragraph("- Statistiques des joueurs avec historique de carriere", bullet_style))
story.append(Paragraph("- Rapports de blessures quotidiens", bullet_style))
story.append(Paragraph("- Statistiques avancees (PER, WS, BPM, VORP)", bullet_style))
story.append(Paragraph("- Calendriers et resultats en temps reel", bullet_style))

story.append(Paragraph(
    "<b>Note:</b> Bien que non officielle, cette approche est toleree pour un usage raisonnable. Il existe des "
    "wrappers Python et JavaScript qui facilitent l'acces aux donnees de maniere structuree.",
    body_style
))

story.append(Paragraph('<b>2.4 Football-Data.org (Gratuit)</b>', heading2_style))

story.append(Paragraph(
    "<b>Site:</b> https://www.football-data.org/ - API europeenne concentree sur les grandes ligues de football "
    "europeennes avec des donnees de haute qualite.",
    body_style
))

story.append(Paragraph('<b>Offre gratuite:</b>', body_style))
story.append(Paragraph("- 12 competitions europeennes couvertes", bullet_style))
story.append(Paragraph("- 10 requetes par minute", bullet_style))
story.append(Paragraph("- Donnees de matchs en direct", bullet_style))
story.append(Paragraph("- Classements et statistiques d'equipes", bullet_style))

story.append(Paragraph('<b>2.5 OpenLigaDB (Gratuit - Sans Inscription)</b>', heading2_style))

story.append(Paragraph(
    "<b>Site:</b> https://www.openligadb.de/ - Service allemand totalement gratuit sans inscription pour les "
    "donnees sportives.",
    body_style
))

story.append(Paragraph('<b>Caracteristiques:</b>', body_style))
story.append(Paragraph("- Aucune inscription ni cle API necessaire", bullet_style))
story.append(Paragraph("- Football allemand (Bundesliga) en detail", bullet_style))
story.append(Paragraph("- Autres sports: basketball, handball, football americain", bullet_style))
story.append(Paragraph("- Resultats et calendriers en temps reel", bullet_style))

story.append(PageBreak())

# Section 3: Comparison Table
story.append(Paragraph('<b>3. Tableau Comparatif des APIs Gratuites</b>', heading1_style))

# Table data
table_data = [
    [Paragraph('<b>API</b>', header_style), 
     Paragraph('<b>Limite Gratuite</b>', header_style), 
     Paragraph('<b>Football</b>', header_style), 
     Paragraph('<b>Basketball</b>', header_style), 
     Paragraph('<b>Blessures</b>', header_style),
     Paragraph('<b>Inscription</b>', header_style)],
    [Paragraph('TheSportsDB', cell_style), 
     Paragraph('100 req/h', cell_style), 
     Paragraph('Oui', cell_style), 
     Paragraph('Oui', cell_style), 
     Paragraph('Limite', cell_style),
     Paragraph('Non', cell_style)],
    [Paragraph('API-Football', cell_style), 
     Paragraph('100 req/jour', cell_style), 
     Paragraph('Excellent', cell_style), 
     Paragraph('Non', cell_style), 
     Paragraph('Oui', cell_style),
     Paragraph('Oui', cell_style)],
    [Paragraph('Football-Data', cell_style), 
     Paragraph('10 req/min', cell_style), 
     Paragraph('Oui', cell_style), 
     Paragraph('Non', cell_style), 
     Paragraph('Non', cell_style),
     Paragraph('Oui', cell_style)],
    [Paragraph('OpenLigaDB', cell_style), 
     Paragraph('Illimite', cell_style), 
     Paragraph('Oui', cell_style), 
     Paragraph('Oui', cell_style), 
     Paragraph('Non', cell_style),
     Paragraph('Non', cell_style)],
    [Paragraph('Balldontlie (NBA)', cell_style), 
     Paragraph('60 req/min', cell_style), 
     Paragraph('Non', cell_style), 
     Paragraph('Excellent', cell_style), 
     Paragraph('Oui', cell_style),
     Paragraph('Oui', cell_style)],
]

table = Table(table_data, colWidths=[2.5*cm, 2.5*cm, 2*cm, 2*cm, 2*cm, 2.2*cm])
table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('BACKGROUND', (0, 1), (-1, 1), colors.white),
    ('BACKGROUND', (0, 2), (-1, 2), colors.HexColor('#F5F5F5')),
    ('BACKGROUND', (0, 3), (-1, 3), colors.white),
    ('BACKGROUND', (0, 4), (-1, 4), colors.HexColor('#F5F5F5')),
    ('BACKGROUND', (0, 5), (-1, 5), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
]))

story.append(Spacer(1, 18))
story.append(table)
story.append(Spacer(1, 6))
story.append(Paragraph('<i>Tableau 1: Comparaison des APIs sportives gratuites</i>', 
    ParagraphStyle('Caption', fontName='Times New Roman', fontSize=9, alignment=TA_CENTER)))
story.append(Spacer(1, 18))

# Section 4: Recommended Implementation
story.append(Paragraph('<b>4. Implementation Recommandee</b>', heading1_style))

story.append(Paragraph(
    "Pour votre application de pronostics sportifs, je recommande une approche hybride qui combine plusieurs "
    "sources pour maximiser la couverture et la fiabilite des donnees. Cette strategie permet de compenser les "
    "limitations de chaque API individuelle tout en maintenant une architecture robuste et maintenable.",
    body_style
))

story.append(Paragraph('<b>4.1 Architecture Proposee</b>', heading2_style))

story.append(Paragraph(
    "<b>Source Principale - Football:</b> API-Football pour les donnees de football europeen, en particulier "
    "pour les blessures, la forme recente et les statistiques detaillees. Cette API offre les donnees les plus "
    "completes pour le football et inclut precisement les informations de blessures que vous recherchez.",
    body_style
))

story.append(Paragraph(
    "<b>Source Principale - Basketball:</b> Balldontlie API (https://www.balldontlie.io/) pour les donnees NBA, "
    "avec les statistiques de joueurs, les blessures et les resultats en temps reel. Cette API est gratuite, bien "
    "documentee et specialement concue pour le basketball.",
    body_style
))

story.append(Paragraph(
    "<b>Source Secondaire:</b> TheSportsDB pour les sports supplementaires et comme fallback en cas d'indisponibilite "
    "des sources principales. L'absence d'inscription requise en fait une excellente solution de secours.",
    body_style
))

story.append(Paragraph('<b>4.2 Gestion du Cache</b>', heading2_style))

story.append(Paragraph(
    "Implementez un systeme de cache cote serveur pour optimiser l'utilisation des quotas gratuits. Les donnees "
    "de blessures peuvent etre mises en cache pendant 1-2 heures, les statistiques d'equipes pendant 6-12 heures, "
    "et les calendriers de matchs pendant 24 heures. Cette strategie permet de reduire considerablement le nombre "
    "de requetes API necessaires tout en maintenant des donnees fraiches.",
    body_style
))

story.append(Paragraph('<b>4.3 Exemple de Code</b>', heading2_style))

story.append(Paragraph(
    "Voici un exemple d'implementation pour recuperer les donnees de forme et blessures depuis API-Football. "
    "Ce code illustre comment combiner plusieurs endpoints pour obtenir une vue complete des informations "
    "necessaires aux pronostics.",
    body_style
))

code_example = """
// API-Football - Forme recente et blessures
const FOOTBALL_API_KEY = 'VOTRE_CLE_API';

// Forme recente d'une equipe
const teamForm = await fetch(
  'https://api-football-v1.p.rapidapi.com/v3/teams/statistics?
   league=39&season=2024&team=42',
  { headers: { 'X-RapidAPI-Key': FOOTBALL_API_KEY } }
);

// Blessures actuelles
const injuries = await fetch(
  'https://api-football-v1.p.rapidapi.com/v3/injuries?
   league=39&season=2024',
  { headers: { 'X-RapidAPI-Key': FOOTBALL_API_KEY } }
);
"""

story.append(Paragraph(code_example.replace('\n', '<br/>'), code_style))

# Section 5: Conclusion
story.append(Paragraph('<b>5. Conclusion et Prochaines Etapes</b>', heading1_style))

story.append(Paragraph(
    "Les problemes rencontres avec vos scrapers ne sont pas dus a une erreur de votre cote mais a l'evolution "
    "inevitable des protections web. Les sites sportifs investissent massivement dans la protection de leurs donnees, "
    "rendant le scraping de plus en plus difficile et peu fiable. La solution durable est d'utiliser des APIs "
    "officielles gratuites qui offrent des donnees structurees et fiables.",
    body_style
))

story.append(Paragraph(
    "Je recommande fortement de migrer vers API-Football pour les donnees football et Balldontlie pour le "
    "basketball. Ces APIs offrent gratuitement les donnees de forme et blessures que vous recherchiez, avec une "
    "fiabilite bien superieure au scraping. L'implementation peut etre faite progressivement, en commencant par "
    "les competitions les plus importantes et en etendant progressivement la couverture.",
    body_style
))

story.append(Paragraph(
    "La transition vers des APIs officielles represente un investissement initial en temps de developpement, "
    "mais garantit une stabilite a long terme de votre application de pronostics. Les donnees seront plus fraiches, "
    "plus completes et surtout disponibles de maniere fiable jour apres jour.",
    body_style
))

# Build document
doc.build(story)
print(f"PDF generated: {output_path}")
