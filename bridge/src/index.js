const express = require('express');
const config = require('./config');
const wa = require('./whatsapp');

// Um erro solto do Baileys não pode derrubar o processo — junto com ele cairiam
// todas as sessões conectadas.
process.on('unhandledRejection', (err) => {
  console.error(`[bridge] promessa rejeitada sem tratamento: ${err?.stack || err}`);
});
process.on('uncaughtException', (err) => {
  console.error(`[bridge] exceção não tratada: ${err?.stack || err}`);
});

const app = express();
app.use(express.json({ limit: '2mb' }));

/** Só o ASP.NET pode comandar a bridge. */
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (req.get('X-Bridge-Token') !== config.token) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  next();
});

/** Envolve o handler para que erro do Baileys volte como 502, não como crash. */
function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error(`[api] ${req.method} ${req.path}: ${err.message}`);
      res.status(502).json({ error: err.message });
    }
  };
}

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Sessões ────────────────────────────────────────────────────────────────

app.post('/sessions/:id/connect', handle(async (req, res) => {
  // Com `phone` o pareamento é por código; sem ele, por QR. Idempotente:
  // repetir o mesmo modo devolve o pareamento que já está em curso.
  let phone = null;
  if (req.body?.phone) {
    // O WhatsApp quer só dígitos, com DDI e sem o "+".
    phone = String(req.body.phone).replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) {
      return res.status(400).json({ error: 'Número inválido: use DDI + DDD + número.' });
    }
  }

  res.json(await wa.startSession(req.params.id, { phone }));
}));

app.post('/sessions/:id/disconnect', handle(async (req, res) => {
  await wa.disconnectSession(req.params.id);
  res.json({ ok: true });
}));

app.get('/sessions/:id/status', handle(async (req, res) => {
  res.json(wa.getSessionStatus(req.params.id));
}));

// ── Grupos ─────────────────────────────────────────────────────────────────

app.get('/sessions/:id/groups', handle(async (req, res) => {
  res.json(await wa.getGroups(req.params.id));
}));

app.get('/sessions/:id/groups/:groupId/members', handle(async (req, res) => {
  res.json(await wa.getMembers(req.params.id, req.params.groupId));
}));

app.post('/sessions/:id/groups/:groupId/remove', handle(async (req, res) => {
  await wa.removeMember(req.params.id, req.params.groupId, req.body.jid);
  res.json({ ok: true });
}));

app.post('/sessions/:id/groups/:groupId/role', handle(async (req, res) => {
  const { jid, action } = req.body;
  await wa.updateRole(req.params.id, req.params.groupId, jid, action);
  res.json({ ok: true });
}));

app.post('/sessions/:id/groups/:groupId/delete-message', handle(async (req, res) => {
  const { messageId, participantJid } = req.body;
  await wa.deleteMessage(req.params.id, req.params.groupId, messageId, participantJid);
  res.json({ ok: true });
}));

app.post('/sessions/:id/groups/:groupId/close', handle(async (req, res) => {
  const { reason, durationMinutes } = req.body;
  await wa.closeGroup(req.params.id, req.params.groupId, reason, durationMinutes || 0);
  res.json({ ok: true });
}));

app.post('/sessions/:id/groups/:groupId/open', handle(async (req, res) => {
  await wa.openGroup(req.params.id, req.params.groupId);
  res.json({ ok: true });
}));

// ── Mensagens e mídia ──────────────────────────────────────────────────────

app.post('/sessions/:id/send', handle(async (req, res) => {
  const { chatId, text, mentions } = req.body;
  await wa.sendText(req.params.id, chatId, text, mentions || []);
  res.json({ ok: true });
}));

app.get('/sessions/:id/media/:messageId', handle(async (req, res) => {
  const media = await wa.downloadMedia(req.params.id, req.params.messageId);
  if (!media) return res.status(404).json({ error: 'Mídia indisponível' });

  res.setHeader('Content-Type', media.mimeType);
  res.send(media.buffer);
}));

app.listen(config.port, () => {
  console.log(`[bridge] ouvindo em http://localhost:${config.port}`);
  console.log(`[bridge] eventos vão para ${config.appUrl}`);
  wa.restoreSessions();
});
