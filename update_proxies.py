import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

# New Proxy URL from Proxy-Seller
# Format: http://user:pass@host:port
NEW_PROXY = "http://dubcommedia:AnWUARfnzJ@209.145.57.39:43019"

def update_all_proxies():
    print("Fetching accounts...")
    res = supabase.table("accounts").select("id, username").execute()
    accounts = res.data
    
    if not accounts:
        print("No accounts found.")
        return

    print(f"Updating {len(accounts)} accounts with the new proxy...")
    for acc in accounts:
        try:
            supabase.table("accounts").update({"proxy": NEW_PROXY}).eq("id", acc["id"]).execute()
            print(f"✅ Updated @{acc['username']}")
        except Exception as e:
            print(f"❌ Failed to update @{acc['username']}: {e}")

if __name__ == "__main__":
    update_all_proxies()
    print("\n--- Done! ---")
    print("Now update IG_PROXY in .env and restart the engine.")
