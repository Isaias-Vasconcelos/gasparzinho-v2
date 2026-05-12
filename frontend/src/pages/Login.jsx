import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/app/sessions');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Credenciais inválidas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1a13] p-4">
      <div className="bg-[#132018] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-wa-green/15 border border-wa-green/30 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg shadow-wa-green/10">
            <span className="text-3xl">👻</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Gasparzinho</h1>
          <p className="text-gray-400 text-sm mt-1">Entre na sua conta</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">E-mail</label>
            <input
              className="input"
              type="email"
              name="email"
              placeholder="seu@email.com"
              value={form.email}
              onChange={handle}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Senha</label>
            <input
              className="input"
              type="password"
              name="password"
              placeholder="Sua senha"
              value={form.password}
              onChange={handle}
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-5">
          Novo por aqui?{' '}
          <Link to="/register" className="text-wa-green font-semibold hover:text-green-300 hover:underline">Criar conta grátis</Link>
        </p>
        <p className="text-center mt-2">
          <Link to="/" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">← Voltar ao início</Link>
        </p>
      </div>
    </div>
  );
}
