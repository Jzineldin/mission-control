'use strict';
const express = require('express');
const { GATEWAY_PORT, GATEWAY_TOKEN } = require('../lib/config');
const { gatewayInvoke } = require('../lib/helpers');

const router = express.Router();

// POST /api/heartbeat/run — trigger manual heartbeat
router.post('/heartbeat/run', async (req, res) => {
  try {
    const result = await gatewayInvoke(GATEWAY_PORT, GATEWAY_TOKEN, 'cron', {
      action: 'wake',
      text: 'Manual heartbeat check from Mission Control',
      mode: 'now',
    });
    res.json({ status: 'triggered', result });
  } catch (e) {
    console.error('[Heartbeat run]', e.message);
    res.json({ status: 'error', error: e.message });
  }
});

// POST /api/quick/emails — disabled (email checks run via heartbeat/cron)
router.post('/quick/emails', (req, res) => {
  res.json({ status: 'ok', reply: 'Email checks run via scheduled heartbeats. No manual ping needed.' });
});

// POST /api/quick/schedule — disabled (calendar checks run via heartbeat/cron)
router.post('/quick/schedule', (req, res) => {
  res.json({ status: 'ok', reply: 'Calendar checks run via scheduled heartbeats.' });
});

module.exports = router;
