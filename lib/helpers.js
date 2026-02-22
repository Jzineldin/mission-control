const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

/**
 * Read and parse a JSON file. Returns fallback on any error.
 */
function readJSONSync(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

/**
 * Async read and parse a JSON file. Returns fallback on any error.
 */
async function readJSON(filePath, fallback = null) {
  try {
    const data = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return fallback;
  }
}

/**
 * Write JSON to file (sync). Creates parent dirs if needed.
 */
function writeJSONSync(filePath, data, indent = 2) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, indent));
    return true;
  } catch (err) {
    console.error(`[writeJSON] Failed to write ${filePath}:`, err.message);
    return false;
  }
}

/**
 * Async write JSON to file.
 */
async function writeJSON(filePath, data, indent = 2) {
  try {
    const dir = path.dirname(filePath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(filePath, JSON.stringify(data, null, indent));
    return true;
  } catch (err) {
    console.error(`[writeJSON] Failed to write ${filePath}:`, err.message);
    return false;
  }
}

/**
 * Fetch from OpenClaw gateway with auth.
 */
async function gatewayFetch(gatewayPort, gatewayToken, endpoint, options = {}) {
  const url = `http://127.0.0.1:${gatewayPort}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${gatewayToken}`,
    ...options.headers,
  };
  try {
    const res = await fetch(url, { ...options, headers });
    return res;
  } catch (err) {
    console.error(`[gatewayFetch] ${endpoint}:`, err.message);
    throw err;
  }
}

/**
 * Invoke a tool via gateway /tools/invoke endpoint.
 */
async function gatewayInvoke(gatewayPort, gatewayToken, tool, args = {}) {
  const res = await gatewayFetch(gatewayPort, gatewayToken, '/tools/invoke', {
    method: 'POST',
    body: JSON.stringify({ tool, args }),
  });
  const data = await res.json();
  if (data?.result?.details) return data.result.details;
  const text = data?.result?.content?.[0]?.text;
  if (text) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return data;
}

/**
 * Generate a prefixed unique ID.
 */
function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Read a JSONL Claude transcript and return the last assistant message text.
 * Returns '' if the file is unreadable or contains no assistant messages.
 */
async function getLastAssistantMessage(transcriptPath) {
  try {
    const lines = (await fsp.readFile(transcriptPath, 'utf8')).trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const evt = JSON.parse(lines[i]);
        if (evt.type === 'message' && evt.message?.role === 'assistant') {
          const content = evt.message.content;
          const text = Array.isArray(content)
            ? content.filter(c => c.type === 'text').map(c => c.text).join('\n')
            : typeof content === 'string' ? content : '';
          if (text) return text;
        }
      } catch {
        // skip malformed JSONL line
      }
    }
  } catch {
    // file unreadable
  }
  return '';
}

module.exports = {
  readJSON,
  readJSONSync,
  writeJSON,
  writeJSONSync,
  gatewayFetch,
  gatewayInvoke,
  generateId,
  getLastAssistantMessage,
};
