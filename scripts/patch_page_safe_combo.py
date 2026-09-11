#!/usr/bin/env python3
"""Patch Task 16 : retire la fonction inline findBestCombinations de page.tsx
et la remplace par l'import depuis src/lib/safeComboGenerator.ts (logique corrigée)."""
import re

PATH = 'src/app/page.tsx'
with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

start_marker = '  // Algorithme pour trouver les meilleures combinaisons (moins risquées pour la cote cible)\n'
end_marker = '    return uniqueCombinations; // Retourner les 5 meilleures avec matchs uniques\n  };\n'

i = src.find(start_marker)
j = src.find(end_marker)
assert i != -1, 'marqueur début introuvable'
assert j != -1, 'marqueur fin introuvable'
assert j > i, 'marqueurs désordonnés'

end = j + len(end_marker)
removed = src[i:end]
assert 'findBestCombinations' in removed and 'topPicks' in removed, 'bloc inattendu'

replacement = (
    '  // 🔧 Task 16 : moteur extrait dans src/lib/safeComboGenerator.ts\n'
    '  // Corrections : (1) le pick doit être celui PRÉDIT par le pipeline ML\n'
    '  // (predictedResult/predictedWinner) — l\'ancien code ignorait la prédiction\n'
    '  // et proposait toutes les issues ; (2) tri transitive (score 60% sécurité\n'
    '  // + 40% proximité normalisée). Forme de sortie identique (UI inchangée).\n'
)
src = src[:i] + replacement + src[end:]

# Import en tête (après la dernière import ligne simple détectée)
anchor = "import LiveMatchesGrid from '@/components/LiveMatchesGrid';\n"
assert anchor in src
src = src.replace(anchor, anchor + "import { findBestCombinations } from '@/lib/safeComboGenerator';\n", 1)

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)

print(f'✅ Bloc retiré ({removed.count(chr(10))} lignes), import ajouté')
