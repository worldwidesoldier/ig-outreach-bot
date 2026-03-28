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

DAILY_SCRAPE_LIMIT = 5000


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

        amount = min(remaining_to_scrape, DAILY_SCRAPE_LIMIT - daily_count)

        try:
            reporter.client.table("scrape_tasks").update({"status": "RUNNING"}).eq("id", task_id).execute()

            target = task['target_username']
            current_cursor = task.get('next_cursor')

            print(f"🚀 @{username} → @{target} ({amount} followers) | daily: {daily_count}/{DAILY_SCRAPE_LIMIT} | progress: {processed_so_far}/{task['amount']}")

            new_cursor = scrape_to_brain(client, target, list_id=list_id, amount=amount, task_id=task_id, start_cursor=current_cursor)

            _increment_daily_count(reporter, bot['id'], amount)

            new_processed_count = processed_so_far + amount
            new_status = "COMPLETED" if new_processed_count >= task['amount'] else "PENDING"

            reporter.client.table("scrape_tasks").update({
                "status": new_status,
                "processed_count": new_processed_count,
                "next_cursor": new_cursor
            }).eq("id", task_id).execute()

            print(f"✅ @{username} done: @{target}")

        except Exception as e:
            print(f"❌ @{username} task failed ({task['target_username']}): {e}")
            reporter.client.table("scrape_tasks").update({
                "status": "FAILED",
                "error_log": str(e)
            }).eq("id", task_id).execute()

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
    bot_task_map = {bot['id']: [] for bot in bots}
    for i, task in enumerate(username_tasks):
        assigned = bots[i % len(bots)]
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

                except Exception:
                    pass

        except Exception:
            pass

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

def scrape_to_brain(client, target_username, list_id=None, amount=100, task_id=None, start_cursor=None):
    reporter = BrainReporter()
    if not reporter.client:
        print("Error: Supabase client not initialized.")
        return None

    print(f"--- Scraping {amount} followers from @{target_username} ---")
    user_id = client.user_id_from_username(target_username)
    
    # We use v1_chunk to support pagination
    users, new_cursor = client.user_followers_v1_chunk(user_id, max_amount=amount, max_id=start_cursor or "")

    new_leads = []
    processed = 0

    for user_info in users:
        lead_data = {
            "pk": str(user_info.pk),
            "username": user_info.username,
            "full_name": user_info.full_name,
            "source_username": target_username,
            "list_id": list_id,
            "status": "PENDING",
            "bio": getattr(user_info, 'biography', ""),
            "follower_count": getattr(user_info, 'follower_count', 0)
        }
        new_leads.append(lead_data)
        processed += 1

        if task_id and (processed % 50 == 0 or processed == len(users)):
            try:
                base_count = reporter.client.table("scrape_tasks").select("processed_count").eq("id", task_id).single().execute().data.get('processed_count', 0)
                reporter.client.table("scrape_tasks").update({"processed_count": base_count + processed}).eq("id", task_id).execute()
            except Exception:
                pass

    try:
        if new_leads:
            reporter.client.table("leads").upsert(new_leads, on_conflict="pk").execute()
            print(f"Successfully synced {len(new_leads)} unique leads to DB.")
        else:
            print("No leads found.")
    except Exception as e:
        print(f"Error syncing to Supabase: {e}")
        
    return new_cursor


if __name__ == "__main__":
    process_pending_tasks()
