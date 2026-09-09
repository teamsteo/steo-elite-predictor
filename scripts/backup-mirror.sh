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
# Config via fichier non-versionné scripts/.backup_env (créer soi-même) :
#   GITLAB_URL="https://gitlab.com/<user>/steo-elite-predictor.git"
#   GITLAB_TOKEN="glpat-xxxxxxxxxxxxxxxxxxxx"   # scope write_repository
# Ou via variables d'environnement au lancement :
#   GITLAB_URL=... GITLAB_TOKEN=... bash scripts/backup-mirror.sh
ENV_FILE="$PROJECT_DIR/scripts/.backup_env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

GITLAB_URL="${GITLAB_URL:-}"     # Ex: https://gitlab.com/<user>/steo-elite-predictor.git
GITLAB_TOKEN="${GITLAB_TOKEN:-}" # Personal Access Token (scope write_repository) — JAMAIS persisté
BITBUCKET_URL="${BITBUCKET_URL:-}"
CODEBERG_URL="${CODEBERG_URL:-}"

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
  # Token injecté uniquement dans l'URL de push à la volée (jamais écrit dans .git/config)
  GITLAB_PUSH_URL="$GITLAB_URL"
  if [ -n "$GITLAB_TOKEN" ]; then
    GITLAB_PUSH_URL=$(printf '%s' "$GITLAB_URL" | sed -E "s|https://|https://oauth2:${GITLAB_TOKEN}@|")
  fi
  if PUSH_OUTPUT=$(git push "$GITLAB_PUSH_URL" main --force 2>&1); then
    echo "$PUSH_OUTPUT" | tail -3
    echo "   ✅ GitLab OK"
  else
    echo "$PUSH_OUTPUT" | sed -E "s|oauth2:[^@]+@|oauth2:***@|g" | tail -5
    echo "   ⚠️ GitLab échoué (vérifier URL/token scope write_repository)"
  fi
else
  echo "[2/5] ⏭️ GitLab non configuré (GITLAB_URL vide — voir scripts/.backup_env)"
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
