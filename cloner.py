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
        bot_client.account_edit(
            full_name=source_info.full_name or "",
            biography=source_info.biography or "",
        )

        # Update profile picture
        if source_pic_url:
            print(f"  Uploading profile picture...")
            pic_response = requests.get(source_pic_url, timeout=15)
            if pic_response.status_code == 200:
                pic_path = f"/tmp/{target_bot_username}_avatar.jpg"
                try:
                    with open(pic_path, "wb") as f:
                        f.write(pic_response.content)
                    bot_client.account_change_picture(pic_path)
                finally:
                    if os.path.exists(pic_path):
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


def publish_post(target_bots, image_url, caption=""):
    """
    Publishes a photo post to each target bot with safe stagger delays.
    Never runs two accounts simultaneously.
    """
    import tempfile
    reporter = BrainReporter()

    print(f"\n📸 Publishing post to {len(target_bots)} bots...")
    print(f"   Caption: {caption[:60]}{'...' if len(caption) > 60 else ''}")
    print(f"   Stagger: {MIN_DELAY//60}-{MAX_DELAY//60} min between each bot\n")

    # Download image once
    print(f"Downloading image...")
    try:
        resp = requests.get(image_url, timeout=30)
        if resp.status_code != 200:
            print(f"❌ Could not download image: HTTP {resp.status_code}")
            return
        suffix = ".jpg" if "jpg" in image_url.lower() else ".png"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(resp.content)
            local_path = f.name
        print(f"Image downloaded: {len(resp.content) // 1024}KB\n")
    except Exception as e:
        print(f"❌ Download error: {e}")
        return

    try:
        for i, bot_username in enumerate(target_bots):
            print(f"[{i+1}/{len(target_bots)}] @{bot_username}")
            reporter2 = BrainReporter()
            try:
                bot_data = reporter2.client.table("accounts").select("*").eq("username", bot_username).single().execute().data
                if not bot_data or bot_data["status"] in ("CHALLENGE", "DEAD"):
                    print(f"  ⚠️  Skipping — status: {bot_data.get('status') if bot_data else 'not found'}")
                    continue

                client = get_client(
                    username=bot_data["username"],
                    password=bot_data["password"],
                    proxy=bot_data.get("proxy"),
                    two_factor_seed=bot_data.get("two_factor_seed"),
                    session_file=f"sessions/{bot_data['username']}.json",
                )

                result = client.photo_upload(local_path, caption=caption)
                print(f"  ✅ Posted: {result.pk}")
                reporter2.log_activity(bot_username, "POST_PUBLISHED", f"Post {result.pk}: {caption[:50]}")

            except Exception as e:
                print(f"  ❌ Error: {e}")
                from brain_reporter import is_ig_auth_error
                reporter2.log_activity(bot_username, "POST_ERROR", str(e)[:100])
                if is_ig_auth_error(e):
                    reporter2.report_status(bot_username, "CHALLENGE")

            if i < len(target_bots) - 1:
                delay = random.randint(MIN_DELAY, MAX_DELAY)
                print(f"\n  Waiting {delay//60}m{delay%60}s before next bot...\n")
                time.sleep(delay)
    finally:
        if local_path and os.path.exists(local_path):
            os.remove(local_path)

    print(f"\n✅ Publishing complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="IG Profile Mirror + Post Publisher")
    parser.add_argument("--mode", choices=["profile", "post"], default="profile", help="Operation mode")
    parser.add_argument("--source", help="Source username to mirror profile from (profile mode)")
    parser.add_argument("--targets", required=True, help="Comma-separated bot usernames")
    parser.add_argument("--image-url", help="Image URL to post (post mode)")
    parser.add_argument("--caption", default="", help="Post caption (post mode)")

    args = parser.parse_args()
    target_bots = [b.strip() for b in args.targets.split(",") if b.strip()]

    if args.mode == "profile":
        if not args.source:
            print("❌ --source required for profile mode")
            raise SystemExit(1)

        print(f"Mirror started: @{args.source} -> {len(target_bots)} bots")
        print(f"Stagger: {MIN_DELAY//60}-{MAX_DELAY//60} min between each bot\n")

        reporter = BrainReporter()
        first_bot = reporter.client.table("accounts").select("*").eq("username", target_bots[0]).single().execute().data
        auth_client = get_client(
            username=first_bot["username"],
            password=first_bot["password"],
            proxy=first_bot.get("proxy"),
            two_factor_seed=first_bot.get("two_factor_seed"),
            session_file=f"sessions/{first_bot['username']}.json",
        )

        print(f"Fetching source profile @{args.source}...")
        source_user_id = auth_client.user_id_from_username(args.source)
        source_info = auth_client.user_info(source_user_id)
        source_pic_url = source_info.profile_pic_url_hd or source_info.profile_pic_url
        print(f"Source: {source_info.full_name} | Bio: {(source_info.biography or '')[:40]}...\n")

        for i, bot_username in enumerate(target_bots):
            clone_profile(bot_username, source_info, source_pic_url)
            if i < len(target_bots) - 1:
                delay = random.randint(MIN_DELAY, MAX_DELAY)
                print(f"\nWaiting {delay//60}m{delay%60}s before next bot ({i+2}/{len(target_bots)})...")
                time.sleep(delay)

        print(f"\n✅ Mirror complete. {len(target_bots)} bots updated.")

    elif args.mode == "post":
        if not args.image_url:
            print("❌ --image-url required for post mode")
            raise SystemExit(1)
        publish_post(target_bots, args.image_url, caption=args.caption)
