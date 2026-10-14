const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
  process.exit(1);
}

const msg = `
╔════════════════════════════════╗
║    📊 BILAN DU 23 AOÛT 2026     ║
╚════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━
<b>💎 VALUE BETS</b> (5 pronos)
━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Magdeburg @1.04 → 4-0  <b>+0.04u</b>
❌ Heidenheim @1.08 → 2-5  <b>-1.00u</b>  ⚠️ Surprise Jeddeloh!
✅ Dresden @1.07 → 6-0  <b>+0.07u</b>
✅ Paderborn @1.14 → 4-2  <b>+0.14u</b>
✅ Feyenoord @1.29 → 5-2  <b>+0.29u</b>

📈 <b>4/5 gagnés</b> | P&L: <b>-0.46u</b> | ROI: <b>-9.2%</b>
⚠️ 4/5 gagnés mais ROI négatif : les cotes (1.04-1.29) ne justifient pas le label "Value Bet"

━━━━━━━━━━━━━━━━━━━━━━━━━
<b>💣 KAMIKAZE — Sélection standard</b> (4 pronos)
━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Union Berlin @2.05 → 4-2  <b>+1.05u</b>
❌ St. Pauli @2.05 → 0-2  <b>-1.00u</b>
✅ Brighton @2.10 → 4-0  <b>+1.10u</b>
✅ Getafe @2.20 → 1-0  <b>+1.20u</b>

📈 <b>3/4 gagnés</b> | P&L: <b>+2.35u</b> | ROI: <b>+58.8%</b>

━━━━━━━━━━━━━━━━━━━━━━━━━
<b>💣 KAMIKAZE — Value Bets outsiders</b> (8 pronos)
━━━━━━━━━━━━━━━━━━━━━━━━━

DFB Pokal (outsiders):
❌ Bahlinger @26.00 → 0-4  <b>-1.00u</b>
❌ Westfalia @19.00 → 0-6  <b>-1.00u</b>
✅ Jeddeloh II @17.00 → 5-2  <b>+16.00u</b> 🔥!
❌ Phönix L. @14.00 → 2-4  <b>-1.00u</b>

Autres ligues (outsiders):
❌ Elche @8.50 → 0-5  <b>-1.00u</b>
✅ Alanyaspor @4.80 → 1-0  <b>+3.80u</b>
❌ Torino @4.30 → 1-2  <b>-1.00u</b>
✅ Getafe @3.45 → 1-0  <b>+2.45u</b>

📈 <b>3/8 gagnés</b> | P&L: <b>+16.25u</b> | ROI: <b>+203%</b>
(sauvé par le coup de foudre Jeddeloh 5-2 Heidenheim!)

━━━━━━━━━━━━━━━━━━━━━━━━━
<b>📊 BILAN GLOBAL DU JOUR</b>
━━━━━━━━━━━━━━━━━━━━━━━━━

• VB Safe: 4/5 | P&L: -0.46u
• Kamikaze standard: 3/4 | P&L: +2.35u
• Kamikaze outsiders: 3/8 | P&L: +16.25u

<b>TOTAL: 10/17 (58.8%) | P&L net: +18.14u</b>

━━━━━━━━━━━━━━━━━━━━━━━━━
<b>🔧 TRANSPARENCE — Bug identifié</b>
━━━━━━━━━━━━━━━━━━━━━━━━━

Je dois être honnête avec vous : les pronos d\'hier contenaient un <b>bug dans l\'algorithme</b> qui a affecté la qualité des Value Bets.

<b>🐛 Problèmes détectés :</b>

1️⃣ <b>Inversion home/away</b> — Tous les VB affichaient "Type: home" alors que la prédiction visait l\'équipe à l\'extérieur (Magdeburg, Heidenheim, Dresden, Paderborn, Feyenoord). Le pronostic lui-même était correct dans la direction, mais le label était faux.

2️⃣ <b>Filtre des cotes extrêmes défaillant</b> — Des matchs de coupe à 1.04-1.29 (Magdeburg, Dresden, Heidenheim) n\'auraient jamais dû apparaître en Value Bet : la marge brute du bookmaker ne permet aucun edge réel à ces cotes.

3️⃣ <b>Zones d\'exclusion non appliquées</b> — Les matchs DFB Pokal avec un outsider à 14-26 ont contourné les filtres d\'exclusion prévus.

<b>✅ Corrections appliquées :</b>
• Inversion home/away : corrigée
• Vig removal (retrait de la marge bookmaker) : implémenté pour un calcul d\'edge réel
• Seuils dynamiques : 3% (cotes ≤1.50), 5% (1.51-3.00), 8% (3.01-8.00), 12% (>8.00)
• Zones d\'exclusion renforcées : favoris <1.25 et matchs déséquilibrés
• Kelly ¼ et edge vrai affichés

<b>🙏 Mes excuses</b>

L\'algorithme n\'était pas au niveau attendu hier. Ces corrections sont maintenant en production et les prochains pronos seront significativement plus fiables. La transparence est importante — je préfère vous montrer le problème plutôt que le cacher.

Merci de votre confiance. 🔥
`;

const url = `https://api.telegram.org/bot${token}/sendMessage`;

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    text: msg,
    parse_mode: 'HTML',
  }),
})
  .then((r) => r.json())
  .then((d) => {
    if (d.ok) {
      console.log('✅ Message envoyé avec succès');
    } else {
      console.error('❌ Erreur Telegram:', JSON.stringify(d));
    }
  })
  .catch((err) => console.error('❌ Erreur réseau:', err));
