import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") # Use service role to bypass anything

if not url or not key:
    print("Missing Supabase credentials in .env")
    exit(1)

supabase: Client = create_client(url, key)

print(f"URL: {url}")
print("Attempting to insert test campaign via Service Role...")

try:
    data, count = supabase.table('campaigns').insert({
        'name': 'AUDIT_TEST_CAMPAIGN',
        'status': 'ACTIVE'
    }).execute()
    print(f"✅ SUCCESS! Data returned: {data}")
except Exception as e:
    print(f"❌ ERROR: {e}")
