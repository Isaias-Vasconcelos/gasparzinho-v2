const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { superAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Campos obrigatórios' });

  const sa = await db.prepare('SELECT * FROM super_admins WHERE username = ?').get(username);
  if (!sa || !bcrypt.compareSync(password, sa.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const token = jwt.sign(
    { superAdmin: true, superAdminId: sa.id },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, username: sa.username });
});

router.get('/stats', superAuth, async (req, res) => {
  const [totalTenants, totalSessions, totalUsers, activeSubscriptions, totalBans, byPlan] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM tenants').get().then(r => r.c),
    db.prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'connected'").get().then(r => r.c),
    db.prepare('SELECT COUNT(*) as c FROM users').get().then(r => r.c),
    db.prepare("SELECT COUNT(*) as c FROM tenants WHERE stripe_subscription_status = 'active'").get().then(r => r.c),
    db.prepare('SELECT COUNT(*) as c FROM bans').get().then(r => r.c),
    db.prepare(`
      SELECT p.name, p.slug, COUNT(t.id) as count
      FROM plans p
      LEFT JOIN tenants t ON t.plan_id = p.slug
      GROUP BY p.slug, p.name
    `).all(),
  ]);

  res.json({ totalTenants, totalSessions, totalUsers, activeSubscriptions, totalBans, byPlan });
});

router.get('/tenants', superAuth, async (req, res) => {
  const tenants = await db.prepare(`
    SELECT
      t.id, t.name, t.plan_id, t.plan_expires_at, t.created_at,
      t.stripe_subscription_status,
      p.name as plan_name, p.max_sessions, p.price_cents,
      (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) as user_count,
      (SELECT COUNT(*) FROM sessions s WHERE s.tenant_id = t.id) as session_count,
      (SELECT COUNT(*) FROM sessions s WHERE s.tenant_id = t.id AND s.status = 'connected') as active_sessions
    FROM tenants t
    LEFT JOIN plans p ON p.slug = t.plan_id
    ORDER BY t.created_at DESC
  `).all();
  res.json(tenants);
});

router.put('/tenants/:id/plan', superAuth, async (req, res) => {
  const { plan_slug, expires_at } = req.body;
  if (!plan_slug) return res.status(400).json({ error: 'plan_slug é obrigatório' });

  const plan = await db.prepare('SELECT slug FROM plans WHERE slug = ?').get(plan_slug);
  if (!plan) return res.status(404).json({ error: 'Plano não encontrado' });

  await db.prepare('UPDATE tenants SET plan_id = ?, plan_expires_at = ? WHERE id = ?')
    .run(plan_slug, expires_at || null, req.params.id);

  res.json({ ok: true });
});

router.delete('/tenants/:id', superAuth, async (req, res) => {
  const tenant = await db.prepare('SELECT id FROM tenants WHERE id = ?').get(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });

  try {
    await db.transaction(async (txDb) => {
      await txDb.prepare('DELETE FROM bans WHERE tenant_id = ?').run(req.params.id);
      await txDb.prepare('DELETE FROM custom_commands WHERE tenant_id = ?').run(req.params.id);
      await txDb.prepare('DELETE FROM profanity_words WHERE tenant_id = ?').run(req.params.id);
      await txDb.prepare('DELETE FROM group_settings WHERE tenant_id = ?').run(req.params.id);
      await txDb.prepare('DELETE FROM sessions WHERE tenant_id = ?').run(req.params.id);
      await txDb.prepare('DELETE FROM payment_requests WHERE tenant_id = ?').run(req.params.id);
      await txDb.prepare('DELETE FROM ai_configs WHERE tenant_id = ?').run(req.params.id);
      await txDb.prepare('DELETE FROM warnings WHERE tenant_id = ?').run(req.params.id);
      await txDb.prepare('DELETE FROM users WHERE tenant_id = ?').run(req.params.id);
      await txDb.prepare('DELETE FROM tenants WHERE id = ?').run(req.params.id);
    });
  } catch {
    return res.status(500).json({ error: 'Erro ao remover tenant' });
  }

  res.json({ ok: true });
});

router.get('/users', superAuth, async (req, res) => {
  const users = await db.prepare(`
    SELECT u.id, u.username, u.email, u.role, u.created_at,
           u.tenant_id, t.name as tenant_name, t.plan_id, p.name as plan_name
    FROM users u
    LEFT JOIN tenants t ON t.id = u.tenant_id
    LEFT JOIN plans p ON p.slug = t.plan_id
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

router.delete('/users/:id', superAuth, async (req, res) => {
  const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  await db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/plans', superAuth, async (req, res) => {
  res.json(await db.prepare('SELECT * FROM plans ORDER BY price_cents ASC').all());
});

router.put('/plans/:slug', superAuth, async (req, res) => {
  const { name, max_sessions, price_cents, features, is_active } = req.body;
  await db.prepare(`UPDATE plans SET
    name         = COALESCE(?, name),
    max_sessions = COALESCE(?, max_sessions),
    price_cents  = COALESCE(?, price_cents),
    features     = COALESCE(?, features),
    is_active    = COALESCE(?, is_active)
  WHERE slug = ?`).run(
    name || null,
    max_sessions ?? null,
    price_cents ?? null,
    features ? JSON.stringify(features) : null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    req.params.slug
  );
  const updated = await db.prepare('SELECT * FROM plans WHERE slug = ?').get(req.params.slug);
  res.json(updated);
});

// ── Config de IA do sistema ───────────────────────────────────────────────

router.get('/ai-config', superAuth, async (req, res) => {
  const config = await db.prepare("SELECT * FROM system_ai_config WHERE id = 'system'").get();
  if (!config) return res.json({ provider: 'openai', model: 'gpt-4o-mini', api_key: '', enabled: false, credits_exhausted: false });
  const masked = config.api_key
    ? config.api_key.slice(0, 6) + '••••••••••••••••••••'
    : '';
  res.json({ ...config, api_key: masked, credits_exhausted: !!(config.credits_exhausted) });
});

router.put('/ai-config', superAuth, async (req, res) => {
  const { provider, model, api_key, enabled, profanity_prompt, nsfw_prompt } = req.body;
  const isNewKey = api_key !== undefined && !api_key.includes('••••');
  await db.prepare(`UPDATE system_ai_config SET
    provider          = COALESCE(?, provider),
    model             = COALESCE(?, model),
    api_key           = ${isNewKey ? '?' : 'api_key'},
    enabled           = COALESCE(?, enabled),
    profanity_prompt  = COALESCE(?, profanity_prompt),
    nsfw_prompt       = COALESCE(?, nsfw_prompt),
    credits_exhausted = ${isNewKey ? '0' : 'credits_exhausted'}
  WHERE id = 'system'`).run(
    ...(isNewKey
      ? [provider || null, model || null, api_key || null, enabled !== undefined ? (enabled ? 1 : 0) : null, profanity_prompt || null, nsfw_prompt || null]
      : [provider || null, model || null,                   enabled !== undefined ? (enabled ? 1 : 0) : null, profanity_prompt || null, nsfw_prompt || null])
  );
  res.json({ ok: true });
});

router.get('/payments', superAuth, async (req, res) => {
  const status = req.query.status;
  const sql = `SELECT pr.*, t.name as tenant_name, p.name as plan_name
    FROM payment_requests pr
    LEFT JOIN tenants t ON t.id = pr.tenant_id
    LEFT JOIN plans p ON p.slug = pr.plan_slug
    ${status ? 'WHERE pr.status = ?' : ''}
    ORDER BY pr.created_at DESC`;
  const rows = status
    ? await db.prepare(sql).all(status)
    : await db.prepare(sql).all();
  res.json(rows);
});

router.post('/payments/:id/approve', superAuth, async (req, res) => {
  const pr = await db.prepare('SELECT * FROM payment_requests WHERE id = ?').get(req.params.id);
  if (!pr) return res.status(404).json({ error: 'Solicitação não encontrada' });

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await db.prepare('UPDATE tenants SET plan_id = ?, plan_expires_at = ? WHERE id = ?')
    .run(pr.plan_slug, expiresAt, pr.tenant_id);
  await db.prepare("UPDATE payment_requests SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(pr.id);

  res.json({ ok: true });
});

router.post('/payments/:id/reject', superAuth, async (req, res) => {
  const { notes } = req.body;
  const result = await db.prepare(
    "UPDATE payment_requests SET status = 'rejected', notes = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(notes || null, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Solicitação não encontrada' });
  res.json({ ok: true });
});

// ── Ganhos / assinaturas Stripe ───────────────────────────────────────────────

router.get('/earnings', superAuth, async (req, res) => {
  const [activeCount, pastDueCount, canceledCount, mrrRow, byPlanRaw, recentSubscribers] = await Promise.all([
    db.prepare("SELECT COUNT(*) as c FROM tenants WHERE stripe_subscription_status = 'active'").get().then(r => r.c),
    db.prepare("SELECT COUNT(*) as c FROM tenants WHERE stripe_subscription_status = 'past_due'").get().then(r => r.c),
    db.prepare("SELECT COUNT(*) as c FROM tenants WHERE stripe_subscription_status = 'canceled'").get().then(r => r.c),
    db.prepare(`
      SELECT COALESCE(SUM(p.price_cents), 0) as total
      FROM tenants t
      JOIN plans p ON p.slug = t.plan_id
      WHERE t.stripe_subscription_status = 'active' AND p.price_cents > 0
    `).get(),
    db.prepare(`
      SELECT p.name, p.slug, p.price_cents, COUNT(t.id) as cnt
      FROM tenants t
      JOIN plans p ON p.slug = t.plan_id
      WHERE t.stripe_subscription_status = 'active' AND p.price_cents > 0
      GROUP BY p.slug, p.name, p.price_cents
      ORDER BY p.price_cents DESC
    `).all(),
    db.prepare(`
      SELECT t.name, t.plan_id, t.created_at, t.stripe_subscription_status,
             p.name as plan_name, p.price_cents
      FROM tenants t
      JOIN plans p ON p.slug = t.plan_id
      WHERE t.stripe_subscription_id IS NOT NULL
      ORDER BY t.created_at DESC
      LIMIT 15
    `).all(),
  ]);

  const mrrCents = mrrRow.total || 0;
  const byPlan = byPlanRaw.map(p => ({ ...p, count: Number(p.cnt), revenue_cents: Number(p.cnt) * p.price_cents }));

  let balance = null;
  let recentCharges = [];
  let stripeAvailable = false;

  try {
    const stripe = getStripe();
    const [bal, charges] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.charges.list({ limit: 25 }),
    ]);
    balance = {
      available: bal.available.map(b => ({ amount: b.amount, currency: b.currency })),
      pending:   bal.pending.map(b => ({ amount: b.amount, currency: b.currency })),
    };
    recentCharges = charges.data.map(c => ({
      id: c.id,
      amount: c.amount,
      currency: c.currency,
      status: c.status,
      created: c.created,
      receipt_email: c.receipt_email,
      customer_name: c.billing_details?.name || null,
    }));
    stripeAvailable = true;
  } catch (_) { /* Stripe não configurado ou erro de rede */ }

  res.json({ activeCount, pastDueCount, canceledCount, mrrCents, byPlan, recentSubscribers, balance, recentCharges, stripeAvailable });
});

module.exports = router;
