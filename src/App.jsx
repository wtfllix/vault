import React, { useCallback, useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Login from './Login';
import Home from './Home';

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [session, setSession] = useState(null);
  const closingRef = useRef(false);
  const syncingRef = useRef(false);

  const handleLogin = (nextSession) => {
    setSession(nextSession);
    setIsLoggedIn(true);
  };

  const syncAndRelease = useCallback(async (silent = false) => {
    if (!session) {
      return true;
    }
    try {
      await invoke('sync_to_syncthing', {
        sourcePath: session.dbPath,
        targetPath: session.syncPath
      });
      if (!silent) {
        message.success('已同步到 Syncthing 目标路径');
      }
      return true;
    } catch (error) {
      message.error(`同步失败: ${error}`);
      return false;
    }
  }, [session]);

  const handleLogout = async () => {
    if (syncingRef.current) {
      return;
    }
    syncingRef.current = true;
    await syncAndRelease();
    syncingRef.current = false;
    setIsLoggedIn(false);
    setSession(null);
  };

  useEffect(() => {
    if (!isLoggedIn || !session || typeof window === 'undefined' || !window.__TAURI_INTERNALS__) {
      return undefined;
    }

    closingRef.current = false;
    let unlisten = null;

    const setupCloseGuard = async () => {
      const appWindow = getCurrentWindow();
      unlisten = await appWindow.onCloseRequested(async (event) => {
        if (closingRef.current) {
          return;
        }
        event.preventDefault();
        if (syncingRef.current) {
          return;
        }
        syncingRef.current = true;
        await syncAndRelease(true);
        syncingRef.current = false;
        closingRef.current = true;
        await appWindow.close();
      });
    };

    setupCloseGuard().catch(() => {});
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [isLoggedIn, session, syncAndRelease]);

  return isLoggedIn ? (
    <Home dbPath={session?.dbPath || ''} onLogout={handleLogout} />
  ) : (
    <Login onLogin={handleLogin} />
  );
};

export default App;
