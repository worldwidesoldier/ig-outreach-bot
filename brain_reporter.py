import os
from datetime import datetime, timezone
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Instagram errors that mean the account needs manual attention (CHALLENGE)
IG_AUTH_ERRORS = {
    "ChallengeRequired",
    "ChallengeResolve",
    "ChallengeUnknownStep",
    "TwoFactorRequired",
    "LoginRequired",
    "login_required",
}

# Instagram errors that mean a temporary action block (NOT a CHALLENGE — just slow down)
IG_ACTION_BLOCK_ERRORS = {
    "FeedbackRequired",
    "PleaseWaitFewMinutes",
    "RateLimitError",
    "ActionBlocked",
}

def is_ig_auth_error(error: Exception) -> bool:
    """True if the error requires marking the bot as CHALLENGE (manual fix needed)."""
    error_str = str(error)
    error_type = type(error).__name__
    return any(x in error_str or x in error_type for x in IG_AUTH_ERRORS)

def is_ig_action_block(error: Exception) -> bool:
    """True if Instagram issued a temporary action block (bot should pause, not be marked CHALLENGE)."""
    error_str = str(error)
    error_type = type(error).__name__
    return any(x in error_str or x in error_type for x in IG_ACTION_BLOCK_ERRORS)


# Cache bot_id lookups to avoid repeated DB queries for the same username in a session
_bot_id_cache: dict = {}

def _get_bot_id(client, username: str):
    """Returns bot DB id, using in-process cache to avoid N+1 queries."""
    if username not in _bot_id_cache:
        res = client.table("accounts").select("id").eq("username", username).single().execute()
        if res.data:
            _bot_id_cache[username] = res.data["id"]
        else:
            return None
    return _bot_id_cache[username]


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
        elif status == "AT_RISK":
            # Reset warmup counter so recovery protocol starts from session 1
            # If we don't reset this, a bot at warmup_day=21 would skip directly
            # to recovery phase 3 instead of starting from passive scroll (phase 1)
            data["warmup_day"] = 0
        if profile_pic_url:
            data["profile_pic_url"] = profile_pic_url
        if full_name:
            data["full_name"] = full_name

        try:
            self.client.table("accounts").update(data).eq("username", username).execute()
            print(f"Logged status '{status}' for bot @{username}")
            # Auto-alert on critical statuses
            if status in ("CHALLENGE", "BANNED"):
                self.send_alert(
                    "CRITICAL",
                    f"@{username} → {status}",
                    f"Account needs manual attention. Check the War Room dashboard."
                )
            elif status == "AT_RISK":
                self.send_alert(
                    "WARNING",
                    f"@{username} → AT_RISK",
                    f"Action block detected. Recovery warmup will start automatically."
                )
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

        bot_id = _get_bot_id(self.client, bot_username)
        if not bot_id: return

        lead = self.client.table("leads").select("id").eq("pk", lead_pk).single().execute()

        log_data = {
            "account_id": bot_id,
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

        bot_id = _get_bot_id(self.client, bot_username)
        if not bot_id: return

        log_data = {
            "account_id": bot_id,
            "activity_type": activity_type,
            "description": description
        }

        try:
            self.client.table("bot_activity_logs").insert(log_data).execute()
            print(f"Logged activity '{activity_type}' for @{bot_username}")
        except Exception as e:
            print(f"Error logging activity: {e}")

    def log_cycle(self, start: datetime, end: datetime, bots_processed: int):
        if not self.client: return
        try:
            self.client.table("system_status").upsert({
                "id": "engine",
                "last_cycle_start": start.isoformat(),
                "last_cycle_end": end.isoformat(),
                "last_cycle_duration_seconds": int((end - start).total_seconds()),
                "last_cycle_bots_processed": bots_processed
            }).execute()
        except Exception as e:
            print(f"Error logging cycle: {e}")

    def send_alert(self, level: str, title: str, message: str):
        """
        Sends a webhook alert for critical events (CHALLENGE, BANNED, engine down, etc.)
        Set ALERT_WEBHOOK_URL in .env to enable. Supports Slack and Discord webhook formats.
        If not configured, just prints to stdout.
        level: "CRITICAL", "WARNING", or "INFO"
        """
        import urllib.request
        import json as _json

        icons = {"CRITICAL": "🚨", "WARNING": "⚠️", "INFO": "ℹ️"}
        icon = icons.get(level, "🔔")
        full_message = f"{icon} *{level}* — {title}\n{message}"

        print(f"[ALERT] {full_message}")

        webhook_url = os.getenv("ALERT_WEBHOOK_URL")
        if not webhook_url:
            return  # No webhook configured — print-only mode

        try:
            # Slack format (also works for Discord with /slack suffix)
            payload = _json.dumps({"text": full_message}).encode("utf-8")
            req = urllib.request.Request(
                webhook_url,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            urllib.request.urlopen(req, timeout=5)
        except Exception as e:
            print(f"Alert webhook failed: {e}")

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
