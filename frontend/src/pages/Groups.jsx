import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { sessionsApi, groupsApi, paymentsApi } from '../services/api';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PLAN_NAMES = ['Gratuito', 'Starter', 'Pro'];

// ── Toggle dark ───────────────────────────────────────────────────────────────
function Toggle({ value, onChange, label, desc }) {
  const on = !!value;
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="font-medium text-sm text-white">{label}</p>
        {desc && <p className="text-xs text-gray-400">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${on ? 'bg-wa-green' : 'bg-white/20'}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${on ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

function LockedToggle({ value, onChange, label, desc, minTier, currentTier }) {
  if (currentTier < minTier) {
    return (
      <div className="flex items-center justify-between gap-3 opacity-50">
        <div>
          <p className="font-medium text-sm text-gray-300">🔒 {label}</p>
          {desc && <p className="text-xs text-gray-500">{desc}</p>}
          <Link to="/checkout" className="text-xs text-wa-green font-medium hover:underline">
            Disponível no plano {PLAN_NAMES[minTier]} →
          </Link>
        </div>
        <button type="button" disabled
          className="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-white/10">
          <span className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white/60 shadow translate-x-0" />
        </button>
      </div>
    );
  }
  return <Toggle value={value} onChange={onChange} label={label} desc={desc} />;
}

// ── Separador de seção ────────────────────────────────────────────────────────
function SectionDivider({ title }) {
  return (
    <div className="border-t border-white/10 pt-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</p>
    </div>
  );
}

// ── Modal: adicionar grupo ─────────────────────────────────────────────────
function AddGroupModal({ sessionId, managedIds, limit, count, onAdd, onClose }) {
  const [waGroups, setWaGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(null);

  useEffect(() => {
    sessionsApi.getGroups(sessionId)
      .then(({ data }) => setWaGroups(data))
      .catch(() => toast.error('Erro ao carregar grupos do WhatsApp'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const filtered = waGroups.filter((g) =>
    (g.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const add = async (group) => {
    setAdding(group.id);
    try {
      await groupsApi.addToManaged(sessionId, group.id, { group_name: group.name, participants: group.participants });
      toast.success(`"${group.name}" adicionado!`);
      onAdd(group);
    } catch (err) {
      if (err.response?.data?.upgrade_required) toast.error(err.response.data.error, { duration: 5000 });
      else toast.error(err.response?.data?.error || 'Erro ao adicionar grupo');
    } finally { setAdding(null); }
  };

  const atLimit = limit !== -1 && count >= limit;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#132018] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-bold text-white text-lg">Adicionar grupo</h2>
              <p className="text-gray-400 text-xs mt-0.5">Grupos com ✓ já estão sendo gerenciados.</p>
            </div>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${atLimit ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'badge-teal'}`}>
              {count}/{limit === -1 ? '∞' : limit} grupos
            </span>
          </div>
          {atLimit && (
            <p className="text-yellow-400 text-xs mt-2">⚠️ Limite atingido. Faça upgrade para adicionar mais grupos.</p>
          )}
        </div>

        <div className="p-3 border-b border-white/10">
          <input className="input w-full" placeholder="Buscar grupo..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-wa-green border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-500 py-10 text-sm">
              {waGroups.length === 0 ? 'Nenhum grupo encontrado. Certifique-se que a sessão está conectada.' : 'Nenhum grupo corresponde à busca.'}
            </p>
          ) : (
            filtered.map((g) => {
              const isManaged = managedIds.includes(g.id);
              return (
                <div key={g.id} className={`flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0 ${isManaged ? 'bg-wa-green/5' : 'hover:bg-white/5'}`}>
                  <div className="w-9 h-9 bg-wa-teal/20 rounded-full flex items-center justify-center text-wa-green font-bold text-sm flex-shrink-0">
                    {g.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm truncate">{g.name || 'Sem nome'}</p>
                    <p className="text-xs text-gray-500">{g.participants} participantes</p>
                  </div>
                  {isManaged ? (
                    <span className="text-xs text-wa-green font-semibold flex items-center gap-1 flex-shrink-0">✓ Gerenciado</span>
                  ) : (
                    <button onClick={() => add(g)} disabled={atLimit || adding === g.id} className="btn-primary text-xs flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
                      {adding === g.id ? '...' : '+ Adicionar'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end">
          <button onClick={onClose} className="btn-secondary">Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: configurar grupo ────────────────────────────────────────────────
function GroupSettingsModal({ sessionId, group, onClose, planTier = 0 }) {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [tab, setTab] = useState('config');
  const [banPhone, setBanPhone] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [closeDuration, setCloseDuration] = useState(0);
  const [closeDurationUnit, setCloseDurationUnit] = useState('min');
  const [floodPeriodUnit, setFloodPeriodUnit] = useState('min');
  const [groupAction, setGroupAction] = useState(null);

  useEffect(() => {
    groupsApi.getSettings(sessionId, group.group_id).then(({ data }) => setCfg(data));
    groupsApi.getWarnings(sessionId, group.group_id).then(({ data }) => setWarnings(data)).catch(() => {});
    loadMembers();
  }, []);

  const loadMembers = async () => {
    setLoadingMembers(true);
    try { const { data } = await groupsApi.getMembers(sessionId, group.group_id); setMembers(data); }
    catch { toast.error('Erro ao carregar membros'); }
    finally { setLoadingMembers(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await groupsApi.updateSettings(sessionId, group.group_id, { ...cfg });
      toast.success('Configurações salvas!');
      onClose(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const toggleDay = (d) => {
    const days = cfg.lock_days.includes(d) ? cfg.lock_days.filter((x) => x !== d) : [...cfg.lock_days, d].sort();
    setCfg({ ...cfg, lock_days: days });
  };

  const remove = async (phone) => {
    if (!confirm(`Remover ${phone}?`)) return;
    try { await groupsApi.removeMember(sessionId, group.group_id, phone); toast.success('Removido'); loadMembers(); }
    catch (err) { toast.error(err.response?.data?.error || 'Erro'); }
  };

  const ban = async (phone) => {
    if (!confirm(`Banir ${phone}?`)) return;
    try { await groupsApi.banMember(sessionId, group.group_id, phone, 'manual'); toast.success('Banido'); loadMembers(); }
    catch (err) { toast.error(err.response?.data?.error || 'Erro'); }
  };

  const clearWarning = async (phone) => {
    try {
      await groupsApi.clearWarning(sessionId, group.group_id, phone);
      setWarnings((prev) => prev.filter((w) => w.phone !== phone));
      toast.success('Advertências removidas');
    } catch { toast.error('Erro ao limpar advertências'); }
  };

  const banByPhone = async (e) => {
    e.preventDefault();
    if (!banPhone.trim()) return;
    await ban(banPhone.trim());
    setBanPhone('');
  };

  const handleCloseGroup = async () => {
    if (!closeReason.trim()) { toast.error('Informe o motivo do fechamento'); return; }
    setGroupAction('closing');
    const durationMinutes = closeDuration > 0 ? closeDuration * (closeDurationUnit === 'h' ? 60 : 1) : 0;
    try {
      await groupsApi.closeGroup(sessionId, group.group_id, closeReason.trim(), durationMinutes);
      toast.success('Grupo fechado!');
      setCloseReason(''); setCloseDuration(0);
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao fechar grupo'); }
    finally { setGroupAction(null); }
  };

  const handleOpenGroup = async () => {
    setGroupAction('opening');
    try { await groupsApi.openGroup(sessionId, group.group_id); toast.success('Grupo reaberto!'); }
    catch (err) { toast.error(err.response?.data?.error || 'Erro ao reabrir grupo'); }
    finally { setGroupAction(null); }
  };

  if (!cfg) return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="w-10 h-10 border-4 border-wa-green border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const tabs = [
    { id: 'config',  label: 'Config' },
    { id: 'members', label: `Membros (${members.length})` },
    { id: 'ban',     label: 'Banir' },
  ];

  // sem w-full — cada uso declara a largura explicitamente
  const iBase = 'bg-[#1a2e25] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-wa-green/60 focus:ring-1 focus:ring-wa-green/20';
  const iFull  = `${iBase} w-full`;
  const iSm    = `${iBase} w-16 text-center`;
  const iMd    = `${iBase} w-20 text-center`;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1e16] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="p-5 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="font-bold text-white text-lg truncate">{group.group_name || 'Grupo'}</h2>
            <button
              onClick={() => navigate(`/app/analytics?session_id=${sessionId}&group_id=${encodeURIComponent(group.group_id)}`)}
              className="text-xs bg-wa-green/10 hover:bg-wa-green/20 text-wa-green border border-wa-green/20 px-2.5 py-1.5 rounded-lg font-medium transition-colors flex-shrink-0"
            >
              📊 Ver gráficos
            </button>
          </div>
          {/* Tabs */}
          <div className="flex gap-1.5 mt-3">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? 'bg-wa-green text-white shadow-sm'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">

          {/* ── Tab Config ── */}
          {tab === 'config' && (
            <div className="space-y-4">

              {/* Moderação básica */}
              <Toggle value={!!cfg.ban_links}     onChange={(v) => setCfg({ ...cfg, ban_links: v })}     label="Banir por links"     desc="Remove quem enviar URLs no grupo" />
              <Toggle value={!!cfg.ban_profanity} onChange={(v) => setCfg({ ...cfg, ban_profanity: v })} label="Banir por palavrão"   desc="Remove quem usar palavras da lista proibida" />

              <SectionDivider title="Plano Starter" />
              <LockedToggle value={!!cfg.ban_viewonce} onChange={(v) => setCfg({ ...cfg, ban_viewonce: v })} label="Bloquear visualização única"   desc="Apaga toda mensagem de visualização única"                            minTier={1} currentTier={planTier} />
              <LockedToggle value={!!cfg.ban_media}    onChange={(v) => setCfg({ ...cfg, ban_media: v })}    label="Bloquear mídias"               desc="Remove quem enviar imagens, vídeos ou figurinhas"                     minTier={1} currentTier={planTier} />
              <LockedToggle value={!!cfg.ban_nsfw}     onChange={(v) => setCfg({ ...cfg, ban_nsfw: v })}     label="Barrar mídia inapropriada"     desc="IA analisa fotos, vídeos e figurinhas e remove conteúdo impróprio"   minTier={1} currentTier={planTier} />
              <LockedToggle value={!!cfg.ai_enabled}   onChange={(v) => setCfg({ ...cfg, ai_enabled: v })}   label="Resposta com IA"               desc="IA responde mensagens direcionadas no grupo"                          minTier={1} currentTier={planTier} />

              {/* Saudação de novos membros */}
              <SectionDivider title="Saudação de novos membros" />
              <Toggle
                value={!!cfg.welcome_enabled}
                onChange={(v) => setCfg({ ...cfg, welcome_enabled: v })}
                label="Ativar saudação automática"
                desc="Envia mensagem ao grupo quando um novo membro entra"
              />
              {cfg.welcome_enabled && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">Mensagem de boas-vindas</p>
                  <textarea
                    className={`${iFull} resize-none`}
                    rows={3}
                    placeholder={'Ex: Seja bem-vindo ao {grupo}, {usuario}! 🎉\nO {usuario} será marcado automaticamente.'}
                    value={cfg.welcome_message || ''}
                    onChange={(e) => setCfg({ ...cfg, welcome_message: e.target.value })}
                  />
                  <p className="text-[11px] text-gray-500 mt-1.5 bg-white/5 rounded-lg p-2">
                    Variáveis: <code className="text-wa-green">{'{usuario}'}</code> (marcação automática) · <code className="text-wa-green">{'{grupo}'}</code> (nome do grupo)
                  </p>
                </div>
              )}

              {/* Advertências */}
              <SectionDivider title="Advertências" />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm text-white">Chances antes de remover</p>
                  <p className="text-xs text-gray-400">
                    {(cfg.warn_chances || 0) > 0 ? `Avisa ${cfg.warn_chances}x antes de remover` : 'Remoção imediata ao violar regra'}
                  </p>
                </div>
                <input
                  type="number" min="0" max="10"
                  value={cfg.warn_chances || 0}
                  onChange={(e) => setCfg({ ...cfg, warn_chances: Math.max(0, parseInt(e.target.value) || 0) })}
                  className={iSm}
                />
              </div>

              {/* Mensagens customizadas */}
              <SectionDivider title="Mensagens personalizadas" />
              <div>
                <p className="font-medium text-sm text-white mb-1.5">Mensagem de advertência</p>
                <textarea
                  className={`${iFull} resize-none`} rows={2}
                  placeholder="Deixe vazio para usar o padrão. Vars: {motivo} {grupo} {contagem} {max} {restantes} {usuario}"
                  value={cfg.msg_warn || ''}
                  onChange={(e) => setCfg({ ...cfg, msg_warn: e.target.value })}
                />
              </div>
              <div>
                <p className="font-medium text-sm text-white mb-1.5">Mensagem de remoção</p>
                <textarea
                  className={`${iFull} resize-none`} rows={2}
                  placeholder="Deixe vazio para usar o padrão. Vars: {motivo} {grupo} {contagem} {max} {usuario}"
                  value={cfg.msg_ban || ''}
                  onChange={(e) => setCfg({ ...cfg, msg_ban: e.target.value })}
                />
              </div>

              {/* Fechar / Abrir grupo */}
              <SectionDivider title="Fechar / Abrir grupo" />
              <input
                type="text" className={iFull}
                placeholder="Motivo do fechamento (obrigatório para fechar)..."
                value={closeReason} onChange={(e) => setCloseReason(e.target.value)}
              />
              <div className="flex gap-1">
                <input
                  type="number" min="0" className={`${iBase} flex-1 min-w-0`}
                  placeholder="0 = não reabrir"
                  value={closeDuration || ''}
                  onChange={(e) => setCloseDuration(Math.max(0, parseInt(e.target.value) || 0))}
                />
                <select className={`${iBase} w-20 flex-shrink-0`} value={closeDurationUnit} onChange={(e) => setCloseDurationUnit(e.target.value)}>
                  <option value="min">min</option>
                  <option value="h">h</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCloseGroup} disabled={!!groupAction} className="flex-1 bg-orange-500/20 hover:bg-orange-500/30 disabled:opacity-50 text-orange-300 border border-orange-500/30 text-sm font-semibold py-2 rounded-xl transition-colors">
                  {groupAction === 'closing' ? '...' : '🔒 Fechar'}
                </button>
                <button onClick={handleOpenGroup} disabled={!!groupAction} className="flex-1 bg-wa-green/10 hover:bg-wa-green/20 disabled:opacity-50 text-wa-green border border-wa-green/20 text-sm font-semibold py-2 rounded-xl transition-colors">
                  {groupAction === 'opening' ? '...' : '🔓 Reabrir'}
                </button>
              </div>

              {/* Anti-flood */}
              <SectionDivider title="Anti-flood" />
              <div className={planTier < 1 ? 'opacity-50 pointer-events-none' : ''}>
                {planTier < 1 && <Link to="/checkout" className="text-xs text-wa-green hover:underline block mb-2">🔒 Disponível no plano Starter →</Link>}
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-medium text-white">Limite de mensagens</p>
                    <p className="text-xs text-gray-400">0 = desativado</p>
                  </div>
                  <input type="number" min="0" className={iMd}
                    value={cfg.flood_limit ?? 0}
                    onChange={(e) => setCfg({ ...cfg, flood_limit: Math.max(0, parseInt(e.target.value) || 0) })}
                  />
                </div>
                {(cfg.flood_limit || 0) > 0 && (
                  <div className="bg-white/5 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-gray-300">Janela de tempo</p>
                      <div className="flex gap-1">
                        <input type="number" min="1" className={iSm}
                          value={floodPeriodUnit === 'h' ? Math.round((cfg.flood_period_min ?? 60) / 60) || 1 : (cfg.flood_period_min ?? 60)}
                          onChange={(e) => {
                            const v = Math.max(1, parseInt(e.target.value) || 1);
                            setCfg({ ...cfg, flood_period_min: floodPeriodUnit === 'h' ? v * 60 : v });
                          }}
                        />
                        <select className={iSm} value={floodPeriodUnit}
                          onChange={(e) => {
                            const unit = e.target.value;
                            setFloodPeriodUnit(unit);
                            if (unit === 'h') setCfg({ ...cfg, flood_period_min: Math.max(60, Math.round((cfg.flood_period_min ?? 60) / 60) * 60) });
                          }}>
                          <option value="min">min</option>
                          <option value="h">h</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-gray-300">Fechar por (min)</p>
                      <input type="number" min="1" className={iMd}
                        value={cfg.flood_close_min ?? 30}
                        onChange={(e) => setCfg({ ...cfg, flood_close_min: Math.max(1, parseInt(e.target.value) || 30) })}
                      />
                    </div>
                    <p className="text-xs text-gray-500 bg-white/5 rounded-lg p-2">
                      {cfg.flood_limit} msgs em {floodPeriodUnit === 'h' ? `${Math.round((cfg.flood_period_min ?? 60) / 60)}h` : `${cfg.flood_period_min ?? 60}min`} → fecha por {cfg.flood_close_min ?? 30}min
                    </p>
                  </div>
                )}
              </div>

              {/* Bloqueio por horário */}
              <SectionDivider title="Bloqueio por horário" />
              <LockedToggle value={!!cfg.lock_enabled} onChange={(v) => setCfg({ ...cfg, lock_enabled: v })} label="Ativar bloqueio por horário" desc="Fora do horário, só admins enviam" minTier={1} currentTier={planTier} />
              {cfg.lock_enabled && planTier >= 1 && (
                <div className="bg-white/5 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Bloquear às</label>
                      <input type="time" className={iFull} value={cfg.lock_start || ''} onChange={(e) => setCfg({ ...cfg, lock_start: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Liberar às</label>
                      <input type="time" className={iFull} value={cfg.lock_end || ''} onChange={(e) => setCfg({ ...cfg, lock_end: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">Dias da semana</label>
                    <div className="flex gap-1 flex-wrap">
                      {DAYS.map((d, i) => (
                        <button key={i} type="button" onClick={() => toggleDay(i)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${cfg.lock_days.includes(i) ? 'bg-wa-green text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Motivo (opcional)</label>
                    <input type="text" className={iFull} placeholder="Ex: Horário de silêncio"
                      value={cfg.lock_reason || ''} onChange={(e) => setCfg({ ...cfg, lock_reason: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tab Membros ── */}
          {tab === 'members' && (
            <div className="space-y-1">
              {loadingMembers ? (
                <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-wa-green border-t-transparent rounded-full animate-spin" /></div>
              ) : members.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Sem membros</p>
              ) : (
                members.map((m) => {
                  const warn = warnings.find((w) => w.phone === m.id);
                  const maxChances = cfg?.warn_chances || 0;
                  return (
                    <div key={m.id} className="flex items-center justify-between py-2.5 border-b border-white/10 last:border-0 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-sm flex-shrink-0">
                          {m.isAdmin ? '👑' : '👤'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{m.name || m.phone}</p>
                          <p className="text-xs text-gray-500">{m.phone}</p>
                        </div>
                      </div>
                      {!m.isAdmin ? (
                        <div className="flex gap-1 flex-shrink-0 items-center">
                          {warn && (
                            <button onClick={() => clearWarning(m.id)} title="Limpar advertências"
                              className="text-xs bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 font-semibold px-2 py-1.5 rounded-lg transition-colors">
                              ⚠️ {warn.count}{maxChances > 0 ? `/${maxChances}` : ''}
                            </button>
                          )}
                          <button onClick={() => remove(m.id)} className="text-xs bg-white/10 hover:bg-white/20 text-gray-300 px-2.5 py-1.5 rounded-lg transition-colors">Remover</button>
                          <button onClick={() => ban(m.id)} className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-2.5 py-1.5 rounded-lg transition-colors">Banir</button>
                        </div>
                      ) : (
                        <span className="badge-teal text-xs flex-shrink-0">Admin</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Tab Banir ── */}
          {tab === 'ban' && (
            <div className="space-y-4">
              <form onSubmit={banByPhone} className="flex gap-2">
                <input className="input flex-1" placeholder="5511999999999" value={banPhone} onChange={(e) => setBanPhone(e.target.value.replace(/\D/g, ''))} />
                <button type="submit" className="btn-danger">Banir</button>
              </form>
              <p className="text-xs text-gray-500 bg-white/5 rounded-xl p-3">
                Número com código do país, sem + ou espaços.<br />
                Ex: <code className="text-wa-green bg-wa-green/10 px-1 rounded">5511999999999</code>
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex justify-end gap-2 flex-shrink-0">
          <button onClick={() => onClose(false)} className="btn-secondary">Fechar</button>
          {tab === 'config' && (
            <button onClick={save} className="btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : '✓ Salvar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal: configurações em lote ─────────────────────────────────────────
function BulkSettingsModal({ sessionId, groups, onClose, planTier = 0 }) {
  const [settings, setSettings] = useState({
    ban_links: null, ban_profanity: null, ai_enabled: null,
    lock_enabled: null, lock_start: '', lock_end: '', lock_days: [0,1,2,3,4,5,6],
    warn_chances: undefined,
  });
  const [saving, setSaving] = useState(false);

  const TriToggle = ({ field, label, desc }) => {
    const val = settings[field];
    return (
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-sm text-white">{label}</p>
          {desc && <p className="text-xs text-gray-400">{desc}</p>}
        </div>
        <div className="flex gap-1">
          {[{ v: true, l: 'Sim' }, { v: null, l: '—' }, { v: false, l: 'Não' }].map(({ v, l }) => (
            <button key={l} type="button" onClick={() => setSettings({ ...settings, [field]: v })}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                val === v
                  ? (v === true ? 'bg-wa-green text-white' : v === false ? 'bg-red-500 text-white' : 'bg-white/30 text-white')
                  : 'bg-white/10 text-gray-400 hover:bg-white/20'
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const apply = async () => {
    setSaving(true);
    try {
      const payload = {};
      if (settings.ban_links     !== null) payload.ban_links     = settings.ban_links;
      if (settings.ban_profanity !== null) payload.ban_profanity = settings.ban_profanity;
      if (settings.ai_enabled    !== null) payload.ai_enabled    = settings.ai_enabled;
      if (settings.lock_enabled  !== null) {
        payload.lock_enabled = settings.lock_enabled;
        if (settings.lock_start) payload.lock_start = settings.lock_start;
        if (settings.lock_end)   payload.lock_end   = settings.lock_end;
        payload.lock_days = settings.lock_days;
      }
      if (settings.warn_chances !== undefined) payload.warn_chances = Math.max(0, parseInt(settings.warn_chances) || 0);
      const { data } = await groupsApi.bulkUpdate({ session_id: sessionId, group_ids: groups.map((g) => g.group_id), settings: payload });
      toast.success(`Configurações aplicadas em ${data.updated} grupos!`);
      onClose(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao aplicar');
    } finally { setSaving(false); }
  };

  const toggleDay = (d) => {
    const days = settings.lock_days.includes(d) ? settings.lock_days.filter((x) => x !== d) : [...settings.lock_days, d].sort();
    setSettings({ ...settings, lock_days: days });
  };

  const iBase = 'bg-[#1a2e25] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-wa-green/60';
  const iFull = `${iBase} w-full`;
  const iSm   = `${iBase} w-16 text-center`;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1e16] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-white/10">
          <h2 className="font-bold text-white text-lg">Configurar {groups.length} grupos</h2>
          <p className="text-gray-400 text-xs mt-1">Use "—" para não alterar, "Sim" para ativar, "Não" para desativar.</p>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div className="bg-white/5 rounded-xl p-3 text-xs text-gray-400">
            <strong className="text-gray-300">Grupos:</strong> {groups.map((g) => g.group_name || 'Sem nome').join(', ')}
          </div>
          <TriToggle field="ban_links"     label="Banir por links"      desc="Remove quem enviar URLs" />
          <TriToggle field="ban_profanity" label="Banir por palavrão"   desc="Remove quem usar palavras proibidas" />
          {planTier >= 1
            ? <TriToggle field="lock_enabled" label="Bloqueio por horário" desc="Só admins falam fora do horário" />
            : <div className="flex items-center justify-between gap-3 opacity-50">
                <div>
                  <p className="font-medium text-sm text-gray-300">🔒 Bloqueio por horário</p>
                  <Link to="/checkout" className="text-xs text-wa-green hover:underline">Disponível no plano Starter →</Link>
                </div>
              </div>
          }
          {planTier >= 1
            ? <TriToggle field="ai_enabled" label="🤖 Resposta com IA" desc="IA responde mensagens no grupo" />
            : <div className="flex items-center justify-between gap-3 opacity-50">
                <div>
                  <p className="font-medium text-sm text-gray-300">🔒 Resposta com IA</p>
                  <Link to="/checkout" className="text-xs text-wa-green hover:underline">Disponível no plano Starter →</Link>
                </div>
              </div>
          }
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
            <div>
              <p className="font-medium text-sm text-white">Chances antes de remover</p>
              <p className="text-xs text-gray-400">Deixe em branco para não alterar</p>
            </div>
            <input type="number" min="0" max="10" placeholder="—"
              value={settings.warn_chances ?? ''}
              onChange={(e) => setSettings({ ...settings, warn_chances: e.target.value === '' ? undefined : parseInt(e.target.value) || 0 })}
              className={iSm}
            />
          </div>
          {settings.lock_enabled === true && (
            <div className="bg-white/5 rounded-xl p-4 space-y-3 border border-white/10">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Bloquear às</label>
                  <input type="time" className={iFull} value={settings.lock_start} onChange={(e) => setSettings({ ...settings, lock_start: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Liberar às</label>
                  <input type="time" className={iFull} value={settings.lock_end} onChange={(e) => setSettings({ ...settings, lock_end: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-1 flex-wrap">
                {DAYS.map((d, i) => (
                  <button key={i} type="button" onClick={() => toggleDay(i)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${settings.lock_days.includes(i) ? 'bg-wa-green text-white' : 'bg-white/10 text-gray-300'}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
          <button onClick={() => onClose(false)} className="btn-secondary">Cancelar</button>
          <button onClick={apply} className="btn-primary" disabled={saving}>
            {saving ? 'Aplicando...' : `✓ Aplicar aos ${groups.length} grupos`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────
const TIER_MAP = { free: 0, starter: 1, pro: 2 };

export default function Groups() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [managed, setManaged] = useState([]);
  const [limit, setLimit] = useState(2);
  const [planTier, setPlanTier] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [configGroup, setConfigGroup] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [bulkModal, setBulkModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await groupsApi.getManagedGroups(sessionId);
      setManaged(data.groups);
      setLimit(data.limit);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao carregar grupos');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    paymentsApi.currentPlan()
      .then(({ data }) => setPlanTier(TIER_MAP[data.plan?.slug] ?? 0))
      .catch(() => {});
  }, [sessionId]);

  const removeGroup = async (group) => {
    if (!confirm(`Remover "${group.group_name}" da lista gerenciada?`)) return;
    try {
      await groupsApi.removeFromManaged(sessionId, group.group_id);
      toast.success('Grupo removido da gestão');
      setManaged((prev) => prev.filter((g) => g.group_id !== group.group_id));
      setSelectedIds((prev) => prev.filter((id) => id !== group.group_id));
    } catch { toast.error('Erro ao remover grupo'); }
  };

  const filtered = managed.filter((g) => (g.group_name || '').toLowerCase().includes(search.toLowerCase()));
  const toggleSelect = (id) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleAll = () => setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map((g) => g.group_id));
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds([]); };
  const selectedGroups = managed.filter((g) => selectedIds.includes(g.group_id));
  const atLimit = limit !== -1 && managed.length >= limit;

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-24">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/app/sessions')} className="btn-secondary text-sm">← Sessões</button>
        <h1 className="text-2xl font-bold text-white">Grupos Gerenciados</h1>
      </div>

      {/* Info do plano + ações */}
      <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="font-medium text-white">
            <span className={`text-lg font-bold ${atLimit ? 'text-red-400' : 'text-wa-green'}`}>
              {managed.length}
            </span>
            <span className="text-gray-400 font-normal">
              {' '}/ {limit === -1 ? '∞' : limit} grupos
            </span>
          </p>
          {atLimit && (
            <p className="text-xs text-red-400 mt-0.5">
              Limite atingido — <Link to="/checkout" className="underline font-medium hover:text-red-300">faça upgrade</Link> para mais.
            </p>
          )}
          {!atLimit && limit !== -1 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {limit - managed.length} vaga{limit - managed.length !== 1 ? 's' : ''} disponível{limit - managed.length !== 1 ? 'is' : ''}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {!selectMode && (
            <button onClick={() => setShowAdd(true)} disabled={atLimit} className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              + Adicionar grupo
            </button>
          )}
          {managed.length > 1 && (
            <button
              onClick={() => { setSelectMode(!selectMode); setSelectedIds([]); }}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${selectMode ? 'bg-wa-green text-white' : 'btn-outline'}`}
            >
              {selectMode ? '✓ Selecionando' : '☑ Selecionar vários'}
            </button>
          )}
          <button onClick={load} className="btn-outline text-sm">↻</button>
        </div>
      </div>

      {/* Busca */}
      {managed.length > 3 && (
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Buscar grupo gerenciado..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {selectMode && filtered.length > 0 && (
            <button onClick={toggleAll} className="btn-secondary text-sm whitespace-nowrap">
              {selectedIds.length === filtered.length ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          )}
        </div>
      )}

      {/* Lista de grupos */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-wa-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center text-gray-400 py-10">
          <p className="text-4xl mb-3">📋</p>
          {managed.length === 0 ? (
            <>
              <p className="font-medium text-white">Nenhum grupo gerenciado ainda.</p>
              <p className="text-sm text-gray-500 mt-1 mb-4">Adicione grupos para ativar as proteções automáticas.</p>
              <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">+ Adicionar primeiro grupo</button>
            </>
          ) : (
            <p className="text-gray-500">Nenhum grupo corresponde à busca.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((g) => {
            const isChecked = selectedIds.includes(g.group_id);
            const flags = [
              g.ban_links     && 'Links',
              g.ban_profanity && 'Palavrão',
              g.ai_enabled    && 'IA',
              g.lock_enabled  && 'Horário',
              g.welcome_enabled && 'Saudação',
            ].filter(Boolean);

            return (
              <div key={g.group_id}
                className={`card flex items-center gap-3 hover:shadow-md hover:border-wa-green/20 transition-all ${isChecked ? 'ring-2 ring-wa-green bg-wa-green/5' : ''}`}
              >
                {selectMode && (
                  <button onClick={() => toggleSelect(g.group_id)}
                    className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${isChecked ? 'bg-wa-green border-wa-green text-white' : 'border-gray-600 hover:border-wa-green'}`}>
                    {isChecked && <span className="text-xs leading-none">✓</span>}
                  </button>
                )}

                <div className="w-10 h-10 bg-wa-teal/20 rounded-full flex items-center justify-center text-wa-green font-bold flex-shrink-0">
                  {(g.group_name || '?')[0].toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{g.group_name || 'Sem nome'}</p>
                  {flags.length > 0 ? (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {flags.map((f) => (
                        <span key={f} className="text-[10px] bg-wa-green/10 text-wa-green border border-wa-green/20 px-1.5 py-0.5 rounded-full font-medium">{f}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-0.5">Sem proteções ativas</p>
                  )}
                </div>

                {!selectMode && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => setConfigGroup(g)} className="btn-teal text-sm">⚙️ Config</button>
                    <button onClick={() => removeGroup(g)}
                      className="text-sm px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                      title="Remover da gestão">
                      ✕
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Barra flutuante */}
      {selectMode && selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-[#0f1e16] border border-wa-green/20 text-white px-5 py-3 rounded-2xl shadow-2xl shadow-wa-teal/20">
          <span className="font-semibold text-sm text-white">
            {selectedIds.length} grupo{selectedIds.length > 1 ? 's' : ''} selecionado{selectedIds.length > 1 ? 's' : ''}
          </span>
          <button onClick={() => setBulkModal(true)} className="bg-wa-green hover:bg-green-400 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors">
            ⚙️ Configurar todos
          </button>
          <button onClick={exitSelectMode} className="text-gray-400 hover:text-white text-sm">✕</button>
        </div>
      )}

      {/* Modais */}
      {showAdd && (
        <AddGroupModal
          sessionId={sessionId}
          managedIds={managed.map((g) => g.group_id)}
          limit={limit} count={managed.length}
          onAdd={(group) => {
            setManaged((prev) => {
              if (prev.find((g) => g.group_id === group.id)) return prev;
              return [...prev, { group_id: group.id, group_name: group.name, ban_links: 0, ban_profanity: 0, ai_enabled: 0, lock_enabled: 0, welcome_enabled: 0, is_managed: 1 }];
            });
          }}
          onClose={() => { setShowAdd(false); load(); }}
        />
      )}

      {configGroup && (
        <GroupSettingsModal
          sessionId={sessionId} group={configGroup} planTier={planTier}
          onClose={(changed) => { setConfigGroup(null); if (changed) load(); }}
        />
      )}

      {bulkModal && (
        <BulkSettingsModal
          sessionId={sessionId} groups={selectedGroups} planTier={planTier}
          onClose={(changed) => { setBulkModal(false); if (changed) { exitSelectMode(); load(); } }}
        />
      )}
    </div>
  );
}
