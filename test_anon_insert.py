import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not url or not key:
    print("Missing Supabase credentials")
    exit(1)

supabase: Client = create_client(url, key)
print(f"Testing insert with ANON_KEY at {url}")

try:
    res = supabase.table("campaigns").insert({
        "name": "ANON_TEST_CAMPAIGN",
        "status": "ACTIVE"
    }).execute()
    print(f"✅ SUCCESS: {res.data}")
except Exception as e:
    print(f"❌ FAILED: {e}")
