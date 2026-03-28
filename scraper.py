import os
import json
import math
import time
import random
import threading
from datetime import datetime, timezone, timedelta
from instagrapi import Client
from dotenv import load_dotenv
from brain_reporter import BrainReporter

load_dotenv()

from bot_utils import get_client

DAILY_SCRAPE_LIMIT = 500   # Safe daily ceiling — industry research shows 500 combined actions/day max
PER_SESSION_LIMIT = 200   # One page per run, one API call per run — no bursts


# ─── DAILY LIMIT HELPERS ──────────────────────────────────────────────────────

def _get_daily_count(reporter, bot):
    """
    Returns current daily_scrape_count for this bot.
    Resets to 0 if last_scrape_date is not today.
    """
    today = datetime.now(timezone.utc).date().isoformat()
    last_date = bot.get('last_scrape_date')

    if last_date != today:
        reporter.client.table("accounts").update({
            "daily_scrape_count": 0,
            "last_scrape_date": today
        }).eq("id", bot['id']).execute()
        return 0

    return bot.get('daily_scrape_count') or 0


def _increment_daily_count(reporter, bot_id, amount):
    """Fetches current count and increments it."""
    fresh = reporter.client.table("accounts").select("daily_scrape_count, last_scrape_date").eq("id", bot_id).single().execute().data
    today = datetime.now(timezone.utc).date().isoformat()
    current = fresh.get('daily_scrape_count') or 0
    reporter.client.table("accounts").update({
        "daily_scrape_count": current + amount,
        "last_scrape_date": today
    }).eq("id", bot_id).execute()


# ─── PER-BOT TASK PROCESSOR (runs in its own thread) ─────────────────────────

def _process_bot_tasks(bot, tasks, reporter):
    """
    Processes a list of USERNAME tasks assigned to a single bot.
    - Checks daily limit before each task
    - Sleeps 60-180s between tasks
    """
    username = bot['username']

    try:
        client = get_client(
            username=username,
            password=bot['password'],
            proxy=bot.get('proxy'),
            two_factor_seed=bot.get('two_factor_seed'),
            session_file=f"sessions/{username}.json"
        )
    except Exception as e:
        print(f"❌ @{username} failed to initialize: {e}")
        return

    user_id_cache = {}  # target_username -> Instagram user_id (resolved once, reused across tasks)

    for i, task in enumerate(tasks):
        task_id = task['id']
        list_id = task['list_id']

        # Re-fetch bot to get fresh daily count
        fresh_bot = reporter.client.table("accounts").select(
            "id, daily_scrape_count, last_scrape_date"
        ).eq("id", bot['id']).single().execute().data

        daily_count = _get_daily_count(reporter, fresh_bot)

        if daily_count >= DAILY_SCRAPE_LIMIT:
            print(f"  @{username} hit daily limit ({DAILY_SCRAPE_LIMIT}). Skipping {len(tasks) - i} remaining task(s).")
            # Put remaining tasks back to PENDING so another bot can pick them up
            remaining_ids = [t['id'] for t in tasks[i:]]
            reporter.client.table("scrape_tasks").update({"status": "PENDING"}).in_("id", remaining_ids).execute()
            break

        # Cap amount so we don't exceed daily limit
        # Get processed_count so we know where we are in a massive scrape
        processed_so_far = task.get('processed_count') or 0
        remaining_to_scrape = task['amount'] - processed_so_far

        if remaining_to_scrape <= 0:
            reporter.client.table("scrape_tasks").update({"status": "COMPLETED"}).eq("id", task_id).execute()
            continue

        target = task['target_username']

        # Resolve user_id once per target — avoids one extra API call per scheduler run
        if target not in user_id_cache:
            try:
                user_id_cache[target] = client.user_id_from_username(target)
            except Exception as e:
                print(f"  ❌ Could not resolve @{target}: {e}")
                reporter.client.table("scrape_tasks").update({"status": "PENDING"}).eq("id", task_id).execute()
                continue
        target_user_id = user_id_cache[target]

        try:
            reporter.client.table("scrape_tasks").update({"status": "RUNNING"}).eq("id", task_id).execute()

            current_cursor = task.get('next_cursor')

            print(f"🚀 @{username} → @{target} | daily: {daily_count}/{DAILY_SCRAPE_LIMIT} | progress: {processed_so_far}/{task['amount']}")

            # Returns (cursor, actual_new_count) — only counts truly new leads inserted
            new_cursor, actual_count = scrape_to_brain(client, target, list_id=list_id, task_id=task_id, start_cursor=current_cursor, user_id=target_user_id)

            # Increment by real inserts, not an estimate — keeps processed_count accurate
            _increment_daily_count(reporter, bot['id'], actual_count)

            new_processed_count = processed_so_far + actual_count
            # Task is complete when cursor is exhausted OR we've hit the requested amount
            new_status = "COMPLETED" if (not new_cursor or new_processed_count >= task['amount']) else "PENDING"

            reporter.client.table("scrape_tasks").update({
                "status": new_status,
                "processed_count": new_processed_count,
                "next_cursor": new_cursor
            }).eq("id", task_id).execute()

            print(f"✅ @{username} page done: @{target} ({new_processed_count}/{task['amount']})")

        except Exception as e:
            print(f"❌ @{username} task failed ({task['target_username']}): {e}")
            # Fetch current processed_count from DB — checkpoints inside scrape_to_brain
            # may have already saved partial progress, so preserve it.
            try:
                saved = reporter.client.table("scrape_tasks").select("processed_count, next_cursor").eq("id", task_id).single().execute().data
                saved_count = saved.get("processed_count") or processed_so_far
                saved_cursor = saved.get("next_cursor")
            except Exception:
                saved_count = processed_so_far
                saved_cursor = current_cursor
            # Mark PENDING (not FAILED) so the engine auto-retries next cycle
            # with a potentially different bot. Log the error for visibility.
            reporter.client.table("scrape_tasks").update({
                "status": "PENDING",
                "processed_count": saved_count,
                "next_cursor": saved_cursor,
                "error_log": str(e)
            }).eq("id", task_id).execute()
            print(f"  ↩️  Task reset to PENDING (progress: {saved_count}/{task['amount']}) — will retry next cycle.")

        # Delay between tasks — never rush consecutive scrapes
        if i < len(tasks) - 1:
            delay = random.randint(60, 180)
            print(f"  @{username} waiting {delay}s before next task...")
            time.sleep(delay)


# ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────

def process_pending_tasks():
    reporter = BrainReporter()
    if not reporter.client: return

    res = reporter.client.table("scrape_tasks").select("*").eq("status", "PENDING").execute()
    tasks = res.data

    if not tasks:
        print("No pending scrape tasks found.")
        return

    bot_res = reporter.client.table("accounts").select("*").eq("status", "HEALTHY").eq("account_type", "SCRAPER").execute()
    bots = bot_res.data

    if not bots:
        print("No HEALTHY bots available to run scraper.")
        return

    # Split by task type
    username_tasks = [t for t in tasks if t.get('task_type', 'USERNAME') == 'USERNAME']
    location_tasks = [t for t in tasks if t.get('task_type') == 'LOCATION']

    print(f"📋 {len(tasks)} tasks | {len(bots)} HEALTHY bots | {len(username_tasks)} USERNAME + {len(location_tasks)} LOCATION")

    # ── Round-robin assignment of USERNAME tasks across bots ──────────────────
    # Shuffle bots so repeated failures don't always land on the same bot.
    bots_shuffled = bots[:]
    random.shuffle(bots_shuffled)
    bot_task_map = {bot['id']: [] for bot in bots_shuffled}
    for i, task in enumerate(username_tasks):
        assigned = bots_shuffled[i % len(bots_shuffled)]
        bot_task_map[assigned['id']].append(task)

    # ── Launch one thread per bot ─────────────────────────────────────────────
    threads = []
    for bot in bots:
        assigned = bot_task_map[bot['id']]
        if not assigned:
            continue
        print(f"  @{bot['username']} → {len(assigned)} task(s)")
        t = threading.Thread(target=_process_bot_tasks, args=(bot, assigned, reporter), daemon=True)
        threads.append(t)
        t.start()

    # ── LOCATION tasks — uses first available bot (unchanged behavior) ─────────
    if location_tasks:
        try:
            first_bot = bots[0]
            client = get_client(
                username=first_bot['username'],
                password=first_bot['password'],
                proxy=first_bot.get('proxy'),
                two_factor_seed=first_bot.get('two_factor_seed'),
                session_file=f"sessions/{first_bot['username']}.json"
            )
            for task in location_tasks:
                task_id = task['id']
                city_name = task['target_username']
                radius_km = task.get('radius_km', 40)
                recency_days = task.get('recency_days', 30)
                list_id = task['list_id']
                try:
                    reporter.client.table("scrape_tasks").update({"status": "RUNNING"}).eq("id", task_id).execute()
                    print(f"🌍 Location scrape: {city_name} | {radius_km}km | last {recency_days} days")
                    count = scrape_by_location(client, city_name, radius_km, recency_days, list_id, task_id)
                    reporter.client.table("scrape_tasks").update({
                        "status": "COMPLETED",
                        "processed_count": count
                    }).eq("id", task_id).execute()
                    print(f"✅ Location done: {count} leads")
                except Exception as e:
                    reporter.client.table("scrape_tasks").update({
                        "status": "FAILED",
                        "error_log": str(e)
                    }).eq("id", task_id).execute()
        except Exception as e:
            print(f"❌ Failed to initialize bot for location tasks: {e}")

    for t in threads:
        t.join(timeout=600)  # Max 10 min per bot thread


# ─── LOCATION SCRAPING (unchanged) ───────────────────────────────────────────

def _generate_grid_points(lat, lng, radius_km, step_km=4):
    """
    Generates a grid of lat/lng points covering a circle of radius_km.
    step_km controls density — 4km means points every 4km.
    Returns list of (lat, lng) tuples.
    """
    points = []
    lat_step = step_km / 111.0
    lng_step = step_km / (111.0 * math.cos(math.radians(lat)))

    lat_range = int(radius_km / step_km) + 1
    lng_range = int(radius_km / step_km) + 1

    for i in range(-lat_range, lat_range + 1):
        for j in range(-lng_range, lng_range + 1):
            point_lat = lat + (i * lat_step)
            point_lng = lng + (j * lng_step)
            dist = math.sqrt((i * step_km) ** 2 + (j * step_km) ** 2)
            if dist <= radius_km:
                points.append((point_lat, point_lng))

    print(f"  Grid generated: {len(points)} search points for {radius_km}km radius")
    return points


def scrape_by_location(client, city_name, radius_km, recency_days, list_id, task_id):
    from geopy.geocoders import Nominatim

    reporter = BrainReporter()

    geolocator = Nominatim(user_agent="atlas_ig_scraper")
    location = geolocator.geocode(city_name)
    if not location:
        raise Exception(f"Could not geocode city: {city_name}")

    center_lat, center_lng = location.latitude, location.longitude
    print(f"  📍 {city_name} → ({center_lat:.4f}, {center_lng:.4f})")

    grid_points = _generate_grid_points(center_lat, center_lng, radius_km, step_km=4)

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=recency_days)
    location_ids_seen = set()
    all_leads = {}

    for idx, (point_lat, point_lng) in enumerate(grid_points):
        try:
            locations = client.location_search(point_lat, point_lng)
            for loc in locations:
                if loc.pk in location_ids_seen:
                    continue
                location_ids_seen.add(loc.pk)

                try:
                    medias = client.location_medias_recent(loc.pk, amount=50)
                    for media in medias:
                        taken_at = media.taken_at
                        if taken_at.tzinfo is None:
                            taken_at = taken_at.replace(tzinfo=timezone.utc)
                        if taken_at < cutoff_date:
                            continue

                        user = media.user
                        if str(user.pk) not in all_leads:
                            all_leads[str(user.pk)] = {
                                "pk": str(user.pk),
                                "username": user.username,
                                "full_name": user.full_name,
                                "source_username": f"GEO:{city_name}",
                                "list_id": list_id,
                                "status": "PENDING",
                                "bio": "",
                                "follower_count": 0
                            }

                    time.sleep(random.uniform(1, 3))

                except Exception as e:
                    print(f"  ⚠️ Location {loc.pk} error: {str(e)[:80]}")

        except Exception as e:
            print(f"  ⚠️ Grid point ({point_lat:.4f}, {point_lng:.4f}) error: {str(e)[:80]}")

        if (idx + 1) % 10 == 0:
            try:
                if task_id:
                    reporter.client.table("scrape_tasks").update({"processed_count": len(all_leads)}).eq("id", task_id).execute()
                print(f"  Progress: {idx+1}/{len(grid_points)} points | {len(all_leads)} unique users found")
                # Checkpoint save every 50 grid points to avoid losing work on long scrapes
                if (idx + 1) % 50 == 0 and all_leads:
                    checkpoint_leads = list(all_leads.values())
                    try:
                        reporter.client.table("leads").upsert(checkpoint_leads, on_conflict="pk").execute()
                        print(f"  💾 Mid-scrape checkpoint: {len(checkpoint_leads)} leads persisted")
                    except Exception as ce:
                        print(f"  ⚠️ Checkpoint save failed: {ce}")
            except Exception:
                pass

        time.sleep(random.uniform(0.5, 1.5))

    leads_list = list(all_leads.values())
    if leads_list:
        # Save in batches of 100 so partial work is never lost
        saved = 0
        batch_size = 100
        for i in range(0, len(leads_list), batch_size):
            batch = leads_list[i:i + batch_size]
            try:
                reporter.client.table("leads").upsert(batch, on_conflict="pk").execute()
                saved += len(batch)
                print(f"  💾 Checkpoint: {saved}/{len(leads_list)} leads saved")
            except Exception as e:
                print(f"  ⚠️ Batch save error (leads {i}-{i+batch_size}): {e}")
        print(f"  ✅ Location scrape complete: {saved} leads saved to Brain")
    else:
        print(f"  ⚠️ No leads found for location scrape")

    return len(leads_list)


# ─── USERNAME SCRAPING ────────────────────────────────────────────────────────
#
# ROOT CAUSE OF RATE LIMITS:
# user_followers_v1_chunk() has an internal while loop — asking for 1000 users
# causes it to fire 5 consecutive API calls (Instagram returns ~200/page) with
# only 2-7s delays. Instagram sees a burst on the followers endpoint → 400.
#
# FIX: _scrape_one_page() makes exactly ONE raw API call per scheduler run.
# ~200 users/run × every 5 min = 10k followers in ~4 hours. Safe and natural.
# ─────────────────────────────────────────────────────────────────────────────

def _scrape_one_page(client, user_id, cursor=""):
    """
    Make exactly ONE API request to Instagram's followers endpoint.
    Returns (list_of_UserShort, next_cursor_string).
    next_cursor is "" when there are no more pages.
    """
    from instagrapi.extractors import extract_user_short
    result = client.private_request(
        f"friendships/{user_id}/followers/",
        params={
            "max_id": cursor or "",
            "count": 200,
            "rank_token": client.rank_token,
            "search_surface": "follow_list_page",
            "query": "",
            "enable_groups": "true",
        },
    )
    users = [extract_user_short(u) for u in result.get("users", [])]
    next_cursor = result.get("next_max_id") or ""
    return users, next_cursor


def scrape_to_brain(client, target_username, list_id=None, amount=100, task_id=None, start_cursor=None, user_id=None):
    """
    Scrapes exactly ONE page of followers (~200 users) and inserts only NEW leads.
    Returns (next_cursor, actual_new_count).
    - user_id: pass the pre-resolved Instagram user ID to skip an extra API call.
    - Deduplicates against existing leads in the same list before inserting.
    """
    reporter = BrainReporter()
    if not reporter.client:
        print("Error: Supabase client not initialized.")
        return None, 0

    print(f"--- Scraping one page of followers from @{target_username} (cursor: {start_cursor or 'start'}) ---")

    if user_id is None:
        user_id = client.user_id_from_username(target_username)

    # One page = one API call = no burst, no rate limit
    users, new_cursor = _scrape_one_page(client, user_id, cursor=start_cursor or "")

    print(f"  Page returned {len(users)} users. Next cursor: {'yes' if new_cursor else 'END'}")

    if not users:
        print("  No users returned from this page.")
        return new_cursor or None, 0

    # Dedup: check which PKs on this page already exist in this list
    existing_pks: set = set()
    try:
        if list_id:
            page_pks = [str(u.pk) for u in users]
            existing_res = reporter.client.table("leads") \
                .select("pk") \
                .eq("list_id", list_id) \
                .in_("pk", page_pks) \
                .execute()
            existing_pks = {row['pk'] for row in (existing_res.data or [])}
    except Exception as e:
        print(f"  ⚠️ Dedup check failed (inserting all): {e}")

    new_leads = [
        {
            "pk": str(u.pk),
            "username": u.username,
            "full_name": u.full_name,
            "source_username": target_username,
            "list_id": list_id,
            "status": "PENDING",
            "bio": getattr(u, 'biography', ""),
            "follower_count": getattr(u, 'follower_count', 0)
        }
        for u in users
        if str(u.pk) not in existing_pks
    ]

    actual_new = len(new_leads)
    skipped = len(users) - actual_new
    if skipped:
        print(f"  Deduped: {skipped} already in list — {actual_new} genuinely new leads.")

    try:
        if new_leads:
            reporter.client.table("leads").upsert(new_leads, on_conflict="pk").execute()
            print(f"  Synced {actual_new} new leads to DB.")
        else:
            print(f"  All {len(users)} followers on this page already in list — skipping insert.")
            actual_new = 0
    except Exception as e:
        print(f"  Error syncing to Supabase: {e}")
        actual_new = 0

    return new_cursor or None, actual_new


if __name__ == "__main__":
    process_pending_tasks()
