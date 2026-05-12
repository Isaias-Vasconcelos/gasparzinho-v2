const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { auth } = require('../middleware/auth');
const whatsappService = require('../services/whatsapp');

const router = express.Router();

async function getSessionLimit(tenantId) {
  const tenant = await db.prepare('SELECT plan_id, plan_expires_at FROM tenants WHERE id = ?').get(tenantId);
  if (!tenant) return 1;

  if (tenant.plan_expires_at && new Date(tenant.plan_expires_at) < new Date()) {
    await db.prepare("UPDATE tenants SET plan_id = 'free', plan_expires_at = NULL WHERE id = ?").run(tenantId);
    return 1;
  }

  const plan = await db.prepare('SELECT max_sessions FROM plans WHERE slug = ?').get(tenant.plan_id);
  return plan?.max_sessions ?? 1;
}

router.get('/', auth, async (req, res) => {
  const sessions = await db.prepare(`
    SELECT s.id, s.name, s.phone, s.display_name, s.status, s.created_at,
      COUNT(g.id) as managed_count
    FROM sessions s
    LEFT JOIN group_settings g ON g.session_id = s.id AND g.is_managed = 1
    WHERE s.tenant_id = ?
    GROUP BY s.id
    ORDER BY s.created_at ASC
  `).all(req.tenantId);
  res.json(sessions);
});

router.post('/', auth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });

  const maxSessions = await getSessionLimit(req.tenantId);
  const row = await db.prepare('SELECT COUNT(*) as c FROM sessions WHERE tenant_id = ?').get(req.tenantId);
  const current = row.c;

  if (maxSessions !== -1 && current >= maxSessions) {
    return res.status(403).json({
      error: `Limite de sessões atingido para o seu plano (${maxSessions} ${maxSessions > 1 ? 'sessões' : 'sessão'}).`,
      upgrade_required: true,
    });
  }

  const id = uuidv4();
  await db.prepare('INSERT INTO sessions (id, tenant_id, name) VALUES (?, ?, ?)').run(id, req.tenantId, name);
  res.status(201).json({ id, name, status: 'disconnected', managed_count: 0 });
});

router.get('/:id/status', auth, async (req, res) => {
  const session = await db
    .prepare('SELECT id, name, phone, status, qr_code FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(req.params.id, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
  res.json(session);
});

router.post('/:id/connect', auth, async (req, res) => {
  const session = await db
    .prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(req.params.id, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  if (session.status === 'connected') {
    return res.status(400).json({ error: 'Sessão já está conectada' });
  }

  whatsappService.startSession(session.id, req.tenantId).catch((err) => {
    console.error(`[connect] Sessão ${session.id}:`, err.message);
  });

  res.json({ ok: true, message: 'Sessão iniciando...' });
});

router.post('/:id/disconnect', auth, async (req, res) => {
  const session = await db
    .prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(req.params.id, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  try {
    await whatsappService.disconnectSession(session.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  const session = await db
    .prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(req.params.id, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  try { await whatsappService.disconnectSession(session.id); } catch {}
  await db.prepare('DELETE FROM group_settings WHERE session_id = ?').run(req.params.id);
  await db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/:id/groups', auth, async (req, res) => {
  const session = await db
    .prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(req.params.id, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  try {
    const groups = await whatsappService.getGroups(session.id);
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/qr-stream', auth, async (req, res) => {
  const session = await db
    .prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(req.params.id, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const current = await db.prepare('SELECT status, qr_code FROM sessions WHERE id = ?').get(req.params.id);
  send(current);

  const unsubscribe = whatsappService.subscribe(req.params.id, (event) => {
    send(event);
    if (event.status === 'connected') res.end();
  });

  req.on('close', () => unsubscribe());
});

module.exports = router;
