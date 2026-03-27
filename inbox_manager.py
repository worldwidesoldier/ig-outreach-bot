import os
import json
from datetime import datetime, timezone
from brain_reporter import BrainReporter

class InboxManager:
    def __init__(self, client, bot_username, reporter=None):
        self.client = client
        self.bot_username = bot_username
        self.reporter = reporter if reporter is not None else BrainReporter()
        
    def sync_inbox(self):
        """
        Fetches the latest threads and persists new messages to the Brain.
        Marks leads as 'REPLIED' if they sent a message.
        """
        if not self.reporter.client: return
        
        print(f"📥 Syncing inbox for @{self.bot_username}...")
        
        # Get bot ID
        bot_res = self.reporter.client.table("accounts").select("id").eq("username", self.bot_username).single().execute()
        if not bot_res.data: return
        bot_id = bot_res.data["id"]
        
        try:
            threads = self.client.direct_threads(amount=50)  # Enough for 50-bot fleet

            for thread in threads:
                thread_id = thread.id
                # Get the other user's PK (it's a list for group chats, but usually 1 for DMs)
                other_user_id = None
                for user in thread.users:
                    if str(user.pk) != str(self.client.user_id):
                        other_user_id = str(user.pk)
                        break

                # Skip threads where we can't identify the other party
                if not other_user_id:
                    continue

                for msg in thread.messages:
                    if msg.item_type != 'text': continue

                    # 1. Save to Inbox
                    msg_data = {
                        "account_id": bot_id,
                        "thread_id": thread_id,
                        "message_id": msg.id,
                        "sender_username": str(msg.user_id),
                        "other_user_pk": other_user_id,  # Always store the lead's PK regardless of who sent
                        "text": msg.text,
                        "timestamp": msg.timestamp.isoformat()
                    }

                    try:
                        self.reporter.client.table("inbox_messages").upsert(msg_data, on_conflict="message_id").execute()
                    except Exception as e:
                        if "duplicate" not in str(e).lower():
                            print(f"⚠️ Unexpected error upserting message: {e}")

                    # 2. Detect Reply
                    # If this message is FROM the other user (not our bot)
                    if str(msg.user_id) == other_user_id:
                        # Find lead by PK
                        lead_res = self.reporter.client.table("leads").select("id, status").eq("pk", other_user_id).execute()
                        if lead_res.data:
                            lead = lead_res.data[0]
                            if lead["status"] != "REPLIED":
                                self.reporter.client.table("leads").update({"status": "REPLIED"}).eq("id", lead["id"]).execute()
                                self.reporter.log_activity(self.bot_username, "REPLY_DETECTED", f"Lead @{other_user_id} replied! Thread: {thread_id}")
                                print(f"✨ Verified reply from @{other_user_id}! Status set to REPLIED.")

        except Exception as e:
            print(f"❌ Error syncing inbox for @{self.bot_username}: {e}")

if __name__ == "__main__":
    # Test stub
    pass
