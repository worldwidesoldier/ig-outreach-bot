import os
import time
from brain_reporter import BrainReporter
from bot_utils import get_client
from inbox_manager import InboxManager

def resync():
    reporter = BrainReporter()
    if not reporter.client:
        print("Supabase client not initialized.")
        return

    print("🔍 Fetching active bots for inbox re-sync...")
    res = reporter.client.table("accounts").select("*").in_("status", ["HEALTHY", "WARMING_UP", "AT_RISK"]).execute()
    bots = res.data
    
    if not bots:
        print("No active bots found.")
        return

    for bot in bots:
        username = bot['username']
        print(f"\n🚀 Processing @{username}...")
        try:
            client = get_client(
                username=username,
                password=bot['password'],
                proxy=bot['proxy'],
                two_factor_seed=bot.get('two_factor_seed'),
                session_file=f"sessions/{username}.json"
            )
            
            inbox = InboxManager(client, username)
            inbox.sync_inbox()
            print(f"✅ Finished sync for @{username}")
            
        except Exception as e:
            print(f"❌ Failed to sync @{username}: {e}")
        
        # Slight delay to be safe
        time.sleep(5)

if __name__ == "__main__":
    resync()
