"""Debug: pourquoi le replay du dump ne matche pas predict_proba (XGBoost 2.1)."""
import json
import math
import numpy as np
import pandas as pd
from xgboost import XGBClassifier

rng = np.random.RandomState(42)
n = 800
X = pd.DataFrame({
    "a": rng.rand(n),
    "b": rng.rand(n) * 2 - 1,
    "c": rng.randint(0, 2, n).astype(float),
})
y = ((X["a"] * 0.7 + X["b"] * 0.5 + X["c"] * 0.3 + rng.rand(n) * 0.4) > 0.9).astype(int)

m = XGBClassifier(n_estimators=20, max_depth=4, verbosity=0)
m.fit(X, y)

booster = m.get_booster()
print("feature_names:", booster.feature_names)

cfg = json.loads(booster.save_config())
print("base_score (config):", cfg["learner"]["learner_model_param"]["base_score"])

Xd = X.head(50)
proba_ref = m.predict_proba(Xd)[:, 1]
margin_ref = booster.predict(xgb_D := __import__("xgboost").DMatrix(Xd), output_margin=True)

dumps = booster.get_dump(dump_format="json")
fmap = {name: i for i, name in enumerate(booster.feature_names)}
print("n trees:", len(dumps))
print("première feuille du dump[0]:", json.loads(dumps[0])["children"][0] if "children" in json.loads(dumps[0]) else json.loads(dumps[0]))

def replay(node, x):
    if "leaf" in node:
        return node["leaf"]
    f = node["split"]
    fidx = fmap.get(f, -1) if isinstance(f, str) else int(f)
    v = x[fidx]
    children = {c["nodeid"]: c for c in node["children"]}
    return replay(children[node["yes"]] if v < node["split_condition"] else children[node["no"]], x)

sums = np.array([sum(replay(json.loads(d), list(row)) for d in dumps) for row in Xd.values])

print("\nmargin_ref[:5]  :", np.round(margin_ref[:5], 4))
print("sum(leaf)[:5]   :", np.round(sums[:5], 4))
diff = margin_ref - sums
print("diff (margin - sumleaf) min/max/mean:", diff.min(), diff.max(), diff.mean())
print("diff == 0 partout ?", np.allclose(diff, 0))

# candidates offset
bs = float(cfg["learner"]["learner_model_param"]["base_score"])
logit_bs = math.log(bs / (1 - bs))
for off, label in [(0.0, "0"), (logit_bs, f"logit(base_score)={logit_bs:.4f}")]:
    p = 1 / (1 + np.exp(-(sums + off)))
    print(f"offset {label}: max|p - proba_ref| = {np.abs(p - proba_ref).max():.2e}")
