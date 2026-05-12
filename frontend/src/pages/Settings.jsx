import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { settingsApi, groupsApi } from '../services/api';

function ProfanityTab() {
  const [words, setWords] = useState([]);
  const [input, setInput] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [showBulk, setShowBulk] = useState(false);

  const load = async () => {
    const { data } = await settingsApi.getProfanity();
    setWords(data);
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    try {
      await settingsApi.addProfanity(input.trim());
      setInput('');
      toast.success('Palavra adicionada');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro');
    }
  };

  const addBulk = async (e) => {
    e.preventDefault();
    const list = bulkInput.split(/[\n,;]+/).map((w) => w.trim()).filter(Boolean);
    if (!list.length) return;
    try {
      await settingsApi.addProfanityBulk(list);
      setBulkInput('');
      setShowBulk(false);
      toast.success(`${list.length} palavras adicionadas`);
      load();
    } catch {
      toast.error('Erro ao adicionar');
    }
  };

  const remove = async (id) => {
    await settingsApi.deleteProfanity(id);
    toast.success('Removida');
    load();
  };

  const clearAll = async () => {
    if (!confirm('Remover TODAS as palavras proibidas?')) return;
    await settingsApi.clearProfanity();
    toast.success('Lista limpa');
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-base text-white">Palavras Proibidas ({words.length})</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowBulk(!showBulk)} className="btn-outline text-sm">
            {showBulk ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                Cancelar
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                Adicionar em massa
              </>
            )}
          </button>
          {words.length > 0 && (
            <button onClick={clearAll} className="btn-danger text-sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              Limpar tudo
            </button>
          )}
        </div>
      </div>

      {showBulk ? (
        <form onSubmit={addBulk} className="space-y-2">
          <textarea
            className="input min-h-24 text-sm"
            placeholder="Uma palavra por linha (ou separadas por vírgula)"
            value={bulkInput}
            onChange={(e) => setBulkInput(e.target.value)}
          />
          <button type="submit" className="btn-primary w-full">Adicionar em massa</button>
        </form>
      ) : (
        <form onSubmit={add} className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Digite uma palavra proibida"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="btn-primary">Adicionar</button>
        </form>
      )}

      <div className="flex flex-wrap gap-2 max-h-60 overflow-auto">
        {words.map((w) => (
          <span
            key={w.id}
            className="inline-flex items-center gap-1 px-3 py-1 bg-red-900/40 border border-red-500/30 text-red-300 rounded-full text-sm"
          >
            {w.word}
            <button
              onClick={() => remove(w.id)}
              className="text-red-400 hover:text-red-200 font-bold ml-1"
            >
              ×
            </button>
          </span>
        ))}
        {words.length === 0 && (
          <p className="text-gray-500 text-sm">Nenhuma palavra cadastrada.</p>
        )}
      </div>
    </div>
  );
}

function CommandsTab() {
  const [commands, setCommands] = useState([]);
  const [form, setForm] = useState({ trigger_word: '', action: 'remove', description: '' });
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const { data } = await settingsApi.getCommands();
    setCommands(data);
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await settingsApi.updateCommand(editing.id, form);
        toast.success('Comando atualizado');
      } else {
        await settingsApi.createCommand(form);
        toast.success('Comando criado');
      }
      setForm({ trigger_word: '', action: 'remove', description: '' });
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro');
    }
  };

  const startEdit = (cmd) => {
    setEditing(cmd);
    setForm({ trigger_word: cmd.trigger_word, action: cmd.action, description: cmd.description || '' });
  };

  const remove = async (id) => {
    await settingsApi.deleteCommand(id);
    toast.success('Comando removido');
    load();
  };

  const ACTION_LABELS = { remove: '🚪 Remover', ban: '⛔ Banir', promote: '⬆️ Promover a admin', demote: '⬇️ Despromover admin' };

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-base text-white">Comandos de Texto</h2>
      <p className="text-sm text-gray-400">
        Admins podem usar esses comandos no WhatsApp marcando a pessoa com @. Ex: <code className="bg-white/10 px-1 rounded text-gray-200">rm @pessoa</code>
      </p>

      <form onSubmit={save} className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
        <h3 className="font-medium text-sm text-white">{editing ? 'Editar Comando' : 'Novo Comando'}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Palavra-chave</label>
            <input
              className="input text-sm"
              placeholder="Ex: rm, ban, kick"
              value={form.trigger_word}
              onChange={(e) => setForm({ ...form, trigger_word: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Ação</label>
            <select
              className="input text-sm"
              value={form.action}
              onChange={(e) => setForm({ ...form, action: e.target.value })}
            >
              <option value="remove">🚪 Remover do grupo</option>
              <option value="ban">⛔ Banir (remover + bloquear)</option>
              <option value="promote">⬆️ Promover a administrador</option>
              <option value="demote">⬇️ Despromover administrador</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Descrição (opcional)</label>
            <input
              className="input text-sm"
              placeholder="Para que serve?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary text-sm">
            {editing ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                Salvar alterações
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                Criar comando
              </>
            )}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => { setEditing(null); setForm({ trigger_word: '', action: 'remove', description: '' }); }}
              className="btn-secondary text-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="space-y-2">
        {commands.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhum comando cadastrado.</p>
        ) : (
          commands.map((cmd) => (
            <div key={cmd.id} className="card flex items-center justify-between gap-3">
              <div>
                <code className="font-mono font-bold text-wa-green bg-wa-green/10 px-2 py-0.5 rounded">
                  {cmd.trigger_word}
                </code>
                <span className="ml-2 text-sm text-gray-300">{ACTION_LABELS[cmd.action]}</span>
                {cmd.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{cmd.description}</p>
                )}
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(cmd)} className="btn-outline text-xs px-2 py-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  Editar
                </button>
                <button onClick={() => remove(cmd.id)} className="btn-danger text-xs px-2 py-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  Remover
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BansTab() {
  const [bans, setBans] = useState([]);

  const load = async () => {
    const { data } = await groupsApi.getBans();
    setBans(data);
  };
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    await groupsApi.deleteBan(id);
    toast.success('Ban removido');
    load();
  };

  const REASON_LABELS = {
    link: '🔗 Link',
    palavrão: '🤬 Palavrão',
    manual: '👤 Manual',
    'comando adm': '🛡️ Comando',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-base text-white">Histórico de Bans ({bans.length})</h2>
        <button onClick={load} className="btn-outline text-sm">Atualizar</button>
      </div>
      {bans.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhum ban registrado.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-auto">
          {bans.map((b) => (
            <div key={b.id} className="card flex items-center justify-between gap-3 py-3">
              <div>
                <p className="font-mono text-sm text-white">{b.phone}</p>
                <p className="text-xs text-gray-500">
                  {REASON_LABELS[b.reason] || b.reason} · {new Date(b.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
              <button onClick={() => remove(b.id)} className="btn-danger text-xs px-2 py-1">
                Remover ban
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('profanity');

  const tabs = [
    { id: 'profanity', label: '🚫 Palavrões' },
    { id: 'commands', label: '⌨️ Comandos' },
    { id: 'bans', label: '⛔ Bans' },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-white">Configurações</h1>

      <div className="flex gap-2 border-b border-white/10 pb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-wa-green text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/15 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        {tab === 'profanity' && <ProfanityTab />}
        {tab === 'commands' && <CommandsTab />}
        {tab === 'bans' && <BansTab />}
      </div>
    </div>
  );
}
