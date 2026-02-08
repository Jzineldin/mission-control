#!/usr/bin/env node
/**
 * Scout Engine — Searches for opportunities based on configured queries
 * Uses Brave Search API to find leads across various sources
 *
 * Usage: node scout-engine.js [--dry-run]
 * Output: writes to scout-results.json
 */

const fs = require('fs');
const path = require('path');

const BRAVE_API_KEY = (() => {
  // Try mc-config.json first, then ~/.config/brave/api_key, then hardcoded fallback
  try {
    const mc = JSON.parse(fs.readFileSync(path.join(__dirname, 'mc-config.json'), 'utf8'));
    if (mc.scout?.braveApiKey) return mc.scout.braveApiKey;
  } catch {}
  try {
    const keyFile = path.join(process.env.HOME || '/home/ubuntu', '.config/brave/api_key');
    const key = fs.readFileSync(keyFile, 'utf8').trim();
    if (key) return key;
  } catch {}
  return process.env.BRAVE_API_KEY || '';
})();
const RESULTS_FILE = path.join(__dirname, 'scout-results.json');
const MAX_RESULTS_PER_QUERY = 5;
const MAX_TOTAL = 50;

// Default goals for scoring (can be overridden in mc-config.json)
const GOALS = {
  primary: ['developer', 'development', 'programming', 'software', 'engineer'],
  secondary: ['ai', 'machine learning', 'automation', 'startup', 'innovation'],
  freelance: ['freelance', 'contract', 'remote', 'consultant', 'project'],
  local: ['sweden', 'swedish', 'småland', 'kronoberg', 'växjö', 'jönköping', 'stockholm'],
  openclaw: ['openclaw', 'clawd', 'mission control', 'ai agent', 'skill', 'sub-agent', 'heartbeat', 'cron job', 'gateway'],
};

// Default queries (fallback)
const DEFAULT_QUERIES = [
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

// Load queries from mc-config.json, fallback to defaults
function loadQueries() {
  try {
    const configPath = path.join(__dirname, 'mc-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.scout?.queries && Array.isArray(config.scout.queries) && config.scout.queries.length > 0) {
        console.log(`📋 Loaded ${config.scout.queries.length} queries from mc-config.json`);
        return config.scout.queries;
      }
    }
  } catch (e) {
    console.warn('⚠️  Could not load queries from mc-config.json, using defaults:', e.message);
  }

  // Default fallback queries
  console.log(`📋 Using ${DEFAULT_QUERIES.length} default queries`);
  return DEFAULT_QUERIES;
}

// Load queries on startup
const QUERIES = loadQueries();

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
    id: `scout-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
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
  if (query.category && query.category.startsWith('openclaw')) score += 15; // Boost all openclaw results
  if (text.includes('new skill') || text.includes('built a skill') || text.includes('automation')) score += 10;
  if (text.includes('tutorial') || text.includes('guide') || text.includes('how to')) score += 8;
  
  // Bug bounty signals
  if (text.includes('bounty') || text.includes('hackerone') || text.includes('bugcrowd')) score += 12;
  if (text.includes('payout') || text.includes('reward') || text.includes('critical')) score += 10;
  if (text.includes('new program') || text.includes('new scope') || text.includes('launched')) score += 8;
  if (query.category === 'bounty') score += 15;
  
  // Source weight
  score = Math.round(score * (query.weight || 1.0));
  
  // Freshness bonus
  if (result.published) {
    const age = result.published.toLowerCase();
    if (age.includes('hour') || age.includes('minute')) score += 15;
    else if (age.includes('day') && parseInt(age) <= 3) score += 10;
    else if (age.includes('day') && parseInt(age) <= 7) score += 5;
  }
  
  return Math.max(5, Math.min(100, score)); // Clamp to 5-100
}

function dedupe(results) {
  const seen = new Set();
  return results.filter(r => {
    const key = r.url.split('?')[0]; // Ignore query params
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('🔍 Scout Engine starting...');
  console.log(`📊 Running ${QUERIES.length} queries (${isDryRun ? 'DRY RUN' : 'LIVE'})`);
  
  if (isDryRun) {
    console.log('✅ Config loaded successfully, queries:', QUERIES.slice(0, 3).map(q => q.q));
    return;
  }
  
  const allResults = [];
  
  for (const query of QUERIES) {
    console.log(`🔍 ${query.category}: "${query.q.substring(0, 60)}..."`);
    
    try {
      const results = await braveSearch(query.q);
      console.log(`   ${results.length} results found`);
      
      for (const result of results) {
        const scored = {
          ...result,
          query: query.q,
          category: query.category,
          source: query.source,
          score: scoreOpportunity(result, query),
          scannedAt: new Date().toISOString(),
        };
        
        if (scored.score >= 35) { // Only keep decent opportunities
          allResults.push(scored);
        }
      }
    } catch (e) {
      console.error(`❌ Query failed: ${e.message}`);
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Dedupe and sort
  const deduped = dedupe(allResults);
  const sorted = deduped.sort((a, b) => b.score - a.score).slice(0, MAX_TOTAL);
  
  console.log(`\n📈 Found ${sorted.length} new opportunities (${deduped.length} before limit)`);
  
  // Merge with existing results (preserve old opportunities, add new ones)
  let existingOpps = [];
  try {
    const existing = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    existingOpps = existing.opportunities || [];
    console.log(`📂 Merging with ${existingOpps.length} existing opportunities`);
  } catch { /* No existing file — first scan */ }

  // Build URL set from new results for dedup
  const newUrls = new Set(sorted.map(o => o.url));
  
  // Keep old opportunities that aren't duplicates of new ones
  // Also keep deployed/dismissed status from old entries
  const preserved = existingOpps.filter(old => {
    if (newUrls.has(old.url)) return false; // New version replaces old
    return true; // Keep non-duplicate old results
  });

  // Merge: new results first, then preserved old ones
  const merged = [...sorted, ...preserved];
  
  const output = {
    generatedAt: new Date().toISOString(),
    totalQueries: QUERIES.length,
    totalResults: merged.length,
    newThisScan: sorted.length,
    opportunities: merged,
  };
  
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2));
  console.log(`💾 Saved ${merged.length} total (${sorted.length} new + ${preserved.length} kept)`);
  
  // Show top 5
  console.log('\n🏆 Top opportunities:');
  sorted.slice(0, 5).forEach((opp, i) => {
    console.log(`${i + 1}. [${opp.score}] ${opp.title} (${opp.category})`);
    console.log(`   ${opp.url}`);
  });
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { loadQueries, scoreOpportunity, GOALS };