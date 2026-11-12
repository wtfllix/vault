import { useEffect, useRef, useState, useCallback } from 'react';
import { list, request } from '../services/api';
export const useResource = (module, params = {}) => {
  const key = JSON.stringify(params);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    setError('');
    list(module, JSON.parse(key), controller.signal)
      .then((data) => {
        if (current) setResult(data);
      })
      .catch((e) => {
        if (current && e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [module, key, revision]);
  return { ...result, error, loading, reload: useCallback(() => setRevision((n) => n + 1), []) };
};
export const useDetail = (module, id) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    setData(null);
    setError('');
    setLoading(Boolean(id));
    if (id)
      request(`/${module}/${id}`, { signal: controller.signal })
        .then((value) => {
          if (current === generation.current) setData(value);
        })
        .catch((e) => {
          if (current === generation.current && e.name !== 'AbortError') setError(e.message);
        })
        .finally(() => {
          if (current === generation.current) setLoading(false);
        });
    return () => {
      generation.current++;
      controller.abort();
    };
  }, [module, id, revision]);
  return {
    data: data && String(data.id) === String(id) ? data : null,
    error,
    loading,
    reload: () => setRevision((n) => n + 1)
  };
};
