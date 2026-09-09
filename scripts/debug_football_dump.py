"""Debug approfondi: localiser l'arbre dont le replay diverge sur les données football."""
import json
import math
import sys
import numpy as np
import pandas as pd

sys.path.insert(0, "/home/z/my-project/ml")
import train_xgboost as T
import xgboost as xgb
from xgboost import XGBClassifier

# ── Reproduire exactement le chemin football du run (CSV-only, Supabase injoignable) ──
df = T.load_training_data(None, sport="football")
df = T.engineer_features(df, enrichment=None)
sport_df = df[df["sport"] == "football"].copy()
sport_df = sport_df[sport_df["target_home_win"].notna()].copy()
feature_cols = T.get_feature_columns(sport_df)
sport_df = sport_df.sort_values("match_date", kind="mergesort").reset_index(drop=True)
n_holdout = max(30, int(len(sport_df) * 0.2))
split_idx = len(sport_df) - n_holdout
X = sport_df[feature_cols].fillna(0)
y = sport_df["target_home_win"].astype(int)
X_train, y_train = X.iloc[:split_idx], y.iloc[:split_idx]
X_hold = X.iloc[split_idx:]

model = XGBClassifier(**T.XGB_DEFAULT_PARAMS)
model.fit(X_train, y_train.values)

booster = model.get_booster()
fmap = {name: i for i, name in enumerate(booster.feature_names)}
Xv = X_hold.head(50)

margin_ref = booster.predict(xgb.DMatrix(Xv), output_margin=True)
proba_ref = model.predict_proba(Xv)[:, 1]
sig_ref = 1 / (1 + np.exp(-margin_ref))
print("predict_proba == sigmoid(margin) ?", np.allclose(sig_ref, proba_ref, atol=1e-6))
bs = float(json.loads(booster.save_config())["learner"]["learner_model_param"]["base_score"])
print("base_score =", bs, "| logit =", math.log(bs / (1 - bs)))

dumps = [json.loads(d) for d in booster.get_dump(dump_format="json")]
print("n trees:", len(dumps))

def replay(node, x):
    if "leaf" in node:
        return node["leaf"]
    f = node["split"]
    fidx = fmap.get(f, -1) if isinstance(f, str) else int(f)
    v = x[fidx]
    children = {c["nodeid"]: c for c in node["children"]}
    return replay(children[node["yes"]] if v < node["split_condition"] else children[node["no"]], x)

# Replay PAR ARBRE pour isoler le divergent
for i in range(3):
    xi = [float(v) for v in Xv.iloc[i].values]
    per_tree = np.array([replay(d, xi) for d in dumps])
    ref_i = margin_ref[i]
    # la somme margin_ref = sum + logit(bs) => chaque arbre doit s'additionner
    print(f"\nrow {i}: sum(replay)={per_tree.sum():.4f} vs margin_ref-logit(bs)={ref_i - math.log(bs/(1-bs)):.4f} | delta={per_tree.sum() - (ref_i - math.log(bs/(1-bs))):.4f}")

# Trouver un arbre qui diverge sur au moins une ligne
# NB: en mode solo (iteration_range), XGBoost ajoute logit(base_score) à CHAQUE arbre
logit_bs = math.log(bs / (1 - bs))
print("\n=== par arbre (sur 50 rows) — diff = replay - (solo_ref - logit_bs) ===")
bad_trees = []
for ti, d in enumerate(dumps):
    for i in range(50):
        xi = [float(v) for v in Xv.iloc[i].values]
        solo_ref = booster.predict(xgb.DMatrix(Xv.iloc[[i]]), output_margin=True, iteration_range=(ti, ti + 1))[0]
        got = replay(d, xi)
        want = solo_ref - logit_bs
        if abs(got - want) > 1e-5:
            bad_trees.append((ti, i, got, want, xi))
            break
    if len(bad_trees) >= 3:
        break

if not bad_trees:
    print("tous les arbres rejouent exactement — le problème est ailleurs (offset/agrégation)")
else:
    for ti, i, got, want, xi in bad_trees[:3]:
        print(f"\n arbre {ti} diverge (row {i}): replay={got:.6f} vs ref={want:.6f}")
        row_vals = {booster.feature_names[j]: xi[j] for j in range(len(xi))}
        print("  row features:", {k: round(v, 4) for k, v in row_vals.items() if abs(v) > 1e-9})
        # descendre l'arbre manuellement et afficher le chemin
        node = dumps[ti]
        path = []
        while "leaf" not in node:
            f = node["split"]
            fidx = fmap.get(f, -1) if isinstance(f, str) else int(f)
            v = xi[fidx]
            cond = v < node["split_condition"]
            path.append(f"{f}({v:.6f}) < {node['split_condition']:.6f} ? {cond} -> {'yes' if cond else 'no'}")
            children = {c["nodeid"]: c for c in node["children"]}
            node = children[node["yes"] if cond else node["no"]]
        path.append(f"leaf={node['leaf']:.6f}")
        print("  chemin replay:", " | ".join(path))
