"""
football_data_enricher.py — STUB VOLONTAIRE (non implémenté)
=============================================================

STATUT : cette étape est DÉSACTIVÉE. Le workflow GitHub (xgboost-training.yml)
ne l'appelle plus depuis le P2 (2026-09-09).

Historique : ce fichier est resté vide (0 octet) pendant des mois alors que
le workflow prétendait « enrichir depuis football-data.co.uk » — un no-op
silencieux qui donnait l'illusion d'un enrichissement CLV / arbitres /
proxy tactique qui n'existait pas. L'audit ML (P0, Task 7) l'a relevé.

Pour le réactiver un jour, il faudrait :
  1. Télécharger les CSV football-data.co.uk (gratuits, sans quota) :
     mmz14/1516 → saison courante, division par division.
  2. Joindre par équipes (mapping noms BetExplorer/ESPN ↔ football-data).
  3. Produire data/enrichment/training_enrichment.json avec :
     - CLV (cotes de clôture Pinnacle vs cotes d'ouverture)
  4. Consommer le JSON dans ml/train_xgboost.py (DEFAULT_ENRICHMENT_PATH
     est déjà prévu, l'absence du fichier est gérée gracieusement).

En attendant : train_xgboost.py tourne SANS enrichissement, avec des
métriques honnêtes (cf. P0 — cible réelle, CV walk-forward, holdout).
"""

import sys


def main() -> int:
    print(
        "ℹ️  football_data_enricher: non implémenté (stub) — "
        "étape désactivée du workflow, features standards utilisées. "
        "Voir la docstring de ce fichier pour le plan de réactivation."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
