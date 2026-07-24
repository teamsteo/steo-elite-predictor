"""Quick check: what data exists in Supabase predictions table"""
import os
from supabase import create_client

SUPABASE_URL = "https://aumsrakioetvvqopthbs.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bXNyYWtpb2V0dnZxb3B0aGJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTAyNiwiZXhwIjoyMDg5MzMxMDI2fQ.cHkaxhUKCs5hpVLriZN9IHfoRfFuyvMNKOobP5cja14"

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# Check predictions count and columns
print("=== PREDICTIONS ===")
res = sb.table("predictions").select("*", count="exact").limit(1).execute()
print(f"Total predictions: {res.count}")

# Sample completed predictions
res = sb.table("predictions").select("*").eq("status", "completed").not_.is_("result_match", "null").limit(3).execute()
if res.data:
    print(f"\nSample columns: {list(res.data[0].keys())}")
    for r in res.data:
        print(f"  sport={r.get('sport')} result_match={r.get('result_match')} confidence={r.get('confidence')} odds_home={r.get('odds_home')} predicted={r.get('predicted_result')}")

# Count by sport
print("\n=== BY SPORT (completed with result) ===")
for sport in ["football", "basketball", "hockey", "baseball", "tennis"]:
    res = sb.table("predictions").select("id", count="exact").eq("sport", sport).eq("status", "completed").not_.is_("result_match", "null").execute()
    print(f"  {sport}: {res.count}")

# Check matches table
print("\n=== MATCHES ===")
res = sb.table("matches").select("*", count="exact").limit(1).execute()
print(f"Total matches: {res.count}")

if res.data:
    print(f"Sample columns: {list(res.data[0].keys())}")

# Check ml_model
print("\n=== ML_MODEL ===")
try:
    res = sb.table("ml_model").select("*").execute()
    if res.data:
        print(f"Columns: {list(res.data[0].keys())}")
        for r in res.data:
            print(f"  version={r.get('version')} samples={r.get('samples_used')} accuracy={r.get('accuracy')}")
    else:
        print("  No rows")
except Exception as e:
    print(f"  Error: {e}")

# Check predictions with result_match true vs false
print("\n=== WIN/LOSS DISTRIBUTION ===")
for sport in ["football", "basketball", "hockey", "baseball", "tennis"]:
    wins = sb.table("predictions").select("id", count="exact").eq("sport", sport).eq("status", "completed").eq("result_match", True).execute()
    losses = sb.table("predictions").select("id", count="exact").eq("sport", sport).eq("status", "completed").eq("result_match", False).execute()
    print(f"  {sport}: {wins.count}W / {losses.count}L ({wins.count/(wins.count+losses.count)*100:.1f}%)" if wins.count+losses.count > 0 else f"  {sport}: no data")
