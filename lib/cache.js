'use strict';
// Shared in-memory cache state.
// Modules mutate these properties directly (e.g. cache.cron = null to invalidate).

module.exports = {
  // /api/status
  status: null,
  statusTime: 0,
  STATUS_TTL: 60000,

  // /api/sessions
  sessions: null,
  sessionsTime: 0,
  SESSIONS_TTL: 60000,

  // /api/activity
  activity: null,
  activityTime: 0,
  ACTIVITY_TTL: 30000,

  // /api/costs
  costs: null,
  costsTime: 0,
  COSTS_TTL: 60000,

  // /api/cron
  cron: null,
  cronTime: 0,
  CRON_TTL: 30000,
};
