# 🖥️ Mission Control — Dashboard for OpenClaw

**Your AI agent deserves a cockpit.**

Mission Control is a sleek, macOS-native-feel web dashboard for [OpenClaw](https://openclaw.ai) — the open-source AI agent framework. Monitor your agent's activity, manage cron jobs, discover opportunities, chat in real-time, and keep costs under control — all from one beautiful interface.

> Built by an OpenClaw power user who got tired of SSHing into servers to check what his agent was doing.

![Dashboard](screenshot.jpg)

---

## ✨ Why Mission Control?

OpenClaw agents are powerful — but they run headless. You're stuck checking logs, reading JSONL transcripts, and running CLI commands to know what's happening. Mission Control changes that:

- **See everything at a glance** — sessions, tokens, channels, heartbeat status
- **Talk to your agent** — streaming chat widget on every page (press `/` to open)
- **Get value immediately** — Quick Start page with one-click automation recipes
- **Delegate work** — queue tasks, let sub-agents research, review reports
- **Stay on budget** — track token usage and costs across all sessions
- **Find opportunities** — Scout Engine auto-searches for gigs, grants, skills, and news
- **Manage schedules** — create, toggle, run, and delete cron jobs visually
- **One-click actions** — check emails, review calendar, run heartbeats
- **Keyboard-first** — `?` for shortcuts, `G+D` for Dashboard, `⌘K` command palette

---

## 📸 Screenshots

### Cron Monitor
Schedule and manage automated jobs with toggle switches, run buttons, and create presets.

![Cron Monitor](screenshot-cron.png)

### Workshop
Kanban-style task board — queue tasks, execute with sub-agents, review results, and discuss with your agent.

![Workshop](screenshot-workshop.png)

### Scout Engine
Auto-discover freelance gigs, bug bounties, grants, new skills, and industry news via configurable web searches.

![Scout Engine](screenshot-scout.png)

### Chat Widget
Floating chat bubble on every page — streaming responses, persistent conversation, follow-up capable.

![Chat Widget](screenshot-chat.png)

### Skills Manager
Browse installed and available skills. Enable, disable, or install new capabilities for your agent.

![Skills Manager](screenshot-skills.png)

---

## 🧭 All Pages

| Page | What it does |
|------|-------------|
| **Dashboard** | Agent status, quick actions (email/calendar/heartbeat), activity feed, channel status, token counter |
| **Quick Start** | One-click automation recipes — email digest, budget review, tech news, system health |
| **Conversations** | Browse all agent sessions with filters, view history, continue conversations |
| **Workshop** | Kanban task board — Queue → In Progress → Done. Sub-agents do the research, you review |
| **Cost Tracker** | Token-based cost estimation per model, daily breakdown chart, budget alerts |
| **Cron Monitor** | Visual cron management — toggle, run now, delete, create with presets |
| **Scout** | Opportunity scanner with category filters (OpenClaw, Bounties, Freelance, EdTech, Grants) |
| **Agent Hub** | All active agents and sessions with token badges, type icons, and management tools |
| **Settings** | Model routing (main/sub-agent/heartbeat), heartbeat config, export/import |
| **Skills** | Installed vs available skills grid with enable/disable/install actions |
| **AWS** | *(Optional)* Real AWS costs, Bedrock model browser, image generation + S3 gallery |

---

## 🚀 Quick Start

### Prerequisites
- [OpenClaw](https://openclaw.ai) installed and running
- Node.js 18+
- A Brave Search API key (for Scout — [free tier available](https://brave.com/search/api/))

### Install

```bash
# Clone into your OpenClaw workspace
git clone https://github.com/Jzineldin/mission-control.git
cd mission-control

# Install dependencies
npm install
cd frontend && npm install && npm run build && cd ..

# Configure
cp mc-config.default.json mc-config.json

# Start
node server.js
```

Visit `http://localhost:3333` — the **Setup Wizard** will auto-detect your OpenClaw config and guide you through the rest.

### Run Tests

```bash
npm test
# Runs 19 API tests against all endpoints
```

### Production (systemd)

```bash
sudo cp mission-control.service /etc/systemd/system/
# Edit the service file with your paths
sudo systemctl enable --now mission-control
```

### Configuration

Mission Control auto-detects your setup:
- **Gateway token** from `~/.openclaw/openclaw.json`
- **Agent name** from `IDENTITY.md`
- **Model, channels, workspace** from OpenClaw config

Fine-tune everything via `mc-config.json` or the Settings page in the UI.

---

## 🏗️ Architecture

```
mission-control/
├── server.js            # Express API + static serving + caching layer
├── mc-config.json       # Your configuration (gitignored)
├── mc-config.default.json  # Template for new installs
├── scout-engine.js      # Brave Search opportunity scanner
├── frontend/
│   ├── src/
│   │   ├── pages/       # 10 React pages
│   │   ├── components/  # GlassCard, ChatWidget, Sidebar, etc.
│   │   └── lib/         # Hooks, utilities
│   └── dist/            # Built frontend (served by Express)
└── mission-control.service  # systemd template
```

**Stack:** React 19 + Vite 7 + Framer Motion + Recharts + Express.js

**Design:** macOS HIG-inspired with frosted glass panels, SF Pro typography, and Apple accent colors. Navy blue brushed steel background with blue-tinted glass overlay.

**Performance:** All API endpoints cached with stale-while-revalidate pattern (30-60s TTL). Pre-warmed on startup. Sub-3ms response times on cache hits.

---

## ⌨️ Keyboard Shortcuts

Press `?` anywhere to see all shortcuts.

| Shortcut | Action |
|----------|--------|
| `/` | Open chat |
| `?` | Show keyboard shortcuts |
| `⌘K` | Command palette |
| `G D` | Go to Dashboard |
| `G Q` | Go to Quick Start |
| `G C` | Go to Conversations |
| `G W` | Go to Workshop |
| `G S` | Go to Scout |
| `G M` | Go to Memory |
| `G E` | Go to Settings |
| `Esc` | Close dialogs |

---

## 📦 Modules

Enable/disable in `mc-config.json`:

| Module | Default | Description |
|--------|---------|-------------|
| `dashboard` | ✅ | Overview + quick actions |
| `conversations` | ✅ | Session browser + inline chat |
| `workshop` | ✅ | Task queue + sub-agent execution |
| `costs` | ✅ | Token tracking + budgets |
| `cron` | ✅ | Cron job management |
| `scout` | ✅ | Opportunity scanner |
| `agents` | ✅ | Agent monitoring |
| `settings` | ✅ | Configuration UI |
| `skills` | ✅ | Skill management |
| `aws` | ❌ | AWS costs + Bedrock + image gen |

---

## 🔮 Roadmap

**Recently completed:**
- [x] Quick Start page with one-click automation recipes
- [x] API test suite (19 tests, zero dependencies)
- [x] Health endpoint (`/api/health`) for monitoring
- [x] CI pipeline (GitHub Actions, Node 18/20/22)
- [x] `/` keyboard shortcut to open chat from anywhere
- [x] Memory Explorer (browse and search agent memory files)
- [x] Mobile PWA support (home screen install)
- [x] Scout query configuration from UI
- [x] Dynamic model detection (works with any provider)
- [x] Getting Started onboarding checklist
- [x] Gateway health monitoring with connection test

**Coming soon:**
- [ ] Dedicated chat sessions per topic (email, calendar, per-task)
- [ ] Cron job output viewer (see what each run produced)
- [ ] Dark/Light theme toggle
- [ ] Free Scout alternatives (GitHub API, RSS, DuckDuckGo)

**Future:**
- [ ] Skills marketplace (browse/install from ClawHub)
- [ ] Multi-agent orchestration view
- [ ] Custom dashboard widgets
- [ ] Multi-user auth
- [ ] WebSocket real-time updates

Have a feature request? [Open an issue!](https://github.com/Jzineldin/mission-control/issues)

---

## 💖 Support

Mission Control is free and open-source under the BSL 1.1 license.

If it's useful to you, consider:
- ⭐ **Starring** this repo
- 🐛 **Reporting bugs** or **suggesting features**
- ☕ **[Buy me a coffee](https://ko-fi.com/kevinelzarka)** to keep development going
- 📧 **Questions?** kevin.elzarka@gmail.com

---

## 🔗 Links

- 🏠 **[Tale Forge](https://tale-forge.app)** — AI storytelling for kids (our main project)
- 💼 **[LinkedIn](https://www.linkedin.com/in/kevin-el-zarka/)** — Connect with the creator
- 🐦 **[X / Twitter](https://x.com/KevinElzarka)** — Follow for updates
- 🐙 **[GitHub](https://github.com/Jzineldin)** — More projects

---

## 📄 License

[Business Source License 1.1](LICENSE)

- ✅ Free to use, modify, and self-host
- ✅ Personal and internal commercial use
- ❌ Cannot be offered as a hosted SaaS to third parties
- 🔓 Automatically converts to **MIT** on 2030-02-07

**Licensor:** Kevin El-Zarka / Tale Forge AB

---

Built with 🤖 by the [OpenClaw](https://openclaw.ai) community
