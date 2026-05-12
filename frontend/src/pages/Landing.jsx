import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { paymentsApi } from '../services/api';

// Hook simples de scroll-reveal
function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.12 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

const features = [
  { icon: '🔗', title: 'Bloqueio de Links',        desc: 'Bane automaticamente qualquer membro que enviar links no grupo — sem precisar de admin online.' },
  { icon: '🚫', title: 'Filtro de Palavrões',       desc: 'Monte sua lista de palavras proibidas e o sistema remove e bane infratores em tempo real.' },
  { icon: '👋', title: 'Saudação Automática',       desc: 'Boas-vindas personalizadas para novos membros com menção automática — disponível no plano gratuito.' },
  { icon: '⌨️', title: 'Comandos Personalizados',   desc: 'Crie seus próprios comandos de texto: ex: "rm 5511..." para remover alguém. Você define a palavra.' },
  { icon: '🖼️', title: 'Bloqueio de Mídia',         desc: 'Impeça o envio de imagens, vídeos e figurinhas no grupo — ideal para grupos focados em texto.' },
  { icon: '🤖', title: 'Moderação de Mídia com IA',   desc: 'IA analisa fotos, vídeos e figurinhas em tempo real e remove automaticamente conteúdo impróprio — disponível no Starter.' },
  { icon: '🔒', title: 'Bloqueio por Horário',      desc: 'Programe o grupo para aceitar mensagens só em horários definidos. Fora do horário, só admins falam.' },
  { icon: '📱', title: 'Multi-Sessão',              desc: 'Gerencie vários números de WhatsApp e grupos em um só painel, com QR code fácil.' },
  { icon: '📊', title: 'Gráficos e Analytics',      desc: 'Visualize remoções por mês, semana e ano. Descubra quais regras são mais violadas nos seus grupos.' },
  { icon: '🏢', title: 'Multi-Tenant',              desc: 'Cada organização tem seus próprios dados isolados — ideal para agências e empresas.' },
];

const steps = [
  { n: '1', title: 'Crie sua conta',       desc: 'Cadastre sua organização e usuário admin gratuitamente.' },
  { n: '2', title: 'Conecte o WhatsApp',   desc: 'Escaneie o QR code com seu WhatsApp para vincular o número.' },
  { n: '3', title: 'Configure seus grupos', desc: 'Ative moderação, defina horários e crie seus comandos.' },
  { n: '4', title: 'Pronto!',              desc: 'O sistema trabalha por você 24 horas, sem precisar estar online.' },
];

function PlanCard({ plan, highlight, delay = 0 }) {
  const [ref, visible] = useReveal();
  const price  = plan.price_cents === 0 ? 'Grátis' : `R$ ${(plan.price_cents / 100).toFixed(2).replace('.', ',')}`;
  const period = plan.price_cents > 0 ? '/mês' : '';

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`relative rounded-2xl p-6 flex flex-col gap-4 border transition-all duration-700
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}
        ${highlight
          ? 'bg-wa-teal border-wa-green shadow-2xl shadow-wa-green/20 hover:-translate-y-2'
          : 'bg-[#1a2e25] border-white/10 hover:border-wa-green/40 hover:-translate-y-1'}
      `}
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-wa-green text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg shadow-wa-green/40 animate-pulse-glow">
          MAIS POPULAR
        </span>
      )}
      <div>
        <h3 className="text-xl font-bold text-white">{plan.name}</h3>
        <div className="mt-2 flex items-end gap-1">
          <span className="text-4xl font-extrabold text-wa-green">{price}</span>
          <span className="text-sm pb-1 text-gray-400">{period}</span>
        </div>
        <p className="text-sm mt-1 text-gray-400">
          {plan.max_sessions === -1 ? 'Sessões ilimitadas' : `${plan.max_sessions} ${plan.max_sessions > 1 ? 'sessões' : 'sessão'}`}
        </p>
      </div>
      <ul className="space-y-2 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-gray-200">
            <span className="text-wa-green font-bold mt-0.5 flex-shrink-0">✓</span>
            {f}
          </li>
        ))}
      </ul>
      <Link
        to={plan.price_cents === 0 ? '/register' : `/checkout?plan=${plan.slug}`}
        className={`text-center py-3 rounded-xl font-semibold transition-all ${
          highlight
            ? 'bg-wa-green text-white hover:bg-green-400 shadow-lg shadow-wa-green/30'
            : 'bg-white/10 text-white hover:bg-wa-green hover:shadow-lg hover:shadow-wa-green/30'
        }`}
      >
        {plan.price_cents === 0 ? 'Começar grátis' : 'Assinar agora'}
      </Link>
    </div>
  );
}

function Section({ children, className = '' }) {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'} ${className}`}
    >
      {children}
    </div>
  );
}

export default function Landing() {
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    paymentsApi.getInfo().then(({ data }) => setPlans(data.plans)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#0d1a13] font-sans text-white overflow-x-hidden">

      {/* Nav */}
      <nav className="bg-[#0a1410]/90 backdrop-blur-md sticky top-0 z-50 border-b border-white/5 animate-fade-in">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <span className="font-bold text-lg flex items-center gap-2">
            <span className="text-2xl animate-float">👻</span>
            <span className="text-white">Gasparzinho</span>
          </span>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-gray-400 hover:text-white text-sm font-medium transition-colors">
              Entrar
            </Link>
            <Link to="/register" className="bg-wa-green text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-400 transition-all shadow-lg shadow-wa-green/20 hover:shadow-wa-green/40 hover:-translate-y-0.5">
              Criar conta grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-24 pb-28 px-5">
        {/* Fantasmas flutuantes */}
        <div className="pointer-events-none select-none absolute inset-0 overflow-hidden">
          <div className="absolute top-10 left-[8%]  w-64 h-64 bg-wa-green/5 rounded-full blur-3xl animate-float" />
          <div className="absolute top-32 right-[6%] w-80 h-80 bg-wa-green/4 rounded-full blur-3xl animate-float-delayed" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-64 bg-wa-green/5 rounded-full blur-3xl animate-pulse-glow" />

          {/* Partículas fantasma */}
          <div className="absolute top-[20%] left-[15%]  w-3 h-3 rounded-full bg-wa-green/20 animate-float" />
          <div className="absolute top-[35%] right-[18%] w-2 h-2 rounded-full bg-wa-green/15 animate-float-slow" />
          <div className="absolute top-[55%] left-[25%]  w-4 h-4 rounded-full bg-wa-green/10 animate-float-delayed" />
          <div className="absolute top-[15%] right-[30%] w-2 h-2 rounded-full bg-wa-green/20 animate-float-slow" />

          {/* Hexágonos / formas wireframe */}
          <div className="absolute top-[28%] left-[5%]  w-20 h-20 border border-wa-green/10 rounded-xl rotate-12  animate-float-slow" />
          <div className="absolute top-[18%] right-[8%] w-16 h-16 border border-wa-green/8  rounded-xl -rotate-6  animate-float" />
          <div className="absolute bottom-[15%] left-[12%] w-12 h-12 border border-wa-green/10 rounded-lg rotate-45 animate-float-delayed" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">

          {/* Mascote fantasma + título principal */}
          <div className="animate-fade-up flex flex-col items-center mb-8">
            {/* fantasma isolado — glow contido */}
            <div className="relative w-40 h-40 md:w-52 md:h-52 flex items-center justify-center">
              <div className="absolute inset-4 blur-2xl bg-wa-green/20 rounded-full animate-pulse-glow" />
              <span className="relative text-8xl md:text-[8rem] select-none animate-float leading-none z-10">
                👻
              </span>
            </div>

            <h1 className="animate-fade-up-d1 mt-2 text-6xl md:text-8xl font-extrabold tracking-tight">
              <span className="text-wa-green">Gasparzinho</span>
            </h1>

            <p className="animate-fade-up-d2 mt-4 text-2xl md:text-4xl font-bold text-white leading-snug max-w-2xl">
              Gerencie tudo do seu WhatsApp usando tecnologia fantasma
            </p>
          </div>

          <div className="animate-fade-up-d2 inline-flex items-center gap-2 bg-wa-green/10 border border-wa-green/25 text-wa-green text-sm px-4 py-1.5 rounded-full mb-6 font-medium">
            🤖 Moderação automática com Inteligência Artificial
          </div>

          <p className="animate-fade-up-d3 text-lg md:text-xl text-gray-300 max-w-2xl mx-auto mb-8 leading-relaxed">
            Moderação automática com IA, bloqueio de mídia inapropriada, bloqueio por horário e controle total — tudo em um só painel.
          </p>
          <div className="animate-fade-up-d4 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/register"
              className="bg-wa-green hover:bg-green-400 text-white font-bold px-8 py-4 rounded-xl text-lg shadow-xl shadow-wa-green/25 transition-all hover:-translate-y-1 hover:shadow-wa-green/40"
            >
              Começar grátis agora →
            </Link>
            <a
              href="#funcionalidades"
              className="border border-white/15 hover:border-wa-green/50 hover:bg-wa-green/5 text-gray-200 hover:text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all"
            >
              Ver funcionalidades
            </a>
          </div>
          <p className="animate-fade-in text-gray-500 text-sm mt-5">Sem cartão de crédito · Plano gratuito para sempre</p>
        </div>
      </section>

      {/* Stats bar */}
      <Section>
        <div className="bg-[#0a1410] border-y border-white/5">
          <div className="max-w-4xl mx-auto px-5 py-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {[
              { n: '1 000+', l: 'Grupos gerenciados' },
              { n: '500+',   l: 'Usuários ativos' },
              { n: '24/7',   l: 'Moderação automática' },
              { n: '100%',   l: 'Dados isolados' },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-2xl font-extrabold text-wa-green">{s.n}</div>
                <div className="text-sm text-gray-400 mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Funcionalidades */}
      <section id="funcionalidades" className="relative py-20 px-5 bg-[#0d1a13] overflow-hidden">
        {/* fantasma de fundo */}
        <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-96 h-96 bg-wa-green/4 rounded-full blur-3xl animate-pulse-glow" />

        <div className="relative max-w-6xl mx-auto">
          <Section className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
              Tudo que você precisa
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              Uma plataforma completa para manter seus grupos organizados e seguros — com inteligência artificial monitorando 24/7.
            </p>
          </Section>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f, i) => {
              const [ref, visible] = [useRef(null), useState(false)];
              return (
                <FeatureCard key={f.title} f={f} delay={i * 60} />
              );
            })}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="relative py-20 px-5 bg-[#0a1410] overflow-hidden">
        <div className="pointer-events-none absolute left-0 top-0 w-64 h-64 bg-wa-green/4 rounded-full blur-3xl animate-float-slow" />
        <div className="relative max-w-4xl mx-auto">
          <Section className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-3">Como funciona</h2>
            <p className="text-gray-400">Configure em minutos, funciona para sempre.</p>
          </Section>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {steps.map((s, i) => (
              <StepCard key={s.n} s={s} i={i} total={steps.length} />
            ))}
          </div>
        </div>
      </section>

      {/* Preços */}
      <section id="precos" className="relative py-20 px-5 bg-[#0d1a13] overflow-hidden">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[600px] h-[400px] bg-wa-green/4 rounded-full blur-3xl animate-pulse-glow" />
        </div>
        <div className="relative max-w-5xl mx-auto">
          <Section className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-3">Planos e Preços</h2>
            <p className="text-gray-400">Comece grátis. Escale quando precisar.</p>
          </Section>
          {plans.length === 0 ? (
            <div className="text-center text-gray-600 py-10">Carregando planos...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((p, i) => (
                <PlanCard key={p.slug} plan={p} highlight={i === 1} delay={i * 100} />
              ))}
            </div>
          )}
          <p className="text-center text-sm text-gray-600 mt-6">
            Pagamento seguro via Stripe · Cartão de crédito ou débito · Cancele a qualquer momento
          </p>
        </div>
      </section>

      {/* CTA Final */}
      <section className="relative py-20 px-5 bg-[#0a1410] border-t border-wa-green/10 overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-[20%]  w-3 h-3 rounded-full bg-wa-green/20 animate-float" />
          <div className="absolute top-8 right-[25%] w-2 h-2 rounded-full bg-wa-green/15 animate-float-slow" />
          <div className="absolute bottom-8 left-[40%] w-4 h-4 rounded-full bg-wa-green/10 animate-float-delayed" />
          <div className="absolute top-1/2 left-[8%]  w-14 h-14 border border-wa-green/10 rounded-xl rotate-12 animate-float-slow" />
          <div className="absolute top-1/3 right-[8%] w-10 h-10 border border-wa-green/8  rounded-lg -rotate-6 animate-float" />
        </div>
        <Section className="relative max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-wa-green/10 border border-wa-green/30 rounded-2xl text-3xl mb-6 animate-float">
            🚀
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Pronto para ter controle total dos seus grupos?
          </h2>
          <p className="text-gray-400 mb-8 text-lg">
            Junte-se a centenas de empresas que já automatizaram a moderação dos seus grupos.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/register"
              className="bg-wa-green hover:bg-green-400 text-white font-bold px-8 py-4 rounded-xl text-lg shadow-xl shadow-wa-green/25 transition-all hover:-translate-y-1"
            >
              Criar conta grátis →
            </Link>
            <Link
              to="/login"
              className="border border-white/15 hover:border-wa-green/40 text-gray-300 hover:text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all"
            >
              Já tenho conta
            </Link>
          </div>
        </Section>
      </section>

      {/* Footer */}
      <footer className="bg-[#070f0a] text-gray-500 py-10 px-5 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          {/* Grid principal */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
            {/* Marca */}
            <div className="text-center sm:text-left">
              <div className="flex items-center gap-2 justify-center sm:justify-start mb-2">
                <span className="text-2xl">👻</span>
                <span className="font-bold text-gray-200 text-base">Gasparzinho</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Gerenciamento profissional de grupos WhatsApp com moderação automática e IA.
              </p>
              <p className="text-xs text-gray-600 mt-2">Não é afiliado ao WhatsApp Inc.</p>
            </div>

            {/* Navegação */}
            <div className="text-center">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Plataforma</p>
              <div className="space-y-2">
                <div><Link to="/login"    className="text-xs hover:text-wa-green transition-colors">Entrar</Link></div>
                <div><Link to="/register" className="text-xs hover:text-wa-green transition-colors">Criar conta grátis</Link></div>
                <div><Link to="/checkout" className="text-xs hover:text-wa-green transition-colors">Ver planos</Link></div>
              </div>
            </div>

            {/* Contato / Desenvolvedor */}
            <div className="text-center sm:text-right">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Suporte & Contato</p>
              <div className="space-y-2">
                <p className="text-xs text-gray-300 font-medium">by Isaías Vasconcelos</p>
                <a
                  href="https://wa.me/5571985088478"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 justify-center sm:justify-end text-xs text-gray-400 hover:text-wa-green transition-colors"
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.135.564 4.14 1.543 5.877L0 24l6.293-1.521A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.793 9.793 0 01-5.017-1.381l-.36-.214-3.733.902.944-3.641-.235-.374A9.77 9.77 0 012.182 12C2.182 6.579 6.579 2.182 12 2.182S21.818 6.579 21.818 12 17.421 21.818 12 21.818z"/>
                  </svg>
                  (71) 98508-8478
                </a>
                <a
                  href="mailto:isaiasvasconcelos210@gmail.com"
                  className="flex items-center gap-1.5 justify-center sm:justify-end text-xs text-gray-400 hover:text-wa-green transition-colors"
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  isaiasvasconcelos210@gmail.com
                </a>
                <a
                  href="https://github.com/Isaias-Vasconcelos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 justify-center sm:justify-end text-xs text-gray-400 hover:text-wa-green transition-colors"
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/>
                  </svg>
                  github.com/Isaias-Vasconcelos
                </a>
              </div>
            </div>
          </div>

          {/* Linha inferior */}
          <div className="border-t border-white/5 pt-5 text-center">
            <p className="text-xs text-gray-600">
              © {new Date().getFullYear()} Gasparzinho · Desenvolvido por <span className="text-gray-400 font-medium">Isaías Vasconcelos</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Componente separado para feature card (hooks não podem ser chamados em loop)
function FeatureCard({ f, delay }) {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`bg-[#132018] rounded-xl p-5 border border-white/5 hover:border-wa-green/35 hover:bg-[#162a1e] transition-all duration-500 group cursor-default
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
    >
      <div className="text-3xl mb-3 group-hover:scale-110 transition-transform duration-300">{f.icon}</div>
      <h3 className="font-bold text-white mb-1 group-hover:text-wa-green transition-colors">{f.title}</h3>
      <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
    </div>
  );
}

function StepCard({ s, i, total }) {
  const [ref, visible] = useReveal();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${i * 120}ms` }}
      className={`text-center relative transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
    >
      {i < total - 1 && (
        <div className="hidden md:block absolute top-7 left-1/2 w-full h-px bg-wa-green/15 z-0" />
      )}
      <div className="relative z-10 w-14 h-14 bg-wa-green/10 border-2 border-wa-green/60 text-wa-green rounded-full flex items-center justify-center text-xl font-extrabold mx-auto mb-3 shadow-lg shadow-wa-green/10 hover:border-wa-green hover:bg-wa-green/20 transition-all duration-300">
        {s.n}
      </div>
      <h3 className="font-bold text-white mb-1">{s.title}</h3>
      <p className="text-sm text-gray-400">{s.desc}</p>
    </div>
  );
}
