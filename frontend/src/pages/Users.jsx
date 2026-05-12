import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', role: 'operator', email: '' });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const { data } = await authApi.getUsers();
    setUsers(data);
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await authApi.createUser(form);
      setForm({ username: '', password: '', role: 'operator', email: '' });
      toast.success('Usuário criado');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar usuário');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id, username) => {
    if (!confirm(`Remover o usuário "${username}"?`)) return;
    try {
      await authApi.deleteUser(id);
      toast.success('Usuário removido');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Gerenciar Usuários</h1>

      <div className="card space-y-3">
        <h2 className="font-semibold">Novo Usuário</h2>
        <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Usuário</label>
            <input
              className="input"
              placeholder="Nome de usuário"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Senha</label>
            <input
              className="input"
              type="password"
              placeholder="Senha inicial"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">E-mail (opcional)</label>
            <input
              className="input"
              type="email"
              placeholder="email@exemplo.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Função</label>
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="operator">Operador</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary w-full" disabled={creating}>
              {creating ? 'Criando...' : 'Criar Usuário'}
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Usuários ({users.length})</h2>
        {users.map((u) => (
          <div key={u.id} className="card flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{u.username}</p>
              {u.email && <p className="text-xs text-gray-400">{u.email}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className={u.role === 'admin' ? 'badge-green' : 'badge-gray'}>
                {u.role === 'admin' ? 'Admin' : 'Operador'}
              </span>
              {u.id !== me?.id && (
                <button
                  onClick={() => remove(u.id, u.username)}
                  className="btn-danger text-xs px-2 py-1"
                >
                  Remover
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
