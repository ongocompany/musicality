#!/bin/bash
# ─── Musicality Expo Dev Server Setup for jinserver ───
# Run this script on jinserver to set up persistent Expo dev server.
# iPhone (Expo Go) can then always connect, even when your PC is off.
#
# Usage:
#   chmod +x setup_expo_server.sh
#   ./setup_expo_server.sh
#
# Prerequisites:
#   - git installed
#   - Internet access
# ────────────────────────────────────────────────────

set -e

REPO_URL="https://github.com/ongocompany/musicality.git"
PROJECT_DIR="$HOME/musicality"
APP_DIR="$PROJECT_DIR/musicality-app"
EXPO_PORT=8081
SERVICE_NAME="musicality-expo"

echo "═══════════════════════════════════════════"
echo "  Musicality Expo Dev Server Setup"
echo "═══════════════════════════════════════════"

# ── 1. Check/Install Node.js ──
echo ""
echo "▶ Step 1: Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VER=$(node -v)
    echo "  ✅ Node.js $NODE_VER found"
else
    echo "  ⚠ Node.js not found. Installing via nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 20
    nvm use 20
    echo "  ✅ Node.js $(node -v) installed"
fi

# ── 2. Clone/Update repo ──
echo ""
echo "▶ Step 2: Setting up project..."
if [ -d "$PROJECT_DIR/.git" ]; then
    echo "  Project exists, pulling latest..."
    cd "$PROJECT_DIR"
    git pull origin main
else
    echo "  Cloning repository..."
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi

# ── 3. Install dependencies ──
echo ""
echo "▶ Step 3: Installing dependencies..."
cd "$APP_DIR"
npm install --legacy-peer-deps
echo "  ✅ Dependencies installed"

# ── 4. Create systemd service ──
echo ""
echo "▶ Step 4: Creating systemd service..."

# Detect node path
NODE_PATH=$(which node)
NPX_PATH=$(which npx)

# Create service file
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=Musicality Expo Dev Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=${APP_DIR}
Environment=PATH=$(dirname $NODE_PATH):/usr/local/bin:/usr/bin:/bin
Environment=NODE_ENV=development
ExecStart=${NPX_PATH} expo start --port ${EXPO_PORT} --host 0.0.0.0
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "  ✅ Service file created"

# ── 5. Enable and start service ──
echo ""
echo "▶ Step 5: Starting Expo dev server..."
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl start ${SERVICE_NAME}

echo "  ✅ Service started and enabled on boot"

# ── 6. Get network info ──
echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ Setup Complete!"
echo "═══════════════════════════════════════════"
echo ""
echo "  Expo Dev Server: http://0.0.0.0:${EXPO_PORT}"
echo ""

# Show available IPs
echo "  Available addresses:"
if command -v ip &> /dev/null; then
    ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | while read ip; do
        echo "    - http://${ip}:${EXPO_PORT}"
    done
elif command -v ifconfig &> /dev/null; then
    ifconfig | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | while read ip; do
        echo "    - http://${ip}:${EXPO_PORT}"
    done
fi

echo ""
echo "  Tailscale IP (if available):"
if command -v tailscale &> /dev/null; then
    TS_IP=$(tailscale ip -4 2>/dev/null || echo "not connected")
    echo "    - http://${TS_IP}:${EXPO_PORT}"
else
    echo "    - Tailscale not installed"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  📱 iPhone (Expo Go) 연결 방법:"
echo "  1. 같은 WiFi: LAN IP:${EXPO_PORT}"
echo "  2. 외부: Tailscale IP:${EXPO_PORT}"
echo "═══════════════════════════════════════════"
echo ""
echo "  Useful commands:"
echo "    sudo systemctl status ${SERVICE_NAME}  # Check status"
echo "    sudo systemctl restart ${SERVICE_NAME}  # Restart"
echo "    sudo journalctl -u ${SERVICE_NAME} -f   # View logs"
echo ""
