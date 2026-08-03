#!/usr/bin/env python3
"""
export-calibration-to-supabase.py
=================================
Export the calibration data (Platt coefficients, reliability bins, Brier scores)
from last_training_result.json to Supabase ml_model.xgboost_params.

Usage:
  # From terminal with Supabase access:
  python3 export-calibration-to-supabase.py
  
  # Or via Vercel API (after deployment):
  curl -X POST "https://YOUR-APP.vercel.app/api/migrate-phase4?secret=XXX"
"""
import json, os, sys

def main():
    # Load training results
    result_path = os.path.join(os.path.dirname(__file__), "last_training_result.json")
    if not os.path.exists(result_path):
        print("❌ last_training_result.json non trouvé. Lancez d'abord train_xgboost.py")
        sys.exit(1)
    
    with open(result_path) as f:
        data = json.load(f)
    
    # Build the xgboost_params payload (same format as train_xgboost.py)
    xgboost_params = {
        "trained": True,
        "sports": {},
        "global_cv_accuracy": data.get("global_cv_accuracy", 0),
        "total_samples": data.get("total_samples", 0),
        "training_timestamp": data.get("timestamp", ""),
    }
    
    for sport, info in data.get("sports", {}).items():
        xgboost_params["sports"][sport] = {
            "cv_accuracy": info["cv_accuracy"],
            "best_confidence_threshold": info["best_confidence_threshold"],
            "top_features": info.get("top_features", []),
            "feature_importance": info.get("feature_importance", {}),
            "samples": info.get("samples", 0),
            "version": info.get("version", ""),
            "trained_at": info.get("trained_at", ""),
            "calibration": info.get("calibration"),
            "backtesting": info.get("backtesting"),
            "ensemble": info.get("ensemble"),
        }
    
    # Try Supabase export
    try:
        from supabase import create_client
        
        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not supabase_key:
            print("⚠️ Variables Supabase manquantes. Export JSON pour import manuel.")
            print_export_json(xgboost_params)
            return
        
        sb = create_client(supabase_url, supabase_key)
        
        # Health check
        sb.table("ml_model").select("id").limit(1).execute()
        
        # Upsert
        from datetime import datetime, timezone
        update_data = {
            "id": "default_model",
            "xgboost_params": json.dumps(xgboost_params),
            "version": f"xgb-{datetime.now(timezone.utc).strftime('%y%m%d')}",
            "samples_used": data.get("total_samples", 0),
            "accuracy": int(round(data.get("global_cv_accuracy", 0) * 100)),
            "last_trained": datetime.now(timezone.utc).isoformat(),
        }
        
        res = sb.table("ml_model").upsert(update_data, on_conflict="id").execute()
        print("✅ Exporté vers Supabase ml_model!")
        
        # Print summary
        for sport, sp in xgboost_params["sports"].items():
            cal = sp.get("calibration", {}) or {}
            print(f"  {sport}: A={cal.get('platt_a', 'N/A')} B={cal.get('platt_b', 'N/A')} Brier={cal.get('brier_score_calibrated', 'N/A')}")
        
    except ImportError:
        print("⚠️ supabase-py non installé. Export JSON pour import manuel.")
        print_export_json(xgboost_params)
    except Exception as e:
        print(f"⚠️ Export Supabase échoué: {e}")
        print("\n📋 Données à importer manuellement dans Supabase:")
        print_export_json(xgboost_params)


def print_export_json(xgboost_params):
    """Print the JSON for manual import into Supabase SQL Editor."""
    # Also save to file for easy import
    export_path = os.path.join(os.path.dirname(__file__), "calibration_export.json")
    with open(export_path, "w") as f:
        json.dump(xgboost_params, f, indent=2)
    
    print(f"\n📁 Données sauvegardées: {export_path}")
    print("\nPour importer manuellement dans Supabase SQL Editor:")
    print("  UPDATE ml_model")
    print("  SET xgboost_params = '<collez le contenu de calibration_export.json>'::jsonb,")
    print("      version = 'xgb-260803',")
    print("      last_trained = NOW()")
    print("  WHERE id = 'default_model';")
    
    # Print calibration summary
    print("\n📊 Résumé Calibration:")
    for sport, sp in xgboost_params["sports"].items():
        cal = sp.get("calibration", {}) or {}
        print(f"  {sport:12s} | Platt A={cal.get('platt_a', 0):>7.4f} B={cal.get('platt_b', 0):>7.4f} | Brier: {cal.get('brier_score_original', 0):.4f} → {cal.get('brier_score_calibrated', 0):.4f}")


if __name__ == "__main__":
    main()
