# Mission Control — OpenClaw Dashboard

A premium macOS-styled dashboard for managing your OpenClaw agent.

## Features
- **Real-time Agent Monitoring** — Track status, activity, and performance
- **Workshop** — Kanban-style task management with sub-agent execution
- **Cost Tracking** — Monitor API usage and expenses across all providers
- **Cron Management** — Schedule and manage automated tasks
- **Scout Engine** — Automated opportunity discovery with customizable queries
- **Doc Digest** — Document management and analysis
- **Agent Hub** — Coordinate multiple sub-agents
- **Skills Manager** — Install, update, and manage OpenClaw skills
- **Model Switcher** — Switch between AI models on the fly
- **AWS Dashboard** — Manage S3 buckets and Bedrock models
- **Built-in Chat** — Direct chat interface with full memory and tools
- **Setup Wizard** — Easy first-time configuration

## Requirements
- OpenClaw running with gateway enabled (port 18789)
- Node.js 18+
- npm

## Quick Install
```bash
# Clone into your OpenClaw workspace
git clone https://github.com/openclaw/mission-control.git
cd mission-control

# Install dependencies
npm install
cd frontend && npm install && npm run build && cd ..

# Start the dashboard
node server.js

# Or use the install script:
chmod +x install.sh && ./install.sh
```

Open http://localhost:3333 and complete the setup wizard.

## Configuration
All settings are stored in `mc-config.json`, which is auto-generated on first run via the setup wizard.

Key configuration options:
- `name` — Dashboard title
- `agentName` — Display name for your primary agent
- `gateway.token` — Authentication token for OpenClaw gateway
- `modules` — Enable/disable specific dashboard modules
- `scout.queries` — Custom search queries for opportunity discovery
- `aws` — AWS S3 and Bedrock configuration (optional)
- `notion` — Notion integration for Workshop tasks (optional)

## Running as a Service

### systemd (Linux)
```bash
sudo nano /etc/systemd/system/mission-control.service
```

Add:
```ini
[Unit]
Description=Mission Control Dashboard
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/path/to/mission-control
ExecStart=/usr/bin/node server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable mission-control
sudo systemctl start mission-control
```

### PM2 (Cross-platform)
```bash
npm install -g pm2
pm2 start server.js --name mission-control
pm2 save
pm2 startup
```

## API Endpoints

Mission Control provides several API endpoints for integration:

- `GET /api/status` — System status and metrics
- `GET /api/agents` — List all agents and their status
- `GET /api/sessions` — Active OpenClaw sessions
- `GET /api/costs` — Cost tracking data
- `POST /api/chat` — Send messages to the agent
- `GET /api/cron` — List cron jobs
- `POST /api/cron` — Create/update cron job
- `GET /api/scout/results` — Latest scout results
- `POST /api/scout/scan` — Trigger scout scan

## Scout Engine

The Scout Engine searches for opportunities based on configurable queries. To enable:

1. Get a Brave Search API key from https://brave.com/search/api/
2. Add it to `mc-config.json` under `scout.braveApiKey`
3. Configure search queries in the setup wizard or directly in config
4. Scout runs automatically on schedule (daily by default)

Example query configuration:
```json
{
  "scout": {
    "enabled": true,
    "braveApiKey": "YOUR_API_KEY",
    "queries": [
      {
        "q": "site:github.com openclaw skill",
        "category": "openclaw-skills",
        "source": "github",
        "weight": 1.0
      }
    ]
  }
}
```

## Workshop Integration

The Workshop module supports Notion integration for persistent task storage:

1. Create a Notion integration at https://www.notion.so/my-integrations
2. Create a database in Notion with these properties:
   - Title (title)
   - Status (select: queue, executing, done, archived)
   - Priority (select: low, medium, high)
   - Description (text)
   - Result (text)
3. Share the database with your integration
4. Add the database ID and integration token to `mc-config.json`

## Architecture
- **Backend**: Express.js server on port 3333
- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Gateway**: Connects to OpenClaw gateway API (default: localhost:18789)
- **Real-time**: Polling for live updates from OpenClaw sessions
- **Storage**: Local JSON files for configuration and state

## Development

```bash
# Run backend in dev mode
npm run dev

# Run frontend in dev mode
cd frontend && npm run dev

# Build frontend for production
cd frontend && npm run build
```

## Troubleshooting

**Dashboard won't start**
- Check if port 3333 is available: `lsof -i :3333`
- Verify Node.js version: `node --version` (requires 18+)

**Can't connect to OpenClaw**
- Ensure OpenClaw gateway is running on port 18789
- Check gateway token in `mc-config.json` matches OpenClaw config
- Verify firewall allows localhost connections

**Scout not finding results**
- Verify Brave API key is valid
- Check query syntax (use Brave Search operators)
- Review `scout-results.json` for errors

## License

BSL-1.1 (Business Source License 1.1)

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

- Issues: https://github.com/openclaw/mission-control/issues
- Discord: https://discord.gg/openclaw
- Documentation: https://docs.openclaw.ai

---

Built with 🤖 by the OpenClaw community