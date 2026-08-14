#!/usr/bin/env python3
"""Test message DM Telegram perso - vérification envoi"""
import os
import subprocess
import json

# Charge les variables depuis .env.local si possible
def load_env():
    env = {}
    env_file = '/home/z/my-project/.env.local'
    if os.path.exists(env_file):
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env[key.strip()] = value.strip().strip('"').strip("'")
    return env

env = load_env()

token = env.get('TELEGRAM_BOT_TOKEN', '')
chat_id = env.get('TELEGRAM_PERSONAL_CHAT_ID', '') or env.get('TELEGRAM_CHAT_ID', '')

if not token:
    print("❌ TELEGRAM_BOT_TOKEN non trouvé dans .env.local")
    exit(1)
if not chat_id:
    print("❌ TELEGRAM_PERSONAL_CHAT_ID et TELEGRAM_CHAT_ID non trouvés")
    exit(1)

print(f"Token trouvé: {token[:10]}...")
print(f"Chat ID cible: {chat_id}")

# Message test
message = """🎯 <b>PALIER INTELLIGENT - Test ✅</b>

Ceci est un <b>message test</b> pour vérifier que l'envoi en DM perso fonctionne correctement.

Si tu vois ce message, tout est OK pour recevoir les combos quotidiens !

🔑 Configuration validée :
• Bot Token ✅
• Chat ID perso ✅
• Formatage HTML ✅
• Encodage UTF-8 ✅

━━━━━━━━━━━━━━━━━━━━━━━━
Le cron tournera à 08:00 UTC chaque jour.
Les prédictions du pipeline ML seront filtrées pour te sortir le top 5 fiables."""

# Envoi via curl
url = f"https://api.telegram.org/bot{token}/sendMessage"
payload = {
    "chat_id": chat_id,
    "text": message,
    "parse_mode": "HTML",
    "disable_notification": False
}

result = subprocess.run(
    ['curl', '-s', '-X', 'POST', url, '-H', 'Content-Type: application/json', '-d', json.dumps(payload)],
    capture_output=True, text=True, timeout=30
)

response = json.loads(result.stdout)
if response.get('ok'):
    print(f"✅ Message envoyé avec succès dans DM perso !")
    print(f"   Message ID: {response.get('result', {}).get('message_id')}")
    print(f"   Chat: {response.get('result', {}).get('chat', {}).get('first_name', '')} ({chat_id})")
else:
    print(f"❌ Erreur envoi: {response.get('description')}")
    print(f"   Code: {response.get('error_code')}")
