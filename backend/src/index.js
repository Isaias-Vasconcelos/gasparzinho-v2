require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./database');

const authRoutes        = require('./routes/auth');
const sessionsRoutes    = require('./routes/sessions');
const groupsRoutes      = require('./routes/groups');
const settingsRoutes    = require('./routes/settings');
const paymentsRoutes    = require('./routes/payments');
const superAdminRoutes  = require('./routes/superadmin');
const aiRoutes          = require('./routes/ai');
const { reconnectActiveSessions, disconnectAllSessions } = require('./services/whatsapp');
const { startSubscriptionChecker } = require('./services/subscriptionChecker');
const appEvents = require('./services/events');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));

// Webhook do Stripe precisa do body bruto — registrar ANTES do express.json()
const { stripeWebhookHandler } = require('./routes/payments');
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json({ limit: '10mb' }));

app.use('/api/auth',     authRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/groups',   groupsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/super',    superAdminRoutes);
app.use('/api/ai',       aiRoutes);

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

async function main() {
  await db.init();
  app.listen(PORT, async () => {
    console.log(`API rodando em http://localhost:${PORT}`);
    try { await reconnectActiveSessions(); } catch {}
    startSubscriptionChecker();

    appEvents.on('credits.exhausted', async () => {
      console.log('[ai] 🔴 Créditos esgotados — derrubando todas as sessões WhatsApp...');
      try { await disconnectAllSessions(); } catch (e) { console.error('[ai] erro ao derrubar sessões:', e.message); }
    });
  });
}

main().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err.message);
  process.exit(1);
});
