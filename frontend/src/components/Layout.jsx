import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { aiApi, paymentsApi } from '../services/api';

// ── Ícones SVG ────────────────────────────────────────────────────────────────

function IconSessions() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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

function IconDashboard() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function IconAnalytics() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
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

function IconUpgrade() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  );
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const navItems = [
  { to: '/app/sessions',   label: 'Sessões',        Icon: IconSessions  },
  { to: '/app/settings',   label: 'Configurações',  Icon: IconSettings  },
  { to: '/app/ai',         label: 'IA',             Icon: IconAI        },
  { to: '/app/dashboard',  label: 'Dashboard',      Icon: IconDashboard },
  { to: '/app/analytics',  label: 'Gráficos',       Icon: IconAnalytics },
];

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [creditsExhausted, setCreditsExhausted] = useState(false);
  const [planAlert, setPlanAlert] = useState(null);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    aiApi.systemStatus().then(({ data }) => setCreditsExhausted(data.credits_exhausted)).catch(() => {});
    paymentsApi.currentPlan().then(({ data }) => {
      if (data.is_expired) setPlanAlert({ type: 'expired' });
      else if (data.expires_soon) setPlanAlert({ type: 'soon', days: data.days_remaining });
    }).catch(() => {});
  }, []);

  const toggleCollapse = () => {
    setCollapsed((v) => {
      try { localStorage.setItem('sidebar-collapsed', String(!v)); } catch {}
      return !v;
    });
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#0d1a13]">
      {/* Banners de alerta */}
      {planAlert?.type === 'expired' && (
        <div className="bg-red-600/90 text-white text-sm px-4 py-2.5 flex items-center justify-center gap-2 text-center">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          <span>Sua assinatura expirou. Renove agora para continuar usando todos os recursos.</span>
          <Link to="/checkout" className="ml-2 underline font-bold whitespace-nowrap">Renovar →</Link>
        </div>
      )}
      {planAlert?.type === 'soon' && (
        <div className="bg-amber-500/90 text-white text-sm px-4 py-2.5 flex items-center justify-center gap-2 text-center">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          <span>Sua assinatura expira em <strong>{planAlert.days} dia{planAlert.days !== 1 ? 's' : ''}</strong>.</span>
          <Link to="/checkout" className="ml-2 underline font-bold whitespace-nowrap">Renovar →</Link>
        </div>
      )}
      {creditsExhausted && (
        <div className="bg-red-600/90 text-white text-sm px-4 py-2 flex items-center justify-center gap-2 text-center">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          <span>Créditos de IA esgotados — análise automática desativada.</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-[#0a1410] border-b border-white/5 text-white z-20 relative flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Hamburguer mobile */}
            <button
              className="md:hidden text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Menu"
            >
              {menuOpen ? <IconClose /> : <IconMenu />}
            </button>

            {/* Logo */}
            <Link to="/app/sessions" className="font-bold text-lg tracking-tight flex items-center gap-2 select-none">
              <span className="text-xl leading-none">👻</span>
              <span className={`text-white transition-all duration-200 ${collapsed ? 'md:hidden' : ''}`}>
                Gasparzinho
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/checkout"
              className="hidden sm:flex items-center gap-1.5 text-xs bg-wa-green text-white px-3.5 py-1.5 rounded-full font-bold hover:bg-green-400 transition-all duration-150 shadow-md shadow-wa-green/30 hover:shadow-wa-green/50"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
              Upgrade
            </Link>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <div className="w-2 h-2 rounded-full bg-wa-green animate-pulse" />
              <span className="text-xs text-gray-300">{user?.username}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-red-500/20 hover:text-red-300 text-gray-400 px-3 py-1.5 rounded-lg border border-white/10 hover:border-red-500/30 transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sair
            </button>
          </div>
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
          bg-wa-panel border-r border-white/5
          transform transition-all duration-250 ease-in-out
          ${menuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
          w-56 ${collapsed ? 'md:w-14' : 'md:w-56'}
        `}>
          {/* Nav */}
          <nav className="p-2 space-y-0.5 flex-1 overflow-y-auto overflow-x-hidden pt-3">
            {navItems.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 overflow-hidden
                  ${collapsed ? 'md:justify-center md:px-2.5' : ''}
                  ${isActive
                    ? 'bg-wa-green/10 text-wa-green shadow-sm ring-1 ring-wa-green/20'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <Icon />
                <span className={`whitespace-nowrap transition-all duration-200 ${collapsed ? 'md:hidden' : ''}`}>
                  {label}
                </span>
              </NavLink>
            ))}
          </nav>

          {/* Upgrade button */}
          <div className="p-2 border-t border-white/5">
            <Link
              to="/checkout"
              title={collapsed ? 'Fazer upgrade' : undefined}
              className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-semibold
                bg-wa-green/10 border border-wa-green/25 text-wa-green
                hover:bg-wa-green hover:text-white hover:border-wa-green
                transition-all duration-150 shadow-sm hover:shadow-md hover:shadow-wa-green/25
                ${collapsed ? 'md:justify-center md:px-2' : 'justify-center'}`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className={`whitespace-nowrap ${collapsed ? 'md:hidden' : ''}`}>Fazer upgrade</span>
            </Link>
          </div>

          {/* Botão colapsar (só desktop) */}
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
            <Outlet />
          </div>
          <footer className="flex-shrink-0 px-5 py-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-gray-600">
              Gasparzinho · by <span className="text-gray-500">Isaías Vasconcelos</span>
            </p>
            <div className="flex items-center gap-3">
              <a href="https://wa.me/5571985088478" target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-gray-600 hover:text-wa-green transition-colors">
                (71) 98508-8478
              </a>
              <span className="text-gray-700">·</span>
              <a href="mailto:isaiasvasconcelos210@gmail.com"
                className="text-[11px] text-gray-600 hover:text-wa-green transition-colors">
                isaiasvasconcelos210@gmail.com
              </a>
              <span className="text-gray-700">·</span>
              <a href="https://github.com/Isaias-Vasconcelos" target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-gray-600 hover:text-wa-green transition-colors flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/>
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
