let csrf = '';
let reauthPromise = null;
export const setCsrf = (value) => {
  csrf = value || '';
};
export const getCsrf = () => csrf;
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export const reauthenticate = () => {
  if (!reauthPromise)
    reauthPromise = new Promise((resolve, reject) => {
      window.dispatchEvent(new CustomEvent('vault:reauth', { detail: { resolve, reject } }));
    }).finally(() => {
      reauthPromise = null;
    });
  return reauthPromise;
};
export const request = async (path, { body, method = 'GET', signal, retry = true } = {}) => {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    signal,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(!['GET', 'HEAD'].includes(method) ? { 'X-CSRF-Token': csrf } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => null);
  if (response.status === 428 && retry) {
    await reauthenticate();
    return request(path, { body, method, signal, retry: false });
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('vault:expired'));
    throw new ApiError(data?.message || `请求失败 (${response.status})`, response.status);
  }
  return data;
};
export const list = (module, params = {}, signal) =>
  request(
    `/${module}?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))}`,
    { signal }
  );
export const mutate = (path, body = {}, method = 'POST') => request(path, { method, body });
export const downloadUrl = (id) => `/api/files/${encodeURIComponent(id)}/download`;
export const upload = (file, parentId, onProgress, sha256) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const query = new URLSearchParams();
    if (parentId) query.set('parent_id', parentId);
    if (sha256) query.set('sha256', sha256);
    xhr.open('POST', `/api/files/upload?${query}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRF-Token', csrf);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        if (xhr.status === 401) window.dispatchEvent(new Event('vault:expired'));
        reject(new ApiError(data.message || '上传失败，请重试', xhr.status));
      }
    };
    xhr.onerror = () => reject(new Error('网络中断，上传未完成'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
