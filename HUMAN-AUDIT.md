# Human-Centered Audit — Mission Control
*Thinking as Kevin: What do I actually need when I open my agent dashboard?*

## The Core Question
I'm a person who runs an AI agent 24/7. It talks to people on Discord, checks my email, runs cron jobs, manages leads. When I open Mission Control, what's the FIRST thing I need to know?

**Answer: "Is everything OK? What happened while I was away?"**

## 🔴 Critical Issues (Things That Would Frustrate a Human)

### 1. Dashboard Doesn't Answer "What Happened?"
The dashboard shows stats (sessions count, memory chunks, channels) but NOT:
- **What did my agent DO today?** — The activity feed is buried and only shows workshop tasks/scout items
- **Were there any errors?** — No error tracking or health indicators  
- **Did anyone message me?** — No unread message count
- **How much did it cost today?** — No daily cost summary on dashboard
- **What's coming up?** — No next cron job / calendar preview

**Human need:** When I wake up and open the dashboard, I want a morning briefing card: "While you slept, I checked 3 emails, ran 2 heartbeats, completed 1 workshop task. Cost: $2.40. Next: Scout scan at 12:00."

### 2. No Notification/Alert System
If something goes wrong (agent error, high cost spike, channel disconnected), there's NO way to know from the dashboard. No toast notifications, no alert banner, no error log.

**Human need:** A small alerts section or notification bell that shows: "⚠️ Discord channel disconnected 2h ago" or "💰 Today's cost: $45 (150% above average)"

### 3. Conversations Page Missing from Routes
The sidebar links to `/conversations` but there's only a Chat.tsx at `/chat`. Are these the same? The naming is confusing.

### 4. Workshop Is Unintuitive for New Users
What IS a "Workshop"? The name doesn't explain itself. A new user has no idea this is a task queue/kanban board. Needs either:
- A one-line explanation when empty
- Better naming ("Task Board" or "Work Queue")

### 5. Settings Don't Actually Save to OpenClaw
The Settings page has model routing dropdowns and heartbeat interval selector, but do they actually write to the OpenClaw config? The server has `/api/settings/model-routing` and `/api/settings/heartbeat` endpoints but I need to verify they work.

### 6. Agent Hub Shows Empty Cards
The "Active Sessions" section shows 4 group cards (Main Agent, Discord, Sub-agents, Web) even when they're empty (opacity: 0.4). A new user sees 4 semi-transparent cards with "0 sessions" — confusing. Should hide empty groups or show a better empty state.

### 7. Scout Page Purpose Unclear
"Scout" means nothing to a new user. What does it scan? Why? The page needs context. "Scout automatically searches for opportunities matching your interests: freelance gigs, bug bounties, grants, and more."

### 8. Memory Explorer Has No Edit Capability
You can VIEW memory files but not EDIT them. A human would want to: edit SOUL.md (personality), update HEARTBEAT.md (checks), tweak USER.md. This is a dashboard — editing core files should be possible.

### 9. No Onboarding / First-Run Experience
A fresh install with mc-config.default.json shows... everything. But nothing is connected yet. There should be a setup checklist or wizard: "Connect your first channel → Set your model → Customize your agent's personality"

### 10. Cost Tracker Has No Budget/Alert Setting  
Shows costs but no way to set a daily budget limit or get warnings. "Alert me if daily cost exceeds $10" is basic budget management.

## 🟡 Important Issues (Polish That Makes It Feel Pro)

### 11. No Dark/Light Theme Toggle
It's always dark. Some people prefer light mode. At minimum, acknowledge the choice.

### 12. No Keyboard Shortcuts Help
Cmd+K exists but there's no visible hint anywhere. Add a small "⌘K" badge somewhere.

### 13. Sidebar Has Too Many Items (11!)
Dashboard, Conversations, Workshop, Cost Tracker, Cron Monitor, Scout, Memory, Agent Hub, Settings, Skills, AWS — that's 11 items. Too many. Should be grouped:
- **Overview:** Dashboard
- **Communication:** Conversations
- **Work:** Workshop, Scout  
- **Monitor:** Costs, Cron
- **Configure:** Agents, Skills, Settings, Memory
- **Cloud:** AWS

### 14. Mobile Experience Needs Work
No bottom tab bar on mobile. The hamburger menu is there but tabs would be faster for the 4-5 most used pages.

### 15. No "Ask Agent" Quick Action on Every Page
Every page should have a contextual "Ask Agent" button. On Costs page: "Why was yesterday expensive?" On Cron: "Why did this job fail?" The chat widget exists but isn't contextual.

## 🟢 Nice-to-Have (Delight)

### 16. Time-Based Greeting on Dashboard
"Good morning, Kevin" / "Good evening" based on timezone. Small touch, big warmth.

### 17. Uptime Counter
"Agent has been running for 14d 6h 32m" — shows reliability.

### 18. Quick Stats Comparison
"Today vs Yesterday" or "This week vs last week" on costs and tokens.

### 19. Changelog/Release Notes
When MC updates, show a "What's New" card. Users love seeing improvements.

### 20. Session Timeline View
Instead of just a list, show sessions on a timeline. See when agent was active, idle, talking to Discord, running sub-agents.

---

## Priority Order (What to Build First)

1. **Dashboard "Morning Briefing" card** — summarizes recent activity in plain english
2. **Alerts/Notifications system** — error tracking, cost alerts, channel health  
3. **Memory file editing** — inline edit for .md files
4. **Sidebar grouping** — categorize the 11 items into logical groups
5. **Keyboard shortcut hint** — show ⌘K badge
6. **Time-based greeting** — "Good morning, Kevin"
7. **Empty state improvements** — Agent Hub, Workshop, Scout
8. **Contextual descriptions** — explain what each page does for new users
9. **Uptime indicator** on dashboard
10. **Cost budget alerts** in Settings
