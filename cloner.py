import os
import time
import random
import requests
import argparse
from dotenv import load_dotenv
from brain_reporter import BrainReporter
from bot_utils import get_client

load_dotenv()

# Stagger delay between each bot — same principle as scheduler
MIN_DELAY = 180  # 3 minutes
MAX_DELAY = 300  # 5 minutes

def clone_profile(target_bot_username, source_info, source_pic_url):
    """
    Applies already-fetched source profile data to a single bot.
    Source data is fetched once and reused — no repeated public API calls.
    """
    print(f"\n--- Mirroring -> @{target_bot_username} ---")
    reporter = BrainReporter()

    try:
        bot_data = reporter.client.table("accounts").select("*").eq("username", target_bot_username).single().execute().data
        if not bot_data:
            print(f"Bot @{target_bot_username} not found in database. Skipping.")
            return

        # Use get_client() — session reuse + 2FA + proxy
        bot_client = get_client(
            username=bot_data['username'],
            password=bot_data['password'],
            proxy=bot_data.get('proxy'),
            two_factor_seed=bot_data.get('two_factor_seed'),
            session_file=f"sessions/{bot_data['username']}.json"
        )

        # Update bio + name
        print(f"  Updating bio and name...")
        bot_client.edit_profile(
            full_name=source_info.full_name,
            biography=source_info.biography,
            external_url=source_info.external_url or ""
        )

        # Update profile picture
        if source_pic_url:
            print(f"  Uploading profile picture...")
            pic_response = requests.get(source_pic_url, timeout=15)
            if pic_response.status_code == 200:
                pic_path = f"/tmp/{target_bot_username}_avatar.jpg"
                with open(pic_path, "wb") as f:
                    f.write(pic_response.content)
                bot_client.account_change_picture(pic_path)
                os.remove(pic_path)
            else:
                print(f"  Could not download profile picture.")

        reporter.report_status(
            target_bot_username,
            bot_data.get('status', 'WARMING_UP'),
            profile_pic_url=source_pic_url,
            full_name=source_info.full_name
        )
        print(f"  Done @{target_bot_username}")

    except Exception as e:
        print(f"  Error mirroring @{target_bot_username}: {e}")
        # Do NOT mark as CHALLENGE for non-IG-auth errors
        from brain_reporter import is_ig_auth_error
        if is_ig_auth_error(e):
            reporter.report_status(target_bot_username, "CHALLENGE")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="IG Profile Mirroring Engine")
    parser.add_argument("--source", required=True, help="Username of the human account to copy from")
    parser.add_argument("--targets", required=True, help="Comma-separated list of bot usernames to update")

    args = parser.parse_args()
    target_bots = [b.strip() for b in args.targets.split(",") if b.strip()]

    print(f"Mirror started: @{args.source} -> {len(target_bots)} bots")
    print(f"Stagger: {MIN_DELAY//60}-{MAX_DELAY//60} min between each bot\n")

    # Fetch source profile using first bot's authenticated session
    reporter = BrainReporter()
    first_bot = reporter.client.table("accounts").select("*").eq("username", target_bots[0]).single().execute().data
    auth_client = get_client(
        username=first_bot['username'],
        password=first_bot['password'],
        proxy=first_bot.get('proxy'),
        two_factor_seed=first_bot.get('two_factor_seed'),
        session_file=f"sessions/{first_bot['username']}.json"
    )

    print(f"Fetching source profile @{args.source}...")
    source_user_id = auth_client.user_id_from_username(args.source)
    source_info = auth_client.user_info(source_user_id)
    source_pic_url = source_info.profile_pic_url_hd or source_info.profile_pic_url
    print(f"Source: {source_info.full_name} | Bio: {source_info.biography[:40]}...")

    for i, bot_username in enumerate(target_bots):
        clone_profile(bot_username, source_info, source_pic_url)

        if i < len(target_bots) - 1:
            delay = random.randint(MIN_DELAY, MAX_DELAY)
            print(f"\nWaiting {delay//60}m{delay%60}s before next bot ({i+2}/{len(target_bots)})...")
            time.sleep(delay)

    print(f"\nMirror complete. {len(target_bots)} bots updated.")
