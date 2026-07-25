"""
Fix Monte-Carlo block by line numbers.
The block contains a single long line with literal \\n characters as text.
"""
import re

FILE = "/home/z/my-project/ml/train_xgboost.py"

with open(FILE, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Find the start line: '    monte_carlo_info = None\n'
# Then a few lines later: the broken line containing 'if "xg_home" in sport_df.columns'
# AND containing literal '\\n' characters (backslash + n as text)

start_idx = None
broken_idx = None
for i, line in enumerate(lines):
    if line.startswith('    monte_carlo_info = None') and start_idx is None:
        # Check if the next non-empty line is the football check
        if i + 1 < len(lines) and 'if len(y) >= 50 and sport == "football"' in lines[i + 1]:
            start_idx = i
            print(f"Found start at line {i+1}: {lines[i].rstrip()}")
    
    if start_idx is not None and broken_idx is None:
        # Find the broken line: contains 'if "xg_home"' AND literal \\n
        if 'if "xg_home" in sport_df.columns' in line and '\\n' in line:
            broken_idx = i
            print(f"Found broken line at line {i+1} (length: {len(line)} chars)")
            break

if start_idx is None or broken_idx is None:
    print(f"ERROR: start={start_idx}, broken={broken_idx}")
    exit(1)

# Show what's right after the broken line
print(f"\nLine after broken (line {broken_idx+2}): {lines[broken_idx+1].rstrip()[:100]}")

# The new multi-sport Monte-Carlo block
new_block_lines = [
    '    monte_carlo_info = None\n',
    '    # Tennis a un scoring non-Poisson (jeux/sets), on skip\n',
    '    if len(y) >= 50 and sport in ("football", "basketball", "hockey", "baseball"):\n',
    '        try:\n',
    '            print(f"   🎲 Monte-Carlo Poisson (10 000 simulations — {sport})...")\n',
    '\n',
    '            # Parametres par sport\n',
    '            sport_mc_config = {\n',
    '                "football":   {"default_h": 1.5, "default_a": 1.1, "min_lambda": 0.3,\n',
    '                               "over_threshold": 2.5, "label": "Over 2.5 goals"},\n',
    '                "basketball": {"default_h": 110.0, "default_a": 105.0, "min_lambda": 80.0,\n',
    '                               "over_threshold": 220.5, "label": "Over 220.5 pts"},\n',
    '                "hockey":     {"default_h": 3.0, "default_a": 2.5, "min_lambda": 1.5,\n',
    '                               "over_threshold": 5.5, "label": "Over 5.5 goals"},\n',
    '                "baseball":   {"default_h": 4.5, "default_a": 4.0, "min_lambda": 1.5,\n',
    '                               "over_threshold": 8.5, "label": "Over 8.5 runs"},\n',
    '            }\n',
    '            mc_cfg = sport_mc_config[sport]\n',
    '\n',
    '            # Estimer les lambdas depuis les donnees\n',
    '            if "xg_home" in sport_df.columns and sport_df["xg_home"].sum() > 0 and sport == "football":\n',
    '                lambda_home = float(sport_df["xg_home"].mean())\n',
    '                lambda_away = float(sport_df["xg_away"].mean())\n',
    '                source = "xG"\n',
    '            elif "home_score" in sport_df.columns and "away_score" in sport_df.columns:\n',
    '                hs = pd.to_numeric(sport_df.get("home_score"), errors="coerce").dropna()\n',
    '                as_ = pd.to_numeric(sport_df.get("away_score"), errors="coerce").dropna()\n',
    '                lambda_home = float(hs.mean()) if len(hs) > 0 else mc_cfg["default_h"]\n',
    '                lambda_away = float(as_.mean()) if len(as_) > 0 else mc_cfg["default_a"]\n',
    '                source = "scores_avg"\n',
    '            else:\n',
    '                lambda_home = mc_cfg["default_h"]\n',
    '                lambda_away = mc_cfg["default_a"]\n',
    '                source = "sport_default"\n',
    '\n',
    '            # Plancher pour Poisson\n',
    '            lambda_home = max(mc_cfg["min_lambda"], lambda_home)\n',
    '            lambda_away = max(mc_cfg["min_lambda"], lambda_away)\n',
    '\n',
    '            n_simulations = 10000\n',
    '            rng = np.random.default_rng(42)\n',
    '\n',
    '            # Simuler les scores\n',
    '            sim_home = rng.poisson(lambda_home, n_simulations)\n',
    '            sim_away = rng.poisson(lambda_away, n_simulations)\n',
    '\n',
    '            # Resultats\n',
    '            home_wins = int((sim_home > sim_away).sum())\n',
    '            away_wins = int((sim_away > sim_home).sum())\n',
    '            draws = int((sim_home == sim_away).sum())\n',
    '\n',
    '            # Score distribution (top 10 scores les plus probables)\n',
    '            score_counts = {}\n',
    '            for i in range(n_simulations):\n',
    '                score = f"{sim_home[i]}-{sim_away[i]}"\n',
    '                score_counts[score] = score_counts.get(score, 0) + 1\n',
    '            top_scores = sorted(score_counts.items(), key=lambda x: x[1], reverse=True)[:10]\n',
    '\n',
    '            # Over threshold probabilite\n',
    '            over_threshold = mc_cfg["over_threshold"]\n',
    '            over_pct = float(((sim_home + sim_away) > over_threshold).sum() / n_simulations * 100)\n',
    '            # BTTS (Both Teams To Score)\n',
    '            btts = float(((sim_home > 0) & (sim_away > 0)).sum() / n_simulations * 100)\n',
    '\n',
    '            # Expected totals\n',
    '            expected_total = float(np.mean(sim_home + sim_away))\n',
    '            std_total = float(np.std(sim_home + sim_away))\n',
    '\n',
    '            # Probabilites normalisees\n',
    '            if sport in ("basketball",):\n',
    '                prob_home = home_wins / n_simulations * 100\n',
    '                prob_away = away_wins / n_simulations * 100\n',
    '                prob_draw = 0.0\n',
    '            else:\n',
    '                prob_home = home_wins / n_simulations * 100\n',
    '                prob_draw = draws / n_simulations * 100\n',
    '                prob_away = away_wins / n_simulations * 100\n',
    '\n',
    '            monte_carlo_info = {\n',
    '                "method": "poisson_simulation",\n',
    '                "sport": sport,\n',
    '                "n_simulations": n_simulations,\n',
    '                "lambda_home": round(lambda_home, 3),\n',
    '                "lambda_away": round(lambda_away, 3),\n',
    '                "lambda_source": source,\n',
    '                "prob_home_win": round(prob_home, 1),\n',
    '                "prob_draw": round(prob_draw, 1),\n',
    '                "prob_away_win": round(prob_away, 1),\n',
    '                "expected_total_score": round(expected_total, 2),\n',
    '                "std_total_score": round(std_total, 2),\n',
    '                "over_threshold_label": mc_cfg["label"],\n',
    '                "over_threshold_value": over_threshold,\n',
    '                "over_threshold_pct": round(over_pct, 1),\n',
    '                "btts_pct": round(btts, 1),\n',
    '                "top_scores": [(s, round(c / n_simulations * 100, 1)) for s, c in top_scores],\n',
    '            }\n',
    '\n',
    '            print(f"      Lambda: {lambda_home:.2f} / {lambda_away:.2f} (source: {source})")\n',
    '            print(f"      MC proba: H {prob_home:.1f}% | D {prob_draw:.1f}% | A {prob_away:.1f}%")\n',
    '            print(f"      {mc_cfg[\'label\']}: {over_pct:.1f}% | BTTS: {btts:.1f}%")\n',
    '            print(f"      Expected total: {expected_total:.1f} ± {std_total:.1f}")\n',
    '            if top_scores:\n',
    '                print(f"      Top score: {top_scores[0][0]} ({top_scores[0][1]:.1f}%)")\n',
    '\n',
    '        except Exception as e:\n',
    '            import traceback\n',
    '            print(f"      ⚠️ Monte-Carlo échoué: {e}")\n',
    '            print(traceback.format_exc()[:500])\n',
]

# Replace lines from start_idx to broken_idx (inclusive)
print(f"\nReplacing lines {start_idx+1} to {broken_idx+1} ({broken_idx - start_idx + 1} lines)")
print(f"With {len(new_block_lines)} new lines")

new_lines = lines[:start_idx] + new_block_lines + lines[broken_idx + 1:]

with open(FILE, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print(f"✅ Fixed. File now has {len(new_lines)} lines (was {len(lines)})")
