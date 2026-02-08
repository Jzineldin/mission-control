# ULTRATHINK #2 — Deep Product Analysis

## Kevin's Questions (analyzed one by one)

### Q1: "What actually appears in the Scout?"
**Current reality:** 
- Scout runs Brave Search queries → scores results → shows as opportunities
- Hardcoded queries in DEFAULT_QUERIES (22 of them, very Kevin-specific: Åseda, bug bounty, Tale Forge)
- Users see scored results (0-100) with title, source, category, summary
- Can "Deploy" → moves to Workshop queue, or "Dismiss"

**Problem for other users:**
- DEFAULT_QUERIES are 100% Kevin-specific (HackerOne, Upwork, Swedish grants)
- A user in Japan building a fintech app would see irrelevant noise
- No way to configure Scout from the UI after initial setup (only mc-config.json)

**Fix needed:**
- Scout Settings panel (accessible from Scout page, not just Setup wizard)
- Let users add/remove queries, choose templates, set categories
- Show query management: "You have 22 queries across 5 categories"
- Explain the scoring system visually

### Q2: "How do you configure what appears?"
**Current reality:**
- mc-config.json → `scout.queries` array
- Setup wizard Step 3 has template picker (freelance/skills/bounties/grants)
- Custom query text input in setup
- But AFTER setup, there's NO way to change queries from the UI!

**Fix needed:**
- Scout Configuration page/panel
- Template library: pick predefined query sets
- Custom query builder with live preview
- Category management: rename, add, remove
- Query testing: "Test this query" → shows preview results

### Q3: "How is the score calculated?"
**Current reality:**
- Base 30 points
- Keyword matching against GOALS (primary +15, secondary +10, freelance +12, openclaw +12)
- Actionable signals ("looking for", "hiring", "need") +15
- Source weight multiplier (0.7-1.0)
- Freshness bonus (+5 to +15 for recent results)
- Clamped 5-100
- Filter: only show score ≥ 15 (server), only keep ≥ 35 (engine)

**Problem for users:**
- Score is a black box — users see "73" but don't know why
- GOALS are hardcoded in scout-engine.js, not configurable
- No way to adjust scoring weights from UI

**Fix needed:**
- Score breakdown tooltip: "73 = Base(30) + Keywords(+25) + Freshness(+10) + Source(+8)"
- Configurable GOALS in mc-config.json
- Scoring explanation in Scout page or settings

### Q4: "When someone deploys/interacts, how is it decided where the task goes?"
**Current reality:**
- Deploy → adds to Workshop `tasks.json` queue
- Execute → spawns sub-agent via gateway `sessions_spawn` tool
- Model is hardcoded: `model: 'sonnet'` (always Sonnet, regardless of user's config)
- The spawned sub-agent gets a smart prompt based on task category:
  - Scout skill → "Research and recommend"
  - Bounty → "Assess difficulty and payout"
  - Freelance → "Check fit and draft pitch"
  - Grant → "Check eligibility and deadline"
  - Generic → "Do the work and summarize"

**Problems:**
1. Model is HARDCODED to Sonnet — doesn't respect user's model routing preferences
2. No choice of which agent handles what type of task
3. No way for user to specify "I want Opus for bug bounty research, Haiku for quick lookups"
4. Task routing is category-based but fixed — user can't customize

**Fix needed:**
- Read model from mc-config.json or Settings model routing
- Task routing settings: "Bug bounty tasks → use Opus, Freelance → use Sonnet"
- Or at minimum, use the "sub-agent" model from model routing settings
- Let user choose agent/model at execute time (dropdown in Execute modal)

### Q5: "How do users keep this optimized for their life/workflow but cost-effective?"
**Current reality:**
- Budget alert in Settings (new in v3.2.0) — but just a daily threshold, no smart optimization
- Scout refresh is 2min (expensive if many queries)
- No token/cost tracking per operation
- No "this task will cost approximately $X" before execution

**Fixes needed:**
- Cost preview before execution: "This task will spawn a Sonnet sub-agent (~$0.05-0.50)"
- Scout cost tracking: "Last scan: 22 queries × $0.009 = $0.20"
- Smart scan scheduling: "Run expensive scans daily, cheap ones hourly"
- Task queue priority: urgent tasks first, background tasks in cheaper model
- Model recommendation: "This task looks simple → Haiku ($0.01), complex → Sonnet ($0.15)"

### Q6: "What about users who use completely different models than Anthropic?"
**Current reality:**
- Model dropdowns in Settings only show Claude Opus/Sonnet/Haiku
- Task execution hardcoded to Sonnet
- Gateway supports any model via OpenClaw config, but MC doesn't expose this
- Users could be using OpenAI, Gemini, local models, etc.

**Critical problem:**
- MC is Anthropic-centric — won't work for OpenAI/Gemini users at all
- MODEL_OPTIONS in Settings only lists 3 Claude models
- The `/api/models` endpoint lists available models but the UI ignores any non-Anthropic ones

**Fix needed:**
- Dynamic model discovery: read available models from `/api/models` 
- Show ALL available models in dropdowns (not just 3 hardcoded Claude ones)
- Cost estimation should be model-aware (OpenAI pricing ≠ Bedrock pricing)
- Remove hardcoded "Anthropic" references
- Test with non-Bedrock providers

---

## Priority Implementation Plan

### Round 1: Scout Configuration (biggest gap)
1. Add Scout Settings panel to Scout page
2. Query management UI (add/remove/edit queries, templates)
3. Score breakdown tooltip on each opportunity
4. Configurable GOALS/scoring weights

### Round 2: Task Routing Intelligence
5. Dynamic model selection from available models
6. Task routing preferences (category → model mapping)
7. Cost preview before task execution
8. Model recommendation based on task complexity

### Round 3: Multi-Model Support
9. Dynamic model discovery in all dropdowns
10. Provider-agnostic cost estimation
11. Remove all Anthropic-specific hardcoding
12. Test with different model configurations

### Round 4: Cost Optimization
13. Scout cost tracking
14. Task cost history
15. Smart scheduling recommendations
16. Daily/weekly cost reports
