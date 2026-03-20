import React, { useEffect, useState } from 'react';
import { Spin, message } from 'antd';
import Login from './Login';
import Home from './Home';
import { api, clearToken, getToken } from './api';

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const state = await api.getAuthState();
        setInitialized(state.initialized);
        setIsLoggedIn(Boolean(getToken()));
      } catch (error) {
        message.error(`初始化失败: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, []);

  const handleAuthSuccess = () => {
    setInitialized(true);
    setIsLoggedIn(true);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // 无论接口是否可用都强制退出本地会话
    } finally {
      clearToken();
      setIsLoggedIn(false);
      message.success('已退出');
    }
  };

  const handleAuthExpired = () => {
    clearToken();
    setIsLoggedIn(false);
    message.warning('登录状态已失效，请重新登录');
  };

  if (loading) {
    return (
      <div className="app-shell loading-shell">
        <Spin />
      </div>
    );
  }

  return isLoggedIn ? (
    <Home onLogout={handleLogout} onAuthExpired={handleAuthExpired} />
  ) : (
    <Login initialized={initialized} onAuthSuccess={handleAuthSuccess} />
  );
};

export default App;
