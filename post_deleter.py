import time
import random
import argparse
from brain_reporter import BrainReporter
from bot_utils import get_client

# Safe delay between each post deletion
MIN_DELAY = 10
MAX_DELAY = 25

def delete_all_posts(bot_username: str):
    reporter = BrainReporter()
    bot_data = reporter.client.table("accounts").select("*").eq("username", bot_username).single().execute().data

    if not bot_data:
        print(f"Account @{bot_username} not found in DB. Skipping.")
        return

    print(f"\n--- Bulk Post Deleter: @{bot_username} ---")

    try:
        client = get_client(
            username=bot_data['username'],
            password=bot_data['password'],
            proxy=bot_data.get('proxy'),
            two_factor_seed=bot_data.get('two_factor_seed'),
            session_file=f"sessions/{bot_data['username']}.json"
        )

        user_id = client.user_id
        medias = client.user_medias(user_id, amount=999)

        if not medias:
            print(f"  @{bot_username} has no posts. Done.")
            return

        print(f"  Found {len(medias)} posts. Deleting with {MIN_DELAY}-{MAX_DELAY}s delay each...")

        for i, media in enumerate(medias):
            try:
                client.media_delete(media.id)
                delay = random.randint(MIN_DELAY, MAX_DELAY)
                print(f"  Deleted post {i+1}/{len(medias)}. Waiting {delay}s...")
                time.sleep(delay)
            except Exception as e:
                print(f"  Could not delete post {media.id}: {e}")

        print(f"  Done. All posts deleted for @{bot_username}.")

    except Exception as e:
        print(f"  Error: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk Post Deleter")
    parser.add_argument("--targets", required=True, help="Comma-separated bot usernames")
    args = parser.parse_args()

    targets = [t.strip() for t in args.targets.split(",") if t.strip()]
    print(f"Post Deleter started for {len(targets)} account(s)")

    for username in targets:
        delete_all_posts(username)
