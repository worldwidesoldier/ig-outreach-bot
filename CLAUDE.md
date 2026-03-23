# ATLAS IG — Claude Code Context

## What is this?
Instagram outreach automation system. Manages bot accounts that send DMs to leads on Instagram.

## Server
- **VPS:** Ubuntu 24.04 at `5.78.193.8`
- **App directory:** `/opt/ig-outreach-bot`
- **Dashboard:** `/opt/ig-outreach-bot/dashboard` (Next.js 16)
- **Services:** `ig-engine.service` (Python) + `ig-dashboard.service` (Next.js port 3000)
- **Nginx:** port 80 → localhost:3000
- **Credentials:** all in `/opt/ig-outreach-bot/.env`

## Stack
- **Backend:** Python 3.12, instagrapi, Supabase Python SDK
- **Frontend:** Next.js 16, Tailwind CSS, Supabase JS
- **Database:** Supabase (Postgres)
- **Auth:** Supabase Auth (email/password)

## Key Files
- `scheduler.py` — main engine, runs outreach cycles at 13:00 / 18:00 / 21:00 UTC
- `bot_utils.py` — Instagram client helper (session reuse, 2FA, proxy)
- `brain_reporter.py` — logs activity to Supabase
- `inbox_manager.py` — syncs Instagram DMs to Supabase
- `cloner.py` — mirrors profiles + publishes posts across bot accounts
- `dashboard/src/app/` — Next.js pages
- `dashboard/src/components/` — React components

## Supabase Tables
- `accounts` — bot Instagram accounts (username, password, proxy, status, two_factor_seed)
- `campaigns` — outreach campaigns (list_id, template_id, status, followup_template_id)
- `lead_lists` — lists of leads
- `leads` — individual Instagram leads
- `message_templates` — spintax message templates
- `inbox_messages` — synced DM messages
- `bot_activity_logs` — engine activity log

## Account Statuses
- `HEALTHY` — active, sending messages
- `WARMING_UP` — new account, limited activity
- `CHALLENGE` — Instagram blocked, needs attention
- `DEAD` — permanently blocked

## Deploy Process
After making code changes:
```bash
cd /opt/ig-outreach-bot && git pull && cd dashboard && npm run build && systemctl restart ig-dashboard
```

## Services Management
```bash
systemctl status ig-engine ig-dashboard
systemctl restart ig-engine
systemctl restart ig-dashboard
tail -f /opt/ig-outreach-bot/engine_output.log
tail -f /opt/ig-outreach-bot/engine_error.log
journalctl -u ig-dashboard -n 50 --no-pager
```

## Login
- Dashboard: `http://5.78.193.8`
- Supabase auth user: `admin@whatsappbot.com` / `admin123`

## Current Issues / Next Tasks
- [ ] Login not working — need to create Supabase auth user `admin@whatsappbot.com`
- [ ] Make dashboard fully mobile responsive (like native iOS app)
- [ ] Set up GitHub auto-deploy webhook (optional)
