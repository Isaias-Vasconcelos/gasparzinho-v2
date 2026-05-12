import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { groupsApi } from '../services/api';

const PERIOD_OPTIONS = [
  { value: 'month', label: 'Por mês (12 meses)' },
  { value: 'week',  label: 'Por semana (8 semanas)' },
  { value: 'year',  label: 'Por ano (5 anos)' },
];

const REASON_COLORS = [
  '#25D366', '#128C7E', '#075E54', '#34D399', '#6EE7B7',
  '#10B981', '#059669', '#047857', '#065F46',
];

function BarChart({ data, valueKey = 'count', labelKey = 'period', height = 160 }) {
  if (!data?.length) return <p className="text-gray-500 text-sm text-center py-6">Sem dados</p>;
  const max = Math.max(...data.map((d) => d[valueKey])) || 1;

  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-2" style={{ height }}>
      {data.map((d, i) => {
        const pct = (d[valueKey] / max) * 100;
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-[28px]" title={`${d[labelKey]}: ${d[valueKey]}`}>
            <span className="text-[10px] text-gray-400 font-mono">{d[valueKey]}</span>
            <div
              className="w-full rounded-t-md bg-wa-green/80 hover:bg-wa-green transition-all duration-300"
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
            <span className="text-[9px] text-gray-500 text-center leading-tight w-full truncate">
              {String(d[labelKey]).replace(/^\d{4}-/, '')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ReasonChart({ data }) {
  if (!data?.length) return <p className="text-gray-500 text-sm text-center py-6">Sem dados</p>;
  const total = data.reduce((s, d) => s + d.count, 0) || 1;

  return (
    <div className="space-y-2.5">
      {data.map((d, i) => {
        const pct = Math.round((d.count / total) * 100);
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-24 text-xs text-gray-300 truncate flex-shrink-0">{d.reason}</div>
            <div className="flex-1 h-5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: REASON_COLORS[i % REASON_COLORS.length] }}
              />
            </div>
            <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">
              {d.count} ({pct}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Analytics() {
  const [searchParams] = useSearchParams();
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(() => {
    const s = searchParams.get('session_id');
    const g = searchParams.get('group_id');
    return s && g ? `${s}|||${g}` : '';
  });

  const load = async () => {
    setLoading(true);
    try {
      const params = { period };
      if (selectedGroup) {
        const [session_id, group_id] = selectedGroup.split('|||');
        params.session_id = session_id;
        params.group_id = group_id;
      }
      const { data: res } = await groupsApi.getAnalytics(params);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    groupsApi.getAllManaged()
      .then(({ data }) => setGroups(data))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [period, selectedGroup]);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-white">Gráficos de Remoções</h1>

      {/* Filtros */}
      <div className="card flex flex-wrap gap-3 items-center">
        <div className="flex gap-2 flex-wrap">
          {PERIOD_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setPeriod(o.value)}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                period === o.value ? 'bg-wa-green text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <select
          className="input text-sm flex-1 min-w-[180px]"
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
        >
          <option value="">Todos os grupos</option>
          {groups.map((g) => (
            <option key={`${g.session_id}|||${g.group_id}`} value={`${g.session_id}|||${g.group_id}`}>
              {g.session_name} › {g.group_name || 'Sem nome'}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-wa-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Total */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card border-l-4 border-red-400 flex flex-col">
              <span className="text-3xl mb-1">🚫</span>
              <span className="text-3xl font-extrabold text-white">{data?.total ?? 0}</span>
              <span className="text-xs text-gray-400 mt-1">Total de remoções</span>
            </div>
            <div className="card border-l-4 border-wa-green flex flex-col">
              <span className="text-3xl mb-1">📊</span>
              <span className="text-3xl font-extrabold text-white">{data?.by_period?.length ?? 0}</span>
              <span className="text-xs text-gray-400 mt-1">Períodos com dados</span>
            </div>
            <div className="card border-l-4 border-yellow-400 flex flex-col">
              <span className="text-3xl mb-1">⚠️</span>
              <span className="text-3xl font-extrabold text-white">{data?.by_reason?.length ?? 0}</span>
              <span className="text-xs text-gray-400 mt-1">Motivos distintos</span>
            </div>
          </div>

          {/* Gráfico por período */}
          <div className="card">
            <h2 className="font-bold text-white mb-4">
              Remoções {period === 'month' ? 'por mês' : period === 'week' ? 'por semana' : 'por ano'}
            </h2>
            <BarChart data={data?.by_period} />
          </div>

          {/* Gráfico por motivo */}
          <div className="card">
            <h2 className="font-bold text-white mb-4">Principais motivos de remoção</h2>
            <ReasonChart data={data?.by_reason} />
          </div>
        </>
      )}
    </div>
  );
}
