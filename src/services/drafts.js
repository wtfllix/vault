const prefix = 'vault-draft:';
const encode = (bytes) => {
  const view = new Uint8Array(bytes);
  let raw = '';
  for (let i = 0; i < view.length; i += 32768)
    raw += String.fromCharCode(...view.subarray(i, i + 32768));
  return btoa(raw);
};
const decode = (text) => Uint8Array.from(atob(text), (x) => x.charCodeAt(0));
const draftKey = async () => {
  let raw = sessionStorage.getItem('vault-draft-key');
  if (!raw) {
    raw = encode(crypto.getRandomValues(new Uint8Array(32)));
    sessionStorage.setItem('vault-draft-key', raw);
  }
  return crypto.subtle.importKey('raw', decode(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
};
export const saveDraft = async (id, value) => {
  const key = await draftKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(value))
  );
  // Session-only encrypted recovery; no plaintext is persisted to localStorage.
  sessionStorage.setItem(prefix + id, JSON.stringify({ iv: encode(iv), ct: encode(ciphertext) }));
};
export const loadDraft = async (id) => {
  try {
    const raw = sessionStorage.getItem(prefix + id);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const key = await draftKey();
    return JSON.parse(
      new TextDecoder().decode(
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(p.iv) }, key, decode(p.ct))
      )
    );
  } catch {
    return null;
  }
};
export const removeDraft = (id) => sessionStorage.removeItem(prefix + id);
export const clearDrafts = () => {
  Object.keys(sessionStorage)
    .filter((k) => k.startsWith(prefix) || k === 'vault-draft-key')
    .forEach((k) => sessionStorage.removeItem(k));
};
