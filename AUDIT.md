# Mission Control Full Audit — Feb 8, 2026

## Overall Assessment
Solid foundation. 11 pages, clean macOS dark theme, good mobile responsiveness.
The codebase is well-structured but has polish gaps from rapid iteration.

## Issues Found (Priority Order)

### 🔴 Critical (Broken/Confusing)
1. **Settings: Hardcoded System Info** — Shows "v2.0.0", "v1.5.2", "Node.js v20.15.0" — all fake. Should fetch from API or remove.
2. **Settings: Model routing doesn't use aliases** — Forces full model IDs like `us.anthropic.claude-opus-4-6-v1`. Should support `opus`, `sonnet`, `haiku` aliases.
3. **Chat: dangerouslySetInnerHTML XSS risk** — Both ChatWidget and Chat page render user input through `renderContent()` with innerHTML. Bold/code rendering is nice but should sanitize.
4. **Docs page: "Doc Digest" title but sidebar shows... nothing** — Docs nav item is commented out in sidebar (`// Doc Digest removed — may return as Memory Explorer`), but `/docs` route still exists. Dead page.

### 🟡 Important Polish
5. **Dashboard: Agent name fallback** — If `agent.name === 'Mission Control'` it shows 'Agent' — should show the actual agent name from OpenClaw config.
6. **Costs: Token estimates are rough** — Uses blended $45/M for Opus which is inaccurate. Real rates: $15 input/$75 output. Should use actual cache read/write rates too.
7. **Settings: Heartbeat save doesn't actually work** — POST to `/api/settings/heartbeat` needs gateway config change, not just a local save.
8. **Settings: Export/Import config** — Import does nothing meaningful, export redirects to a non-existent endpoint likely.
9. **Cron: No timezone indicator** — All times shown without timezone info. Users need to know if it's UTC or local.
10. **Workshop: No drag-and-drop** — Kanban board has no reordering. Just static columns.
11. **Scout: window.location.reload()** — Deploy and dismiss trigger full page reload instead of state refetch.

### 🟢 Nice-to-Have Polish  
12. **Missing 404 page** — No catch-all route for bad URLs.
13. **No keyboard shortcuts** — No Cmd+K search, no Esc to close modals.
14. **Chat: No markdown code blocks** — Only inline code rendered, not fenced ```blocks```.
15. **Skills: 2-column grid breaks on narrow screens** — Grid should be responsive.
16. **No dark/light theme toggle** — Only dark mode (fine for now, but setup wizard could ask).
17. **Sidebar: No active indicator animation** — Active link just changes color, could have a sliding indicator.
18. **No loading states on Settings save** — Some settings actions lack feedback.
19. **Agents: Create Agent modal has no backend** — The form exists but `/api/agents/create` likely doesn't do anything real.
20. **ChatWidget textarea is 3 rows by default** — Too tall for a floating widget, should be 1 row auto-expand.

### 🔧 Setup/Fresh Install Issues
21. **Setup wizard completeness** — Need to verify it handles all first-time config properly.
22. **mc-config.default.json** — Good for new users, but install.sh may need updates.
23. **No onboarding flow** — After setup, user lands on dashboard with no guidance.

## Plan: 6 Sub-Agent Tasks
1. **Fix Settings page** — Real system info, alias support, remove fake data
2. **Fix Chat rendering** — Proper markdown, code blocks, sanitize XSS
3. **Polish Dashboard** — Better agent name, live data, remove stale fallbacks
4. **Fix Scout/Workshop** — No page reloads, better state management
5. **Add 404 page + keyboard shortcuts** — Global improvements
6. **Clean up dead code** — Remove Docs page if unused, fix sidebar consistency
