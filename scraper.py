import os
import json
import math
import time
import random
from datetime import datetime, timezone, timedelta
from instagrapi import Client
from dotenv import load_dotenv
from brain_reporter import BrainReporter

load_dotenv()

from bot_utils import get_client


def process_pending_tasks():
    reporter = BrainReporter()
    if not reporter.client: return

    res = reporter.client.table("scrape_tasks").select("*").eq("status", "PENDING").execute()
    tasks = res.data

    if not tasks:
        print("No pending scrape tasks found.")
        return

    bot_res = reporter.client.table("accounts").select("*").eq("status", "HEALTHY").limit(1).execute()
    if not bot_res.data:
        print("No HEALTHY bots available to run scraper.")
        return
    scraper_bot = bot_res.data[0]

    try:
        client = get_client(
            username=scraper_bot['username'],
            password=scraper_bot['password'],
            proxy=scraper_bot.get('proxy'),
            two_factor_seed=scraper_bot.get('two_factor_seed'),
            session_file=f"sessions/{scraper_bot['username']}.json"
        )
    except Exception as e:
        print(f"Failed to initialize scraper bot: {e}")
        return

    for task in tasks:
        task_id = task['id']
        task_type = task.get('task_type', 'USERNAME')
        list_id = task['list_id']

        try:
            reporter.client.table("scrape_tasks").update({"status": "RUNNING"}).eq("id", task_id).execute()

            if task_type == "LOCATION":
                city_name = task['target_username']
                radius_km = task.get('radius_km', 40)
                recency_days = task.get('recency_days', 30)
                print(f"🌍 Location scrape: {city_name} | {radius_km}km radius | last {recency_days} days")
                count = scrape_by_location(client, city_name, radius_km, recency_days, list_id, task_id)
                reporter.client.table("scrape_tasks").update({"status": "COMPLETED", "processed_count": count}).eq("id", task_id).execute()
                print(f"✅ Location scrape complete: {count} leads found")

            else:
                target = task['target_username']
                amount = task['amount']
                print(f"🚀 Account scrape: @{target} ({amount} followers)")
                scrape_to_brain(client, target, list_id=list_id, amount=amount, task_id=task_id)
                reporter.client.table("scrape_tasks").update({"status": "COMPLETED", "processed_count": amount}).eq("id", task_id).execute()
                print(f"✅ Account scrape complete: @{target}")

        except Exception as e:
            print(f"❌ Task failed: {e}")
            reporter.client.table("scrape_tasks").update({
                "status": "FAILED",
                "error_log": str(e)
            }).eq("id", task_id).execute()


def _generate_grid_points(lat, lng, radius_km, step_km=4):
    """
    Generates a grid of lat/lng points covering a circle of radius_km.
    step_km controls density — 4km means points every 4km.
    Returns list of (lat, lng) tuples.
    """
    points = []
    # 1 degree latitude ≈ 111km
    lat_step = step_km / 111.0
    # 1 degree longitude varies by latitude
    lng_step = step_km / (111.0 * math.cos(math.radians(lat)))

    lat_range = int(radius_km / step_km) + 1
    lng_range = int(radius_km / step_km) + 1

    for i in range(-lat_range, lat_range + 1):
        for j in range(-lng_range, lng_range + 1):
            point_lat = lat + (i * lat_step)
            point_lng = lng + (j * lng_step)
            # Only include points within the radius circle
            dist = math.sqrt((i * step_km) ** 2 + (j * step_km) ** 2)
            if dist <= radius_km:
                points.append((point_lat, point_lng))

    print(f"  Grid generated: {len(points)} search points for {radius_km}km radius")
    return points


def scrape_by_location(client, city_name, radius_km, recency_days, list_id, task_id):
    """
    Scrapes Instagram users who posted at locations within radius_km of city_name,
    within the last recency_days days.
    """
    from geopy.geocoders import Nominatim

    reporter = BrainReporter()

    # 1. Geocode city name to lat/lng
    geolocator = Nominatim(user_agent="atlas_ig_scraper")
    location = geolocator.geocode(city_name)
    if not location:
        raise Exception(f"Could not geocode city: {city_name}")

    center_lat, center_lng = location.latitude, location.longitude
    print(f"  📍 {city_name} → ({center_lat:.4f}, {center_lng:.4f})")

    # 2. Generate grid of search points
    grid_points = _generate_grid_points(center_lat, center_lng, radius_km, step_km=4)

    # 3. Collect all unique location IDs from the grid
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=recency_days)
    location_ids_seen = set()
    all_leads = {}  # pk → lead_data, deduped by user

    for idx, (point_lat, point_lng) in enumerate(grid_points):
        try:
            locations = client.location_search(point_lat, point_lng)
            for loc in locations:
                if loc.pk in location_ids_seen:
                    continue
                location_ids_seen.add(loc.pk)

                # 4. Scrape recent posts from this location
                try:
                    medias = client.location_medias_recent(loc.pk, amount=50)
                    for media in medias:
                        # Filter by recency
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
                    pass  # Skip locations that error

        except Exception:
            pass  # Skip grid points that error

        # Update progress every 10 grid points
        if (idx + 1) % 10 == 0:
            try:
                reporter.client.table("scrape_tasks").update({"processed_count": len(all_leads)}).eq("id", task_id).execute()
                print(f"  Progress: {idx+1}/{len(grid_points)} grid points | {len(all_leads)} unique users found")
            except Exception:
                pass

        time.sleep(random.uniform(0.5, 1.5))

    # 5. Bulk upsert leads
    leads_list = list(all_leads.values())
    if leads_list:
        try:
            reporter.client.table("leads").upsert(leads_list, on_conflict="pk").execute()
            print(f"  ✅ {len(leads_list)} leads saved to Brain")
        except Exception as e:
            print(f"  Error saving leads: {e}")

    return len(leads_list)


def scrape_to_brain(client, target_username, list_id=None, amount=100, task_id=None):
    reporter = BrainReporter()
    if not reporter.client:
        print("Error: Supabase client not initialized.")
        return

    print(f"--- Scraping {amount} followers from @{target_username} ---")
    user_id = client.user_id_from_username(target_username)
    followers = client.user_followers(user_id, amount=amount)

    new_leads = []
    processed = 0

    for f_user_id, user_info in followers.items():
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

        if task_id and (processed % 50 == 0 or processed == len(followers)):
            try:
                reporter.client.table("scrape_tasks").update({"processed_count": processed}).eq("id", task_id).execute()
            except Exception:
                pass

    try:
        if new_leads:
            reporter.client.table("leads").upsert(new_leads, on_conflict="pk").execute()
            print(f"Successfully synced {len(new_leads)} leads to the Brain.")
        else:
            print("No leads identified during scrape.")
    except Exception as e:
        print(f"Error syncing to Supabase: {e}")


if __name__ == "__main__":
    process_pending_tasks()
