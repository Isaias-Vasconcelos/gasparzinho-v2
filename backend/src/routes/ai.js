const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { auth } = require('../middleware/auth');
const { callAI } = require('../services/aiProviders');

const router = express.Router();

router.get('/config', auth, async (req, res) => {
  let config = await db.prepare('SELECT * FROM ai_configs WHERE tenant_id = ?').get(req.tenantId);
  if (!config) {
    const id = uuidv4();
    await db.prepare('INSERT INTO ai_configs (id, tenant_id) VALUES (?, ?)').run(id, req.tenantId);
    config = await db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(id);
  }
  res.json({ ...config, api_key: config.api_key ? '••••••••' + config.api_key.slice(-4) : '' });
});

router.put('/config', auth, async (req, res) => {
  const { enabled, api_key, provider, model, system_prompt, trigger_mode, trigger_keyword } = req.body;

  let config = await db.prepare('SELECT id FROM ai_configs WHERE tenant_id = ?').get(req.tenantId);
  if (!config) {
    const id = uuidv4();
    await db.prepare('INSERT INTO ai_configs (id, tenant_id) VALUES (?, ?)').run(id, req.tenantId);
    config = { id };
  }

  const apiKeyUpdate = api_key && !api_key.startsWith('••••') ? api_key : null;

  await db.prepare(`UPDATE ai_configs SET
    enabled         = COALESCE(?, enabled),
    api_key         = CASE WHEN ? IS NOT NULL THEN ? ELSE api_key END,
    provider        = COALESCE(?, provider),
    model           = COALESCE(?, model),
    system_prompt   = COALESCE(?, system_prompt),
    trigger_mode    = COALESCE(?, trigger_mode),
    trigger_keyword = COALESCE(?, trigger_keyword)
  WHERE tenant_id = ?`).run(
    enabled !== undefined ? (enabled ? 1 : 0) : null,
    apiKeyUpdate, apiKeyUpdate,
    provider || null,
    model || null,
    system_prompt !== undefined ? system_prompt : null,
    trigger_mode || null,
    trigger_keyword || null,
    req.tenantId
  );

  const updated = await db.prepare('SELECT * FROM ai_configs WHERE tenant_id = ?').get(req.tenantId);
  res.json({ ...updated, api_key: updated.api_key ? '••••••••' + updated.api_key.slice(-4) : '' });
});

router.post('/test', auth, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message é obrigatório' });

  const config = await db.prepare('SELECT * FROM ai_configs WHERE tenant_id = ?').get(req.tenantId);
  if (!config?.api_key) return res.status(400).json({ error: 'Configure a API Key primeiro' });

  try {
    const reply = await callAI(config, message);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Status do sistema de IA (sem autenticação — qualquer tenant pode checar)
router.get('/system-status', auth, async (req, res) => {
  const cfg = await db.prepare("SELECT enabled, credits_exhausted FROM system_ai_config WHERE id = 'system'").get();
  res.json({
    ai_enabled: !!(cfg?.enabled),
    credits_exhausted: !!(cfg?.credits_exhausted),
  });
});

module.exports = router;
