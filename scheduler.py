import os
import time
import random
import threading
import schedule
import traceback
from datetime import datetime
from brain_reporter import BrainReporter, is_ig_auth_error
from warmup import run_warmup_protocol, run_recovery_warmup
from sender import run_campaign_step, run_followup_step
from scraper import process_pending_tasks
from bot_utils import get_client
from inbox_manager import InboxManager

os.makedirs("sessions", exist_ok=True)

def log_error(error_msg):
    with open("engine_error.log", "a") as f:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        f.write(f"[{timestamp}] {error_msg}\n")
        f.write(traceback.format_exc())
        f.write("-" * 30 + "\n")

def daily_maintenance():
    try:
        reporter = BrainReporter()
        if not reporter.client: return
        
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Starting Fleet Maintenance...")
        
        res = reporter.client.table("accounts").select("*").in_("status", ["HEALTHY", "WARMING_UP", "AT_RISK"]).execute()
        bots = res.data

        def process_single_bot(bot):
            username = bot['username']
            try:
                client = get_client(
                    username=username,
                    password=bot['password'],
                    proxy=bot['proxy'],
                    two_factor_seed=bot['two_factor_seed'],
                    session_file=f"sessions/{username}.json"
                )

                if bot['status'] == "AT_RISK":
                    # Recovery protocol — gentler warmup for flagged/recovered accounts
                    current_session = (bot.get('warmup_day') or 0) + 1
                    run_recovery_warmup(client, current_session, username, niche_tags=bot.get('niche_tags'))
                elif bot['status'] == "WARMING_UP":
                    current_day = (bot.get('warmup_day') or 0) + 1
                    run_warmup_protocol(client, current_day, username, niche_tags=bot.get('niche_tags'))
                elif bot['status'] == "HEALTHY":
                    # 1. Outreach Step 1
                    run_campaign_step(client, username)

                    # 2. Unfollow cleanup — keep following count under control
                    unfollow_excess(client, username, max_following=150)

                    # 2. Outreach Step 2 (Follow-ups)
                    run_followup_step(client, username)

                # 3. Always sync inbox for healthy/warming bots to detect replies
                inbox = InboxManager(client, username)
                inbox.sync_inbox()

            except Exception as e:
                log_error(f"Error processing bot @{username}: {e}")
                # Only mark CHALLENGE for real Instagram authentication errors
                # Database/code errors should NOT destroy bot status
                if is_ig_auth_error(e):
                    reporter.report_status(username, "CHALLENGE")
                else:
                    print(f"⚠️ Non-IG error for @{username}, status preserved: {str(e)[:100]}")

        # Stagger bot logins — never hit Instagram with simultaneous logins from same IP
        # 1 bot every 3-6 minutes (random) instead of all at once
        threads = []
        for i, bot in enumerate(bots):
            if i > 0:
                delay = random.randint(180, 360)  # 3-6 min between each bot
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Waiting {delay}s before next bot...")
                time.sleep(delay)
            t = threading.Thread(target=process_single_bot, args=(bot,), daemon=True)
            threads.append(t)
            t.start()

        for t in threads:
            t.join(timeout=300)  # Max 5 min per bot
    except Exception as e:
        log_error(f"Maintenance loop crashed: {e}")

def unfollow_excess(client, username, max_following=150):
    """
    If bot is following more than max_following accounts,
    unfollow the oldest ones in batches of 10.
    Keeps following count clean and avoids Instagram flagging.
    """
    try:
        user_id = client.user_id
        following = client.user_following(user_id, amount=max_following + 20)
        count = len(following)

        if count <= max_following:
            return

        to_unfollow = count - max_following
        print(f"  @{username} following {count} — unfollowing {to_unfollow}...")

        unfollowed = 0
        for pk in list(following.keys())[:to_unfollow]:
            try:
                client.user_unfollow(pk)
                unfollowed += 1
                time.sleep(random.randint(15, 30))
            except Exception:
                continue

        print(f"  Unfollowed {unfollowed} accounts for @{username}")
    except Exception as e:
        print(f"  Unfollow check skipped for @{username}: {e}")


def check_fleet_health():
    """
    Lightweight session check every 2 hours.
    Tests each HEALTHY/WARMING_UP bot's session — marks CHALLENGE fast
    without waiting for the next full maintenance cycle.
    """
    try:
        from instagrapi import Client
        reporter = BrainReporter()
        if not reporter.client: return

        res = reporter.client.table("accounts").select("id,username,proxy,device_settings").in_("status", ["HEALTHY", "WARMING_UP"]).execute()
        bots = res.data
        if not bots: return

        print(f"[{datetime.now().strftime('%H:%M:%S')}] Health Check — {len(bots)} bots...")
        ok, flagged = 0, 0

        for bot in bots:
            username = bot['username']
            session_file = f"sessions/{username}.json"
            if not os.path.exists(session_file):
                continue  # No session yet — skip, maintenance will handle it
            try:
                cl = Client()
                cl.delay_range = [1, 3]
                if bot.get('proxy'):
                    cl.set_proxy(bot['proxy'].strip())
                if bot.get('device_settings'):
                    cl.set_settings(bot['device_settings'])
                cl.load_settings(session_file)
                cl.get_timeline_feed()
                ok += 1
            except Exception as e:
                if is_ig_auth_error(e):
                    reporter.report_status(username, "CHALLENGE")
                    flagged += 1
                    print(f"  ⚠️ @{username} → CHALLENGE (session dead)")

        print(f"  ✅ {ok} healthy  |  🚨 {flagged} flagged as CHALLENGE")
    except Exception as e:
        log_error(f"Health check crashed: {e}")

from ai_processor import AILeadProcessor

def run_ai_qualification():
    try:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Running AI Lead Qualification...")
        processor = AILeadProcessor()
        processor.process_pending_leads(batch_size=50)
    except Exception as e:
        log_error(f"AI Processor check crashed: {e}")

def run_scraper_check():
    try:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Checking for tasks...")
        process_pending_tasks()
        # Automatically run AI qualification after scraping to score new leads
        run_ai_qualification()
    except Exception as e:
        log_error(f"Scraper check crashed: {e}")

if __name__ == "__main__":
    print("🚀 IG Outreach Engine Started (Robust Mode)")
    
    # Run once at startup
    run_scraper_check()
    check_fleet_health()
    daily_maintenance()

    # Schedule
    schedule.every(5).minutes.do(run_scraper_check)
    schedule.every(2).hours.do(check_fleet_health)
    schedule.every().day.at("09:00").do(daily_maintenance)
    schedule.every().day.at("13:30").do(daily_maintenance)
    schedule.every().day.at("21:00").do(daily_maintenance)
    
    reporter = BrainReporter()
    while True:
        try:
            reporter.report_heartbeat()
            schedule.run_pending()
        except Exception as e:
            log_error(f"Main loop exception: {e}")
        time.sleep(1)
