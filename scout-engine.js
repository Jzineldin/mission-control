#!/usr/bin/env node
/**
 * Scout Engine — Searches for opportunities matching Kevin's goals
 * Uses Brave Search API to find leads across Twitter, LinkedIn, Reddit
 * 
 * Usage: node scout-engine.js [--dry-run]
 * Output: writes to scout-results.json
 */

const fs = require('fs');
const path = require('path');

const BRAVE_API_KEY = 'BSAXySWcgWqzDfU2GUVBNZ2XfCcUtLx';
const RESULTS_FILE = path.join(__dirname, 'scout-results.json');
const MAX_RESULTS_PER_QUERY = 5;
const MAX_TOTAL = 50;

// Kevin's goals and skills for scoring
const GOALS = {
  primary: ['website', 'webbutveckling', 'hemsida', 'webbdesign', 'web developer', 'react developer'],
  secondary: ['edtech', 'ai storytelling', 'children education', 'empathy', 'startup funding', 'swedish grant'],
  freelance: ['freelance developer', 'react job', 'supabase', 'typescript developer', 'nextjs developer'],
  local: ['småland', 'kronoberg', 'växjö', 'åseda', 'alvesta', 'lenhovda'],
  openclaw: ['openclaw', 'clawd', 'mission control', 'ai agent', 'skill', 'sub-agent', 'heartbeat', 'cron job', 'gateway'],
};

// Search queries grouped by category
const QUERIES = [
  // === OPENCLAW ECOSYSTEM ===
  { q: 'site:x.com openclaw OR clawd "mission control" OR "skill" OR "built" OR "agent"', category: 'openclaw', source: 'twitter', weight: 1.0 },
  { q: 'site:x.com openclaw "new feature" OR "just shipped" OR "update" OR "tip"', category: 'openclaw', source: 'twitter', weight: 1.0 },
  { q: 'site:x.com clawd agent "my agent" "built" OR "made" OR "automated" OR "workflow"', category: 'openclaw', source: 'twitter', weight: 0.95 },
  { q: 'site:github.com openclaw skill OR plugin OR "mission control"', category: 'openclaw-github', source: 'github', weight: 1.0 },
  { q: 'site:reddit.com openclaw OR clawd agent automation', category: 'openclaw', source: 'reddit', weight: 0.9 },
  { q: 'site:youtube.com openclaw OR clawd "ai agent" tutorial OR guide OR setup', category: 'openclaw-tutorial', source: 'youtube', weight: 0.9 },
  { q: 'clawhub.com skill OR "new skill" OR automation', category: 'openclaw-skills', source: 'web', weight: 1.0 },
  { q: '"openclaw" "discord" agent automation workflow 2026', category: 'openclaw', source: 'web', weight: 0.85 },
  
  // === FREELANCE & JOBS ===
  { q: '"looking for" "web developer" OR "website developer" sweden OR remote 2026', category: 'freelance', source: 'web', weight: 1.0 },
  { q: 'site:x.com "hiring" OR "looking for" "react developer" OR "frontend developer" remote', category: 'twitter-jobs', source: 'twitter', weight: 0.9 },
  { q: 'site:linkedin.com "hiring" "react" OR "next.js" OR "typescript" "sweden" OR "remote"', category: 'linkedin-jobs', source: 'linkedin', weight: 0.85 },
  { q: 'site:reddit.com/r/forhire OR site:reddit.com/r/webdev "looking for" react developer', category: 'reddit-gigs', source: 'reddit', weight: 0.8 },
  
  // === EDTECH & TALE FORGE ===
  { q: 'site:x.com edtech AI children education startup 2026', category: 'edtech', source: 'twitter', weight: 0.7 },
  { q: 'site:linkedin.com edtech AI storytelling children learning startup', category: 'edtech', source: 'linkedin', weight: 0.7 },
  
  // === GRANTS & COMPETITIONS ===
  { q: '"startup grant" OR "startup competition" edtech OR AI europe 2026 application deadline', category: 'funding', source: 'web', weight: 0.95 },
  { q: 'sweden "innovation grant" OR "startup funding" OR "ALMI" OR "Vinnova" 2026 open', category: 'swedish-grants', source: 'web', weight: 1.0 },
  
  // === UPWORK ===
  { q: 'site:upwork.com react next.js supabase developer', category: 'upwork', source: 'upwork', weight: 0.8 },
  
  // === BUG BOUNTY / HACKERONE ===
  { q: 'site:hackerone.com "new program" OR "launched" OR "bounty" 2026', category: 'bounty', source: 'hackerone', weight: 1.0 },
  { q: 'site:x.com hackerone "new program" OR "bounty" OR "launched" OR "paying"', category: 'bounty', source: 'twitter', weight: 0.95 },
  { q: 'site:x.com "bug bounty" "high" OR "critical" OR "payout" OR "$" 2026', category: 'bounty', source: 'twitter', weight: 0.9 },
  { q: 'hackerone OR bugcrowd "new scope" OR "increased bounty" OR "bonus" 2026', category: 'bounty', source: 'web', weight: 0.9 },
  { q: 'site:reddit.com/r/bugbounty "just found" OR "payout" OR "tips" OR "methodology"', category: 'bounty', source: 'reddit', weight: 0.85 },
];

async function braveSearch(query, count = MAX_RESULTS_PER_QUERY) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}&freshness=pw`;
  
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': BRAVE_API_KEY,
    },
  });
  
  if (!res.ok) {
    console.error(`Brave search failed (${res.status}): ${query.substring(0, 50)}`);
    return [];
  }
  
  const data = await res.json();
  return (data.web?.results || []).map(r => ({
    title: r.title,
    url: r.url,
    description: r.description,
    published: r.page_age || null,
  }));
}

function scoreOpportunity(result, query) {
  let score = 30; // base
  const text = `${result.title} ${result.description}`.toLowerCase();
  const url = result.url.toLowerCase();
  
  // Skip obvious non-opportunities
  if (url.includes('wikipedia.org')) return 5;
  if (text.includes('weather') || text.includes('väder')) return 5;
  if (text.includes('polisen') || text.includes('olycka')) return 5;
  
  // Goal matching
  for (const kw of GOALS.primary) {
    if (text.includes(kw)) score += 15;
  }
  for (const kw of GOALS.secondary) {
    if (text.includes(kw)) score += 10;
  }
  for (const kw of GOALS.freelance) {
    if (text.includes(kw)) score += 12;
  }
  for (const kw of GOALS.local) {
    if (text.includes(kw)) score += 18; // Local = huge boost
  }
  
  // Actionable signals (someone NEEDS something)
  if (text.includes('looking for') || text.includes('need') || text.includes('hiring') || text.includes('söker') || text.includes('behöver')) score += 15;
  if (text.includes('freelance') || text.includes('remote') || text.includes('contract')) score += 10;
  if (text.includes('grant') || text.includes('funding') || text.includes('competition') || text.includes('tävling')) score += 12;
  
  // OpenClaw ecosystem (high value for self-improvement)
  for (const kw of GOALS.openclaw) {
    if (text.includes(kw)) score += 12;
  }
  if (query.category.startsWith('openclaw')) score += 15; // Boost all openclaw results
  if (text.includes('new skill') || text.includes('built a skill') || text.includes('automation')) score += 10;
  if (text.includes('tutorial') || text.includes('guide') || text.includes('how to')) score += 8;
  
  // Bug bounty signals
  if (text.includes('bounty') || text.includes('hackerone') || text.includes('bugcrowd')) score += 12;
  if (text.includes('payout') || text.includes('reward') || text.includes('critical')) score += 10;
  if (text.includes('new program') || text.includes('new scope') || text.includes('launched')) score += 8;
  if (query.category === 'bounty') score += 15;
  
  // Source weight
  score = Math.round(score * query.weight);
  
  // Freshness bonus
  if (result.published) {
    const age = result.published.toLowerCase();
    if (age.includes('hour') || age.includes('minute')) score += 15;
    else if (age.includes('day') && parseInt(age) <= 3) score += 10;
    else if (age.includes('day') && parseInt(age) <= 7) score += 5;
  }
  
  // Cap at 100
  return Math.min(100, Math.max(5, score));
}

function detectSource(url) {
  if (url.includes('x.com') || url.includes('twitter.com')) return 'Twitter';
  if (url.includes('linkedin.com')) return 'LinkedIn';
  if (url.includes('reddit.com')) return 'Reddit';
  if (url.includes('upwork.com')) return 'Upwork';
  if (url.includes('fiverr.com')) return 'Fiverr';
  if (url.includes('github.com')) return 'GitHub';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('clawhub.com')) return 'ClawHub';
  if (url.includes('hackerone.com')) return 'HackerOne';
  if (url.includes('bugcrowd.com')) return 'Bugcrowd';
  if (url.includes('openclaw.ai') || url.includes('docs.openclaw')) return 'OpenClaw';
  return 'Web';
}

async function runScout() {
  console.log(`🔍 Scout Engine starting — ${QUERIES.length} queries`);
  
  const allResults = [];
  const seen = new Set();
  
  for (const q of QUERIES) {
    console.log(`  Searching: ${q.q.substring(0, 60)}...`);
    
    try {
      const results = await braveSearch(q.q);
      
      for (const r of results) {
        // Dedup by URL
        if (seen.has(r.url)) continue;
        seen.add(r.url);
        
        const score = scoreOpportunity(r, q);
        
        allResults.push({
          id: `scout-${Date.now()}-${allResults.length}`,
          title: r.title.replace(/<\/?[^>]+(>|$)/g, '').substring(0, 120),
          summary: r.description?.replace(/<\/?[^>]+(>|$)/g, '').substring(0, 300) || '',
          url: r.url,
          score,
          source: detectSource(r.url),
          category: q.category,
          found: new Date().toISOString(),
          status: 'new',
          published: r.published || null,
          tags: [q.category, q.source],
        });
      }
      
      // Rate limit: 1 req/sec
      await new Promise(r => setTimeout(r, 1100));
    } catch (err) {
      console.error(`  Error on query: ${err.message}`);
    }
  }
  
  // Sort by score descending
  allResults.sort((a, b) => b.score - a.score);
  
  // Limit
  const trimmed = allResults.slice(0, MAX_TOTAL);
  
  // Load existing results to preserve statuses
  let existing = {};
  try {
    const old = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    for (const o of (old.opportunities || [])) {
      existing[o.url] = o.status;
    }
  } catch {}
  
  // Preserve old statuses
  for (const r of trimmed) {
    if (existing[r.url] && existing[r.url] !== 'new') {
      r.status = existing[r.url];
    }
  }
  
  const output = {
    lastScan: new Date().toISOString(),
    queryCount: QUERIES.length,
    resultCount: trimmed.length,
    opportunities: trimmed,
  };
  
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✅ Scout complete: ${trimmed.length} opportunities found (${allResults.length} raw)`);
  console.log(`   Top score: ${trimmed[0]?.score || 0} — ${trimmed[0]?.title?.substring(0, 60) || 'none'}`);
  
  return output;
}

// Run
const dryRun = process.argv.includes('--dry-run');
if (dryRun) {
  console.log('DRY RUN — queries that would be executed:');
  QUERIES.forEach((q, i) => console.log(`  ${i + 1}. [${q.category}] ${q.q.substring(0, 80)}`));
} else {
  runScout().catch(err => {
    console.error('Scout failed:', err);
    process.exit(1);
  });
}
