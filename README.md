# ATLAS IG — Instagram Outreach Engine

Private Instagram DM outreach system. Python engine + Next.js dashboard + Supabase backend.

## Architecture

```
ig-outreach-bot/
├── scheduler.py        # Main loop — runs maintenance at 9h / 13h30 / 21h
├── sender.py           # DM sending — spintax, pre-DM like, rate limits
├── warmup.py           # 7-day warmup protocol for new accounts
├── scraper.py          # Lead scraping — by username or location radius
├── inbox_manager.py    # Syncs Instagram DMs to Supabase
├── cloner.py           # Mirror profile (photo, bio, name) across bots
├── post_deleter.py     # Bulk delete posts from an account
├── bot_utils.py        # Session reuse, 2FA auto-resolve, device fingerprint
├── brain_reporter.py   # Supabase client, status reporting, IG error detection
├── ai_processor.py     # Lead qualification by keywords/bio/followers
└── dashboard/          # Next.js frontend (port 3000)
```

## Setup

### Python Engine

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in .env with your Supabase credentials and proxy
```

### Dashboard

```bash
cd dashboard
npm install
cp .env.local.example .env.local
# Fill in .env.local with Supabase keys and OpenAI key
npm run dev
```

## Running

```bash
# Start the engine (keep running in terminal or use screen/pm2)
python scheduler.py

# Dashboard
cd dashboard && npm run dev
```

## Environment Variables

### Python Engine (`.env`)
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin) |
| `IG_PROXY` | Proxy URL (`http://user:pass@host:port`) |

### Dashboard (`dashboard/.env.local`)
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Same Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same anon key |
| `OPENAI_API_KEY` | OpenAI key for AI template generation |

## Rules

- New account → 48h idle → 7-day warmup → HEALTHY → mirror → 48h → DMs (start at 3/day)
- After CHALLENGE → restart warmup from day 0, never skip steps
- Never run `daily_maintenance()` manually while the scheduler is running
- Each bot needs its own proxy — never share IPs between accounts
