const db = require('../database');

async function checkSubscriptionExpirations() {
  try {
    // Busca tenants com plano pago e data de expiração vencida
    // Ignora assinaturas Stripe ativas (Stripe gerencia renovação automaticamente)
    const expired = await db.prepare(`
      SELECT id, plan_id, plan_expires_at, stripe_subscription_status
      FROM tenants
      WHERE plan_id != 'free'
        AND plan_expires_at IS NOT NULL
        AND plan_expires_at < NOW()
        AND (stripe_subscription_status IS NULL
          OR stripe_subscription_status NOT IN ('active', 'trialing'))
    `).all();

    for (const tenant of expired) {
      await db.prepare(`
        UPDATE tenants SET
          plan_id = 'free',
          plan_expires_at = NULL,
          stripe_subscription_status = CASE
            WHEN stripe_subscription_status IS NULL THEN NULL
            ELSE 'canceled'
          END
        WHERE id = ?
      `).run(tenant.id);

      console.log(`[subscription] ⬇️ Tenant ${tenant.id} expirou (${tenant.plan_expires_at}) → downgrade para free`);
    }

    if (expired.length > 0) {
      console.log(`[subscription] ${expired.length} assinatura(s) expirada(s) processada(s)`);
    }
  } catch (err) {
    console.error(`[subscription] erro na verificação: ${err.message}`);
  }
}

function startSubscriptionChecker() {
  // Roda imediatamente ao iniciar e depois a cada hora
  checkSubscriptionExpirations();
  setInterval(checkSubscriptionExpirations, 60 * 60 * 1000);
  console.log('[subscription] verificador de vencimentos ativo (a cada 1h)');
}

module.exports = { startSubscriptionChecker, checkSubscriptionExpirations };
