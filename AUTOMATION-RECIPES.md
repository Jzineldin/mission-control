# AUTOMATION-RECIPES.md — Pre-built Workflow Templates

## The Adoption Problem
New users see Mission Control and think "cool dashboard" but don't know what to DO with it. They need immediate, tangible value - not empty pages.

## Solution: One-Click Automation Recipes
Pre-built workflows that users can enable instantly:

### 📧 Email Digest Recipe
- **What**: Daily email summary at 8am  
- **Cron**: `0 8 * * *`
- **Payload**: Check unread emails, summarize important ones
- **Template**: "📬 Daily Email Digest: Check Gmail and summarize any urgent emails from the last 24h. Include sender, subject, and priority level."

### 📅 Calendar Reminder Recipe  
- **What**: Morning agenda + evening prep
- **Cron**: `0 8 * * *` (morning), `0 18 * * *` (evening)
- **Payload**: Morning: today's events. Evening: tomorrow's prep
- **Template**: "📅 Calendar Sync: Share today's agenda this morning, tomorrow's prep this evening."

### 💰 Budget Alert Recipe
- **What**: Weekly spend summary
- **Cron**: `0 9 * * 1` (Monday 9am)  
- **Payload**: Review last week's costs, project monthly spend
- **Template**: "💰 Weekly Budget Review: Analyze last week's AI costs, project monthly spending, flag if over budget."

### 🔍 News Scanner Recipe
- **What**: Daily tech/AI news summary
- **Cron**: `0 7 * * *`
- **Payload**: Search for relevant news, summarize top stories
- **Template**: "🔍 Daily Tech Scan: Search for AI, OpenClaw, and tech industry news. Summarize top 3 stories with implications."

### 🚨 System Health Recipe  
- **What**: Daily system check
- **Cron**: `0 6 * * *`
- **Payload**: Check disk space, memory, gateway status
- **Template**: "🚨 System Health Check: Verify OpenClaw gateway, check system resources, alert if anything needs attention."

### 📊 Weekly Report Recipe
- **What**: Sunday weekly summary  
- **Cron**: `0 20 * * 0` (Sunday 8pm)
- **Payload**: Compile week's activity, costs, tasks completed
- **Template**: "📊 Weekly Wrap-up: Summarize this week's agent activity, costs, completed tasks, and plan for next week."

## Implementation
- New "Recipes" page or section in Cron
- One-click "Enable Recipe" buttons
- Auto-creates the cron job with optimized prompt
- Users can customize before enabling
- Usage analytics to see which recipes are popular

## Value Proposition  
Instead of staring at empty cron jobs page, users immediately get:
- Useful automation running within 5 minutes
- Clear examples of what OpenClaw can do
- Templates they can modify for their needs
- Immediate return on investment

This transforms MC from "cool but empty" to "immediately useful".