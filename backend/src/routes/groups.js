const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { auth } = require('../middleware/auth');
const whatsappService = require('../services/whatsapp');


const router = express.Router();

const PLAN_TIER = { free: 0, starter: 1, pro: 2 };

async function getGroupLimit(tenantId) {
  const tenant = await db.prepare('SELECT plan_id FROM tenants WHERE id = ?').get(tenantId);
  if (!tenant) return 2;
  const plan = await db.prepare('SELECT max_groups FROM plans WHERE slug = ?').get(tenant.plan_id);
  return plan?.max_groups ?? 2;
}

async function getPlanTier(tenantId) {
  const tenant = await db.prepare('SELECT plan_id, plan_expires_at FROM tenants WHERE id = ?').get(tenantId);
  if (!tenant) return 0;
  if (tenant.plan_expires_at && new Date(tenant.plan_expires_at) < new Date()) return 0;
  return PLAN_TIER[tenant.plan_id] ?? 0;
}

function checkFeatureAccess(fields, tier) {
  const blocked = [];
  if (tier < 1) {
    if (fields.lock_enabled)      blocked.push('Bloqueio por horário (Starter)');
    if (fields.flood_limit > 0)   blocked.push('Anti-flood (Starter)');
    if (fields.ban_viewonce)      blocked.push('Bloqueio de visualização única (Starter)');
    if (fields.ban_media)         blocked.push('Bloqueio de mídias (Starter)');
    if (fields.ban_nsfw)          blocked.push('Moderação de mídia com IA (Starter)');
    if (fields.ai_enabled)        blocked.push('Resposta com IA (Starter)');
  }
  return blocked;
}

// ── Bans ─────────────────────────────────────────────────────────────────────

router.get('/bans', auth, async (req, res) => {
  const bans = await db
    .prepare('SELECT * FROM bans WHERE tenant_id = ? ORDER BY created_at DESC')
    .all(req.tenantId);
  res.json(bans);
});

router.delete('/bans/:id', auth, async (req, res) => {
  const result = await db
    .prepare('DELETE FROM bans WHERE id = ? AND tenant_id = ?')
    .run(req.params.id, req.tenantId);
  if (result.changes === 0) return res.status(404).json({ error: 'Ban não encontrado' });
  res.json({ ok: true });
});

// ── Bulk update ───────────────────────────────────────────────────────────────

router.post('/bulk-update', auth, async (req, res) => {
  const { session_id, group_ids, settings } = req.body;
  if (!session_id || !Array.isArray(group_ids) || group_ids.length === 0) {
    return res.status(400).json({ error: 'session_id e group_ids são obrigatórios' });
  }

  const session = await db
    .prepare('SELECT id FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(session_id, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  const { lock_enabled, lock_start, lock_end, lock_days, lock_reason, ban_links, ban_profanity, ai_enabled, warn_chances, flood_limit, flood_period_min, flood_close_min } = settings || {};

  const tier = await getPlanTier(req.tenantId);
  const blocked = checkFeatureAccess({
    lock_enabled: lock_enabled === true,
    flood_limit: parseInt(flood_limit) || 0,
    ai_enabled: ai_enabled === true,
  }, tier);
  if (blocked.length > 0) {
    return res.status(403).json({
      error: `Funcionalidade não disponível no seu plano: ${blocked.join(', ')}.`,
      upgrade_required: true,
    });
  }

  try {
    await db.transaction(async (txDb) => {
      for (const groupId of group_ids) {
        let existing = await txDb
          .prepare('SELECT id FROM group_settings WHERE session_id = ? AND group_id = ?')
          .get(session_id, groupId);

        if (!existing) {
          const id = uuidv4();
          await txDb.prepare(
            'INSERT INTO group_settings (id, tenant_id, session_id, group_id, is_managed) VALUES (?, ?, ?, ?, 1)'
          ).run(id, req.tenantId, session_id, groupId);
          existing = { id };
        }

        await txDb.prepare(`UPDATE group_settings SET
          lock_enabled     = CASE WHEN ? IS NOT NULL THEN ? ELSE lock_enabled END,
          lock_start       = CASE WHEN ? IS NOT NULL THEN ? ELSE lock_start END,
          lock_end         = CASE WHEN ? IS NOT NULL THEN ? ELSE lock_end END,
          lock_days        = CASE WHEN ? IS NOT NULL THEN ? ELSE lock_days END,
          lock_reason      = CASE WHEN ? IS NOT NULL THEN ? ELSE lock_reason END,
          ban_links        = CASE WHEN ? IS NOT NULL THEN ? ELSE ban_links END,
          ban_profanity    = CASE WHEN ? IS NOT NULL THEN ? ELSE ban_profanity END,
          ai_enabled       = CASE WHEN ? IS NOT NULL THEN ? ELSE ai_enabled END,
          warn_chances     = CASE WHEN ? IS NOT NULL THEN ? ELSE warn_chances END,
          flood_limit      = CASE WHEN ? IS NOT NULL THEN ? ELSE flood_limit END,
          flood_period_min = CASE WHEN ? IS NOT NULL THEN ? ELSE flood_period_min END,
          flood_close_min  = CASE WHEN ? IS NOT NULL THEN ? ELSE flood_close_min END
        WHERE id = ?`).run(
          lock_enabled     !== undefined ? 1 : null, lock_enabled     !== undefined ? (lock_enabled     ? 1 : 0) : null,
          lock_start       !== undefined ? 1 : null, lock_start       ?? null,
          lock_end         !== undefined ? 1 : null, lock_end         ?? null,
          lock_days        !== undefined ? 1 : null, lock_days        ? JSON.stringify(lock_days) : null,
          lock_reason      !== undefined ? 1 : null, lock_reason      !== undefined ? (lock_reason || null) : null,
          ban_links        !== undefined ? 1 : null, ban_links        !== undefined ? (ban_links        ? 1 : 0) : null,
          ban_profanity    !== undefined ? 1 : null, ban_profanity    !== undefined ? (ban_profanity    ? 1 : 0) : null,
          ai_enabled       !== undefined ? 1 : null, ai_enabled       !== undefined ? (ai_enabled       ? 1 : 0) : null,
          warn_chances     !== undefined ? 1 : null, warn_chances     !== undefined ? Math.max(0, parseInt(warn_chances) || 0) : null,
          flood_limit      !== undefined ? 1 : null, flood_limit      !== undefined ? Math.max(0, parseInt(flood_limit) || 0) : null,
          flood_period_min !== undefined ? 1 : null, flood_period_min !== undefined ? Math.max(1, parseInt(flood_period_min) || 60) : null,
          flood_close_min  !== undefined ? 1 : null, flood_close_min  !== undefined ? Math.max(1, parseInt(flood_close_min) || 30) : null,
          existing.id
        );
      }
    });
  } catch {
    return res.status(500).json({ error: 'Erro ao aplicar configurações em lote' });
  }

  res.json({ ok: true, updated: group_ids.length });
});

// ── Grupos gerenciados ────────────────────────────────────────────────────────

router.get('/managed/:sessionId', auth, async (req, res) => {
  const { sessionId } = req.params;
  const session = await db
    .prepare('SELECT id FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(sessionId, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  const groups = (await db
    .prepare('SELECT * FROM group_settings WHERE session_id = ? AND tenant_id = ? AND is_managed = 1 ORDER BY group_name ASC')
    .all(sessionId, req.tenantId))
    .map((g) => ({ ...g, lock_days: JSON.parse(g.lock_days || '[0,1,2,3,4,5,6]') }));

  const limit = await getGroupLimit(req.tenantId);
  res.json({ groups, limit, count: groups.length });
});

router.post('/managed/:sessionId/:groupId', auth, async (req, res) => {
  const { sessionId, groupId } = req.params;
  const { group_name } = req.body;

  const session = await db
    .prepare('SELECT id FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(sessionId, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  const limit = await getGroupLimit(req.tenantId);
  if (limit !== -1) {
    const row = await db
      .prepare('SELECT COUNT(*) as c FROM group_settings WHERE tenant_id = ? AND is_managed = 1')
      .get(req.tenantId);
    if (row.c >= limit) {
      return res.status(403).json({
        error: `Limite de ${limit} grupo${limit > 1 ? 's' : ''} atingido no plano atual.`,
        upgrade_required: true,
      });
    }
  }

  let existing = await db
    .prepare('SELECT id FROM group_settings WHERE session_id = ? AND group_id = ?')
    .get(sessionId, groupId);

  if (!existing) {
    const id = uuidv4();
    await db.prepare(
      'INSERT INTO group_settings (id, tenant_id, session_id, group_id, group_name, is_managed) VALUES (?, ?, ?, ?, ?, 1)'
    ).run(id, req.tenantId, sessionId, groupId, group_name || null);
    existing = { id };
  } else {
    await db.prepare('UPDATE group_settings SET is_managed = 1, group_name = COALESCE(?, group_name) WHERE id = ?')
      .run(group_name || null, existing.id);
  }

  const updated = await db.prepare('SELECT * FROM group_settings WHERE id = ?').get(existing.id);
  res.json({ ...updated, lock_days: JSON.parse(updated.lock_days || '[0,1,2,3,4,5,6]') });
});

router.delete('/managed/:sessionId/:groupId', auth, async (req, res) => {
  const { sessionId, groupId } = req.params;

  const session = await db
    .prepare('SELECT id FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(sessionId, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  await db.prepare(
    'UPDATE group_settings SET is_managed = 0 WHERE session_id = ? AND group_id = ? AND tenant_id = ?'
  ).run(sessionId, groupId, req.tenantId);

  res.json({ ok: true });
});

// ── Configurações por grupo ───────────────────────────────────────────────────

router.get('/:sessionId/:groupId', auth, async (req, res) => {
  const { sessionId, groupId } = req.params;
  const session = await db
    .prepare('SELECT id FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(sessionId, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  let settings = await db
    .prepare('SELECT * FROM group_settings WHERE session_id = ? AND group_id = ?')
    .get(sessionId, groupId);

  if (!settings) {
    const id = uuidv4();
    await db.prepare(
      'INSERT INTO group_settings (id, tenant_id, session_id, group_id) VALUES (?, ?, ?, ?)'
    ).run(id, req.tenantId, sessionId, groupId);
    settings = await db.prepare('SELECT * FROM group_settings WHERE id = ?').get(id);
  }

  settings.lock_days = JSON.parse(settings.lock_days || '[0,1,2,3,4,5,6]');
  res.json(settings);
});

router.put('/:sessionId/:groupId', auth, async (req, res) => {
  const { sessionId, groupId } = req.params;
  const session = await db
    .prepare('SELECT id FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(sessionId, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  const { lock_enabled, lock_start, lock_end, lock_days, lock_reason, ban_links, ban_profanity, ban_nsfw, ban_viewonce, ban_media, ai_enabled, group_name, warn_chances, flood_limit, flood_period_min, flood_close_min, msg_warn, msg_ban, welcome_enabled, welcome_message } = req.body;

  const tier = await getPlanTier(req.tenantId);
  const blocked = checkFeatureAccess({
    lock_enabled: lock_enabled === true,
    flood_limit: parseInt(flood_limit) || 0,
    ban_viewonce: ban_viewonce === true,
    ban_media: ban_media === true,
    ban_nsfw: ban_nsfw === true,
    ai_enabled: ai_enabled === true,
  }, tier);
  if (blocked.length > 0) {
    return res.status(403).json({
      error: `Funcionalidade não disponível no seu plano: ${blocked.join(', ')}.`,
      upgrade_required: true,
    });
  }

  let settings = await db
    .prepare('SELECT id FROM group_settings WHERE session_id = ? AND group_id = ?')
    .get(sessionId, groupId);

  if (!settings) {
    const id = uuidv4();
    await db.prepare(
      'INSERT INTO group_settings (id, tenant_id, session_id, group_id) VALUES (?, ?, ?, ?)'
    ).run(id, req.tenantId, sessionId, groupId);
    settings = { id };
  }

  await db.prepare(
    `UPDATE group_settings SET
      lock_enabled     = COALESCE(?, lock_enabled),
      lock_start       = COALESCE(?, lock_start),
      lock_end         = COALESCE(?, lock_end),
      lock_days        = COALESCE(?, lock_days),
      lock_reason      = COALESCE(?, lock_reason),
      ban_links        = COALESCE(?, ban_links),
      ban_profanity    = COALESCE(?, ban_profanity),
      ban_nsfw         = COALESCE(?, ban_nsfw),
      ban_viewonce     = COALESCE(?, ban_viewonce),
      ban_media        = COALESCE(?, ban_media),
      ai_enabled       = COALESCE(?, ai_enabled),
      group_name       = COALESCE(?, group_name),
      warn_chances     = COALESCE(?, warn_chances),
      flood_limit      = COALESCE(?, flood_limit),
      flood_period_min = COALESCE(?, flood_period_min),
      flood_close_min  = COALESCE(?, flood_close_min),
      msg_warn         = ?,
      msg_ban          = ?,
      welcome_enabled  = COALESCE(?, welcome_enabled),
      welcome_message  = ?
    WHERE id = ?`
  ).run(
    lock_enabled     !== undefined ? (lock_enabled     ? 1 : 0) : null,
    lock_start       ?? null,
    lock_end         ?? null,
    lock_days        ? JSON.stringify(lock_days) : null,
    lock_reason      !== undefined ? (lock_reason || null) : null,
    ban_links        !== undefined ? (ban_links        ? 1 : 0) : null,
    ban_profanity    !== undefined ? (ban_profanity    ? 1 : 0) : null,
    ban_nsfw         !== undefined ? (ban_nsfw         ? 1 : 0) : null,
    ban_viewonce     !== undefined ? (ban_viewonce     ? 1 : 0) : null,
    ban_media        !== undefined ? (ban_media        ? 1 : 0) : null,
    ai_enabled       !== undefined ? (ai_enabled       ? 1 : 0) : null,
    group_name       ?? null,
    warn_chances     !== undefined ? Math.max(0, parseInt(warn_chances) || 0) : null,
    flood_limit      !== undefined ? Math.max(0, parseInt(flood_limit) || 0) : null,
    flood_period_min !== undefined ? Math.max(1, parseInt(flood_period_min) || 60) : null,
    flood_close_min  !== undefined ? Math.max(1, parseInt(flood_close_min) || 30) : null,
    msg_warn !== undefined ? (msg_warn || null) : null,
    msg_ban  !== undefined ? (msg_ban  || null) : null,
    welcome_enabled  !== undefined ? (welcome_enabled  ? 1 : 0) : null,
    welcome_message  !== undefined ? (welcome_message  || null) : null,
    settings.id
  );

  const updated = await db.prepare('SELECT * FROM group_settings WHERE id = ?').get(settings.id);
  whatsappService.scheduleLock(sessionId, groupId, updated);
  updated.lock_days = JSON.parse(updated.lock_days || '[0,1,2,3,4,5,6]');
  res.json(updated);
});

router.post('/:sessionId/:groupId/close', auth, async (req, res) => {
  const { sessionId, groupId } = req.params;
  const { reason, duration_minutes = 0 } = req.body;
  const session = await db.prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ?').get(sessionId, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
  try {
    await whatsappService.closeGroup(sessionId, groupId, reason || '', Math.max(0, parseInt(duration_minutes) || 0));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:sessionId/:groupId/open', auth, async (req, res) => {
  const { sessionId, groupId } = req.params;
  const session = await db.prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ?').get(sessionId, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
  try {
    await whatsappService.openGroup(sessionId, groupId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:sessionId/:groupId/remove/:phone', auth, async (req, res) => {
  const { sessionId, groupId, phone } = req.params;
  const session = await db
    .prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(sessionId, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  try {
    await whatsappService.removeMember(sessionId, groupId, phone);
    res.json({ ok: true, message: `${phone} removido do grupo` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:sessionId/:groupId/ban/:phone', auth, async (req, res) => {
  const { sessionId, groupId, phone } = req.params;
  const { reason = 'manual' } = req.body;

  const session = await db
    .prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(sessionId, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  try {
    await whatsappService.banMember(sessionId, groupId, phone, req.tenantId, reason);
    res.json({ ok: true, message: `${phone} banido do grupo` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Advertências ─────────────────────────────────────────────────────────────

router.get('/:sessionId/:groupId/warnings', auth, async (req, res) => {
  const { sessionId, groupId } = req.params;
  const session = await db
    .prepare('SELECT id FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(sessionId, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  const warnings = await db
    .prepare('SELECT * FROM warnings WHERE session_id = ? AND group_id = ? AND tenant_id = ? ORDER BY count DESC')
    .all(sessionId, groupId, req.tenantId);
  res.json(warnings);
});

router.delete('/:sessionId/:groupId/warnings/:phone', auth, async (req, res) => {
  const { sessionId, groupId, phone } = req.params;
  const session = await db
    .prepare('SELECT id FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(sessionId, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  await db.prepare(
    'DELETE FROM warnings WHERE session_id = ? AND group_id = ? AND phone = ? AND tenant_id = ?'
  ).run(sessionId, groupId, phone, req.tenantId);
  res.json({ ok: true });
});

router.delete('/:sessionId/:groupId/warnings', auth, async (req, res) => {
  const { sessionId, groupId } = req.params;
  const session = await db
    .prepare('SELECT id FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(sessionId, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  await db.prepare(
    'DELETE FROM warnings WHERE session_id = ? AND group_id = ? AND tenant_id = ?'
  ).run(sessionId, groupId, req.tenantId);
  res.json({ ok: true });
});

// ── Analytics ─────────────────────────────────────────────────────────────

router.get('/all-managed', auth, async (req, res) => {
  const groups = (await db
    .prepare(`SELECT gs.group_id, gs.group_name, gs.session_id, s.name as session_name
      FROM group_settings gs
      JOIN sessions s ON s.id = gs.session_id
      WHERE gs.tenant_id = ? AND gs.is_managed = 1
      ORDER BY s.name ASC, gs.group_name ASC`)
    .all(req.tenantId));
  res.json(groups);
});

router.get('/analytics', auth, async (req, res) => {
  const { period = 'month', session_id, group_id } = req.query;

  let format, limit;
  if (period === 'week')      { format = '%Y-%u'; limit = 8; }
  else if (period === 'year') { format = '%Y';    limit = 5; }
  else                        { format = '%Y-%m'; limit = 12; }

  const filters = ['tenant_id = ?'];
  const params  = [req.tenantId];
  if (session_id) { filters.push('session_id = ?'); params.push(session_id); }
  if (group_id)   { filters.push('group_id = ?');   params.push(group_id); }

  const where = filters.join(' AND ');

  const byPeriod = await db.prepare(
    `SELECT DATE_FORMAT(created_at, '${format}') as period, COUNT(*) as count
     FROM bans WHERE ${where}
     GROUP BY period ORDER BY period DESC LIMIT ${limit}`
  ).all(...params);

  const byReason = await db.prepare(
    `SELECT COALESCE(reason, 'outros') as reason, COUNT(*) as count
     FROM bans WHERE ${where}
     GROUP BY reason ORDER BY count DESC LIMIT 8`
  ).all(...params);

  const totalRow = await db.prepare(`SELECT COUNT(*) as total FROM bans WHERE ${where}`).get(...params);

  res.json({ by_period: byPeriod.reverse(), by_reason: byReason, total: totalRow?.total || 0 });
});

router.get('/:sessionId/:groupId/members', auth, async (req, res) => {
  const { sessionId, groupId } = req.params;
  const session = await db
    .prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ?')
    .get(sessionId, req.tenantId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  try {
    const members = await whatsappService.getGroupMembers(sessionId, groupId);
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
