const resolveApiBase = () => {
  const envBase = (import.meta.env.VITE_API_BASE || '').trim();
  if (!envBase) {
    return '';
  }

  try {
    const parsed = new URL(envBase);
    const host = parsed.hostname.toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const pageHost = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
    const pageIsLocal = pageHost === 'localhost' || pageHost === '127.0.0.1';

    if (isLocalHost && !pageIsLocal) {
      return '';
    }
  } catch {
    // 非法 URL 时直接回退同域
    return '';
  }

  return envBase;
};

const API_BASE = resolveApiBase();
const TOKEN_KEY = 'akv_web_token_v1';

export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const request = async (path, options = {}) => {
  const token = getToken();
  const hasBody = options.body !== undefined && options.body !== null;
  const headers = {
    ...(options.headers || {})
  };

  if (hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

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
  getSession: () => request('/api/auth/session'),
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
  updateSecret: (id, secret) => request(`/api/secrets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(secret)
  }),
  getSecretDetail: (id) => request(`/api/secrets/${id}`),
  deleteSecret: (id) => request(`/api/secrets/${id}`, { method: 'DELETE' })
};
