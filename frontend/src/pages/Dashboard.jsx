import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sessionsApi, groupsApi, settingsApi, paymentsApi } from '../services/api';

// ── Ícones SVG ────────────────────────────────────────────────────────────────
function IconPhone({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function IconBan({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}

function IconShield({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function IconPeople({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function IconCrown({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M5 19h14M5 19l-1.5-7 4.5 3 4-8 4 8 4.5-3L19 19H5z" />
    </svg>
  );
}

function IconStar({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function IconGift({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M20 12v10H4V12M2 7h20v5H2V7zm10 15V7m0-4a2 2 0 100-4 2 2 0 000 4zm0 0a2 2 0 110-4 2 2 0 010 4z" />
    </svg>
  );
}

function IconChart({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function IconArrow({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconWarning({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function IconUpgrade({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [bans, setBans]         = useState([]);
  const [words, setWords]       = useState([]);
  const [planInfo, setPlanInfo] = useState(null);
  const [groups, setGroups]     = useState([]);

  useEffect(() => {
    sessionsApi.list().then(({ data }) => setSessions(data)).catch(() => {});
    groupsApi.getBans().then(({ data }) => setBans(data)).catch(() => {});
    settingsApi.getProfanity().then(({ data }) => setWords(data)).catch(() => {});
    paymentsApi.currentPlan().then(({ data }) => setPlanInfo(data)).catch(() => {});
    groupsApi.getAllManaged().then(({ data }) => setGroups(data)).catch(() => {});
  }, []);

  const connected = sessions.filter((s) => s.status === 'connected').length;
  const isPaid    = planInfo && planInfo.plan.price_cents > 0;

  const stats = [
    {
      label: 'Sessões Online',
      value: connected,
      total: sessions.length,
      Icon: IconPhone,
      iconBg: 'bg-[#25D366]/15',
      iconColor: 'text-[#25D366]',
      border: 'border-[#25D366]',
    },
    {
      label: 'Total de Bans',
      value: bans.length,
      Icon: IconBan,
      iconBg: 'bg-red-500/15',
      iconColor: 'text-red-400',
      border: 'border-red-400',
    },
    {
      label: 'Palavras Filtradas',
      value: words.length,
      Icon: IconShield,
      iconBg: 'bg-yellow-400/15',
      iconColor: 'text-yellow-400',
      border: 'border-yellow-400',
    },
    {
      label: 'Grupos Gerenciados',
      value: groups.length,
      Icon: IconPeople,
      iconBg: 'bg-blue-500/15',
      iconColor: 'text-blue-400',
      border: 'border-blue-400',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* ── Card de plano ──────────────────────────────────────────────────── */}
      {planInfo && (
        isPaid ? (
          <div className="relative rounded-2xl overflow-hidden shadow-xl shadow-black/30">
            <div className="absolute inset-0 bg-gradient-to-br from-[#1d6b3e] via-[#145c33] to-[#0d3d22]" />
            <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-[#25D366]/25 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-14 -left-8 w-48 h-48 rounded-full bg-[#25D366]/10 blur-2xl pointer-events-none" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#25D366]/60 to-transparent" />

            <div className="relative p-6 text-white flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center flex-shrink-0">
                  {planInfo.plan.slug === 'pro'
                    ? <IconCrown className="w-7 h-7 text-white" />
                    : <IconStar className="w-6 h-6 text-yellow-200" />
                  }
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-xs font-medium text-green-200/70">Plano atual</p>
                    {planInfo.subscription_status === 'active' && (
                      <span className="text-[10px] bg-white/15 border border-white/20 text-white px-1.5 py-0.5 rounded font-semibold tracking-wide">
                        ATIVO
                      </span>
                    )}
                    {planInfo.subscription_status === 'past_due' && (
                      <span className="text-[10px] bg-yellow-400/20 border border-yellow-400/30 text-yellow-300 px-1.5 py-0.5 rounded font-semibold">
                        EM ATRASO
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-extrabold tracking-tight">{planInfo.plan.name}</p>
                  <p className="text-xs mt-0.5 text-green-200/60">
                    {planInfo.session_count}/{planInfo.plan.max_sessions === -1 ? '∞' : planInfo.plan.max_sessions} sessões
                    {' · '}
                    {groups.length} grupo{groups.length !== 1 ? 's' : ''} gerenciado{groups.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {planInfo.expires_at && (
                  <div className="text-right">
                    <p className={`text-xs font-medium flex items-center gap-1 justify-end ${
                      planInfo.is_expired ? 'text-red-300' : planInfo.expires_soon ? 'text-yellow-300' : 'text-green-200/60'
                    }`}>
                      {(planInfo.is_expired || planInfo.expires_soon) && (
                        <IconWarning className="w-3.5 h-3.5" />
                      )}
                      {planInfo.is_expired
                        ? 'Expirado'
                        : planInfo.expires_soon
                          ? `Expira em ${planInfo.days_remaining}d`
                          : 'Válido até'}
                    </p>
                    <p className="text-sm font-bold">
                      {new Date(planInfo.expires_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                )}
                <Link
                  to="/checkout"
                  className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 border border-white/25 hover:border-white/40 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                >
                  Gerenciar
                  <IconArrow className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#132018] border border-white/10 rounded-2xl p-6 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-[#25D366]/10 border border-[#25D366]/15 flex items-center justify-center flex-shrink-0">
                <IconGift className="w-7 h-7 text-[#25D366]" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">Plano atual</p>
                <p className="text-2xl font-extrabold text-white">Gratuito</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {planInfo.session_count}/{planInfo.plan.max_sessions} sessão
                  {' · '}
                  {groups.length} grupo{groups.length !== 1 ? 's' : ''} gerenciado{groups.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <Link
              to="/checkout"
              className="flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-[#25D366]/25 hover:shadow-[#25D366]/40 hover:-translate-y-0.5"
            >
              <IconUpgrade className="w-4 h-4" />
              Fazer upgrade
            </Link>
          </div>
        )
      )}

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className={`card border-l-4 ${s.border} flex flex-col`}>
            <div className={`w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center mb-3 flex-shrink-0`}>
              <s.Icon className={`w-5 h-5 ${s.iconColor}`} />
            </div>
            <span className="text-3xl font-extrabold text-white tabular-nums">{s.value}</span>
            {s.total !== undefined && (
              <span className="text-xs text-gray-500">de {s.total}</span>
            )}
            <span className="text-xs text-gray-400 mt-1 font-medium">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Sessões ──────────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#25D366]/10 flex items-center justify-center">
                <IconPhone className="w-4 h-4 text-[#25D366]" />
              </div>
              <h2 className="font-bold text-white">Sessões</h2>
            </div>
            <Link to="/app/sessions" className="flex items-center gap-0.5 text-xs text-[#25D366] hover:underline">
              Ver todas <IconArrow className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="space-y-1">
            {sessions.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhuma sessão criada</p>
            ) : (
              sessions.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm py-2 border-b border-white/10 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'connected' ? 'bg-[#25D366] animate-pulse' : 'bg-gray-600'}`} />
                    <div className="min-w-0">
                      <span className="font-medium text-white truncate block">{s.display_name || s.name}</span>
                      {s.phone && <span className="text-[10px] text-gray-500 font-mono">+{s.phone}</span>}
                    </div>
                  </div>
                  <span className={s.status === 'connected' ? 'badge-green' : 'badge-gray'}>
                    {s.status === 'connected' ? 'Online' : 'Offline'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Últimos Bans ─────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                <IconBan className="w-4 h-4 text-red-400" />
              </div>
              <h2 className="font-bold text-white">Últimos Bans</h2>
            </div>
            <Link to="/app/analytics" className="flex items-center gap-0.5 text-xs text-[#25D366] hover:underline">
              Ver gráficos <IconArrow className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="space-y-1">
            {bans.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhum ban registrado</p>
            ) : (
              bans.slice(0, 5).map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm py-2 border-b border-white/10 last:border-0">
                  <span className="font-mono text-xs text-gray-300">{b.phone.replace('@c.us', '')}</span>
                  <span className="badge-red text-xs">{b.reason}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Grupos Gerenciados ────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <IconPeople className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="font-bold text-white">Grupos Gerenciados</h2>
          </div>
          <Link to="/app/analytics" className="flex items-center gap-0.5 text-xs text-[#25D366] hover:underline">
            Ver gráficos <IconArrow className="w-3.5 h-3.5" />
          </Link>
        </div>
        {groups.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-gray-500 text-sm">Nenhum grupo gerenciado ainda.</p>
            <Link to="/app/sessions" className="text-[#25D366] text-xs hover:underline mt-1 inline-flex items-center gap-0.5">
              Ir para sessões <IconArrow className="w-3 h-3" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {groups.slice(0, 8).map((g) => (
              <div key={`${g.session_id}-${g.group_id}`} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2.5 gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{g.group_name || 'Sem nome'}</p>
                  <p className="text-[10px] text-gray-500 truncate">{g.session_name}</p>
                </div>
                <button
                  onClick={() => navigate(`/app/analytics?session_id=${g.session_id}&group_id=${encodeURIComponent(g.group_id)}`)}
                  className="flex-shrink-0 flex items-center gap-1.5 text-[11px] bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/20 px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap"
                >
                  <IconChart className="w-3 h-3" />
                  Gráficos
                </button>
              </div>
            ))}
          </div>
        )}
        {groups.length > 8 && (
          <p className="text-xs text-gray-500 mt-3 text-center">
            +{groups.length - 8} grupos —{' '}
            <Link to="/app/sessions" className="text-[#25D366] hover:underline">ver todos</Link>
          </p>
        )}
      </div>
    </div>
  );
}
