const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── Palavrões ──────────────────────────────────────────────────────────────

router.get('/profanity', auth, async (req, res) => {
  const words = await db
    .prepare('SELECT * FROM profanity_words WHERE tenant_id = ? ORDER BY word ASC')
    .all(req.tenantId);
  res.json(words);
});

router.post('/profanity', auth, async (req, res) => {
  const { word } = req.body;
  if (!word || word.trim() === '') return res.status(400).json({ error: 'word é obrigatório' });

  const normalized = word.trim().toLowerCase();
  const existing = await db
    .prepare('SELECT id FROM profanity_words WHERE tenant_id = ? AND word = ?')
    .get(req.tenantId, normalized);
  if (existing) return res.status(409).json({ error: 'Palavra já cadastrada' });

  const id = uuidv4();
  await db.prepare('INSERT INTO profanity_words (id, tenant_id, word) VALUES (?, ?, ?)').run(id, req.tenantId, normalized);
  res.status(201).json({ id, word: normalized });
});

router.post('/profanity/bulk', auth, async (req, res) => {
  const { words } = req.body;
  if (!Array.isArray(words)) return res.status(400).json({ error: 'words deve ser um array' });

  try {
    await db.transaction(async (txDb) => {
      for (const w of words) {
        const normalized = w.trim().toLowerCase();
        if (normalized) {
          await txDb.prepare('INSERT IGNORE INTO profanity_words (id, tenant_id, word) VALUES (?, ?, ?)')
            .run(uuidv4(), req.tenantId, normalized);
        }
      }
    });
  } catch {
    return res.status(500).json({ error: 'Erro ao inserir palavras' });
  }

  res.json({ ok: true, count: words.length });
});

router.delete('/profanity/:id', auth, async (req, res) => {
  const result = await db
    .prepare('DELETE FROM profanity_words WHERE id = ? AND tenant_id = ?')
    .run(req.params.id, req.tenantId);
  if (result.changes === 0) return res.status(404).json({ error: 'Palavra não encontrada' });
  res.json({ ok: true });
});

router.delete('/profanity', auth, async (req, res) => {
  await db.prepare('DELETE FROM profanity_words WHERE tenant_id = ?').run(req.tenantId);
  res.json({ ok: true });
});

// ── Comandos personalizados ────────────────────────────────────────────────

router.get('/commands', auth, async (req, res) => {
  const commands = await db
    .prepare('SELECT * FROM custom_commands WHERE tenant_id = ? ORDER BY trigger_word ASC')
    .all(req.tenantId);
  res.json(commands);
});

router.post('/commands', auth, async (req, res) => {
  const { trigger_word, action, description } = req.body;
  if (!trigger_word || !action) {
    return res.status(400).json({ error: 'trigger_word e action são obrigatórios' });
  }

  const validActions = ['remove', 'ban', 'promote', 'demote'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `action deve ser: ${validActions.join(', ')}` });
  }

  const normalized = trigger_word.trim().toLowerCase();
  const existing = await db
    .prepare('SELECT id FROM custom_commands WHERE tenant_id = ? AND trigger_word = ?')
    .get(req.tenantId, normalized);
  if (existing) return res.status(409).json({ error: 'Comando já cadastrado' });

  const id = uuidv4();
  await db.prepare(
    'INSERT INTO custom_commands (id, tenant_id, trigger_word, action, description) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.tenantId, normalized, action, description || null);

  res.status(201).json({ id, trigger_word: normalized, action, description });
});

router.put('/commands/:id', auth, async (req, res) => {
  const { action, description, trigger_word } = req.body;
  const result = await db.prepare(
    `UPDATE custom_commands SET
      action       = COALESCE(?, action),
      description  = COALESCE(?, description),
      trigger_word = COALESCE(?, trigger_word)
    WHERE id = ? AND tenant_id = ?`
  ).run(
    action || null,
    description || null,
    trigger_word?.trim().toLowerCase() || null,
    req.params.id,
    req.tenantId
  );

  if (result.changes === 0) return res.status(404).json({ error: 'Comando não encontrado' });
  const updated = await db.prepare('SELECT * FROM custom_commands WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/commands/:id', auth, async (req, res) => {
  const result = await db
    .prepare('DELETE FROM custom_commands WHERE id = ? AND tenant_id = ?')
    .run(req.params.id, req.tenantId);
  if (result.changes === 0) return res.status(404).json({ error: 'Comando não encontrado' });
  res.json({ ok: true });
});

module.exports = router;
