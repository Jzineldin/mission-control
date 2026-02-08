# Changelog

All notable changes to Mission Control are documented here.

## [2.0.0] - 2026-02-08

### 🚀 THE BIG ONE — Universal Dashboard

Mission Control v2 transforms from a personal dashboard into a universal OpenClaw frontend 
that works for ANY user, on ANY setup, with ANY model provider.

**18 stars, 1 fork** — this release is for the community.

### Added

#### Quick Start & Onboarding
- **Quick Start page** (`/quick-start`) — 6 one-click automation recipes (Email Digest, Calendar Agenda, Budget Review, Tech News, System Health, Weekly Report)
- **Onboarding Checklist** — 6-step Getting Started guide on Dashboard with progress tracking
- **Gateway Offline State** — helpful troubleshooting card instead of infinite spinner
- **Gateway Health Card** in Settings — connection status, Test Connection button

#### Universal Architecture
- **Dynamic model discovery** — auto-detects models from OpenClaw config (Anthropic, OpenAI, Google, Meta, Mistral)
- **Clean model names** — "Claude Opus 4" not "claude-opus-4-6-v1:0" across 20+ model variants
- **Scout Query Manager** — add/remove/edit search queries from the UI (no code editing!)
- **AI-enhanced Scout Deploy** — generates action plans using your agent when deploying to Workshop
- **Deploy & Auto-Research** — one-click: create task + spawn sub-agent to research immediately

#### Power User Features
- **Keyboard shortcuts modal** — press `?` for reference
- **G-key navigation** — vim-style (G+D=Dashboard, G+C=Conversations, G+W=Workshop, etc.)
- **`/` to open chat** from anywhere (like Slack)
- **Scout keyboard shortcuts** — `d` to deploy, `D` to auto-research, `x` to dismiss
- **Notification system** — beautiful sliding notifications with progress bars (success/error/warning/info)
- **Command palette** — `Cmd+K` quick actions

#### Professional Quality
- **API test suite** — 19 tests, zero dependencies, `npm test`
- **Health endpoint** — `GET /api/health` (uptime, version, memory — no gateway needed)
- **CI pipeline** — GitHub Actions for Node 18/20/22
- **Memory list API** — `GET /api/memory` returns all workspace files
- **Cron empty state** — links to Quick Start when no jobs exist

#### Scout Engine Improvements
- **Merge mode** — new scans merge with existing results (no more data loss)
- **Self-improvement queries** — 16 queries for OpenClaw skills, Reddit, Twitter, YouTube, MCP servers
- **Opportunity IDs** — proper ID generation + legacy backfill for deploy/dismiss to work
- **GOALS.local** scoring — local/regional keyword boosting

### Fixed
- **CRITICAL: Broken navigation** — sidebar linked to `/chat` but route was `/conversations`
- **Scout page crash** — useEffect after early return violated React hooks rules
- **Scout deploy broken** — opportunities had no ID field
- **Scout scan wiping results** — overwrote instead of merged
- **Scout action buttons missing** — status field was undefined, treated as non-actionable
- **Model names ugly** — raw version strings shown to users

### Changed
- **Documents page** now accessible via sidebar (was unreachable)
- **README** updated with all v2 features, keyboard shortcuts table, test instructions
- Compressed screenshot from 2.9MB → 53KB
- Bundle: main chunk 221KB (from 579KB in v1)
- Code splitting across all pages

---

## [1.0.0] - 2026-02-06

### Added
- **Gateway Health Card** in Settings — shows connection status, active model, channels
- **Test Connection button** — verify gateway connectivity with one click
- **Gateway Offline State** — Dashboard shows helpful troubleshooting instead of infinite spinner
- **Quick checks guide** — When gateway is down, shows `openclaw status` and port info
- **Retry Connection** button with elapsed timer

### Changed
- Compressed screenshot from 2.9MB → 53KB
- Updated package.json with proper metadata (version, repository, homepage)
- Removed internal audit documents from git tracking

## [4.3.0] - 2026-02-08

### Added
- **Scout Query Manager** — Add/remove/edit search queries from the Scout page UI
- **Configure button** in Scout header opens inline query editor
- Category selector dropdown (OpenClaw, Freelance, Bounty, EdTech, Grants, Custom)
- Save configuration to server via PUT `/api/scout/config`

## [4.2.0] - 2026-02-08

### Changed
- Clean model names: "Claude Opus 4" instead of "Claude Opus 4-6-v1"
- Comprehensive model detection for 20+ variants (Claude, GPT, Gemini, Mistral, Llama, DeepSeek)

## [4.1.0] - 2026-02-08

### Changed
- Model routing dropdowns now auto-populate from `/api/models` endpoint
- Auto-detects cost tier ($, $$, $$$) from model name
- Workshop execute button shows estimated cost hint (~$0.05-0.50)

## [4.0.0] - 2026-02-08

### Added
- **Dynamic Model Discovery** — `/api/models` reads from OpenClaw config instead of hardcoded list
- **Provider detection** — Anthropic, OpenAI, Google, Mistral, Meta
- **Scout Configuration API** — GET/PUT `/api/scout/config` for query management
- **Scoring system explanation** endpoint with thresholds and formula

### Changed
- Task execution reads sub-agent model from user settings (was hardcoded to Sonnet)
- Scout page shows query count and API key status in header

## [3.2.0] - 2026-02-08

### Added
- **Budget Alerts** — Configurable daily spending limit with toast notifications
- **HelpTooltip component** — Contextual help on complex features
- Budget settings persist in localStorage

## [3.1.0] - 2026-02-08

### Added
- **Toast Notification System** — Success, warning, error, info toasts globally
- Smart monitoring: cost alerts when daily budget exceeded
- Channel disconnect alerts with persistent toasts
- Agent Hub empty states with descriptive guidance

### Fixed
- Conversations route now correctly points to `/chat`

## [3.0.0] - 2026-02-08

### Added
- **Human-Centered Redesign** — Time-based greeting (Good morning/afternoon/evening)
- **Uptime display** in Dashboard header
- **Sidebar groups** — Work, Monitor, Configure, Cloud sections
- **⌘K shortcut badge** in sidebar
- **Memory file editing** — Edit/Save/Cancel for .md and .json files
- `PUT /api/memory/:filepath` endpoint
- `SERVER_STARTED_AT` tracking in status API

## [2.4.0] - 2026-02-08

### Added
- Precision cost calculation with real Bedrock pricing (input/output/cache rates)
- Workshop drag & drop task reordering between columns
- Cache efficiency metrics

## [2.3.0] - 2026-02-08

### Added
- **Code splitting** — Bundle reduced from 579KB → 209KB (-37%)
- **PWA support** — Home screen install, offline manifest
- Lazy loading for all route pages

## [2.2.0] - 2026-02-08

### Added
- **Command Palette** — Cmd+K / Ctrl+K for quick navigation
- **Memory Explorer** page — Browse and view agent memory files (49 files)
- Keyboard navigation throughout

## [2.1.0] - 2026-02-08

### Added
- Real system information in Settings (OpenClaw version, Node.js, platform)
- XSS-safe markdown rendering with HTML sanitization
- 404 Not Found page

### Fixed
- Page reloads on navigation (now uses client-side routing)
- Scout filters and sort persistence

## [1.0.0] - 2026-02-07

### Added
- Initial release
- Dashboard with agent overview, activity feed, and quick actions
- Chat interface with streaming responses
- Workshop with kanban-style task management
- Cost tracking with AWS and token-based estimates
- Cron job management (create, toggle, delete, run)
- Scout Engine with Brave Search integration
- Agent Hub for sub-agent monitoring
- Skills Manager
- Settings with model routing
- AWS Dashboard (optional)
- Setup Wizard with auto-detection
- macOS-native design language
