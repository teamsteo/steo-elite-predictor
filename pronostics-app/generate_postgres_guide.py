#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Guide de configuration Vercel Postgres pour Steo Elite Predictor
"""

from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    ListFlowable, ListItem, PageBreak
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
import os

# Register fonts
pdfmetrics.registerFont(TTFont('SimHei', '/usr/share/fonts/truetype/chinese/SimHei.ttf'))
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))

# Register font families for bold support
registerFontFamily('SimHei', normal='SimHei', bold='SimHei')
registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')

# Create document
output_path = '/home/z/my-project/download/Guide_Configuration_Vercel_Postgres.pdf'
doc = SimpleDocTemplate(
    output_path,
    pagesize=A4,
    title='Guide Configuration Vercel Postgres',
    author='Z.ai',
    creator='Z.ai',
    subject='Guide de configuration de Vercel Postgres pour Steo Elite Predictor'
)

# Styles
styles = getSampleStyleSheet()

# Custom styles
title_style = ParagraphStyle(
    name='CustomTitle',
    fontName='SimHei',
    fontSize=28,
    leading=34,
    alignment=TA_CENTER,
    spaceAfter=20
)

heading1_style = ParagraphStyle(
    name='CustomH1',
    fontName='SimHei',
    fontSize=18,
    leading=24,
    alignment=TA_LEFT,
    spaceBefore=20,
    spaceAfter=12,
    textColor=colors.HexColor('#1F4E79')
)

heading2_style = ParagraphStyle(
    name='CustomH2',
    fontName='SimHei',
    fontSize=14,
    leading=18,
    alignment=TA_LEFT,
    spaceBefore=15,
    spaceAfter=8,
    textColor=colors.HexColor('#2E75B6')
)

body_style = ParagraphStyle(
    name='CustomBody',
    fontName='SimHei',
    fontSize=11,
    leading=18,
    alignment=TA_LEFT,
    spaceAfter=8,
    wordWrap='CJK'
)

code_style = ParagraphStyle(
    name='CustomCode',
    fontName='Times New Roman',
    fontSize=10,
    leading=14,
    alignment=TA_LEFT,
    backColor=colors.HexColor('#F5F5F5'),
    spaceAfter=10,
    leftIndent=10,
    rightIndent=10
)

bullet_style = ParagraphStyle(
    name='BulletStyle',
    fontName='SimHei',
    fontSize=11,
    leading=16,
    alignment=TA_LEFT,
    leftIndent=20
)

# Table styles
table_header_style = ParagraphStyle(
    name='TableHeader',
    fontName='SimHei',
    fontSize=11,
    textColor=colors.white,
    alignment=TA_CENTER
)

table_cell_style = ParagraphStyle(
    name='TableCell',
    fontName='SimHei',
    fontSize=10,
    alignment=TA_LEFT
)

# Build story
story = []

# Cover page
story.append(Spacer(1, 80))
story.append(Paragraph('<b>Guide de Configuration</b>', title_style))
story.append(Spacer(1, 20))
story.append(Paragraph('<b>Vercel Postgres</b>', title_style))
story.append(Spacer(1, 30))
story.append(Paragraph('Steo Elite Predictor', ParagraphStyle(
    name='Subtitle',
    fontName='SimHei',
    fontSize=16,
    leading=20,
    alignment=TA_CENTER,
    textColor=colors.HexColor('#666666')
)))
story.append(Spacer(1, 50))
story.append(Paragraph('Base de donnees persistante pour les pronostics sportifs', ParagraphStyle(
    name='Description',
    fontName='SimHei',
    fontSize=12,
    leading=16,
    alignment=TA_CENTER,
    textColor=colors.HexColor('#888888')
)))
story.append(PageBreak())

# Introduction
story.append(Paragraph('<b>1. Introduction</b>', heading1_style))
story.append(Paragraph(
    'Ce guide vous explique comment configurer une base de donnees PostgreSQL persistante sur Vercel pour votre application Steo Elite Predictor. '
    'L\'utilisation d\'une base de donnees persistante est essentielle pour conserver l\'historique de vos pronostics, '
    'calculer les taux de reussite reels et suivre l\'evolution de vos performances sur le long terme.',
    body_style
))
story.append(Paragraph(
    'Sans base de donnees persistante, les donnees sont stockees en memoire et sont perdues a chaque redploiement de l\'application. '
    'Avec Vercel Postgres, vos pronostics seront conserves de maniere durable et accessibles a tout moment.',
    body_style
))
story.append(Spacer(1, 10))

# Prerequisites
story.append(Paragraph('<b>2. Prerequis</b>', heading1_style))
story.append(Paragraph('Avant de commencer, assurez-vous de disposer des elements suivants :', body_style))

prereq_data = [
    [Paragraph('<b>Element</b>', table_header_style), Paragraph('<b>Description</b>', table_header_style)],
    [Paragraph('Compte Vercel', table_cell_style), Paragraph('Un compte actif sur vercel.com avec votre projet deploye', table_cell_style)],
    [Paragraph('Projet deploye', table_cell_style), Paragraph('Votre application Steo Elite Predictor doit etre deployee sur Vercel', table_cell_style)],
    [Paragraph('Acces Dashboard', table_cell_style), Paragraph('Droits d\'administration sur le projet Vercel', table_cell_style)]
]

prereq_table = Table(prereq_data, colWidths=[4*cm, 12*cm])
prereq_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('BACKGROUND', (0, 1), (-1, -1), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
]))
story.append(prereq_table)
story.append(Spacer(1, 15))

# Step 1
story.append(Paragraph('<b>3. Creation de la base de donnees</b>', heading1_style))
story.append(Paragraph('<b>3.1 Acces au tableau de bord Vercel</b>', heading2_style))
story.append(Paragraph(
    'Connectez-vous a votre compte Vercel et accedez au tableau de bord principal. '
    'Selectionnez votre projet "my-project" ou le nom que vous avez donne a votre application Steo Elite Predictor.',
    body_style
))
story.append(Spacer(1, 10))

story.append(Paragraph('<b>3.2 Acces a la section Storage</b>', heading2_style))
story.append(Paragraph(
    'Une fois dans votre projet, localisez l\'onglet "Storage" dans le menu de navigation superieur. '
    'Cet onglet vous permet de gerer toutes les ressources de stockage de votre projet, '
    'y compris les bases de donnees, le stockage de fichiers et les caches.',
    body_style
))
story.append(Spacer(1, 10))

story.append(Paragraph('<b>3.3 Creation de la base Postgres</b>', heading2_style))
story.append(Paragraph('Cliquez sur le bouton "Create Database" puis selectionnez "Postgres" parmi les options disponibles.', body_style))

steps_data = [
    [Paragraph('<b>Etape</b>', table_header_style), Paragraph('<b>Action</b>', table_header_style), Paragraph('<b>Details</b>', table_header_style)],
    [Paragraph('1', table_cell_style), Paragraph('Cliquer sur Create Database', table_cell_style), Paragraph('Bouton en haut a droite de la page Storage', table_cell_style)],
    [Paragraph('2', table_cell_style), Paragraph('Selectionner Postgres', table_cell_style), Paragraph('Choisir l\'option Neons Postgres ou Vercel Postgres', table_cell_style)],
    [Paragraph('3', table_cell_style), Paragraph('Nommer la base', table_cell_style), Paragraph('Suggere : steo-predictor-db', table_cell_style)],
    [Paragraph('4', table_cell_style), Paragraph('Choisir la region', table_cell_style), Paragraph('Selectionner la region la plus proche de vos utilisateurs', table_cell_style)],
    [Paragraph('5', table_cell_style), Paragraph('Confirmer la creation', table_cell_style), Paragraph('Cliquer sur Create pour valider', table_cell_style)]
]

steps_table = Table(steps_data, colWidths=[1.5*cm, 5*cm, 9.5*cm])
steps_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('BACKGROUND', (0, 1), (-1, 1), colors.white),
    ('BACKGROUND', (0, 2), (-1, 2), colors.HexColor('#F5F5F5')),
    ('BACKGROUND', (0, 3), (-1, 3), colors.white),
    ('BACKGROUND', (0, 4), (-1, 4), colors.HexColor('#F5F5F5')),
    ('BACKGROUND', (0, 5), (-1, 5), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
]))
story.append(steps_table)
story.append(Spacer(1, 15))

# Variables
story.append(Paragraph('<b>4. Variables d\'environnement</b>', heading1_style))
story.append(Paragraph(
    'Une fois la base de donnees creee, Vercel ajoute automatiquement les variables d\'environnement necessaires a votre projet. '
    'Ces variables permettent a votre application de se connecter a la base de donnees de maniere securisee.',
    body_style
))
story.append(Spacer(1, 10))

env_data = [
    [Paragraph('<b>Variable</b>', table_header_style), Paragraph('<b>Utilisation</b>', table_header_style)],
    [Paragraph('POSTGRES_URL', table_cell_style), Paragraph('URL de connexion complete (format non-prisma)', table_cell_style)],
    [Paragraph('POSTGRES_PRISMA_URL', table_cell_style), Paragraph('URL pour Prisma avec connexion pool (utilise par l\'application)', table_cell_style)],
    [Paragraph('POSTGRES_URL_NON_POOLING', table_cell_style), Paragraph('URL directe pour les migrations', table_cell_style)],
    [Paragraph('POSTGRES_USER', table_cell_style), Paragraph('Nom d\'utilisateur de la base', table_cell_style)],
    [Paragraph('POSTGRES_HOST', table_cell_style), Paragraph('Adresse du serveur de base de donnees', table_cell_style)],
    [Paragraph('POSTGRES_PASSWORD', table_cell_style), Paragraph('Mot de passe de connexion', table_cell_style)],
    [Paragraph('POSTGRES_DATABASE', table_cell_style), Paragraph('Nom de la base de donnees', table_cell_style)]
]

env_table = Table(env_data, colWidths=[5*cm, 11*cm])
env_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('BACKGROUND', (0, 1), (-1, 1), colors.white),
    ('BACKGROUND', (0, 2), (-1, 2), colors.HexColor('#F5F5F5')),
    ('BACKGROUND', (0, 3), (-1, 3), colors.white),
    ('BACKGROUND', (0, 4), (-1, 4), colors.HexColor('#F5F5F5')),
    ('BACKGROUND', (0, 5), (-1, 5), colors.white),
    ('BACKGROUND', (0, 6), (-1, 6), colors.HexColor('#F5F5F5')),
    ('BACKGROUND', (0, 7), (-1, 7), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
]))
story.append(env_table)
story.append(Spacer(1, 15))

story.append(Paragraph('<b>4.1 Verification des variables</b>', heading2_style))
story.append(Paragraph(
    'Pour verifier que les variables sont bien configurees, accedez a l\'onglet "Settings" de votre projet, '
    'puis a la section "Environment Variables". Vous devriez voir toutes les variables POSTGRES_* listees.',
    body_style
))
story.append(Spacer(1, 15))

# Deploy
story.append(Paragraph('<b>5. Redeploiement</b>', heading1_style))
story.append(Paragraph(
    'Apres la creation de la base de donnees, vous devez redeployer votre application pour qu\'elle prenne en compte '
    'les nouvelles variables d\'environnement et initialise les tables de la base de donnees.',
    body_style
))
story.append(Spacer(1, 10))

story.append(Paragraph('<b>5.1 Deploiement automatique</b>', heading2_style))
story.append(Paragraph(
    'Si votre projet est connecte a un depot GitHub, Vercel detectera automatiquement les changements et lancera un nouveau deploiement. '
    'Sinon, vous pouvez declencher manuellement un deploiement depuis l\'onglet "Deployments" en cliquant sur "Redeploy".',
    body_style
))
story.append(Spacer(1, 10))

story.append(Paragraph('<b>5.2 Initialisation des tables</b>', heading2_style))
story.append(Paragraph(
    'Lors du deploiement, le script "vercel-build" execute automatiquement les commandes Prisma necessaires pour creer les tables. '
    'Le schema Prisma definit les tables suivantes pour votre application :',
    body_style
))

schema_data = [
    [Paragraph('<b>Table</b>', table_header_style), Paragraph('<b>Description</b>', table_header_style)],
    [Paragraph('User', table_cell_style), Paragraph('Comptes utilisateurs avec abonnement (free/premium)', table_cell_style)],
    [Paragraph('Match', table_cell_style), Paragraph('Donnees des matchs (equipes, cotes, scores)', table_cell_style)],
    [Paragraph('DailyPrediction', table_cell_style), Paragraph('Pronostics quotidiens avec resultats et verification', table_cell_style)],
    [Paragraph('StatsSummary', table_cell_style), Paragraph('Resume des statistiques par periode', table_cell_style)],
    [Paragraph('Bankroll', table_cell_style), Paragraph('Gestion de la bankroll utilisateur', table_cell_style)]
]

schema_table = Table(schema_data, colWidths=[4*cm, 12*cm])
schema_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('BACKGROUND', (0, 1), (-1, 1), colors.white),
    ('BACKGROUND', (0, 2), (-1, 2), colors.HexColor('#F5F5F5')),
    ('BACKGROUND', (0, 3), (-1, 3), colors.white),
    ('BACKGROUND', (0, 4), (-1, 4), colors.HexColor('#F5F5F5')),
    ('BACKGROUND', (0, 5), (-1, 5), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
]))
story.append(schema_table)
story.append(Spacer(1, 15))

# Verification
story.append(Paragraph('<b>6. Verification</b>', heading1_style))
story.append(Paragraph(
    'Une fois le deploiement termine, vous pouvez verifier que la base de donnees fonctionne correctement '
    'en appelant l\'endpoint de verification.',
    body_style
))
story.append(Spacer(1, 10))

story.append(Paragraph('<b>6.1 Test de connexion</b>', heading2_style))
story.append(Paragraph('Accedez a l\'URL suivante dans votre navigateur :', body_style))
story.append(Paragraph('https://votre-projet.vercel.app/api/seed', code_style))
story.append(Spacer(1, 10))

story.append(Paragraph(
    'Si la connexion est reussie, vous verrez un message de confirmation avec le nombre d\'enregistrements dans chaque table. '
    'Si la connexion echoue, verifiez que les variables d\'environnement sont correctement configurees.',
    body_style
))
story.append(Spacer(1, 10))

story.append(Paragraph('<b>6.2 Test des pronostics</b>', heading2_style))
story.append(Paragraph(
    'Accedez a votre application et genere quelques pronostics. Les donnees seront automatiquement sauvegardees dans la base Postgres. '
    'Vous pouvez verifier en appelant :',
    body_style
))
story.append(Paragraph('https://votre-projet.vercel.app/api/results?action=all', code_style))
story.append(Spacer(1, 15))

# Troubleshooting
story.append(Paragraph('<b>7. Resolution des problemes</b>', heading1_style))

trouble_data = [
    [Paragraph('<b>Probleme</b>', table_header_style), Paragraph('<b>Solution</b>', table_header_style)],
    [Paragraph('Erreur P1001 (connexion)', table_cell_style), Paragraph('Verifiez que la base Postgres est bien cree et activee dans Storage', table_cell_style)],
    [Paragraph('Tables non creees', table_cell_style), Paragraph('Declenchez un nouveau deploiement pour executer les migrations Prisma', table_cell_style)],
    [Paragraph('Variables manquantes', table_cell_style), Paragraph('Dans Storage, cliquez sur "Connect to Project" pour ajouter les variables', table_cell_style)],
    [Paragraph('Erreur de timeout', table_cell_style), Paragraph('Utilisez POSTGRES_PRISMA_URL (pooling) au lieu de POSTGRES_URL', table_cell_style)]
]

trouble_table = Table(trouble_data, colWidths=[5*cm, 11*cm])
trouble_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('BACKGROUND', (0, 1), (-1, 1), colors.white),
    ('BACKGROUND', (0, 2), (-1, 2), colors.HexColor('#F5F5F5')),
    ('BACKGROUND', (0, 3), (-1, 3), colors.white),
    ('BACKGROUND', (0, 4), (-1, 4), colors.HexColor('#F5F5F5')),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
]))
story.append(trouble_table)
story.append(Spacer(1, 15))

# Conclusion
story.append(Paragraph('<b>8. Resume</b>', heading1_style))
story.append(Paragraph(
    'Votre application Steo Elite Predictor est maintenant configuree avec une base de donnees PostgreSQL persistante. '
    'Les pronostics seront conserves de maniere durable, vous permettant de suivre vos performances sur le long terme '
    'et de calculer les taux de reussite reels de vos predictions.',
    body_style
))
story.append(Spacer(1, 10))

summary_data = [
    [Paragraph('<b>Fonctionnalite</b>', table_header_style), Paragraph('<b>Statut</b>', table_header_style)],
    [Paragraph('Sauvegarde des pronostics', table_cell_style), Paragraph('Automatique en base Postgres', table_cell_style)],
    [Paragraph('Historique des resultats', table_cell_style), Paragraph('Conserve de maniere persistante', table_cell_style)],
    [Paragraph('Statistiques de reussite', table_cell_style), Paragraph('Calculees sur donnees reelles', table_cell_style)],
    [Paragraph('Verification des matchs', table_cell_style), Paragraph('Via Football-Data API', table_cell_style)]
]

summary_table = Table(summary_data, colWidths=[8*cm, 8*cm])
summary_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2E7D32')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('BACKGROUND', (0, 1), (-1, 1), colors.white),
    ('BACKGROUND', (0, 2), (-1, 2), colors.HexColor('#E8F5E9')),
    ('BACKGROUND', (0, 3), (-1, 3), colors.white),
    ('BACKGROUND', (0, 4), (-1, 4), colors.HexColor('#E8F5E9')),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
]))
story.append(summary_table)

# Build PDF
doc.build(story)
print(f"PDF genere avec succes : {output_path}")
