import axios from 'axios';
import { API_BASE_URL } from './cordovaApi';

const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || localStorage.getItem('super_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes('/super/')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// API com token tenant
const tenantApi = axios.create({ baseURL: API_BASE_URL });
tenantApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// API com token super admin
const superApi = axios.create({ baseURL: API_BASE_URL });
superApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('super_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
superApi.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('super_token');
      window.location.href = '/super/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  register: (data) => tenantApi.post('/auth/register', data),
  login: (data) => tenantApi.post('/auth/login', data),
  me: () => tenantApi.get('/auth/me'),
  getUsers: () => tenantApi.get('/auth/users'),
  createUser: (data) => tenantApi.post('/auth/users', data),
  deleteUser: (id) => tenantApi.delete(`/auth/users/${id}`),
};

export const sessionsApi = {
  list: () => tenantApi.get('/sessions'),
  create: (data) => tenantApi.post('/sessions', data),
  getStatus: (id) => tenantApi.get(`/sessions/${id}/status`),
  connect: (id) => tenantApi.post(`/sessions/${id}/connect`),
  disconnect: (id) => tenantApi.post(`/sessions/${id}/disconnect`),
  remove: (id) => tenantApi.delete(`/sessions/${id}`),
  getGroups: (id) => tenantApi.get(`/sessions/${id}/groups`),
  qrStreamUrl: (id) => {
    const token = localStorage.getItem('token');
    return `${API_BASE_URL}/sessions/${id}/qr-stream?token=${token}`;
  },
};

export const groupsApi = {
  // Grupos gerenciados
  getManagedGroups: (sessionId) => tenantApi.get(`/groups/managed/${sessionId}`),
  addToManaged: (sessionId, groupId, data) => tenantApi.post(`/groups/managed/${sessionId}/${encodeURIComponent(groupId)}`, data),
  removeFromManaged: (sessionId, groupId) => tenantApi.delete(`/groups/managed/${sessionId}/${encodeURIComponent(groupId)}`),
  // Configurações individuais
  getSettings: (sessionId, groupId) => tenantApi.get(`/groups/${sessionId}/${encodeURIComponent(groupId)}`),
  updateSettings: (sessionId, groupId, data) => tenantApi.put(`/groups/${sessionId}/${encodeURIComponent(groupId)}`, data),
  removeMember: (sessionId, groupId, phone) => tenantApi.post(`/groups/${sessionId}/${encodeURIComponent(groupId)}/remove/${phone}`),
  banMember: (sessionId, groupId, phone, reason) => tenantApi.post(`/groups/${sessionId}/${encodeURIComponent(groupId)}/ban/${phone}`, { reason }),
  getMembers: (sessionId, groupId) => tenantApi.get(`/groups/${sessionId}/${encodeURIComponent(groupId)}/members`),
  bulkUpdate: (data) => tenantApi.post('/groups/bulk-update', data),
  getBans: () => tenantApi.get('/groups/bans'),
  deleteBan: (id) => tenantApi.delete(`/groups/bans/${id}`),
  getWarnings: (sessionId, groupId) => tenantApi.get(`/groups/${sessionId}/${encodeURIComponent(groupId)}/warnings`),
  clearWarning: (sessionId, groupId, phone) => tenantApi.delete(`/groups/${sessionId}/${encodeURIComponent(groupId)}/warnings/${encodeURIComponent(phone)}`),
  clearAllWarnings: (sessionId, groupId) => tenantApi.delete(`/groups/${sessionId}/${encodeURIComponent(groupId)}/warnings`),
  closeGroup: (sessionId, groupId, reason, duration_minutes) => tenantApi.post(`/groups/${sessionId}/${encodeURIComponent(groupId)}/close`, { reason, duration_minutes }),
  openGroup: (sessionId, groupId) => tenantApi.post(`/groups/${sessionId}/${encodeURIComponent(groupId)}/open`),
  getAllManaged: () => tenantApi.get('/groups/all-managed'),
  getAnalytics: (params) => tenantApi.get('/groups/analytics', { params }),
};

export const settingsApi = {
  getProfanity: () => tenantApi.get('/settings/profanity'),
  addProfanity: (word) => tenantApi.post('/settings/profanity', { word }),
  addProfanityBulk: (words) => tenantApi.post('/settings/profanity/bulk', { words }),
  deleteProfanity: (id) => tenantApi.delete(`/settings/profanity/${id}`),
  clearProfanity: () => tenantApi.delete('/settings/profanity'),
  getCommands: () => tenantApi.get('/settings/commands'),
  createCommand: (data) => tenantApi.post('/settings/commands', data),
  updateCommand: (id, data) => tenantApi.put(`/settings/commands/${id}`, data),
  deleteCommand: (id) => tenantApi.delete(`/settings/commands/${id}`),
};

export const aiApi = {
  getConfig: () => tenantApi.get('/ai/config'),
  saveConfig: (data) => tenantApi.put('/ai/config', data),
  test: (message) => tenantApi.post('/ai/test', { message }),
  systemStatus: () => tenantApi.get('/ai/system-status'),
};

export const paymentsApi = {
  getInfo: () => axios.get(`${API_BASE_URL}/payments/info`),
  myRequests: () => tenantApi.get('/payments/my'),
  currentPlan: () => tenantApi.get('/payments/current-plan'),
  createCheckoutSession: (plan_slug) => tenantApi.post('/payments/create-checkout-session', { plan_slug }),
  createPortalSession: () => tenantApi.post('/payments/create-portal-session'),
  verifyPayment: (session_id) => tenantApi.post('/payments/verify-payment', { session_id }),
};

export const superAdminApi = {
  login: (data) => axios.post(`${API_BASE_URL}/super/login`, data),
  stats: () => superApi.get('/super/stats'),
  getTenants: () => superApi.get('/super/tenants'),
  updateTenantPlan: (id, data) => superApi.put(`/super/tenants/${id}/plan`, data),
  deleteTenant: (id) => superApi.delete(`/super/tenants/${id}`),
  getPlans: () => superApi.get('/super/plans'),
  updatePlan: (slug, data) => superApi.put(`/super/plans/${slug}`, data),
  getPayments: (status) => superApi.get('/super/payments', { params: { status } }),
  approvePayment: (id) => superApi.post(`/super/payments/${id}/approve`),
  rejectPayment: (id, notes) => superApi.post(`/super/payments/${id}/reject`, { notes }),
  getAllUsers: () => superApi.get('/super/users'),
  deleteUser: (id) => superApi.delete(`/super/users/${id}`),
  getSystemAiConfig: () => superApi.get('/super/ai-config'),
  updateSystemAiConfig: (data) => superApi.put('/super/ai-config', data),
  getEarnings: () => superApi.get('/super/earnings'),
};

export default api;
