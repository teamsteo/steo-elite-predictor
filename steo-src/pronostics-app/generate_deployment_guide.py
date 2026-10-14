#!/usr/bin/env python3
"""
Guide de déploiement Vercel - Steo Élite Predictor
"""

from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, ListFlowable, ListItem, Image
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.lib.units import cm, inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
import os

# Enregistrement des polices
pdfmetrics.registerFont(TTFont('SimHei', '/usr/share/fonts/truetype/chinese/SimHei.ttf'))
pdfmetrics.registerFont(TTFont('Microsoft YaHei', '/usr/share/fonts/truetype/chinese/msyh.ttf'))
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
pdfmetrics.registerFont(TTFont('Calibri', '/usr/share/fonts/truetype/english/calibri-regular.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))

registerFontFamily('Microsoft YaHei', normal='Microsoft YaHei', bold='Microsoft YaHei')
registerFontFamily('SimHei', normal='SimHei', bold='SimHei')
registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')

def create_deployment_guide():
    output_path = "/home/z/my-project/download/Guide_Deploiement_Vercel_SteoElitePredictor.pdf"
    
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm,
        title="Guide_Deploiement_Vercel_SteoElitePredictor",
        author="Z.ai",
        creator="Z.ai",
        subject="Guide complet de déploiement Vercel pour l'application Steo Élite Predictor"
    )
    
    styles = getSampleStyleSheet()
    
    # Styles personnalisés
    styles.add(ParagraphStyle(
        name='CoverTitle',
        fontName='Microsoft YaHei',
        fontSize=32,
        leading=40,
        alignment=TA_CENTER,
        spaceAfter=20
    ))
    
    styles.add(ParagraphStyle(
        name='CoverSubtitle',
        fontName='SimHei',
        fontSize=18,
        leading=24,
        alignment=TA_CENTER,
        spaceAfter=30
    ))
    
    styles.add(ParagraphStyle(
        name='Heading1Custom',
        fontName='Microsoft YaHei',
        fontSize=18,
        leading=24,
        spaceBefore=20,
        spaceAfter=12,
        textColor=colors.HexColor('#1F4E79')
    ))
    
    styles.add(ParagraphStyle(
        name='Heading2Custom',
        fontName='Microsoft YaHei',
        fontSize=14,
        leading=18,
        spaceBefore=15,
        spaceAfter=8,
        textColor=colors.HexColor('#2E75B6')
    ))
    
    styles.add(ParagraphStyle(
        name='Heading3Custom',
        fontName='SimHei',
        fontSize=12,
        leading=16,
        spaceBefore=10,
        spaceAfter=6,
        textColor=colors.HexColor('#5B9BD5')
    ))
    
    styles.add(ParagraphStyle(
        name='BodyTextCN',
        fontName='SimHei',
        fontSize=10.5,
        leading=16,
        alignment=TA_LEFT,
        spaceAfter=8,
        wordWrap='CJK'
    ))
    
    styles.add(ParagraphStyle(
        name='CodeBlock',
        fontName='DejaVuSans',
        fontSize=9,
        leading=12,
        backColor=colors.HexColor('#F5F5F5'),
        borderPadding=8,
        spaceAfter=10
    ))
    
    styles.add(ParagraphStyle(
        name='Note',
        fontName='SimHei',
        fontSize=10,
        leading=14,
        backColor=colors.HexColor('#FFF3CD'),
        borderPadding=10,
        spaceAfter=12,
        wordWrap='CJK'
    ))
    
    styles.add(ParagraphStyle(
        name='Tip',
        fontName='SimHei',
        fontSize=10,
        leading=14,
        backColor=colors.HexColor('#D4EDDA'),
        borderPadding=10,
        spaceAfter=12,
        wordWrap='CJK'
    ))
    
    # Styles pour tableaux
    header_style = ParagraphStyle(
        name='TableHeader',
        fontName='Microsoft YaHei',
        fontSize=10,
        textColor=colors.white,
        alignment=TA_CENTER
    )
    
    cell_style = ParagraphStyle(
        name='TableCell',
        fontName='SimHei',
        fontSize=9,
        textColor=colors.black,
        alignment=TA_CENTER,
        wordWrap='CJK'
    )
    
    cell_style_left = ParagraphStyle(
        name='TableCellLeft',
        fontName='SimHei',
        fontSize=9,
        textColor=colors.black,
        alignment=TA_LEFT,
        wordWrap='CJK'
    )
    
    story = []
    
    # ========== PAGE DE COUVERTURE ==========
    story.append(Spacer(1, 80))
    story.append(Paragraph('<b>Steo Élite Predictor</b>', styles['CoverTitle']))
    story.append(Spacer(1, 20))
    story.append(Paragraph('Guide de Déploiement Vercel', styles['CoverSubtitle']))
    story.append(Paragraph('De A à Z - Toutes les étapes et prérequis', styles['CoverSubtitle']))
    story.append(Spacer(1, 60))
    
    # Info box
    info_data = [
        [Paragraph('<b>Version</b>', cell_style), Paragraph('1.0', cell_style)],
        [Paragraph('<b>Date</b>', cell_style), Paragraph('Mars 2026', cell_style)],
        [Paragraph('<b>Technologies</b>', cell_style), Paragraph('Next.js 15, Prisma, PostgreSQL', cell_style)],
        [Paragraph('<b>Plateforme</b>', cell_style), Paragraph('Vercel', cell_style)],
    ]
    info_table = Table(info_data, colWidths=[4*cm, 8*cm])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#E8F4FD')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#1F4E79')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(info_table)
    story.append(PageBreak())
    
    # ========== TABLE DES MATIÈRES ==========
    story.append(Paragraph('<b>Table des Matières</b>', styles['Heading1Custom']))
    story.append(Spacer(1, 10))
    
    toc_items = [
        ('1. Introduction et Vue d\'ensemble', ''),
        ('2. Prérequis', ''),
        ('   2.1 Compte Vercel', ''),
        ('   2.2 Base de données PostgreSQL', ''),
        ('   2.3 Clés API', ''),
        ('   2.4 Outils locaux', ''),
        ('3. Préparation du Projet', ''),
        ('   3.1 Configuration du schéma Prisma', ''),
        ('   3.2 Variables d\'environnement', ''),
        ('   3.3 Fichiers de configuration', ''),
        ('4. Création de la Base de Données', ''),
        ('   4.1 Option A : Neon (Recommandé)', ''),
        ('   4.2 Option B : Supabase', ''),
        ('   4.3 Option C : Vercel Postgres', ''),
        ('5. Déploiement sur Vercel', ''),
        ('   5.1 Via GitHub (Recommandé)', ''),
        ('   5.2 Via CLI Vercel', ''),
        ('6. Configuration Post-Déploiement', ''),
        ('7. Vérification et Tests', ''),
        ('8. Dépannage Courant', ''),
        ('9. Coûts Estimés', ''),
    ]
    
    for item, _ in toc_items:
        story.append(Paragraph(item, styles['BodyTextCN']))
    
    story.append(PageBreak())
    
    # ========== 1. INTRODUCTION ==========
    story.append(Paragraph('<b>1. Introduction et Vue d\'ensemble</b>', styles['Heading1Custom']))
    story.append(Spacer(1, 10))
    
    intro_text = """
    Ce guide détaille la procédure complète pour déployer l'application <b>Steo Élite Predictor</b> sur Vercel. 
    L'application est une PWA (Progressive Web App) de pronostics sportifs intelligents qui utilise des données 
    en temps réel via The Odds API pour fournir des analyses de risques, des détections de value bets et 
    des recommandations personnalisées aux parieurs sportifs.
    """
    story.append(Paragraph(intro_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph('<b>Architecture de l\'application :</b>', styles['Heading3Custom']))
    
    arch_data = [
        [Paragraph('<b>Composant</b>', header_style), Paragraph('<b>Technologie</b>', header_style), Paragraph('<b>Description</b>', header_style)],
        [Paragraph('Frontend', cell_style), Paragraph('Next.js 15 + React', cell_style), Paragraph('Interface utilisateur PWA', cell_style_left)],
        [Paragraph('Backend', cell_style), Paragraph('Next.js API Routes', cell_style), Paragraph('Endpoints REST', cell_style_left)],
        [Paragraph('Base de données', cell_style), Paragraph('PostgreSQL + Prisma', cell_style), Paragraph('Stockage persistant', cell_style_left)],
        [Paragraph('API externe', cell_style), Paragraph('The Odds API', cell_style), Paragraph('Cotes en temps réel', cell_style_left)],
        [Paragraph('Hébergement', cell_style), Paragraph('Vercel', cell_style), Paragraph('Plateforme cloud', cell_style_left)],
    ]
    
    arch_table = Table(arch_data, colWidths=[3.5*cm, 4.5*cm, 7*cm])
    arch_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
    ]))
    story.append(arch_table)
    story.append(Spacer(1, 15))
    
    # ========== 2. PRÉREQUIS ==========
    story.append(Paragraph('<b>2. Prérequis</b>', styles['Heading1Custom']))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph('<b>2.1 Compte Vercel</b>', styles['Heading2Custom']))
    
    vercel_prereq = """
    Vercel propose un plan gratuit généreux pour les projets personnels et les startups. 
    Le plan Hobby inclut 100 Go de bande passante mensuelle, des déploiements illimités 
    et l'accès aux fonctions serverless. Pour créer un compte, rendez-vous sur 
    <font name="Times New Roman">vercel.com</font> et inscrivez-vous avec votre compte GitHub, 
    GitLab ou Bitbucket. L'authentification via GitHub est recommandée car elle simplifie 
    grandement le processus de déploiement continu. Une fois le compte créé, vous aurez accès 
    à un tableau de bord personnel où vous pourrez gérer tous vos projets, configurer des 
    domaines personnalisés et surveiller les performances de vos applications.
    """
    story.append(Paragraph(vercel_prereq, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph('<b>2.2 Base de données PostgreSQL</b>', styles['Heading2Custom']))
    
    db_prereq = """
    L'application nécessite une base de données PostgreSQL pour stocker les utilisateurs, 
    les matchs, les insights et les prédictions. Contrairement au développement local qui 
    utilise SQLite, la production requiert PostgreSQL pour sa robustesse et sa scalabilité. 
    Plusieurs options s'offrent à vous, chacune avec ses avantages spécifiques. Le choix 
    de la base de données est crucial car il impacte directement les performances de 
    l'application et la gestion des connexions concurrentes. Pour un projet débutant, 
    Neon ou Supabase sont recommandés car ils offrent des plans gratuits généreux avec 
    une interface de gestion intuitive et des fonctionnalités modernes comme le 
    branching de base de données.
    """
    story.append(Paragraph(db_prereq, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    # Tableau comparatif des options BDD
    db_options_data = [
        [Paragraph('<b>Provider</b>', header_style), Paragraph('<b>Plan Gratuit</b>', header_style), Paragraph('<b>Avantages</b>', header_style), Paragraph('<b>Recommandation</b>', header_style)],
        [Paragraph('Neon', cell_style), Paragraph('0.5 Go', cell_style), Paragraph('Branching, Serverless', cell_style_left), Paragraph('★★★★★', cell_style)],
        [Paragraph('Supabase', cell_style), Paragraph('500 Mo', cell_style), Paragraph('Auth, Storage, Realtime', cell_style_left), Paragraph('★★★★☆', cell_style)],
        [Paragraph('Vercel Postgres', cell_style), Paragraph('256 Mo', cell_style), Paragraph('Intégration native', cell_style_left), Paragraph('★★★★☆', cell_style)],
        [Paragraph('PlanetScale', cell_style), Paragraph('1 Go', cell_style), Paragraph('MySQL, Branching', cell_style_left), Paragraph('★★★☆☆', cell_style)],
        [Paragraph('Railway', cell_style), Paragraph('1 Go', cell_style), Paragraph('Simple, PostgreSQL', cell_style_left), Paragraph('★★★☆☆', cell_style)],
    ]
    
    db_table = Table(db_options_data, colWidths=[3*cm, 2.5*cm, 5*cm, 3.5*cm])
    db_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
    ]))
    story.append(db_table)
    story.append(Spacer(1, 15))
    
    story.append(Paragraph('<b>2.3 Clés API Nécessaires</b>', styles['Heading2Custom']))
    
    api_keys_text = """
    L'application utilise The Odds API pour récupérer les cotes sportives en temps réel. 
    Cette API propose un plan gratuit de 500 requêtes par mois, ce qui est suffisant pour 
    une utilisation modérée avec la limite de 15 matchs par jour configurée dans l'application. 
    Chaque synchronisation consomme une seule requête API grâce à l'optimisation implémentée 
    dans le service sportsApi.ts. Avec une utilisation quotidienne, le quota mensuel permet 
    environ 16 mois d'utilisation continue sans dépasser la limite gratuite.
    """
    story.append(Paragraph(api_keys_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    # Tableau des clés API
    api_data = [
        [Paragraph('<b>API</b>', header_style), Paragraph('<b>Variable</b>', header_style), Paragraph('<b>Plan Gratuit</b>', header_style), Paragraph('<b>Obtention</b>', header_style)],
        [Paragraph('The Odds API', cell_style), Paragraph('THE_ODDS_API_KEY', cell_style), Paragraph('500 req/mois', cell_style), Paragraph('the-odds-api.com', cell_style)],
        [Paragraph('RapidAPI (Optionnel)', cell_style), Paragraph('RAPIDAPI_KEY', cell_style), Paragraph('Variable', cell_style), Paragraph('rapidapi.com', cell_style)],
    ]
    
    api_table = Table(api_data, colWidths=[4*cm, 4.5*cm, 3*cm, 3.5*cm])
    api_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(api_table)
    story.append(Spacer(1, 10))
    
    story.append(Paragraph('<b>2.4 Outils Locaux Requis</b>', styles['Heading2Custom']))
    
    tools_text = """
    Avant de procéder au déploiement, assurez-vous d'avoir les outils suivants installés sur votre 
    machine de développement. Node.js version 18 ou supérieure est requis pour la compatibilité 
    avec Next.js 15 et ses fonctionnalités serverless. Git est indispensable pour la gestion 
    des versions et le déploiement via GitHub. Le CLI Vercel permet de tester localement 
    l'environnement de production et de déployer directement depuis le terminal.
    """
    story.append(Paragraph(tools_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    tools_list = [
        'Node.js 18+ (LTS recommandé) : <font name="Times New Roman">nodejs.org</font>',
        'Git : <font name="Times New Roman">git-scm.com</font>',
        'Vercel CLI : <font name="Times New Roman">npm i -g vercel</font>',
        'Compte GitHub : <font name="Times New Roman">github.com</font>',
    ]
    
    for tool in tools_list:
        story.append(Paragraph(f'• {tool}', styles['BodyTextCN']))
    
    story.append(Spacer(1, 15))
    
    # ========== 3. PRÉPARATION DU PROJET ==========
    story.append(Paragraph('<b>3. Préparation du Projet</b>', styles['Heading1Custom']))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph('<b>3.1 Configuration du Schéma Prisma pour PostgreSQL</b>', styles['Heading2Custom']))
    
    prisma_text = """
    Le schéma Prisma doit être modifié pour utiliser PostgreSQL en production. Le fichier 
    prisma/schema.prisma doit spécifier le provider PostgreSQL et non SQLite. Cette 
    modification est essentielle car SQLite et PostgreSQL ont des fonctionnalités différentes, 
    notamment au niveau des types de données et des index. Le schéma suivant est optimisé 
    pour PostgreSQL avec des relations correctement définies et des index pour les 
    performances.
    """
    story.append(Paragraph(prisma_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    # Code Prisma
    prisma_code = """datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  subscription String   @default("free")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  predictions  Prediction[]
  bankrolls    Bankroll[]
}

model Match {
  id          String   @id @default(cuid())
  homeTeam    String
  awayTeam    String
  sport       String
  date        DateTime
  oddsHome    Float
  oddsDraw    Float?
  oddsAway    Float
  status      String   @default("upcoming")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  insights    Insight[]
  predictions Prediction[]
}

model Insight {
  id               String   @id @default(cuid())
  matchId          String
  match            Match    @relation(fields: [matchId], references: [id])
  analysis         String
  riskPercentage   Int
  valueBetDetected Boolean  @default(false)
  valueBetType     String?
  confidence       String   @default("medium")
  recommendation   String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

model Prediction {
  id        String   @id @default(cuid())
  matchId   String
  match     Match    @relation(fields: [matchId], references: [id])
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  betType   String
  riskLevel String   @default("medium")
  result    String   @default("pending")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Bankroll {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  amount      Float
  type        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}"""
    
    code_style = ParagraphStyle(
        name='CodeText',
        fontName='DejaVuSans',
        fontSize=8,
        leading=10,
        backColor=colors.HexColor('#F5F5F5'),
        leftIndent=10,
        rightIndent=10,
        spaceAfter=10
    )
    
    story.append(Paragraph(f'<font name="DejaVuSans"><![CDATA[{prisma_code}]]></font>', code_style))
    story.append(Spacer(1, 15))
    
    story.append(Paragraph('<b>3.2 Variables d\'Environnement</b>', styles['Heading2Custom']))
    
    env_text = """
    Les variables d'environnement sont cruciales pour la sécurité et la configuration de votre 
    application. Ne jamais commiter les fichiers .env dans Git. Voici la configuration complète 
    des variables nécessaires pour la production sur Vercel.
    """
    story.append(Paragraph(env_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    env_data = [
        [Paragraph('<b>Variable</b>', header_style), Paragraph('<b>Description</b>', header_style), Paragraph('<b>Exemple</b>', header_style)],
        [Paragraph('DATABASE_URL', cell_style), Paragraph('URL de connexion PostgreSQL (pooler)', cell_style_left), Paragraph('postgresql://user:pass@host/db', cell_style)],
        [Paragraph('DIRECT_DATABASE_URL', cell_style), Paragraph('URL directe pour migrations', cell_style_left), Paragraph('postgresql://user:pass@host/db', cell_style)],
        [Paragraph('THE_ODDS_API_KEY', cell_style), Paragraph('Clé API The Odds API', cell_style_left), Paragraph('14e0798d10ea...', cell_style)],
        [Paragraph('NEXT_PUBLIC_APP_URL', cell_style), Paragraph('URL publique de l\'app', cell_style_left), Paragraph('https://app.vercel.app', cell_style)],
    ]
    
    env_table = Table(env_data, colWidths=[4.5*cm, 5.5*cm, 5*cm])
    env_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
    ]))
    story.append(env_table)
    story.append(Spacer(1, 10))
    
    note_text = """
    <b>Important :</b> DATABASE_URL et DIRECT_DATABASE_URL sont fournies par votre provider 
    PostgreSQL (Neon, Supabase, etc.). Neon fournit automatiquement ces deux URLs. La première 
    utilise un connection pooler pour les performances serverless, la seconde est utilisée 
    pour les migrations Prisma qui nécessitent une connexion directe.
    """
    story.append(Paragraph(note_text, styles['Note']))
    story.append(Spacer(1, 15))
    
    # ========== 4. CRÉATION DE LA BASE DE DONNÉES ==========
    story.append(Paragraph('<b>4. Création de la Base de Données</b>', styles['Heading1Custom']))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph('<b>4.1 Option A : Neon (Recommandé)</b>', styles['Heading2Custom']))
    
    neon_text = """
    Neon est un provider PostgreSQL serverless moderne, parfaitement adapté aux applications 
    Vercel. Il offre des fonctionnalités uniques comme le branching de base de données 
    (similaire à Git), l'auto-suspend des bases inactives et une intégration native avec Vercel. 
    Le plan gratuit inclut 0.5 Go de stockage, ce qui est largement suffisant pour démarrer. 
    Neon utilise des connection poolers automatiques, optimisant les performances pour 
    l'environnement serverless de Vercel.
    """
    story.append(Paragraph(neon_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    neon_steps = [
        '<b>Étape 1 :</b> Créer un compte sur <font name="Times New Roman">neon.tech</font>',
        '<b>Étape 2 :</b> Cliquer sur "Create a project" et nommer le projet "steo-elite-predictor"',
        '<b>Étape 3 :</b> Sélectionner la région la plus proche (Europe pour la France)',
        '<b>Étape 4 :</b> Copier les URLs fournies (DATABASE_URL et DIRECT_DATABASE_URL)',
        '<b>Étape 5 :</b> Conserver ces URLs pour la configuration Vercel',
    ]
    
    for step in neon_steps:
        story.append(Paragraph(f'• {step}', styles['BodyTextCN']))
    
    story.append(Spacer(1, 10))
    
    tip_text = """
    <b>Astuce :</b> Neon propose une intégration directe avec Vercel via l'onglet "Integrations" 
    dans le dashboard Vercel. Cette méthode configure automatiquement les variables d'environnement 
    et simplifie grandement la mise en place.
    """
    story.append(Paragraph(tip_text, styles['Tip']))
    story.append(Spacer(1, 15))
    
    story.append(Paragraph('<b>4.2 Option B : Supabase</b>', styles['Heading2Custom']))
    
    supabase_text = """
    Supabase est une alternative populaire qui offre plus qu'une simple base de données. 
    En plus de PostgreSQL, vous avez accès à l'authentification, au stockage de fichiers, 
    aux fonctions edge et aux subscriptions realtime. Le plan gratuit inclut 500 Mo de 
    stockage et 2 Go de bande passante mensuelle. C'est un excellent choix si vous prévoyez 
    d'ajouter des fonctionnalités comme l'authentification utilisateur avancée ou le 
    stockage de fichiers.
    """
    story.append(Paragraph(supabase_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    supabase_steps = [
        '<b>Étape 1 :</b> Créer un compte sur <font name="Times New Roman">supabase.com</font>',
        '<b>Étape 2 :</b> Créer un nouveau projet avec un mot de passe fort',
        '<b>Étape 3 :</b> Aller dans Settings > Database',
        '<b>Étape 4 :</b> Copier l\'URI de connexion (format postgresql://...)',
        '<b>Étape 5 :</b> Remplacer [YOUR-PASSWORD] par le mot de passe défini',
    ]
    
    for step in supabase_steps:
        story.append(Paragraph(f'• {step}', styles['BodyTextCN']))
    
    story.append(Spacer(1, 15))
    
    story.append(Paragraph('<b>4.3 Option C : Vercel Postgres</b>', styles['Heading2Custom']))
    
    vercel_postgres_text = """
    Vercel Postgres est la solution native proposée par Vercel en partenariat avec Neon. 
    L'avantage principal est l'intégration transparente avec votre projet Vercel : 
    les variables d'environnement sont automatiquement configurées et la base de données 
    est visible directement dans le dashboard Vercel. Le plan Hobby offre 256 Mo de 
    stockage gratuit. Cette option est idéale pour les débutants car elle élimine 
    plusieurs étapes de configuration manuelle.
    """
    story.append(Paragraph(vercel_postgres_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    vercel_postgres_steps = [
        '<b>Étape 1 :</b> Dans le dashboard Vercel, aller sur votre projet',
        '<b>Étape 2 :</b> Cliquer sur "Storage" dans le menu latéral',
        '<b>Étape 3 :</b> Sélectionner "Create Database" > "Postgres"',
        '<b>Étape 4 :</b> Les variables sont automatiquement injectées',
    ]
    
    for step in vercel_postgres_steps:
        story.append(Paragraph(f'• {step}', styles['BodyTextCN']))
    
    story.append(Spacer(1, 15))
    
    # ========== 5. DÉPLOIEMENT SUR VERCEL ==========
    story.append(Paragraph('<b>5. Déploiement sur Vercel</b>', styles['Heading1Custom']))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph('<b>5.1 Via GitHub (Recommandé)</b>', styles['Heading2Custom']))
    
    github_text = """
    Le déploiement via GitHub est la méthode recommandée car elle permet le déploiement 
    continu : chaque push sur la branche principale déclenche automatiquement un nouveau 
    déploiement. Cette approche facilite également les rollbacks en cas de problème et 
    l'intégration avec les pull requests pour les aperçus de déploiement.
    """
    story.append(Paragraph(github_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    # Étapes détaillées GitHub
    story.append(Paragraph('<b>Préparation du repository GitHub :</b>', styles['Heading3Custom']))
    
    github_prep = [
        'Initialiser Git dans le projet : <font name="DejaVuSans">git init</font>',
        'Créer un fichier .gitignore incluant node_modules, .env, .next, db/',
        'Ajouter les fichiers : <font name="DejaVuSans">git add .</font>',
        'Créer le commit initial : <font name="DejaVuSans">git commit -m "Initial commit"</font>',
        'Créer un repository sur GitHub (github.com/new)',
        'Lier le remote : <font name="DejaVuSans">git remote add origin https://github.com/USER/REPO.git</font>',
        'Pousser le code : <font name="DejaVuSans">git push -u origin main</font>',
    ]
    
    for step in github_prep:
        story.append(Paragraph(f'• {step}', styles['BodyTextCN']))
    
    story.append(Spacer(1, 10))
    
    story.append(Paragraph('<b>Configuration Vercel :</b>', styles['Heading3Custom']))
    
    vercel_config_steps = [
        'Se connecter à <font name="Times New Roman">vercel.com</font> avec le compte GitHub',
        'Cliquer sur "Add New..." > "Project"',
        'Importer le repository GitHub "steo-elite-predictor"',
        'Configurer le Framework Preset : Next.js (auto-détecté)',
        'Configurer le Root Directory : ./ (par défaut)',
        'Ajouter les variables d\'environnement (voir section 3.2)',
        'Cliquer sur "Deploy"',
    ]
    
    for i, step in enumerate(vercel_config_steps, 1):
        story.append(Paragraph(f'<b>{i}.</b> {step}', styles['BodyTextCN']))
    
    story.append(Spacer(1, 10))
    
    # Variables d'environnement détaillées
    story.append(Paragraph('<b>Configuration des Variables d\'Environnement dans Vercel :</b>', styles['Heading3Custom']))
    
    env_config_text = """
    Dans l'interface Vercel, avant de cliquer sur Deploy, vous devez configurer les variables 
    d'environnement. Cliquez sur "Environment Variables" pour ajouter chaque variable. Assurez-vous 
    de sélectionner tous les environnements (Production, Preview, Development) pour chaque variable, 
    sauf si vous avez des configurations spécifiques par environnement.
    """
    story.append(Paragraph(env_config_text, styles['BodyTextCN']))
    story.append(Spacer(1, 15))
    
    story.append(Paragraph('<b>5.2 Via CLI Vercel</b>', styles['Heading2Custom']))
    
    cli_text = """
    Le CLI Vercel permet de déployer directement depuis votre terminal. Cette méthode est 
    utile pour les tests rapides ou si vous préférez la ligne de commande. Elle offre 
    également des fonctionnalités de développement local avec <font name="DejaVuSans">vercel dev</font> 
    qui simule l'environnement Vercel sur votre machine.
    """
    story.append(Paragraph(cli_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    cli_steps = [
        'Installer le CLI : <font name="DejaVuSans">npm i -g vercel</font>',
        'Se connecter : <font name="DejaVuSans">vercel login</font>',
        'Naviguer vers le projet : <font name="DejaVuSans">cd /home/z/my-project</font>',
        'Déployer : <font name="DejaVuSans">vercel --prod</font>',
        'Suivre les instructions interactives pour configurer le projet',
        'Ajouter les variables d\'environnement via le dashboard Vercel après le déploiement',
    ]
    
    for step in cli_steps:
        story.append(Paragraph(f'• {step}', styles['BodyTextCN']))
    
    story.append(Spacer(1, 15))
    
    # ========== 6. CONFIGURATION POST-DÉPLOIEMENT ==========
    story.append(Paragraph('<b>6. Configuration Post-Déploiement</b>', styles['Heading1Custom']))
    story.append(Spacer(1, 10))
    
    post_deploy_text = """
    Après le déploiement initial, plusieurs étapes sont nécessaires pour finaliser la 
    configuration de votre application. Ces étapes incluent l'exécution des migrations 
    de base de données, la synchronisation des données initiales et la vérification du 
    bon fonctionnement de l'API.
    """
    story.append(Paragraph(post_deploy_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph('<b>Exécution des Migrations Prisma :</b>', styles['Heading3Custom']))
    
    migration_text = """
    Les migrations Prisma doivent être exécutées pour créer les tables dans la base de données 
    PostgreSQL. Plusieurs méthodes sont disponibles selon votre workflow.
    """
    story.append(Paragraph(migration_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    migration_methods = [
        '<b>Méthode 1 (Recommandée) :</b> Ajouter un script post-install dans package.json',
        '   "postinstall": "prisma generate && prisma migrate deploy"',
        '<b>Méthode 2 :</b> Exécuter manuellement via le CLI Vercel',
        '   <font name="DejaVuSans">vercel env pull .env.local</font>',
        '   <font name="DejaVuSans">npx prisma migrate deploy</font>',
        '<b>Méthode 3 :</b> Utiliser Vercel Build Command',
        '   Modifier le Build Command : <font name="DejaVuSans">prisma generate && next build</font>',
    ]
    
    for method in migration_methods:
        story.append(Paragraph(method, styles['BodyTextCN']))
    
    story.append(Spacer(1, 10))
    
    story.append(Paragraph('<b>Initialisation des Données :</b>', styles['Heading3Custom']))
    
    init_text = """
    Une fois les migrations exécutées, initialisez les données de base en appelant les 
    endpoints d'initialisation via votre navigateur ou un outil comme curl ou Postman. 
    L'URL de votre application sera fournie par Vercel (format : votre-projet.vercel.app).
    """
    story.append(Paragraph(init_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    init_steps = [
        'Appeler <font name="Times New Roman">https://votre-projet.vercel.app/api/seed</font>',
        'Vérifier la réponse : succès de l\'initialisation',
        'Appeler <font name="Times New Roman">https://votre-projet.vercel.app/api/real-odds</font>',
        'Vérifier la synchronisation des cotes réelles',
    ]
    
    for step in init_steps:
        story.append(Paragraph(f'• {step}', styles['BodyTextCN']))
    
    story.append(Spacer(1, 15))
    
    # ========== 7. VÉRIFICATION ET TESTS ==========
    story.append(Paragraph('<b>7. Vérification et Tests</b>', styles['Heading1Custom']))
    story.append(Spacer(1, 10))
    
    verification_text = """
    Avant de considérer votre déploiement comme complet, effectuez ces vérifications 
    essentielles pour vous assurer que tout fonctionne correctement. Ces tests couvrent 
    les aspects critiques de l'application : connectivité base de données, API externe, 
    et interface utilisateur.
    """
    story.append(Paragraph(verification_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    checklist_data = [
        [Paragraph('<b>Test</b>', header_style), Paragraph('<b>URL/Action</b>', header_style), Paragraph('<b>Résultat Attendu</b>', header_style)],
        [Paragraph('Page d\'accueil', cell_style), Paragraph('/', cell_style), Paragraph('Interface chargée', cell_style_left)],
        [Paragraph('API Seed', cell_style), Paragraph('/api/seed', cell_style), Paragraph('{"success": true}', cell_style_left)],
        [Paragraph('API Matchs', cell_style), Paragraph('/api/matches', cell_style), Paragraph('[...matchs...]', cell_style_left)],
        [Paragraph('API Real Odds', cell_style), Paragraph('/api/real-odds', cell_style), Paragraph('Cotes synchronisées', cell_style_left)],
        [Paragraph('API Insights', cell_style), Paragraph('/api/insights', cell_style), Paragraph('[...insights...]', cell_style_left)],
        [Paragraph('Bankroll', cell_style), Paragraph('/api/bankroll', cell_style), Paragraph('[...transactions...]', cell_style_left)],
    ]
    
    checklist_table = Table(checklist_data, colWidths=[4*cm, 4*cm, 6*cm])
    checklist_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
    ]))
    story.append(checklist_table)
    story.append(Spacer(1, 15))
    
    # ========== 8. DÉPANNAGE COURANT ==========
    story.append(Paragraph('<b>8. Dépannage Courant</b>', styles['Heading1Custom']))
    story.append(Spacer(1, 10))
    
    troubleshooting_text = """
    Cette section couvre les problèmes les plus fréquemment rencontrés lors du déploiement 
    et leurs solutions. La plupart des erreurs sont liées à la configuration des variables 
    d'environnement ou aux migrations de base de données.
    """
    story.append(Paragraph(troubleshooting_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    # Problèmes courants
    problems = [
        ('Erreur "Prisma Client could not connect"', 
         'Vérifier que DATABASE_URL et DIRECT_DATABASE_URL sont correctement configurées. '
         'Vérifier que l\'IP de Vercel est autorisée par le provider PostgreSQL.'),
        ('Erreur "Build failed"',
         'Vérifier les logs de build dans le dashboard Vercel. '
         'Les erreurs courantes incluent des dépendances manquantes ou des erreurs TypeScript.'),
        ('API retourne "Aucune API configurée"',
         'Vérifier que THE_ODDS_API_KEY est définie dans les variables d\'environnement '
         'et que l\'application a été redéployée après l\'ajout.'),
        ('Erreur "Migration failed"',
         'Exécuter manuellement les migrations via le CLI : '
         'vercel env pull .env.local && npx prisma migrate deploy'),
        ('PWA non installable',
         'Vérifier que manifest.json et sw.js sont accessibles à la racine. '
         'Vérifier les headers HTTPS et le scope du service worker.'),
    ]
    
    for problem, solution in problems:
        story.append(Paragraph(f'<b>Problème :</b> {problem}', styles['BodyTextCN']))
        story.append(Paragraph(f'<b>Solution :</b> {solution}', styles['BodyTextCN']))
        story.append(Spacer(1, 8))
    
    story.append(Spacer(1, 15))
    
    # ========== 9. COÛTS ESTIMÉS ==========
    story.append(Paragraph('<b>9. Coûts Estimés</b>', styles['Heading1Custom']))
    story.append(Spacer(1, 10))
    
    costs_text = """
    Voici une estimation des coûts mensuels pour faire fonctionner Steo Élite Predictor. 
    Avec une utilisation modérée, l'application peut fonctionner entièrement gratuitement. 
    Les coûts n'augmentent que si vous dépassez les limites des plans gratuits.
    """
    story.append(Paragraph(costs_text, styles['BodyTextCN']))
    story.append(Spacer(1, 10))
    
    costs_data = [
        [Paragraph('<b>Service</b>', header_style), Paragraph('<b>Plan Gratuit</b>', header_style), Paragraph('<b>Plan Payant</b>', header_style), Paragraph('<b>Coût Estimé</b>', header_style)],
        [Paragraph('Vercel', cell_style), Paragraph('Hobby', cell_style), Paragraph('Pro: $20/mois', cell_style), Paragraph('0€', cell_style)],
        [Paragraph('Neon (PostgreSQL)', cell_style), Paragraph('0.5 Go', cell_style), Paragraph('Pro: $19/mois', cell_style), Paragraph('0€', cell_style)],
        [Paragraph('The Odds API', cell_style), Paragraph('500 req/mois', cell_style), Paragraph('Pro: $9/mois', cell_style), Paragraph('0€', cell_style)],
        [Paragraph('Domaine (optionnel)', cell_style), Paragraph('-.vercel.app', cell_style), Paragraph('Personnel', cell_style), Paragraph('10-15€/an', cell_style)],
        [Paragraph('<b>TOTAL</b>', cell_style), Paragraph('', cell_style), Paragraph('', cell_style), Paragraph('<b>0€/mois</b>', cell_style)],
    ]
    
    costs_table = Table(costs_data, colWidths=[4*cm, 3.5*cm, 3.5*cm, 3.5*cm])
    costs_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#D4EDDA')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#F5F5F5')]),
    ]))
    story.append(costs_table)
    story.append(Spacer(1, 15))
    
    # Résumé final
    summary_text = """
    <b>Résumé du Processus de Déploiement :</b> Le déploiement de Steo Élite Predictor sur Vercel 
    suit un processus bien défini qui peut être complété en moins d'une heure. Les étapes clés 
    sont la création d'une base de données PostgreSQL (Neon recommandé), la configuration des 
    variables d'environnement, le déploiement via GitHub, et l'exécution des migrations. 
    L'application peut fonctionner gratuitement avec les plans hobby/offres gratuites de chaque 
    service, ce qui en fait une solution économique pour les parisseurs sportifs souhaitant 
    accéder à des analyses de qualité professionnelle.
    """
    story.append(Paragraph(summary_text, styles['Tip']))
    
    # Build PDF
    doc.build(story)
    print(f"PDF généré: {output_path}")
    return output_path

if __name__ == "__main__":
    create_deployment_guide()
