const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { auth } = require('../middleware/auth');

const router = express.Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY não configurada');
  return require('stripe')(key);
}

// ── Webhook (registrado com raw body em index.js) ─────────────────────────────

async function stripeWebhookHandler(req, res) {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(500).send('STRIPE_WEBHOOK_SECRET não configurado');

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error(`[stripe] webhook sig inválida: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    console.error(`[stripe] erro ao processar evento ${event.type}: ${err.message}`);
  }

  res.json({ received: true });
}

async function handleStripeEvent(event) {
  const stripe = getStripe();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const tenantId = session.metadata?.tenant_id || session.client_reference_id;
    if (!tenantId) return;

    const customerId = session.customer;
    const subscriptionId = session.subscription;

    // Descobre o plano a partir do subscription (normaliza para minúsculo)
    let planSlug = session.metadata?.plan_slug;
    if (!planSlug && subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] });
      const price = sub.items.data[0]?.price;
      planSlug = price?.lookup_key || price?.metadata?.plan_slug;
    }
    if (planSlug) planSlug = planSlug.toLowerCase();

    if (!planSlug) return;

    const plan = await db.prepare('SELECT * FROM plans WHERE slug = ?').get(planSlug);
    if (!plan) return;

    // Calcula expiração (30 dias a partir de agora)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ');

    await db.prepare(`UPDATE tenants SET
      plan_id = ?,
      plan_expires_at = ?,
      stripe_customer_id = ?,
      stripe_subscription_id = ?,
      stripe_subscription_status = 'active'
    WHERE id = ?`).run(planSlug, expiresAt, customerId, subscriptionId, tenantId);

    console.log(`[stripe] ✅ checkout.session.completed → tenant ${tenantId} → plano ${planSlug}`);
  }

  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object;
    const tenant = await db.prepare('SELECT id FROM tenants WHERE stripe_subscription_id = ?').get(sub.id);
    if (!tenant) return;

    await db.prepare(`UPDATE tenants SET stripe_subscription_status = ? WHERE id = ?`)
      .run(sub.status, tenant.id);

    if (sub.status === 'active') {
      // Atualiza expiração baseado no período atual
      const expiresAt = new Date(sub.current_period_end * 1000)
        .toISOString().slice(0, 19).replace('T', ' ');
      await db.prepare('UPDATE tenants SET plan_expires_at = ? WHERE id = ?').run(expiresAt, tenant.id);
    }
    console.log(`[stripe] subscription.updated → tenant ${tenant.id} → status ${sub.status}`);
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const tenant = await db.prepare('SELECT id FROM tenants WHERE stripe_subscription_id = ?').get(sub.id);
    if (!tenant) return;

    await db.prepare(`UPDATE tenants SET
      plan_id = 'free',
      plan_expires_at = NULL,
      stripe_subscription_status = 'canceled'
    WHERE id = ?`).run(tenant.id);

    console.log(`[stripe] subscription.deleted → tenant ${tenant.id} → downgrade para free`);
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    const tenant = await db.prepare('SELECT id FROM tenants WHERE stripe_customer_id = ?').get(invoice.customer);
    if (!tenant) return;

    await db.prepare('UPDATE tenants SET stripe_subscription_status = ? WHERE id = ?')
      .run('past_due', tenant.id);

    console.log(`[stripe] invoice.payment_failed → tenant ${tenant.id}`);
  }
}

// ── Criar sessão de checkout Stripe ──────────────────────────────────────────

router.post('/create-checkout-session', auth, async (req, res) => {
  const { plan_slug } = req.body;
  if (!plan_slug) return res.status(400).json({ error: 'plan_slug é obrigatório' });

  const plan = await db.prepare('SELECT * FROM plans WHERE slug = ? AND is_active = 1').get(plan_slug);
  if (!plan) return res.status(404).json({ error: 'Plano não encontrado' });
  if (plan.price_cents === 0) return res.status(400).json({ error: 'Plano gratuito não requer pagamento' });

  const stripe = getStripe();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  // Busca o preço ativo do produto configurado no .env
  const productId = {
    starter: process.env.STRIPE_PRODUCT_STARTER,
    pro:     process.env.STRIPE_PRODUCT_PRO,
  }[plan_slug];

  if (!productId || productId.startsWith('prod_SUBSTITUA')) {
    return res.status(500).json({
      error: `STRIPE_PRODUCT_${plan_slug.toUpperCase()} não configurado no .env.`,
    });
  }

  let priceId;
  try {
    const prices = await stripe.prices.list({ product: productId, active: true, limit: 1 });
    priceId = prices.data[0]?.id;
  } catch (err) {
    return res.status(500).json({ error: `Erro ao buscar preço do produto: ${err.message}` });
  }

  if (!priceId) {
    return res.status(404).json({
      error: `Nenhum preço ativo encontrado para o produto ${productId} no Stripe.`,
    });
  }

  // Verifica se o tenant já tem um customer_id no Stripe
  const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenantId);

  const sessionParams = {
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${frontendUrl}/checkout?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl}/checkout?canceled=true`,
    client_reference_id: req.tenantId,
    metadata: { tenant_id: req.tenantId, plan_slug },
    subscription_data: { metadata: { tenant_id: req.tenantId, plan_slug } },
  };

  if (tenant?.stripe_customer_id) {
    sessionParams.customer = tenant.stripe_customer_id;
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: `Erro ao criar sessão: ${err.message}` });
  }
});

// ── Verificar pagamento após redirect do Stripe ──────────────────────────────

router.post('/verify-payment', auth, async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id é obrigatório' });

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Pagamento ainda não confirmado' });
    }

    const tenantId = session.metadata?.tenant_id || session.client_reference_id;
    if (tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Sessão não pertence a este tenant' });
    }

    await handleStripeEvent({ type: 'checkout.session.completed', data: { object: session } });

    const tenant = await db.prepare('SELECT plan_id, plan_expires_at, stripe_subscription_status FROM tenants WHERE id = ?').get(req.tenantId);
    const plan = await db.prepare('SELECT * FROM plans WHERE slug = ?').get(tenant.plan_id);

    res.json({ ok: true, plan: { ...plan, features: JSON.parse(plan.features || '[]') } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Portal de gerenciamento (cancelar/trocar plano) ───────────────────────────

router.post('/create-portal-session', auth, async (req, res) => {
  const tenant = await db.prepare('SELECT stripe_customer_id FROM tenants WHERE id = ?').get(req.tenantId);
  if (!tenant?.stripe_customer_id) {
    return res.status(400).json({ error: 'Nenhuma assinatura ativa encontrada' });
  }

  const stripe = getStripe();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${frontendUrl}/app/dashboard`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Endpoints existentes ──────────────────────────────────────────────────────

router.get('/info', async (req, res) => {
  const plans = (await db.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY price_cents ASC').all())
    .map((p) => ({ ...p, features: JSON.parse(p.features || '[]') }));
  res.json({ plans });
});

router.get('/my', auth, async (req, res) => {
  const rows = await db.prepare(
    'SELECT pr.*, p.name as plan_name FROM payment_requests pr LEFT JOIN plans p ON p.slug = pr.plan_slug WHERE pr.tenant_id = ? ORDER BY pr.created_at DESC'
  ).all(req.tenantId);
  res.json(rows);
});

router.get('/current-plan', auth, async (req, res) => {
  const tenant = await db.prepare('SELECT plan_id, plan_expires_at, stripe_subscription_status FROM tenants WHERE id = ?').get(req.tenantId);
  const plan = await db.prepare('SELECT * FROM plans WHERE slug = ?').get(tenant.plan_id);
  const row = await db.prepare('SELECT COUNT(*) as c FROM sessions WHERE tenant_id = ?').get(req.tenantId);

  let daysRemaining = null;
  let isExpired = false;
  let expiresSoon = false;

  if (tenant.plan_expires_at) {
    const now = Date.now();
    const exp = new Date(tenant.plan_expires_at).getTime();
    daysRemaining = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    isExpired = daysRemaining <= 0;
    expiresSoon = !isExpired && daysRemaining <= 7;
  }

  res.json({
    plan: { ...plan, features: JSON.parse(plan.features || '[]') },
    expires_at: tenant.plan_expires_at,
    days_remaining: daysRemaining,
    is_expired: isExpired,
    expires_soon: expiresSoon,
    subscription_status: tenant.stripe_subscription_status,
    session_count: row.c,
    can_add_session: plan.max_sessions === -1 || row.c < plan.max_sessions,
  });
});

module.exports = router;
module.exports.stripeWebhookHandler = stripeWebhookHandler;
