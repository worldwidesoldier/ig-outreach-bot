import os
from datetime import datetime, timezone
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Instagram authentication errors that require marking a bot as CHALLENGE
IG_AUTH_ERRORS = {
    "ChallengeRequired",
    "ChallengeResolve",
    "ChallengeUnknownStep",
    "TwoFactorRequired",
    "LoginRequired",
    "login_required",
}

def is_ig_auth_error(error: Exception) -> bool:
    error_str = str(error)
    return any(x in error_str for x in IG_AUTH_ERRORS)

class BrainReporter:
    def __init__(self):
        url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        if not url or not key:
            print("Warning: Supabase credentials not found. Brain reporting disabled.")
            self.client = None
        else:
            self.client = create_client(url, key)

    def report_status(self, username, status, proxy=None, warmup_day=None, profile_pic_url=None, full_name=None):
        if not self.client: return
        
        data = {
            "username": username,
            "status": status,
            "last_login": datetime.now(timezone.utc).isoformat(),
        }
        if proxy:
            data["proxy"] = proxy
        if warmup_day is not None:
            data["warmup_day"] = warmup_day
        if profile_pic_url:
            data["profile_pic_url"] = profile_pic_url
        if full_name:
            data["full_name"] = full_name

        try:
            self.client.table("accounts").update(data).eq("username", username).execute()
            print(f"Logged status '{status}' for bot @{username}")
        except Exception as e:
            print(f"Error reporting to brain: {e}")

    def update_warmup_day(self, username, day):
        if not self.client: return
        try:
            self.client.table("accounts").update({"warmup_day": day}).eq("username", username).execute()
        except Exception as e:
            print(f"Error updating warmup day: {e}")

    def log_outreach(self, bot_username, lead_pk, status, message="", error="", sequence_step=1):
        if not self.client: return
        
        # 1. Get IDs
        bot = self.client.table("accounts").select("id").eq("username", bot_username).single().execute()
        lead = self.client.table("leads").select("id").eq("pk", lead_pk).single().execute()
        
        if not bot.data: return
        
        log_data = {
            "account_id": bot.data["id"],
            "lead_id": lead.data["id"] if lead.data else None,
            "status": status,
            "message_sent": message,
            "error_log": error,
            "sequence_step": sequence_step
        }
        
        try:
            self.client.table("outreach_logs").insert(log_data).execute()
        except Exception as e:
            print(f"Error logging outreach: {e}")
    def log_activity(self, bot_username, activity_type, description):
        if not self.client: return
        
        # Get bot ID
        bot = self.client.table("accounts").select("id").eq("username", bot_username).single().execute()
        if not bot.data: return
        
        log_data = {
            "account_id": bot.data["id"],
            "activity_type": activity_type,
            "description": description
        }
        
        try:
            self.client.table("bot_activity_logs").insert(log_data).execute()
            print(f"Logged activity '{activity_type}' for @{bot_username}")
        except Exception as e:
            print(f"Error logging activity: {e}")

    def report_heartbeat(self):
        if not self.client: return
        try:
            self.client.table("system_status").upsert({
                "id": "engine",
                "last_heartbeat": datetime.now(timezone.utc).isoformat(),
                "status": "ONLINE"
            }).execute()
        except Exception as e:
            print(f"Error reporting heartbeat: {e}")
