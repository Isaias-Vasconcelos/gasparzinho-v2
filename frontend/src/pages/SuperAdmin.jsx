import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { superAdminApi } from '../services/api';

// ── Ícones SVG ────────────────────────────────────────────────────────────────
function IconDashboard() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function IconEarnings() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconTenants() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function IconPlans() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}

function IconAI() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ── Badge helpers ─────────────────────────────────────────────────────────────
const bBase = 'inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium border';
const PLAN_BADGE = {
  free:    `${bBase} bg-white/10 text-gray-300 border-white/10`,
  starter: `${bBase} bg-blue-900/30 text-blue-300 border-blue-600/30`,
  pro:     `${bBase} bg-[#25D366]/15 text-[#25D366] border-[#25D366]/30`,
};
const planBadge = (slug) => PLAN_BADGE[slug] ?? PLAN_BADGE.free;

const SUB_BADGE = {
  active:   `${bBase} bg-green-900/30 text-green-400 border-green-600/30`,
  past_due: `${bBase} bg-yellow-900/30 text-yellow-300 border-yellow-600/30`,
  canceled: `${bBase} bg-red-900/30 text-red-400 border-red-600/30`,
};
const subBadge = (s) => SUB_BADGE[s] ?? `${bBase} bg-white/10 text-gray-300 border-white/10`;

const CHARGE_BADGE = {
  succeeded: `${bBase} bg-green-900/30 text-green-400 border-green-600/30`,
  pending:   `${bBase} bg-yellow-900/30 text-yellow-300 border-yellow-600/30`,
  failed:    `${bBase} bg-red-900/30 text-red-400 border-red-600/30`,
};
const chargeBadge = (s) => CHARGE_BADGE[s] ?? `${bBase} bg-white/10 text-gray-300 border-white/10`;

// ── Input style ───────────────────────────────────────────────────────────────
const iBase = 'bg-[#0d1a13] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#25D366]/50 transition-colors placeholder-gray-600';
const iFull = `${iBase} w-full`;

// ── Currency formatter ────────────────────────────────────────────────────────
const fmtBRL = (cents) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

const fmtAmount = (amount, currency) => {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100);
  } catch {
    return `${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`;
  }
};

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Painel',        Icon: IconDashboard },
  { id: 'earnings',  label: 'Ganhos',         Icon: IconEarnings  },
  { id: 'tenants',   label: 'Organizações',  Icon: IconTenants   },
  { id: 'users',     label: 'Usuários',      Icon: IconUsers     },
  { id: 'plans',     label: 'Planos',        Icon: IconPlans     },
  { id: 'ai',        label: 'IA do Sistema', Icon: IconAI        },
];

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, accentClass = 'bg-[#25D366]' }) {
  return (
    <div className="relative bg-[#132018] border border-white/10 rounded-xl p-5 flex items-center gap-4 overflow-hidden">
      <div className={`absolute inset-y-0 left-0 w-1 ${accentClass}`} />
      <div className="text-3xl pl-2 select-none">{icon}</div>
      <div>
        <div className="text-2xl font-extrabold text-white tabular-nums">{value ?? '—'}</div>
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
        <div className="text-sm text-gray-400 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── DashboardTab ──────────────────────────────────────────────────────────────
function DashboardTab({ stats }) {
  if (!stats) return <Spinner />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-bold text-xl">Visão geral</h2>
        <p className="text-gray-500 text-sm mt-0.5">Resumo do sistema em tempo real</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard icon="🏢" label="Organizações"         value={stats.totalTenants} />
        <StatCard icon="📱" label="Sessões ativas"        value={stats.totalSessions} />
        <StatCard icon="👥" label="Usuários"              value={stats.totalUsers} />
        <StatCard
          icon="✅"
          label="Assinaturas ativas"
          value={stats.activeSubscriptions}
          accentClass="bg-blue-500"
        />
        <StatCard icon="⛔" label="Total de bans" value={stats.totalBans} accentClass="bg-red-500" />
      </div>

      {stats.byPlan && (
        <div className="bg-[#132018] border border-white/10 rounded-xl px-5 py-4 flex items-center gap-6 flex-wrap">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide shrink-0">
            Distribuição por plano
          </span>
          <div className="flex gap-4 flex-wrap">
            {stats.byPlan.map((p) => (
              <div key={p.slug} className="flex items-center gap-2">
                <span className={planBadge(p.slug)}>{p.name}</span>
                <span className="text-white font-bold tabular-nums">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── EarningsTab ───────────────────────────────────────────────────────────────
function EarningsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    superAdminApi.getEarnings()
      .then(({ data: d }) => setData(d))
      .catch(() => toast.error('Erro ao carregar ganhos'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (loading) return <Spinner />;
  if (!data) return null;

  const mrrCents = data.mrrCents || 0;
  const arrCents = mrrCents * 12;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-xl">Ganhos</h2>
          <p className="text-gray-500 text-sm mt-0.5">Receita recorrente via Stripe</p>
        </div>
        <button onClick={load} className="bg-white/10 hover:bg-white/15 text-gray-200 text-sm px-4 py-2 rounded-lg transition-colors">
          ↻ Atualizar
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon="💰" label="MRR atual"           value={fmtBRL(mrrCents)}  accentClass="bg-[#25D366]" />
        <StatCard icon="📈" label="ARR projetado"        value={fmtBRL(arrCents)}  accentClass="bg-teal-500" />
        <StatCard icon="✅" label="Assinaturas ativas"   value={data.activeCount}  accentClass="bg-blue-500" />
        <StatCard
          icon="⚠️"
          label="Em atraso"
          value={data.pastDueCount}
          accentClass={data.pastDueCount > 0 ? 'bg-yellow-400' : 'bg-[#25D366]'}
        />
      </div>

      {/* Revenue breakdown by plan */}
      {data.byPlan?.length > 0 && (
        <div className="bg-[#132018] border border-white/10 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-semibold">Receita por plano</h3>
          <div className="space-y-4">
            {data.byPlan.map((p) => {
              const pct = mrrCents > 0 ? Math.round((p.revenue_cents / mrrCents) * 100) : 0;
              return (
                <div key={p.slug}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={planBadge(p.slug)}>{p.name}</span>
                      <span className="text-gray-500 text-xs tabular-nums">{p.count} assinatura{p.count !== 1 ? 's' : ''} × {fmtBRL(p.price_cents)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold tabular-nums">{fmtBRL(p.revenue_cents)}</span>
                      <span className="text-gray-600 text-xs tabular-nums w-8 text-right">{pct}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#25D366] rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stripe balance */}
      {data.stripeAvailable && data.balance && (
        <div className="bg-[#132018] border border-white/10 rounded-xl p-5 space-y-3">
          <h3 className="text-white font-semibold">Saldo Stripe</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0d1a13] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Disponível</p>
              {data.balance.available.length > 0
                ? data.balance.available.map((b) => (
                    <p key={b.currency} className="text-[#25D366] font-extrabold text-2xl tabular-nums">
                      {fmtAmount(b.amount, b.currency)}
                    </p>
                  ))
                : <p className="text-gray-600 text-sm">R$ 0,00</p>}
            </div>
            <div className="bg-[#0d1a13] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Pendente</p>
              {data.balance.pending.length > 0
                ? data.balance.pending.map((b) => (
                    <p key={b.currency} className="text-yellow-300 font-extrabold text-2xl tabular-nums">
                      {fmtAmount(b.amount, b.currency)}
                    </p>
                  ))
                : <p className="text-gray-600 text-sm">R$ 0,00</p>}
            </div>
          </div>
        </div>
      )}

      {/* Recent charges from Stripe */}
      {data.stripeAvailable && data.recentCharges?.length > 0 && (
        <div className="bg-[#132018] border border-white/10 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-semibold">Cobranças recentes</h3>
          <div className="overflow-auto rounded-xl border border-white/5">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#0d1a13] text-gray-400 text-xs uppercase tracking-wide">
                <tr>
                  {['Cliente', 'Valor', 'Status', 'Data'].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.recentCharges.map((c, i) => (
                  <tr key={c.id} className={`transition-colors hover:bg-white/[0.03] ${i % 2 !== 0 ? 'bg-white/[0.015]' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="text-white text-sm font-medium">{c.customer_name || c.receipt_email || '—'}</p>
                      {c.customer_name && c.receipt_email && (
                        <p className="text-gray-500 text-xs">{c.receipt_email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white font-semibold tabular-nums">
                      {fmtAmount(c.amount, c.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={chargeBadge(c.status)}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(c.created * 1000).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent subscribers from DB */}
      {data.recentSubscribers?.length > 0 && (
        <div className="bg-[#132018] border border-white/10 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-semibold">Assinantes recentes</h3>
          <div className="overflow-auto rounded-xl border border-white/5">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#0d1a13] text-gray-400 text-xs uppercase tracking-wide">
                <tr>
                  {['Organização', 'Plano', 'Status', 'Mensalidade', 'Assinado em'].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.recentSubscribers.map((s, i) => (
                  <tr key={`${s.name}-${i}`} className={`transition-colors hover:bg-white/[0.03] ${i % 2 !== 0 ? 'bg-white/[0.015]' : ''}`}>
                    <td className="px-4 py-3 text-white font-medium">{s.name}</td>
                    <td className="px-4 py-3"><span className={planBadge(s.plan_id)}>{s.plan_name}</span></td>
                    <td className="px-4 py-3"><span className={subBadge(s.stripe_subscription_status)}>{s.stripe_subscription_status}</span></td>
                    <td className="px-4 py-3 text-[#25D366] font-semibold tabular-nums text-sm">{fmtBRL(s.price_cents)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(s.created_at).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!data.stripeAvailable && data.activeCount === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-[#132018] rounded-xl border border-white/10">
          <div className="text-5xl mb-4 opacity-40">💰</div>
          <p className="text-gray-500">Nenhuma assinatura ativa</p>
          <p className="text-gray-600 text-sm mt-1">Configure <code className="text-gray-400">STRIPE_SECRET_KEY</code> para ver cobranças em tempo real</p>
        </div>
      )}
    </div>
  );
}

// ── TenantsTab ────────────────────────────────────────────────────────────────
function TenantsTab({ plans }) {
  const [tenants, setTenants] = useState([]);
  const [search, setSearch] = useState('');
  const [editPlan, setEditPlan] = useState(null);

  const load = () => superAdminApi.getTenants().then(({ data }) => setTenants(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const handleChangePlan = async (tenantId, plan_slug) => {
    try {
      await superAdminApi.updateTenantPlan(tenantId, { plan_slug });
      toast.success('Plano atualizado!');
      setEditPlan(null);
      load();
    } catch { toast.error('Erro ao alterar plano'); }
  };

  const handleDelete = async (tenant) => {
    if (!confirm(`Deletar PERMANENTEMENTE a organização "${tenant.name}" e todos os seus dados?`)) return;
    try {
      await superAdminApi.deleteTenant(tenant.id);
      toast.success('Tenant removido');
      load();
    } catch { toast.error('Erro ao remover'); }
  };

  const filtered = tenants.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-white font-bold text-xl">Organizações</h2>
        <p className="text-gray-500 text-sm mt-0.5">Gerencie tenants e planos</p>
      </div>
      <div className="flex gap-3">
        <input className={`${iFull} flex-1`} placeholder="Buscar por nome da organização..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button onClick={load} className="bg-white/10 hover:bg-white/15 text-gray-200 text-sm px-4 py-2 rounded-lg transition-colors whitespace-nowrap">↻ Atualizar</button>
      </div>
      <div className="text-xs text-gray-500">{filtered.length} organização(ões)</div>

      <div className="overflow-auto rounded-xl border border-white/10">
        <table className="w-full text-sm text-left">
          <thead className="bg-[#0d1a13] text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              {['Organização', 'Plano', 'Assinatura', 'Sessões', 'Usuários', 'Criado em', 'Ações'].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((t, i) => (
              <tr key={t.id} className={`transition-colors hover:bg-white/[0.03] ${i % 2 !== 0 ? 'bg-white/[0.015]' : ''}`}>
                <td className="px-4 py-3 text-white font-medium">{t.name}</td>
                <td className="px-4 py-3">
                  {editPlan?.tenantId === t.id ? (
                    <div className="flex gap-1 items-center">
                      <select defaultValue={t.plan_id} className={`${iBase} py-1 text-xs`} onChange={(e) => handleChangePlan(t.id, e.target.value)}>
                        {plans.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                      </select>
                      <button onClick={() => setEditPlan(null)} className="text-gray-400 hover:text-white text-xs ml-1">✕</button>
                    </div>
                  ) : (
                    <div>
                      <button onClick={() => setEditPlan({ tenantId: t.id })} className={`${planBadge(t.plan_id)} cursor-pointer hover:opacity-75`}>
                        {t.plan_name || t.plan_id}
                      </button>
                      {t.plan_expires_at && (
                        <p className="text-xs text-gray-500 mt-0.5">Expira: {new Date(t.plan_expires_at).toLocaleDateString('pt-BR')}</p>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {t.stripe_subscription_status
                    ? <span className={subBadge(t.stripe_subscription_status)}>{t.stripe_subscription_status}</span>
                    : <span className="text-gray-600 text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-300">
                  <span className="text-[#25D366] font-bold">{t.active_sessions}</span>
                  <span className="text-gray-600">/{t.session_count}</span>
                </td>
                <td className="px-4 py-3 text-gray-300">{t.user_count}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(t)} className="text-red-400 hover:text-red-300 text-xs font-medium transition-colors">Excluir</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-gray-600 py-12">Nenhuma organização encontrada</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── UsersTab ──────────────────────────────────────────────────────────────────
function UsersTab({ plans }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [editPlan, setEditPlan] = useState(null);

  const load = () => superAdminApi.getAllUsers().then(({ data }) => setUsers(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const handleChangePlan = async (tenantId, plan_slug) => {
    try {
      await superAdminApi.updateTenantPlan(tenantId, { plan_slug });
      toast.success('Plano atualizado!');
      setEditPlan(null);
      load();
    } catch { toast.error('Erro ao alterar plano'); }
  };

  const handleDelete = async (user) => {
    if (!confirm(`Deletar o usuário "${user.username}" (${user.email})?`)) return;
    try {
      await superAdminApi.deleteUser(user.id);
      toast.success('Usuário removido');
      load();
    } catch { toast.error('Erro ao remover usuário'); }
  };

  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.tenant_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-white font-bold text-xl">Usuários</h2>
        <p className="text-gray-500 text-sm mt-0.5">Todos os usuários cadastrados no sistema</p>
      </div>
      <div className="flex gap-3">
        <input className={`${iFull} flex-1`} placeholder="Buscar por nome, e-mail ou organização..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button onClick={load} className="bg-white/10 hover:bg-white/15 text-gray-200 text-sm px-4 py-2 rounded-lg transition-colors whitespace-nowrap">↻ Atualizar</button>
      </div>
      <div className="text-xs text-gray-500">{filtered.length} usuário(s)</div>

      <div className="overflow-auto rounded-xl border border-white/10">
        <table className="w-full text-sm text-left">
          <thead className="bg-[#0d1a13] text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              {['Usuário', 'E-mail', 'Organização', 'Plano', 'Papel', 'Criado em', 'Ações'].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((u, i) => (
              <tr key={u.id} className={`transition-colors hover:bg-white/[0.03] ${i % 2 !== 0 ? 'bg-white/[0.015]' : ''}`}>
                <td className="px-4 py-3 text-white font-medium">{u.username}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{u.email || '—'}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{u.tenant_name || '—'}</td>
                <td className="px-4 py-3">
                  {editPlan === u.id ? (
                    <div className="flex gap-1 items-center">
                      <select defaultValue={u.plan_id} className={`${iBase} py-1 text-xs`} onChange={(e) => handleChangePlan(u.tenant_id, e.target.value)}>
                        {plans.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                      </select>
                      <button onClick={() => setEditPlan(null)} className="text-gray-400 hover:text-white text-xs ml-1">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setEditPlan(u.id)} className={`${planBadge(u.plan_id)} cursor-pointer hover:opacity-75`}>
                      {u.plan_name || u.plan_id || '—'}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs capitalize">{u.role}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(u)} className="text-red-400 hover:text-red-300 text-xs font-medium transition-colors">Excluir</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-gray-600 py-12">Nenhum usuário encontrado</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── PlansTab ──────────────────────────────────────────────────────────────────
function PlansTab() {
  const [plans, setPlans] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});

  const load = () => superAdminApi.getPlans().then(({ data }) => setPlans(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const startEdit = (p) => {
    setEditing(p.slug);
    setEditForm({
      name: p.name,
      max_sessions: p.max_sessions,
      price_cents: p.price_cents,
      features: JSON.parse(p.features || '[]').join('\n'),
    });
  };

  const saveEdit = async () => {
    try {
      await superAdminApi.updatePlan(editing, {
        ...editForm,
        features: editForm.features.split('\n').map((l) => l.trim()).filter(Boolean),
      });
      toast.success('Plano atualizado');
      setEditing(null);
      load();
    } catch { toast.error('Erro ao salvar'); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-white font-bold text-xl">Planos</h2>
        <p className="text-gray-500 text-sm mt-0.5">Configure preços e funcionalidades de cada plano</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((p) => (
          <div key={p.slug} className="bg-[#132018] border border-white/10 rounded-xl p-5 space-y-4">
            {editing === p.slug ? (
              <div className="space-y-3">
                <input className={iFull} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Máx sessões (-1 = ∞)</label>
                    <input type="number" className={iFull} value={editForm.max_sessions} onChange={(e) => setEditForm({ ...editForm, max_sessions: +e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Preço (centavos)</label>
                    <input type="number" className={iFull} value={editForm.price_cents} onChange={(e) => setEditForm({ ...editForm, price_cents: +e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Funcionalidades (uma por linha)</label>
                  <textarea className={`${iFull} min-h-28`} value={editForm.features} onChange={(e) => setEditForm({ ...editForm, features: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(null)} className="flex-1 bg-white/10 hover:bg-white/15 text-gray-200 text-xs py-2 rounded-lg transition-colors">Cancelar</button>
                  <button onClick={saveEdit} className="flex-1 bg-[#25D366] hover:bg-[#1ebe57] text-white text-xs py-2 rounded-lg font-medium transition-colors">Salvar</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-bold text-lg">{p.name}</h3>
                  <span className={planBadge(p.slug)}>{p.slug}</span>
                </div>
                <div>
                  <span className="text-3xl font-extrabold text-[#25D366]">
                    {p.price_cents === 0 ? 'Grátis' : fmtBRL(p.price_cents)}
                  </span>
                  {p.price_cents > 0 && <span className="text-gray-500 text-sm ml-1">/mês</span>}
                </div>
                <p className="text-sm text-gray-400">
                  {p.max_sessions === -1 ? '∞ sessões · ∞ grupos' : `${p.max_sessions} ${p.max_sessions === 1 ? 'sessão' : 'sessões'}`}
                </p>
                <ul className="space-y-1.5">
                  {JSON.parse(p.features || '[]').map((f) => (
                    <li key={f} className="text-xs text-gray-400 flex items-start gap-1.5">
                      <span className="text-[#25D366] mt-0.5 shrink-0">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button onClick={() => startEdit(p)} className="w-full bg-white/10 hover:bg-white/15 text-gray-200 text-xs py-2 rounded-lg transition-colors">Editar plano</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SystemAITab ───────────────────────────────────────────────────────────────
const PROVIDER_MODELS = {
  claude:   ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7'],
  openai:   ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
  gemini:   ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'],
  grok:     ['grok-beta', 'grok-2'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
};

const DEFAULT_NSFW_PROMPT =
  'Você é um sistema especializado de moderação visual para grupos do WhatsApp. ' +
  'Analise a imagem com rigor e responda SIM se ela contiver QUALQUER um dos itens abaixo: ' +
  '• Nudez parcial ou total, conteúdo pornográfico, atos sexuais explícitos ou implícitos, genitália, seios expostos; ' +
  '• Conteúdo sexual envolvendo menores de idade (CSAM) — tolerância zero, sempre SIM; ' +
  '• Violência extrema, mutilação, gore, decapitação, corpos, sangue em excesso, tortura; ' +
  '• Automutilação, métodos de suicídio, ferimentos autoinfligidos; ' +
  '• Drogas ilegais sendo consumidas ou exibidas (cocaína, crack, maconha em uso, seringas, etc.); ' +
  '• Armas ilegais ou armas sendo empunhadas de forma ameaçadora; ' +
  '• Símbolos de ódio, nazismo, racismo explícito, terrorismo; ' +
  '• Capturas de tela de sites pornográficos, conversas com conteúdo sexual, ou qualquer imagem claramente enviada para contornar moderação. ' +
  'Responda NÃO apenas se a imagem for totalmente inofensiva e adequada para todos os públicos. ' +
  'Em caso de dúvida, responda SIM. ' +
  'Responda APENAS com uma única palavra: SIM ou NÃO. Nenhum outro texto.';

const DEFAULT_PROFANITY_PROMPT =
  'Você é um filtro de moderação de conteúdo especializado para grupos do WhatsApp. ' +
  'Identifique se a mensagem contém palavrões, xingamentos, ofensas ou conteúdo inapropriado de qualquer país ou idioma, ' +
  'com foco especial no português do Brasil, incluindo: ' +
  'palavrões por extenso (ex: porra, merda, caralho, puta, foda, viado, buceta, cu, desgraça, arrombado, filha da puta); ' +
  'abreviações e siglas brasileiras (ex: pqp, fds, fdp, vtf, vsf, krl, kct, vtn, tnc, qp, pnc, pqp, sfdd, mds, oxe); ' +
  'variações ortográficas intencionais e leet speak (ex: p0rr@, c4ralho, m3rda, fud4, @rrombado); ' +
  'xingamentos, insultos, conteúdo racista, homofóbico, xenofóbico, misógino ou discriminatório em qualquer idioma; ' +
  'palavrões em inglês (ex: fuck, shit, ass, bitch, damn, cunt), espanhol (ex: mierda, coño, puta), e outros idiomas comuns. ' +
  'Responda APENAS com uma única palavra: "SIM" se contiver conteúdo inapropriado, ou "NÃO" se a mensagem for normal. ' +
  'Não adicione explicações, pontuação extra ou qualquer outro texto além de SIM ou NÃO.';

function SystemAITab() {
  const [form, setForm] = useState({
    provider: 'openai', model: 'gpt-4o-mini', api_key: '', enabled: false,
    profanity_prompt: DEFAULT_PROFANITY_PROMPT, nsfw_prompt: DEFAULT_NSFW_PROMPT,
  });
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    superAdminApi.getSystemAiConfig()
      .then(({ data }) => setForm({ ...data, enabled: !!data.enabled, credits_exhausted: !!data.credits_exhausted }))
      .catch(() => {});
  }, []);

  const models = PROVIDER_MODELS[form.provider] || [];
  const handleProviderChange = (provider) => {
    const defaultModel = (PROVIDER_MODELS[provider] || [])[0] || '';
    setForm((f) => ({ ...f, provider, model: defaultModel }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await superAdminApi.updateSystemAiConfig(form);
      toast.success('Configuração de IA salva!');
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-white font-bold text-xl">IA do Sistema</h2>
        <p className="text-gray-500 text-sm mt-0.5">Configure a IA global de moderação de conteúdo</p>
      </div>
      <div className="max-w-xl space-y-4">
        {form.credits_exhausted && (
          <div className="bg-red-900/30 border border-red-600/30 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-red-300 font-bold">Créditos esgotados</p>
              <p className="text-red-400 text-sm mt-1">
                Recarregue os créditos no painel do provedor ({form.provider}) e salve uma nova API key para reativar.
              </p>
            </div>
          </div>
        )}

        <div className="bg-[#132018] border border-white/10 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium text-sm">Ativar detecção por IA</p>
              <p className="text-gray-500 text-xs mt-0.5">Complementa a lista de palavras proibidas</p>
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${form.enabled ? 'bg-[#25D366]' : 'bg-white/20'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${form.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <div>
            <label className="text-gray-300 text-sm font-medium block mb-1">Provedor</label>
            <select className={iFull} value={form.provider} onChange={(e) => handleProviderChange(e.target.value)}>
              {Object.keys(PROVIDER_MODELS).map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-gray-300 text-sm font-medium block mb-1">Modelo</label>
            <select className={iFull} value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="text-gray-300 text-sm font-medium block mb-1">Secret Key (API Key)</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                className={`${iFull} pr-20`}
                placeholder="sk-••••••••••••••••"
                value={form.api_key}
                onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
              />
              <button type="button" onClick={() => setShowKey((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-white transition-colors">
                {showKey ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">A chave é salva de forma segura. Deixe em branco para não alterar.</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-gray-300 text-sm font-medium">Prompt — Palavrões</label>
              <button type="button" onClick={() => setForm((f) => ({ ...f, profanity_prompt: DEFAULT_PROFANITY_PROMPT }))} className="text-xs text-gray-600 hover:text-[#25D366] transition-colors">↺ Restaurar padrão</button>
            </div>
            <textarea className={`${iFull} text-sm leading-relaxed`} style={{ minHeight: '130px', resize: 'vertical' }} value={form.profanity_prompt || ''} onChange={(e) => setForm((f) => ({ ...f, profanity_prompt: e.target.value }))} />
            <p className="text-xs text-gray-600 mt-1">O modelo deve responder <code className="text-[#25D366]">SIM</code> ou <code className="text-[#25D366]">NÃO</code>.</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-gray-300 text-sm font-medium">Prompt — Mídia inapropriada (NSFW)</label>
              <button type="button" onClick={() => setForm((f) => ({ ...f, nsfw_prompt: DEFAULT_NSFW_PROMPT }))} className="text-xs text-gray-600 hover:text-[#25D366] transition-colors">↺ Restaurar padrão</button>
            </div>
            <textarea className={`${iFull} text-sm leading-relaxed`} style={{ minHeight: '130px', resize: 'vertical' }} value={form.nsfw_prompt || ''} onChange={(e) => setForm((f) => ({ ...f, nsfw_prompt: e.target.value }))} />
            <p className="text-xs text-gray-600 mt-1">Use modelos com visão (GPT-4o, Claude 3, Gemini).</p>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-700/20 rounded-lg p-3 text-xs text-yellow-400">
            ⚠️ Cada mensagem verificada consome tokens. Prefira modelos econômicos como <code>gpt-4o-mini</code> ou <code>claude-haiku</code>.
          </div>

          <button onClick={save} disabled={saving} className="w-full bg-[#25D366] hover:bg-[#1ebe57] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors">
            {saving ? 'Salvando...' : '✓ Salvar configuração'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main SuperAdmin ───────────────────────────────────────────────────────────
export default function SuperAdmin() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [plans, setPlans] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sa-sidebar-collapsed') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    superAdminApi.stats().then(({ data }) => setStats(data)).catch(() => {});
    superAdminApi.getPlans().then(({ data }) => setPlans(data)).catch(() => {});
  }, []);

  const logout = () => {
    if (!confirm('Deseja sair do painel de administração?')) return;
    localStorage.removeItem('super_token');
    navigate('/super/login');
  };

  const toggleCollapse = () => {
    setCollapsed((v) => {
      try { localStorage.setItem('sa-sidebar-collapsed', String(!v)); } catch {}
      return !v;
    });
  };

  const selectTab = (id) => { setTab(id); setMenuOpen(false); };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#0d1a13]">
      {/* Header */}
      <header className="bg-[#0a1410] border-b border-white/5 text-white z-20 relative flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Menu"
            >
              {menuOpen ? <IconClose /> : <IconMenu />}
            </button>
            <div className="flex items-center gap-2 select-none">
              <img src="/icon.svg" className="w-7 h-7" alt="Gasparzinho" />
              <span className={`font-bold text-white transition-all duration-200 ${collapsed ? 'md:hidden' : ''}`}>
                Gasparzinho
              </span>
              <span className="text-xs bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30 px-2 py-0.5 rounded font-medium hidden sm:inline">
                Super Admin
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-400 bg-white/5 hover:bg-red-900/20 border border-white/10 hover:border-red-600/30 px-3 py-1.5 rounded-lg transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sair
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        {/* Backdrop mobile */}
        <div
          className={`fixed inset-0 bg-black/60 z-30 md:hidden transition-opacity duration-200 ${menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setMenuOpen(false)}
        />

        {/* Sidebar */}
        <aside className={`
          absolute md:relative inset-y-0 left-0 z-40 md:z-auto
          flex flex-col flex-shrink-0
          bg-[#0a1410] border-r border-white/5
          transform transition-all duration-250 ease-in-out
          ${menuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
          w-56 ${collapsed ? 'md:w-14' : 'md:w-56'}
        `}>
          <nav className="p-2 space-y-0.5 flex-1 overflow-y-auto overflow-x-hidden pt-3">
            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => selectTab(id)}
                title={collapsed ? label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 overflow-hidden
                  ${collapsed ? 'md:justify-center md:px-2.5' : ''}
                  ${tab === id
                    ? 'bg-[#25D366]/10 text-[#25D366] ring-1 ring-[#25D366]/20'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
              >
                <Icon />
                <span className={`whitespace-nowrap transition-all duration-200 ${collapsed ? 'md:hidden' : ''}`}>
                  {label}
                </span>
              </button>
            ))}
          </nav>

          <button
            onClick={toggleCollapse}
            className="hidden md:flex items-center justify-center gap-2 px-3 py-2.5 border-t border-white/5 text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-all duration-150 text-xs"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <IconChevronRight /> : (
              <>
                <IconChevronLeft />
                <span className="whitespace-nowrap">Recolher</span>
              </>
            )}
          </button>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto min-w-0 flex flex-col">
          <div className="flex-1 p-5 md:p-6">
            {tab === 'dashboard' && <DashboardTab stats={stats} />}
            {tab === 'earnings'  && <EarningsTab />}
            {tab === 'tenants'   && <TenantsTab plans={plans} />}
            {tab === 'users'     && <UsersTab plans={plans} />}
            {tab === 'plans'     && <PlansTab />}
            {tab === 'ai'        && <SystemAITab />}
          </div>

          <footer className="flex-shrink-0 px-5 py-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-gray-600">
              Gasparzinho · by <span className="text-gray-500">Isaías Vasconcelos</span>
            </p>
            <div className="flex items-center gap-3">
              <a href="https://wa.me/5571985088478" target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-gray-600 hover:text-[#25D366] transition-colors">
                (71) 98508-8478
              </a>
              <span className="text-gray-700">·</span>
              <a href="mailto:isaiasvasconcelos210@gmail.com"
                className="text-[11px] text-gray-600 hover:text-[#25D366] transition-colors">
                isaiasvasconcelos210@gmail.com
              </a>
              <span className="text-gray-700">·</span>
              <a href="https://github.com/Isaias-Vasconcelos" target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-gray-600 hover:text-[#25D366] transition-colors flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                GitHub
              </a>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
