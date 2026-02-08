# Mission Control — Feature Spec

Based on @mattganzak's TikTok (Feb 7 2026). Kevin wants this built.

## Core Features

### 1. Dashboard (Home)
- Agent status (working on X, idle, etc.)
- Recent commits/activity log
- Next heartbeat countdown
- Bandwidth/context usage (tokens, %)
- Quick stats: tasks done today, messages sent, uptime

### 2. Workshop (Kanban)
- **Queue** — tasks waiting to be worked on (while Kevin is asleep/away)
- **In Progress** — what I'm currently doing
- **Done** — completed tasks with full details
- Click to expand: task details, notes, outcomes
- Momentum ranking (% fit based on previous skills/work)
- Kevin can add new tasks with details

### 3. Cost Tracker
- API usage per day/week/month
- Breakdown by model (Opus, sub-agents, etc.)
- Alert if spending exceeds threshold
- Track all pennies spent

### 4. Cron Monitor
- List all active cron jobs
- Next fire time, last run, status
- Enable/disable toggle
- Run history

### 5. Agent Hub
- List all sub-agents with personalities/roles
- See agent-to-agent communication
- Jarvis = commander, sub-agents = employees
- Agent status: working, idle, completed
- "The Architect" concept: sub-agent that audits Mission Control itself

### 6. Doc Digest
- Upload PDFs → fast processing
- Indexed and searchable
- Intelligence gathering for the agent

### 7. Twitter/Social Scout (like his Twitter skill)
- Find relevant use cases/opportunities
- Email-style inbox view
- "Deploy" button → adds to Workshop queue
- Personalized to Kevin's goals

## Design
- Apple "liquid glass" UI aesthetic
- Dark mode
- Smooth animations
- Clean, minimal, premium feel
- Mobile responsive

## Tech Stack
- Single HTML file with Tailwind CSS (or similar)
- Fetch data from OpenClaw APIs
- Served on port 8888 or dedicated port
- No build step needed — just HTML/CSS/JS

## Data Sources
- `session_status` → dashboard stats
- `cron list` → cron monitor
- `sessions_list` → agent hub
- `memory/*.md` → activity log
- Notion API → task tracking
- OpenClaw config → settings

## Priority
Kevin wants this ASAP. Build MVP overnight.
