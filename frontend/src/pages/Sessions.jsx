import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { sessionsApi, paymentsApi } from '../services/api';

const STATUS_LABELS = {
  connected:    { label: 'Conectado',     cls: 'badge-green',  dot: 'bg-wa-green animate-pulse' },
  qr_ready:     { label: 'Aguard. QR',   cls: 'badge-yellow', dot: 'bg-yellow-400' },
  connecting:   { label: 'Conectando...', cls: 'badge-yellow', dot: 'bg-yellow-400 animate-pulse' },
  disconnected: { label: 'Desconectado',  cls: 'badge-gray',   dot: 'bg-gray-500' },
};

function QRModal({ session, onClose }) {
  const [state, setState] = useState({ status: 'connecting', qr_code: null });

  useEffect(() => {
    const url = sessionsApi.qrStreamUrl(session.id);
    const es = new EventSource(url);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setState(data);
      if (data.status === 'connected') {
        toast.success('WhatsApp conectado!');
        onClose(true);
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [session.id]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#132018] border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
        <h2 className="text-lg font-bold text-white mb-1">Conectar: {session.name}</h2>
        <p className="text-sm text-gray-400 mb-4">
          {state.status === 'qr_ready'
            ? 'Escaneie o QR Code com seu WhatsApp'
            : state.status === 'connected'
            ? 'Conectado!'
            : 'Aguardando QR Code...'}
        </p>
        {state.qr_code && state.status === 'qr_ready' ? (
          <img
            src={state.qr_code}
            alt="QR Code"
            className="mx-auto rounded-xl border-4 border-wa-green/30 w-56 h-56 object-contain bg-white"
          />
        ) : (
          <div className="w-56 h-56 mx-auto flex items-center justify-center bg-white/5 rounded-xl border border-white/10">
            <div className="w-10 h-10 border-4 border-wa-green border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <p className="text-xs text-gray-500 mt-3">WhatsApp → Menu → Dispositivos vinculados → Vincular</p>
        <button onClick={() => onClose(false)} className="btn-secondary mt-4 w-full">Fechar</button>
      </div>
    </div>
  );
}

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [planInfo, setPlanInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [qrSession, setQrSession] = useState(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const [sessRes, planRes] = await Promise.all([sessionsApi.list(), paymentsApi.currentPlan()]);
      setSessions(sessRes.data);
      setPlanInfo(planRes.data);
    } catch { toast.error('Erro ao carregar sessões'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await sessionsApi.create({ name: newName.trim() });
      setNewName('');
      setSessions((prev) => [...prev, data]);
      toast.success('Sessão criada');
    } catch (err) {
      if (err.response?.data?.upgrade_required) {
        toast.error('Limite do plano atingido. Faça upgrade!', { duration: 5000 });
      } else {
        toast.error(err.response?.data?.error || 'Erro ao criar sessão');
      }
    } finally { setCreating(false); }
  };

  const connect = async (session) => {
    try {
      await sessionsApi.connect(session.id);
      setQrSession(session);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao conectar');
    }
  };

  const disconnect = async (session) => {
    if (!confirm(`Desconectar "${session.name}"?`)) return;
    try { await sessionsApi.disconnect(session.id); toast.success('Desconectado'); load(); }
    catch { toast.error('Erro ao desconectar'); }
  };

  const cancel = async (session) => {
    try { await sessionsApi.disconnect(session.id); load(); }
    catch { load(); }
  };

  const remove = async (session) => {
    if (!confirm(`Remover a sessão "${session.name}"? Todos os grupos gerenciados serão removidos.`)) return;
    try { await sessionsApi.remove(session.id); toast.success('Removida'); load(); }
    catch { toast.error('Erro ao remover'); }
  };

  const atLimit = planInfo && !planInfo.can_add_session;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-white">Sessões WhatsApp</h1>
        {planInfo && (
          <div className="text-right">
            <span className="badge-teal text-xs">{planInfo.plan.name}</span>
            <p className="text-xs text-gray-400 mt-0.5">
              {planInfo.session_count} / {planInfo.plan.max_sessions === -1 ? '∞' : planInfo.plan.max_sessions} sessões
            </p>
          </div>
        )}
      </div>

      {atLimit && (
        <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-yellow-300">Limite de sessões atingido</p>
            <p className="text-sm text-yellow-400/80">Faça upgrade para adicionar mais sessões.</p>
          </div>
          <Link to="/checkout" className="btn-primary text-sm whitespace-nowrap">Fazer upgrade</Link>
        </div>
      )}

      {/* Formulário de criação */}
      <form onSubmit={create} className="card flex gap-3">
        <input
          className="input flex-1"
          placeholder="Nome da nova sessão (ex: Vendas, Suporte)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          required
          disabled={atLimit}
        />
        <button type="submit" className="btn-primary" disabled={creating || atLimit}>
          {creating ? '...' : '+ Criar'}
        </button>
      </form>

      {/* Lista de sessões */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-wa-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="card text-center text-gray-400 py-10">
          <p className="text-4xl mb-3">📱</p>
          <p className="font-medium text-white">Nenhuma sessão criada ainda.</p>
          <p className="text-sm text-gray-500 mt-1">Crie uma sessão acima para começar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const st = STATUS_LABELS[s.status] || STATUS_LABELS.disconnected;
            return (
              <div key={s.id} className="card hover:shadow-md hover:border-wa-green/20 transition-all">
                {/* Linha principal */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${st.dot}`} />
                      <span className="font-semibold text-white">{s.name}</span>
                      {s.phone && (
                        <span className="text-[11px] text-gray-500 font-mono tracking-tight leading-none">
                          +{s.phone}
                        </span>
                      )}
                      <span className={`${st.cls} text-xs`}>{st.label}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap ml-4 sm:ml-0">
                    {s.status === 'disconnected' && (
                      <button onClick={() => connect(s)} className="btn-primary text-sm">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                        Conectar
                      </button>
                    )}
                    {(s.status === 'connecting' || s.status === 'qr_ready') && (
                      <button onClick={() => cancel(s)} className="btn-secondary text-sm">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                        Cancelar
                      </button>
                    )}
                    {s.status === 'connected' && (
                      <button onClick={() => disconnect(s)} className="btn-secondary text-sm">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        Pausar
                      </button>
                    )}
                    <button onClick={() => remove(s)} className="btn-danger text-sm">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      Remover
                    </button>
                  </div>
                </div>

                {/* Grupos gerenciados */}
                <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <span>📋</span>
                    <span>
                      <strong className="text-white">{s.managed_count || 0}</strong> grupo{s.managed_count !== 1 ? 's' : ''} gerenciado{s.managed_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => navigate(`/app/sessions/${s.id}/groups`)}
                    className="btn-teal text-sm"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    {s.managed_count > 0 ? 'Gerenciar grupos' : 'Adicionar grupos'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {qrSession && (
        <QRModal session={qrSession} onClose={(ok) => { setQrSession(null); if (ok) load(); }} />
      )}
    </div>
  );
}
