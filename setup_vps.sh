#!/bin/bash
# ATLAS IG — VPS Setup Script
# Ubuntu 22.04/24.04 | Run as root: bash setup_vps.sh
set -e

REPO="https://github.com/worldwidesoldier/ig-outreach-bot.git"
APP_DIR="/opt/ig-outreach-bot"
SERVICE_USER="atlas"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ATLAS IG — VPS Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. System deps ────────────────────────────────────────────────
echo ""
echo "[1/7] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq git python3 python3-venv python3-pip curl nginx ufw

# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
apt-get install -y -qq nodejs

echo "  ✓ Python $(python3 --version) | Node $(node --version)"

# ── 2. Create service user ────────────────────────────────────────
echo ""
echo "[2/7] Creating service user '$SERVICE_USER'..."
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$SERVICE_USER"
fi
echo "  ✓ User '$SERVICE_USER' ready"

# ── 3. Clone repo ─────────────────────────────────────────────────
echo ""
echo "[3/7] Cloning repository..."
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR" && git pull
else
    git clone "$REPO" "$APP_DIR"
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
echo "  ✓ Repo at $APP_DIR"

# ── 4. Python venv ────────────────────────────────────────────────
echo ""
echo "[4/7] Setting up Python environment..."
cd "$APP_DIR"
sudo -u "$SERVICE_USER" python3 -m venv venv
sudo -u "$SERVICE_USER" venv/bin/pip install -q --upgrade pip
sudo -u "$SERVICE_USER" venv/bin/pip install -q -r requirements.txt
mkdir -p "$APP_DIR/sessions"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/sessions"
echo "  ✓ Python venv ready"

# ── 5. Node.js dashboard ──────────────────────────────────────────
echo ""
echo "[5/7] Installing dashboard dependencies..."
cd "$APP_DIR/dashboard"
sudo -u "$SERVICE_USER" npm install --legacy-peer-deps > /dev/null 2>&1
sudo -u "$SERVICE_USER" npm run build > /dev/null 2>&1
echo "  ✓ Dashboard built"

# ── 6. Systemd services ───────────────────────────────────────────
echo ""
echo "[6/7] Installing systemd services..."

# Python Engine service
cat > /etc/systemd/system/ig-engine.service << EOF
[Unit]
Description=ATLAS IG Outreach Engine
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR
ExecStart=$APP_DIR/venv/bin/python3 -u scheduler.py
Restart=always
RestartSec=30
StandardOutput=append:$APP_DIR/engine_output.log
StandardError=append:$APP_DIR/engine_error.log
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

# Dashboard service
cat > /etc/systemd/system/ig-dashboard.service << EOF
[Unit]
Description=ATLAS IG Dashboard
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR/dashboard
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=ENGINE_DIR=$APP_DIR
Environment=VENV_PYTHON_PATH=$APP_DIR/venv/bin/python3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "  ✓ Systemd services installed"

# ── 7. Nginx reverse proxy ────────────────────────────────────────
echo ""
echo "[7/7] Configuring Nginx..."
cat > /etc/nginx/sites-available/atlas << 'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/atlas
rm -f /etc/nginx/sites-enabled/default
nginx -t > /dev/null 2>&1 && systemctl reload nginx
echo "  ✓ Nginx configured"

# ── Firewall ──────────────────────────────────────────────────────
ufw allow OpenSSH > /dev/null 2>&1
ufw allow 80/tcp > /dev/null 2>&1
ufw --force enable > /dev/null 2>&1

# ── Done ──────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Copy your .env file to the server:"
echo "   scp '/Users/solonquinha/untitled folder 3/ig-outreach-bot/.env' root@<VPS_IP>:$APP_DIR/.env"
echo ""
echo "2. Copy your sessions folder:"
echo "   scp -r '/Users/solonquinha/untitled folder 3/ig-outreach-bot/sessions/' root@<VPS_IP>:$APP_DIR/"
echo ""
echo "3. Create the dashboard .env.local on the server:"
echo "   nano $APP_DIR/dashboard/.env.local"
echo "   (paste your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY)"
echo ""
echo "4. Start everything:"
echo "   systemctl enable ig-engine ig-dashboard"
echo "   systemctl start ig-engine ig-dashboard"
echo ""
echo "5. Check status:"
echo "   systemctl status ig-engine ig-dashboard"
echo "   tail -f $APP_DIR/engine_output.log"
echo ""
echo "Dashboard will be at: http://<VPS_IP>"
echo ""
