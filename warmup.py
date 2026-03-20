import time
import random
from brain_reporter import BrainReporter
from brain_reporter import is_ig_auth_error

# ─── WARMUP PROTOCOL (based on BlackHatWorld research) ────────────────────────
# Day 1-2:  Passive only — scroll feed, view stories. No likes.
# Day 3-4:  Light likes — 5-8 posts, 45-90s between each.
# Day 5-6:  Niche engagement — hashtag likes, 60-120s between each.
# Day 7+:   Promote to HEALTHY.
#
# Rules:
# - Never mark CHALLENGE for non-IG errors (DB errors, code bugs)
# - Always use human-like delays between actions
# - Never follow during warmup (creates unfollow debt)
# ──────────────────────────────────────────────────────────────────────────────

def run_warmup_protocol(client, day, username, niche_tags=None):
    reporter = BrainReporter()
    print(f"--- Warmup Day {day} for @{username} ---")

    # Stagger start — never all bots at same time
    stagger_delay = random.randint(60, 180)
    print(f"  Staggering {stagger_delay}s...")
    time.sleep(stagger_delay)

    try:
        if day <= 2:
            _warmup_passive(client, username, reporter)

        elif day <= 4:
            _warmup_light_likes(client, username, reporter)

        elif day <= 6:
            _warmup_niche_likes(client, username, reporter, niche_tags)

        else:
            # Day 7+: final check then promote
            print(f"  Day {day}: Running final feed check before promotion...")
            reporter.log_activity(username, "WARMUP_FINAL", f"Day {day}: Pre-promotion check")
            client.get_timeline_feed()
            time.sleep(random.randint(30, 60))

        # Promote if completed 7 days
        status = "HEALTHY" if day >= 7 else "WARMING_UP"
        reporter.report_status(username, status, warmup_day=day)

        if status == "HEALTHY":
            print(f"  @{username} is now HEALTHY and ready for outreach!")
        else:
            print(f"  Warmup day {day} complete for @{username}.")

    except Exception as e:
        print(f"  Warmup error for @{username}: {e}")
        # CRITICAL: only mark CHALLENGE for real Instagram auth errors
        # Code bugs, DB errors, network timeouts must NOT destroy bot status
        if is_ig_auth_error(e):
            reporter.report_status(username, "CHALLENGE")
            print(f"  IG auth error detected — @{username} marked CHALLENGE.")
        else:
            print(f"  Non-IG error — status preserved for @{username}.")


def _warmup_passive(client, username, reporter):
    """Day 1-2: Just scroll and view stories. No interactions."""
    print(f"  Passive scroll + stories (3-5 min)...")
    reporter.log_activity(username, "WARMUP_SCROLL", "Passive feed scroll")

    client.get_timeline_feed()
    time.sleep(random.randint(180, 300))

    try:
        stories = client.get_reels_tray_feed()
        if stories:
            print(f"  Viewed stories tray.")
        reporter.log_activity(username, "WARMUP_STORY", "Viewed stories tray")
    except Exception:
        pass


def _warmup_light_likes(client, username, reporter):
    """Day 3-4: Like 5-8 posts from feed with human delays."""
    likes_to_give = random.randint(5, 8)
    print(f"  Light engagement: {likes_to_give} likes on feed...")
    reporter.log_activity(username, "WARMUP_LIKE", f"Light engagement: {likes_to_give} likes")

    try:
        feed = client.get_timeline_feed()
        feed_items = feed if isinstance(feed, list) else feed.get("feed_items", [])

        liked = 0
        for item in feed_items:
            if liked >= likes_to_give:
                break
            try:
                media_id = item.get("media_or_ad", {}).get("id") or item.get("id")
                if media_id:
                    client.media_like(media_id)
                    liked += 1
                    delay = random.uniform(45, 90)
                    print(f"  Liked {liked}/{likes_to_give}. Waiting {delay:.0f}s...")
                    time.sleep(delay)
            except Exception:
                continue
    except Exception as e:
        print(f"  Could not fetch feed: {e}")


def _warmup_niche_likes(client, username, reporter, niche_tags=None):
    """Day 5-6: Like posts from niche hashtags. No follows."""
    tags = niche_tags if niche_tags else ["lifestyle", "miami", "foodie", "nightlife", "marketing"]
    tag = random.choice(tags)
    likes_to_give = random.randint(6, 10)

    print(f"  Niche engagement: #{tag}, {likes_to_give} likes...")
    reporter.log_activity(username, "WARMUP_NICHE", f"Niche likes on #{tag}")

    try:
        medias = client.hashtag_medias_recent(tag, amount=15)
        liked = 0

        for media in medias:
            if liked >= likes_to_give:
                break
            try:
                client.media_like(media.id)
                liked += 1
                delay = random.uniform(60, 120)
                print(f"  Liked {liked}/{likes_to_give} from #{tag}. Waiting {delay:.0f}s...")
                time.sleep(delay)
            except Exception:
                continue

        print(f"  Niche warmup complete: {liked} likes on #{tag}")
    except Exception as e:
        print(f"  Hashtag fetch failed: {e}")



# ─── RECOVERY WARMUP PROTOCOL (for AT_RISK / previously flagged accounts) ────
# Runs 3x/day via scheduler (9h / 13h30 / 21h) = 3 sessions per day
#
# Sessions 1-6   (~2 days):  Passive only — scroll + stories. Zero interactions.
# Sessions 7-15  (~3 days):  Micro likes — 1-2 per session, 90-150s between each.
# Sessions 16-30 (~5 days):  Light likes — 3-4 per session, 90-150s between each.
# Session 31+    (~10 days): Promote to WARMING_UP day 0 → normal protocol takes over.
#
# Key differences vs normal warmup:
# - Fewer likes per session (1-2 vs 5-8)
# - Longer delays (90-150s vs 45-90s)
# - Never promotes to HEALTHY directly — goes through full 7-day normal warmup after
# ─────────────────────────────────────────────────────────────────────────────

def run_recovery_warmup(client, session, username, niche_tags=None):
    """
    Gentle recovery protocol for AT_RISK accounts.
    `session` is the warmup_day counter — increments each scheduler run.
    """
    reporter = BrainReporter()
    print(f"--- Recovery Session {session} for @{username} ---")

    # Short stagger — these are sensitive accounts
    stagger = random.randint(90, 240)
    print(f"  Staggering {stagger}s...")
    time.sleep(stagger)

    try:
        if session <= 6:
            # Phase 1: passive only
            _recovery_passive(client, username, reporter, session)

        elif session <= 15:
            # Phase 2: micro likes (1-2 per session)
            _recovery_micro_likes(client, username, reporter, max_likes=2)

        elif session <= 30:
            # Phase 3: light likes (3-4 per session)
            _recovery_micro_likes(client, username, reporter, max_likes=4)

        else:
            # Phase 4: graduated — promote to normal warmup
            print(f"  Session {session}: Recovery complete. Promoting to WARMING_UP.")
            reporter.log_activity(username, "RECOVERY_COMPLETE", f"Session {session}: Entering normal warmup")
            reporter.report_status(username, "WARMING_UP", warmup_day=0)
            print(f"  @{username} is now WARMING_UP — normal 7-day protocol begins.")
            return

        reporter.report_status(username, "AT_RISK", warmup_day=session)
        print(f"  Recovery session {session} complete for @{username}.")

    except Exception as e:
        print(f"  Recovery error for @{username}: {e}")
        if is_ig_auth_error(e):
            reporter.report_status(username, "CHALLENGE")
            print(f"  IG auth error — @{username} marked CHALLENGE.")
        else:
            print(f"  Non-IG error — status preserved for @{username}.")


def _recovery_passive(client, username, reporter, session):
    """Phases 1: scroll feed + stories only. Short session."""
    print(f"  Recovery passive (session {session} of 6)...")
    reporter.log_activity(username, "RECOVERY_SCROLL", f"Recovery passive session {session}")

    client.get_timeline_feed()
    time.sleep(random.randint(120, 240))  # 2-4 min scroll

    try:
        client.get_reels_tray_feed()
        reporter.log_activity(username, "RECOVERY_STORY", "Recovery stories view")
        time.sleep(random.randint(60, 120))
    except Exception:
        pass


def _recovery_micro_likes(client, username, reporter, max_likes=2):
    """Phases 2-3: very few likes with long delays."""
    likes_to_give = random.randint(1, max_likes)
    print(f"  Recovery micro-likes: {likes_to_give} likes (max {max_likes})...")
    reporter.log_activity(username, "RECOVERY_LIKE", f"Recovery: {likes_to_give} likes")

    # Start with passive scroll
    client.get_timeline_feed()
    time.sleep(random.randint(60, 120))

    try:
        feed = client.get_timeline_feed()
        feed_items = feed if isinstance(feed, list) else feed.get("feed_items", [])

        liked = 0
        for item in feed_items:
            if liked >= likes_to_give:
                break
            try:
                media_id = item.get("media_or_ad", {}).get("id") or item.get("id")
                if media_id:
                    client.media_like(media_id)
                    liked += 1
                    delay = random.uniform(90, 150)  # Longer than normal warmup
                    print(f"  Liked {liked}/{likes_to_give}. Waiting {delay:.0f}s...")
                    time.sleep(delay)
            except Exception:
                continue
    except Exception as e:
        print(f"  Could not fetch feed for recovery: {e}")


if __name__ == "__main__":
    pass
