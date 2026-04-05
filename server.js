const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { initDb, run, get, all } = require('./db');
const { buildStructuredOutput, cacheKey } = require('./ai');

const app = express();
const PORT = process.env.PORT || 3000;
const FREE_TIER_LIMIT = 15;
const PAID_TIER_LIMIT = 1000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const authTokens = new Map();
const otpStore = new Map();
const memoryStore = new Map();
const ALLOW_DEMO_OTP = process.env.ALLOW_DEMO_OTP === 'true';
// NOTE: In-memory stores keep this sample self-contained; use Redis/DB-backed stores for multi-instance production.

function nowIso() {
  return new Date().toISOString();
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function requireUser(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || !authTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userId = authTokens.get(token);
  const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(401).json({ error: 'Invalid session' });
  req.user = user;
  next();
}

async function trackEvent(userId, eventName, metadata = {}) {
  await run(
    'INSERT INTO usage_events(user_id, event_name, metadata_json, created_at) VALUES(?,?,?,?)',
    [userId || null, eventName, JSON.stringify(metadata), nowIso()]
  );
}

async function bumpUsage(userId) {
  const day = dayKey();
  const existing = await get('SELECT * FROM usage_counters WHERE user_id = ? AND day = ?', [userId, day]);
  if (!existing) {
    await run('INSERT INTO usage_counters(user_id, day, requests_count) VALUES(?,?,1)', [userId, day]);
    return 1;
  }
  await run('UPDATE usage_counters SET requests_count = requests_count + 1 WHERE id = ?', [existing.id]);
  return existing.requests_count + 1;
}

function usageLimit(plan) {
  return plan === 'paid' ? PAID_TIER_LIMIT : FREE_TIER_LIMIT;
}

app.get('/api/health', (_, res) => {
  res.json({ ok: true, service: 'SpideyWrite', time: nowIso() });
});

app.post('/api/auth/request-otp', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  const otp = String(crypto.randomInt(100000, 1000000));
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  otpStore.set(email, { otpHash, expiresAt: Date.now() + 5 * 60 * 1000 });
  await trackEvent(null, 'otp_requested', { emailDomain: email.split('@')[1] });
  const payload = { ok: true };
  if (ALLOW_DEMO_OTP) payload.otpDemo = otp;
  res.json(payload);
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const otp = String(req.body.otp || '').trim();
  const record = otpStore.get(email);
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  if (!record || record.expiresAt < Date.now() || record.otpHash !== otpHash) {
    return res.status(400).json({ error: 'Invalid OTP' });
  }

  let user = await get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    await run(
      'INSERT INTO users(email, plan, level, style, created_at) VALUES(?,?,?,?,?)',
      [email, 'free', 'intermediate', 'concise', nowIso()]
    );
    user = await get('SELECT * FROM users WHERE email = ?', [email]);
  }

  const token = makeToken();
  authTokens.set(token, user.id);
  otpStore.delete(email);
  await trackEvent(user.id, 'login', {});
  res.json({ token, user });
});

app.get('/api/me', requireUser, async (req, res) => {
  const today = await get('SELECT requests_count FROM usage_counters WHERE user_id = ? AND day = ?', [req.user.id, dayKey()]);
  res.json({
    user: req.user,
    usage: {
      today: today?.requests_count || 0,
      limit: usageLimit(req.user.plan),
    },
  });
});

app.patch('/api/preferences', requireUser, async (req, res) => {
  const level = ['beginner', 'intermediate', 'advanced'].includes(req.body.level) ? req.body.level : req.user.level;
  const style = ['concise', 'detailed'].includes(req.body.style) ? req.body.style : req.user.style;
  await run('UPDATE users SET level = ?, style = ? WHERE id = ?', [level, style, req.user.id]);
  const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  await trackEvent(user.id, 'preferences_updated', { level, style });
  res.json({ user });
});

app.post('/api/billing/upgrade', requireUser, async (req, res) => {
  await run('UPDATE users SET plan = ? WHERE id = ?', ['paid', req.user.id]);
  const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  await trackEvent(user.id, 'upgraded', {});
  res.json({ ok: true, user });
});

app.post('/api/sessions', requireUser, async (req, res) => {
  const title = String(req.body.title || 'Untitled workflow').slice(0, 120);
  const now = nowIso();
  const result = await run('INSERT INTO sessions(user_id, title, created_at, updated_at) VALUES(?,?,?,?)', [
    req.user.id,
    title,
    now,
    now,
  ]);
  await trackEvent(req.user.id, 'session_created', {});
  res.json({ id: result.lastID, title, createdAt: now });
});

app.get('/api/sessions', requireUser, async (req, res) => {
  const rows = await all('SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50', [req.user.id]);
  res.json({ sessions: rows });
});

app.get('/api/sessions/:id/runs', requireUser, async (req, res) => {
  const rows = await all(
    'SELECT * FROM workflow_runs WHERE user_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT 50',
    [req.user.id, req.params.id]
  );
  res.json({ runs: rows.map((r) => ({ ...r, result_json: JSON.parse(r.result_json) })) });
});

app.post('/api/ai/process', requireUser, async (req, res) => {
  const inputText = String(req.body.inputText || '').trim();
  const mode = ['summarize', 'explain', 'transform'].includes(req.body.mode) ? req.body.mode : 'summarize';
  const tone = ['neutral', 'professional', 'friendly', 'persuasive'].includes(req.body.tone) ? req.body.tone : 'neutral';
  const sessionId = Number(req.body.sessionId);
  const rerunOf = req.body.rerunOf ? Number(req.body.rerunOf) : null;

  if (!inputText) return res.status(400).json({ error: 'inputText is required' });

  const limit = usageLimit(req.user.plan);
  const currentCountRow = await get('SELECT requests_count FROM usage_counters WHERE user_id = ? AND day = ?', [req.user.id, dayKey()]);
  const currentCount = currentCountRow?.requests_count || 0;
  if (currentCount >= limit) {
    await trackEvent(req.user.id, 'usage_limit_hit', { limit });
    return res.status(402).json({
      error: 'Free tier limit reached',
      upgrade: true,
      limit,
    });
  }
  const currentUsage = await bumpUsage(req.user.id);

  // Short-term in-memory user context from recent inputs, used as lightweight personalization hints.
  const memory = memoryStore.get(req.user.id) || [];
  const key = cacheKey({ inputText, mode, tone, level: req.user.level, style: req.user.style });

  let cached = await get('SELECT * FROM response_cache WHERE cache_key = ?', [key]);
  let structured;
  let fromCache = false;

  if (cached) {
    structured = JSON.parse(cached.result_json);
    fromCache = true;
  } else {
    structured = buildStructuredOutput({
      inputText,
      mode,
      level: req.user.level,
      style: req.user.style,
      tone,
      memory,
    });
    await run('INSERT INTO response_cache(cache_key, result_json, created_at) VALUES(?,?,?)', [
      key,
      JSON.stringify(structured),
      nowIso(),
    ]);
  }

  memoryStore.set(req.user.id, [inputText, ...memory].slice(0, 5));

  const now = nowIso();
  const runResult = await run(
    `INSERT INTO workflow_runs(session_id, user_id, input_text, mode, tone, result_json, rerun_of, created_at)
     VALUES(?,?,?,?,?,?,?,?)`,
    [sessionId, req.user.id, inputText, mode, tone, JSON.stringify(structured), rerunOf, now]
  );

  await run('UPDATE sessions SET updated_at = ? WHERE id = ? AND user_id = ?', [now, sessionId, req.user.id]);
  await trackEvent(req.user.id, 'ai_processed', { mode, fromCache });

  res.json({
    runId: runResult.lastID,
    fromCache,
    usage: { today: currentUsage, limit },
    result: structured,
  });
});

app.post('/api/runs/:id/feedback', requireUser, async (req, res) => {
  const vote = req.body.vote === 'up' ? 1 : req.body.vote === 'down' ? -1 : 0;
  if (!vote) return res.status(400).json({ error: 'vote must be up/down' });
  await run('UPDATE workflow_runs SET feedback = ? WHERE id = ? AND user_id = ?', [vote, req.params.id, req.user.id]);
  await trackEvent(req.user.id, 'feedback_submitted', { vote });
  res.json({ ok: true });
});

app.post('/api/errors/report', requireUser, async (req, res) => {
  const message = String(req.body.message || 'unknown').slice(0, 500);
  await trackEvent(req.user.id, 'error_reported', { message });
  res.json({ ok: true });
});

app.get('/api/analytics/summary', requireUser, async (req, res) => {
  const events = await all(
    `SELECT event_name, COUNT(*) as count
     FROM usage_events
     WHERE user_id = ?
     GROUP BY event_name
     ORDER BY count DESC`,
    [req.user.id]
  );
  res.json({ events });
});

app.post('/api/integrations/telegram/webhook', async (req, res) => {
  await trackEvent(null, 'telegram_webhook_hit', { ok: true });
  res.json({ ok: true, note: 'Telegram integration endpoint ready' });
});

app.use((err, req, res, next) => {
  console.error(`[${nowIso()}]`, err?.message || 'internal_error');
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`SpideyWrite running on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
