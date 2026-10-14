#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# BACKUP MIRROR SCRIPT — Steo Elite Predictor
# Sauvegarde multi-miroir en cas de ban GitHub
# ═══════════════════════════════════════════════════════════════════
# Usage: ./scripts/backup-mirror.sh
# Planifiez: crontab -e → 0 3 * * * /home/z/my-project/scripts/backup-mirror.sh >> /home/z/my-project/scripts/backup.log 2>&1
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

PROJECT_DIR="/home/z/my-project"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$PROJECT_DIR/backups"
LOCAL_ARCHIVE="$BACKUP_DIR/backup_${TIMESTAMP}.tar.gz"

# ─── MIROIRS DISTANTS ───
# Remplacez par vos tokens/clés réels
GITLAB_URL=""        # Ex: gitlab.com/votre-user/steo-elite-predictor.git
BITBUCKET_URL=""     # Ex: bitbucket.org/votre-user/steo-elite-predictor.git
CODEBERG_URL=""      # Ex: codeberg.org/votre-user/steo-elite-predictor.git

# ─── SUPABASE CREDS (pour dump DB) ───
SB_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
SB_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

echo "═══════════════════════════════════════════════"
echo "  BACKUP MIRROR — $TIMESTAMP"
echo "═══════════════════════════════════════════════"

mkdir -p "$BACKUP_DIR"

# ═══ ÉTAPE 1: BACKUP LOCAL (archive tar.gz) ═══
echo "[1/5] Création archive locale..."
mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"
tar -czf "$LOCAL_ARCHIVE" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='ml/venv' \
  --exclude='backups' \
  --exclude='.git' \
  src/ ml/ data/ public/ scripts/ \
  package.json tsconfig.json next.config.* \
  vercel.json tailwind.config.* postcss.config.* \
  2>/dev/null || true

LOCAL_SIZE=$(du -sh "$LOCAL_ARCHIVE" | cut -f1)
echo "   ✅ Archive: $LOCAL_ARCHIVE ($LOCAL_SIZE)"

# ═══ ÉTAPE 2: PUSH GITLAB ═══
if [ -n "$GITLAB_URL" ]; then
  echo "[2/5] Push vers GitLab..."
  # Ajouter remote si pas encore configuré
  if ! git remote get-url gitlab 2>/dev/null; then
    git remote add gitlab "$GITLAB_URL"
  fi
  git push gitlab main --force 2>&1 | tail -3 && echo "   ✅ GitLab OK" || echo "   ⚠️ GitLab échoué"
else
  echo "[2/5] ⏭️ GitLab non configuré (GITLAB_URL vide)"
fi

# ═══ ÉTAPE 3: PUSH BITBUCKET ═══
if [ -n "$BITBUCKET_URL" ]; then
  echo "[3/5] Push vers Bitbucket..."
  if ! git remote get-url bitbucket 2>/dev/null; then
    git remote add bitbucket "$BITBUCKET_URL"
  fi
  git push bitbucket main --force 2>&1 | tail -3 && echo "   ✅ Bitbucket OK" || echo "   ⚠️ Bitbucket échoué"
else
  echo "[3/5] ⏭️ Bitbucket non configuré (BITBUCKET_URL vide)"
fi

# ═══ ÉTAPE 4: PUSH CODEBERG ═══
if [ -n "$CODEBERG_URL" ]; then
  echo "[4/5] Push vers Codeberg..."
  if ! git remote get-url codeberg 2>/dev/null; then
    git remote add codeberg "$CODEBERG_URL"
  fi
  git push codeberg main --force 2>&1 | tail -3 && echo "   ✅ Codeberg OK" || echo "   ⚠️ Codeberg échoué"
else
  echo "[4/5] ⏭️ Codeberg non configuré (CODEBERG_URL vide)"
fi

# ═══ ÉTAPE 5: DUMP SUPABASE (predictions + ml_model) ═══
echo "[5/5] Dump Supabase..."
SB_DUMP="$BACKUP_DIR/supabase_${TIMESTAMP}.json"

if [ -n "$SB_URL" ] && [ -n "$SB_KEY" ]; then
  # Récupérer les prédictions + ml_model + ml_patterns + ml_picks
  python3 -c "
import json, urllib.request, os

url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

if not url or not key:
    print('   ⚠️ Supabase creds manquantes')
    exit(0)

headers = {
    'apikey': key,
    'Authorization': f'Bearer {key}',
    'Content-Type': 'application/json'
}

dump = {}
for table in ['predictions', 'ml_model', 'ml_patterns', 'ml_picks', 'stats_history']:
    try:
        req = urllib.request.Request(
            f'{url}/rest/v1/{table}?select=*&limit=50000',
            headers=headers
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            dump[table] = json.loads(resp.read().decode())
        print(f'   ✅ {table}: {len(dump[table])} rows')
    except Exception as e:
        print(f'   ⚠️ {table}: {e}')
        dump[table] = []

with open('$SB_DUMP', 'w') as f:
    json.dump(dump, f, ensure_ascii=False, indent=2)
print(f'   ✅ Dump sauvegardé: $SB_DUMP')
" 2>&1
else
  echo "   ⚠️ Variables Supabase non configurées"
fi

# ═══ CLEANUP: garder seulement les 10 derniers backups ═══
cd "$BACKUP_DIR"
ls -t backup_*.tar.gz 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
ls -t supabase_*.json 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

echo ""
echo "═══════════════════════════════════════════════"
echo "  ✅ BACKUP TERMINÉ — $TIMESTAMP"
echo "  📁 Archive locale: $LOCAL_ARCHIVE ($LOCAL_SIZE)"
echo "═══════════════════════════════════════════════"
