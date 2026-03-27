# ATLAS IG — Instagram Outreach Engine

Private Instagram DM outreach system. Python engine + Next.js dashboard + Supabase backend.
Fully deployed on VPS — engine runs 24/7, dashboard accessible from anywhere.

## Infrastructure

| Component | Details |
|-----------|---------|
| **VPS** | Ubuntu 24.04 — `5.78.193.8` |
| **Dashboard** | `http://5.78.193.8` (Nginx → Next.js port 3000) |
| **Engine** | systemd service `ig-engine.service` — always on |
| **Dashboard service** | systemd service `ig-dashboard.service` — always on |
| **App directory** | `/opt/ig-outreach-bot` |
| **Logs** | `engine_output.log` / `engine_error.log` |

## Architecture

```
ig-outreach-bot/
├── scheduler.py        # Main orchestrator — runs maintenance at 13:00 / 18:00 / 21:00 UTC
├── sender.py           # DM sending — spintax, pre-DM like, rate limits (9 DMs/day/bot)
├── warmup.py           # 7-day warmup protocol + AT_RISK recovery protocol
├── scraper.py          # Lead scraping — by username followers or geo radius
├── inbox_manager.py    # Syncs Instagram DMs → Supabase (detects REPLIED leads)
├── cloner.py           # Mirror profile (photo, bio, name) across bots
├── post_deleter.py     # Bulk delete posts from an account
├── bot_utils.py        # Session reuse, 2FA auto-resolve, proxy, device fingerprint
├── brain_reporter.py   # Supabase client, status reporting, IG error detection
├── ai_processor.py     # Lead qualification by keywords/bio/followers (score ≥ 40 = QUALIFIED)
├── sessions/           # Persisted Instagram sessions per bot (auto-managed)
└── dashboard/          # Next.js 16 frontend (port 3000)
    └── src/
        ├── app/
        │   ├── page.tsx              # Home — fleet stats, KPIs, activity feed
        │   ├── accounts/page.tsx     # Bot management — import, proxy, clone, delete posts
        │   ├── campaigns/page.tsx    # Campaign creation and management
        │   ├── leads/page.tsx        # Lead scraping, lists, AI scoring pipeline
        │   ├── templates/page.tsx    # Message templates with spintax + AI generation
        │   ├── inbox/page.tsx        # Unified DM inbox across all bots
        │   └── activity/page.tsx     # Live activity feed (date + time per event)
        ├── components/
        │   ├── EngineControl.tsx     # Start/stop engine toggle
        │   ├── BulkAddModal.tsx      # Paste accounts: username:password:2FA
        │   ├── BulkProxyModal.tsx    # Assign proxy to selected accounts
        │   ├── NewCampaignModal.tsx  # Create campaign (list + template + follow-up)
        │   └── CloneProfileModal.tsx # Mirror Instagram profile to bot accounts
        └── app/api/
            ├── engine/route.ts            # Engine start/stop + status
            ├── accounts/bulk/route.ts     # Bulk account import
            ├── accounts/clone/route.ts    # Spawn cloner.py
            ├── accounts/delete-posts/     # Spawn post_deleter.py
            └── templates/generate/        # OpenAI template generation
```

## Supabase Tables

| Table | Purpose |
|-------|---------|
| `accounts` | Bot credentials, status, proxy, warmup_day, 2FA seed |
| `campaigns` | Campaign config — list, template, follow-up template |
| `lead_lists` | Named collections of leads |
| `leads` | Scraped profiles — status, AI score, source list |
| `message_templates` | Spintax DM templates |
| `outreach_logs` | Every DM attempt with timestamp |
| `inbox_messages` | Synced DM threads from Instagram |
| `bot_activity_logs` | Warmup, DM, recovery events per bot |
| `scrape_tasks` | Scraper job queue |

## Bot Lifecycle

```
Import account (username:password:2FA)
  → Assign proxy (1 proxy per bot, never share)
  → WARMING_UP (7-day protocol: scroll → stories → likes → follows → niche engagement)
  → HEALTHY (outreach begins — 9 DMs/day in 3 cycles)
  → AT_RISK (recovery protocol — gentler warmup, then back to WARMING_UP)
  → CHALLENGE (needs manual Instagram verification)
  → DEAD (permanently blocked — remove)
```

## DM Flow

```
1. Bot follows lead
2. Step 1 DM: personalized pitch with spintax
3. No reply after 48h → Step 2 follow-up ("Did you see this?")
4. Lead replies → status → REPLIED → client closes manually
```

## Engine Schedule

| Time (UTC) | Action |
|-----------|--------|
| Every 5 min | Check scraper task queue |
| Every 2 hours | Fleet health check (session validation) |
| 13:00 | Full maintenance — warmup + outreach |
| 18:00 | Full maintenance — warmup + outreach |
| 21:00 | Full maintenance — warmup + outreach |

## Rate Limits (conservative/safe)

- **DMs:** 9/day per bot (3 cycles × 3 DMs), max 3/hour
- **Sleep between DMs:** 4–6 minutes
- **Bot stagger:** 3–6 minutes between each bot login

## Setup (fresh VPS)

### Python Engine

```bash
cd /opt/ig-outreach-bot
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill .env with Supabase credentials and proxy
```

### Dashboard

```bash
cd dashboard
npm install
cp .env.local.example .env.local
# Fill .env.local with Supabase keys and OpenAI key
npm run build
```

### systemd Services

```bash
# Engine
systemctl enable ig-engine
systemctl start ig-engine

# Dashboard
systemctl enable ig-dashboard
systemctl start ig-dashboard
```

## Operations

```bash
# Service status
systemctl status ig-engine ig-dashboard

# Restart after code changes
cd /opt/ig-outreach-bot && git pull
systemctl restart ig-engine
cd dashboard && npm run build && systemctl restart ig-dashboard

# Live logs
tail -f /opt/ig-outreach-bot/engine_output.log
tail -f /opt/ig-outreach-bot/engine_error.log
journalctl -u ig-dashboard -n 50 --no-pager

# Check bot statuses
cd /opt/ig-outreach-bot && /opt/ig-outreach-bot/venv/bin/python3 -c "
from brain_reporter import BrainReporter
from collections import Counter
r = BrainReporter()
bots = r.client.table('accounts').select('username,status').execute().data
print(Counter(b['status'] for b in bots))
"
```

## Environment Variables

### Python Engine (`.env`)
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin) |
| `IG_PROXY` | Default proxy URL (`http://user:pass@host:port`) |
| `OPENAI_API_KEY` | OpenAI key for AI template generation |

### Dashboard (`dashboard/.env.local`)
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Same Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same anon key |
| `OPENAI_API_KEY` | OpenAI key for AI template generation |

## Rules

- Each bot needs its own proxy — never share IPs between accounts
- New account → assign proxy → import → 7-day warmup → HEALTHY → mirror profile → DMs
- After CHALLENGE → resolve manually in Instagram app → status resets to WARMING_UP
- Never run `daily_maintenance()` manually while the scheduler is running
- Deleting an account from the dashboard removes it from Supabase — also delete its `sessions/<username>.json` manually or run the orphan cleanup script
