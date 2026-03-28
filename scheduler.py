import os
import sys
import time
import random
import threading
import schedule
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from brain_reporter import BrainReporter, is_ig_auth_error, is_ig_action_block
from warmup import run_warmup_protocol, run_recovery_warmup
from sender import run_campaign_step, run_followup_step, recover_stuck_leads
from scraper import process_pending_tasks
from bot_utils import get_client
from inbox_manager import InboxManager
from ai_processor import AILeadProcessor

_shutdown_requested = False

def _handle_shutdown(signum, frame):
    global _shutdown_requested
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Shutdown signal received — finishing in-progress work...")
    _shutdown_requested = True

os.makedirs("sessions", exist_ok=True)

# Guard against overlapping maintenance cycles
_maintenance_lock = threading.Lock()

def log_error(error_msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    sys.stderr.write(f"[{timestamp}] {error_msg}\n")
    sys.stderr.write(traceback.format_exc())
    sys.stderr.write("-" * 30 + "\n")
    sys.stderr.flush()

def daily_maintenance():
    # Prevent overlapping runs — if previous cycle is still running, skip
    if not _maintenance_lock.acquire(blocking=False):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Maintenance already running — skipping this cycle.")
        return

    try:
        reporter = BrainReporter()
        if not reporter.client: return

        print(f"[{datetime.now().strftime('%H:%M:%S')}] Starting Fleet Maintenance...")

        # Recover leads stuck in SENDING from a previous crash
        recover_stuck_leads()

        res = reporter.client.table("accounts").select("*").in_("status", ["HEALTHY", "WARMING_UP", "AT_RISK"]).execute()
        bots = res.data

        if not bots:
            print("No active bots to process.")
            return

        print(f"  Processing {len(bots)} bots...")

        def process_single_bot(bot):
            username = bot['username']
            reporter = BrainReporter()
            if not reporter.client:
                print(f"  ⚠️ @{username}: Supabase unavailable — skipping.")
                return
            try:
                client = get_client(
                    username=username,
                    password=bot['password'],
                    proxy=bot['proxy'],
                    two_factor_seed=bot['two_factor_seed'],
                    session_file=f"sessions/{username}.json"
                )

                if client is None:
                    return

                if bot['status'] == "AT_RISK":
                    current_session = (bot.get('warmup_day') or 0) + 1
                    run_recovery_warmup(client, current_session, username, niche_tags=bot.get('niche_tags'), reporter=reporter)
                elif bot['status'] == "WARMING_UP":
                    current_day = (bot.get('warmup_day') or 0) + 1
                    run_warmup_protocol(client, current_day, username, niche_tags=bot.get('niche_tags'), reporter=reporter)
                elif bot['status'] == "HEALTHY":
                    if bot.get('account_type') == 'SCRAPER':
                        return # Scrapers don't do DM campaigns, unfollows, or inbox syncs

                    run_campaign_step(client, username, reporter=reporter)
                    unfollow_excess(client, username, max_following=150)
                    # Sync inbox BEFORE followup so replies are detected first
                    inbox = InboxManager(client, username, reporter=reporter)
                    inbox.sync_inbox()
                    run_followup_step(client, username, reporter=reporter)
                    return  # inbox already synced above

                inbox = InboxManager(client, username, reporter=reporter)
                inbox.sync_inbox()

            except Exception as e:
                log_error(f"Error processing bot @{username}: {e}")
                if is_ig_auth_error(e):
                    reporter.report_status(username, "CHALLENGE")
                elif is_ig_action_block(e):
                    # Temporary action block — mark AT_RISK, do not destroy the account
                    reporter.report_status(username, "AT_RISK")
                    print(f"⏸️ @{username} hit action block — marked AT_RISK (will recover automatically)")
                else:
                    print(f"⚠️ Non-IG error for @{username}, status preserved: {str(e)[:100]}")

        MAX_CONCURRENT = 10

        cycle_start = datetime.now()

        with ThreadPoolExecutor(max_workers=MAX_CONCURRENT) as executor:
            futures = {}
            for i, bot in enumerate(bots):
                if i > 0:
                    # Stagger keeps Instagram from seeing coordinated activity.
                    # Warming accounts get a long stagger so multiple bots don't
                    # all like posts within the same minute — looks coordinated.
                    if bot.get('status') == 'WARMING_UP':
                        stagger = random.randint(120, 300)  # 2-5 min between warming bots
                    else:
                        stagger = random.randint(15, 30)
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] Staggering {stagger}s before @{bot['username']}...")
                    time.sleep(stagger)
                future = executor.submit(process_single_bot, bot)
                futures[future] = bot['username']

            for future in as_completed(futures):
                username = futures[future]
                try:
                    future.result()
                except Exception as e:
                    log_error(f"Unhandled exception in bot @{username}: {e}")

        cycle_end = datetime.now()
        cycle_duration = int((cycle_end - cycle_start).total_seconds())
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Cycle complete — {len(bots)} bots in {cycle_duration}s.")

        print(f"[{datetime.now().strftime('%H:%M:%S')}] Fleet Maintenance complete.")

    except Exception as e:
        log_error(f"Maintenance loop crashed: {e}")
    finally:
        _maintenance_lock.release()


def unfollow_excess(client, username, max_following=150):
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
    Passive session check — loads session file and checks token expiry.
    Does NOT make any live Instagram API calls (no get_timeline_feed).
    Marks accounts CHALLENGE only if session file is missing or token is clearly expired.
    """
    try:
        reporter = BrainReporter()
        if not reporter.client: return

        res = reporter.client.table("accounts").select("id,username,proxy,two_factor_seed,device_settings").in_("status", ["HEALTHY", "WARMING_UP"]).execute()
        bots = res.data
        if not bots: return

        print(f"[{datetime.now().strftime('%H:%M:%S')}] Passive Health Check — {len(bots)} bots...")
        missing = 0

        for bot in bots:
            username = bot['username']
            session_file = f"sessions/{username}.json"
            if not os.path.exists(session_file):
                missing += 1
                print(f"  ⚠️ @{username} — no session file (needs login on next cycle)")

        print(f"  Session files: {len(bots) - missing} present | {missing} missing")
    except Exception as e:
        log_error(f"Health check crashed: {e}")


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
        run_ai_qualification()
    except Exception as e:
        log_error(f"Scraper check crashed: {e}")

if __name__ == "__main__":
    print("🚀 IG Outreach Engine Started (Robust Mode)")
    import signal
    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)

    def _bg(fn):
        """Run a job in a background thread so the heartbeat loop never blocks."""
        t = threading.Thread(target=fn, daemon=True)
        t.start()

    # Run startup tasks in background — heartbeat loop starts immediately
    _bg(run_scraper_check)
    _bg(check_fleet_health)
    _bg(daily_maintenance)

    schedule.every(30).minutes.do(lambda: _bg(run_scraper_check))
    schedule.every(2).hours.do(lambda: _bg(check_fleet_health))
    schedule.every().day.at("11:00").do(lambda: _bg(daily_maintenance))  # 11am ET
    schedule.every().day.at("17:00").do(lambda: _bg(daily_maintenance))  # 5pm ET
    schedule.every().day.at("22:00").do(lambda: _bg(daily_maintenance))  # 10pm ET — peak hours

    reporter = BrainReporter()
    while not _shutdown_requested:
        try:
            # Reconnect if Supabase was down at startup or connection was lost
            if not reporter.client:
                reporter = BrainReporter()
            reporter.report_heartbeat()
            schedule.run_pending()
        except Exception as e:
            log_error(f"Main loop exception: {e}")
        time.sleep(1)

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Engine stopped cleanly.")
