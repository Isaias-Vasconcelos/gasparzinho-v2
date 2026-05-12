import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { aiApi } from '../services/api';

const PROVIDERS = {
  claude: {
    label: 'Claude',
    company: 'Anthropic',
    icon: '🟠',
    keyLabel: 'API Key da Anthropic',
    keyPlaceholder: 'sk-ant-...',
    keyLink: 'https://console.anthropic.com',
    defaultModel: 'claude-haiku-4-5-20251001',
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku (rápido e econômico)' },
      { id: 'claude-sonnet-4-6',         label: 'Sonnet (equilibrado)' },
      { id: 'claude-opus-4-7',           label: 'Opus (mais avançado)' },
    ],
  },
  openai: {
    label: 'ChatGPT',
    company: 'OpenAI',
    icon: '🟢',
    keyLabel: 'API Key da OpenAI',
    keyPlaceholder: 'sk-...',
    keyLink: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini',   label: 'GPT-4o Mini (rápido e econômico)' },
      { id: 'gpt-4o',        label: 'GPT-4o (equilibrado)' },
      { id: 'gpt-4-turbo',   label: 'GPT-4 Turbo (avançado)' },
    ],
  },
  gemini: {
    label: 'Gemini',
    company: 'Google',
    icon: '🔵',
    keyLabel: 'API Key do Google AI Studio',
    keyPlaceholder: 'AIza...',
    keyLink: 'https://aistudio.google.com/app/apikey',
    defaultModel: 'gemini-1.5-flash',
    models: [
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (rápido)' },
      { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro (equilibrado)' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (mais recente)' },
    ],
  },
  grok: {
    label: 'Grok',
    company: 'xAI',
    icon: '⚫',
    keyLabel: 'API Key da xAI',
    keyPlaceholder: 'xai-...',
    keyLink: 'https://console.x.ai',
    defaultModel: 'grok-beta',
    models: [
      { id: 'grok-beta', label: 'Grok Beta' },
      { id: 'grok-2',    label: 'Grok 2' },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    company: 'DeepSeek',
    icon: '🐋',
    keyLabel: 'API Key do DeepSeek',
    keyPlaceholder: 'sk-...',
    keyLink: 'https://platform.deepseek.com/api_keys',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat',     label: 'DeepSeek Chat (econômico)' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (avançado)' },
    ],
  },
};

export default function AIConfig() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [testReply, setTestReply] = useState('');
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [newKey, setNewKey] = useState('');

  const load = async () => {
    try {
      const { data } = await aiApi.getConfig();
      setConfig(data);
    } catch { toast.error('Erro ao carregar configuração'); }
  };

  useEffect(() => { load(); }, []);

  const providerKey = config?.provider || 'claude';
  const provider = PROVIDERS[providerKey] || PROVIDERS.claude;
  const models = provider.models;

  const changeProvider = (p) => {
    setConfig({ ...config, provider: p, model: PROVIDERS[p].defaultModel });
    setNewKey('');
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...config };
      if (newKey) payload.api_key = newKey;
      else delete payload.api_key;
      await aiApi.saveConfig(payload);
      setNewKey('');
      toast.success('Configuração salva!');
      load();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const runTest = async (e) => {
    e.preventDefault();
    if (!testMsg.trim()) return;
    setTesting(true);
    setTestReply('');
    try {
      const { data } = await aiApi.test(testMsg);
      setTestReply(data.reply);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro no teste');
    } finally { setTesting(false); }
  };

  if (!config) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-wa-green border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-white">🤖 Resposta com IA</h1>
        <span className="badge-teal text-xs">Somente Admin</span>
      </div>

      <div className="bg-wa-green/10 border border-wa-green/20 rounded-xl p-4 text-sm text-green-300">
        <strong className="text-green-200">Como funciona:</strong> Escolha um provedor de IA, informe a chave da API e
        ative a IA nos grupos desejados (Sessões → Grupos → Gerenciar). Configure um
        gatilho (ex: <code className="bg-white/10 px-1 rounded font-mono text-green-200">!ia</code>) ou
        deixe responder todas as mensagens.
      </div>

      <form onSubmit={save} className="card space-y-5">
        {/* On/Off */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <p className="font-semibold text-white">Ativar IA no WhatsApp</p>
            <p className="text-xs text-gray-400">Habilita respostas automáticas nos grupos configurados</p>
          </div>
          <button
            type="button"
            onClick={() => setConfig({ ...config, enabled: !config.enabled })}
            className={`relative w-14 h-7 rounded-full transition-colors ${config.enabled ? 'bg-wa-green' : 'bg-white/20'}`}
          >
            <span className={`absolute top-1.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${config.enabled ? 'translate-x-8' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Provedor */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Provedor de IA</label>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(PROVIDERS).map(([key, p]) => (
              <button
                key={key}
                type="button"
                onClick={() => changeProvider(key)}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-colors text-center ${
                  providerKey === key
                    ? 'border-wa-green bg-wa-green/10'
                    : 'border-white/10 hover:border-white/25 bg-white/5'
                }`}
              >
                <span className="text-xl">{p.icon}</span>
                <span className="text-xs font-medium leading-tight text-white">{p.label}</span>
                <span className="text-[10px] text-gray-500">{p.company}</span>
              </button>
            ))}
          </div>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            {provider.keyLabel}
          </label>
          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono text-sm"
              type={showKey ? 'text' : 'password'}
              placeholder={config.api_key ? config.api_key : provider.keyPlaceholder}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
            <button type="button" onClick={() => setShowKey(!showKey)} className="btn-outline text-sm px-3">
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {config.api_key && !newKey
              ? <>Chave atual: <code className="font-mono text-gray-400">{config.api_key}</code> · Deixe em branco para manter · </>
              : null}
            Obtenha sua chave em{' '}
            <a href={provider.keyLink} target="_blank" rel="noopener noreferrer" className="underline text-wa-green hover:text-green-300">
              {provider.keyLink.replace('https://', '')}
            </a>
          </p>
        </div>

        {/* Modelo */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Modelo</label>
          <select
            className="input"
            value={config.model || provider.defaultModel}
            onChange={(e) => setConfig({ ...config, model: e.target.value })}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Prompt do sistema */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Prompt do sistema <span className="text-gray-500 font-normal">(personalidade da IA)</span>
          </label>
          <textarea
            className="input min-h-28 text-sm leading-relaxed"
            placeholder="Ex: Você é um assistente amigável do grupo. Responda de forma breve e clara em português."
            value={config.system_prompt || ''}
            onChange={(e) => setConfig({ ...config, system_prompt: e.target.value })}
          />
        </div>

        {/* Modo de gatilho */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Modo de ativação</label>
          <div className="flex gap-3">
            {[
              { v: 'keyword', label: '🔑 Por palavra-chave', desc: 'Responde só quando a mensagem começar com o gatilho' },
              { v: 'all',     label: '📨 Todas as mensagens', desc: 'Responde todas as mensagens do grupo' },
            ].map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setConfig({ ...config, trigger_mode: opt.v })}
                className={`flex-1 text-left p-3 rounded-xl border-2 transition-colors ${
                  config.trigger_mode === opt.v
                    ? 'border-wa-green bg-wa-green/10'
                    : 'border-white/10 hover:border-white/25 bg-white/5'
                }`}
              >
                <p className="font-medium text-sm text-white">{opt.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Palavra-chave */}
        {config.trigger_mode === 'keyword' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Palavra-chave (gatilho)</label>
            <input
              className="input font-mono"
              placeholder="!ia"
              value={config.trigger_keyword || ''}
              onChange={(e) => setConfig({ ...config, trigger_keyword: e.target.value })}
            />
            <p className="text-xs text-gray-500 mt-1">
              Ex: <code className="bg-white/10 px-1 rounded text-gray-300">!ia como funciona o grupo?</code>
            </p>
          </div>
        )}

        <div className="pt-2 border-t border-white/10">
          <button type="submit" className="btn-primary w-full py-2.5" disabled={saving}>
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                Salvando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                Salvar configurações
              </>
            )}
          </button>
        </div>
      </form>

      {/* Teste */}
      <div className="card space-y-4">
        <h2 className="font-bold text-white">🧪 Testar IA</h2>
        <p className="text-sm text-gray-400">
          Envia uma mensagem de teste para ver como a IA responde (usa as configurações salvas).
        </p>
        <form onSubmit={runTest} className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Digite uma mensagem de teste..."
            value={testMsg}
            onChange={(e) => setTestMsg(e.target.value)}
          />
          <button type="submit" className="btn-teal" disabled={testing}>
            {testing ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Testar
              </>
            )}
          </button>
        </form>
        {testReply && (
          <div className="bg-wa-green/10 border border-wa-green/20 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1 font-medium">
              Resposta da IA ({provider.label}):
            </p>
            <p className="text-sm text-gray-200 whitespace-pre-wrap">{testReply}</p>
          </div>
        )}
      </div>

      <div className="card bg-yellow-900/20 border border-yellow-500/20 text-sm text-yellow-300 space-y-1">
        <p className="font-semibold text-yellow-200">⚠️ Atenção</p>
        <p>Para ativar a IA em um grupo específico, vá em <strong>Sessões → Grupos → Gerenciar</strong> e ative a opção "Resposta com IA".</p>
        <p>A IA só responde em grupos onde a opção estiver habilitada.</p>
      </div>
    </div>
  );
}
