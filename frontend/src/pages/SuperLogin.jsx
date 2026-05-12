import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { superAdminApi } from '../services/api';

export default function SuperLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await superAdminApi.login(form);
      localStorage.setItem('super_token', data.token);
      navigate('/super');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Credenciais inválidas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-wa-dark p-4">
      <div className="bg-wa-panel rounded-2xl shadow-2xl w-full max-w-sm p-8 border border-wa-divider">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-wa-teal rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🔐</span>
          </div>
          <h1 className="text-xl font-bold text-white">Painel Super Admin</h1>
          <p className="text-gray-400 text-sm mt-1">Acesso restrito</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Usuário</label>
            <input
              className="input bg-wa-dark border-wa-divider text-white placeholder-gray-500 focus:border-wa-green"
              name="username"
              placeholder="superadmin"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Senha</label>
            <input
              className="input bg-wa-dark border-wa-divider text-white placeholder-gray-500 focus:border-wa-green"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar no painel'}
          </button>
        </form>
      </div>
    </div>
  );
}
