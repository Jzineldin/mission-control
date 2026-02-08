---
name: mission-control
description: macOS-native web dashboard for monitoring and controlling your OpenClaw agent. Live chat, cron management, task workshop, scout engine, cost tracking, and more.
homepage: https://github.com/Jzineldin/mission-control
metadata: { "openclaw": { "emoji": "🖥️", "requires": { "bins": ["node", "npm"] } } }
---

# Mission Control — Dashboard for OpenClaw

A sleek, macOS-native-feel web dashboard for your OpenClaw agent. Monitor sessions, manage cron jobs, chat in real-time, delegate tasks to sub-agents, discover opportunities, and track costs — all from one beautiful interface.

## Quick Install

```bash
# Clone the repo into your workspace
cd "$CLAWD_WORKSPACE" 2>/dev/null || cd ~/clawd
git clone https://github.com/Jzineldin/mission-control.git
cd mission-control

# Install dependencies + build frontend
npm install
cd frontend && npm install && npm run build && cd ..

# Create your config
cp mc-config.default.json mc-config.json

# Start (dev)
node server.js

# Or use systemd for production:
sudo cp mission-control.service /etc/systemd/system/
# Edit paths in the service file, then:
sudo systemctl enable --now mission-control
```

Visit `http://localhost:3333` — the Setup Wizard auto-detects your OpenClaw config.

## What You Get

| Page | Description |
|------|-------------|
| **Dashboard** | Agent status, quick actions (email/calendar/heartbeat), activity feed, channels |
| **Conversations** | Browse all sessions, view history, continue conversations |
| **Workshop** | Kanban task board — queue tasks, sub-agents research, you review reports |
| **Cost Tracker** | Token usage per model, daily charts, budget alerts |
| **Cron Monitor** | Toggle, run, create, delete scheduled jobs visually |
| **Scout** | Auto-discover opportunities — gigs, skills, grants, bounties, news |
| **Agent Hub** | All agents/sessions with token counts and management |
| **Settings** | Model routing (main/sub-agent/heartbeat), config export/import |
| **Skills** | Browse installed + available skills |
| **AWS** | *(Optional)* Real costs, Bedrock models, image generation |

## Requirements

- OpenClaw running with gateway HTTP enabled
- Node.js 18+
- Brave Search API key (for Scout — [free tier](https://brave.com/search/api/))

## Configuration

Auto-detected from your OpenClaw setup:
- Gateway token from `~/.openclaw/openclaw.json`
- Agent name from `IDENTITY.md`
- Model + channels from OpenClaw config

Fine-tune via `mc-config.json` or the in-app Settings page.

## Links

- **GitHub:** https://github.com/Jzineldin/mission-control
- **Support:** https://ko-fi.com/kevinelzarka
- **License:** BSL 1.1 (converts to MIT 2030)
