import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import Groups from './pages/Groups';
import Settings from './pages/Settings';
import Checkout from './pages/Checkout';
import SuperLogin from './pages/SuperLogin';
import SuperAdmin from './pages/SuperAdmin';
import AIConfig from './pages/AIConfig';
import Analytics from './pages/Analytics';
import Layout from './components/Layout';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-wa-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function SuperProtectedRoute({ children }) {
  const token = localStorage.getItem('super_token');
  if (!token) return <Navigate to="/super/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Público */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/checkout" element={<Checkout />} />

          {/* Super Admin */}
          <Route path="/super/login" element={<SuperLogin />} />
          <Route path="/super" element={<SuperProtectedRoute><SuperAdmin /></SuperProtectedRoute>} />

          {/* App (tenant) */}
          <Route
            path="/app"
            element={<ProtectedRoute><Layout /></ProtectedRoute>}
          >
            <Route index element={<Navigate to="/app/sessions" replace />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="sessions/:sessionId/groups" element={<Groups />} />
            <Route path="settings" element={<Settings />} />
            <Route path="ai" element={<AIConfig />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="analytics" element={<Analytics />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
