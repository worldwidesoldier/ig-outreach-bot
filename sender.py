import os
import re
import time
import random
from datetime import date, datetime, timezone, timedelta
from dotenv import load_dotenv
from brain_reporter import BrainReporter
import threading

load_dotenv()

def parse_spintax(text: str) -> str:
    """
    Resolves spintax: {option1|option2|option3}
    Variables like {full_name} are left untouched.
    """
    def smart_replace(match):
        inner = match.group(1)
        if "|" in inner:
            return random.choice(inner.split("|"))
        return match.group(0)

    while re.search(r'\{[^{}]*\|[^{}]*\}', text):
        text = re.sub(r'\{([^{}]+)\}', smart_replace, text)
    return text


# ─── RATE LIMITS ──────────────────────────────────────────────────────────────
# Conservative limits based on industry research (BlackHatWorld + instagrapi community)
# New accounts (< 30 days warmup): keep at 9/day
# Aged accounts (30+ days): can go up to 20/day but we stay conservative
DAILY_LIMIT   = 9    # Total DMs per bot per day (Step 1 + Step 2 combined)
HOURLY_LIMIT  = 3    # Max DMs per hour per bot
MIN_SLEEP     = 240  # 4 min minimum between DMs
MAX_SLEEP     = 360  # 6 min maximum between DMs
# ──────────────────────────────────────────────────────────────────────────────

# Thread-safe lock for daily limit checks across concurrent bot threads
dm_lock = threading.Lock()


def _get_daily_count(reporter, bot_id) -> int:
    """Count all DMs sent by this bot today (Step 1 + Step 2 combined)."""
    today_str = date.today().isoformat()
    res = reporter.client.table("outreach_logs") \
        .select("id", count="exact") \
        .eq("account_id", bot_id) \
        .eq("status", "SUCCESS") \
        .gte("created_at", today_str) \
        .execute()
    return res.count or 0


def _get_hourly_count(reporter, bot_id) -> int:
    """Count DMs sent by this bot in the last 60 minutes."""
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    res = reporter.client.table("outreach_logs") \
        .select("id", count="exact") \
        .eq("account_id", bot_id) \
        .eq("status", "SUCCESS") \
        .gte("created_at", one_hour_ago) \
        .execute()
    return res.count or 0


def recover_stuck_leads():
    """
    Resets leads stuck in SENDING status back to QUALIFIED.
    Called on engine startup to recover from crashes or mid-cycle restarts.
    """
    reporter = BrainReporter()
    if not reporter.client: return
    try:
        res = reporter.client.table("leads").update({"status": "QUALIFIED"}).eq("status", "SENDING").execute()
        if res.data:
            print(f"♻️  Recovered {len(res.data)} leads stuck in SENDING → QUALIFIED")
    except Exception as e:
        print(f"⚠️  Could not recover stuck leads: {e}")


def run_campaign_step(client, bot_username):
    """Send Step 1 DMs for all active campaigns assigned to this bot."""
    reporter = BrainReporter()
    if not reporter.client: return

    bot_res = reporter.client.table("accounts").select("id").eq("username", bot_username).single().execute()
    if not bot_res.data:
        print(f"Bot @{bot_username} not found in DB. Skipping.")
        return
    bot_id = bot_res.data["id"]

    # Check daily limit upfront (thread-safe)
    with dm_lock:
        if _get_daily_count(reporter, bot_id) >= DAILY_LIMIT:
            print(f"Bot @{bot_username} reached daily DM limit ({DAILY_LIMIT}). Skipping.")
            return

    all_campaigns = reporter.client.table("campaigns") \
        .select("*, lead_lists(*), message_templates!campaigns_template_id_fkey(*)") \
        .eq("status", "ACTIVE") \
        .execute().data
    campaigns = [c for c in all_campaigns if c.get("account_id") == bot_id or c.get("account_id") is None]

    if not campaigns:
        print(f"No active campaigns for @{bot_username}.")
        return

    dms_sent_this_session = 0

    for campaign in campaigns:
        list_id = campaign['list_id']
        template = campaign['message_templates']

        if not list_id or not template:
            print(f"Campaign '{campaign['name']}' missing List or Template. Skipping.")
            continue

        # Re-check limits before each campaign
        if _get_daily_count(reporter, bot_id) >= DAILY_LIMIT:
            print(f"Bot @{bot_username} hit daily limit. Stopping.")
            break
        if _get_hourly_count(reporter, bot_id) >= HOURLY_LIMIT:
            print(f"Bot @{bot_username} hit hourly limit ({HOURLY_LIMIT}/hr). Stopping.")
            break

        leads = reporter.client.table("leads") \
            .select("*") \
            .eq("list_id", list_id) \
            .in_("status", ["QUALIFIED"]) \
            .limit(3) \
            .execute().data

        if not leads:
            continue

        print(f"Bot @{bot_username} starting outreach for Campaign: {campaign['name']}...")

        for lead in leads:
            # Re-check before every single DM
            if _get_daily_count(reporter, bot_id) >= DAILY_LIMIT:
                print(f"Bot @{bot_username} hit daily limit. Stopping.")
                return
            if _get_hourly_count(reporter, bot_id) >= HOURLY_LIMIT:
                print(f"Bot @{bot_username} hit hourly limit. Stopping.")
                return

            sleep_time = random.randint(MIN_SLEEP, MAX_SLEEP)
            try:
                # Mark as SENDING to prevent double-processing across threads
                reporter.client.table("leads").update({"status": "SENDING"}).eq("id", lead["id"]).execute()

                name = lead['full_name'] or lead['username']
                msg = parse_spintax(template['content'])
                msg = msg.replace("{full_name}", name).replace("{username}", lead['username'])

                print(f"  → Sending to @{lead['username']}...")
                reporter.log_activity(bot_username, "DM_SEND", f"Sending DM to @{lead['username']}")

                client.direct_send(msg, [int(lead['pk'])])

                reporter.client.table("leads").update({"status": "SENT"}).eq("id", lead["id"]).execute()
                reporter.log_outreach(bot_username, lead["pk"], "SUCCESS", message=msg, sequence_step=1)
                dms_sent_this_session += 1

                print(f"  ✓ Sent. Sleeping {sleep_time//60}m{sleep_time%60}s before next DM...")

            except Exception as e:
                print(f"  ✗ Error with @{lead['username']}: {e}")
                # Reset to QUALIFIED so it gets retried next cycle
                reporter.client.table("leads").update({"status": "QUALIFIED"}).eq("id", lead["id"]).execute()
                reporter.log_outreach(bot_username, lead["pk"], "FAILED", error=str(e), sequence_step=1)

            time.sleep(sleep_time)

    print(f"Bot @{bot_username} outreach complete. {dms_sent_this_session} DMs sent this session.")


def run_followup_step(client, bot_username):
    """Send Step 2 follow-ups to leads who haven't replied after X days."""
    reporter = BrainReporter()
    if not reporter.client: return

    bot_res = reporter.client.table("accounts").select("id").eq("username", bot_username).single().execute()
    if not bot_res.data: return
    bot_id = bot_res.data["id"]

    # Follow-ups share the same daily limit as Step 1
    if _get_daily_count(reporter, bot_id) >= DAILY_LIMIT:
        print(f"Bot @{bot_username} hit daily limit — skipping follow-ups.")
        return

    res = reporter.client.table("campaigns") \
        .select("*, message_templates!followup_template_id(*)") \
        .eq("status", "ACTIVE") \
        .not_.is_("followup_template_id", "null") \
        .execute()
    campaigns = res.data

    if not campaigns: return

    for campaign in campaigns:
        if _get_daily_count(reporter, bot_id) >= DAILY_LIMIT:
            print(f"Bot @{bot_username} hit daily limit during follow-ups. Stopping.")
            return
        if _get_hourly_count(reporter, bot_id) >= HOURLY_LIMIT:
            print(f"Bot @{bot_username} hit hourly limit during follow-ups. Stopping.")
            return

        delay_days = campaign.get("followup_delay_days") or 2
        template = campaign.get("message_templates")
        if not template: continue

        leads = reporter.client.table("leads") \
            .select("*") \
            .eq("list_id", campaign["list_id"]) \
            .eq("status", "SENT") \
            .execute().data

        for lead in leads:
            if _get_daily_count(reporter, bot_id) >= DAILY_LIMIT:
                return
            if _get_hourly_count(reporter, bot_id) >= HOURLY_LIMIT:
                return

            log_res = reporter.client.table("outreach_logs") \
                .select("created_at") \
                .eq("lead_id", lead["id"]) \
                .eq("sequence_step", 1) \
                .eq("status", "SUCCESS") \
                .order("created_at", desc=True) \
                .limit(1) \
                .execute()

            if not log_res.data: continue

            last_sent = datetime.fromisoformat(log_res.data[0]["created_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) <= last_sent + timedelta(days=delay_days):
                continue  # Not enough time has passed

            sleep_time = random.randint(MIN_SLEEP, MAX_SLEEP)
            try:
                name = lead['full_name'] or lead['username']
                msg = parse_spintax(template['content'])
                msg = msg.replace("{full_name}", name).replace("{username}", lead['username'])

                print(f"  → Follow-up to @{lead['username']}...")
                client.direct_send(msg, [int(lead['pk'])])

                reporter.client.table("leads").update({"status": "FOLLOWED_UP"}).eq("id", lead["id"]).execute()
                reporter.log_outreach(bot_username, lead["pk"], "SUCCESS", message=msg, sequence_step=2)
                print(f"  ✓ Follow-up sent. Sleeping {sleep_time//60}m{sleep_time%60}s...")

            except Exception as e:
                print(f"  ✗ Follow-up error with @{lead['username']}: {e}")

            time.sleep(sleep_time)


if __name__ == "__main__":
    print("Sender module loaded.")
