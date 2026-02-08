#!/bin/bash

# Mission Control Installer Script
# Installs dependencies and builds the dashboard

set -e  # Exit on error

echo "========================================"
echo "  Mission Control Installer"
echo "  OpenClaw Dashboard Setup"
echo "========================================"
echo ""

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ]; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ required. Current version: $(node -v)"
    echo "   Please upgrade Node.js: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"
echo ""

# Install backend dependencies
echo "📦 Installing backend dependencies..."
npm install
echo "✅ Backend dependencies installed"
echo ""

# Install frontend dependencies and build
echo "📦 Installing frontend dependencies..."
cd frontend
npm install

echo ""
echo "🔨 Building frontend (this may take a minute)..."
npm run build
cd ..
echo "✅ Frontend built successfully"
echo ""

# Make sure config exists
if [ ! -f "mc-config.json" ]; then
    echo "📝 Creating initial configuration from template..."
    if [ -f "mc-config.default.json" ]; then
        cp mc-config.default.json mc-config.json
        echo "✅ Configuration file created"
    else
        echo "⚠️  No default config found. Configuration will be created on first run."
    fi
fi
echo ""

# Create systemd service file (optional)
echo "📋 Optional: Install as systemd service?"
echo "   This will run Mission Control automatically on system startup."
read -p "   Install as service? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    SERVICE_FILE="/tmp/mission-control.service"
    CURRENT_DIR=$(pwd)
    CURRENT_USER=$(whoami)
    NODE_PATH=$(which node)

    cat > $SERVICE_FILE << EOF
[Unit]
Description=Mission Control Dashboard for OpenClaw
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$CURRENT_DIR
ExecStart=$NODE_PATH server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    echo "   Service file created. To install:"
    echo "   sudo cp $SERVICE_FILE /etc/systemd/system/"
    echo "   sudo systemctl daemon-reload"
    echo "   sudo systemctl enable mission-control"
    echo "   sudo systemctl start mission-control"
    echo ""
fi

echo "========================================"
echo "✨ Installation complete!"
echo ""
echo "To start Mission Control:"
echo "  node server.js"
echo ""
echo "Then open: http://localhost:3333"
echo ""
echo "The setup wizard will guide you through"
echo "the initial configuration."
echo "========================================"
echo ""

# Offer to start now
read -p "Start Mission Control now? (Y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo "Starting Mission Control..."
    echo "Press Ctrl+C to stop"
    echo ""
    node server.js
fi