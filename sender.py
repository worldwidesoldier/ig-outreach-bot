import os
import re
import time
import random
from datetime import date, datetime, timezone
from instagrapi import Client
import pyotp
import bot_utils
from dotenv import load_dotenv
from brain_reporter import BrainReporter

load_dotenv()

from bot_utils import get_client

import threading


def parse_spintax(text: str) -> str:
    """
    Resolves spintax in a message. Format: {option1|option2|option3}
    Example: "{Hey|Hi|Hello} {full_name}!" → "Hi John!"
    Nested spintax is also supported.
    """
    def replace_spin(match):
        options = match.group(1).split("|")
        return random.choice(options)

    # Keep resolving until no more spintax left (handles nested)
    while re.search(r'\{([^{}]+)\}', text):
        # Only resolve if it contains pipes (it's spintax, not a variable)
        def smart_replace(match):
            inner = match.group(1)
            if "|" in inner:
                return random.choice(inner.split("|"))
            return match.group(0)  # Leave variables like {full_name} untouched
        text = re.sub(r'\{([^{}]+)\}', smart_replace, text)
    return text


def pre_dm_interaction(client, lead_pk: str, lead_username: str):
    """
    Likes 1 recent post from the lead before sending DM.
    Makes the contact warmer — lead sees notification before DM arrives.
    Skips silently on any error (non-critical).
    """
    try:
        medias = client.user_medias(int(lead_pk), amount=3)
        if medias:
            target = random.choice(medias)
            client.media_like(target.id)
            print(f"  ❤️ Liked @{lead_username}'s post before DM")
            time.sleep(random.randint(30, 90))
    except Exception:
        pass  # Never block DM send because of pre-DM failure

# Thread Lock for safely checking/incrementing DM limits across bot threads
dm_lock = threading.Lock()

# ─── SAFE SEND PROTOCOL (based on BlackHatWorld + industry research) ──────────
# New accounts (< 30 days):  10 DMs/day max, 3/hour max
# Warmed accounts (30+ days): 20 DMs/day max, 5/hour max
# Sleep between DMs: 5-15 minutes (300-900s) — even on failure
# Never burst: pacing matters MORE than total volume
DAILY_LIMIT = 9           # 3 cycles x 3 DMs = 9/day (13h, 18h, 21h)
HOURLY_LIMIT = 3          # Max 3 DMs per cycle
MIN_SLEEP = 240           # 4 minutes minimum between DMs
MAX_SLEEP = 360           # 6 minutes maximum between DMs
INTER_CAMPAIGN_SLEEP = 60 # 1 min between campaigns (even if no leads sent)
# ──────────────────────────────────────────────────────────────────────────────

def _get_hourly_count(reporter, bot_id):
    """Count DMs sent by this bot in the last 60 minutes."""
    from datetime import timedelta
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    res = reporter.client.table("outreach_logs") \
        .select("id", count="exact") \
        .eq("account_id", bot_id) \
        .eq("status", "SUCCESS") \
        .gte("created_at", one_hour_ago) \
        .execute()
    return res.count or 0

def run_campaign_step(client, bot_username):
    reporter = BrainReporter()
    if not reporter.client: return

    # Get bot ID first (needed to filter campaigns)
    bot_res = reporter.client.table("accounts").select("id").eq("username", bot_username).single().execute()
    if not bot_res.data:
        print(f"Bot @{bot_username} not found in DB. Skipping.")
        return
    bot_id = bot_res.data["id"]

    # Fetch campaigns assigned to this bot OR campaigns with no specific account (shared)
    all_campaigns = reporter.client.table("campaigns") \
        .select("*, lead_lists(*), message_templates!campaigns_template_id_fkey(*)") \
        .eq("status", "ACTIVE") \
        .execute().data
    campaigns = [c for c in all_campaigns if c.get("account_id") == bot_id or c.get("account_id") is None]

    if not campaigns:
        print("No active campaigns found.")
        return

    # Check daily limit
    with dm_lock:
        today_str = date.today().isoformat()
        count_res = reporter.client.table("outreach_logs") \
            .select("id", count="exact") \
            .eq("account_id", bot_id) \
            .eq("status", "SUCCESS") \
            .gte("created_at", today_str) \
            .execute()
        daily_count = count_res.count or 0
        if daily_count >= DAILY_LIMIT:
            print(f"Bot @{bot_username} reached daily DM limit ({DAILY_LIMIT}). Skipping.")
            return

    dms_sent_this_session = 0

    for campaign in campaigns:
        list_id = campaign['list_id']
        template = campaign['message_templates']

        if not list_id or not template:
            print(f"Campaign {campaign['name']} missing List or Template. Skipping.")
            continue

        # Re-check daily limit before each campaign
        today_str = date.today().isoformat()
        count_res = reporter.client.table("outreach_logs") \
            .select("id", count="exact") \
            .eq("account_id", bot_id) \
            .eq("status", "SUCCESS") \
            .gte("created_at", today_str) \
            .execute()
        if (count_res.count or 0) >= DAILY_LIMIT:
            print(f"Bot @{bot_username} hit daily limit mid-run. Stopping.")
            break

        # Check hourly limit
        hourly_count = _get_hourly_count(reporter, bot_id)
        if hourly_count >= HOURLY_LIMIT:
            print(f"Bot @{bot_username} hit hourly limit ({HOURLY_LIMIT}/hr). Pausing campaign loop.")
            break

        res = reporter.client.table("leads").select("*").eq("list_id", list_id).in_("status", ["PENDING", "QUALIFIED"]).limit(3).execute()
        leads = res.data

        if not leads:
            continue

        print(f"Bot @{bot_username} starting outreach for Campaign: {campaign['name']}...")

        for lead in leads:
            # Re-check limits before every single DM
            today_str = date.today().isoformat()
            count_res = reporter.client.table("outreach_logs") \
                .select("id", count="exact") \
                .eq("account_id", bot_id) \
                .eq("status", "SUCCESS") \
                .gte("created_at", today_str) \
                .execute()
            if (count_res.count or 0) >= DAILY_LIMIT:
                print(f"Bot @{bot_username} hit daily limit. Stopping.")
                return

            if _get_hourly_count(reporter, bot_id) >= HOURLY_LIMIT:
                print(f"Bot @{bot_username} hit hourly limit. Stopping.")
                return

            sleep_time = random.randint(MIN_SLEEP, MAX_SLEEP)
            try:
                reporter.client.table("leads").update({"status": "SENDING"}).eq("id", lead["id"]).execute()

                name = lead['full_name'] or lead['username']

                # 1. Resolve spintax first, then personalize
                msg = parse_spintax(template['content'])
                msg = msg.replace("{full_name}", name).replace("{username}", lead['username'])

                # 2. Pre-DM interaction — like a post to warm up the lead
                pre_dm_interaction(client, lead['pk'], lead['username'])

                print(f"  → Sending to @{lead['username']}...")
                reporter.log_activity(bot_username, "DM_SEND", f"Sending DM to @{lead['username']}")

                client.direct_send(msg, [int(lead['pk'])])

                reporter.client.table("leads").update({"status": "SENT"}).eq("id", lead["id"]).execute()
                reporter.log_outreach(bot_username, lead["pk"], "SUCCESS", message=msg)
                dms_sent_this_session += 1

                print(f"  ✓ Sent. Sleeping {sleep_time//60}m{sleep_time%60}s before next DM...")

            except Exception as e:
                print(f"  ✗ Error with @{lead['username']}: {e}")
                reporter.client.table("leads").update({"status": "FAILED"}).eq("id", lead["id"]).execute()
                reporter.log_outreach(bot_username, lead["pk"], "FAILED", error=str(e))

            # Always sleep — even on failure
            time.sleep(sleep_time)

        # Sleep between campaigns
        if dms_sent_this_session > 0:
            print(f"  Campaign done. Sleeping {INTER_CAMPAIGN_SLEEP}s before next campaign...")
            time.sleep(INTER_CAMPAIGN_SLEEP)

    print(f"Bot @{bot_username} session complete. {dms_sent_this_session} DMs sent.")


def run_followup_step(client, bot_username):
    """
    Checks for leads that were sent Step 1 and haven't replied after X days.
    Sends Step 2 (Follow-up).
    """
    reporter = BrainReporter()
    if not reporter.client: return

    res = reporter.client.table("campaigns") \
        .select("*, message_templates!followup_template_id(*)") \
        .eq("status", "ACTIVE") \
        .not_.is_("followup_template_id", "null") \
        .execute()
    campaigns = res.data

    if not campaigns: return

    for campaign in campaigns:
        delay = campaign.get("followup_delay_days") or 2
        template = campaign.get("message_templates")

        if not template: continue

        res = reporter.client.table("leads").select("*").eq("list_id", campaign["list_id"]).eq("status", "SENT").execute()
        leads = res.data

        for lead in leads:
            log_res = reporter.client.table("outreach_logs") \
                .select("created_at") \
                .eq("lead_id", lead["id"]) \
                .eq("sequence_step", 1) \
                .order("created_at", desc=True) \
                .limit(1) \
                .execute()

            if not log_res.data: continue

            from datetime import timedelta
            last_sent = datetime.fromisoformat(log_res.data[0]["created_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > last_sent + timedelta(days=delay):
                sleep_time = random.randint(MIN_SLEEP, MAX_SLEEP)
                try:
                    name = lead['full_name'] or lead['username']
                    msg = template['content'].replace("{full_name}", name).replace("{username}", lead['username'])

                    print(f"→ Follow-up to @{lead['username']}...")
                    client.direct_send(msg, [int(lead['pk'])])

                    reporter.client.table("leads").update({"status": "FOLLOWED_UP"}).eq("id", lead["id"]).execute()
                    reporter.log_outreach(bot_username, lead["pk"], "SUCCESS", message=msg, sequence_step=2)

                except Exception as e:
                    print(f"Error following up with {lead['username']}: {e}")

                # Always sleep — even on failure
                time.sleep(sleep_time)

if __name__ == "__main__":
    print("Slave engine ready. Waiting for tasks from the brain...")
