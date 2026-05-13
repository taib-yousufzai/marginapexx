import os
from supabase import create_client

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

res = supabase.table("instruments").select("expiry").eq("underlying_symbol", "NIFTY").not_("expiry", "is", "null").order("expiry").execute()
expiries = sorted(list(set([r['expiry'] for r in res.data])))
print(f"Expiries found: {expiries}")
