import React, { useEffect, useState } from 'react';
import { Button, Spin } from 'antd';
import Login from './Login';
import AppShell from './app/AppShell';
import { request, setCsrf } from './services/api';
import { clearDrafts } from './services/drafts';
export default function App() {
  const [state, setState] = useState(null);
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    localStorage.removeItem('akv_web_token_v1');
    (async () => {
      try {
        const init = await request('/auth/state');
        try {
          const session = await request('/auth/session');
          if (current) {
            setCsrf(session.csrf);
            setLogged(true);
          }
        } catch (e) {
          if (e.status !== 401) throw e;
        }
        if (current) {
          setState(init);
          setError('');
        }
      } catch (e) {
        if (current) setError(e.message);
      }
    })();
    return () => {
      current = false;
    };
  }, [retry]);
  const lock = (preserveDrafts = false) => {
    setCsrf('');
    if (!preserveDrafts) clearDrafts();
    setLogged(false);
  };
  useEffect(() => {
    const expired = () => lock(true);
    window.addEventListener('vault:expired', expired);
    return () => window.removeEventListener('vault:expired', expired);
  }, []);
  if (error)
    return (
      <div className="boot-state" role="alert">
        <h2>暂时无法连接 Vault</h2>
        <p>{error}</p>
        <Button
          onClick={() => {
            setError('');
            setRetry((n) => n + 1);
          }}
        >
          重新连接
        </Button>
      </div>
    );
  if (!state)
    return (
      <div className="boot-state">
        <Spin />
        <p>正在加载</p>
      </div>
    );
  return logged ? (
    <AppShell onLock={lock} />
  ) : (
    <Login
      initialized={state.initialized}
      onAuthSuccess={() => {
        setState({ initialized: true });
        setLogged(true);
      }}
    />
  );
}
