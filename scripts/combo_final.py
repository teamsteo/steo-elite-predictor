"""Genere le message Telegram du combo - version ASCII."""

msg = '''
\u2554====================================\u2557
\u2551                                       \u2551
\u2551   \U0001f3af <b>COMBO MULTI-JOURS FOOT</b>        \u2551
\u2551   \u26bd 5 Grands Championnats Europeens \u2551
\u2551   \U0001f6e1\ufe0f 7 selections - Favoris solides    \u2551
\u2551                                       \u2551
\u255a====================================\u255d

\U0001f4c5 <b>Periode</b> : Ven. 4 sept + Sam. 5 sept
\U0001f4ca <b>Cote combinee</b> : <code>13.34</code>
\U0001f3af <b>Prob. cumulee</b> : 9.6%
\U0001f4b0 <b>Valeur attendue</b> : +28.1%
\U0001f4c8 <b>7 selections</b>

-------------------------------------

<b>1. Victoire Man City</b> @1.20
   \U0001f1ec\U0001f1e7 PL | City vs Coventry City
   Sam. 5 sept 14:00 | 85% | Risque 15% \U0001f7e2

<b>2. Victoire Bayern</b> @1.33
   \U0001f1e9\U0001f1ea BUN | Schalke vs Bayern
   Sam. 5 sept 13:30 | 78% | Risque 22% \U0001f7e1

<b>3. Victoire OGC Nice</b> @1.45
   \U0001f1eb\U0001f1f7 L1 | Nice vs Le Mans
   Sam. 5 sept 19:00 | 72% | Risque 28% \U0001f7e0

<b>4. Victoire Leverkusen</b> @1.50
   \U0001f1e9\U0001f1ea BUN | Leverkusen vs Union Berlin
   Sam. 5 sept 13:30 | 70% | Risque 30% \U0001f7e0

<b>5. Victoire Liverpool</b> @1.55
   \U0001f1ec\U0001f1e7 PL | Ipswich vs Liverpool
   Ven. 4 sept 19:00 | 68% | Risque 32% \U0001f7e0

<b>6. Victoire PSG</b> @1.55
   \U0001f1eb\U0001f1f7 L1 | PSG vs Monaco
   Ven. 4 sept 19:05 | 66% | Risque 34% \U0001f7e0

<b>7. Victoire Lyon</b> @1.60
   \U0001f1eb\U0001f1f7 L1 | OL vs Auxerre
   Ven. 4 sept 17:00 | 64% | Risque 36% \U0001f7e0

-------------------------------------

\U0001f4b3 <b>Simu bankroll</b>
   1 000F = <b>13 340F</b> (+12 340F)

\U0001f6e1\ufe0f Risque global : <b>\U0001f7e1 MODERE</b>
\U0001f26a0\ufe0f <i>Favoris solides sur 3 jours / 5 ligues.</i>
-------------------------------------'''

with open('/home/z/my-project/scripts/combo_message.txt', 'w') as f:
    f.write(msg)

print(f'Taille: {len(msg)} chars')
if len(msg) > 4096:
    print('ATTENTION: depasse 4096!')
else:
    print('OK pour Telegram!')