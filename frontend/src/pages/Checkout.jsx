import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { paymentsApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function Checkout() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState(false);
  const [currentPlanSlug, setCurrentPlanSlug] = useState(null);
  const [redirecting, setRedirecting] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifiedPlan, setVerifiedPlan] = useState(null);

  const success = params.get('success') === 'true';
  const canceled = params.get('canceled') === 'true';
  const sessionId = params.get('session_id');

  useEffect(() => {
    paymentsApi.getInfo()
      .then(({ data }) => setInfo(data))
      .catch(() => setInfoError(true));

    if (user) {
      paymentsApi.currentPlan()
        .then(({ data }) => setCurrentPlanSlug(data.plan?.slug || null))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (success && user && sessionId) {
      setVerifying(true);
      paymentsApi.verifyPayment(sessionId)
        .then(({ data }) => {
          setVerifiedPlan(data.plan);
          setCurrentPlanSlug(data.plan?.slug || null);
        })
        .catch(() => {})
        .finally(() => setVerifying(false));
    }
  }, [success, user, sessionId]);

  const handleSelectPlan = async (slug) => {
    if (!user) {
      navigate(`/register?redirect=/checkout`);
      return;
    }
    setRedirecting(slug);
    try {
      const { data } = await paymentsApi.createCheckoutSession(slug);
      window.location.href = data.url;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao iniciar pagamento');
      setRedirecting(null);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const { data } = await paymentsApi.createPortalSession();
      window.location.href = data.url;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao abrir portal');
    }
  };

  if (infoError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1a13] p-6">
        <div className="bg-[#132018] border border-white/10 rounded-2xl shadow-xl p-8 max-w-sm text-center space-y-4">
          <p className="text-4xl">⚠️</p>
          <h2 className="font-bold text-white text-lg">Erro ao carregar</h2>
          <p className="text-gray-400 text-sm">Não foi possível carregar os planos. Verifique sua conexão ou tente novamente.</p>
          <button onClick={() => window.location.reload()} className="btn-primary w-full">Tentar novamente</button>
          <Link to="/" className="block text-sm text-gray-400 hover:text-gray-600">← Voltar</Link>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1a13]">
        <div className="w-10 h-10 border-4 border-wa-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1a13]">
      {/* Header */}
      <header className="bg-[#0a1410]/90 backdrop-blur-md border-b border-white/5 py-4 px-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="font-bold text-lg flex items-center gap-2">
            <span className="text-2xl">👻</span>
            <span className="text-white">Gasparzinho</span>
          </Link>
          <div className="flex gap-3 items-center">
            {user ? (
              <>
                {currentPlanSlug && currentPlanSlug !== 'free' && (
                  <button
                    onClick={handleManageSubscription}
                    className="text-xs text-gray-400 hover:text-wa-green underline transition-colors"
                  >
                    Gerenciar assinatura
                  </button>
                )}
                <Link to="/app/sessions" className="text-sm text-gray-400 hover:text-white transition-colors">Ir para o App</Link>
              </>
            ) : (
              <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors">Já tenho conta</Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        {/* Sucesso */}
        {success && (
          <div className="bg-[#132018] border border-white/10 rounded-2xl shadow-xl p-8 text-center space-y-4 max-w-md mx-auto">
            {verifying ? (
              <>
                <div className="w-16 h-16 border-4 border-wa-green border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-gray-300">Confirmando seu pagamento...</p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-wa-green/20 border-2 border-wa-green rounded-full flex items-center justify-center mx-auto text-5xl shadow-lg shadow-wa-green/20">✅</div>
                <h2 className="text-2xl font-extrabold text-wa-green">Pagamento confirmado!</h2>
                {verifiedPlan ? (
                  <p className="text-gray-300">Plano <strong className="text-white">{verifiedPlan.name}</strong> ativado com sucesso!</p>
                ) : (
                  <p className="text-gray-400">Seu plano foi ativado. Pode levar alguns instantes para refletir no painel.</p>
                )}
                {user ? (
                  <Link to="/app/dashboard" className="btn-primary w-full block text-center py-3">Ir para o painel</Link>
                ) : (
                  <Link to="/login" className="btn-primary w-full block text-center py-3">Fazer login</Link>
                )}
              </>
            )}
          </div>
        )}

        {/* Cancelado */}
        {canceled && !success && (
          <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-xl p-4 text-center text-yellow-300 text-sm max-w-md mx-auto">
            Pagamento cancelado. Você pode tentar novamente quando quiser.
          </div>
        )}

        {/* Cards de planos */}
        {!success && (
          <>
            <div className="text-center">
              <h1 className="text-3xl font-extrabold text-white mb-2">Escolha seu plano</h1>
              <p className="text-gray-400">Pagamento seguro via Stripe. Cancele a qualquer momento.</p>
              {currentPlanSlug && (
                <p className="text-sm text-gray-400 mt-2">
                  Plano atual: <span className="font-semibold text-wa-green">
                    {info.plans.find((p) => p.slug === currentPlanSlug)?.name || currentPlanSlug}
                  </span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {info.plans.map((p) => {
                const isCurrent = p.slug === currentPlanSlug;
                const isFree = p.price_cents === 0;
                const isLoading = redirecting === p.slug;
                const features = Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]');

                return (
                  <div
                    key={p.slug}
                    className={`relative bg-[#132018] rounded-2xl p-6 text-left border flex flex-col transition-all
                      ${isFree ? 'opacity-60' : 'hover:shadow-xl hover:shadow-wa-green/10 hover:-translate-y-0.5 cursor-pointer'}
                      ${isCurrent ? 'border-wa-green shadow-lg shadow-wa-green/20' : 'border-white/10 hover:border-wa-green/40'}`}
                    onClick={() => !isFree && !isLoading && handleSelectPlan(p.slug)}
                  >
                    {isCurrent && (
                      <span className="absolute top-4 right-4 bg-wa-green text-white text-xs font-bold px-2.5 py-1 rounded-full">
                        Plano atual
                      </span>
                    )}

                    <div className="flex-1">
                      <h3 className="font-bold text-wa-green text-xl">{p.name}</h3>
                      <p className="mt-2 text-3xl font-extrabold text-white">
                        {isFree ? (
                          'Grátis'
                        ) : (
                          <>
                            R$ {(p.price_cents / 100).toFixed(2).replace('.', ',')}
                            <span className="text-sm font-normal text-gray-500">/mês</span>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {p.max_sessions === -1 ? 'Sessões ilimitadas' : `${p.max_sessions} sessão(ões)`}
                        {' · '}
                        {p.max_groups === -1 ? 'grupos ilimitados' : `${p.max_groups} grupo(s)`}
                      </p>

                      <ul className="mt-4 space-y-2">
                        {features.map((f) => (
                          <li key={f} className="text-sm text-gray-300 flex items-start gap-2">
                            <span className="text-wa-green font-bold mt-0.5">✓</span> {f}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {!isFree && (
                      <button
                        disabled={!!redirecting}
                        className={`mt-6 w-full py-3 rounded-xl text-sm font-bold text-white transition-all
                          ${isCurrent
                            ? 'bg-wa-teal/70 hover:bg-wa-teal'
                            : 'bg-wa-green hover:bg-green-400 shadow-lg shadow-wa-green/20 hover:shadow-wa-green/40'}
                          ${redirecting && !isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {isLoading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Redirecionando...
                          </span>
                        ) : isCurrent ? 'Renovar plano' : 'Assinar agora'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-center text-xs text-gray-500">
              Pagamentos processados com segurança pelo <strong className="text-gray-400">Stripe</strong>. Assinaturas podem ser canceladas a qualquer momento pelo portal do cliente.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
