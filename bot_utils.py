import os
import pyotp
import time
import random
import json
from instagrapi import Client
from instagrapi.exceptions import ClientError, LoginRequired
from dotenv import load_dotenv
from brain_reporter import BrainReporter, is_ig_auth_error

load_dotenv()

def human_delay(min_sec=2, max_sec=5):
    """Simulates natural user thinking time."""
    time.sleep(random.uniform(min_sec, max_sec))

def simulate_typing(client, user_id, min_sec=3, max_sec=8):
    """Simulates the 'typing...' status in Instagram DMs."""
    try:
        client.direct_answer_extend_session() # Ensures session is fresh
        # instagrapi doesn't have a direct 'typing' method in the stable public API, 
        # but we simulate the time it takes to type.
        print(f"DEBUG: Simulating typing for {user_id}...")
        human_delay(min_sec, max_sec)
    except:
        pass

def human_like(client, media_id):
    """Likes a post with a natural delay before and after."""
    try:
        human_delay(1, 3)
        client.media_like(media_id)
        print(f"❤️ Liked media {media_id}")
        human_delay(2, 5)
    except Exception as e:
        print(f"⚠️ Failed to like media {media_id}: {e}")

def human_comment(client, media_id, text):
    """Comments on a post simulating typing speed."""
    try:
        human_delay(2, 4)
        client.media_comment(media_id, text)
        print(f"💬 Commented on {media_id}: {text}")
        human_delay(3, 6)
    except Exception as e:
        print(f"⚠️ Failed to comment on media {media_id}: {e}")

def get_client(username, password, proxy=None, two_factor_seed=None, session_file=None):
    """
    Unified client factory for all bots. 
    Handles:
    1. Proxy Setup (Sanitized)
    2. Device Fingerprinting (Persistent)
    3. Session Management
    4. 2FA Login
    """
    cl = Client()
    reporter = BrainReporter()

    # 1. Humanized Delay Settings
    cl.delay_range = [2, 7] # Random 2-7 seconds between requests

    # 2. Auto-resolve TOTP challenges (Authentication App)
    # When Instagram asks for 2FA code, bot generates it automatically.
    # SMS/phone challenges return None → fall through to manual resolution.
    if two_factor_seed:
        def _auto_challenge_handler(uname, choice):
            try:
                from instagrapi.mixins.challenge import ChallengeChoice
                if choice == ChallengeChoice.TOTP:
                    code = pyotp.TOTP(two_factor_seed).now()
                    print(f"🤖 @{username} auto-resolving TOTP challenge: {code}")
                    try:
                        reporter.client.table("accounts").update({"challenge_type": "TOTP"}).eq("username", username).execute()
                    except Exception:
                        pass
                    return code
                elif choice == ChallengeChoice.SMS:
                    print(f"📱 @{username} SMS challenge — manual resolution required")
                    try:
                        reporter.client.table("accounts").update({"challenge_type": "SMS"}).eq("username", username).execute()
                    except Exception:
                        pass
                else:
                    try:
                        reporter.client.table("accounts").update({"challenge_type": "UNKNOWN"}).eq("username", username).execute()
                    except Exception:
                        pass
            except Exception:
                pass
            return None
        cl.challenge_code_handler = _auto_challenge_handler

    # 3. Proxy Setup
    if proxy:
        proxy = proxy.strip()
        cl.set_proxy(proxy)
    else:
        env_proxy = os.getenv("IG_PROXY")
        if env_proxy:
            cl.set_proxy(env_proxy)

    # 3. Device Fingerprinting (The "Market Leader" approach)
    # Fetch device settings from Supabase if they exist
    device_settings = None
    try:
        if reporter.client:
            res = reporter.client.table("accounts").select("device_settings").eq("username", username).single().execute()
            if res.data and res.data.get("device_settings"):
                device_settings = res.data["device_settings"]
    except Exception as e:
        print(f"⚠️ Could not fetch device settings for @{username}: {e}")

    if device_settings:
        print(f"📱 Bot @{username} loading persistent device fingerprint...")
        cl.set_settings(device_settings)
    else:
        print(f"🆕 Bot @{username} generating NEW unique device fingerprint...")
        # Note: instagrapi generates new settings on init, pinning them now
        new_settings = cl.get_settings()
        try:
            if reporter.client:
                reporter.client.table("accounts").update({"device_settings": new_settings}).eq("username", username).execute()
        except Exception as e:
            print(f"⚠️ Failed to persist new device settings: {e}")

    # 4. Session Management — try to reuse existing session first
    session_valid = False
    if session_file and os.path.exists(session_file):
        try:
            cl.load_settings(session_file)
            # Verify session is still active without a full re-login
            cl.get_timeline_feed()
            session_valid = True
            print(f"🔑 Bot @{username} session reused (no re-login needed).")
        except Exception:
            print(f"⚠️ Bot @{username} session expired, doing fresh login...")
            cl = Client()  # Fresh client to avoid stale state
            cl.delay_range = [2, 7]
            if proxy:
                cl.set_proxy(proxy.strip())
            if device_settings:
                cl.set_settings(device_settings)

    # 5. Login Flow — only if session was not reused
    if not session_valid:
        try:
            time.sleep(random.uniform(2, 5))

            if two_factor_seed:
                totp = pyotp.TOTP(two_factor_seed)
                verification_code = totp.now()
                cl.login(username, password, verification_code=verification_code)
            else:
                cl.login(username, password)

            if session_file:
                os.makedirs(os.path.dirname(session_file) if os.path.dirname(session_file) else "sessions", exist_ok=True)
                cl.dump_settings(session_file)

            print(f"✅ Bot @{username} fresh login OK.")

        except Exception as e:
            print(f"❌ Login failed for @{username}: {e}")
            if is_ig_auth_error(e):
                reporter.report_status(username, "CHALLENGE")
            raise e

    return cl
