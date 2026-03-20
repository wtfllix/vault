const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8787';
const TOKEN_KEY = 'akv_web_token_v1';

export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const request = async (path, options = {}) => {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.message || `请求失败: ${response.status}`);
  }

  return payload;
};

export const api = {
  getAuthState: () => request('/api/auth/state'),
  bootstrap: (password) => request('/api/auth/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ password })
  }),
  login: (password) => request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password })
  }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  getSecrets: (params = {}) => {
    const search = new URLSearchParams();
    if (params.query) {
      search.set('query', params.query);
    }
    if (params.type) {
      search.set('type', params.type);
    }
    const suffix = search.toString() ? `?${search}` : '';
    return request(`/api/secrets${suffix}`);
  },
  addSecret: (secret) => request('/api/secrets', {
    method: 'POST',
    body: JSON.stringify(secret)
  }),
  getSecretDetail: (id) => request(`/api/secrets/${id}`),
  deleteSecret: (id) => request(`/api/secrets/${id}`, { method: 'DELETE' })
};
